import React, { useState, useMemo, useRef } from 'react';
import { Product, Ingredient, ProductionRun } from '../types';
import {
  FiGrid,
  FiTrendingUp,
  FiAlertTriangle,
  FiPackage,
  FiBox,
  FiLayers,
  FiClock,
  FiArrowUpRight,
  FiDollarSign,
  FiCalendar,
  FiActivity,
  FiChevronRight,
  FiChevronLeft,
  FiCheckCircle,
  FiTrash2,
} from 'react-icons/fi';
import { deleteProductionRun } from '../services/supabase';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
} from 'recharts';
import { useTheme } from '../context/ThemeContext';

interface DashboardViewProps {
  products: Product[];
  ingredients: Ingredient[];
  productionRuns: ProductionRun[];
  onNavigateTab: (tab: any) => void;
  onRefresh?: () => void;
}

interface CircularGaugeProps {
  label: string;
  value: string;
  subValue?: string;
  percentage: number;
  color: string;
  subtext: string;
}

const CircularGauge: React.FC<CircularGaugeProps> = ({
  label,
  value,
  subValue,
  percentage,
  color,
  subtext,
}) => {
  const size = 76;
  const strokeWidth = 7;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset =
    circumference - (circumference * Math.min(100, Math.max(0, percentage))) / 100;

  return (
    <div className="flex flex-col items-center flex-1 min-w-0">
      <span className="text-[11px] font-black mb-1.5 truncate" style={{ color }}>
        {label}
      </span>
      <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
        <svg className="w-full h-full -rotate-90 transform" viewBox={`0 0 ${size} ${size}`}>
          {/* Background Track */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="currentColor"
            className="text-stone-100 dark:text-[#282323]"
            strokeWidth={strokeWidth}
          />
          {/* Animated Progress Ring */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            className="transition-all duration-1000 ease-out"
          />
        </svg>

        {/* Center Value */}
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-sm font-black text-stone-900 dark:text-white leading-none">
            {value}
          </span>
          {subValue && (
            <span className="text-[9px] font-bold text-stone-400 dark:text-stone-500 leading-tight mt-0.5">
              {subValue}
            </span>
          )}
        </div>
      </div>
      <span className="text-[10px] font-bold text-stone-500 dark:text-stone-400 mt-1.5 truncate font-malayalam">
        {subtext}
      </span>
    </div>
  );
};

export const DashboardView: React.FC<DashboardViewProps> = ({
  products,
  ingredients,
  productionRuns,
  onNavigateTab,
  onRefresh,
}) => {
  const { isDark } = useTheme();
  const dateScrollRef = useRef<HTMLDivElement>(null);
  const desktopDateScrollRef = useRef<HTMLDivElement>(null);

  // Today's Date ISO
  const todayIso = useMemo(() => new Date().toISOString().split('T')[0], []);

  // Selected date filter for the interactive calendar strip - defaults to todayIso
  const [selectedDate, setSelectedDate] = useState<string | null>(todayIso);
  const activeDate = selectedDate || todayIso;

  // Financial & inventory calculations
  const totalFinishedGoodsValuation = products.reduce((acc, p) => {
    return acc + p.currentStock * p.wholesalePrice;
  }, 0);

  const totalRawValuation = ingredients.reduce((acc, ing) => {
    return acc + ing.currentStock * ing.avgCostPerUnit;
  }, 0);

  const totalWorkingCapital = totalFinishedGoodsValuation + totalRawValuation;

  const lowStockIngredients = ingredients.filter(
    (ing) => ing.isActive && ing.minStock > 0 && ing.currentStock <= ing.minStock
  );

  const completedBatchesCount = productionRuns.filter((r) => r.status === 'completed').length;
  const totalProducedUnits = productionRuns.reduce((acc, r) => acc + (r.actualQuantity || 0), 0);

  // Active Date Runs & Output based on selected date
  const activeDateRuns = useMemo(
    () => productionRuns.filter((r) => r.productionDate === activeDate && r.status === 'completed'),
    [productionRuns, activeDate]
  );
  const activeOutputKg = useMemo(
    () => activeDateRuns.reduce((acc, r) => acc + (r.actualQuantity || 0), 0),
    [activeDateRuns]
  );
  const dailyTargetBatches = 8;

  // Percentage Calculations for Gauges
  const batchesProgressPercent = Math.min(100, Math.round((activeDateRuns.length / dailyTargetBatches) * 100));
  const safeStockCount = ingredients.filter((i) => i.currentStock > i.minStock).length;
  const stockHealthPercent = ingredients.length > 0 ? Math.round((safeStockCount / ingredients.length) * 100) : 100;
  const productsWithRecipeCount = products.filter((p) => p.recipeId).length;
  const recipeCoveragePercent = products.length > 0 ? Math.round((productsWithRecipeCount / products.length) * 100) : 0;

  // Multi-week dates (14 days past + today + 7 days future) for smooth horizontal scrolling
  const multiWeekDays = useMemo(() => {
    const list: { iso: string; dayName: string; dayNum: number; monthName: string; isToday: boolean }[] = [];
    for (let i = 14; i >= -7; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const iso = d.toISOString().split('T')[0];
      const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
      const monthName = d.toLocaleDateString('en-US', { month: 'short' });
      const dayNum = d.getDate();
      list.push({
        iso,
        dayName,
        dayNum,
        monthName,
        isToday: iso === todayIso,
      });
    }
    return list;
  }, [todayIso]);

  // Scroll calendar horizontally
  const handleScrollWeeks = (direction: 'left' | 'right', isDesktop: boolean = false) => {
    const ref = isDesktop ? desktopDateScrollRef.current : dateScrollRef.current;
    if (ref) {
      const offset = direction === 'left' ? -260 : 260;
      ref.scrollBy({ left: offset, behavior: 'smooth' });
    }
  };

  // Production Volume Wave Chart (Last 7 Days)
  const waveChartData = useMemo(() => {
    const dateMap = new Map<string, { date: string; iso: string; output: number }>();
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const iso = d.toISOString().split('T')[0];
      const label = `${d.getDate()} ${d.toLocaleDateString('en-US', { weekday: 'short' })}`;
      dateMap.set(iso, { date: label, iso, output: 0 });
    }

    productionRuns.forEach((run) => {
      if (run.status === 'completed' && run.productionDate) {
        const item = dateMap.get(run.productionDate);
        if (item) {
          item.output += run.actualQuantity;
        }
      }
    });

    return Array.from(dateMap.values());
  }, [productionRuns]);

  // Filtered recent production runs based on selectedDate
  const displayedRuns = useMemo(() => {
    if (selectedDate) {
      return productionRuns.filter((r) => r.productionDate === selectedDate);
    }
    return productionRuns;
  }, [productionRuns, selectedDate]);

  const handleDeleteBatch = async (run: ProductionRun) => {
    const confirm = window.confirm(
      `ബാച്ച് #${run.runNumber} (${run.productName}) ഡാറ്റാബേസിൽ നിന്നും പൂർണ്ണമായി ഒഴിവാക്കണോ?\nAre you sure you want to permanently delete this production batch?`
    );
    if (!confirm) return;

    try {
      await deleteProductionRun(run.id);
      alert(`ബാച്ച് #${run.runNumber} പൂർണ്ണമായി ഒഴിവാക്കി.`);
      onRefresh?.();
    } catch (err: any) {
      alert(`ഡിലീറ്റ് പരാജയപ്പെട്ടു: ${err?.message || 'Failed to delete batch'}`);
    }
  };

  // Chart data: Top products by estimated wholesale value
  const productValuationData = products
    .map((p) => ({
      name: p.name,
      value: Math.round(p.currentStock * p.wholesalePrice),
      stock: p.currentStock,
      price: p.wholesalePrice,
      unit: p.unit,
    }))
    .filter((p) => p.stock > 0 || p.price > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  return (
    <div className="space-y-6 pb-20">
      {/* ============================================================ */}
      {/* MOBILE APP PWA LAYOUT                                        */}
      {/* ============================================================ */}
      <div className="md:hidden space-y-4">
        {/* "Your Activity" Card with 3 Circular Ring Progress Gauges */}
        <div className="p-4 rounded-3xl bg-white dark:bg-[#1E1B1B] border border-stone-200 dark:border-[#2E2828] shadow-apple-card dark:shadow-apple-card-dark transition-all">
          <div className="flex items-center justify-between mb-3 px-1">
            <div>
              <h2 className="text-sm font-black text-stone-900 dark:text-white">
                Daily Operations
              </h2>
              <p className="text-[11px] text-stone-400 font-malayalam">
                ഇന്നത്തെ പ്രവർത്തനങ്ങൾ
              </p>
            </div>
            <span className="text-[10px] font-black text-stone-400 uppercase tracking-wider">
              Live
            </span>
          </div>

          <div className="flex items-center justify-between gap-2 pt-1">
            {/* Ring 1: Batches (Orange) */}
            <CircularGauge
              label="Batches"
              value={String(activeDateRuns.length)}
              subValue={`/${dailyTargetBatches}`}
              percentage={batchesProgressPercent}
              color="#EA580C"
              subtext={activeDateRuns.length >= dailyTargetBatches ? 'ടാർഗെറ്റ് കഴിഞ്ഞു' : `${Math.max(0, dailyTargetBatches - activeDateRuns.length)} ബാക്കി`}
            />

            {/* Ring 2: Stock Health (Green) */}
            <CircularGauge
              label="Stock Health"
              value={`${stockHealthPercent}%`}
              subValue="/100%"
              percentage={stockHealthPercent}
              color="#10B981"
              subtext={lowStockIngredients.length > 0 ? `${lowStockIngredients.length} കുറവ്` : 'സുരക്ഷിതം'}
            />

            {/* Ring 3: Capacity / Coverage (Amber) */}
            <CircularGauge
              label="Capacity"
              value={`${recipeCoveragePercent}%`}
              subValue="/100%"
              percentage={recipeCoveragePercent}
              color="#F59E0B"
              subtext={`${productsWithRecipeCount}/${products.length} റെഡി`}
            />
          </div>
        </div>

        {/* Multi-Week Horizontal Scrolling Calendar Strip with smooth week navigation */}
        <div className="bg-white dark:bg-[#1E1B1B] rounded-2xl p-2 border border-stone-200 dark:border-[#2E2828] shadow-apple-card space-y-2">
          <div className="flex items-center justify-between px-2">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-black text-stone-800 dark:text-stone-200">
                Calendar
              </span>
              <button
                type="button"
                onClick={() => setSelectedDate(null)}
                className={`text-[10px] font-bold px-2 py-0.5 rounded-lg transition-colors ${
                  !selectedDate
                    ? 'bg-epso-orange text-white'
                    : 'text-stone-500 hover:text-stone-800 dark:hover:text-stone-200 bg-stone-100 dark:bg-[#282323]'
                }`}
              >
                All Dates
              </button>
            </div>

            <div className="flex items-center gap-1.5">
              <input
                type="date"
                value={selectedDate || ''}
                onChange={(e) => setSelectedDate(e.target.value || null)}
                className="text-[11px] px-2 py-0.5 rounded-lg border border-stone-200 dark:border-[#332c2c] bg-stone-50 dark:bg-[#282323] text-stone-800 dark:text-white"
                title="Choose custom date"
              />
              <button
                type="button"
                onClick={() => handleScrollWeeks('left')}
                className="p-1 rounded-lg hover:bg-stone-100 dark:hover:bg-[#282323] text-stone-500"
                title="Previous Week"
              >
                <FiChevronLeft className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => handleScrollWeeks('right')}
                className="p-1 rounded-lg hover:bg-stone-100 dark:hover:bg-[#282323] text-stone-500"
                title="Next Week"
              >
                <FiChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div
            ref={dateScrollRef}
            className="flex items-center gap-1.5 overflow-x-auto no-scrollbar scroll-smooth py-1 px-1"
          >
            {multiWeekDays.map((d) => {
              const isSelected = selectedDate === d.iso;
              return (
                <button
                  key={d.iso}
                  type="button"
                  onClick={() => setSelectedDate(selectedDate === d.iso ? null : d.iso)}
                  className={`py-2 px-2.5 rounded-xl flex flex-col items-center justify-center transition-all press-apple cursor-pointer shrink-0 min-w-[48px] ${
                    isSelected
                      ? 'bg-epso-orange text-white shadow-md font-black ring-2 ring-epso-orange/30'
                      : 'text-stone-600 dark:text-stone-400 hover:bg-stone-50 dark:hover:bg-[#282323]'
                  }`}
                >
                  <span className={`text-[10px] uppercase font-bold ${isSelected ? 'text-white' : 'text-stone-400'}`}>
                    {d.dayName}
                  </span>
                  <span className="text-sm font-black mt-0.5 leading-none">
                    {d.dayNum}
                  </span>
                  <span className={`text-[8px] uppercase mt-0.5 ${isSelected ? 'text-white/80' : 'text-stone-400'}`}>
                    {d.monthName}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Production Output Wave Area Chart Card */}
        <div className="p-4 rounded-3xl bg-white dark:bg-[#1E1B1B] border border-stone-200 dark:border-[#2E2828] shadow-apple-card dark:shadow-apple-card-dark transition-all">
          <div className="flex items-center justify-between mb-2">
            <div>
              <div className="flex items-center gap-1.5">
                <FiActivity className="w-4 h-4 text-epso-orange" />
                <h3 className="text-sm font-black text-stone-900 dark:text-white">
                  Production Output
                </h3>
              </div>
              <p className="text-[11px] text-stone-400 font-malayalam">
                ദിവസേനയുള്ള ഉൽപ്പാദന ട്രെൻഡ് (kg)
              </p>
            </div>
            <button
              onClick={() => onNavigateTab('insights')}
              className="text-xs text-epso-orange dark:text-amber-400 font-black flex items-center gap-0.5"
            >
              <span>More</span>
              <FiChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="h-44 w-full my-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={waveChartData} margin={{ top: 10, right: 8, left: -25, bottom: 0 }}>
                <defs>
                  <linearGradient id="mobileOrangeGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#EA580C" stopOpacity={0.45} />
                    <stop offset="95%" stopColor="#EA580C" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#282323' : '#F1F2F4'} vertical={false} />
                <XAxis dataKey="date" stroke={isDark ? '#78716C' : '#A8A29E'} fontSize={10} tickLine={false} />
                <YAxis stroke={isDark ? '#78716C' : '#A8A29E'} fontSize={10} tickLine={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: isDark ? '#141212' : '#FFFFFF',
                    borderColor: isDark ? '#2E2828' : '#E5E7EB',
                    borderRadius: '12px',
                    fontSize: '11px',
                  }}
                  formatter={(val: any) => [`${val} kg`, 'Output']}
                />
                <Area
                  type="monotone"
                  dataKey="output"
                  stroke="#EA580C"
                  strokeWidth={3}
                  fillOpacity={1}
                  fill="url(#mobileOrangeGradient)"
                  isAnimationActive={true}
                  animationDuration={1200}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Bottom Card Summary */}
          <div className="flex items-center justify-between pt-2 border-t border-stone-100 dark:border-[#282323] text-xs">
            <div>
              <span className="text-base font-black text-stone-900 dark:text-white">
                {activeOutputKg} kg
              </span>
              <p className="text-[10px] text-stone-400 font-semibold font-malayalam">
                {selectedDate ? `${selectedDate} ഉൽപ്പാദനം` : 'ഇന്ന് ഉൽപ്പാദിപ്പിച്ചത്'}
              </p>
            </div>
            <button
              onClick={() => onNavigateTab('movements')}
              className="px-3 py-1.5 rounded-xl bg-epso-orange hover:bg-orange-600 text-white font-black text-xs transition-all press-apple shadow-xs cursor-pointer"
            >
              Batch Logs
            </button>
          </div>
        </div>

        {/* Working Capital & Stock Capacity Quick Metrics */}
        <div className="p-4 rounded-3xl bg-white dark:bg-[#1E1B1B] border border-stone-200 dark:border-[#2E2828] shadow-apple-card dark:shadow-apple-card-dark space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-stone-500 font-malayalam">
              ആകെ പാൻട്രി മൂലധനം (Working Capital)
            </span>
            <span className="text-xs font-black text-epso-orange">
              ₹{totalWorkingCapital.toLocaleString('en-IN')}
            </span>
          </div>

          <div className="w-full h-3 rounded-full overflow-hidden bg-stone-100 dark:bg-stone-800 flex shadow-inner">
            <div
              style={{ width: `${stockHealthPercent}%` }}
              className="h-full bg-emerald-500"
              title={`Safe Stock: ${stockHealthPercent}%`}
            />
            <div
              style={{ width: `${100 - stockHealthPercent}%` }}
              className="h-full bg-amber-500"
              title={`Low Stock: ${100 - stockHealthPercent}%`}
            />
          </div>

          <div className="flex items-center justify-between text-[11px] font-bold text-stone-500">
            <span>Finished: ₹{totalFinishedGoodsValuation.toLocaleString('en-IN')}</span>
            <span>Raw: ₹{totalRawValuation.toLocaleString('en-IN')}</span>
          </div>
        </div>

        {/* Recent Batches List */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between px-1">
            <div>
              <h3 className="text-xs font-black text-stone-900 dark:text-white uppercase tracking-wider">
                {selectedDate ? `Batches: ${selectedDate}` : 'All Recent Batches'}
              </h3>
              <p className="text-[10px] text-stone-400 font-semibold">
                {displayedRuns.length} batches found
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              {selectedDate && (
                <button
                  onClick={() => setSelectedDate(null)}
                  className="text-xs text-stone-500 hover:text-stone-800 dark:hover:text-stone-200 font-bold"
                >
                  Clear filter
                </button>
              )}
              <button
                onClick={() => onNavigateTab('movements')}
                className="text-xs text-epso-orange font-bold hover:underline"
              >
                View All
              </button>
            </div>
          </div>

          {displayedRuns.length === 0 ? (
            <div className="p-6 rounded-2xl bg-white dark:bg-[#1E1B1B] border border-stone-200 dark:border-[#2E2828] text-center text-xs text-stone-400 font-malayalam">
              {selectedDate
                ? `${selectedDate} തീയതിയിൽ ബാച്ചുകൾ കണ്ടെത്തിയില്ല`
                : 'ബാച്ചുകൾ രേഖപ്പെടുത്തിയിട്ടില്ല'}
            </div>
          ) : (
            displayedRuns.map((run) => (
              <div
                key={run.id}
                className="p-3.5 rounded-2xl bg-white dark:bg-[#1E1B1B] border border-stone-200 dark:border-[#2E2828] shadow-apple-card dark:shadow-apple-card-dark flex flex-col gap-2 transition-all"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-orange-50 dark:bg-orange-950/40 text-epso-orange flex items-center justify-center font-black text-sm shrink-0">
                      {run.productName ? run.productName.slice(0, 1) : 'S'}
                    </div>
                    <div>
                      <h4 className="text-xs font-black text-stone-900 dark:text-white font-malayalam leading-tight">
                        {run.productName}
                      </h4>
                      <p className="text-[10px] text-stone-400 font-semibold mt-0.5">
                        #{run.runNumber} • {run.productionDate}
                      </p>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <span className="text-sm font-black text-stone-900 dark:text-white">
                        {run.actualQuantity} {run.unit}
                      </span>
                      <button
                        onClick={() => handleDeleteBatch(run)}
                        className="p-1 rounded-lg text-stone-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
                        title="Delete Batch Permanently"
                      >
                        <FiTrash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <p className="text-[10px] text-stone-400 font-semibold">{run.operatorName}</p>
                  </div>
                </div>

                {run.ingredientsConsumed && run.ingredientsConsumed.length > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap pt-1 border-t border-stone-100 dark:border-[#282323]">
                    {run.ingredientsConsumed.slice(0, 3).map((ing, idx) => (
                      <span
                        key={idx}
                        className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-stone-100 dark:bg-[#282323] text-stone-600 dark:text-stone-300"
                      >
                        {ing.ingredientName}: {ing.actualQuantity} {ing.unit}
                      </span>
                    ))}
                    {run.ingredientsConsumed.length > 3 && (
                      <span className="text-[10px] text-stone-400 font-bold">
                        +{run.ingredientsConsumed.length - 3} more
                      </span>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* ============================================================ */}
      {/* DESKTOP VIEW                                                 */}
      {/* ============================================================ */}
      <div className="hidden md:block space-y-6">
        {/* Top Header */}
        <div className="flex items-center justify-between pb-3 border-b border-stone-200 dark:border-[#2E2828]">
          <div>
            <h1 className="text-2xl font-black text-stone-900 dark:text-white">
              Dashboard
            </h1>
            <p className="text-xs text-stone-400 font-malayalam mt-0.5">
              തത്സമയ വിൽപന മൂല്യനിർണ്ണയവും ഉൽപ്പാദന കണക്കുകളും
            </p>
          </div>
        </div>

        {/* Multi-Week Horizontal Scrolling Calendar Strip (Desktop) */}
        <div className="bg-white dark:bg-[#1E1B1B] rounded-2xl p-3 border border-stone-200 dark:border-[#2E2828] shadow-apple-card space-y-2">
          <div className="flex items-center justify-between px-2">
            <div className="flex items-center gap-2">
              <FiCalendar className="w-4 h-4 text-epso-orange" />
              <span className="text-xs font-bold text-stone-800 dark:text-stone-200">
                Production Calendar
              </span>
              <span className="text-[11px] text-stone-400 font-malayalam">
                {selectedDate ? `(${selectedDate})` : '(എല്ലാ ദിവസങ്ങളും)'}
              </span>
              <button
                type="button"
                onClick={() => setSelectedDate(null)}
                className={`text-[10px] font-bold px-2.5 py-1 rounded-lg ml-2 transition-colors ${
                  !selectedDate
                    ? 'bg-epso-orange text-white'
                    : 'text-stone-500 hover:text-stone-800 dark:hover:text-stone-200 bg-stone-100 dark:bg-[#282323]'
                }`}
              >
                All Dates
              </button>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={selectedDate || ''}
                onChange={(e) => setSelectedDate(e.target.value || null)}
                className="text-xs px-2.5 py-1 rounded-xl border border-stone-200 dark:border-[#332c2c] bg-stone-50 dark:bg-[#282323] text-stone-800 dark:text-white"
                title="Select any custom calendar date"
              />
              <button
                type="button"
                onClick={() => handleScrollWeeks('left', true)}
                className="p-1.5 rounded-lg hover:bg-stone-100 dark:hover:bg-[#282323] text-stone-500 border border-stone-200 dark:border-[#332c2c] transition-colors"
                title="Previous Week"
              >
                <FiChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => handleScrollWeeks('right', true)}
                className="p-1.5 rounded-lg hover:bg-stone-100 dark:hover:bg-[#282323] text-stone-500 border border-stone-200 dark:border-[#332c2c] transition-colors"
                title="Next Week"
              >
                <FiChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div
            ref={desktopDateScrollRef}
            className="flex items-center gap-2 overflow-x-auto no-scrollbar scroll-smooth py-1 px-1"
          >
            {multiWeekDays.map((d) => {
              const isSelected = selectedDate === d.iso;
              return (
                <button
                  key={d.iso}
                  type="button"
                  onClick={() => setSelectedDate(selectedDate === d.iso ? null : d.iso)}
                  className={`py-2 px-3 rounded-xl flex flex-col items-center justify-center transition-all press-apple cursor-pointer shrink-0 min-w-[56px] ${
                    isSelected
                      ? 'bg-epso-orange text-white shadow-md font-black ring-2 ring-epso-orange/30'
                      : 'text-stone-600 dark:text-stone-400 hover:bg-stone-50 dark:hover:bg-[#282323]'
                  }`}
                >
                  <span className={`text-[10px] uppercase font-bold ${isSelected ? 'text-white' : 'text-stone-400'}`}>
                    {d.dayName}
                  </span>
                  <span className="text-base font-black mt-0.5 leading-none">
                    {d.dayNum}
                  </span>
                  <span className={`text-[9px] uppercase mt-0.5 ${isSelected ? 'text-white/80' : 'text-stone-400'}`}>
                    {d.monthName}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Critical Stock Alert Banner */}
        {lowStockIngredients.length > 0 && (
          <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-400">
                <FiAlertTriangle className="w-5 h-5 shrink-0" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-amber-900 dark:text-amber-300 font-malayalam">
                  കുറഞ്ഞ സ്റ്റോക്ക് മുന്നറിയിപ്പ് ({lowStockIngredients.length} ചേരുവകൾ)
                </h2>
                <p className="text-xs text-amber-700 dark:text-amber-400 font-malayalam">
                  {lowStockIngredients.map((i) => i.name).slice(0, 3).join(', ')} കുറവാണ്.
                </p>
              </div>
            </div>
            <button
              onClick={() => onNavigateTab('notifications')}
              className="px-3 py-1.5 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white whitespace-nowrap press-apple"
            >
              View Alerts
            </button>
          </div>
        )}

        {/* 4 Primary KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Total Finished Goods Valuation */}
          <div className="p-5 rounded-2xl bg-white dark:bg-[#1E1B1B] border border-stone-200 dark:border-[#2E2828] shadow-apple-card dark:shadow-apple-card-dark transition-all">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-stone-500 dark:text-stone-400 font-malayalam">
                ഉൽപ്പന്ന സ്റ്റോക്ക് മൂല്യം
              </span>
              <div className="p-2 rounded-xl bg-red-50 dark:bg-red-950/40 text-epso-red dark:text-amber-400">
                <FiDollarSign className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-black text-stone-900 dark:text-white">
              ₹{totalFinishedGoodsValuation.toLocaleString('en-IN')}
            </div>
            <p className="text-[11px] text-stone-400 mt-1 font-malayalam">
              മൊത്തവില അടിസ്ഥാനത്തിൽ (Wholesale)
            </p>
          </div>

          {/* Card 2: Total Raw Materials Cost */}
          <div className="p-5 rounded-2xl bg-white dark:bg-[#1E1B1B] border border-stone-200 dark:border-[#2E2828] shadow-apple-card dark:shadow-apple-card-dark transition-all">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-stone-500 dark:text-stone-400 font-malayalam">
                അസംസ്കൃത വസ്തു മൂല്യം
              </span>
              <div className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400">
                <FiBox className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-black text-stone-900 dark:text-white">
              ₹{totalRawValuation.toLocaleString('en-IN')}
            </div>
            <p className="text-[11px] text-stone-400 mt-1 font-malayalam">
              {ingredients.length} രജിസ്റ്റർ ചെയ്ത ചേരുവകൾ
            </p>
          </div>

          {/* Card 3: Production Batches */}
          <div className="p-5 rounded-2xl bg-white dark:bg-[#1E1B1B] border border-stone-200 dark:border-[#2E2828] shadow-apple-card dark:shadow-apple-card-dark transition-all">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-stone-500 dark:text-stone-400 font-malayalam">
                ഉൽപ്പാദന ബാച്ചുകൾ
              </span>
              <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400">
                <FiTrendingUp className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-black text-stone-900 dark:text-white">
              {completedBatchesCount}
              <span className="text-sm font-normal text-stone-400 ml-1.5 font-malayalam">ബാച്ചുകൾ</span>
            </div>
            <p className="text-[11px] text-stone-400 mt-1 font-malayalam">
              ആകെ പൂർത്തിയായ ബാച്ചുകൾ
            </p>
          </div>

          {/* Card 4: Products Catalogue */}
          <div className="p-5 rounded-2xl bg-white dark:bg-[#1E1B1B] border border-stone-200 dark:border-[#2E2828] shadow-apple-card dark:shadow-apple-card-dark transition-all">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-stone-500 dark:text-stone-400 font-malayalam">
                സ്നാക്ക് ഉൽപ്പന്നങ്ങൾ
              </span>
              <div className="p-2 rounded-xl bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400">
                <FiPackage className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-black text-stone-900 dark:text-white">
              {products.length}
              <span className="text-sm font-normal text-stone-400 ml-1.5 font-malayalam">ഇനങ്ങൾ</span>
            </div>
            <p className="text-[11px] text-stone-400 mt-1 font-malayalam">
              {products.filter((p) => p.wholesalePrice > 0).length} മൊത്തവില നിശ്ചയിച്ചവ
            </p>
          </div>
        </div>

        {/* Desktop Charts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Chart 1: Product Inventory Valuation */}
          <div className="p-5 rounded-2xl bg-white dark:bg-[#1E1B1B] border border-stone-200 dark:border-[#2E2828] shadow-apple-card dark:shadow-apple-card-dark">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-black text-stone-900 dark:text-white">
                  Stock Valuation by Product
                </h2>
                <p className="text-xs text-stone-400 font-malayalam">
                  ഉയർന്ന മൂല്യമുള്ള ഫിനിഷ്ഡ് സ്നാക്കുകൾ
                </p>
              </div>
              <button
                onClick={() => onNavigateTab('products')}
                className="text-xs text-epso-red dark:text-amber-400 font-black flex items-center gap-1 hover:underline"
              >
                <span>View More</span>
                <FiArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={productValuationData} margin={{ top: 10, right: 10, left: -20, bottom: 25 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#2E2828' : '#F1F2F4'} vertical={false} />
                  <XAxis
                    dataKey="name"
                    stroke={isDark ? '#A39E9B' : '#6B7280'}
                    fontSize={10}
                    tickLine={false}
                    interval={0}
                    angle={-25}
                    textAnchor="end"
                  />
                  <YAxis stroke={isDark ? '#A39E9B' : '#6B7280'} fontSize={10} tickLine={false} tickFormatter={(val) => `₹${val}`} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: isDark ? '#141212' : '#FFFFFF',
                      borderColor: isDark ? '#2E2828' : '#E5E7EB',
                      borderRadius: '12px',
                      fontSize: '11px',
                    }}
                    formatter={(val: any) => [`₹${Number(val).toLocaleString('en-IN')}`, 'Valuation']}
                  />
                  <Bar dataKey="value" radius={[6, 6, 0, 0]} isAnimationActive={true} animationDuration={1000}>
                    {productValuationData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={index % 2 === 0 ? '#C6382B' : '#F59E0B'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Chart 2: Production Volume Trends */}
          <div className="p-5 rounded-2xl bg-white dark:bg-[#1E1B1B] border border-stone-200 dark:border-[#2E2828] shadow-apple-card dark:shadow-apple-card-dark">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-black text-stone-900 dark:text-white">
                  Production Output Curve
                </h2>
                <p className="text-xs text-stone-400 font-malayalam">
                  ദിവസേനയുള്ള ഉൽപ്പാദന അളവ് (Output in kg)
                </p>
              </div>
              <button
                onClick={() => onNavigateTab('insights')}
                className="text-xs text-epso-orange dark:text-amber-400 font-black flex items-center gap-1 hover:underline"
              >
                <span>Insights</span>
                <FiArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={waveChartData} margin={{ top: 10, right: 10, left: -20, bottom: 25 }}>
                  <defs>
                    <linearGradient id="desktopOrangeGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#EA580C" stopOpacity={0.45} />
                      <stop offset="95%" stopColor="#EA580C" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#2E2828' : '#F1F2F4'} vertical={false} />
                  <XAxis dataKey="date" stroke={isDark ? '#A39E9B' : '#6B7280'} fontSize={10} tickLine={false} />
                  <YAxis stroke={isDark ? '#A39E9B' : '#6B7280'} fontSize={10} tickLine={false} tickFormatter={(val) => `${val}kg`} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: isDark ? '#141212' : '#FFFFFF',
                      borderColor: isDark ? '#2E2828' : '#E5E7EB',
                      borderRadius: '12px',
                      fontSize: '11px',
                    }}
                    formatter={(val: any) => [`${val} kg`, 'Output']}
                  />
                  <Area
                    type="monotone"
                    dataKey="output"
                    stroke="#EA580C"
                    strokeWidth={3}
                    fillOpacity={1}
                    fill="url(#desktopOrangeGradient)"
                    isAnimationActive={true}
                    animationDuration={1200}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Recent Production Batches Table */}
        <div className="p-5 rounded-2xl bg-white dark:bg-[#1E1B1B] border border-stone-200 dark:border-[#2E2828] shadow-apple-card dark:shadow-apple-card-dark">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <FiClock className="w-4 h-4 text-epso-red dark:text-amber-400" />
              <div>
                <h2 className="text-sm font-black text-stone-900 dark:text-white">
                  {selectedDate ? `Production Batches: ${selectedDate}` : 'All Production Batches'}
                </h2>
                <p className="text-[11px] text-stone-400 font-semibold font-malayalam">
                  {displayedRuns.length} ബാച്ചുകൾ കണ്ടെത്തി
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {selectedDate && (
                <button
                  onClick={() => setSelectedDate(null)}
                  className="text-xs px-2.5 py-1 rounded-lg bg-stone-100 dark:bg-[#282323] text-stone-600 dark:text-stone-300 hover:text-stone-900 font-bold"
                >
                  Clear Date Filter
                </button>
              )}
              <button
                onClick={() => onNavigateTab('movements')}
                className="text-xs text-epso-red dark:text-amber-400 font-bold hover:underline"
              >
                View Ledger
              </button>
            </div>
          </div>

          {displayedRuns.length === 0 ? (
            <div className="py-8 text-center text-xs text-stone-400 dark:text-stone-500 font-malayalam">
              {selectedDate ? `${selectedDate} തീയതിയിൽ ബാച്ചുകൾ കണ്ടെത്തിയില്ല.` : 'ഉൽപ്പാദന ബാച്ചുകൾ ഇതുവരെ രേഖപ്പെടുത്തിയിട്ടില്ല.'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="border-b border-stone-100 dark:border-[#2E2828] text-stone-400 font-semibold">
                    <th className="py-2.5 px-3">Run #</th>
                    <th className="py-2.5 px-3">Product</th>
                    <th className="py-2.5 px-3">Date</th>
                    <th className="py-2.5 px-3">Output</th>
                    <th className="py-2.5 px-3">Operator</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 dark:divide-[#2E2828]/50">
                  {displayedRuns.slice(0, 15).map((run) => (
                    <tr key={run.id} className="hover:bg-stone-50 dark:hover:bg-[#282323] transition-colors">
                      <td className="py-2.5 px-3 font-mono font-bold text-stone-900 dark:text-white">
                        {run.runNumber}
                      </td>
                      <td className="py-2.5 px-3 font-medium text-stone-900 dark:text-stone-200">
                        {run.productName}
                      </td>
                      <td className="py-2.5 px-3 text-stone-500 dark:text-stone-400">
                        {run.productionDate}
                      </td>
                      <td className="py-2.5 px-3 font-bold text-stone-900 dark:text-white">
                        {run.actualQuantity} {run.unit}
                      </td>
                      <td className="py-2.5 px-3 text-stone-500 dark:text-stone-400">
                        {run.operatorName}
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            run.status === 'completed'
                              ? 'bg-emerald-100 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-400'
                              : 'bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400'
                          }`}
                        >
                          {run.status === 'completed' ? 'Completed' : 'Cancelled'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <button
                          onClick={() => handleDeleteBatch(run)}
                          className="p-1 rounded-lg text-stone-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
                          title="Delete Batch Permanently"
                        >
                          <FiTrash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
