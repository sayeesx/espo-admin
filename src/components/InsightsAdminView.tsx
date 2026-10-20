import React, { useState, useMemo } from 'react';
import { Product, Ingredient, ProductionRun, StockMovement } from '../types';
import {
  FiTrendingUp,
  FiBox,
  FiDollarSign,
  FiLayers,
  FiArrowUpRight,
  FiPieChart,
  FiBarChart2,
  FiActivity,
  FiCalendar,
} from 'react-icons/fi';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts';
import { useTheme } from '../context/ThemeContext';
import { AnimatedNumber } from './AnimatedNumber';

interface InsightsAdminViewProps {
  products: Product[];
  ingredients: Ingredient[];
  productionRuns: ProductionRun[];
  stockMovements: StockMovement[];
  onNavigateTab: (tab: any) => void;
}

export const InsightsAdminView: React.FC<InsightsAdminViewProps> = ({
  products,
  ingredients,
  productionRuns,
  stockMovements,
  onNavigateTab,
}) => {
  const { isDark } = useTheme();
  const [timeRange, setTimeRange] = useState<'today' | '7d' | '30d' | 'all' | 'custom'>('7d');
  const [customStartDate, setCustomStartDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().split('T')[0];
  });
  const [customEndDate, setCustomEndDate] = useState<string>(() => new Date().toISOString().split('T')[0]);

  // Compute effective date range normalized (handles Day N to Day M and vice versa)
  const { fromDate, toDate, isReversed } = useMemo(() => {
    const today = new Date();
    const todayIso = today.toISOString().split('T')[0];

    if (timeRange === 'today') {
      return { fromDate: todayIso, toDate: todayIso, isReversed: false };
    } else if (timeRange === '7d') {
      const d = new Date();
      d.setDate(d.getDate() - 6);
      return { fromDate: d.toISOString().split('T')[0], toDate: todayIso, isReversed: false };
    } else if (timeRange === '30d') {
      const d = new Date();
      d.setDate(d.getDate() - 29);
      return { fromDate: d.toISOString().split('T')[0], toDate: todayIso, isReversed: false };
    } else if (timeRange === 'custom') {
      const s = customStartDate || customEndDate || todayIso;
      const e = customEndDate || customStartDate || todayIso;
      const reversed = s > e;
      const [start, end] = reversed ? [e, s] : [s, e];
      return { fromDate: start, toDate: end, isReversed: reversed };
    }
    // 'all'
    return { fromDate: '', toDate: '', isReversed: false };
  }, [timeRange, customStartDate, customEndDate]);

  // Filter production runs based on active date range
  const filteredProductionRuns = useMemo(() => {
    if (!fromDate && !toDate) return productionRuns;
    return productionRuns.filter((run) => {
      const d = run.productionDate || (run.createdAt ? run.createdAt.split('T')[0] : '');
      if (!d) return false;
      if (fromDate && d < fromDate) return false;
      if (toDate && d > toDate) return false;
      return true;
    });
  }, [productionRuns, fromDate, toDate]);

  // Filter stock movements based on active date range
  const filteredStockMovements = useMemo(() => {
    if (!fromDate && !toDate) return stockMovements;
    return stockMovements.filter((m) => {
      const d = m.createdAt ? m.createdAt.split('T')[0] : '';
      if (!d) return false;
      if (fromDate && d < fromDate) return false;
      if (toDate && d > toDate) return false;
      return true;
    });
  }, [stockMovements, fromDate, toDate]);

  // Real financial calculations
  const totalFinishedGoodsValuation = products.reduce((acc, p) => acc + p.currentStock * p.wholesalePrice, 0);
  const totalRawValuation = ingredients.reduce((acc, ing) => acc + ing.currentStock * ing.avgCostPerUnit, 0);
  const totalWorkingCapital = totalFinishedGoodsValuation + totalRawValuation;

  // Output stats in selected range
  const completedRunsInRange = useMemo(
    () => filteredProductionRuns.filter((r) => r.status === 'completed'),
    [filteredProductionRuns]
  );
  const totalOutputInRangeKg = useMemo(
    () => completedRunsInRange.reduce((acc, r) => acc + (r.actualQuantity || 0), 0),
    [completedRunsInRange]
  );

  // Real Production Volume over time based on filtered date range
  const productionTrendsData = useMemo(() => {
    const dateMap = new Map<string, { date: string; outputKg: number; count: number }>();

    if (fromDate && toDate) {
      const start = new Date(fromDate);
      const end = new Date(toDate);
      const diffTime = end.getTime() - start.getTime();
      const diffDays = Math.max(0, Math.round(diffTime / (1000 * 3600 * 24)));

      if (diffDays <= 60) {
        for (let i = 0; i <= diffDays; i++) {
          const d = new Date(start);
          d.setDate(d.getDate() + i);
          const iso = d.toISOString().split('T')[0];
          const displayDate = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          dateMap.set(iso, { date: displayDate, outputKg: 0, count: 0 });
        }
      }
    }

    filteredProductionRuns.forEach((run) => {
      if (run.status === 'completed' && run.productionDate) {
        const iso = run.productionDate;
        const displayDate = new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const item = dateMap.get(iso) || { date: displayDate, outputKg: 0, count: 0 };
        item.outputKg = Number((item.outputKg + (run.actualQuantity || 0)).toFixed(2));
        item.count += 1;
        dateMap.set(iso, item);
      }
    });

    return Array.from(dateMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, val]) => val);
  }, [filteredProductionRuns, fromDate, toDate]);

  // Real Consumption by Ingredient in selected range
  const ingredientConsumptionData = useMemo(() => {
    const ingMap = new Map<string, { name: string; quantity: number; unit: string }>();

    filteredProductionRuns.forEach((run) => {
      (run.ingredientsConsumed || []).forEach((c) => {
        const existing = ingMap.get(c.ingredientId) || {
          name: c.ingredientName || 'Ingredient',
          quantity: 0,
          unit: c.unit,
        };
        existing.quantity = Number((existing.quantity + c.actualQuantity).toFixed(2));
        ingMap.set(c.ingredientId, existing);
      });
    });

    if (ingMap.size === 0) {
      filteredStockMovements
        .filter((m) => m.itemType === 'raw' && m.movementType === 'out')
        .forEach((m) => {
          const existing = ingMap.get(m.itemId) || {
            name: m.itemName,
            quantity: 0,
            unit: m.unit,
          };
          existing.quantity = Number((existing.quantity + m.quantity).toFixed(2));
          ingMap.set(m.itemId, existing);
        });
    }

    return Array.from(ingMap.values())
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 6);
  }, [filteredProductionRuns, filteredStockMovements]);

  // Inventory Health Segments
  const healthSegments = useMemo(() => {
    const total = ingredients.length || 1;
    const depleted = ingredients.filter((i) => i.currentStock <= 0).length;
    const low = ingredients.filter((i) => i.currentStock > 0 && i.minStock > 0 && i.currentStock <= i.minStock).length;
    const safe = ingredients.filter((i) => i.currentStock > i.minStock).length;

    return {
      safeCount: safe,
      lowCount: low,
      depletedCount: depleted,
      safePercent: Number(((safe / total) * 100).toFixed(1)),
      lowPercent: Number(((low / total) * 100).toFixed(1)),
      depletedPercent: Number(((depleted / total) * 100).toFixed(1)),
    };
  }, [ingredients]);

  // Capital Distribution Pie Data
  const valuationPieData = useMemo(() => [
    { name: 'Finished Snacks', value: totalFinishedGoodsValuation, color: '#EA580C' },
    { name: 'Raw Materials', value: totalRawValuation, color: '#F59E0B' },
  ], [totalFinishedGoodsValuation, totalRawValuation]);

  return (
    <div className="space-y-6 pb-20 max-w-6xl">
      {/* Top Header & Date Range Toolbar */}
      <div className="flex flex-col gap-4 pb-3 border-b border-stone-200 dark:border-[#2E2828]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-orange-100 dark:bg-orange-950/40 text-epso-orange flex items-center justify-center font-bold">
                <FiActivity className="w-4 h-4" />
              </div>
              <h1 className="text-xl sm:text-2xl font-black text-stone-900 dark:text-white">
                Production Insights
              </h1>
            </div>
            <p className="text-xs sm:text-sm text-stone-500 dark:text-stone-400 font-malayalam mt-0.5">
              ഉൽപ്പാദന ട്രെൻഡുകളും അസംസ്കൃത വസ്തുക്കളുടെ ഉപഭോഗവും
            </p>
          </div>

          {/* Preset Buttons */}
          <div className="flex flex-wrap items-center gap-1.5 p-1 bg-stone-100 dark:bg-[#1E1B1B] rounded-xl border border-stone-200 dark:border-[#2E2828]">
            <button
              onClick={() => setTimeRange('today')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                timeRange === 'today'
                  ? 'bg-white dark:bg-stone-800 text-epso-red dark:text-amber-400 shadow-2xs'
                  : 'text-stone-500 hover:text-stone-800 dark:hover:text-stone-200'
              }`}
            >
              Today
            </button>
            <button
              onClick={() => setTimeRange('7d')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                timeRange === '7d'
                  ? 'bg-white dark:bg-stone-800 text-epso-red dark:text-amber-400 shadow-2xs'
                  : 'text-stone-500 hover:text-stone-800 dark:hover:text-stone-200'
              }`}
            >
              7 Days
            </button>
            <button
              onClick={() => setTimeRange('30d')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                timeRange === '30d'
                  ? 'bg-white dark:bg-stone-800 text-epso-red dark:text-amber-400 shadow-2xs'
                  : 'text-stone-500 hover:text-stone-800 dark:hover:text-stone-200'
              }`}
            >
              30 Days
            </button>
            <button
              onClick={() => setTimeRange('all')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                timeRange === 'all'
                  ? 'bg-white dark:bg-stone-800 text-epso-red dark:text-amber-400 shadow-2xs'
                  : 'text-stone-500 hover:text-stone-800 dark:hover:text-stone-200'
              }`}
            >
              All Time
            </button>
            <button
              onClick={() => setTimeRange('custom')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                timeRange === 'custom'
                  ? 'bg-white dark:bg-stone-800 text-epso-red dark:text-amber-400 shadow-2xs'
                  : 'text-stone-500 hover:text-stone-800 dark:hover:text-stone-200'
              }`}
            >
              <FiCalendar className="w-3.5 h-3.5" />
              Custom Range
            </button>
          </div>
        </div>

        {/* Custom Date Range Picker (Day N to Day M vice versa) */}
        {timeRange === 'custom' && (
          <div className="flex flex-wrap items-center gap-3 p-3 bg-stone-50 dark:bg-[#1A1818] rounded-xl border border-stone-200 dark:border-[#2E2828] animate-in fade-in duration-200">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-stone-600 dark:text-stone-300">From Date (Day N):</span>
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="px-2.5 py-1.5 text-xs font-medium bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-700 rounded-lg text-stone-800 dark:text-stone-200 focus:outline-none focus:ring-2 focus:ring-epso-orange"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-stone-600 dark:text-stone-300">To Date (Day M):</span>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="px-2.5 py-1.5 text-xs font-medium bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-700 rounded-lg text-stone-800 dark:text-stone-200 focus:outline-none focus:ring-2 focus:ring-epso-orange"
              />
            </div>

            {/* Quick Helper / Swap button */}
            <div className="flex items-center gap-2 ml-auto">
              <button
                type="button"
                onClick={() => {
                  const s = customStartDate;
                  setCustomStartDate(customEndDate);
                  setCustomEndDate(s);
                }}
                className="px-2.5 py-1 text-[11px] font-bold rounded-lg border border-stone-300 dark:border-stone-700 text-stone-600 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-800 transition-colors"
                title="Swap From and To dates"
              >
                ⇄ Swap (Day M ↔ Day N)
              </button>
              <button
                type="button"
                onClick={() => {
                  const today = new Date().toISOString().split('T')[0];
                  setCustomStartDate(today);
                  setCustomEndDate(today);
                }}
                className="px-2.5 py-1 text-[11px] font-bold rounded-lg border border-stone-300 dark:border-stone-700 text-stone-600 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-800 transition-colors"
              >
                Set Today
              </button>
            </div>

            {fromDate && toDate && (
              <div className="w-full text-[11px] text-stone-500 dark:text-stone-400 flex items-center gap-1.5">
                <span>Active Range:</span>
                <span className="font-bold text-epso-orange">
                  {fromDate} {fromDate !== toDate ? `to ${toDate}` : '(Single Day)'}
                </span>
                {isReversed && (
                  <span className="text-amber-500 font-semibold">(Auto-adjusted order)</span>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Range Summary Indicators (Malayalam) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3 bg-stone-50 dark:bg-[#1A1818] rounded-xl border border-stone-200 dark:border-[#2E2828]">
          <div className="text-[11px] font-bold text-stone-500 dark:text-stone-400 font-malayalam tracking-tight">
            തിരഞ്ഞെടുത്ത ബാച്ചുകൾ
          </div>
          <div className="text-xl font-black text-stone-900 dark:text-white mt-0.5">
            <AnimatedNumber value={completedRunsInRange.length} />
          </div>
        </div>
        <div className="p-3 bg-stone-50 dark:bg-[#1A1818] rounded-xl border border-stone-200 dark:border-[#2E2828]">
          <div className="text-[11px] font-bold text-stone-500 dark:text-stone-400 font-malayalam tracking-tight">
            ആകെ ഉൽപ്പാദനം
          </div>
          <div className="text-xl font-black text-epso-orange mt-0.5">
            <AnimatedNumber value={totalOutputInRangeKg} suffix=" kg" decimals={1} />
          </div>
        </div>
        <div className="p-3 bg-stone-50 dark:bg-[#1A1818] rounded-xl border border-stone-200 dark:border-[#2E2828]">
          <div className="text-[11px] font-bold text-stone-500 dark:text-stone-400 font-malayalam tracking-tight">
            പാൻട്രി മൂലധനം
          </div>
          <div className="text-xl font-black text-stone-900 dark:text-white mt-0.5">
            <AnimatedNumber value={totalWorkingCapital} prefix="₹" />
          </div>
        </div>
        <div className="p-3 bg-stone-50 dark:bg-[#1A1818] rounded-xl border border-stone-200 dark:border-[#2E2828]">
          <div className="text-[11px] font-bold text-stone-500 dark:text-stone-400 font-malayalam tracking-tight">
            ആകെ ചേരുവകൾ
          </div>
          <div className="text-xl font-black text-stone-900 dark:text-white mt-0.5">
            <AnimatedNumber value={ingredients.length} suffix=" ഇനങ്ങൾ" />
          </div>
        </div>
      </div>

      {/* Financial Metric Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Total Working Capital */}
        <div className="p-5 rounded-2xl bg-white dark:bg-[#1E1B1B] border border-stone-200 dark:border-[#2E2828] shadow-apple-card dark:shadow-apple-card-dark">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-stone-500 dark:text-stone-400 font-malayalam">
              ആകെ പാൻട്രി മൂലധനം (Working Capital)
            </span>
            <div className="p-2 rounded-xl bg-orange-50 dark:bg-orange-950/40 text-epso-orange">
              <FiDollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-stone-900 dark:text-white">
            <AnimatedNumber value={totalWorkingCapital} prefix="₹" />
          </div>
          <p className="text-[11px] text-stone-400 mt-1 font-malayalam">
            ഫിനിഷ്ഡ് ഗുഡ്സ് + ചേരുവകളുടെ ആകെ മൂല്യം
          </p>
        </div>

        {/* Finished Goods Valuation */}
        <div className="p-5 rounded-2xl bg-white dark:bg-[#1E1B1B] border border-stone-200 dark:border-[#2E2828] shadow-apple-card dark:shadow-apple-card-dark">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-stone-500 dark:text-stone-400 font-malayalam">
              ഫിനിഷ്ഡ് സ്നാക്സ് (Finished Goods)
            </span>
            <div className="p-2 rounded-xl bg-red-50 dark:bg-red-950/40 text-epso-red">
              <FiBox className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-stone-900 dark:text-white">
            <AnimatedNumber value={totalFinishedGoodsValuation} prefix="₹" />
          </div>
          <p className="text-[11px] text-stone-400 mt-1 font-malayalam">
            {products.length} സ്നാക്കുകൾ സ്റ്റോക്കുള്ളത്
          </p>
        </div>

        {/* Raw Material Inventory */}
        <div className="p-5 rounded-2xl bg-white dark:bg-[#1E1B1B] border border-stone-200 dark:border-[#2E2828] shadow-apple-card dark:shadow-apple-card-dark">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-stone-500 dark:text-stone-400 font-malayalam">
              അസംസ്കൃത വസ്തുക്കൾ (Raw Materials)
            </span>
            <div className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-500">
              <FiLayers className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-stone-900 dark:text-white">
            <AnimatedNumber value={totalRawValuation} prefix="₹" />
          </div>
          <p className="text-[11px] text-stone-400 mt-1 font-malayalam">
            {ingredients.length} രജിസ്റ്റർ ചെയ്ത ചേരുവകൾ
          </p>
        </div>
      </div>

      {/* Stock Health Segmented Capacity Bar */}
      <div className="p-5 rounded-2xl bg-white dark:bg-[#1E1B1B] border border-stone-200 dark:border-[#2E2828] shadow-apple-card dark:shadow-apple-card-dark space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
          <div>
            <h3 className="text-sm font-black text-stone-900 dark:text-white">
              Raw Stock Capacity Health
            </h3>
            <p className="text-xs text-stone-400 font-malayalam">
              സുരക്ഷിത പരിധി, കുറഞ്ഞ സ്റ്റോക്ക്, തീർന്നുപോയ ഇനങ്ങളുടെ വിഭജനം
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs font-bold">
            <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              Safe: {healthSegments.safePercent}%
            </span>
            <span className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
              Low: {healthSegments.lowPercent}%
            </span>
            <span className="flex items-center gap-1.5 text-red-600 dark:text-red-400">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
              Depleted: {healthSegments.depletedPercent}%
            </span>
          </div>
        </div>

        {/* Multi-segment continuous horizontal progress bar */}
        <div className="w-full h-4 rounded-full overflow-hidden bg-stone-100 dark:bg-stone-800 flex shadow-inner">
          <div
            style={{ width: `${healthSegments.safePercent}%` }}
            className="h-full bg-emerald-500 transition-all duration-1000 ease-out"
            title={`Safe Stock: ${healthSegments.safePercent}%`}
          />
          <div
            style={{ width: `${healthSegments.lowPercent}%` }}
            className="h-full bg-amber-500 transition-all duration-1000 ease-out"
            title={`Low Stock: ${healthSegments.lowPercent}%`}
          />
          <div
            style={{ width: `${healthSegments.depletedPercent}%` }}
            className="h-full bg-red-500 transition-all duration-1000 ease-out"
            title={`Depleted: ${healthSegments.depletedPercent}%`}
          />
        </div>
      </div>

      {/* Main Charts: Wave Area Chart for Production Volume */}
      <div className="p-5 rounded-2xl bg-white dark:bg-[#1E1B1B] border border-stone-200 dark:border-[#2E2828] shadow-apple-card dark:shadow-apple-card-dark">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="flex items-center gap-2">
              <FiTrendingUp className="w-4 h-4 text-epso-orange" />
              <h3 className="text-sm font-black text-stone-900 dark:text-white">
                Daily Production Volume Curve
              </h3>
            </div>
            <p className="text-xs text-stone-400 font-malayalam mt-0.5">
              അടുക്കളയിൽ രേഖപ്പെടുത്തിയ ഉൽപ്പാദന അളവ് (Output in kg)
            </p>
          </div>
        </div>

        <div className="h-64 sm:h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={productionTrendsData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="epsoAreaGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#EA580C" stopOpacity={0.45} />
                  <stop offset="95%" stopColor="#EA580C" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#2E2828' : '#F1F2F4'} vertical={false} />
              <XAxis dataKey="date" stroke={isDark ? '#A39E9B' : '#6B7280'} fontSize={11} tickLine={false} />
              <YAxis stroke={isDark ? '#A39E9B' : '#6B7280'} fontSize={11} tickLine={false} tickFormatter={(val) => `${val}kg`} />
              <Tooltip
                contentStyle={{
                  backgroundColor: isDark ? '#141212' : '#FFFFFF',
                  borderColor: isDark ? '#2E2828' : '#E5E7EB',
                  borderRadius: '14px',
                  fontSize: '11px',
                }}
                formatter={(val: any) => [`${val} kg`, 'Output']}
              />
              <Area
                type="monotone"
                dataKey="outputKg"
                stroke="#EA580C"
                strokeWidth={3}
                fillOpacity={1}
                fill="url(#epsoAreaGradient)"
                isAnimationActive={true}
                animationDuration={1200}
                animationEasing="ease-out"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Dual Charts: Consumption Bar Chart & Capital Pie */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Ingredient Consumption Velocity */}
        <div className="p-5 rounded-2xl bg-white dark:bg-[#1E1B1B] border border-stone-200 dark:border-[#2E2828] shadow-apple-card dark:shadow-apple-card-dark">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-black text-stone-900 dark:text-white">
                Top Consumed Raw Materials
              </h3>
              <p className="text-xs text-stone-400 font-malayalam">
                ബാച്ചുകളിൽ ഏറ്റവും കൂടുതൽ ഉപയോഗിച്ച ചേരുവകൾ
              </p>
            </div>
          </div>

          <div className="h-64 w-full">
            {ingredientConsumptionData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-stone-400 font-malayalam">
                ഉപഭോഗ രേഖകൾ കണ്ടെത്താനായില്ല
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={ingredientConsumptionData} layout="vertical" margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#2E2828' : '#F1F2F4'} horizontal={false} />
                  <XAxis type="number" stroke={isDark ? '#A39E9B' : '#6B7280'} fontSize={10} tickLine={false} />
                  <YAxis type="category" dataKey="name" stroke={isDark ? '#A39E9B' : '#6B7280'} fontSize={11} tickLine={false} width={80} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: isDark ? '#141212' : '#FFFFFF',
                      borderColor: isDark ? '#2E2828' : '#E5E7EB',
                      borderRadius: '12px',
                      fontSize: '11px',
                    }}
                    formatter={(val: any, _, item: any) => [`${val} ${item.payload.unit}`, 'Consumed']}
                  />
                  <Bar dataKey="quantity" fill="#F59E0B" radius={[0, 6, 6, 0]} isAnimationActive={true} animationDuration={1000} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Capital Distribution Donut Chart */}
        <div className="p-5 rounded-2xl bg-white dark:bg-[#1E1B1B] border border-stone-200 dark:border-[#2E2828] shadow-apple-card dark:shadow-apple-card-dark">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-black text-stone-900 dark:text-white">
                Capital Distribution
              </h3>
              <p className="text-xs text-stone-400 font-malayalam">
                ഫിനിഷ്ഡ് സ്നാക്കുകൾ vs അസംസ്കൃത ചേരുവകൾ
              </p>
            </div>
          </div>

          <div className="h-64 w-full flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={valuationPieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={5}
                  dataKey="value"
                  isAnimationActive={true}
                  animationDuration={1200}
                >
                  {valuationPieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(val: any) => [`₹${Number(val).toLocaleString('en-IN')}`, 'Valuation']}
                  contentStyle={{
                    backgroundColor: isDark ? '#141212' : '#FFFFFF',
                    borderColor: isDark ? '#2E2828' : '#E5E7EB',
                    borderRadius: '12px',
                    fontSize: '11px',
                  }}
                />
                <Legend
                  verticalAlign="bottom"
                  height={36}
                  formatter={(val) => <span className="text-xs font-semibold text-stone-700 dark:text-stone-300">{val}</span>}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};
