-- ==============================================================================
-- MIGRATION 012 (CORRECTED v5): COMPLETE PRODUCTION SECURITY, INVENTORY & SESSION RECONCILIATION
-- STRICT MODE · ZERO-REGRESSION · ZERO DATA LOSS · EVIDENCE-BASED AUDIT
-- 
-- STATUS: PROPOSED MIGRATION CANDIDATE — PENDING HUMAN APPROVAL
-- DO NOT EXECUTE AGAINST PRODUCTION WITHOUT EXPLICIT WRITTEN AUTHORIZATION
-- Target Database: PostgreSQL 14+ / Supabase 17+ (Project: brskubbgvxtzvhncjnle)
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 0. PREFLIGHT SAFETY CHECKS
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    v_missing TEXT;
BEGIN
    -- Verify presence of required public tables
    SELECT string_agg(t.tbl, ', ') INTO v_missing
    FROM (
        VALUES 
            ('admin_security'), ('admin_sessions'), ('audit_logs'),
            ('products'), ('ingredients'), ('recipes'), ('recipe_items'),
            ('production_runs'), ('production_consumption'), ('stock_movements'),
            ('sales'), ('daily_closings'), ('daily_cost_allocations'),
            ('daily_wages'), ('packaging_items'), ('packet_types'),
            ('packing_records'), ('product_selling_prices'), ('recipe_packets')
    ) AS t(tbl)
    WHERE NOT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = t.tbl
    );

    IF v_missing IS NOT NULL THEN
        RAISE EXCEPTION 'PREFLIGHT CHECK FAILED: Required tables missing in public schema: %', v_missing;
    END IF;

    -- Ensure pgcrypto extension is installed
    IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pgcrypto') THEN
        RAISE EXCEPTION 'PREFLIGHT CHECK FAILED: Required extension "pgcrypto" is not installed';
    END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 1. SCHEMA HARDENING & SESSION LEDGER TABLES
-- ------------------------------------------------------------------------------

-- 1.1 Enforce singleton invariant on admin_security
-- Deduplicate first defensively if multiple records exist (retaining latest updated)
DELETE FROM public.admin_security 
WHERE id NOT IN (
    SELECT id FROM public.admin_security 
    ORDER BY updated_at DESC, created_at DESC 
    LIMIT 1
);

ALTER TABLE public.admin_security 
    ADD COLUMN IF NOT EXISTS is_singleton BOOLEAN NOT NULL DEFAULT true;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'admin_security_singleton_key') THEN
        ALTER TABLE public.admin_security ADD CONSTRAINT admin_security_singleton_key UNIQUE (is_singleton);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'admin_security_singleton_check') THEN
        ALTER TABLE public.admin_security ADD CONSTRAINT admin_security_singleton_check CHECK (is_singleton = true);
    END IF;
END $$;

-- 1.2 Add rate-limiting & lockout columns for Kitchen PIN
ALTER TABLE public.admin_security 
    ADD COLUMN IF NOT EXISTS kitchen_failed_attempts INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS kitchen_locked_until TIMESTAMPTZ DEFAULT NULL;

-- 1.3 Add session revocation tracking to admin_sessions
ALTER TABLE public.admin_sessions 
    ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ DEFAULT NULL;

-- 1.4 Create dedicated kitchen_sessions table with revocation tracking
-- (Uses built-in gen_random_uuid() for maximum portability on Postgres 14+/Supabase 17+)
CREATE TABLE IF NOT EXISTS public.kitchen_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_token TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked_at TIMESTAMPTZ DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS idx_kitchen_sessions_token ON public.kitchen_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_kitchen_sessions_active ON public.kitchen_sessions(expires_at) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_admin_sessions_active ON public.admin_sessions(expires_at) WHERE revoked_at IS NULL;

-- 1.5 Fix Products Negative Stock Check Constraint
-- The legacy CHECK (current_stock >= 0) contradicts the zero-clamping / non-clamping
-- negative stock preservation business rule, causing runtime crashes when reversing
-- batches whose product stock was already sold. Drop legacy check safely.
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_current_stock_check;

-- Ensure RLS is active on all session and security tables
ALTER TABLE public.kitchen_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_security ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------------------
-- 2. DROP OBSOLETE & UNSECURED FUNCTION OVERLOADS
-- ------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.delete_sale_atomic(bigint, text);
DROP FUNCTION IF EXISTS public.delete_sale_atomic(uuid);
DROP FUNCTION IF EXISTS public.delete_sale_atomic(uuid, text);
DROP FUNCTION IF EXISTS public.cancel_production_run_atomic(uuid, text, text);
DROP FUNCTION IF EXISTS public.cancel_production_run_atomic(uuid, text, text, text);
DROP FUNCTION IF EXISTS public.setup_initial_admin_pin(text, text);
DROP FUNCTION IF EXISTS public.setup_initial_admin_pin(text, text, text);
DROP FUNCTION IF EXISTS public.reconcile_physical_inventory_count(uuid, numeric, text, text, text);
DROP FUNCTION IF EXISTS public.is_kitchen_pin_configured();
DROP FUNCTION IF EXISTS public.reconcile_daily_closing_oil_movement(date, uuid, numeric, numeric, numeric, numeric, numeric, numeric, text);
DROP FUNCTION IF EXISTS public.reconcile_daily_closing_oil_movement(date, uuid, numeric, numeric, numeric, numeric, numeric, numeric, text, text);

-- ------------------------------------------------------------------------------
-- 3. SESSION VALIDATION & CRYPTOGRAPHIC REVOCATION ROUTINES
-- ------------------------------------------------------------------------------

-- Admin Session Validator (Direct token parameter)
CREATE OR REPLACE FUNCTION public.is_admin_session_valid(p_token text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_valid BOOLEAN;
BEGIN
    IF p_token IS NULL OR trim(p_token) = '' THEN
        RETURN false;
    END IF;

    SELECT (expires_at > NOW() AND revoked_at IS NULL) INTO v_valid
    FROM public.admin_sessions
    WHERE session_token = p_token;

    RETURN COALESCE(v_valid, false);
END;
$$;

-- Admin Session Validator (Request header x-admin-session-token)
CREATE OR REPLACE FUNCTION public.current_admin_session_is_valid()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_headers JSON;
    v_token TEXT;
    v_valid BOOLEAN;
BEGIN
    BEGIN
        v_headers := current_setting('request.headers', true)::json;
        v_token := v_headers->>'x-admin-session-token';
    EXCEPTION WHEN OTHERS THEN
        RETURN false;
    END;

    IF v_token IS NULL OR trim(v_token) = '' THEN
        RETURN false;
    END IF;

    SELECT (expires_at > NOW() AND revoked_at IS NULL) INTO v_valid
    FROM public.admin_sessions
    WHERE session_token = v_token;

    RETURN COALESCE(v_valid, false);
END;
$$;

-- Kitchen Session Validator (Direct token parameter)
-- NOTE: An active Admin session token automatically fulfills kitchen privilege requirements.
CREATE OR REPLACE FUNCTION public.is_kitchen_session_valid(p_token text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_valid BOOLEAN;
BEGIN
    IF p_token IS NULL OR trim(p_token) = '' THEN
        RETURN false;
    END IF;

    -- Check if token belongs to an active Admin session (Admin has superset of kitchen privileges)
    IF public.is_admin_session_valid(p_token) THEN
        RETURN true;
    END IF;

    SELECT (expires_at > NOW() AND revoked_at IS NULL) INTO v_valid
    FROM public.kitchen_sessions
    WHERE session_token = p_token;

    RETURN COALESCE(v_valid, false);
END;
$$;

-- Kitchen Session Validator (Request header x-kitchen-session-token OR x-admin-session-token)
CREATE OR REPLACE FUNCTION public.current_kitchen_session_is_valid()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_headers JSON;
    v_kitchen_token TEXT;
    v_admin_token TEXT;
    v_valid BOOLEAN;
BEGIN
    BEGIN
        v_headers := current_setting('request.headers', true)::json;
        v_kitchen_token := v_headers->>'x-kitchen-session-token';
        v_admin_token := v_headers->>'x-admin-session-token';
    EXCEPTION WHEN OTHERS THEN
        RETURN false;
    END;

    -- An active Admin session automatically fulfills kitchen requirements
    IF v_admin_token IS NOT NULL AND trim(v_admin_token) <> '' THEN
        IF public.is_admin_session_valid(v_admin_token) THEN
            RETURN true;
        END IF;
    END IF;

    IF v_kitchen_token IS NULL OR trim(v_kitchen_token) = '' THEN
        RETURN false;
    END IF;

    SELECT (expires_at > NOW() AND revoked_at IS NULL) INTO v_valid
    FROM public.kitchen_sessions
    WHERE session_token = v_kitchen_token;

    RETURN COALESCE(v_valid, false);
END;
$$;

-- Kitchen PIN Configuration Check (Publicly queryable status without exposing hashes)
CREATE OR REPLACE FUNCTION public.is_kitchen_pin_configured()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.admin_security 
        WHERE kitchen_pin_hash IS NOT NULL AND trim(kitchen_pin_hash) <> ''
    );
END;
$$;

-- Secure Admin Session Revocation (Requires valid caller authorization; logs attempts safely)
CREATE OR REPLACE FUNCTION public.revoke_admin_session(p_token text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_headers JSON;
    v_header_admin_token TEXT;
    v_target_token TEXT;
    v_caller_authorized BOOLEAN := false;
    v_count INT;
BEGIN
    BEGIN
        v_headers := current_setting('request.headers', true)::json;
        v_header_admin_token := v_headers->>'x-admin-session-token';
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;

    -- Verification 1: Caller is an active Admin via request header
    IF v_header_admin_token IS NOT NULL AND public.is_admin_session_valid(v_header_admin_token) THEN
        v_caller_authorized := true;
        v_target_token := COALESCE(p_token, v_header_admin_token);
    -- Verification 2: Self-revocation via parameter
    ELSIF p_token IS NOT NULL AND public.is_admin_session_valid(p_token) THEN
        v_caller_authorized := true;
        v_target_token := p_token;
    END IF;

    IF NOT v_caller_authorized OR v_target_token IS NULL THEN
        INSERT INTO public.audit_logs (actor, action, entity_type, details)
        VALUES ('Unknown', 'UNAUTHORIZED_ADMIN_REVOCATION_ATTEMPT', 'SECURITY',
                jsonb_build_object('attempted_token', substring(COALESCE(p_token, 'none') from 1 for 8) || '...', 'timestamp', NOW()));
        RETURN jsonb_build_object('success', false, 'message', 'Unauthorized: Valid Admin session required to revoke session');
    END IF;

    UPDATE public.admin_sessions
    SET revoked_at = NOW()
    WHERE session_token = v_target_token AND revoked_at IS NULL;

    GET DIAGNOSTICS v_count = ROW_COUNT;

    IF v_count > 0 THEN
        INSERT INTO public.audit_logs (actor, action, entity_type, details)
        VALUES ('Admin', 'ADMIN_SESSION_REVOKED', 'SECURITY',
                jsonb_build_object('token_prefix', substring(v_target_token from 1 for 8) || '...', 'timestamp', NOW()));
    END IF;

    RETURN jsonb_build_object('success', true, 'revoked', v_count > 0);
END;
$$;

-- Secure Kitchen Session Revocation (Requires caller ownership or Admin override; logs attempts safely)
CREATE OR REPLACE FUNCTION public.revoke_kitchen_session(p_token text, p_admin_token text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_headers JSON;
    v_header_kitchen_token TEXT;
    v_header_admin_token TEXT;
    v_caller_authorized BOOLEAN := false;
    v_count INT;
BEGIN
    IF p_token IS NULL OR trim(p_token) = '' THEN
        RETURN jsonb_build_object('success', false, 'message', 'Target kitchen token required for revocation');
    END IF;

    BEGIN
        v_headers := current_setting('request.headers', true)::json;
        v_header_kitchen_token := v_headers->>'x-kitchen-session-token';
        v_header_admin_token := v_headers->>'x-admin-session-token';
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;

    -- Verification 1: Admin override via header OR valid admin token param
    IF (v_header_admin_token IS NOT NULL AND public.is_admin_session_valid(v_header_admin_token)) OR
       (p_admin_token IS NOT NULL AND public.is_admin_session_valid(p_admin_token)) THEN
        v_caller_authorized := true;
    -- Verification 2: Caller is verified session owner (header token matches target token and is active)
    ELSIF (v_header_kitchen_token IS NOT NULL AND v_header_kitchen_token = p_token AND public.is_kitchen_session_valid(v_header_kitchen_token)) OR
          (public.is_kitchen_session_valid(p_token)) THEN
        v_caller_authorized := true;
    END IF;

    IF NOT v_caller_authorized THEN
        INSERT INTO public.audit_logs (actor, action, entity_type, details)
        VALUES ('Unknown', 'UNAUTHORIZED_KITCHEN_REVOCATION_ATTEMPT', 'SECURITY',
                jsonb_build_object('attempted_token', substring(p_token from 1 for 8) || '...', 'timestamp', NOW()));
        RETURN jsonb_build_object('success', false, 'message', 'Unauthorized: Session revocation requires caller authentication as session owner or Admin');
    END IF;

    UPDATE public.kitchen_sessions
    SET revoked_at = NOW()
    WHERE session_token = p_token AND revoked_at IS NULL;

    GET DIAGNOSTICS v_count = ROW_COUNT;

    IF v_count > 0 THEN
        INSERT INTO public.audit_logs (actor, action, entity_type, details)
        VALUES ('Kitchen Staff', 'KITCHEN_SESSION_REVOKED', 'SECURITY',
                jsonb_build_object('token_prefix', substring(p_token from 1 for 8) || '...', 'timestamp', NOW()));
    END IF;

    RETURN jsonb_build_object('success', true, 'revoked', v_count > 0);
END;
$$;

-- ------------------------------------------------------------------------------
-- 4. PIN VERIFICATION & HARDENED AUTHENTICATION ROUTINES
-- ------------------------------------------------------------------------------

-- Kitchen PIN Verification with Row Lock, Persistent Lockout, and Session Token Issuance
CREATE OR REPLACE FUNCTION public.verify_kitchen_pin(p_pin text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_rec RECORD;
    v_token TEXT;
    v_expires TIMESTAMPTZ;
    v_new_failed INT;
    v_lock_until TIMESTAMPTZ;
BEGIN
    -- 1. Row-level lock prevents concurrent race conditions bypassing 5-attempt limit
    SELECT * INTO v_rec FROM public.admin_security LIMIT 1 FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'valid', false, 'message', 'Security settings record not found');
    END IF;

    -- 2. Check existing lockout
    IF v_rec.kitchen_locked_until IS NOT NULL THEN
        IF NOW() < v_rec.kitchen_locked_until THEN
            RETURN jsonb_build_object(
                'success', false,
                'valid', false,
                'locked', true,
                'locked_until', v_rec.kitchen_locked_until,
                'remaining_attempts', 0,
                'message', 'Kitchen access locked due to consecutive failed attempts. Try again later.'
            );
        ELSE
            -- Lock duration has elapsed; reset failed counters
            UPDATE public.admin_security 
            SET kitchen_failed_attempts = 0, kitchen_locked_until = NULL 
            WHERE id = v_rec.id;
            v_rec.kitchen_failed_attempts := 0;
            v_rec.kitchen_locked_until := NULL;
        END IF;
    END IF;

    -- 3. Strict format validation
    IF p_pin IS NULL OR p_pin !~ '^\d{4}$' THEN
        RETURN jsonb_build_object('success', false, 'valid', false, 'message', 'PIN must be exactly 4 digits');
    END IF;

    -- 4. Zero default fallback: missing hash is a hard authentication failure
    IF v_rec.kitchen_pin_hash IS NULL OR trim(v_rec.kitchen_pin_hash) = '' THEN
        RETURN jsonb_build_object(
            'success', false,
            'valid', false,
            'needs_setup', true,
            'message', 'Kitchen PIN is not configured. Please contact Administrator.'
        );
    END IF;

    -- 5. Verify bcrypt hash
    IF v_rec.kitchen_pin_hash = crypt(p_pin, v_rec.kitchen_pin_hash) THEN
        -- SUCCESS: Reset failure counters
        UPDATE public.admin_security
        SET kitchen_failed_attempts = 0,
            kitchen_locked_until = NULL,
            updated_at = NOW()
        WHERE id = v_rec.id;

        -- Issue session token (12 hour lifetime)
        v_token := encode(gen_random_bytes(32), 'hex');
        v_expires := NOW() + INTERVAL '12 hours';

        INSERT INTO public.kitchen_sessions (session_token, expires_at)
        VALUES (v_token, v_expires);

        RETURN jsonb_build_object(
            'success', true,
            'valid', true,
            'session_token', v_token,
            'expires_at', v_expires
        );
    ELSE
        -- FAILURE: Increment counter and commit update without raising exception (avoids rollback)
        v_new_failed := COALESCE(v_rec.kitchen_failed_attempts, 0) + 1;
        
        IF v_new_failed >= 5 THEN
            v_lock_until := NOW() + INTERVAL '15 minutes';
            UPDATE public.admin_security
            SET kitchen_failed_attempts = v_new_failed,
                kitchen_locked_until = v_lock_until,
                updated_at = NOW()
            WHERE id = v_rec.id;

            INSERT INTO public.audit_logs (actor, action, entity_type, entity_id, details)
            VALUES ('Kitchen Staff', 'KITCHEN_PIN_LOCKOUT', 'SECURITY', 'KITCHEN',
                    jsonb_build_object('failed_attempts', v_new_failed, 'locked_until', v_lock_until));

            RETURN jsonb_build_object(
                'success', false,
                'valid', false,
                'locked', true,
                'locked_until', v_lock_until,
                'remaining_attempts', 0,
                'message', 'Too many failed attempts. Kitchen access locked for 15 minutes.'
            );
        ELSE
            UPDATE public.admin_security
            SET kitchen_failed_attempts = v_new_failed,
                updated_at = NOW()
            WHERE id = v_rec.id;

            RETURN jsonb_build_object(
                'success', false,
                'valid', false,
                'locked', false,
                'remaining_attempts', (5 - v_new_failed),
                'message', 'Incorrect PIN. ' || (5 - v_new_failed)::text || ' attempt(s) remaining before lockout.'
            );
        END IF;
    END IF;
END;
$$;

-- Admin PIN Verification with Row Lock, Persistent Lockout, and Session Token Issuance
CREATE OR REPLACE FUNCTION public.verify_admin_pin(p_pin text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_rec RECORD;
    v_token TEXT;
    v_expires TIMESTAMPTZ;
    v_new_failed INT;
    v_lock_until TIMESTAMPTZ;
BEGIN
    SELECT * INTO v_rec FROM public.admin_security LIMIT 1 FOR UPDATE;
    IF NOT FOUND OR NOT v_rec.is_initialized THEN
        RETURN jsonb_build_object(
            'success', false,
            'valid', false,
            'needs_setup', true,
            'message', 'Admin PIN not yet set up'
        );
    END IF;

    -- Check lockout
    IF v_rec.locked_until IS NOT NULL THEN
        IF NOW() < v_rec.locked_until THEN
            RETURN jsonb_build_object(
                'success', false,
                'valid', false,
                'locked', true,
                'locked_until', v_rec.locked_until,
                'remaining_attempts', 0,
                'message', 'Admin access locked due to consecutive failed attempts. Try again later.'
            );
        ELSE
            UPDATE public.admin_security 
            SET failed_attempts = 0, locked_until = NULL 
            WHERE id = v_rec.id;
            v_rec.failed_attempts := 0;
            v_rec.locked_until := NULL;
        END IF;
    END IF;

    IF p_pin IS NULL OR p_pin !~ '^\d{4,8}$' THEN
        RETURN jsonb_build_object('success', false, 'valid', false, 'message', 'PIN must be between 4 and 8 digits');
    END IF;

    IF v_rec.pin_hash = crypt(p_pin, v_rec.pin_hash) THEN
        UPDATE public.admin_security
        SET failed_attempts = 0, locked_until = NULL, updated_at = NOW()
        WHERE id = v_rec.id;

        v_token := encode(gen_random_bytes(32), 'hex');
        v_expires := NOW() + INTERVAL '24 hours';

        INSERT INTO public.admin_sessions (session_token, expires_at)
        VALUES (v_token, v_expires);

        INSERT INTO public.audit_logs (actor, action, entity_type, details)
        VALUES ('Shop Owner', 'ADMIN_LOGIN_SUCCESS', 'SECURITY', jsonb_build_object('timestamp', NOW()));

        RETURN jsonb_build_object(
            'success', true,
            'valid', true,
            'session_token', v_token,
            'expires_at', v_expires
        );
    ELSE
        v_new_failed := COALESCE(v_rec.failed_attempts, 0) + 1;

        IF v_new_failed >= 5 THEN
            v_lock_until := NOW() + INTERVAL '15 minutes';
            UPDATE public.admin_security
            SET failed_attempts = v_new_failed,
                locked_until = v_lock_until,
                updated_at = NOW()
            WHERE id = v_rec.id;

            INSERT INTO public.audit_logs (actor, action, entity_type, details)
            VALUES ('Unknown', 'ADMIN_LOGIN_LOCKED', 'SECURITY',
                    jsonb_build_object('failed_attempts', v_new_failed, 'locked_until', v_lock_until));

            RETURN jsonb_build_object(
                'success', false,
                'valid', false,
                'locked', true,
                'locked_until', v_lock_until,
                'remaining_attempts', 0,
                'message', 'Incorrect PIN. Account locked for 15 minutes due to 5 consecutive failed attempts.'
            );
        ELSE
            UPDATE public.admin_security
            SET failed_attempts = v_new_failed,
                updated_at = NOW()
            WHERE id = v_rec.id;

            INSERT INTO public.audit_logs (actor, action, entity_type, details)
            VALUES ('Unknown', 'ADMIN_LOGIN_FAILED', 'SECURITY',
                    jsonb_build_object('failed_attempts', v_new_failed));

            RETURN jsonb_build_object(
                'success', false,
                'valid', false,
                'locked', false,
                'remaining_attempts', (5 - v_new_failed),
                'message', 'Incorrect PIN. ' || (5 - v_new_failed)::text || ' attempt(s) remaining before lockout.'
            );
        END IF;
    END IF;
END;
$$;

-- Setup Initial Admin PIN & Optional Initial Kitchen PIN (Race-Safe, Single-Execution Guaranteed)
CREATE OR REPLACE FUNCTION public.setup_initial_admin_pin(
    p_pin TEXT,
    p_recovery_key TEXT,
    p_kitchen_pin TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_rec RECORD;
    v_token TEXT;
    v_expires TIMESTAMPTZ;
BEGIN
    -- Transactional advisory lock guarantees concurrency serialization during first-time setup
    PERFORM pg_advisory_xact_lock(hashtext('setup_initial_admin_pin_singleton'));

    IF p_pin !~ '^\d{4,8}$' THEN
        RAISE EXCEPTION 'PIN must be between 4 and 8 numeric digits';
    END IF;

    IF length(trim(p_recovery_key)) < 6 THEN
        RAISE EXCEPTION 'Recovery phrase must be at least 6 characters long';
    END IF;

    IF p_kitchen_pin IS NOT NULL AND trim(p_kitchen_pin) <> '' THEN
        IF p_kitchen_pin !~ '^\d{4}$' THEN
            RAISE EXCEPTION 'Kitchen PIN must be exactly 4 digits';
        END IF;
    END IF;

    SELECT * INTO v_rec FROM public.admin_security LIMIT 1 FOR UPDATE;
    IF FOUND AND v_rec.is_initialized THEN
        RAISE EXCEPTION 'Admin PIN has already been initialized. Use verify or recovery flow.';
    END IF;

    IF FOUND THEN
        UPDATE public.admin_security
        SET pin_hash = crypt(p_pin, gen_salt('bf', 10)),
            recovery_hash = crypt(p_recovery_key, gen_salt('bf', 10)),
            kitchen_pin_hash = CASE
                WHEN p_kitchen_pin IS NOT NULL AND trim(p_kitchen_pin) <> ''
                THEN crypt(p_kitchen_pin, gen_salt('bf', 10))
                ELSE kitchen_pin_hash
            END,
            failed_attempts = 0,
            locked_until = NULL,
            is_initialized = true,
            is_singleton = true,
            updated_at = NOW()
        WHERE id = v_rec.id;
    ELSE
        INSERT INTO public.admin_security (
            pin_hash,
            recovery_hash,
            kitchen_pin_hash,
            failed_attempts,
            is_initialized,
            is_singleton,
            updated_at
        ) VALUES (
            crypt(p_pin, gen_salt('bf', 10)),
            crypt(p_recovery_key, gen_salt('bf', 10)),
            CASE
                WHEN p_kitchen_pin IS NOT NULL AND trim(p_kitchen_pin) <> ''
                THEN crypt(p_kitchen_pin, gen_salt('bf', 10))
                ELSE NULL
            END,
            0,
            true,
            true,
            NOW()
        );
    END IF;

    v_token := encode(gen_random_bytes(32), 'hex');
    v_expires := NOW() + INTERVAL '24 hours';

    INSERT INTO public.admin_sessions (session_token, expires_at)
    VALUES (v_token, v_expires);

    INSERT INTO public.audit_logs (actor, action, entity_type, details)
    VALUES ('Shop Owner', 'SETUP_ADMIN_PIN', 'SECURITY', jsonb_build_object(
        'status', 'initialized',
        'kitchen_pin_initialized', (p_kitchen_pin IS NOT NULL AND trim(p_kitchen_pin) <> '')
    ));

    RETURN jsonb_build_object(
        'success', true,
        'session_token', v_token,
        'expires_at', v_expires,
        'kitchen_pin_initialized', (p_kitchen_pin IS NOT NULL AND trim(p_kitchen_pin) <> ''),
        'message', 'Admin PIN initialized successfully'
    );
END;
$$;

-- Secure Admin PIN Change with Lockout Protection and Complete Session Invalidation
CREATE OR REPLACE FUNCTION public.change_admin_pin(
    p_old_pin text,
    p_new_pin text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_rec RECORD;
    v_new_failed INT;
    v_lock_until TIMESTAMPTZ;
BEGIN
    SELECT * INTO v_rec FROM public.admin_security LIMIT 1 FOR UPDATE;
    IF NOT FOUND OR NOT v_rec.is_initialized THEN
        RAISE EXCEPTION 'Admin security is not initialized';
    END IF;

    -- Check if currently locked out
    IF v_rec.locked_until IS NOT NULL AND NOW() < v_rec.locked_until THEN
        RAISE EXCEPTION 'Admin account is locked out until %. Cannot change PIN.', v_rec.locked_until;
    END IF;

    IF p_new_pin !~ '^\d{4,8}$' THEN
        RAISE EXCEPTION 'New PIN must be between 4 and 8 digits';
    END IF;

    IF v_rec.pin_hash != crypt(p_old_pin, v_rec.pin_hash) THEN
        v_new_failed := COALESCE(v_rec.failed_attempts, 0) + 1;
        IF v_new_failed >= 5 THEN
            v_lock_until := NOW() + INTERVAL '15 minutes';
            UPDATE public.admin_security
            SET failed_attempts = v_new_failed, locked_until = v_lock_until, updated_at = NOW()
            WHERE id = v_rec.id;

            INSERT INTO public.audit_logs (actor, action, entity_type, details)
            VALUES ('Unknown', 'ADMIN_PIN_CHANGE_LOCKED', 'SECURITY',
                    jsonb_build_object('failed_attempts', v_new_failed, 'locked_until', v_lock_until));

            RAISE EXCEPTION 'Incorrect current PIN. Account locked for 15 minutes due to repeated failed attempts.';
        ELSE
            UPDATE public.admin_security
            SET failed_attempts = v_new_failed, updated_at = NOW()
            WHERE id = v_rec.id;

            INSERT INTO public.audit_logs (actor, action, entity_type, details)
            VALUES ('Unknown', 'ADMIN_PIN_CHANGE_FAILED', 'SECURITY',
                    jsonb_build_object('failed_attempts', v_new_failed));

            RAISE EXCEPTION 'Current PIN is incorrect. % attempt(s) remaining before lockout.', (5 - v_new_failed);
        END IF;
    END IF;

    -- SUCCESS: Update PIN and reset failed counters
    UPDATE public.admin_security
    SET pin_hash = crypt(p_new_pin, gen_salt('bf', 10)),
        failed_attempts = 0,
        locked_until = NULL,
        updated_at = NOW()
    WHERE id = v_rec.id;

    -- Revoke all active admin sessions immediately
    UPDATE public.admin_sessions
    SET revoked_at = NOW(),
        expires_at = LEAST(expires_at, NOW())
    WHERE revoked_at IS NULL;

    INSERT INTO public.audit_logs (actor, action, entity_type, details)
    VALUES ('Shop Owner', 'ADMIN_PIN_CHANGED', 'SECURITY', jsonb_build_object('timestamp', NOW()));

    RETURN jsonb_build_object(
        'success', true,
        'message', 'PIN updated successfully. Active sessions revoked; please log in with your new PIN.'
    );
END;
$$;

-- Secure Admin PIN Reset with Secret Recovery Key (Rate-Limited, Lockout Protected, 4-8 Digit Compatible)
CREATE OR REPLACE FUNCTION public.reset_admin_pin_with_recovery(
    p_recovery_key text,
    p_new_pin text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_rec RECORD;
    v_new_failed INT;
    v_lock_until TIMESTAMPTZ;
BEGIN
    SELECT * INTO v_rec FROM public.admin_security LIMIT 1 FOR UPDATE;
    IF NOT FOUND OR NOT v_rec.is_initialized THEN
        RAISE EXCEPTION 'System security has not been initialized yet';
    END IF;

    -- Check if currently locked out
    IF v_rec.locked_until IS NOT NULL AND NOW() < v_rec.locked_until THEN
        RAISE EXCEPTION 'Account is locked out until %. Cannot use recovery key.', v_rec.locked_until;
    END IF;

    IF p_new_pin !~ '^\d{4,8}$' THEN
        RAISE EXCEPTION 'New PIN must be between 4 and 8 digits';
    END IF;

    IF v_rec.recovery_hash != crypt(p_recovery_key, v_rec.recovery_hash) THEN
        v_new_failed := COALESCE(v_rec.failed_attempts, 0) + 1;
        IF v_new_failed >= 5 THEN
            v_lock_until := NOW() + INTERVAL '15 minutes';
            UPDATE public.admin_security
            SET failed_attempts = v_new_failed, locked_until = v_lock_until, updated_at = NOW()
            WHERE id = v_rec.id;

            INSERT INTO public.audit_logs (actor, action, entity_type, details)
            VALUES ('Unknown', 'ADMIN_RECOVERY_LOCKED', 'SECURITY',
                    jsonb_build_object('failed_attempts', v_new_failed, 'locked_until', v_lock_until));

            RAISE EXCEPTION 'Invalid recovery key phrase. Account locked for 15 minutes due to repeated failed attempts.';
        ELSE
            UPDATE public.admin_security
            SET failed_attempts = v_new_failed, updated_at = NOW()
            WHERE id = v_rec.id;

            INSERT INTO public.audit_logs (actor, action, entity_type, details)
            VALUES ('Unknown', 'ADMIN_RECOVERY_FAILED', 'SECURITY',
                    jsonb_build_object('failed_attempts', v_new_failed));

            RAISE EXCEPTION 'Invalid recovery key phrase. % attempt(s) remaining before lockout.', (5 - v_new_failed);
        END IF;
    END IF;

    -- SUCCESS: Reset PIN and revoke all existing sessions
    UPDATE public.admin_security
    SET pin_hash = crypt(p_new_pin, gen_salt('bf', 10)),
        failed_attempts = 0,
        locked_until = NULL,
        updated_at = NOW()
    WHERE id = v_rec.id;

    UPDATE public.admin_sessions
    SET revoked_at = NOW(),
        expires_at = LEAST(expires_at, NOW())
    WHERE revoked_at IS NULL;

    UPDATE public.kitchen_sessions
    SET revoked_at = NOW(),
        expires_at = LEAST(expires_at, NOW())
    WHERE revoked_at IS NULL;

    INSERT INTO public.audit_logs (actor, action, entity_type, details)
    VALUES ('Shop Owner', 'ADMIN_PIN_RESET', 'SECURITY', jsonb_build_object('timestamp', NOW()));

    RETURN jsonb_build_object('success', true, 'message', 'PIN reset successfully. Please log in with your new PIN.');
END;
$$;

-- Secure Kitchen PIN Configuration (Requires Admin authentication; expires active kitchen sessions)
CREATE OR REPLACE FUNCTION public.set_kitchen_pin(
    p_new_pin text,
    p_admin_pin text DEFAULT NULL,
    p_session_token text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_rec RECORD;
    v_is_authorized BOOLEAN := false;
BEGIN
    SELECT * INTO v_rec FROM public.admin_security LIMIT 1 FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Admin security record not found';
    END IF;

    -- Check if admin account is currently locked out
    IF v_rec.locked_until IS NOT NULL AND NOW() < v_rec.locked_until THEN
        RAISE EXCEPTION 'Admin account is locked out until %. Cannot configure Kitchen PIN.', v_rec.locked_until;
    END IF;

    -- Authorization: via session token (param or header) or Admin PIN verification
    IF p_session_token IS NOT NULL AND trim(p_session_token) <> '' THEN
        IF public.is_admin_session_valid(p_session_token) THEN
            v_is_authorized := true;
        END IF;
    ELSIF public.current_admin_session_is_valid() THEN
        v_is_authorized := true;
    END IF;

    IF NOT v_is_authorized AND p_admin_pin IS NOT NULL AND trim(p_admin_pin) <> '' THEN
        IF v_rec.pin_hash = crypt(p_admin_pin, v_rec.pin_hash) THEN
            v_is_authorized := true;
        END IF;
    END IF;

    IF NOT v_is_authorized THEN
        RAISE EXCEPTION 'Unauthorized: Valid Admin session token or Admin PIN required to configure Kitchen PIN';
    END IF;

    IF p_new_pin !~ '^\d{4}$' THEN
        RAISE EXCEPTION 'Kitchen PIN must be exactly 4 digits';
    END IF;

    UPDATE public.admin_security
    SET kitchen_pin_hash = crypt(p_new_pin, gen_salt('bf', 10)),
        kitchen_failed_attempts = 0,
        kitchen_locked_until = NULL,
        updated_at = NOW()
    WHERE id = v_rec.id;

    -- Expire all existing kitchen sessions so old PIN sessions are immediately terminated
    UPDATE public.kitchen_sessions
    SET revoked_at = NOW(),
        expires_at = LEAST(expires_at, NOW())
    WHERE revoked_at IS NULL;

    INSERT INTO public.audit_logs (actor, action, entity_type, entity_id, details)
    VALUES (
        'Shop Owner',
        'PRODUCTION_PIN_CHANGED',
        'SECURITY',
        'PIN',
        jsonb_build_object('status', 'updated', 'updated_at', NOW())
    );

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Kitchen PIN updated successfully and active sessions invalidated'
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- 5. ATOMIC BUSINESS ROUTINES (STRICT DATA INTEGRITY & AUDITING)
-- ------------------------------------------------------------------------------

-- Atomic Sale Deletion (Admin-Only, Preserving unit conversions, COGS reversal, UUID checks)
CREATE OR REPLACE FUNCTION public.delete_sale_atomic(
    p_sale_id UUID,
    p_session_token TEXT DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_sale RECORD;
    v_prod RECORD;
    v_new_stock NUMERIC;
    v_unit_cogs NUMERIC := 0.00;
    v_restored_qty NUMERIC;
BEGIN
    -- 1. Authorization: Sale deletion is strictly an Admin privilege
    IF NOT (public.is_admin_session_valid(p_session_token) OR public.current_admin_session_is_valid()) THEN
        RAISE EXCEPTION 'Unauthorized: Sale deletion requires a valid active Admin session';
    END IF;

    -- 2. Lock sale record
    SELECT * INTO v_sale FROM public.sales WHERE id = p_sale_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Sale with ID % not found', p_sale_id;
    END IF;

    -- 3. Stock restoration (Zero swallowing - missing product aborts transaction)
    IF v_sale.product_id IS NOT NULL AND v_sale.quantity > 0 THEN
        SELECT id, name, current_stock, unit INTO v_prod 
        FROM public.products 
        WHERE id = v_sale.product_id FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Product with ID % associated with sale % not found in catalogue. Aborting deletion to prevent unledgered inventory drift.',
                v_sale.product_id, p_sale_id;
        END IF;

        -- Exact Unit Conversion Check
        IF v_prod.unit IS NOT NULL AND v_sale.unit IS NOT NULL AND LOWER(v_prod.unit) <> LOWER(v_sale.unit) THEN
            IF LOWER(v_sale.unit) = 'g' AND LOWER(v_prod.unit) = 'kg' THEN
                v_restored_qty := ROUND((v_sale.quantity / 1000.0)::numeric, 3);
            ELSE
                v_restored_qty := v_sale.quantity;
            END IF;
        ELSE
            v_restored_qty := v_sale.quantity;
        END IF;

        v_new_stock := ROUND((v_prod.current_stock + v_restored_qty)::numeric, 3);

        UPDATE public.products 
        SET current_stock = v_new_stock, updated_at = NOW() 
        WHERE id = v_prod.id;

        IF v_sale.cogs IS NOT NULL AND v_sale.quantity > 0 THEN
            v_unit_cogs := ROUND((v_sale.cogs / v_sale.quantity)::numeric, 2);
        END IF;

        INSERT INTO public.stock_movements (
            item_id, item_type, item_name, movement_type, quantity, unit,
            previous_balance, new_balance, cost_per_unit, reference,
            operator_name, reason, created_at
        ) VALUES (
            v_prod.id, 'product', v_prod.name, 'sale_reversal',
            v_restored_qty, COALESCE(v_prod.unit, v_sale.unit, 'kg'),
            v_prod.current_stock, v_new_stock,
            v_unit_cogs,
            'Sale Reversal #' || p_sale_id::text,
            COALESCE(v_sale.customer_name, 'Retail'),
            'Reversal of deleted sale #' || p_sale_id::text || ' (' || v_restored_qty::text || ' ' || COALESCE(v_prod.unit, 'kg') || ' restored)',
            NOW()
        );
    END IF;

    -- 4. Delete the sale record
    DELETE FROM public.sales WHERE id = p_sale_id;

    -- 5. Audit log
    INSERT INTO public.audit_logs (actor, action, entity_type, entity_id, details)
    VALUES (
        'Shop Owner',
        'DELETE_SALE',
        'SALES',
        p_sale_id::TEXT,
        jsonb_build_object(
            'product_name', v_sale.product_name,
            'quantity', v_sale.quantity,
            'restored_quantity', v_restored_qty,
            'total_amount', v_sale.total_amount,
            'cogs', v_sale.cogs
        )
    );

    RETURN jsonb_build_object('success', true, 'id', p_sale_id, 'restored_quantity', v_restored_qty);
END;
$$;

-- Atomic Production Cancellation (Allows Kitchen & Admin, Aggregates duplicate ingredients, Non-Clamping Negative Stock)
CREATE OR REPLACE FUNCTION public.cancel_production_run_atomic(
    p_run_id UUID,
    p_reason TEXT,
    p_operator TEXT,
    p_session_token TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_run RECORD;
    v_prod RECORD;
    v_ing RECORD;
    v_agg RECORD;
    v_new_prod_stock NUMERIC;
    v_new_ing_stock NUMERIC;
    v_negative_flag BOOLEAN := false;
BEGIN
    -- 1. Authorization: Production run cancellation requires active Kitchen or Admin authorization
    IF NOT (
        public.current_kitchen_session_is_valid() OR
        public.current_admin_session_is_valid() OR
        public.is_admin_session_valid(p_session_token) OR
        public.is_kitchen_session_valid(p_session_token)
    ) THEN
        RAISE EXCEPTION 'Unauthorized: Valid Kitchen or Admin session required to cancel production run';
    END IF;

    -- 2. Concurrency Lock: Lock production run header row first
    SELECT * INTO v_run FROM public.production_runs WHERE id = p_run_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Production run % not found', p_run_id;
    END IF;
    IF v_run.status = 'cancelled' THEN
        RAISE EXCEPTION 'Production run % is already cancelled', v_run.run_number;
    END IF;

    -- 3. Lock and validate finished product row
    SELECT * INTO v_prod FROM public.products WHERE id = v_run.product_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Finished product ID % not found in products catalogue. Aborting cancellation to prevent untracked inventory divergence.', v_run.product_id;
    END IF;

    -- 4. PRE-FLIGHT VALIDATION & DUPLICATE INGREDIENT AGGREGATION
    FOR v_agg IN 
        SELECT pc.ingredient_id,
               SUM(pc.actual_quantity) AS total_actual_quantity,
               MAX(pc.unit) AS unit,
               MAX(pc.unit_cost) AS unit_cost
        FROM public.production_consumption pc
        WHERE pc.run_id = p_run_id
        GROUP BY pc.ingredient_id
        ORDER BY pc.ingredient_id
    LOOP
        IF v_agg.total_actual_quantity IS NULL OR v_agg.total_actual_quantity < 0 THEN
            RAISE EXCEPTION 'Invalid total consumption quantity (%) for ingredient ID % in run %',
                v_agg.total_actual_quantity, v_agg.ingredient_id, v_run.run_number;
        END IF;

        SELECT * INTO v_ing FROM public.ingredients WHERE id = v_agg.ingredient_id FOR UPDATE;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Ingredient ID % from consumption records not found in ingredients catalogue. Aborting cancellation to prevent untracked inventory divergence.', v_agg.ingredient_id;
        END IF;

        -- Exact single restoration per ingredient
        v_new_ing_stock := ROUND((v_ing.current_stock + v_agg.total_actual_quantity)::numeric, 3);

        UPDATE public.ingredients
        SET current_stock = v_new_ing_stock, updated_at = NOW()
        WHERE id = v_agg.ingredient_id;

        INSERT INTO public.stock_movements (
            item_id, item_type, item_name, movement_type, quantity, unit,
            previous_balance, new_balance, cost_per_unit, reference, operator_name, reason, created_at
        ) VALUES (
            v_agg.ingredient_id, 'ingredient', v_ing.name, 'cancellation_reversal',
            v_agg.total_actual_quantity, COALESCE(v_agg.unit, v_ing.unit, 'kg'),
            v_ing.current_stock, v_new_ing_stock,
            v_agg.unit_cost,
            'Reversal of ' || v_run.run_number, p_operator, p_reason, NOW()
        );
    END LOOP;

    -- 5. Deduct finished product stock (NEVER CLAMP: Preserves negative balance & flags discrepancy)
    v_new_prod_stock := ROUND((v_prod.current_stock - COALESCE(v_run.actual_quantity, 0))::numeric, 3);
    IF v_new_prod_stock < 0 THEN
        v_negative_flag := true;
    END IF;

    UPDATE public.products
    SET current_stock = v_new_prod_stock, updated_at = NOW()
    WHERE id = v_run.product_id;

    INSERT INTO public.stock_movements (
        item_id, item_type, item_name, movement_type, quantity, unit,
        previous_balance, new_balance, reference, operator_name, reason, created_at
    ) VALUES (
        v_run.product_id, 'product', v_prod.name,
        'cancellation_reversal', -COALESCE(v_run.actual_quantity, 0), v_run.unit,
        v_prod.current_stock, v_new_prod_stock,
        'Reversal of ' || v_run.run_number, p_operator, p_reason, NOW()
    );

    -- 6. Mark run cancelled
    UPDATE public.production_runs
    SET status = 'cancelled',
        cancellation_reason = p_reason,
        cancelled_at = NOW(),
        cancelled_by = p_operator,
        updated_at = NOW()
    WHERE id = p_run_id;

    -- 7. Audit Log
    INSERT INTO public.audit_logs (actor, action, entity_type, entity_id, details)
    VALUES (
        p_operator, 'CANCEL_PRODUCTION_RUN', 'PRODUCTION', p_run_id::TEXT,
        jsonb_build_object(
            'run_number', v_run.run_number,
            'reason', p_reason,
            'deducted_product_stock', v_run.actual_quantity,
            'resulting_product_stock', v_new_prod_stock,
            'negative_stock_flag', v_negative_flag
        )
    );

    RETURN true;
END;
$$;

-- Server-Verified Oil Reconciliation (Advisory lock serialization, idempotent, non-clamping, protects average cost)
CREATE OR REPLACE FUNCTION public.reconcile_daily_closing_oil_movement(
    p_production_date date,
    p_oil_ing_id uuid,
    p_oil_used numeric,
    p_leftover_oil numeric,
    p_oil_consumed_kg numeric,
    p_oil_unit_cost numeric,
    p_previous_available_stock numeric,
    p_final_oil_stock numeric,
    p_closed_by text DEFAULT 'Kitchen Staff'::text,
    p_session_token text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_oil RECORD;
    v_server_consumed NUMERIC;
    v_logged_qty NUMERIC := 0.000;
    v_target_qty NUMERIC;
    v_delta NUMERIC;
    v_verified_final_stock NUMERIC;
    v_ref_base TEXT;
    v_inserted_id UUID;
    v_action TEXT;
BEGIN
    -- 1. Authorization: Kitchen or Admin session required
    IF NOT (
        public.current_kitchen_session_is_valid() OR
        public.current_admin_session_is_valid() OR
        public.is_admin_session_valid(p_session_token) OR
        public.is_kitchen_session_valid(p_session_token)
    ) THEN
        RAISE EXCEPTION 'Unauthorized: Valid Kitchen or Admin session required to reconcile daily closing';
    END IF;

    -- 2. Race-Safe Serialization: Transactional advisory lock on the production date
    PERFORM pg_advisory_xact_lock(hashtext('daily_closing_oil_' || p_production_date::text));

    -- 3. Input Validation
    IF p_oil_used IS NULL OR p_oil_used < 0 THEN
        RAISE EXCEPTION 'Oil used cannot be negative';
    END IF;
    IF p_leftover_oil IS NULL OR p_leftover_oil < 0 THEN
        RAISE EXCEPTION 'Leftover oil cannot be negative';
    END IF;
    IF p_leftover_oil > p_oil_used THEN
        RAISE EXCEPTION 'Leftover oil (%) cannot exceed oil used (%)', p_leftover_oil, p_oil_used;
    END IF;
    IF p_oil_unit_cost IS NOT NULL AND p_oil_unit_cost < 0 THEN
        RAISE EXCEPTION 'Oil unit cost cannot be negative';
    END IF;

    -- Server-side authoritative net consumption calculation
    v_server_consumed := ROUND((p_oil_used - p_leftover_oil)::numeric, 3);
    v_ref_base := 'Daily Closing ' || p_production_date::text;
    v_target_qty := -v_server_consumed;

    -- 4. Locate and lock oil ingredient
    SELECT id, name, unit, current_stock, avg_cost_per_unit INTO v_oil
    FROM public.ingredients
    WHERE id = p_oil_ing_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Oil ingredient with ID % not found', p_oil_ing_id;
    END IF;

    -- 5. Calculate total oil consumption already recorded in stock movements for this closing date
    SELECT COALESCE(SUM(quantity), 0) INTO v_logged_qty
    FROM public.stock_movements
    WHERE item_id = p_oil_ing_id
      AND (reference = v_ref_base OR reference LIKE v_ref_base || ' (Correction)%');

    -- Delta adjustment required in ledger
    v_delta := ROUND((v_target_qty - v_logged_qty)::numeric, 3);

    -- 6. Server-side Final Stock Calculation (Authoritative calculation on locked stock)
    v_verified_final_stock := ROUND((v_oil.current_stock + v_delta)::numeric, 3);

    -- Apply server-verified stock (Non-clamping: preserves negative balance)
    -- DEFENSIVE: Do NOT overwrite avg_cost_per_unit with 0.00; only update if positive unit cost is supplied
    UPDATE public.ingredients
    SET current_stock = v_verified_final_stock,
        avg_cost_per_unit = CASE 
            WHEN p_oil_unit_cost IS NOT NULL AND p_oil_unit_cost > 0 THEN p_oil_unit_cost 
            ELSE avg_cost_per_unit 
        END,
        updated_at = NOW()
    WHERE id = p_oil_ing_id;

    -- 7. Reconcile ledger movements idempotently
    IF v_logged_qty = 0 AND NOT EXISTS (SELECT 1 FROM public.stock_movements WHERE item_id = p_oil_ing_id AND reference = v_ref_base) THEN
        INSERT INTO public.stock_movements (
            item_id, item_type, item_name, movement_type, quantity, unit,
            previous_balance, new_balance, cost_per_unit, reference,
            operator_name, reason, created_at
        ) VALUES (
            p_oil_ing_id, 'ingredient', v_oil.name, 'production_consumption',
            v_target_qty, COALESCE(v_oil.unit, 'kg'),
            v_oil.current_stock, v_verified_final_stock, 
            COALESCE(NULLIF(p_oil_unit_cost, 0), v_oil.avg_cost_per_unit, 0.00),
            v_ref_base, p_closed_by,
            'Daily oil usage: ' || p_oil_used::text || ' kg used - ' || p_leftover_oil::text || ' kg leftover = ' || v_server_consumed::text || ' kg net consumed',
            NOW()
        ) RETURNING id INTO v_inserted_id;

        v_action := 'inserted_initial';
    ELSE
        IF v_delta = 0 THEN
            v_action := 'unchanged';
        ELSE
            INSERT INTO public.stock_movements (
                item_id, item_type, item_name, movement_type, quantity, unit,
                previous_balance, new_balance, cost_per_unit, reference,
                operator_name, reason, created_at
            ) VALUES (
                p_oil_ing_id, 'ingredient', v_oil.name, 'adjustment',
                v_delta, COALESCE(v_oil.unit, 'kg'),
                v_oil.current_stock, v_verified_final_stock, 
                COALESCE(NULLIF(p_oil_unit_cost, 0), v_oil.avg_cost_per_unit, 0.00),
                v_ref_base || ' (Correction)', p_closed_by,
                'Daily closing correction for ' || p_production_date::text || ': net consumption adjusted by ' || v_delta::text || ' kg to target ' || v_server_consumed::text || ' kg',
                NOW()
            ) RETURNING id INTO v_inserted_id;

            v_action := 'adjusted';
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'action', v_action,
        'movement_id', v_inserted_id,
        'delta', v_delta,
        'net_logged', v_target_qty,
        'verified_final_stock', v_verified_final_stock
    );
END;
$$;

-- Secure Admin Dashboard Metrics (Requires valid active Admin session)
CREATE OR REPLACE FUNCTION public.get_admin_dashboard_metrics(
    p_start_date date DEFAULT ((CURRENT_DATE - '30 days'::interval))::date,
    p_end_date date DEFAULT CURRENT_DATE
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_total_products INT;
    v_active_products INT;
    v_inactive_products INT;
    v_total_ingredients INT;
    v_runs_today INT;
    v_qty_today NUMERIC;
    v_runs_in_period INT;
    v_qty_in_period NUMERIC;
    v_by_product JSONB;
    v_consumption JSONB;
    v_recent_activity JSONB;
BEGIN
    -- Authorization: Admin session strictly required to read aggregated financial & production metrics
    IF NOT (public.current_admin_session_is_valid()) THEN
        RAISE EXCEPTION 'Unauthorized: Valid Admin session required to access dashboard metrics';
    END IF;

    SELECT count(*), count(*) FILTER (WHERE is_active = true), count(*) FILTER (WHERE is_active = false)
    INTO v_total_products, v_active_products, v_inactive_products
    FROM public.products;

    SELECT count(*) INTO v_total_ingredients FROM public.ingredients;

    SELECT count(*), COALESCE(sum(actual_quantity), 0)
    INTO v_runs_today, v_qty_today
    FROM public.production_runs
    WHERE production_date = CURRENT_DATE AND status = 'completed';

    SELECT count(*), COALESCE(sum(actual_quantity), 0)
    INTO v_runs_in_period, v_qty_in_period
    FROM public.production_runs
    WHERE production_date >= p_start_date AND production_date <= p_end_date AND status = 'completed';

    SELECT COALESCE(jsonb_agg(item), '[]'::jsonb) INTO v_by_product
    FROM (
        SELECT p.name AS product_name, p.unit, COALESCE(sum(pr.actual_quantity), 0) AS total_quantity, count(pr.id) AS run_count
        FROM public.products p
        JOIN public.production_runs pr ON pr.product_id = p.id
        WHERE pr.production_date >= p_start_date AND pr.production_date <= p_end_date AND pr.status = 'completed'
        GROUP BY p.name, p.unit
        ORDER BY total_quantity DESC
    ) item;

    SELECT COALESCE(jsonb_agg(item), '[]'::jsonb) INTO v_consumption
    FROM (
        SELECT i.name AS ingredient_name, i.category, i.unit, COALESCE(sum(pc.actual_quantity), 0) AS total_consumed
        FROM public.ingredients i
        JOIN public.production_consumption pc ON pc.ingredient_id = i.id
        JOIN public.production_runs pr ON pr.id = pc.run_id
        WHERE pr.production_date >= p_start_date AND pr.production_date <= p_end_date AND pr.status = 'completed'
        GROUP BY i.name, i.category, i.unit
        ORDER BY total_consumed DESC
    ) item;

    SELECT COALESCE(jsonb_agg(item), '[]'::jsonb) INTO v_recent_activity
    FROM (
        SELECT pr.id, pr.run_number, p.name AS product_name, pr.production_date, pr.actual_quantity, pr.unit, pr.status, pr.operator_name, pr.created_at
        FROM public.production_runs pr
        JOIN public.products p ON p.id = pr.product_id
        ORDER BY pr.created_at DESC
        LIMIT 8
    ) item;

    RETURN jsonb_build_object(
        'total_products', v_total_products,
        'active_products', v_active_products,
        'inactive_products', v_inactive_products,
        'total_ingredients', v_total_ingredients,
        'runs_today', v_runs_today,
        'qty_today', v_qty_today,
        'runs_in_period', v_runs_in_period,
        'qty_in_period', v_qty_in_period,
        'by_product', v_by_product,
        'consumption', v_consumption,
        'recent_activity', v_recent_activity
    );
END;
$$;

-- Physical Stock Reconciliation (Admin-only, audited, non-clamping, discrepancy calculation)
CREATE OR REPLACE FUNCTION public.reconcile_physical_inventory_count(
    p_item_id UUID,
    p_physical_count NUMERIC,
    p_reason TEXT,
    p_operator TEXT DEFAULT 'Shop Owner',
    p_session_token TEXT DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_ing RECORD;
    v_prod RECORD;
    v_item_type TEXT;
    v_item_name TEXT;
    v_current_stock NUMERIC;
    v_unit TEXT;
    v_cost_per_unit NUMERIC := 0.00;
    v_delta NUMERIC;
    v_inserted_id UUID;
BEGIN
    -- 1. Authorization: Physical reconciliation is strictly an Admin privilege
    IF NOT (public.is_admin_session_valid(p_session_token) OR public.current_admin_session_is_valid()) THEN
        RAISE EXCEPTION 'Unauthorized: Physical stock reconciliation requires a valid active Admin session';
    END IF;

    -- 2. Input validation
    IF p_physical_count IS NULL OR p_physical_count < 0 THEN
        RAISE EXCEPTION 'Physical stock count must be a non-negative number';
    END IF;

    IF p_reason IS NULL OR trim(p_reason) = '' THEN
        RAISE EXCEPTION 'Reconciliation reason is mandatory for audit accountability';
    END IF;

    -- 3. Check ingredients first
    SELECT id, name, unit, current_stock, avg_cost_per_unit INTO v_ing
    FROM public.ingredients
    WHERE id = p_item_id
    FOR UPDATE;

    IF FOUND THEN
        v_item_type := 'ingredient';
        v_item_name := v_ing.name;
        v_current_stock := v_ing.current_stock;
        v_unit := COALESCE(v_ing.unit, 'kg');
        v_cost_per_unit := COALESCE(v_ing.avg_cost_per_unit, 0.00);

        v_delta := ROUND((p_physical_count - v_current_stock)::numeric, 3);

        UPDATE public.ingredients
        SET current_stock = p_physical_count,
            updated_at = NOW()
        WHERE id = p_item_id;
    ELSE
        -- Check products
        SELECT id, name, unit, current_stock INTO v_prod
        FROM public.products
        WHERE id = p_item_id
        FOR UPDATE;

        IF FOUND THEN
            v_item_type := 'product';
            v_item_name := v_prod.name;
            v_current_stock := v_prod.current_stock;
            v_unit := COALESCE(v_prod.unit, 'kg');

            v_delta := ROUND((p_physical_count - v_current_stock)::numeric, 3);

            UPDATE public.products
            SET current_stock = p_physical_count,
                updated_at = NOW()
            WHERE id = p_item_id;
        ELSE
            RAISE EXCEPTION 'Item with ID % not found in ingredients or products catalogue', p_item_id;
        END IF;
    END IF;

    -- 4. Insert audited stock movement
    INSERT INTO public.stock_movements (
        item_id, item_type, item_name, movement_type, quantity, unit,
        previous_balance, new_balance, cost_per_unit, reference,
        operator_name, reason, created_at
    ) VALUES (
        p_item_id, v_item_type, v_item_name, 'adjustment',
        v_delta, v_unit,
        v_current_stock, p_physical_count, v_cost_per_unit,
        'Physical Audit Reconciliation', p_operator,
        'Physical count reconciliation: ' || p_reason,
        NOW()
    ) RETURNING id INTO v_inserted_id;

    -- 5. Audit Log
    INSERT INTO public.audit_logs (actor, action, entity_type, entity_id, details)
    VALUES (
        p_operator, 'INVENTORY_PHYSICAL_RECONCILIATION', 'INVENTORY', p_item_id::text,
        jsonb_build_object(
            'item_name', v_item_name,
            'item_type', v_item_type,
            'previous_stock', v_current_stock,
            'physical_count', p_physical_count,
            'discrepancy_delta', v_delta,
            'movement_id', v_inserted_id,
            'reason', p_reason,
            'timestamp', NOW()
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'item_id', p_item_id,
        'item_name', v_item_name,
        'item_type', v_item_type,
        'previous_stock', v_current_stock,
        'physical_count', p_physical_count,
        'discrepancy_delta', v_delta,
        'movement_id', v_inserted_id,
        'message', 'Physical inventory count reconciled successfully'
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- 6. TOTAL RLS PURGE & GRANULAR LEAST-PRIVILEGE RECONSTRUCTION
-- ------------------------------------------------------------------------------

-- 6.1 Drop EVERY existing policy across all public tables cleanly
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT schemaname, tablename, policyname 
        FROM pg_policies 
        WHERE schemaname = 'public'
    ) LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
    END LOOP;
END $$;

-- 6.2 Security & Session Tables: Total direct access lockdown (accessible only via SECURITY DEFINER functions)
CREATE POLICY admin_security_deny_direct_access ON public.admin_security FOR ALL TO public USING (false) WITH CHECK (false);
CREATE POLICY admin_sessions_deny_direct_access ON public.admin_sessions FOR ALL TO public USING (false) WITH CHECK (false);
CREATE POLICY kitchen_sessions_deny_direct_access ON public.kitchen_sessions FOR ALL TO public USING (false) WITH CHECK (false);

-- 6.3 Immutable Ledgers: stock_movements & audit_logs
-- stock_movements: Staff and admin can select; kitchen and admin can insert; UPDATE & DELETE denied to all
CREATE POLICY stock_movements_select_policy ON public.stock_movements FOR SELECT TO public
    USING (public.current_kitchen_session_is_valid() OR public.current_admin_session_is_valid());
CREATE POLICY stock_movements_insert_policy ON public.stock_movements FOR INSERT TO public
    WITH CHECK (public.current_kitchen_session_is_valid() OR public.current_admin_session_is_valid());
CREATE POLICY stock_movements_deny_update ON public.stock_movements FOR UPDATE TO public USING (false);
CREATE POLICY stock_movements_deny_delete ON public.stock_movements FOR DELETE TO public USING (false);

-- audit_logs: Staff and admin can select (for realtime PIN sync and logs); staff and admin can insert; UPDATE & DELETE denied to all
CREATE POLICY audit_logs_select_policy ON public.audit_logs FOR SELECT TO public
    USING (public.current_kitchen_session_is_valid() OR public.current_admin_session_is_valid());
CREATE POLICY audit_logs_insert_policy ON public.audit_logs FOR INSERT TO public
    WITH CHECK (public.current_kitchen_session_is_valid() OR public.current_admin_session_is_valid());
CREATE POLICY audit_logs_deny_update ON public.audit_logs FOR UPDATE TO public USING (false);
CREATE POLICY audit_logs_deny_delete ON public.audit_logs FOR DELETE TO public USING (false);

-- 6.4 Financial & Sales Records
CREATE POLICY sales_select_policy ON public.sales FOR SELECT TO public
    USING (public.current_admin_session_is_valid());
CREATE POLICY sales_admin_mutation_policy ON public.sales FOR ALL TO public
    USING (public.current_admin_session_is_valid())
    WITH CHECK (public.current_admin_session_is_valid());

-- 6.5 Daily Wages & Cost Allocations
CREATE POLICY daily_wages_select_policy ON public.daily_wages FOR SELECT TO public
    USING (public.current_kitchen_session_is_valid() OR public.current_admin_session_is_valid());
CREATE POLICY daily_wages_insert_policy ON public.daily_wages FOR INSERT TO public
    WITH CHECK (public.current_kitchen_session_is_valid() OR public.current_admin_session_is_valid());
CREATE POLICY daily_wages_update_policy ON public.daily_wages FOR UPDATE TO public
    USING (public.current_kitchen_session_is_valid() OR public.current_admin_session_is_valid())
    WITH CHECK (public.current_kitchen_session_is_valid() OR public.current_admin_session_is_valid());
CREATE POLICY daily_wages_delete_policy ON public.daily_wages FOR DELETE TO public
    USING (public.current_admin_session_is_valid());

CREATE POLICY daily_cost_allocations_select_policy ON public.daily_cost_allocations FOR SELECT TO public USING (true);
CREATE POLICY daily_cost_allocations_insert_policy ON public.daily_cost_allocations FOR INSERT TO public
    WITH CHECK (public.current_kitchen_session_is_valid() OR public.current_admin_session_is_valid());
CREATE POLICY daily_cost_allocations_update_policy ON public.daily_cost_allocations FOR UPDATE TO public
    USING (public.current_kitchen_session_is_valid() OR public.current_admin_session_is_valid())
    WITH CHECK (public.current_kitchen_session_is_valid() OR public.current_admin_session_is_valid());
CREATE POLICY daily_cost_allocations_delete_policy ON public.daily_cost_allocations FOR DELETE TO public
    USING (public.current_admin_session_is_valid());

-- 6.6 Daily Closings & Packing Records
CREATE POLICY daily_closings_select_policy ON public.daily_closings FOR SELECT TO public USING (true);
CREATE POLICY daily_closings_insert_policy ON public.daily_closings FOR INSERT TO public
    WITH CHECK (public.current_kitchen_session_is_valid() OR public.current_admin_session_is_valid());
CREATE POLICY daily_closings_update_policy ON public.daily_closings FOR UPDATE TO public
    USING (public.current_kitchen_session_is_valid() OR public.current_admin_session_is_valid())
    WITH CHECK (public.current_kitchen_session_is_valid() OR public.current_admin_session_is_valid());
CREATE POLICY daily_closings_delete_policy ON public.daily_closings FOR DELETE TO public
    USING (public.current_admin_session_is_valid());

CREATE POLICY packing_records_select_policy ON public.packing_records FOR SELECT TO public USING (true);
CREATE POLICY packing_records_operational_mutation_policy ON public.packing_records FOR ALL TO public
    USING (public.current_kitchen_session_is_valid() OR public.current_admin_session_is_valid())
    WITH CHECK (public.current_kitchen_session_is_valid() OR public.current_admin_session_is_valid());

-- 6.7 Packet Types & Packaging Items (Covers Inventory)
-- Kitchen updates quantities during packing; Admin inserts/updates/deletes
CREATE POLICY packet_types_select_policy ON public.packet_types FOR SELECT TO public USING (true);
CREATE POLICY packet_types_update_policy ON public.packet_types FOR UPDATE TO public
    USING (public.current_kitchen_session_is_valid() OR public.current_admin_session_is_valid())
    WITH CHECK (public.current_kitchen_session_is_valid() OR public.current_admin_session_is_valid());
CREATE POLICY packet_types_admin_insert_policy ON public.packet_types FOR INSERT TO public
    WITH CHECK (public.current_admin_session_is_valid());
CREATE POLICY packet_types_admin_delete_policy ON public.packet_types FOR DELETE TO public
    USING (public.current_admin_session_is_valid());

CREATE POLICY packaging_items_select_policy ON public.packaging_items FOR SELECT TO public USING (true);
CREATE POLICY packaging_items_update_policy ON public.packaging_items FOR UPDATE TO public
    USING (public.current_kitchen_session_is_valid() OR public.current_admin_session_is_valid())
    WITH CHECK (public.current_kitchen_session_is_valid() OR public.current_admin_session_is_valid());
CREATE POLICY packaging_items_admin_insert_policy ON public.packaging_items FOR INSERT TO public
    WITH CHECK (public.current_admin_session_is_valid());
CREATE POLICY packaging_items_admin_delete_policy ON public.packaging_items FOR DELETE TO public
    USING (public.current_admin_session_is_valid());

-- 6.8 Master Catalog & Production Operational Tables
-- Public read for POS and Kitchen UI displays; mutations strictly Admin only
CREATE POLICY ingredients_select_policy ON public.ingredients FOR SELECT TO public USING (true);
CREATE POLICY ingredients_admin_mutation_policy ON public.ingredients FOR ALL TO public
    USING (public.current_admin_session_is_valid()) WITH CHECK (public.current_admin_session_is_valid());

CREATE POLICY products_select_policy ON public.products FOR SELECT TO public USING (true);
CREATE POLICY products_admin_mutation_policy ON public.products FOR ALL TO public
    USING (public.current_admin_session_is_valid()) WITH CHECK (public.current_admin_session_is_valid());

CREATE POLICY recipes_select_policy ON public.recipes FOR SELECT TO public USING (true);
CREATE POLICY recipes_admin_mutation_policy ON public.recipes FOR ALL TO public
    USING (public.current_admin_session_is_valid()) WITH CHECK (public.current_admin_session_is_valid());

CREATE POLICY recipe_items_select_policy ON public.recipe_items FOR SELECT TO public USING (true);
CREATE POLICY recipe_items_admin_mutation_policy ON public.recipe_items FOR ALL TO public
    USING (public.current_admin_session_is_valid()) WITH CHECK (public.current_admin_session_is_valid());

CREATE POLICY recipe_packets_select_policy ON public.recipe_packets FOR SELECT TO public USING (true);
CREATE POLICY recipe_packets_admin_mutation_policy ON public.recipe_packets FOR ALL TO public
    USING (public.current_admin_session_is_valid()) WITH CHECK (public.current_admin_session_is_valid());

CREATE POLICY product_selling_prices_select_policy ON public.product_selling_prices FOR SELECT TO public USING (true);
CREATE POLICY product_selling_prices_admin_mutation_policy ON public.product_selling_prices FOR ALL TO public
    USING (public.current_admin_session_is_valid()) WITH CHECK (public.current_admin_session_is_valid());

CREATE POLICY production_runs_select_policy ON public.production_runs FOR SELECT TO public USING (true);
CREATE POLICY production_runs_admin_mutation_policy ON public.production_runs FOR ALL TO public
    USING (public.current_admin_session_is_valid())
    WITH CHECK (public.current_admin_session_is_valid());

CREATE POLICY production_consumption_select_policy ON public.production_consumption FOR SELECT TO public USING (true);
CREATE POLICY production_consumption_admin_mutation_policy ON public.production_consumption FOR ALL TO public
    USING (public.current_admin_session_is_valid())
    WITH CHECK (public.current_admin_session_is_valid());

-- ------------------------------------------------------------------------------
-- 7. EXPLICIT LEAST-PRIVILEGE FUNCTION PRIVILEGES & DEFAULT REVOCATION
-- ------------------------------------------------------------------------------

-- Prevent future routines from automatically granting execution to PUBLIC
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON ROUTINES FROM PUBLIC, anon, authenticated;

-- Revoke all existing function privileges from PUBLIC and application roles
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated;

-- Granular execution grants: Only grant what PostgREST requires to serve authorized client RPCs
GRANT EXECUTE ON FUNCTION public.is_admin_initialized() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.setup_initial_admin_pin(text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_admin_pin(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_kitchen_pin(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_kitchen_pin_configured() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin_session_valid(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_kitchen_session_valid(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.current_admin_session_is_valid() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.current_kitchen_session_is_valid() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_admin_session(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_kitchen_session(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.change_admin_pin(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reset_admin_pin_with_recovery(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_kitchen_pin(text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_production_run_atomic(text, uuid, uuid, integer, date, numeric, numeric, text, text, text, jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_production_run_atomic(uuid, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_sale_atomic(date, text, numeric, text, numeric, numeric, uuid, text, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_sale_atomic(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_daily_closing_oil_movement(date, uuid, numeric, numeric, numeric, numeric, numeric, numeric, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_physical_inventory_count(uuid, numeric, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_dashboard_metrics(date, date) TO anon, authenticated;

COMMIT;
