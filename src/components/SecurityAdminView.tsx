import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { AuditLog } from '../types';
import {
  ShieldCheck,
  KeyRound,
  Database,
  Lock,
  CheckCircle2,
  AlertCircle,
  Server,
  RefreshCw,
} from 'lucide-react';

interface SecurityAdminViewProps {
  auditLogs: AuditLog[];
  onRefresh: () => void;
}

export const SecurityAdminView: React.FC<SecurityAdminViewProps> = ({
  auditLogs,
  onRefresh,
}) => {
  const { changePin } = useAuth();

  const [oldPin, setOldPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleChangePin = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMsg(null);

    if (oldPin.length < 4 || newPin.length < 4) {
      setStatusMsg({ type: 'error', text: 'പിൻ കുറഞ്ഞത് 5 അക്കങ്ങൾ ഉണ്ടായിരിക്കണം (PIN must be at least 5 digits)' });
      return;
    }

    if (newPin !== confirmPin) {
      setStatusMsg({ type: 'error', text: 'പുതിയ പിൻ സ്ഥിരീകരണം ഒത്തുപോകുന്നില്ല (New PINs do not match)' });
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await changePin(oldPin, newPin);
      if (res.success) {
        setStatusMsg({
          type: 'success',
          text: 'അഡ്മിൻ പിൻ വിജയകരമായി മാറ്റി! (PIN updated successfully on Supabase)',
        });
        setOldPin('');
        setNewPin('');
        setConfirmPin('');
        onRefresh();
      } else {
        setStatusMsg({
          type: 'error',
          text: res.error || 'പിൻ മാറ്റുന്നതിൽ പരാജയപ്പെട്ടു (Failed to update PIN)',
        });
      }
    } catch (err: any) {
      setStatusMsg({
        type: 'error',
        text: err?.message || 'സെർവർ കണക്ഷൻ പിഴവ് (Connection error)',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-stone-200 dark:border-[#2E2828]">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-stone-900 dark:text-white font-malayalam">
            സുരക്ഷ & അഡ്മിൻ പിൻ ക്രമീകരണങ്ങൾ
          </h1>
          <p className="text-xs sm:text-sm text-stone-500 dark:text-stone-400 font-malayalam mt-0.5">
            5 അക്ക പാസ്‌വേഡ് മാറ്റുക, സുപാബേസ് ഡാറ്റാബേസ് കണക്ഷൻ നില പരിശോധിക്കുക
          </p>
        </div>
        <button
          onClick={onRefresh}
          className="flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-stone-100 hover:bg-stone-200 dark:bg-[#282323] dark:hover:bg-[#322c2c] text-stone-700 dark:text-stone-300 font-bold text-xs press-apple transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span className="font-malayalam">പുതുക്കുക</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Change Admin PIN Form */}
        <div className="p-6 rounded-2xl bg-white dark:bg-[#1E1B1B] border border-stone-200 dark:border-[#2E2828] shadow-apple-card dark:shadow-apple-card-dark">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="p-2 rounded-xl bg-red-50 dark:bg-red-950/40 text-epso-red dark:text-amber-400">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-stone-900 dark:text-white font-malayalam">
                അഡ്മിൻ പിൻ മാറ്റുക (Change PIN)
              </h2>
              <p className="text-xs text-stone-500 dark:text-stone-400 font-malayalam">
                നിലവിലെ പിൻ നൽകി പുതിയ 5 അക്ക പിൻ നിശ്ചയിക്കുക
              </p>
            </div>
          </div>

          {statusMsg && (
            <div
              className={`p-3 rounded-xl mb-4 text-xs flex items-center gap-2 border font-malayalam ${
                statusMsg.type === 'success'
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800'
                  : 'bg-red-50 text-red-800 border-red-200 dark:bg-red-950/40 dark:text-red-400 dark:border-red-900'
              }`}
            >
              {statusMsg.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0" />
              )}
              <span>{statusMsg.text}</span>
            </div>
          )}

          <form onSubmit={handleChangePin} className="space-y-4 text-xs">
            <div>
              <label className="block font-bold text-stone-700 dark:text-stone-300 font-malayalam mb-1">
                നിലവിലെ പിൻ (Current PIN) *
              </label>
              <input
                type="password"
                maxLength={8}
                required
                value={oldPin}
                onChange={(e) => setOldPin(e.target.value.replace(/\D/g, ''))}
                placeholder="നിലവിലെ 5 അക്ക പിൻ..."
                className="w-full p-2.5 rounded-xl border border-stone-200 dark:border-[#2E2828] bg-stone-50 dark:bg-[#141212] text-stone-900 dark:text-white font-mono text-center tracking-widest text-sm focus:outline-none focus:ring-2 focus:ring-epso-red/30"
              />
            </div>

            <div>
              <label className="block font-bold text-stone-700 dark:text-stone-300 font-malayalam mb-1">
                പുതിയ 5 അക്ക പിൻ (New 5-digit PIN) *
              </label>
              <input
                type="password"
                maxLength={8}
                required
                value={newPin}
                onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
                placeholder="പുതിയ പിൻ..."
                className="w-full p-2.5 rounded-xl border border-stone-200 dark:border-[#2E2828] bg-stone-50 dark:bg-[#141212] text-stone-900 dark:text-white font-mono text-center tracking-widest text-sm focus:outline-none focus:ring-2 focus:ring-epso-red/30"
              />
            </div>

            <div>
              <label className="block font-bold text-stone-700 dark:text-stone-300 font-malayalam mb-1">
                പുതിയ പിൻ വീണ്ടും നൽകുക (Confirm New PIN) *
              </label>
              <input
                type="password"
                maxLength={8}
                required
                value={confirmPin}
                onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))}
                placeholder="സ്ഥിരീകരിക്കുക..."
                className="w-full p-2.5 rounded-xl border border-stone-200 dark:border-[#2E2828] bg-stone-50 dark:bg-[#141212] text-stone-900 dark:text-white font-mono text-center tracking-widest text-sm focus:outline-none focus:ring-2 focus:ring-epso-red/30"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting || !oldPin || !newPin || !confirmPin}
              className="w-full py-2.5 rounded-xl bg-epso-red hover:bg-epso-red-hover dark:bg-amber-500 dark:hover:bg-amber-600 text-white dark:text-stone-950 font-bold text-xs shadow-sm press-apple transition-colors font-malayalam"
            >
              {isSubmitting ? 'അപ്ഡേറ്റ് ചെയ്യുന്നു...' : 'പിൻ മാറ്റുക (Save New PIN)'}
            </button>
          </form>
        </div>

        {/* Database & Security Architecture Card */}
        <div className="p-6 rounded-2xl bg-white dark:bg-[#1E1B1B] border border-stone-200 dark:border-[#2E2828] shadow-apple-card dark:shadow-apple-card-dark space-y-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-stone-900 dark:text-white font-malayalam">
                സുപാബേസ് ഡാറ്റാബേസ് നില
              </h2>
              <p className="text-xs text-stone-500 dark:text-stone-400 font-malayalam">
                PostgreSQL ക്ലൗഡ് ഇന്റഗ്രേഷൻ
              </p>
            </div>
          </div>

          <div className="p-3.5 bg-stone-50 dark:bg-[#141212] rounded-xl border border-stone-200 dark:border-[#2E2828] space-y-2 text-xs">
            <div className="flex justify-between items-center">
              <span className="text-stone-500 dark:text-stone-400">Database Engine:</span>
              <span className="font-bold text-stone-900 dark:text-white">PostgreSQL 17.11 (Supabase)</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-stone-500 dark:text-stone-400">Instance Ref:</span>
              <span className="font-mono text-emerald-600 dark:text-emerald-400 font-bold">brskubbgvxtzvhncjnle</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-stone-500 dark:text-stone-400">Security Definer:</span>
              <span className="text-stone-700 dark:text-stone-300 font-semibold">Bcrypt Hashing (10 rounds)</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-stone-500 dark:text-stone-400">VPS Migration:</span>
              <span className="text-emerald-600 dark:text-emerald-400 font-semibold">Standard SQL (Fully Portable)</span>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-stone-100/70 dark:bg-[#282323] text-xs text-stone-600 dark:text-stone-400 font-malayalam leading-relaxed">
            <span className="font-bold block mb-1 text-stone-900 dark:text-white">
              സവിശേഷതകൾ:
            </span>
            • അടുക്കളയിലെ പാചകക്കാർക്ക് ചേരുവകളും ഉൽപ്പന്നങ്ങളും മാറ്റാമെങ്കിലും മൊത്ത വിൽപ്പന വില (Wholesale Price) കാണാനോ മാറ്റാനോ കഴിയില്ല.
            <br />
            • അഡ്മിൻ ഇവിടെ മാറ്റം വരുത്തുമ്പോൾ തത്സമയം സുപാബേസ് വഴി അടുക്കള PWA-യിലും പ്രതിഫലിക്കും.
          </div>
        </div>
      </div>

      {/* Audit Logs Table */}
      <div className="p-6 rounded-2xl bg-white dark:bg-[#1E1B1B] border border-stone-200 dark:border-[#2E2828] shadow-apple-card dark:shadow-apple-card-dark">
        <h2 className="text-sm font-bold text-stone-900 dark:text-white font-malayalam mb-3">
          സുരക്ഷാ ഓഡിറ്റ് ലോഗുകൾ (Security & Audit Trail)
        </h2>

        {auditLogs.length === 0 ? (
          <div className="py-6 text-center text-xs text-stone-400 dark:text-stone-500 font-malayalam">
            ഓഡിറ്റ് ലോഗുകൾ ഒന്നും ലഭ്യമല്ല
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-stone-100 dark:border-[#2E2828] text-stone-400 font-semibold">
                  <th className="py-2 px-3">ഉപയോക്താവ് (Actor)</th>
                  <th className="py-2 px-3">പ്രവർത്തനം (Action)</th>
                  <th className="py-2 px-3">വിഭാഗം (Category)</th>
                  <th className="py-2 px-3">തീയതി & സമയം</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 dark:divide-[#2E2828]/50">
                {auditLogs.slice(0, 10).map((log) => (
                  <tr key={log.id} className="hover:bg-stone-50 dark:hover:bg-[#282323]">
                    <td className="py-2.5 px-3 font-semibold text-stone-900 dark:text-white">
                      {log.actor}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-emerald-600 dark:text-amber-400">
                      {log.action}
                    </td>
                    <td className="py-2.5 px-3 text-stone-500 dark:text-stone-400">
                      {log.entityType}
                    </td>
                    <td className="py-2.5 px-3 text-stone-400">
                      {new Date(log.createdAt).toLocaleDateString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
