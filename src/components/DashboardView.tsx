import React, { useState, useMemo, useRef, useEffect } from 'react';
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
  FiShoppingBag,
  FiRefreshCw,
} from 'react-icons/fi';
import {
  deleteProductionRun,
  fetchSales,
  fetchDailyClosing,
  fetchTotalPacketsForDate,
  fetchDailyWage,
} from '../services/supabase';
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
import { AnimatedNumber } from './AnimatedNumber';

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
  const [animatedPercent, setAnimatedPercent] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      setAnimatedPercent(percentage);
    }, 150);
    return () => clearTimeout(timer);
  }, [percentage]);

  const size = 76;
  const strokeWidth = 7;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset =
    circumference - (circumference * Math.min(100, Math.max(0, animatedPercent))) / 100;

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
  const mobileDateInputRef = useRef<HTMLInputElement>(null);
  const desktopDateInputRef = useRef<HTMLInputElement>(null);

  const openCalendarPicker = (isDesktop: boolean) => {
    const ref = isDesktop ? desktopDateInputRef.current : mobileDateInputRef.current;
    if (ref) {
      try {
        if ('showPicker' in HTMLInputElement.prototype) {
          ref.showPicker();
        } else {
          ref.focus();
        }
      } catch {
        ref.focus();
      }
    }
  };

  // Today's Date ISO
  const todayIso = useMemo(() => new Date().toISOString().split('T')[0], []);

  // Selected date filter: null = all days (normal trend). Selecting a day shows that day only. Clicking again resets to null.
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const activeDate = selectedDate || todayIso;

  // Sales state & totals
  const [salesList, setSalesList] = useState<any[]>([]);
  const [dailyClosing, setDailyClosing] = useState<any>(null);
  const [todayWage, setTodayWage] = useState<any>(null);
  const [todayPacketsCount, setTodayPacketsCount] = useState<number>(0);

  useEffect(() => {
    fetchSales().then((data) => setSalesList(data)).catch(() => {});
  }, []);

  useEffect(() => {
    fetchDailyClosing(activeDate).then(setDailyClosing).catch(() => setDailyClosing(null));
    fetchDailyWage(activeDate).then(setTodayWage).catch(() => setTodayWage(null));
    fetchTotalPacketsForDate(activeDate).then(setTodayPacketsCount).catch(() => setTodayPacketsCount(0));
  }, [activeDate]);

  const todaySalesTotal = useMemo(() => {
    return salesList
      .filter((s) => s.sale_date === todayIso)
      .reduce((sum, s) => sum + (Number(s.total_amount) || 0), 0);
  }, [salesList, todayIso]);

  const monthSalesTotal = useMemo(() => {
    const currentMonth = todayIso.substring(0, 7);
    return salesList
      .filter((s) => s.sale_date && s.sale_date.startsWith(currentMonth))
      .reduce((sum, s) => sum + (Number(s.total_amount) || 0), 0);
  }, [salesList, todayIso]);

  // Map of total produced kg per product from completed production runs
  const productProducedKgMap = useMemo(() => {
    const map = new Map<string, number>();
    productionRuns
      .filter((r) => r.status === 'completed')
      .forEach((r) => {
        map.set(r.productId, (map.get(r.productId) || 0) + (r.actualQuantity || 0));
      });
    return map;
  }, [productionRuns]);

  // Map of total sold kg per product from sales
  const productSoldKgMap = useMemo(() => {
    const map = new Map<string, number>();
    salesList.forEach((s) => {
      if (s.product_id) {
        map.set(s.product_id, (map.get(s.product_id) || 0) + (Number(s.quantity) || 0));
      }
    });
    return map;
  }, [salesList]);

  // Financial & inventory calculations - dynamic valuation based on actual finished inventory
  const totalFinishedGoodsValuation = useMemo(() => {
    return products.reduce((acc, p) => {
      const produced = productProducedKgMap.get(p.id) || 0;
      const sold = productSoldKgMap.get(p.id) || 0;
      const netStock = p.currentStock > 0 ? p.currentStock : Math.max(0, produced - sold);
      const effectivePrice = p.wholesalePrice > 0 ? p.wholesalePrice : 160;
      return acc + Math.round(netStock * effectivePrice);
    }, 0);
  }, [products, productProducedKgMap, productSoldKgMap]);

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

  // Single-day product breakdown when a specific date is selected
  const singleDayProductData = useMemo(() => {
    if (!selectedDate) return [];
    const map = new Map<string, number>();
    activeDateRuns.forEach((r) => {
      const pName = r.productName || 'Product';
      map.set(pName, (map.get(pName) || 0) + (r.actualQuantity || 0));
    });
    return Array.from(map.entries()).map(([name, output]) => ({
      name,
      output,
    }));
  }, [selectedDate, activeDateRuns]);

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

  const [deletingBatchId, setDeletingBatchId] = useState<string | null>(null);

  const handleDeleteBatch = async (run: ProductionRun) => {
    const confirm = window.confirm(
      `ബാച്ച് #${run.runNumber} (${run.productName}) ഡാറ്റാബേസിൽ നിന്നും പൂർണ്ണമായി ഒഴിവാക്കണോ?\nAre you sure you want to permanently delete this production batch?`
    );
    if (!confirm) return;

    try {
      setDeletingBatchId(run.id);
      await deleteProductionRun(run.id);
      onRefresh?.();
    } catch (err: any) {
      alert(`ഡിലീറ്റ് പരാജയപ്പെട്ടു: ${err?.message || 'Failed to delete batch'}`);
    } finally {
      setDeletingBatchId(null);
    }
  };

  // Chart data: Top products by estimated wholesale value
  const productValuationData = useMemo(() => {
    const items = products.map((p) => {
      const produced = productProducedKgMap.get(p.id) || 0;
      const sold = productSoldKgMap.get(p.id) || 0;
      const netStock = p.currentStock > 0 ? p.currentStock : Math.max(0, produced - sold);
      const effectivePrice = p.wholesalePrice > 0 ? p.wholesalePrice : 160;
      const valuation = Math.round(netStock * effectivePrice);

      return {
        name: p.name,
        value: valuation,
        stock: Number(netStock.toFixed(1)),
        price: effectivePrice,
        unit: p.unit || 'kg',
      };
    });

    const withValue = items.filter((p) => p.value > 0);
    if (withValue.length > 0) {
      return withValue.sort((a, b) => b.value - a.value).slice(0, 8);
    }
    // If no net stock, rank by total produced volume with benchmark price
    const fromRuns = Array.from(productProducedKgMap.entries()).map(([pId, qty]) => {
      const p = products.find((prod) => prod.id === pId);
      const name = p?.name || 'Product';
      const price = p?.wholesalePrice && p.wholesalePrice > 0 ? p.wholesalePrice : 160;
      return {
        name,
        value: Math.round(qty * price),
        stock: Number(qty.toFixed(1)),
        price,
        unit: p?.unit || 'kg',
      };
    });
    if (fromRuns.length > 0) {
      return fromRuns.sort((a, b) => b.value - a.value).slice(0, 8);
    }
    return items.slice(0, 8);
  }, [products, productProducedKgMap, productSoldKgMap]);

  return (
    <div className="space-y-6 pb-20">
      {/* ============================================================ */}
      {/* MOBILE APP PWA LAYOUT                                        */}
      {/* ============================================================ */}
      <div className="md:hidden space-y-4">
        {/* "Your Activity" Card with 3 Circular Ring Progress Gauges - with entrance animation */}
        <div className="p-4 rounded-3xl bg-white dark:bg-[#1E1B1B] border border-stone-200 dark:border-[#2E2828] shadow-apple-card dark:shadow-apple-card-dark transition-all animate-daily-ops">
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

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
            {/* Ring 1: Batches (Orange) */}
            <CircularGauge
              label="Batches"
              value={String(activeDateRuns.length)}
              subValue={`/${dailyTargetBatches}`}
              percentage={batchesProgressPercent}
              color="#EA580C"
              subtext={activeDateRuns.length >= dailyTargetBatches ? 'ടാർഗെറ്റ് കഴിഞ്ഞു' : `${Math.max(0, dailyTargetBatches - activeDateRuns.length)} ബാക്കി`}
            />

            {/* Ring 2: Output (Amber) */}
            <CircularGauge
              label="Output"
              value={`${activeOutputKg}`}
              subValue="kg"
              percentage={Math.min(100, Math.round((activeOutputKg / 150) * 100))}
              color="#F59E0B"
              subtext="ഉൽപ്പാദനം"
            />

            {/* Ring 3: Packets (Purple) */}
            <CircularGauge
              label="Packets"
              value={String(todayPacketsCount)}
              subValue="pkts"
              percentage={Math.min(100, Math.round((todayPacketsCount / 200) * 100))}
              color="#8B5CF6"
              subtext="പാക്കിങ്"
            />

            {/* Ring 4: Stock Health (Green) */}
            <CircularGauge
              label="Stock Health"
              value={`${stockHealthPercent}%`}
              subValue="/100%"
              percentage={stockHealthPercent}
              color="#10B981"
              subtext={lowStockIngredients.length > 0 ? `${lowStockIngredients.length} കുറവ്` : 'സുരക്ഷിതം'}
            />
          </div>

          {/* Mobile Quick Action Buttons */}
          <div className="mt-3 pt-2.5 border-t border-stone-100 dark:border-[#282323] grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onNavigateTab('ingredients')}
              className="py-1.5 px-2 rounded-xl text-[11px] font-bold bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-900/50 flex items-center justify-center gap-1 press-apple font-malayalam"
            >
              <span>➕ പർച്ചേസ്</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigateTab('wages')}
              className="py-1.5 px-2 rounded-xl text-[11px] font-bold bg-orange-50 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300 border border-orange-200 dark:border-orange-900/50 flex items-center justify-center gap-1 press-apple font-malayalam"
            >
              <span>🍳 കൂലി</span>
              <span className="text-[9px] font-mono opacity-80">{todayWage ? '✓' : 'Pending'}</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigateTab('sales')}
              className="py-1.5 px-2 rounded-xl text-[11px] font-bold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900/50 flex items-center justify-center gap-1 press-apple font-malayalam"
            >
              <span>💰 വിൽപ്പന</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigateTab('costing')}
              className="py-1.5 px-2 rounded-xl text-[11px] font-bold bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-900/50 flex items-center justify-center gap-1 press-apple font-malayalam"
            >
              <span>📊 കോസ്റ്റിംഗ്</span>
            </button>
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
                className={`text-[10px] font-bold px-2 py-0.5 rounded-lg transition-colors cursor-pointer ${
                  !selectedDate
                    ? 'bg-epso-orange text-white'
                    : 'text-stone-500 hover:text-stone-800 dark:hover:text-stone-200 bg-stone-100 dark:bg-[#282323]'
                }`}
              >
                All Dates
              </button>
            </div>

            <div className="flex items-center gap-1.5">
              {/* Clickable Date Container: Clicking dd/mm/yy or calendar icon opens calendar */}
              <div
                onClick={() => openCalendarPicker(false)}
                className="relative flex items-center gap-1 px-2 py-1 rounded-lg border border-stone-200 dark:border-[#332c2c] bg-stone-50 dark:bg-[#282323] cursor-pointer hover:border-epso-orange transition-colors select-none group"
                title="Click date to open calendar"
              >
                <FiCalendar className="w-3.5 h-3.5 text-epso-orange pointer-events-none group-hover:scale-110 transition-transform" />
                <span className="text-[11px] font-bold text-stone-700 dark:text-stone-200 pointer-events-none">
                  {selectedDate ? selectedDate.split('-').reverse().join('/') : 'dd/mm/yy'}
                </span>
                <input
                  ref={mobileDateInputRef}
                  type="date"
                  value={selectedDate || ''}
                  onChange={(e) => setSelectedDate(e.target.value || null)}
                  onClick={(e) => {
                    try {
                      (e.target as any).showPicker?.();
                    } catch {}
                  }}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
              </div>

              <button
                type="button"
                onClick={() => handleScrollWeeks('left')}
                className="p-1 rounded-lg hover:bg-stone-100 dark:hover:bg-[#282323] text-stone-500 cursor-pointer"
                title="Previous Week"
              >
                <FiChevronLeft className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => handleScrollWeeks('right')}
                className="p-1 rounded-lg hover:bg-stone-100 dark:hover:bg-[#282323] text-stone-500 cursor-pointer"
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

        {/* Production Output Card (Shows only for that day when selected, normal 7-day trend when unselected) */}
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
                {selectedDate
                  ? `${selectedDate} ഉൽപ്പാദനം (${activeOutputKg} kg)`
                  : 'ദിവസേനയുള്ള ഉൽപ്പാദന ട്രെൻഡ് (kg)'}
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              {selectedDate && (
                <button
                  onClick={() => setSelectedDate(null)}
                  className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-orange-100 dark:bg-orange-950/60 text-epso-orange transition-colors cursor-pointer"
                  title="Click to reset to all days normal trend"
                >
                  All Days
                </button>
              )}
              <button
                onClick={() => onNavigateTab('insights')}
                className="text-xs text-epso-orange dark:text-amber-400 font-black flex items-center gap-0.5 cursor-pointer"
              >
                <span>More</span>
                <FiChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="h-44 w-full my-2">
            {selectedDate ? (
              singleDayProductData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={singleDayProductData} margin={{ top: 10, right: 8, left: -25, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#282323' : '#F1F2F4'} vertical={false} />
                    <XAxis dataKey="name" stroke={isDark ? '#78716C' : '#A8A29E'} fontSize={10} tickLine={false} />
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
                    <Bar dataKey="output" fill="#EA580C" radius={[6, 6, 0, 0]} isAnimationActive={true} animationDuration={600} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center p-3">
                  <FiPackage className="w-7 h-7 text-stone-300 dark:text-stone-600 mb-1" />
                  <p className="text-xs font-bold text-stone-700 dark:text-stone-300">
                    0 kg produced on {selectedDate}
                  </p>
                  <button
                    onClick={() => setSelectedDate(null)}
                    className="mt-1 text-[11px] text-epso-orange font-bold hover:underline cursor-pointer"
                  >
                    Show 7-Day Trend (Normal)
                  </button>
                </div>
              )
            ) : (
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
            )}
          </div>

          {/* Bottom Card Summary */}
          <div className="flex items-center justify-between pt-2 border-t border-stone-100 dark:border-[#282323] text-xs">
            <div>
              <span className="text-base font-black text-stone-900 dark:text-white">
                <AnimatedNumber value={activeOutputKg} suffix=" kg" decimals={1} />
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
              <AnimatedNumber value={totalWorkingCapital} prefix="₹" />
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
            <span>Finished: <AnimatedNumber value={totalFinishedGoodsValuation} prefix="₹" /></span>
            <span>Raw: <AnimatedNumber value={totalRawValuation} prefix="₹" /></span>
          </div>
        </div>

        {/* Mobile Sales Summary Banner */}
        <div
          onClick={() => onNavigateTab('sales')}
          className="p-4 rounded-3xl bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-[#1E1B1B] border border-emerald-200/80 dark:border-emerald-900/50 shadow-apple-card flex items-center justify-between cursor-pointer press-apple transition-all"
        >
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-emerald-500 text-white shadow-sm">
              <FiShoppingBag className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[11px] font-bold text-emerald-800 dark:text-emerald-300 font-malayalam">
                ഇന്നത്തെ വിൽപ്പന (Today's Sales)
              </p>
              <p className="text-lg font-black text-emerald-600 dark:text-emerald-400 font-mono leading-tight">
                <AnimatedNumber value={todaySalesTotal} prefix="₹" decimals={2} />
              </p>
            </div>
          </div>
          <div className="text-right">
            <span className="text-[10px] text-stone-400 block font-malayalam">ഈ മാസം</span>
            <span className="text-xs font-bold text-stone-700 dark:text-stone-300 font-mono">
              ₹{monthSalesTotal.toFixed(0)}
            </span>
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
                        disabled={deletingBatchId === run.id}
                        className="p-1 rounded-lg text-stone-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors disabled:opacity-50"
                        title="Delete Batch Permanently"
                      >
                        {deletingBatchId === run.id ? (
                          <FiRefreshCw className="w-3.5 h-3.5 animate-spin text-red-500" />
                        ) : (
                          <FiTrash2 className="w-3.5 h-3.5" />
                        )}
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
              {/* Clickable Date Container (Desktop): Clicking dd/mm/yyyy or calendar icon opens calendar */}
              <div
                onClick={() => openCalendarPicker(true)}
                className="relative flex items-center gap-2 px-3 py-1.5 rounded-xl border border-stone-200 dark:border-[#332c2c] bg-stone-50 dark:bg-[#282323] cursor-pointer hover:border-epso-orange transition-colors select-none group"
                title="Click date to open calendar"
              >
                <FiCalendar className="w-4 h-4 text-epso-orange pointer-events-none group-hover:scale-110 transition-transform" />
                <span className="text-xs font-bold text-stone-700 dark:text-stone-200 pointer-events-none">
                  {selectedDate ? selectedDate.split('-').reverse().join('/') : 'dd/mm/yyyy'}
                </span>
                <input
                  ref={desktopDateInputRef}
                  type="date"
                  value={selectedDate || ''}
                  onChange={(e) => setSelectedDate(e.target.value || null)}
                  onClick={(e) => {
                    try {
                      (e.target as any).showPicker?.();
                    } catch {}
                  }}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
              </div>

              <button
                type="button"
                onClick={() => handleScrollWeeks('left', true)}
                className="p-1.5 rounded-lg hover:bg-stone-100 dark:hover:bg-[#282323] text-stone-500 border border-stone-200 dark:border-[#332c2c] transition-colors cursor-pointer"
                title="Previous Week"
              >
                <FiChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => handleScrollWeeks('right', true)}
                className="p-1.5 rounded-lg hover:bg-stone-100 dark:hover:bg-[#282323] text-stone-500 border border-stone-200 dark:border-[#332c2c] transition-colors cursor-pointer"
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

        {/* Daily Operations Card (Desktop) with smooth load animation */}
        <div className="p-5 rounded-2xl bg-white dark:bg-[#1E1B1B] border border-stone-200 dark:border-[#2E2828] shadow-apple-card dark:shadow-apple-card-dark transition-all animate-daily-ops">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-black text-stone-900 dark:text-white">
                Daily Operations
              </h2>
              <p className="text-xs text-stone-400 font-malayalam">
                ഇന്നത്തെ പ്രവർത്തനങ്ങൾ (Live Operations Status)
              </p>
            </div>
            <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 uppercase tracking-wider">
              Live
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 pt-1">
            <CircularGauge
              label="Batches"
              value={String(activeDateRuns.length)}
              subValue={`/${dailyTargetBatches}`}
              percentage={batchesProgressPercent}
              color="#EA580C"
              subtext={activeDateRuns.length >= dailyTargetBatches ? 'ടാർഗെറ്റ് കഴിഞ്ഞു' : `${Math.max(0, dailyTargetBatches - activeDateRuns.length)} ബാക്കി`}
            />
            <CircularGauge
              label="Production Output"
              value={`${activeOutputKg}`}
              subValue="kg"
              percentage={Math.min(100, Math.round((activeOutputKg / 150) * 100))}
              color="#F59E0B"
              subtext="ഉൽപ്പാദനം"
            />
            <CircularGauge
              label="Packets Packed"
              value={String(todayPacketsCount)}
              subValue="pkts"
              percentage={Math.min(100, Math.round((todayPacketsCount / 200) * 100))}
              color="#8B5CF6"
              subtext="പാക്കിങ് ചെയ്തവ"
            />
            <CircularGauge
              label="Oil Usage"
              value={dailyClosing ? `${dailyClosing.oilConsumed}` : '0'}
              subValue="kg"
              percentage={dailyClosing && dailyClosing.oilConsumed > 0 ? 100 : 0}
              color="#0284C7"
              subtext={dailyClosing ? 'രേഖപ്പെടുത്തി' : 'ബാക്കി'}
            />
            <CircularGauge
              label="Stock Health"
              value={`${stockHealthPercent}%`}
              subValue="/100%"
              percentage={stockHealthPercent}
              color="#10B981"
              subtext={lowStockIngredients.length > 0 ? `${lowStockIngredients.length} കുറവ്` : 'സുരക്ഷിതം'}
            />
          </div>

          {/* Quick Operations Action Bar */}
          <div className="mt-4 pt-3 border-t border-stone-100 dark:border-[#282323] flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] font-bold text-stone-400 font-malayalam">
              പ്രധാന പ്രവർത്തനങ്ങൾ (Quick Operations):
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => onNavigateTab('ingredients')}
                className="px-3 py-1.5 rounded-xl text-xs font-bold bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/60 border border-amber-200 dark:border-amber-900/50 flex items-center gap-1.5 press-apple font-malayalam cursor-pointer transition-all"
              >
                <span>➕ പർച്ചേസ് ചേർക്കുക</span>
              </button>
              <button
                type="button"
                onClick={() => onNavigateTab('wages')}
                className="px-3 py-1.5 rounded-xl text-xs font-bold bg-orange-50 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300 hover:bg-orange-100 dark:hover:bg-orange-900/60 border border-orange-200 dark:border-orange-900/50 flex items-center gap-1.5 press-apple font-malayalam cursor-pointer transition-all"
              >
                <span>🍳 കൂലി കണക്ക്</span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-md bg-orange-200/60 dark:bg-orange-900/80">
                  {todayWage ? `₹${todayWage.totalWageBudget}` : 'Pending'}
                </span>
              </button>
              <button
                type="button"
                onClick={() => onNavigateTab('sales')}
                className="px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 border border-emerald-200 dark:border-emerald-900/50 flex items-center gap-1.5 press-apple font-malayalam cursor-pointer transition-all"
              >
                <span>💰 വിൽപ്പന രേഖപ്പെടുത്തുക</span>
              </button>
              <button
                type="button"
                onClick={() => onNavigateTab('costing')}
                className="px-3 py-1.5 rounded-xl text-xs font-bold bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-900/60 border border-purple-200 dark:border-purple-900/50 flex items-center gap-1.5 press-apple font-malayalam cursor-pointer transition-all"
              >
                <span>📊 കോസ്റ്റിംഗ് വിശകലനം</span>
              </button>
            </div>
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

        {/* 5 Primary KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {/* Card 1: Today's Sales */}
          <div
            onClick={() => onNavigateTab('sales')}
            className="p-5 rounded-2xl bg-white dark:bg-[#1E1B1B] border border-stone-200 dark:border-[#2E2828] hover:border-emerald-500/50 shadow-apple-card dark:shadow-apple-card-dark transition-all cursor-pointer group"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-stone-500 dark:text-stone-400 font-malayalam">
                ഇന്നത്തെ വിൽപ്പന
              </span>
              <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 group-hover:scale-105 transition-transform">
                <FiShoppingBag className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 font-mono">
              <AnimatedNumber value={todaySalesTotal} prefix="₹" decimals={2} />
            </div>
            <div className="flex items-center justify-between mt-1 text-[11px] text-stone-400 font-malayalam">
              <span>മാസം: ₹{monthSalesTotal.toFixed(0)}</span>
              <span className="text-emerald-500 font-bold flex items-center gap-0.5">
                വിൽപ്പന <FiChevronRight className="w-3 h-3" />
              </span>
            </div>
          </div>

          {/* Card 2: Total Finished Goods Valuation */}
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
              <AnimatedNumber value={totalFinishedGoodsValuation} prefix="₹" />
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
              <AnimatedNumber value={totalRawValuation} prefix="₹" />
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
              <AnimatedNumber value={completedBatchesCount} />
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
              <AnimatedNumber value={products.length} />
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

          {/* Chart 2: Production Volume Trends (Desktop - shows single-day breakdown when selected, 7-day trend when not) */}
          <div className="p-5 rounded-2xl bg-white dark:bg-[#1E1B1B] border border-stone-200 dark:border-[#2E2828] shadow-apple-card dark:shadow-apple-card-dark">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-black text-stone-900 dark:text-white">
                  {selectedDate ? `Production Output: ${selectedDate}` : 'Production Output Curve'}
                </h2>
                <p className="text-xs text-stone-400 font-malayalam">
                  {selectedDate
                    ? `${selectedDate} തീയതിയിലെ ഉൽപ്പാദനം (${activeOutputKg} kg)`
                    : 'ദിവസേനയുള്ള ഉൽപ്പാദന അളവ് (Output in kg)'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {selectedDate && (
                  <button
                    onClick={() => setSelectedDate(null)}
                    className="text-xs px-2.5 py-1 rounded-lg bg-orange-100 dark:bg-orange-950/60 text-epso-orange font-bold transition-colors cursor-pointer"
                  >
                    Reset to All Days
                  </button>
                )}
                <button
                  onClick={() => onNavigateTab('insights')}
                  className="text-xs text-epso-orange dark:text-amber-400 font-black flex items-center gap-1 hover:underline cursor-pointer"
                >
                  <span>Insights</span>
                  <FiArrowUpRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="h-64 w-full">
              {selectedDate ? (
                singleDayProductData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={singleDayProductData} margin={{ top: 10, right: 10, left: -20, bottom: 25 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#2E2828' : '#F1F2F4'} vertical={false} />
                      <XAxis dataKey="name" stroke={isDark ? '#A39E9B' : '#6B7280'} fontSize={10} tickLine={false} />
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
                      <Bar dataKey="output" fill="#EA580C" radius={[6, 6, 0, 0]} isAnimationActive={true} animationDuration={600} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-center p-6">
                    <FiPackage className="w-10 h-10 text-stone-300 dark:text-stone-600 mb-2" />
                    <p className="text-sm font-bold text-stone-700 dark:text-stone-300">
                      0 kg recorded on {selectedDate}
                    </p>
                    <p className="text-xs text-stone-400 font-malayalam mt-0.5">
                      ഈ തീയതിയിൽ ഉൽപ്പാദന ബാച്ചുകൾ ലഭ്യമല്ല
                    </p>
                    <button
                      onClick={() => setSelectedDate(null)}
                      className="mt-3 text-xs px-3 py-1.5 rounded-xl bg-epso-orange text-white font-bold cursor-pointer"
                    >
                      Show All Days Trend (Normal)
                    </button>
                  </div>
                )
              ) : (
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
              )}
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
                          disabled={deletingBatchId === run.id}
                          className="p-1 rounded-lg text-stone-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors disabled:opacity-50"
                          title="Delete Batch Permanently"
                        >
                          {deletingBatchId === run.id ? (
                            <FiRefreshCw className="w-3.5 h-3.5 animate-spin text-red-500" />
                          ) : (
                            <FiTrash2 className="w-3.5 h-3.5" />
                          )}
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
