import { useState, useEffect, useCallback, useRef } from 'react';
import { dbCache } from '../services/dbCache';

interface VersionInfo {
  buildId: string;
  commitHash?: string;
  builtAt?: string;
}

export function useUpdateChecker() {
  const [hasUpdate, setHasUpdate] = useState<boolean>(false);
  const [isUpdating, setIsUpdating] = useState<boolean>(false);
  const [newVersion, setNewVersion] = useState<VersionInfo | null>(null);

  // Store the running application's build ID injected at build time by Vite
  const currentBuildIdRef = useRef<string>(
    typeof __APP_BUILD_ID__ !== 'undefined' ? __APP_BUILD_ID__ : ''
  );

  const checkVersion = useCallback(async () => {
    // If update is already detected and modal is open, avoid redundant checks
    if (hasUpdate || isUpdating) return;

    try {
      const res = await fetch(`/version.json?_t=${Date.now()}`, {
        method: 'GET',
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          Pragma: 'no-cache',
          Expires: '0',
        },
      });

      if (!res.ok) return;

      const data: VersionInfo = await res.json();
      if (!data || !data.buildId) return;

      // If initial buildId was empty (e.g. initial dev load without define), set it once
      if (!currentBuildIdRef.current) {
        currentBuildIdRef.current = data.buildId;
        return;
      }

      // If remote buildId differs from running buildId, new deployment has happened!
      if (data.buildId !== currentBuildIdRef.current) {
        console.log('[UpdateChecker] New deployment detected:', {
          current: currentBuildIdRef.current,
          latest: data.buildId,
        });
        setNewVersion(data);
        setHasUpdate(true);
      }
    } catch {
      // Network issues or transient errors are safely ignored
    }
  }, [hasUpdate, isUpdating]);

  useEffect(() => {
    // 1. Initial check shortly after mount
    const initialTimer = setTimeout(() => {
      checkVersion();
    }, 2000);

    // 2. Continuous lightweight background polling every 15 seconds
    const interval = setInterval(checkVersion, 15000);

    // 3. Immediate check on tab focus or visibility change (e.g. user returns to app)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkVersion();
      }
    };

    const handleFocus = () => {
      checkVersion();
    };

    const handleOnline = () => {
      checkVersion();
    };

    // 4. Catch Vite dynamic import chunk 404s (which happen when a new deployment invalidates old chunk hashes)
    const handleError = (e: ErrorEvent) => {
      const msg = e?.message || '';
      if (
        msg.includes('Failed to fetch dynamically imported module') ||
        msg.includes('Importing a module script failed') ||
        msg.includes('error loading dynamically imported module')
      ) {
        console.warn('[UpdateChecker] Dynamic chunk error detected, triggering compulsory update.');
        setHasUpdate(true);
      }
    };

    const handleUnhandledRejection = (e: PromiseRejectionEvent) => {
      const msg = String(e?.reason?.message || e?.reason || '');
      if (
        msg.includes('Failed to fetch dynamically imported module') ||
        msg.includes('Importing a module script failed') ||
        msg.includes('error loading dynamically imported module')
      ) {
        console.warn('[UpdateChecker] Unhandled chunk rejection detected, triggering compulsory update.');
        setHasUpdate(true);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('online', handleOnline);
    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, [checkVersion]);

  // Compulsory update execution: clear all caches, unregister service workers, and hard reload
  const applyUpdateAndClearCache = useCallback(async () => {
    setIsUpdating(true);

    try {
      // 1. Clear CacheStorage
      if ('caches' in window) {
        const cacheKeys = await window.caches.keys();
        await Promise.all(cacheKeys.map((key) => window.caches.delete(key)));
      }

      // 2. Unregister all service workers
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((reg) => reg.unregister()));
      }

      // 3. Clear database in-memory cache
      dbCache.invalidateAll();

      // 4. Clear non-essential session storage
      try {
        sessionStorage.clear();
      } catch {
        // ignore
      }
    } catch (err) {
      console.warn('[UpdateChecker] Error clearing caches:', err);
    } finally {
      // 5. Force hard reload with timestamp query param to bypass any HTTP/disk cache
      const reloadUrl = new URL(window.location.href);
      reloadUrl.searchParams.set('_build_reload', Date.now().toString());
      window.location.replace(reloadUrl.toString());
    }
  }, []);

  return {
    hasUpdate,
    isUpdating,
    newVersion,
    applyUpdateAndClearCache,
    checkVersion,
  };
}
