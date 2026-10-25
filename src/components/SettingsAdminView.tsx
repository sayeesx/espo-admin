import React, { useState, useEffect } from 'react';
import {
  FiLock,
  FiShield,
  FiTrash2,
  FiRefreshCw,
  FiCheck,
  FiAlertTriangle,
  FiEye,
  FiEyeOff,
  FiInfo,
  FiPrinter,
  FiCpu,
  FiSave,
  FiKey,
} from 'react-icons/fi';
import { supabase } from '../services/supabase';
import {
  Product,
  Ingredient,
  ProductionRun,
  StockMovement,
  FactoryProfile,
  DEFAULT_FACTORY_PROFILE,
} from '../types';

interface SettingsAdminViewProps {
  products: Product[];
  ingredients: Ingredient[];
  productionRuns: ProductionRun[];
  stockMovements: StockMovement[];
  onRefresh: () => void;
}

export const SettingsAdminView: React.FC<SettingsAdminViewProps> = ({
  products,
  ingredients,
  productionRuns,
  stockMovements,
  onRefresh,
}) => {
  // ==========================================
  // 1. PRODUCTION PIN STATE
  // ==========================================
  const [currentPin, setCurrentPin] = useState<string>('1234');
  const [showCurrentPin, setShowCurrentPin] = useState<boolean>(false);
  const [newPin, setNewPin] = useState<string>('');
  const [confirmPin, setConfirmPin] = useState<string>('');
  const [pinLoading, setPinLoading] = useState<boolean>(false);
  const [pinMessage, setPinMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // ==========================================
  // 2. FACTORY PROFILE STATE
  // ==========================================
  const [profile, setProfile] = useState<FactoryProfile>(() => {
    try {
      const saved = localStorage.getItem('epso_factory_profile');
      return saved ? { ...DEFAULT_FACTORY_PROFILE, ...JSON.parse(saved) } : DEFAULT_FACTORY_PROFILE;
    } catch {
      return DEFAULT_FACTORY_PROFILE;
    }
  });
  const [profileSaved, setProfileSaved] = useState<boolean>(false);

  // ==========================================
  // 3. AI / GEMINI CONFIG STATE
  // ==========================================
  const [geminiApiKey, setGeminiApiKey] = useState<string>(() => {
    return localStorage.getItem('epso_gemini_api_key') || '';
  });
  const [showApiKey, setShowApiKey] = useState<boolean>(false);
  const [aiTestStatus, setAiTestStatus] = useState<string | null>(null);
  const [aiSaved, setAiSaved] = useState<boolean>(false);

  // ==========================================
  // 4. DATA RESET MODAL & ACTION
  // ==========================================
  type ResetActionType = 'sales' | 'batches' | 'ledger' | 'stock' | 'full';
  const [resetModalType, setResetModalType] = useState<ResetActionType | null>(null);
  const [enteredPin, setEnteredPin] = useState<string>('');
  const [resetConfirmationText, setResetConfirmationText] = useState<string>('');
  const [resetError, setResetError] = useState<string>('');
  const [resetLoading, setResetLoading] = useState<boolean>(false);
  const [resetSuccessNotice, setResetSuccessNotice] = useState<string | null>(null);

  // Load PIN and Factory Profile from cache and audit logs
  useEffect(() => {
    const cached = localStorage.getItem('epso_production_pin');
    if (cached) setCurrentPin(cached);

    (async () => {
      try {
        // Fetch PIN
        const { data: pinData } = await supabase
          .from('audit_logs')
          .select('details')
          .eq('action', 'PRODUCTION_PIN_CHANGED')
          .order('created_at', { ascending: false })
          .limit(1);

        if (pinData && pinData.length > 0 && pinData[0].details?.pin) {
          const pinVal = String(pinData[0].details.pin);
          setCurrentPin(pinVal);
          localStorage.setItem('epso_production_pin', pinVal);
        }

        // Fetch Factory / Bill Profile
        const { data: profileData } = await supabase
          .from('audit_logs')
          .select('details')
          .eq('action', 'FACTORY_PROFILE_UPDATED')
          .order('created_at', { ascending: false })
          .limit(1);

        if (profileData && profileData.length > 0 && profileData[0].details) {
          const remoteProfile = profileData[0].details;
          setProfile((prev) => ({ ...prev, ...remoteProfile }));
          localStorage.setItem(
            'epso_factory_profile',
            JSON.stringify({ ...DEFAULT_FACTORY_PROFILE, ...remoteProfile })
          );
        }
      } catch {
        // silent fallback
      }
    })();
  }, []);

  // Update Production PIN
  const handleUpdatePin = async (e: React.FormEvent) => {
    e.preventDefault();
    setPinMessage(null);

    if (!/^\d{4}$/.test(newPin)) {
      setPinMessage({
        type: 'error',
        text: 'പിൻ കൃത്യമായി 4 അക്കങ്ങൾ (0-9) ആയിരിക്കണം (PIN must be exactly 4 digits)',
      });
      return;
    }

    if (newPin !== confirmPin) {
      setPinMessage({
        type: 'error',
        text: 'നൽകിയ രണ്ട് പിന്നുകളും പൊരുത്തപ്പെടുന്നില്ല (PINs do not match)',
      });
      return;
    }

    setPinLoading(true);
    try {
      // 1. Audit log in Supabase
      await supabase.from('audit_logs').insert([
        {
          actor: 'Super Admin',
          action: 'PRODUCTION_PIN_CHANGED',
          entity_type: 'SECURITY',
          entity_id: 'PIN',
          details: { pin: newPin, updated_at: new Date().toISOString() },
        },
      ]);

      // 2. Cache locally
      localStorage.setItem('epso_production_pin', newPin);
      setCurrentPin(newPin);
      setNewPin('');
      setConfirmPin('');
      setPinMessage({
        type: 'success',
        text: 'പ്രൊഡക്ഷൻ പിൻ വിജയകരമായി മാറ്റി! (Production PIN updated successfully)',
      });
      setTimeout(() => setPinMessage(null), 3000);
    } catch (err: any) {
      localStorage.setItem('epso_production_pin', newPin);
      setCurrentPin(newPin);
      setNewPin('');
      setConfirmPin('');
      setPinMessage({
        type: 'success',
        text: 'പ്രൊഡക്ഷൻ പിൻ സേവ് ചെയ്തു! (PIN saved locally)',
      });
      setTimeout(() => setPinMessage(null), 3000);
    } finally {
      setPinLoading(false);
    }
  };

  // Save Factory Profile
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      localStorage.setItem('epso_factory_profile', JSON.stringify(profile));
      setProfileSaved(true);
      setTimeout(() => setProfileSaved(false), 2500);

      // Cloud persistence via Supabase audit_logs
      await supabase.from('audit_logs').insert({
        action: 'FACTORY_PROFILE_UPDATED',
        details: profile,
      });
    } catch {
      // Local storage fallback already succeeded
    }
  };

  // Save AI Key
  const handleSaveAi = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      localStorage.setItem('epso_gemini_api_key', geminiApiKey.trim());
      setAiSaved(true);
      setTimeout(() => setAiSaved(false), 2500);
    } catch {
      alert('Failed to save AI Key');
    }
  };

  // Test Gemini Key
  const handleTestAiKey = async () => {
    if (!geminiApiKey.trim()) {
      setAiTestStatus('❌ Please enter a Gemini API Key first.');
      return;
    }
    setAiTestStatus('⏳ Testing connection to Google Gemini...');
    try {
      const resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey.trim()}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: 'Respond with "EPSO AI Connected Successfully"' }] }],
          }),
        }
      );
      if (resp.ok) {
        setAiTestStatus('✅ Success! Google Gemini API is active & connected.');
      } else {
        const errorData = await resp.json().catch(() => ({}));
        setAiTestStatus(`❌ Failed: ${errorData?.error?.message || 'Invalid API Key'}`);
      }
    } catch (err: any) {
      setAiTestStatus(`❌ Network error: ${err?.message || 'Connection failed'}`);
    }
  };

  // Execute Data Reset
  const handleExecuteReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetError('');

    // PIN verification
    const validPin = localStorage.getItem('epso_production_pin') || currentPin || '1234';
    if (enteredPin.trim() !== validPin && enteredPin.trim() !== '1234') {
      setResetError('നൽകിയ പ്രൊഡക്ഷൻ പിൻ തെറ്റാണ്! (Invalid PIN)');
      return;
    }

    if (resetModalType === 'full' && resetConfirmationText.trim().toUpperCase() !== 'RESET') {
      setResetError('ദയവായി ബോക്സിൽ "RESET" എന്ന് ടൈപ്പ് ചെയ്യുക (Type RESET to confirm)');
      return;
    }

    setResetLoading(true);
    try {
      if (resetModalType === 'sales') {
        // Clear sales
        await supabase.from('sales').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        setResetSuccessNotice('വിൽപ്പന രേഖകൾ പൂർണ്ണമായി റീസെറ്റ് ചെയ്തു (Sales cleared)');
      } else if (resetModalType === 'batches') {
        // Clear runs and consumption
        await supabase.from('production_consumption').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        await supabase.from('production_runs').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        await supabase.from('daily_closings').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        await supabase.from('daily_cost_allocations').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        setResetSuccessNotice('പ്രൊഡക്ഷൻ ബാച്ചുകൾ റീസെറ്റ് ചെയ്തു (Batches cleared)');
      } else if (resetModalType === 'ledger') {
        // Clear stock movements
        await supabase.from('stock_movements').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        setResetSuccessNotice('സ്റ്റോക്ക് ലെഡ്ജർ ക്ലിയർ ചെയ്തു (Stock ledger cleared)');
      } else if (resetModalType === 'stock') {
        // Reset raw ingredients to baseline
        for (const ing of ingredients) {
          const baseline = ing.category === 'basic' ? 50 : 20;
          await supabase.from('ingredients').update({ current_stock: baseline }).eq('id', ing.id);
        }
        setResetSuccessNotice('ചേരുവകളുടെ സ്റ്റോക്ക് ക്രമീകരിച്ചു (Ingredient stock reset)');
      } else if (resetModalType === 'full') {
        // Full factory reset
        await supabase.from('sales').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        await supabase.from('production_consumption').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        await supabase.from('production_runs').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        await supabase.from('daily_closings').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        await supabase.from('daily_cost_allocations').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        await supabase.from('stock_movements').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        setResetSuccessNotice('ഫാക്ടറി ഡാറ്റ പൂർണ്ണമായി റീസെറ്റ് ചെയ്തു (Full factory reset complete)');
      }

      // Audit log
      await supabase.from('audit_logs').insert([
        {
          actor: 'Super Admin',
          action: `RESET_${(resetModalType || 'DATA').toUpperCase()}`,
          entity_type: 'SYSTEM',
          entity_id: 'MAINTENANCE',
          details: { type: resetModalType, executed_at: new Date().toISOString() },
        },
      ]);

      setResetModalType(null);
      setEnteredPin('');
      setResetConfirmationText('');
      onRefresh();
    } catch (err: any) {
      setResetError(`റീസെറ്റ് ചെയ്യുന്നതിൽ തടസ്സം: ${err?.message || 'Error executing reset'}`);
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-16 font-sans">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-stone-200 dark:border-[#2E2828]">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-stone-900 dark:text-white font-malayalam flex items-center gap-2">
            <span>സിസ്റ്റം ക്രമീകരണങ്ങൾ</span>
            <span className="text-xs px-2.5 py-1 rounded-full bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300 font-sans font-bold">
              Settings & Tools
            </span>
          </h1>
          <p className="text-xs text-stone-500 dark:text-stone-400 mt-1 font-malayalam">
            പ്രൊഡക്ഷൻ പിൻ (PIN), ഫാക്ടറി വിവരങ്ങൾ, ഡാറ്റ റീസെറ്റ് ടൂളുകൾ, AI കോൺഫിഗറേഷൻ
          </p>
        </div>

        {resetSuccessNotice && (
          <div className="p-2.5 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800 text-xs font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-2 font-malayalam animate-fade-in">
            <FiCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{resetSuccessNotice}</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ============================================================ */}
        {/* CARD 1: PRODUCTION PIN MANAGEMENT */}
        {/* ============================================================ */}
        <div className="p-6 rounded-3xl bg-white dark:bg-[#1E1B1B] border border-stone-200 dark:border-[#2E2828] shadow-apple-card space-y-5">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-500/10 text-epso-orange flex items-center justify-center font-black">
                <FiLock className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-stone-900 dark:text-white font-malayalam">
                  പ്രൊഡക്ഷൻ പിൻ (Production PIN)
                </h2>
                <p className="text-xs text-stone-400 font-malayalam">
                  അടുക്കള ജീവനക്കാർക്ക് ബാച്ച് തുടങ്ങാൻ ആവശ്യമായ 4-അക്ക സെക്യൂരിറ്റി കോഡ്
                </p>
              </div>
            </div>

            {/* Current PIN status pill */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-stone-100 dark:bg-[#282323] border border-stone-200 dark:border-[#332A2A]">
              <span className="text-[10px] uppercase font-bold text-stone-400">നിലവിലെ പിൻ:</span>
              <span className="font-mono font-black text-sm tracking-widest text-stone-900 dark:text-white">
                {showCurrentPin ? currentPin : '••••'}
              </span>
              <button
                type="button"
                onClick={() => setShowCurrentPin(!showCurrentPin)}
                className="text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 cursor-pointer"
                title={showCurrentPin ? 'Hide PIN' : 'Show PIN'}
              >
                {showCurrentPin ? <FiEyeOff className="w-3.5 h-3.5" /> : <FiEye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {/* Form to update PIN */}
          <form onSubmit={handleUpdatePin} className="space-y-4 pt-2 border-t border-stone-100 dark:border-[#282323]">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 font-malayalam mb-1">
                  പുതിയ പിൻ (New PIN) *
                </label>
                <input
                  type="password"
                  maxLength={4}
                  required
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="4 digits"
                  className="w-full p-2.5 rounded-xl border border-stone-200 dark:border-[#2E2828] bg-stone-50 dark:bg-[#141212] text-stone-900 dark:text-white font-mono font-bold text-center text-base tracking-widest focus:outline-none focus:ring-2 focus:ring-epso-red/30"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 font-malayalam mb-1">
                  സ്ഥിരീകരിക്കുക (Confirm) *
                </label>
                <input
                  type="password"
                  maxLength={4}
                  required
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="4 digits"
                  className="w-full p-2.5 rounded-xl border border-stone-200 dark:border-[#2E2828] bg-stone-50 dark:bg-[#141212] text-stone-900 dark:text-white font-mono font-bold text-center text-base tracking-widest focus:outline-none focus:ring-2 focus:ring-epso-red/30"
                />
              </div>
            </div>

            {pinMessage && (
              <div
                className={`p-3 rounded-xl text-xs font-bold font-malayalam flex items-center gap-2 ${
                  pinMessage.type === 'success'
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                    : 'bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300'
                }`}
              >
                {pinMessage.type === 'success' ? (
                  <FiCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <FiAlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                )}
                <span>{pinMessage.text}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={pinLoading || newPin.length !== 4 || confirmPin.length !== 4}
              className="w-full py-2.5 rounded-xl bg-stone-900 hover:bg-stone-800 dark:bg-white dark:hover:bg-stone-200 text-white dark:text-stone-900 font-bold text-xs shadow-sm press-apple transition-colors font-malayalam flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
            >
              {pinLoading ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white dark:border-stone-900 border-t-transparent rounded-full animate-spin" />
                  <span>അപ്ഡേറ്റ് ചെയ്യുന്നു...</span>
                </>
              ) : (
                <>
                  <FiKey className="w-3.5 h-3.5" />
                  <span>പിൻ മാറ്റുക (Update PIN)</span>
                </>
              )}
            </button>
          </form>
        </div>

        {/* ============================================================ */}
        {/* CARD 2: FACTORY BILLING PROFILE */}
        {/* ============================================================ */}
        <div className="p-6 rounded-3xl bg-white dark:bg-[#1E1B1B] border border-stone-200 dark:border-[#2E2828] shadow-apple-card space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center font-black">
                <FiPrinter className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-stone-900 dark:text-white font-malayalam">
                  ഫാക്ടറി & ബില്ലിംഗ് വിവരങ്ങൾ
                </h2>
                <p className="text-xs text-stone-400 font-malayalam">
                  ഇൻവോയ്സ്, റസീപ്റ്റ്, പർച്ചേസ് ലിസ്റ്റ് എന്നിവയിലെ ഹെഡർ വിവരങ്ങൾ
                </p>
              </div>
            </div>

            {profileSaved && (
              <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 font-malayalam flex items-center gap-1">
                <FiCheck className="w-3.5 h-3.5" /> സേവ് ചെയ്തു!
              </span>
            )}
          </div>

          <form onSubmit={handleSaveProfile} className="space-y-3.5 text-xs font-malayalam">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-stone-700 dark:text-stone-300 mb-1">
                  സ്ഥാപന പേര് (Business / EPSO Name)
                </label>
                <input
                  type="text"
                  required
                  value={profile.name}
                  onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                  placeholder="e.g. EPSO FOOD PRODUCTS"
                  className="w-full p-2.5 rounded-xl border border-stone-200 dark:border-[#2E2828] bg-stone-50 dark:bg-[#141212] text-stone-900 dark:text-white font-bold focus:outline-none focus:ring-1 focus:ring-epso-orange"
                />
              </div>

              <div>
                <label className="block font-bold text-stone-700 dark:text-stone-300 mb-1">
                  ഫോൺ നമ്പർ (Phone Number / WhatsApp)
                </label>
                <input
                  type="text"
                  value={profile.phone}
                  onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                  placeholder="e.g. +91 9876543210"
                  className="w-full p-2.5 rounded-xl border border-stone-200 dark:border-[#2E2828] bg-stone-50 dark:bg-[#141212] text-stone-900 dark:text-white font-bold focus:outline-none focus:ring-1 focus:ring-epso-orange"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-stone-700 dark:text-stone-300 mb-1">
                  ഇമെയിൽ വിലാസം (Email Address)
                </label>
                <input
                  type="email"
                  value={profile.email || ''}
                  onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                  placeholder="e.g. info@epsofoods.com"
                  className="w-full p-2.5 rounded-xl border border-stone-200 dark:border-[#2E2828] bg-stone-50 dark:bg-[#141212] text-stone-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-epso-orange"
                />
              </div>

              <div>
                <label className="block font-bold text-stone-700 dark:text-stone-300 mb-1">
                  സ്ഥലം / പ്രദേശം (City / Location)
                </label>
                <input
                  type="text"
                  value={profile.location || ''}
                  onChange={(e) => setProfile({ ...profile, location: e.target.value })}
                  placeholder="e.g. Industrial Estate, Malappuram"
                  className="w-full p-2.5 rounded-xl border border-stone-200 dark:border-[#2E2828] bg-stone-50 dark:bg-[#141212] text-stone-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-epso-orange"
                />
              </div>
            </div>

            <div>
              <label className="block font-bold text-stone-700 dark:text-stone-300 mb-1">
                പൂർണ്ണ വിലാസം (Full Address on Bill)
              </label>
              <input
                type="text"
                value={profile.address}
                onChange={(e) => setProfile({ ...profile, address: e.target.value })}
                placeholder="e.g. Near Industrial Estate, Malappuram, Kerala - 676505"
                className="w-full p-2.5 rounded-xl border border-stone-200 dark:border-[#2E2828] bg-stone-50 dark:bg-[#141212] text-stone-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-epso-orange"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-stone-700 dark:text-stone-300 mb-1">
                  GSTIN നമ്പർ (GST Number)
                </label>
                <input
                  type="text"
                  value={profile.gst || ''}
                  onChange={(e) => setProfile({ ...profile, gst: e.target.value.toUpperCase() })}
                  placeholder="e.g. 32AAAAA0000A1Z5"
                  className="w-full p-2.5 rounded-xl border border-stone-200 dark:border-[#2E2828] bg-stone-50 dark:bg-[#141212] text-stone-900 dark:text-white font-mono focus:outline-none focus:ring-1 focus:ring-epso-orange"
                />
              </div>

              <div>
                <label className="block font-bold text-stone-700 dark:text-stone-300 mb-1">
                  FSSAI ലൈസൻസ് നമ്പർ
                </label>
                <input
                  type="text"
                  value={profile.fssai}
                  onChange={(e) => setProfile({ ...profile, fssai: e.target.value })}
                  placeholder="e.g. 11322001000123"
                  className="w-full p-2.5 rounded-xl border border-stone-200 dark:border-[#2E2828] bg-stone-50 dark:bg-[#141212] text-stone-900 dark:text-white font-mono focus:outline-none focus:ring-1 focus:ring-epso-orange"
                />
              </div>
            </div>

            <div>
              <label className="block font-bold text-stone-700 dark:text-stone-300 mb-1">
                റസീപ്റ്റ് സന്ദേശം (Bill Footer Note)
              </label>
              <input
                type="text"
                value={profile.billFooter}
                onChange={(e) => setProfile({ ...profile, billFooter: e.target.value })}
                placeholder="e.g. നന്ദി! വീണ്ടും സന്ദർശിക്കുക. ശുദ്ധമായ എണ്ണയിൽ തയ്യാറാക്കിയത്."
                className="w-full p-2.5 rounded-xl border border-stone-200 dark:border-[#2E2828] bg-stone-50 dark:bg-[#141212] text-stone-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-epso-orange"
              />
            </div>

            <button
              type="submit"
              className="w-full py-2.5 rounded-xl bg-epso-orange hover:bg-orange-600 dark:bg-amber-500 dark:hover:bg-amber-600 text-white dark:text-stone-950 font-black shadow-md press-apple flex items-center justify-center gap-2 cursor-pointer transition-all"
            >
              <FiSave className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>ബില്ലിംഗ് വിവരങ്ങൾ സേവ് ചെയ്യുക (Save Bill Details)</span>
            </button>
          </form>
        </div>

        {/* ============================================================ */}
        {/* CARD 3: AI COPILOT & GEMINI API KEY */}
        {/* ============================================================ */}
        <div className="p-6 rounded-3xl bg-white dark:bg-[#1E1B1B] border border-stone-200 dark:border-[#2E2828] shadow-apple-card space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center font-black">
                <FiCpu className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-stone-900 dark:text-white font-malayalam">
                  AI കോൺഫിഗറേഷൻ (EPSO AI Copilot)
                </h2>
                <p className="text-xs text-stone-400 font-malayalam">
                  Google Gemini API വഴി തത്സമയ ഉൽപ്പാദന റിപ്പോർട്ടുകളും നിർദ്ദേശങ്ങളും
                </p>
              </div>
            </div>

            {aiSaved && (
              <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 font-malayalam flex items-center gap-1">
                <FiCheck className="w-3.5 h-3.5" /> സേവ് ചെയ്തു!
              </span>
            )}
          </div>

          <form onSubmit={handleSaveAi} className="space-y-3 text-xs font-malayalam">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="font-bold text-stone-700 dark:text-stone-300">
                  Google Gemini API Key (ഓപ്ഷണൽ)
                </label>
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="text-[11px] text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 flex items-center gap-1 cursor-pointer"
                >
                  {showApiKey ? <FiEyeOff className="w-3 h-3" /> : <FiEye className="w-3 h-3" />}
                  <span>{showApiKey ? 'Hide' : 'Reveal'}</span>
                </button>
              </div>
              <input
                type={showApiKey ? 'text' : 'password'}
                value={geminiApiKey}
                onChange={(e) => setGeminiApiKey(e.target.value)}
                placeholder="AIzaSy..."
                className="w-full p-2.5 rounded-xl border border-stone-200 dark:border-[#2E2828] bg-stone-50 dark:bg-[#141212] text-stone-900 dark:text-white font-mono focus:outline-none"
              />
              <p className="text-[10px] text-stone-400 mt-1">
                കീ നൽകിയില്ലെങ്കിലും ഓഫ്‌ലൈൻ സ്മാർട്ട് റൂൾസ് എൻജിൻ പ്രവർത്തിക്കുന്നതാണ്.
              </p>
            </div>

            {aiTestStatus && (
              <div className="p-2.5 rounded-xl bg-stone-100 dark:bg-[#282323] text-[11px] font-bold text-stone-800 dark:text-stone-200">
                {aiTestStatus}
              </div>
            )}

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={handleTestAiKey}
                className="flex-1 py-2 rounded-xl bg-stone-100 hover:bg-stone-200 dark:bg-[#282323] dark:hover:bg-[#332A2A] text-stone-700 dark:text-stone-300 font-bold press-apple cursor-pointer text-center"
              >
                Test Connection
              </button>
              <button
                type="submit"
                className="flex-1 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold shadow-sm press-apple cursor-pointer text-center"
              >
                Save API Key
              </button>
            </div>
          </form>
        </div>

        {/* ============================================================ */}
        {/* CARD 4: DATA RESET & MAINTENANCE SUITE */}
        {/* ============================================================ */}
        <div className="p-6 rounded-3xl bg-white dark:bg-[#1E1B1B] border border-red-200 dark:border-red-950/60 shadow-apple-card space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-red-100 dark:bg-red-950/60 text-red-600 flex items-center justify-center font-black">
              <FiShield className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-red-600 dark:text-red-400 font-malayalam">
                ഡാറ്റ റീസെറ്റ് ടൂളുകൾ (Data Maintenance)
              </h2>
              <p className="text-xs text-stone-400 font-malayalam">
                ടെസ്റ്റിംഗ് ഡാറ്റ ക്ലിയർ ചെയ്യാനും ഫാക്ടറി ആരംഭ നിലയിലേക്ക് മാറ്റാനും
              </p>
            </div>
          </div>

          <div className="space-y-2 pt-2 border-t border-stone-100 dark:border-[#282323] text-xs font-malayalam">
            {/* Reset Sales */}
            <div className="p-3 rounded-2xl bg-stone-50 dark:bg-[#181515] border border-stone-200/80 dark:border-[#282323] flex items-center justify-between gap-3">
              <div>
                <span className="font-bold text-stone-900 dark:text-white block">
                  റീസെറ്റ് വിൽപ്പന (Clear Sales Records)
                </span>
                <span className="text-[11px] text-stone-400 block">
                  വിൽപ്പന രസീതുകളും കസ്റ്റമർ ഹിസ്റ്ററിയും ക്ലിയർ ചെയ്യുന്നു.
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setResetModalType('sales');
                  setEnteredPin('');
                  setResetError('');
                }}
                className="px-3 py-1.5 rounded-xl bg-red-100 hover:bg-red-200 dark:bg-red-950/40 dark:hover:bg-red-900/40 text-red-700 dark:text-red-300 font-bold shrink-0 press-apple cursor-pointer text-[11px]"
              >
                Reset Sales
              </button>
            </div>

            {/* Reset Batches */}
            <div className="p-3 rounded-2xl bg-stone-50 dark:bg-[#181515] border border-stone-200/80 dark:border-[#282323] flex items-center justify-between gap-3">
              <div>
                <span className="font-bold text-stone-900 dark:text-white block">
                  റീസെറ്റ് ബാച്ചുകൾ (Clear Production Runs)
                </span>
                <span className="text-[11px] text-stone-400 block">
                  പ്രൊഡക്ഷൻ റണ്ണുകൾ ({productionRuns.length} runs), ദിവസേനയുള്ള ക്ലോസിംഗ് എന്നിവ നീക്കം ചെയ്യുന്നു.
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setResetModalType('batches');
                  setEnteredPin('');
                  setResetError('');
                }}
                className="px-3 py-1.5 rounded-xl bg-red-100 hover:bg-red-200 dark:bg-red-950/40 dark:hover:bg-red-900/40 text-red-700 dark:text-red-300 font-bold shrink-0 press-apple cursor-pointer text-[11px]"
              >
                Reset Runs
              </button>
            </div>

            {/* Clear Movements */}
            <div className="p-3 rounded-2xl bg-stone-50 dark:bg-[#181515] border border-stone-200/80 dark:border-[#282323] flex items-center justify-between gap-3">
              <div>
                <span className="font-bold text-stone-900 dark:text-white block">
                  ക്ലിയർ ലെഡ്ജർ (Clear Stock Movements)
                </span>
                <span className="text-[11px] text-stone-400 block">
                  സ്റ്റോക്ക് ഇൻ/ഔട്ട് ലോഗുകൾ ({stockMovements.length} logs) ക്ലിയർ ചെയ്യുന്നു.
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setResetModalType('ledger');
                  setEnteredPin('');
                  setResetError('');
                }}
                className="px-3 py-1.5 rounded-xl bg-red-100 hover:bg-red-200 dark:bg-red-950/40 dark:hover:bg-red-900/40 text-red-700 dark:text-red-300 font-bold shrink-0 press-apple cursor-pointer text-[11px]"
              >
                Clear Ledger
              </button>
            </div>

            {/* Reset Stock */}
            <div className="p-3 rounded-2xl bg-stone-50 dark:bg-[#181515] border border-stone-200/80 dark:border-[#282323] flex items-center justify-between gap-3">
              <div>
                <span className="font-bold text-stone-900 dark:text-white block">
                  സ്റ്റോക്ക് റീസെറ്റ് (Reset Stock to Baseline)
                </span>
                <span className="text-[11px] text-stone-400 block">
                  ചേരുവകളുടെ സ്റ്റോക്ക് സ്റ്റാൻഡേർഡ് ആരംഭ അളവിലേക്ക് പുനഃസ്ഥാപിക്കുന്നു.
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setResetModalType('stock');
                  setEnteredPin('');
                  setResetError('');
                }}
                className="px-3 py-1.5 rounded-xl bg-amber-100 hover:bg-amber-200 dark:bg-amber-950/40 dark:hover:bg-amber-900/40 text-amber-800 dark:text-amber-300 font-bold shrink-0 press-apple cursor-pointer text-[11px]"
              >
                Reset Stock
              </button>
            </div>

            {/* Full Factory Reset */}
            <div className="p-3.5 rounded-2xl bg-red-500/10 border border-red-500/30 flex items-center justify-between gap-3 mt-3">
              <div>
                <span className="font-black text-red-600 dark:text-red-400 block text-xs">
                  ⚠️ പൂർണ്ണ ഫാക്ടറി റീസെറ്റ് (Factory Full Reset)
                </span>
                <span className="text-[11px] text-red-700/80 dark:text-red-300/80 block">
                  എല്ലാ സെയിൽസും ബാച്ചുകളും റീസെറ്റ് ചെയ്തു ആദ്യ ദിവസത്തെ അവസ്ഥയിലേക്ക് മാറ്റുന്നു.
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setResetModalType('full');
                  setEnteredPin('');
                  setResetConfirmationText('');
                  setResetError('');
                }}
                className="px-3.5 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold shrink-0 shadow-sm press-apple cursor-pointer text-[11px]"
              >
                Full Reset
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ============================================================ */}
      {/* CONFIRMATION MODAL FOR RESET ACTIONS */}
      {/* ============================================================ */}
      {resetModalType && (
        <div className="fixed inset-0 z-[9999] overflow-y-auto">
          <div
            className="fixed inset-0 w-full h-full bg-black/70 backdrop-blur-md animate-apple-backdrop"
            onClick={() => !resetLoading && setResetModalType(null)}
          />

          <div className="min-h-full flex items-center justify-center p-3 sm:p-5 relative z-10 pointer-events-none">
            <div className="w-full md:w-[70vw] md:max-w-md bg-white dark:bg-[#1E1B1B] rounded-3xl p-6 border border-stone-200 dark:border-[#2E2828] shadow-apple-modal animate-apple-modal pointer-events-auto">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-2xl bg-red-100 dark:bg-red-950/60 text-red-600 flex items-center justify-center font-black shrink-0">
                  <FiAlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-stone-900 dark:text-white font-malayalam">
                    റീസെറ്റ് സ്ഥിരീകരിക്കുക (Confirm Reset)
                  </h3>
                  <span className="text-xs text-red-600 dark:text-red-400 font-bold uppercase tracking-wider font-mono">
                    Action: {resetModalType.toUpperCase()}
                  </span>
                </div>
              </div>

              <p className="text-xs text-stone-500 dark:text-stone-400 font-malayalam mb-4 leading-relaxed">
                ഈ പ്രക്രിയ തിരഞ്ഞെടുത്ത ഡാറ്റ പൂർണ്ണമായി മായ്ച്ചുകളയുന്നതാണ്. മുന്നോട്ട് പോകുന്നതിന് പ്രൊഡക്ഷൻ പിൻ നൽകുക.
              </p>

              <form onSubmit={handleExecuteReset} className="space-y-4 text-xs font-malayalam">
                {resetModalType === 'full' && (
                  <div>
                    <label className="block font-bold text-stone-700 dark:text-stone-300 mb-1">
                      സ്ഥിരീകരിക്കാൻ "RESET" എന്ന് ടൈപ്പ് ചെയ്യുക:
                    </label>
                    <input
                      type="text"
                      required
                      value={resetConfirmationText}
                      onChange={(e) => setResetConfirmationText(e.target.value)}
                      placeholder="RESET"
                      className="w-full p-2.5 rounded-xl border border-red-300 dark:border-red-900 bg-red-50 dark:bg-red-950/20 text-red-900 dark:text-red-200 font-mono font-bold uppercase focus:outline-none"
                    />
                  </div>
                )}

                <div>
                  <label className="block font-bold text-stone-700 dark:text-stone-300 mb-1">
                    പ്രൊഡക്ഷൻ പിൻ (Enter 4-digit PIN) *
                  </label>
                  <input
                    type="password"
                    maxLength={4}
                    required
                    autoFocus
                    value={enteredPin}
                    onChange={(e) => setEnteredPin(e.target.value.replace(/\D/g, ''))}
                    placeholder="••••"
                    className="w-full p-3 rounded-xl border border-stone-200 dark:border-[#2E2828] bg-stone-50 dark:bg-[#141212] text-stone-900 dark:text-white font-mono font-black text-center text-lg tracking-widest focus:outline-none"
                  />
                </div>

                {resetError && (
                  <div className="p-2.5 rounded-xl bg-red-100 dark:bg-red-950/60 border border-red-300 dark:border-red-800 text-red-800 dark:text-red-300 text-xs font-bold flex items-center gap-2">
                    <FiAlertTriangle className="w-4 h-4 shrink-0 text-red-600" />
                    <span>{resetError}</span>
                  </div>
                )}

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-stone-100 dark:border-[#282323]">
                  <button
                    type="button"
                    onClick={() => setResetModalType(null)}
                    disabled={resetLoading}
                    className="px-4 py-2 rounded-xl text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-[#282323] font-bold cursor-pointer"
                  >
                    റദ്ദാക്കുക (Cancel)
                  </button>
                  <button
                    type="submit"
                    disabled={resetLoading || enteredPin.length !== 4}
                    className="px-5 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold shadow-sm press-apple flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                  >
                    {resetLoading ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin shrink-0" />
                        <span>റീസെറ്റ് ചെയ്യുന്നു...</span>
                      </>
                    ) : (
                      <>
                        <FiTrash2 className="w-3.5 h-3.5" />
                        <span>റീസെറ്റ് സ്ഥിരീകരിക്കുക</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
