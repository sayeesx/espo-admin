import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  FiCalendar,
  FiSave,
  FiUsers,
  FiPackage,
  FiDollarSign,
  FiChevronDown,
  FiChevronUp,
  FiRefreshCw,
} from 'react-icons/fi';
import {
  fetchDailyWages,
  fetchDailyWage,
  saveDailyWage,
  fetchTotalPacketsForDate,
  fetchTotalProductionKgForDate,
} from '../services/supabase';
import { roundCurrency } from '../services/costing';
import { LoadingSpinner } from './LoadingSpinner';

interface WagesAdminViewProps {
  onRefresh: () => void;
}

export const WagesAdminView: React.FC<WagesAdminViewProps> = ({ onRefresh }) => {
  const [selectedDate, setSelectedDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  // Form state
  const [totalWageBudget, setTotalWageBudget] = useState<string>('4000');
  const [numCooks, setNumCooks] = useState<string>('2');
  const [numPackers, setNumPackers] = useState<string>('2');
  const [totalPackets, setTotalPackets] = useState<number>(0);
  const [totalProductionKg, setTotalProductionKg] = useState<number>(0);
  const [notes, setNotes] = useState<string>('');
  const [existingWage, setExistingWage] = useState<any>(null);

  // History
  const [wageHistory, setWageHistory] = useState<any[]>([]);

  // Derived calculations
  const calculations = useMemo(() => {
    const budget = Number(totalWageBudget) || 0;
    const cooks = Math.max(0, Number(numCooks) || 0);
    const packers = Math.max(0, Number(numPackers) || 0);
    const packets = totalPackets;
    const prodKg = totalProductionKg;

    if (budget <= 0) {
      return {
        productionWageAmount: 0,
        packingWageAmount: 0,
        wagePerCook: 0,
        wagePerPacker: 0,
      };
    }

    let productionWageAmount = 0;
    let packingWageAmount = 0;

    if (cooks > 0 && packers > 0) {
      const cookWork = prodKg;
      const packerWork = packets;
      
      if (cookWork <= 0 && packerWork <= 0) {
        const totalWorkers = cooks + packers;
        productionWageAmount = roundCurrency((cooks / totalWorkers) * budget);
        packingWageAmount = roundCurrency(budget - productionWageAmount);
      } else if (packerWork <= 0) {
        productionWageAmount = budget;
        packingWageAmount = 0;
      } else if (cookWork <= 0) {
        productionWageAmount = 0;
        packingWageAmount = budget;
      } else {
        const cookRatio = cooks / (cooks + packers);
        productionWageAmount = roundCurrency(cookRatio * budget);
        packingWageAmount = roundCurrency(budget - productionWageAmount);
      }
    } else if (cooks > 0) {
      productionWageAmount = budget;
      packingWageAmount = 0;
    } else if (packers > 0) {
      productionWageAmount = 0;
      packingWageAmount = budget;
    }

    const wagePerCook = cooks > 0 ? roundCurrency(productionWageAmount / cooks) : 0;
    const wagePerPacker = packers > 0 ? roundCurrency(packingWageAmount / packers) : 0;

    return {
      productionWageAmount,
      packingWageAmount,
      wagePerCook,
      wagePerPacker,
    };
  }, [totalWageBudget, numCooks, numPackers, totalPackets, totalProductionKg]);

  const loadDateData = useCallback(async (date: string) => {
    setIsLoading(true);
    try {
      const [existing, packets, prodKg, history] = await Promise.all([
        fetchDailyWage(date),
        fetchTotalPacketsForDate(date),
        fetchTotalProductionKgForDate(date),
        fetchDailyWages(60),
      ]);

      setTotalPackets(packets);
      setTotalProductionKg(prodKg);
      setWageHistory(history);

      if (existing) {
        setExistingWage(existing);
        setTotalWageBudget(String(existing.totalWageBudget));
        setNumCooks(String(existing.numCooks));
        setNumPackers(String(existing.numPackers));
        setNotes(existing.notes || '');
      } else {
        setExistingWage(null);
        setTotalWageBudget('4000');
        setNumCooks('2');
        setNumPackers('2');
        setNotes('');
      }
    } catch (err) {
      console.error('Failed to load wage data:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDateData(selectedDate);
  }, [selectedDate, loadDateData]);

  const handleSave = async () => {
    const budget = Number(totalWageBudget) || 0;
    const cooks = Number(numCooks) || 0;
    const packers = Number(numPackers) || 0;

    if (budget <= 0) {
      alert('ദയവായി സാധുവായ ഒരു കൂലി ബഡ്ജറ്റ് തുക നൽകുക');
      return;
    }

    setIsSaving(true);
    try {
      await saveDailyWage({
        productionDate: selectedDate,
        totalWageBudget: budget,
        numCooks: cooks,
        numPackers: packers,
        totalPacketsProduced: totalPackets,
        totalProductionKg: totalProductionKg,
        productionWageAmount: calculations.productionWageAmount,
        packingWageAmount: calculations.packingWageAmount,
        wagePerCook: calculations.wagePerCook,
        wagePerPacker: calculations.wagePerPacker,
        notes: notes.trim() || undefined,
      });

      await loadDateData(selectedDate);
      onRefresh();
      alert('കൂലി വിവരങ്ങൾ വിജയകരമായി സേവ് ചെയ്തു!');
    } catch (err: any) {
      alert(`സേവ് ചെയ്യുന്നതിൽ പിഴവ്: ${err?.message || 'അജ്ഞാത പിഴവ്'}`);
    } finally {
      setIsSaving(false);
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr + 'T00:00:00').toLocaleDateString('ml-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="space-y-5 pb-8 font-malayalam">
      {/* Modern Minimal Header with Save Button on Top */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-stone-200 dark:border-[#2E2828]">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-stone-200 dark:border-[#332c2c] bg-stone-50 dark:bg-[#1E1B1B]">
            <FiCalendar className="w-4 h-4 text-stone-500 dark:text-stone-400" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-transparent text-sm font-mono text-stone-900 dark:text-white focus:outline-none"
            />
          </div>
          <span className="text-xs font-semibold text-stone-500 dark:text-stone-400">
            {formatDate(selectedDate)}
          </span>
          <button
            onClick={() => loadDateData(selectedDate)}
            disabled={isLoading}
            className="p-2 rounded-lg border border-stone-200 dark:border-[#2E2828] bg-white dark:bg-[#1E1B1B] text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-[#282323] transition-colors cursor-pointer disabled:opacity-50"
            title="Refresh"
          >
            <FiRefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-epso-red' : ''}`} />
          </button>
        </div>

        {/* Primary Save Button on Top */}
        <div className="flex items-center gap-2">
          {existingWage && (
            <span className="text-[11px] text-stone-400 hidden md:inline">
              അപ്ഡേറ്റ്: {new Date(existingWage.updatedAt || existingWage.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <button
            onClick={handleSave}
            disabled={isSaving || isLoading}
            className="px-5 py-2.5 rounded-xl bg-[#1E293B] hover:bg-[#0F172A] dark:bg-emerald-600 dark:hover:bg-emerald-700 text-white font-bold text-xs shadow-sm transition-all cursor-pointer disabled:opacity-50 flex items-center gap-2"
          >
            {isSaving ? (
              <>
                <FiRefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>സേവ് ചെയ്യുന്നു...</span>
              </>
            ) : (
              <>
                <FiSave className="w-3.5 h-3.5" />
                <span>{existingWage ? 'കൂലി അപ്ഡേറ്റ് ചെയ്യുക' : 'കൂലി സൂക്ഷിക്കുക (Save)'}</span>
              </>
            )}
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="min-h-[30vh] flex items-center justify-center">
          <LoadingSpinner size="md" label="കൂലി വിവരങ്ങൾ ലഭ്യമാക്കുന്നു..." />
        </div>
      ) : (
        <>
          {/* Production Stats Auto-Fetched (Minimal Clean Cards) */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3.5 rounded-xl bg-stone-50 dark:bg-[#1A1818] border border-stone-200 dark:border-[#2E2828]">
              <p className="text-[11px] font-bold text-stone-500 dark:text-stone-400 uppercase tracking-wider mb-0.5">ആകെ ഉൽപ്പാദനം</p>
              <p className="text-xl font-black text-stone-900 dark:text-white font-mono">{totalProductionKg.toFixed(1)} kg</p>
              <p className="text-[10px] text-stone-400 mt-0.5">റണ്ണുകളിൽ നിന്ന് ഓട്ടോമാറ്റിക്</p>
            </div>
            <div className="p-3.5 rounded-xl bg-stone-50 dark:bg-[#1A1818] border border-stone-200 dark:border-[#2E2828]">
              <p className="text-[11px] font-bold text-stone-500 dark:text-stone-400 uppercase tracking-wider mb-0.5">ആകെ പാക്കറ്റുകൾ</p>
              <p className="text-xl font-black text-stone-900 dark:text-white font-mono">{totalPackets}</p>
              <p className="text-[10px] text-stone-400 mt-0.5">പാക്കിംഗ് രേഖകളിൽ നിന്ന് ഓട്ടോമാറ്റിക്</p>
            </div>
          </div>

          {/* Wage Configuration Form (Minimal Clean Layout) */}
          <div className="p-4 rounded-xl bg-white dark:bg-[#1A1616] border border-stone-200 dark:border-[#2E2828] space-y-4">
            {/* Budget */}
            <div>
              <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 mb-1">
                <FiDollarSign className="inline w-3.5 h-3.5 mr-1 text-emerald-600" />
                ദിവസേനയുള്ള ആകെ കൂലി ബഡ്ജറ്റ് (₹)
              </label>
              <input
                type="number"
                value={totalWageBudget}
                onChange={(e) => setTotalWageBudget(e.target.value)}
                min="0"
                step="100"
                className="w-full px-3 py-2 rounded-lg border border-stone-200 dark:border-[#332c2c] bg-stone-50 dark:bg-[#1E1B1B] text-sm font-bold text-stone-900 dark:text-white font-mono focus:outline-none focus:ring-1 focus:ring-emerald-500"
                placeholder="4000"
              />
            </div>

            {/* Employee Counts */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 mb-1">
                  <FiUsers className="inline w-3.5 h-3.5 mr-1 text-orange-500" />
                  കുക്കിംഗ് തൊഴിലാളികൾ (Cooks)
                </label>
                <input
                  type="number"
                  value={numCooks}
                  onChange={(e) => setNumCooks(e.target.value)}
                  min="0"
                  step="1"
                  className="w-full px-3 py-2 rounded-lg border border-stone-200 dark:border-[#332c2c] bg-stone-50 dark:bg-[#1E1B1B] text-sm font-bold text-stone-900 dark:text-white font-mono focus:outline-none focus:ring-1 focus:ring-orange-500"
                  placeholder="2"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 mb-1">
                  <FiPackage className="inline w-3.5 h-3.5 mr-1 text-indigo-500" />
                  പാക്കിംഗ് തൊഴിലാളികൾ (Packers)
                </label>
                <input
                  type="number"
                  value={numPackers}
                  onChange={(e) => setNumPackers(e.target.value)}
                  min="0"
                  step="1"
                  className="w-full px-3 py-2 rounded-lg border border-stone-200 dark:border-[#332c2c] bg-stone-50 dark:bg-[#1E1B1B] text-sm font-bold text-stone-900 dark:text-white font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  placeholder="2"
                />
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 mb-1">കുറിപ്പുകൾ (ഐച്ഛികം)</label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-stone-200 dark:border-[#332c2c] bg-stone-50 dark:bg-[#1E1B1B] text-xs text-stone-700 dark:text-stone-300 focus:outline-none focus:ring-1 focus:ring-stone-400"
                placeholder="ഇന്നത്തെ ദിവസത്തെ കുറിപ്പുകൾ..."
              />
            </div>
          </div>

          {/* Wage Allocation Breakdown (Minimal Clean Grid) */}
          <div className="p-4 rounded-xl bg-stone-50 dark:bg-[#1A1616] border border-stone-200 dark:border-[#2E2828] space-y-3">
            <h3 className="text-xs font-black text-stone-800 dark:text-stone-200 flex items-center gap-1.5 uppercase tracking-wider">
              <FiDollarSign className="w-3.5 h-3.5 text-emerald-600" />
              കൂലി വിഹിത വിതരണ കണക്ക് (Wage Split)
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Production Team */}
              <div className="p-3.5 rounded-lg bg-white dark:bg-[#1E1B1B] border border-stone-200 dark:border-[#2E2828] space-y-1">
                <p className="text-[10px] font-bold text-orange-600 dark:text-orange-400 uppercase tracking-wider">പ്രൊഡക്ഷൻ ടീം (കുക്കുകൾ)</p>
                <p className="text-xl font-black text-stone-900 dark:text-white font-mono">₹{calculations.productionWageAmount.toLocaleString('en-IN')}</p>
                <div className="flex items-center justify-between text-xs text-stone-500 dark:text-stone-400 pt-1 border-t border-stone-100 dark:border-[#282323]">
                  <span>{numCooks} കുക്ക്</span>
                  <span className="font-bold text-orange-700 dark:text-orange-300 font-mono">₹{calculations.wagePerCook.toLocaleString('en-IN')} / ഒരാൾക്ക്</span>
                </div>
              </div>

              {/* Packing Team */}
              <div className="p-3.5 rounded-lg bg-white dark:bg-[#1E1B1B] border border-stone-200 dark:border-[#2E2828] space-y-1">
                <p className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">പാക്കിംഗ് ടീം (പാക്കർമാർ)</p>
                <p className="text-xl font-black text-stone-900 dark:text-white font-mono">₹{calculations.packingWageAmount.toLocaleString('en-IN')}</p>
                <div className="flex items-center justify-between text-xs text-stone-500 dark:text-stone-400 pt-1 border-t border-stone-100 dark:border-[#282323]">
                  <span>{numPackers} പാക്കർ</span>
                  <span className="font-bold text-indigo-700 dark:text-indigo-300 font-mono">₹{calculations.wagePerPacker.toLocaleString('en-IN')} / ഒരാൾക്ക്</span>
                </div>
              </div>
            </div>

            {/* Total Verification */}
            <div className="flex items-center justify-between p-2.5 rounded-lg bg-stone-100 dark:bg-[#201C1C] border border-stone-200 dark:border-[#2E2828]">
              <span className="text-xs font-bold text-stone-600 dark:text-stone-300">ആകെ വിതരണം ചെയ്ത തുക</span>
              <span className="text-sm font-black text-emerald-700 dark:text-emerald-400 font-mono">
                ₹{(calculations.productionWageAmount + calculations.packingWageAmount).toLocaleString('en-IN')}
                {' '}/ ₹{Number(totalWageBudget || 0).toLocaleString('en-IN')}
              </span>
            </div>
          </div>

          {/* History Toggle */}
          <div className="border-t border-stone-200 dark:border-[#2E2828] pt-4">
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-stone-50 dark:bg-[#1E1B1B] border border-stone-200 dark:border-[#2E2828] text-xs font-bold text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-[#282323] transition-colors cursor-pointer"
            >
              <span>കൂലി വിവരങ്ങളുടെ മുൻകാല ചരിത്രം ({wageHistory.length} രേഖകൾ)</span>
              {showHistory ? <FiChevronUp className="w-4 h-4" /> : <FiChevronDown className="w-4 h-4" />}
            </button>

            {showHistory && wageHistory.length > 0 && (
              <div className="mt-3 space-y-2 max-h-[400px] overflow-y-auto">
                {wageHistory.map((w) => (
                  <button
                    key={w.id}
                    onClick={() => setSelectedDate(w.productionDate)}
                    className={`w-full text-left p-3 rounded-xl border transition-all cursor-pointer ${
                      selectedDate === w.productionDate
                        ? 'bg-epso-red/10 dark:bg-amber-500/10 border-epso-red/30 dark:border-amber-500/30'
                        : 'bg-white dark:bg-[#1A1616] border-stone-200 dark:border-[#2E2828] hover:bg-stone-50 dark:hover:bg-[#1E1B1B]'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-stone-800 dark:text-stone-200">{formatDate(w.productionDate)}</span>
                      <span className="text-xs font-black text-emerald-600 dark:text-emerald-400 font-mono">₹{w.totalWageBudget.toLocaleString('en-IN')}</span>
                    </div>
                    <div className="flex items-center gap-3 text-[10px] text-stone-500 dark:text-stone-400">
                      <span>{w.numCooks} കുക്കുകൾ · ₹{w.wagePerCook}/ഒരാൾക്ക്</span>
                      <span>|</span>
                      <span>{w.numPackers} പാക്കർമാർ · ₹{w.wagePerPacker}/ഒരാൾക്ക്</span>
                      <span>|</span>
                      <span>{w.totalPacketsProduced} പാക്കറ്റുകൾ</span>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {showHistory && wageHistory.length === 0 && (
              <p className="mt-3 text-center text-xs text-stone-400 dark:text-stone-500 py-4">കൂലി വിവരങ്ങൾ ഒന്നും രേഖപ്പെടുത്തിയിട്ടില്ല.</p>
            )}
          </div>
        </>
      )}
    </div>
  );
};
