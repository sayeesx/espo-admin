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

    // Allocation logic:
    // If both cooks and packers exist, allocate proportionally based on
    // production kg (for cooks) vs packets (for packers).
    // Simple approach: split 60% to cooks, 40% to packers by default,
    // but adjust based on actual work ratios.
    // More dynamic: use production weight and packet count to determine ratio.
    
    let productionWageAmount = 0;
    let packingWageAmount = 0;

    if (cooks > 0 && packers > 0) {
      // Weight-based ratio: production kg vs total packets (normalized)
      // Use a balanced formula: cooks get proportional to kg produced,
      // packers get proportional to packets packed.
      // If no packets, all goes to cooks. If no production, all goes to packers.
      const cookWork = prodKg; // kg produced
      const packerWork = packets; // packets packed
      
      if (cookWork <= 0 && packerWork <= 0) {
        // No production data at all - split by headcount
        const totalWorkers = cooks + packers;
        productionWageAmount = roundCurrency((cooks / totalWorkers) * budget);
        packingWageAmount = roundCurrency(budget - productionWageAmount);
      } else if (packerWork <= 0) {
        // No packing done yet - all to cooks
        productionWageAmount = budget;
        packingWageAmount = 0;
      } else if (cookWork <= 0) {
        // No production - all to packers
        productionWageAmount = 0;
        packingWageAmount = budget;
      } else {
        // Both have work - use 60:40 default split adjusted by worker count
        const cookRatio = cooks / (cooks + packers);
        const packerRatio = packers / (cooks + packers);
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
      const [existing, packets, prodKg] = await Promise.all([
        fetchDailyWage(date),
        fetchTotalPacketsForDate(date),
        fetchTotalProductionKgForDate(date),
      ]);

      setTotalPackets(packets);
      setTotalProductionKg(prodKg);

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
      console.error('Error loading wage data:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadHistory = useCallback(async () => {
    try {
      const history = await fetchDailyWages(30);
      setWageHistory(history);
    } catch (err) {
      console.error('Error loading wage history:', err);
    }
  }, []);

  useEffect(() => {
    loadDateData(selectedDate);
    loadHistory();
  }, [selectedDate, loadDateData, loadHistory]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await saveDailyWage({
        productionDate: selectedDate,
        totalWageBudget: Number(totalWageBudget) || 0,
        numCooks: Number(numCooks) || 0,
        numPackers: Number(numPackers) || 0,
        totalPacketsProduced: totalPackets,
        totalProductionKg: totalProductionKg,
        productionWageAmount: calculations.productionWageAmount,
        packingWageAmount: calculations.packingWageAmount,
        wagePerCook: calculations.wagePerCook,
        wagePerPacker: calculations.wagePerPacker,
        notes,
      });
      await loadDateData(selectedDate);
      await loadHistory();
      onRefresh();
    } catch (err: any) {
      alert(`Save failed: ${err?.message || 'Unknown error'}`);
    } finally {
      setIsSaving(false);
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="space-y-6 pb-8">
      {/* Date Picker */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 pb-4 border-b border-stone-200 dark:border-[#2E2828]">
        <div className="flex items-center gap-2 flex-1">
          <FiCalendar className="w-4 h-4 text-stone-400" />
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="px-3 py-2 rounded-xl border border-stone-200 dark:border-[#2E2828] bg-white dark:bg-[#1E1B1B] text-sm text-stone-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-epso-red/30 dark:focus:ring-amber-500/30"
          />
          <span className="text-xs font-semibold text-stone-500 dark:text-stone-400 font-malayalam">
            {formatDate(selectedDate)}
          </span>
        </div>
        <button
          onClick={() => loadDateData(selectedDate)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-stone-200 dark:border-[#2E2828] bg-white dark:bg-[#1E1B1B] text-xs font-bold text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-[#282323] press-apple transition-colors cursor-pointer"
        >
          <FiRefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      {isLoading ? (
        <div className="min-h-[30vh] flex items-center justify-center">
          <LoadingSpinner size="md" label="Loading wage data..." />
        </div>
      ) : (
        <>
          {/* Production Stats Auto-Fetched */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-4 rounded-2xl bg-blue-50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/30">
              <p className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider mb-1">Total Production</p>
              <p className="text-xl font-black text-blue-800 dark:text-blue-200">{totalProductionKg.toFixed(1)} kg</p>
              <p className="text-[10px] text-blue-500 dark:text-blue-400 mt-0.5">Auto-fetched from production runs</p>
            </div>
            <div className="p-4 rounded-2xl bg-purple-50 dark:bg-purple-950/20 border border-purple-100 dark:border-purple-900/30">
              <p className="text-[10px] font-bold text-purple-600 dark:text-purple-400 uppercase tracking-wider mb-1">Total Packets</p>
              <p className="text-xl font-black text-purple-800 dark:text-purple-200">{totalPackets}</p>
              <p className="text-[10px] text-purple-500 dark:text-purple-400 mt-0.5">Auto-fetched from packing records</p>
            </div>
          </div>

          {/* Wage Configuration Form */}
          <div className="p-5 rounded-2xl bg-white dark:bg-[#1A1616] border border-stone-200 dark:border-[#2E2828] shadow-sm space-y-5">
            {/* Budget */}
            <div>
              <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 mb-1.5">
                <FiDollarSign className="inline w-3.5 h-3.5 mr-1 text-emerald-500" />
                Daily Wage Budget (₹)
              </label>
              <input
                type="number"
                value={totalWageBudget}
                onChange={(e) => setTotalWageBudget(e.target.value)}
                min="0"
                step="100"
                className="w-full px-3 py-2.5 rounded-xl border border-stone-200 dark:border-[#2E2828] bg-stone-50 dark:bg-[#1E1B1B] text-sm font-bold text-stone-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                placeholder="4000"
              />
            </div>

            {/* Employee Counts */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 mb-1.5">
                  <FiUsers className="inline w-3.5 h-3.5 mr-1 text-orange-500" />
                  No. of Cooks
                </label>
                <input
                  type="number"
                  value={numCooks}
                  onChange={(e) => setNumCooks(e.target.value)}
                  min="0"
                  step="1"
                  className="w-full px-3 py-2.5 rounded-xl border border-stone-200 dark:border-[#2E2828] bg-stone-50 dark:bg-[#1E1B1B] text-sm font-bold text-stone-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500/30"
                  placeholder="2"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 mb-1.5">
                  <FiPackage className="inline w-3.5 h-3.5 mr-1 text-indigo-500" />
                  No. of Packers
                </label>
                <input
                  type="number"
                  value={numPackers}
                  onChange={(e) => setNumPackers(e.target.value)}
                  min="0"
                  step="1"
                  className="w-full px-3 py-2.5 rounded-xl border border-stone-200 dark:border-[#2E2828] bg-stone-50 dark:bg-[#1E1B1B] text-sm font-bold text-stone-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                  placeholder="2"
                />
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 mb-1.5">Notes (optional)</label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-stone-200 dark:border-[#2E2828] bg-stone-50 dark:bg-[#1E1B1B] text-xs text-stone-700 dark:text-stone-300 focus:outline-none focus:ring-2 focus:ring-epso-red/20"
                placeholder="Any notes for this day..."
              />
            </div>
          </div>

          {/* Wage Allocation Breakdown */}
          <div className="p-5 rounded-2xl bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/20 dark:to-teal-950/20 border border-emerald-200 dark:border-emerald-900/30 shadow-sm space-y-4">
            <h3 className="text-sm font-black text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
              <FiDollarSign className="w-4 h-4" />
              Wage Allocation Breakdown
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Production Team */}
              <div className="p-4 rounded-xl bg-white/80 dark:bg-[#1A1616]/80 border border-emerald-100 dark:border-emerald-900/20 space-y-2">
                <p className="text-[10px] font-bold text-orange-600 dark:text-orange-400 uppercase tracking-wider">Production Team (Cooks)</p>
                <p className="text-2xl font-black text-stone-900 dark:text-white">₹{calculations.productionWageAmount.toLocaleString('en-IN')}</p>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-stone-500 dark:text-stone-400">{numCooks} cook(s)</span>
                  <span className="font-bold text-orange-700 dark:text-orange-300">₹{calculations.wagePerCook.toLocaleString('en-IN')} / cook</span>
                </div>
              </div>

              {/* Packing Team */}
              <div className="p-4 rounded-xl bg-white/80 dark:bg-[#1A1616]/80 border border-emerald-100 dark:border-emerald-900/20 space-y-2">
                <p className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">Packing Team (Packers)</p>
                <p className="text-2xl font-black text-stone-900 dark:text-white">₹{calculations.packingWageAmount.toLocaleString('en-IN')}</p>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-stone-500 dark:text-stone-400">{numPackers} packer(s)</span>
                  <span className="font-bold text-indigo-700 dark:text-indigo-300">₹{calculations.wagePerPacker.toLocaleString('en-IN')} / packer</span>
                </div>
              </div>
            </div>

            {/* Total Verification */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800/50">
              <span className="text-xs font-bold text-emerald-700 dark:text-emerald-300">Total Allocated</span>
              <span className="text-sm font-black text-emerald-800 dark:text-emerald-200">
                ₹{(calculations.productionWageAmount + calculations.packingWageAmount).toLocaleString('en-IN')}
                {' '}/ ₹{Number(totalWageBudget || 0).toLocaleString('en-IN')}
              </span>
            </div>
          </div>

          {/* Save Button */}
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="w-full py-3.5 rounded-2xl bg-epso-red hover:bg-epso-red-hover dark:bg-amber-500 dark:hover:bg-amber-600 text-white dark:text-stone-950 font-black text-sm shadow-md press-apple transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isSaving ? (
              <>
                <FiRefreshCw className="w-4 h-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <FiSave className="w-4 h-4" />
                {existingWage ? 'Update Wage Record' : 'Save Wage Record'}
              </>
            )}
          </button>

          {existingWage && (
            <p className="text-[10px] text-center text-stone-400 dark:text-stone-500 -mt-2">
              Last updated: {new Date(existingWage.updatedAt || existingWage.createdAt).toLocaleString('en-IN')}
            </p>
          )}

          {/* History Toggle */}
          <div className="border-t border-stone-200 dark:border-[#2E2828] pt-4">
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-stone-50 dark:bg-[#1E1B1B] border border-stone-200 dark:border-[#2E2828] text-xs font-bold text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-[#282323] transition-colors cursor-pointer"
            >
              <span>Wage History ({wageHistory.length} records)</span>
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
                      <span className="text-xs font-black text-emerald-600 dark:text-emerald-400">₹{w.totalWageBudget.toLocaleString('en-IN')}</span>
                    </div>
                    <div className="flex items-center gap-3 text-[10px] text-stone-500 dark:text-stone-400">
                      <span>{w.numCooks} cooks · ₹{w.wagePerCook}/ea</span>
                      <span>|</span>
                      <span>{w.numPackers} packers · ₹{w.wagePerPacker}/ea</span>
                      <span>|</span>
                      <span>{w.totalPacketsProduced} packets</span>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {showHistory && wageHistory.length === 0 && (
              <p className="mt-3 text-center text-xs text-stone-400 dark:text-stone-500 py-4">No wage records yet.</p>
            )}
          </div>
        </>
      )}
    </div>
  );
};
