import React, { useState, useEffect } from 'react';
import { FiLock, FiX, FiCheck, FiAlertCircle } from 'react-icons/fi';
import { supabase } from '../services/supabase';

interface ProductionPinModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ProductionPinModal: React.FC<ProductionPinModalProps> = ({ isOpen, onClose }) => {
  const [currentPin, setCurrentPin] = useState<string>('1234');
  const [newPin, setNewPin] = useState<string>('');
  const [confirmPin, setConfirmPin] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [successMsg, setSuccessMsg] = useState<string>('');

  useEffect(() => {
    if (isOpen) {
      setNewPin('');
      setConfirmPin('');
      setErrorMsg('');
      setSuccessMsg('');
      // Load current production pin
      const cached = localStorage.getItem('epso_production_pin');
      if (cached) setCurrentPin(cached);

      (async () => {
        try {
          const { data } = await supabase
            .from('audit_logs')
            .select('details')
            .eq('action', 'PRODUCTION_PIN_CHANGED')
            .order('created_at', { ascending: false })
            .limit(1);

          if (data && data.length > 0 && data[0].details?.pin) {
            setCurrentPin(String(data[0].details.pin));
            localStorage.setItem('epso_production_pin', String(data[0].details.pin));
          }
        } catch {
          // ignore error
        }
      })();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!/^\d{4}$/.test(newPin)) {
      setErrorMsg('പിൻ കൃത്യമായി 4 അക്കങ്ങൾ (0-9) ആയിരിക്കണം (PIN must be exactly 4 digits)');
      return;
    }

    if (newPin !== confirmPin) {
      setErrorMsg('നൽകിയ രണ്ട് പിന്നുകളും പൊരുത്തപ്പെടുന്നില്ല (PINs do not match)');
      return;
    }

    setIsLoading(true);
    try {
      // 1. Save to audit_logs so PWA and Admin sync across network
      await supabase.from('audit_logs').insert([
        {
          operator_name: 'Super Admin',
          action: 'PRODUCTION_PIN_CHANGED',
          entity_type: 'SECURITY',
          details: { pin: newPin, updated_at: new Date().toISOString() },
        },
      ]);

      // 2. Cache in localStorage
      localStorage.setItem('epso_production_pin', newPin);
      setCurrentPin(newPin);
      setSuccessMsg('പ്രൊഡക്ഷൻ പിൻ വിജയകരമായി മാറ്റി! (Production PIN updated successfully)');
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err: any) {
      // Offline fallback: still update localStorage
      localStorage.setItem('epso_production_pin', newPin);
      setCurrentPin(newPin);
      setSuccessMsg('പ്രൊഡക്ഷൻ പിൻ സേവ് ചെയ്തു! (PIN saved locally)');
      setTimeout(() => {
        onClose();
      }, 1500);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-sm bg-white dark:bg-[#1E1B1B] rounded-3xl p-6 border border-stone-200 dark:border-[#2E2828] shadow-apple-modal">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-red-50 dark:bg-amber-950/40 text-epso-red dark:text-amber-400">
              <FiLock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-stone-900 dark:text-white font-malayalam">
                പ്രൊഡക്ഷൻ പാസ്‌കോഡ്
              </h3>
              <p className="text-[11px] text-stone-400">Set Kitchen PWA PIN (4 Digits)</p>
            </div>
          </div>
          <button
            onClick={onClose}
            type="button"
            className="p-1.5 rounded-xl hover:bg-stone-100 dark:hover:bg-[#282323] text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 transition-colors"
          >
            <FiX className="w-4 h-4" />
          </button>
        </div>

        {/* Current Active PIN badge */}
        <div className="p-3 bg-stone-50 dark:bg-[#141212] rounded-2xl border border-stone-200/80 dark:border-[#282323] mb-4 flex items-center justify-between">
          <span className="text-xs text-stone-500 dark:text-stone-400 font-malayalam">
            നിലവിലെ പിൻ (Current PIN):
          </span>
          <span className="font-mono font-black text-sm text-epso-red dark:text-amber-400 tracking-widest bg-white dark:bg-[#1E1B1B] px-2.5 py-0.5 rounded-lg border border-stone-200 dark:border-[#2E2828]">
            {currentPin}
          </span>
        </div>

        {errorMsg && (
          <div className="p-3 mb-3 rounded-xl bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 text-xs flex items-center gap-2 border border-red-200 dark:border-red-900/60 font-malayalam">
            <FiAlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="p-3 mb-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 text-xs flex items-center gap-2 border border-emerald-200 dark:border-emerald-900/60 font-malayalam font-bold">
            <FiCheck className="w-4 h-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSave} className="space-y-3.5 text-xs">
          <div>
            <label className="block font-bold text-stone-700 dark:text-stone-300 font-malayalam mb-1">
              പുതിയ 4 അക്ക പിൻ (New 4-Digit PIN)
            </label>
            <input
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={4}
              required
              placeholder="e.g. 5678"
              value={newPin}
              onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              onFocus={(e) => e.target.select()}
              className="w-full p-2.5 rounded-xl border border-stone-200 dark:border-[#2E2828] bg-stone-50 dark:bg-[#141212] text-stone-900 dark:text-white font-mono text-center text-lg tracking-widest focus:outline-none focus:ring-2 focus:ring-epso-red/30"
            />
          </div>

          <div>
            <label className="block font-bold text-stone-700 dark:text-stone-300 font-malayalam mb-1">
              പിൻ വീണ്ടും നൽകുക (Confirm PIN)
            </label>
            <input
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={4}
              required
              placeholder="e.g. 5678"
              value={confirmPin}
              onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              onFocus={(e) => e.target.select()}
              className="w-full p-2.5 rounded-xl border border-stone-200 dark:border-[#2E2828] bg-stone-50 dark:bg-[#141212] text-stone-900 dark:text-white font-mono text-center text-lg tracking-widest focus:outline-none focus:ring-2 focus:ring-epso-red/30"
            />
          </div>

          <div className="flex items-center gap-2 pt-2 border-t border-stone-100 dark:border-[#282323]">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-[#282323] font-bold font-malayalam"
            >
              റദ്ദാക്കുക
            </button>
            <button
              type="submit"
              disabled={isLoading || newPin.length !== 4 || confirmPin.length !== 4}
              className="flex-1 py-2.5 rounded-xl bg-epso-red dark:bg-amber-500 hover:bg-epso-red-hover dark:hover:bg-amber-600 text-white dark:text-stone-950 font-bold font-malayalam shadow-sm press-apple disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'സേവ് ചെയ്യുന്നു...' : 'സേവ് ചെയ്യുക'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
