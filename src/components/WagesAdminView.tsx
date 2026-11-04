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
  FiCheckCircle,
  FiPlus,
  FiMinus,
  FiLayers,
  FiClock,
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
import { useFeedback } from '../context/FeedbackContext';

interface WagesAdminViewProps {
  onRefresh: () => void;
}

export const WagesAdminView: React.FC<WagesAdminViewProps> = ({ onRefresh }) => {
  const { showToast } = useFeedback();
  const getTodayStr = () => new Date().toISOString().split('T')[0];
  const [selectedDate, setSelectedDate] = useState<string>(getTodayStr);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  // Form state
  const [totalWageBudget, setTotalWageBudget] = useState<string>('4000');
  const [numCooks, setNumCooks] = useState<number>(2);
  const [numPackers, setNumPackers] = useState<number>(2);
  const [totalPackets, setTotalPackets] = useState<number>(0);
  const [totalProductionKg, setTotalProductionKg] = useState<number>(0);
  const [notes, setNotes] = useState<string>('');
  const [existingWage, setExistingWage] = useState<any>(null);

  // History
  const [wageHistory, setWageHistory] = useState<any[]>([]);

  // Derived calculations
  const calculations = useMemo(() => {
    const budget = Number(totalWageBudget) || 0;
    const cooks = Math.max(0, numCooks);
    const packers = Math.max(0, numPackers);

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

    const totalWorkers = cooks + packers;
    if (totalWorkers > 0) {
      if (cooks > 0 && packers > 0) {
        productionWageAmount = roundCurrency((cooks / totalWorkers) * budget);
        packingWageAmount = roundCurrency(budget - productionWageAmount);
      } else if (cooks > 0) {
        productionWageAmount = budget;
        packingWageAmount = 0;
      } else if (packers > 0) {
        productionWageAmount = 0;
        packingWageAmount = budget;
      }
    }

    const wagePerCook = cooks > 0 ? roundCurrency(productionWageAmount / cooks) : 0;
    const wagePerPacker = packers > 0 ? roundCurrency(packingWageAmount / packers) : 0;

    return {
      productionWageAmount,
      packingWageAmount,
      wagePerCook,
      wagePerPacker,
    };
  }, [totalWageBudget, numCooks, numPackers]);

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
        setNumCooks(Number(existing.numCooks) || 2);
        setNumPackers(Number(existing.numPackers) || 2);
        setNotes(existing.notes || '');
      } else {
        setExistingWage(null);
        setTotalWageBudget('4000');
        setNumCooks(2);
        setNumPackers(2);
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
    const cooks = Math.max(0, numCooks);
    const packers = Math.max(0, numPackers);

    if (budget <= 0) {
      showToast('ദയവായി സാധുവായ ഒരു കൂലി ബഡ്ജറ്റ് തുക നൽകുക', 'warning');
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
      showToast('കൂലി വിവരങ്ങൾ വിജയകരമായി സേവ് ചെയ്തു!', 'success');
    } catch (err: any) {
      showToast(`സേവ് ചെയ്യുന്നതിൽ പിഴവ്: ${err?.message || 'അജ്ഞാത പിഴവ്'}`, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr + 'T00:00:00').toLocaleDateString('ml-IN', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  const isToday = selectedDate === getTodayStr();

  return (
    <div className="space-y-6 pb-12 font-malayalam max-w-6xl xl:max-w-7xl mx-auto">
      {/* ======================================================== */}
      {/* TOP HEADER: Prominent Date Navigation & Primary Save     */}
      {/* ======================================================== */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-3xl bg-white dark:bg-[#1E1B1B] border border-stone-200 dark:border-[#2E2828] shadow-apple-card">
        <div className="flex items-center gap-3 flex-wrap">
          {/* Date Picker Control */}
          <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-2xl border border-stone-300 dark:border-[#3E3838] bg-stone-50 dark:bg-[#141212] focus-within:border-epso-red dark:focus-within:border-amber-500 transition-all">
            <FiCalendar className="w-5 h-5 text-epso-orange dark:text-amber-400 shrink-0" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-transparent text-sm sm:text-base font-bold font-mono text-stone-900 dark:text-white focus:outline-none cursor-pointer"
            />
          </div>

          {/* Quick "Today" Chip */}
          {!isToday && (
            <button
              onClick={() => setSelectedDate(getTodayStr())}
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-stone-100 hover:bg-stone-200 dark:bg-[#282323] dark:hover:bg-[#342D2D] text-stone-700 dark:text-stone-300 transition-colors cursor-pointer"
            >
              ഇന്ന് (Today)
            </button>
          )}

          {/* Formatted Date Label */}
          <span className="text-xs sm:text-sm font-bold text-stone-500 dark:text-stone-400">
            {formatDate(selectedDate)}
          </span>

          <button
            onClick={() => loadDateData(selectedDate)}
            disabled={isLoading}
            className="p-2.5 rounded-xl border border-stone-200 dark:border-[#2E2828] bg-white dark:bg-[#141212] text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-[#282323] transition-colors cursor-pointer disabled:opacity-50"
            title="Refresh"
          >
            <FiRefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-epso-red dark:text-amber-400' : ''}`} />
          </button>
        </div>

        {/* Primary Save Action */}
        <div className="flex items-center gap-3">
          {existingWage && (
            <div className="hidden md:flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-bold bg-emerald-50 dark:bg-emerald-950/40 px-3 py-1.5 rounded-xl border border-emerald-200 dark:border-emerald-800">
              <FiCheckCircle className="w-3.5 h-3.5" />
              <span>രേഖപ്പെടുത്തിയിട്ടുണ്ട്</span>
            </div>
          )}

          <button
            onClick={handleSave}
            disabled={isSaving || isLoading}
            className="w-full sm:w-auto px-6 py-3 rounded-2xl bg-epso-red hover:bg-epso-red-hover dark:bg-amber-500 dark:hover:bg-amber-600 text-white dark:text-stone-950 font-black text-sm shadow-md transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2 press-apple"
          >
            {isSaving ? (
              <>
                <FiRefreshCw className="w-4 h-4 animate-spin" />
                <span>സേവ് ചെയ്യുന്നു...</span>
              </>
            ) : (
              <>
                <FiSave className="w-4 h-4 stroke-[2.5]" />
                <span>{existingWage ? 'കൂലി അപ്ഡേറ്റ് ചെയ്യുക' : 'കൂലി സൂക്ഷിക്കുക (Save)'}</span>
              </>
            )}
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="min-h-[40vh] flex items-center justify-center">
          <LoadingSpinner size="md" label="കൂലി വിവരങ്ങൾ ലഭ്യമാക്കുന്നു..." />
        </div>
      ) : (
        <>
          {/* ======================================================== */}
          {/* AUTO-FETCHED PRODUCTION SUMMARY BANNER                   */}
          {/* ======================================================== */}
          <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/20 dark:to-orange-950/20 border border-amber-200/80 dark:border-amber-900/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-epso-orange/15 text-epso-orange flex items-center justify-center font-black">
                <FiLayers className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-bold text-amber-900 dark:text-amber-300 uppercase tracking-wider">
                  ഈ തീയതിയിലെ ഫാക്ടറി ഉൽപ്പാദന കണക്ക്
                </p>
                <p className="text-sm sm:text-base font-black text-stone-900 dark:text-white mt-0.5">
                  <span className="font-mono text-epso-red dark:text-amber-400">{totalProductionKg.toFixed(1)} kg</span> ഉൽപ്പാദനം ·{' '}
                  <span className="font-mono text-indigo-600 dark:text-indigo-400">{totalPackets}</span> പാക്കറ്റുകൾ പാക്ക് ചെയ്തു
                </p>
              </div>
            </div>

            <span className="text-[11px] font-semibold text-stone-500 dark:text-stone-400">
              ബാച്ചുകളിൽ നിന്നും പാക്കിംഗ് രേഖകളിൽ നിന്നും സ്വയം ശേഖരിച്ചത്
            </span>
          </div>

          {/* ======================================================== */}
          {/* WAGE BUDGET & WORKERS FORM (Google Outlined Style)        */}
          {/* ======================================================== */}
          <div className="p-6 sm:p-7 rounded-3xl bg-white dark:bg-[#1E1B1B] border border-stone-200 dark:border-[#2E2828] shadow-apple-card space-y-6">
            <div className="border-b border-stone-100 dark:border-[#282323] pb-4">
              <h2 className="text-lg font-black text-stone-900 dark:text-white flex items-center gap-2">
                <FiDollarSign className="w-5 h-5 text-emerald-600" />
                <span>ദിവസേനയുള്ള ആകെ കൂലി തുക</span>
              </h2>
              <p className="text-xs text-stone-500 dark:text-stone-400 mt-1">
                ഇന്നത്തെ പ്രൊഡക്ഷൻ & പാക്കിംഗ് തൊഴിലാളികൾക്കുള്ള ആകെ ബഡ്ജറ്റ് രേഖപ്പെടുത്തുക
              </p>
            </div>

            {/* Total Budget Input with Google Outlined Style */}
            <div className="space-y-3">
              <label className="block text-xs sm:text-sm font-bold text-stone-700 dark:text-stone-300">
                ആകെ കൂലി ബഡ്ജറ്റ് (Total Daily Wage Budget) *
              </label>

              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl font-bold text-stone-400 font-mono">
                  ₹
                </span>
                <input
                  type="number"
                  value={totalWageBudget}
                  onChange={(e) => setTotalWageBudget(e.target.value)}
                  min="0"
                  step="100"
                  placeholder="4000"
                  className="w-full pl-10 pr-4 py-3.5 rounded-2xl border-2 border-stone-300 dark:border-[#3E3838] bg-stone-50 dark:bg-[#141212] text-xl font-bold font-mono text-stone-900 dark:text-white focus:bg-white dark:focus:bg-[#1E1B1B] focus:border-epso-red dark:focus:border-amber-500 focus:outline-none transition-all"
                />
              </div>

              {/* Quick Preset Chips */}
              <div className="flex items-center gap-2 flex-wrap pt-1">
                <span className="text-xs font-bold text-stone-400">വേഗത്തിൽ തിരഞ്ഞെടുക്കാം:</span>
                {['2000', '3000', '4000', '5000', '6000'].map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => setTotalWageBudget(amt)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer ${
                      totalWageBudget === amt
                        ? 'bg-epso-red text-white shadow-xs dark:bg-amber-500 dark:text-stone-950'
                        : 'bg-stone-100 dark:bg-[#282323] text-stone-700 dark:text-stone-300 hover:bg-stone-200'
                    }`}
                  >
                    ₹{parseInt(amt, 10).toLocaleString('en-IN')}
                  </button>
                ))}
              </div>
            </div>

            {/* Workers Count Cards (Spacious, Clear & Clean) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 pt-2">
              {/* Cooking Team (Cooks) */}
              <div className="p-5 rounded-2xl bg-stone-50 dark:bg-[#141212] border border-stone-200 dark:border-[#2E2828] space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-orange-100 dark:bg-orange-950/60 text-orange-600 dark:text-orange-400 flex items-center justify-center font-black">
                    <FiUsers className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-stone-900 dark:text-white">
                      കുക്കിംഗ് തൊഴിലാളികൾ (Cooks)
                    </h3>
                    <p className="text-xs text-stone-500 dark:text-stone-400">
                      ചേരുവകൾ വറുക്കുന്നവരും കുക്കുകളും
                    </p>
                  </div>
                </div>

                {/* Counter Stepper with Google Outlined Input */}
                <div className="flex items-center gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => setNumCooks(Math.max(0, numCooks - 1))}
                    className="w-11 h-11 rounded-xl bg-white dark:bg-[#1E1B1B] border border-stone-300 dark:border-[#3E3838] text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-[#282323] flex items-center justify-center font-bold text-lg cursor-pointer transition-colors"
                  >
                    <FiMinus className="w-4 h-4" />
                  </button>

                  <input
                    type="number"
                    value={numCooks}
                    onChange={(e) => setNumCooks(Math.max(0, parseInt(e.target.value, 10) || 0))}
                    min="0"
                    step="1"
                    className="flex-1 py-2.5 px-3 rounded-xl border border-stone-300 dark:border-[#3E3838] bg-white dark:bg-[#1E1B1B] text-center font-mono font-bold text-lg text-stone-900 dark:text-white focus:outline-none focus:border-epso-red"
                  />

                  <button
                    type="button"
                    onClick={() => setNumCooks(numCooks + 1)}
                    className="w-11 h-11 rounded-xl bg-white dark:bg-[#1E1B1B] border border-stone-300 dark:border-[#3E3838] text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-[#282323] flex items-center justify-center font-bold text-lg cursor-pointer transition-colors"
                  >
                    <FiPlus className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Packing Team (Packers) */}
              <div className="p-5 rounded-2xl bg-stone-50 dark:bg-[#141212] border border-stone-200 dark:border-[#2E2828] space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-black">
                    <FiPackage className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-stone-900 dark:text-white">
                      പാക്കിംഗ് തൊഴിലാളികൾ (Packers)
                    </h3>
                    <p className="text-xs text-stone-500 dark:text-stone-400">
                      പാക്കറ്റുകൾ സീൽ ചെയ്യുന്നവർ
                    </p>
                  </div>
                </div>

                {/* Counter Stepper with Google Outlined Input */}
                <div className="flex items-center gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => setNumPackers(Math.max(0, numPackers - 1))}
                    className="w-11 h-11 rounded-xl bg-white dark:bg-[#1E1B1B] border border-stone-300 dark:border-[#3E3838] text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-[#282323] flex items-center justify-center font-bold text-lg cursor-pointer transition-colors"
                  >
                    <FiMinus className="w-4 h-4" />
                  </button>

                  <input
                    type="number"
                    value={numPackers}
                    onChange={(e) => setNumPackers(Math.max(0, parseInt(e.target.value, 10) || 0))}
                    min="0"
                    step="1"
                    className="flex-1 py-2.5 px-3 rounded-xl border border-stone-300 dark:border-[#3E3838] bg-white dark:bg-[#1E1B1B] text-center font-mono font-bold text-lg text-stone-900 dark:text-white focus:outline-none focus:border-indigo-500"
                  />

                  <button
                    type="button"
                    onClick={() => setNumPackers(numPackers + 1)}
                    className="w-11 h-11 rounded-xl bg-white dark:bg-[#1E1B1B] border border-stone-300 dark:border-[#3E3838] text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-[#282323] flex items-center justify-center font-bold text-lg cursor-pointer transition-colors"
                  >
                    <FiPlus className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Notes Input */}
            <div className="pt-2">
              <label className="block text-xs sm:text-sm font-bold text-stone-700 dark:text-stone-300 mb-1.5">
                കുറിപ്പുകൾ (Notes / Optional)
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="ഇന്നത്തെ ദിവസത്തെ കൂലി സംബന്ധിച്ച കുറിപ്പുകൾ..."
                className="w-full px-4 py-3 rounded-2xl border border-stone-300 dark:border-[#3E3838] bg-stone-50 dark:bg-[#141212] text-sm text-stone-900 dark:text-white focus:bg-white dark:focus:bg-[#1E1B1B] focus:border-stone-500 focus:outline-none transition-all"
              />
            </div>
          </div>

          {/* ======================================================== */}
          {/* CLEAR & UNDERSTANDABLE WAGE ALLOCATION BREAKDOWN         */}
          {/* ======================================================== */}
          <div className="p-6 sm:p-7 rounded-3xl bg-white dark:bg-[#1E1B1B] border border-stone-200 dark:border-[#2E2828] shadow-apple-card space-y-5">
            <div className="flex items-center justify-between border-b border-stone-100 dark:border-[#282323] pb-4">
              <div>
                <h3 className="text-base sm:text-lg font-black text-stone-900 dark:text-white flex items-center gap-2">
                  <FiUsers className="w-5 h-5 text-emerald-600" />
                  <span>കൂലി വിഹിത വിതരണ കണക്ക് (Wage Split)</span>
                </h3>
                <p className="text-xs text-stone-500 dark:text-stone-400 mt-1">
                  ഓരോ ജീവനക്കാരനും ലഭിക്കുന്ന വ്യക്തമായ കൂലി തുക
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-stone-500">ആകെ ജീവനക്കാർ:</span>
                <span className="font-mono font-black text-sm px-2.5 py-0.5 rounded-lg bg-stone-100 dark:bg-[#282323] text-stone-800 dark:text-stone-200">
                  {numCooks + numPackers} പേർ
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Cooking Team Breakdown */}
              <div className="p-5 rounded-2xl bg-orange-50/60 dark:bg-orange-950/20 border-2 border-orange-200/80 dark:border-orange-900/40 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black uppercase tracking-wider text-orange-800 dark:text-orange-300">
                    പ്രൊഡക്ഷൻ ടീം (കുക്കുകൾ)
                  </span>
                  <span className="text-xs font-bold text-orange-700 dark:text-orange-400 font-mono">
                    {numCooks > 0 ? `${numCooks} പേർ` : 'ജീവനക്കാരില്ല'}
                  </span>
                </div>

                <div>
                  <span className="text-2xl sm:text-3xl font-black text-orange-950 dark:text-orange-200 font-mono">
                    ₹{calculations.productionWageAmount.toLocaleString('en-IN')}
                  </span>
                  <span className="text-xs text-orange-700 dark:text-orange-400 block mt-0.5 font-medium">
                    ആകെ കുക്കിംഗ് കൂലി വിഹിതം
                  </span>
                </div>

                <div className="pt-3 border-t border-orange-200/60 dark:border-orange-900/40 flex items-center justify-between text-xs sm:text-sm">
                  <span className="text-stone-600 dark:text-stone-300 font-medium">ഒരാൾക്ക് ലഭിക്കുന്നത്:</span>
                  <span className="font-mono font-black text-base text-orange-900 dark:text-orange-300">
                    ₹{calculations.wagePerCook.toLocaleString('en-IN')}
                  </span>
                </div>
              </div>

              {/* Packing Team Breakdown */}
              <div className="p-5 rounded-2xl bg-indigo-50/60 dark:bg-indigo-950/20 border-2 border-indigo-200/80 dark:border-indigo-900/40 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black uppercase tracking-wider text-indigo-800 dark:text-indigo-300">
                    പാക്കിംഗ് ടീം (പാക്കർമാർ)
                  </span>
                  <span className="text-xs font-bold text-indigo-700 dark:text-indigo-400 font-mono">
                    {numPackers > 0 ? `${numPackers} പേർ` : 'ജീവനക്കാരില്ല'}
                  </span>
                </div>

                <div>
                  <span className="text-2xl sm:text-3xl font-black text-indigo-950 dark:text-indigo-200 font-mono">
                    ₹{calculations.packingWageAmount.toLocaleString('en-IN')}
                  </span>
                  <span className="text-xs text-indigo-700 dark:text-indigo-400 block mt-0.5 font-medium">
                    ആകെ പാക്കിംഗ് കൂലി വിഹിതം
                  </span>
                </div>

                <div className="pt-3 border-t border-indigo-200/60 dark:border-indigo-900/40 flex items-center justify-between text-xs sm:text-sm">
                  <span className="text-stone-600 dark:text-stone-300 font-medium">ഒരാൾക്ക് ലഭിക്കുന്നത്:</span>
                  <span className="font-mono font-black text-base text-indigo-900 dark:text-indigo-300">
                    ₹{calculations.wagePerPacker.toLocaleString('en-IN')}
                  </span>
                </div>
              </div>
            </div>

            {/* Reconciliation Banner */}
            <div className="flex items-center justify-between p-4 rounded-2xl bg-stone-100 dark:bg-[#141212] border border-stone-200 dark:border-[#2E2828]">
              <div className="flex items-center gap-2">
                <FiCheckCircle className="w-5 h-5 text-emerald-600" />
                <span className="text-xs sm:text-sm font-bold text-stone-700 dark:text-stone-300">
                  വിതരണം ചെയ്ത ആകെ തുക:
                </span>
              </div>
              <span className="text-base sm:text-lg font-black text-emerald-700 dark:text-emerald-400 font-mono">
                ₹{(calculations.productionWageAmount + calculations.packingWageAmount).toLocaleString('en-IN')}
                <span className="text-xs font-medium text-stone-400 ml-1">
                  / ₹{Number(totalWageBudget || 0).toLocaleString('en-IN')}
                </span>
              </span>
            </div>

            {/* BATCH WAGE ALLOCATION PER KG LOGIC & PREVIEW */}
            <div className="p-5 rounded-2xl bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-amber-200/60 dark:border-amber-900/40 pb-3">
                <div>
                  <h4 className="text-sm font-black text-amber-900 dark:text-amber-200 flex items-center gap-2">
                    <FiLayers className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                    <span>ബാച്ചുകളിലേക്കുള്ള കൂലി വിഹിതം (Wage Allocation per Kg)</span>
                  </h4>
                  <p className="text-xs text-amber-700/80 dark:text-amber-400/80 mt-0.5">
                    ഉൽപ്പാദിപ്പിച്ച ബാച്ചുകളുടെ ഭാരത്തിനനുസരിച്ച് (Proportional Output Weight)
                  </p>
                </div>

                <div className="text-left sm:text-right">
                  <span className="text-[10px] uppercase tracking-wider font-bold text-amber-800 dark:text-amber-300 block">
                    ലേബർ ചെലവ് / കിലോ
                  </span>
                  <span className="text-xl font-black font-mono text-amber-950 dark:text-amber-100">
                    {totalProductionKg > 0
                      ? `₹${(Number(totalWageBudget || 0) / totalProductionKg).toFixed(2)} / kg`
                      : '₹0.00 / kg'}
                  </span>
                </div>
              </div>

              {totalProductionKg > 0 ? (
                <div className="space-y-2 text-xs sm:text-sm text-stone-700 dark:text-stone-300">
                  <div className="p-3 rounded-xl bg-white/80 dark:bg-[#141212]/80 border border-amber-200/70 dark:border-amber-900/40 font-mono text-xs flex flex-wrap items-center justify-between gap-2">
                    <span>
                      സൂത്രവാക്യം: ആകെ കൂലി (₹{Number(totalWageBudget || 0).toLocaleString('en-IN')}) ÷ ആകെ ഉൽപ്പാദനം ({totalProductionKg.toFixed(1)} kg)
                    </span>
                    <span className="font-bold text-amber-800 dark:text-amber-300">
                      = ₹{(Number(totalWageBudget || 0) / totalProductionKg).toFixed(2)} / kg
                    </span>
                  </div>
                  <p className="text-xs text-stone-600 dark:text-stone-400">
                    ഇന്ന് ഫാക്ടറിയിൽ ഉണ്ടാക്കിയ ഓരോ ബാച്ചിന്റെയും അസംസ്കൃത വസ്തുക്കളുടെ ചെലവിനൊപ്പം ഈ ലേബർ നിരക്ക് (<span className="font-mono font-bold text-stone-800 dark:text-stone-200">ബാച്ച് ഭാരം × ₹{(Number(totalWageBudget || 0) / totalProductionKg).toFixed(2)}</span>) കോസ്റ്റിംഗിൽ സ്വയം ചേർക്കപ്പെടും.
                  </p>
                </div>
              ) : (
                <div className="p-3 rounded-xl bg-stone-100 dark:bg-[#141212] border border-stone-200 dark:border-[#2E2828] text-xs text-stone-600 dark:text-stone-400 space-y-1">
                  <p className="font-bold text-stone-800 dark:text-stone-200">
                    പണിയില്ലാത്ത / ക്ലീനിംഗ് ദിവസങ്ങൾ (Non-Production Day):
                  </p>
                  <p>
                    ഇന്ന് ഉൽപ്പാദനം നടന്നിട്ടില്ലാത്തതിനാൽ (0 kg), ഈ കൂലി തുക മാസത്തെ പൊതുവായ പ്രവർത്തനച്ചെലവുകളിലേക്ക് (General Operational Overhead) ചേർക്കപ്പെടുന്നു; ഉൽപ്പന്ന ബാച്ചുകളിലേക്ക് ചേർക്കപ്പെടില്ല.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* ======================================================== */}
          {/* HISTORY ACCORDION                                        */}
          {/* ======================================================== */}
          <div className="rounded-3xl bg-white dark:bg-[#1E1B1B] border border-stone-200 dark:border-[#2E2828] overflow-hidden shadow-apple-card">
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="w-full flex items-center justify-between p-5 text-left text-sm font-black text-stone-800 dark:text-stone-200 hover:bg-stone-50 dark:hover:bg-[#252020] transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2.5">
                <FiClock className="w-4 h-4 text-stone-400" />
                <span>കൂലി വിവരങ്ങളുടെ മുൻകാല ചരിത്രം ({wageHistory.length} രേഖകൾ)</span>
              </div>
              {showHistory ? <FiChevronUp className="w-5 h-5" /> : <FiChevronDown className="w-5 h-5" />}
            </button>

            {showHistory && (
              <div className="p-5 pt-0 border-t border-stone-100 dark:border-[#282323] space-y-2.5">
                {wageHistory.length === 0 ? (
                  <p className="text-center text-xs text-stone-400 py-6">മുൻകാല രേഖകൾ ലഭ്യമല്ല.</p>
                ) : (
                  wageHistory.map((w) => (
                    <button
                      key={w.id}
                      onClick={() => setSelectedDate(w.productionDate)}
                      className={`w-full text-left p-4 rounded-2xl border transition-all cursor-pointer ${
                        selectedDate === w.productionDate
                          ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-300 dark:border-amber-800'
                          : 'bg-stone-50 dark:bg-[#141212] border-stone-200 dark:border-[#282323] hover:bg-stone-100 dark:hover:bg-[#201C1C]'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs sm:text-sm font-bold text-stone-900 dark:text-white">
                          {formatDate(w.productionDate)}
                        </span>
                        <span className="text-sm sm:text-base font-black text-emerald-600 dark:text-emerald-400 font-mono">
                          ₹{w.totalWageBudget.toLocaleString('en-IN')}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-stone-500 dark:text-stone-400 flex-wrap">
                        <span>{w.numCooks} കുക്കുകൾ (₹{w.wagePerCook}/ഒരാൾക്ക്)</span>
                        <span>•</span>
                        <span>{w.numPackers} പാക്കർമാർ (₹{w.wagePerPacker}/ഒരാൾക്ക്)</span>
                        <span>•</span>
                        <span>{w.totalPacketsProduced} പാക്കറ്റുകൾ</span>
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};
