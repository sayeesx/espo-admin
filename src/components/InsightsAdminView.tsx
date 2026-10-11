import React, { useState, useMemo } from 'react';
import { Product, Ingredient, ProductionRun, StockMovement } from '../types';
import {
  TrendingUp,
  Boxes,
  IndianRupee,
  Layers,
  ArrowUpRight,
  PieChart as PieIcon,
  BarChart3,
  Activity,
  Calendar,
  Flame,
  CheckCircle2,
  Clock,
} from 'lucide-react';
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
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | 'all'>('7d');

  // Real financial calculations
  const totalFinishedGoodsValuation = products.reduce((acc, p) => acc + (p.currentStock * p.wholesalePrice), 0);
  const totalRawValuation = ingredients.reduce((acc, ing) => acc + (ing.currentStock * ing.avgCostPerUnit), 0);
  const totalWorkingCapital = totalFinishedGoodsValuation + totalRawValuation;

  // Real Production Volume over time (last 7 or 14 days)
  const productionTrendsData = useMemo(() => {
    const dateMap = new Map<string, { date: string; outputKg: number; plannedKg: number; count: number }>();

    // Seed last 7 days so chart is continuous
    const days = timeRange === '7d' ? 7 : timeRange === '30d' ? 14 : 30;
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const iso = d.toISOString().split('T')[0];
      const displayDate = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      dateMap.set(iso, { date: displayDate, outputKg: 0, plannedKg: 0, count: 0 });
    }

    productionRuns.forEach((run) => {
      if (run.status === 'completed' && run.productionDate) {
        const item = dateMap.get(run.productionDate);
        if (item) {
          item.outputKg += run.actualQuantity;
          item.plannedKg += run.plannedQuantity;
          item.count += 1;
        }
      }
    });

    return Array.from(dateMap.values());
  }, [productionRuns, timeRange]);

  // Real Consumption by Ingredient (sum actualQuantity consumed across runs)
  const ingredientConsumptionData = useMemo(() => {
    const ingMap = new Map<string, { name: string; quantity: number; unit: string }>();

    productionRuns.forEach((run) => {
      (run.ingredientsConsumed || []).forEach((c) => {
        const existing = ingMap.get(c.ingredientId) || {
          name: c.ingredientName || 'Ingredient',
          quantity: 0,
          unit: c.unit,
        };
        existing.quantity += c.actualQuantity;
        ingMap.set(c.ingredientId, existing);
      });
    });

    // If no logged consumption records yet, fallback to active stock movement 'out'
    if (ingMap.size === 0) {
      stockMovements
        .filter((m) => m.itemType === 'raw' && m.movementType === 'out')
        .forEach((m) => {
          const existing = ingMap.get(m.itemId) || {
            name: m.itemName,
            quantity: 0,
            unit: m.unit,
          };
          existing.quantity += m.quantity;
          ingMap.set(m.itemId, existing);
        });
    }

    return Array.from(ingMap.values())
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 6);
  }, [productionRuns, stockMovements]);

  // Inventory Health Segments (Image 2 style)
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
    { name: 'ഫിനിഷ്ഡ് സ്നാക്കുകൾ (Finished)', value: totalFinishedGoodsValuation, color: '#EA580C' },
    { name: 'അസംസ്കൃത വസ്തുക്കൾ (Raw Materials)', value: totalRawValuation, color: '#F59E0B' },
  ], [totalFinishedGoodsValuation, totalRawValuation]);

  // Top Products by Stock Valuation
  const topProductsByValue = useMemo(() => {
    return products
      .map((p) => ({
        name: p.name,
        value: Math.round(p.currentStock * p.wholesalePrice),
        stock: p.currentStock,
        unit: p.unit,
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  }, [products]);

  return (
    <div className="space-y-6 pb-20">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-stone-200 dark:border-[#2E2828]">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-orange-100 dark:bg-orange-950/40 text-epso-orange flex items-center justify-center font-bold">
              <Activity className="w-4 h-4" />
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-stone-900 dark:text-white font-malayalam">
              വിപുലമായ ഉൾക്കാഴ്ചകളും അനലിറ്റിക്സും
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-stone-500 dark:text-stone-400 font-malayalam mt-1">
            തത്സമയ ഉൽപ്പാദന പ്രവണതകൾ, അസംസ്കൃത വസ്തുക്കളുടെ ഉപഭോഗം & സാമ്പത്തിക വിവരങ്ങൾ
          </p>
        </div>

        {/* Range Selector */}
        <div className="flex items-center gap-1.5 p-1 bg-stone-100 dark:bg-[#1E1B1B] rounded-xl border border-stone-200 dark:border-[#2E2828]">
          {(['7d', '30d', 'all'] as const).map((rng) => (
            <button
              key={rng}
              onClick={() => setTimeRange(rng)}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                timeRange === rng
                  ? 'bg-white dark:bg-stone-800 text-epso-red dark:text-amber-400 shadow-2xs'
                  : 'text-stone-500 hover:text-stone-800 dark:hover:text-stone-200'
              }`}
            >
              {rng === '7d' ? '7 ദിവസം (7D)' : rng === '30d' ? '30 ദിവസം (30D)' : 'എല്ലാം (All)'}
            </button>
          ))}
        </div>
      </div>

      {/* Primary Financial Metric Strip (Image 2 style) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Total Working Capital */}
        <div className="p-5 rounded-2xl bg-white dark:bg-[#1E1B1B] border border-stone-200 dark:border-[#2E2828] shadow-apple-card dark:shadow-apple-card-dark">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-stone-500 dark:text-stone-400 font-malayalam">
              ആകെ പാൻട്രി മൂലധനം (Working Capital)
            </span>
            <div className="p-2 rounded-xl bg-orange-50 dark:bg-orange-950/40 text-epso-orange">
              <IndianRupee className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-stone-900 dark:text-white">
            ₹{totalWorkingCapital.toLocaleString('en-IN')}
          </div>
          <p className="text-[11px] text-stone-500 dark:text-stone-400 mt-1 font-malayalam">
            ഫിനിഷ്ഡ് ഗുഡ്സ് + അസംസ്കൃത വസ്തുക്കളുടെ ആകെ മൂല്യം
          </p>
        </div>

        {/* Finished Goods Valuation */}
        <div className="p-5 rounded-2xl bg-white dark:bg-[#1E1B1B] border border-stone-200 dark:border-[#2E2828] shadow-apple-card dark:shadow-apple-card-dark">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-stone-500 dark:text-stone-400 font-malayalam">
              ഫിനിഷ്ഡ് ഉൽപ്പന്നങ്ങൾ (Finished Snacks)
            </span>
            <div className="p-2 rounded-xl bg-red-50 dark:bg-red-950/40 text-epso-red">
              <Boxes className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-stone-900 dark:text-white">
            ₹{totalFinishedGoodsValuation.toLocaleString('en-IN')}
          </div>
          <p className="text-[11px] text-stone-500 dark:text-stone-400 mt-1 font-malayalam">
            {products.length} സ്നാക്കുകൾ വെയർഹൗസിൽ സ്റ്റോക്കുള്ളത്
          </p>
        </div>

        {/* Raw Material Inventory */}
        <div className="p-5 rounded-2xl bg-white dark:bg-[#1E1B1B] border border-stone-200 dark:border-[#2E2828] shadow-apple-card dark:shadow-apple-card-dark">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-stone-500 dark:text-stone-400 font-malayalam">
              അസംസ്കൃത വസ്തുക്കൾ (Raw Materials)
            </span>
            <div className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-500">
              <Layers className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-stone-900 dark:text-white">
            ₹{totalRawValuation.toLocaleString('en-IN')}
          </div>
          <p className="text-[11px] text-stone-500 dark:text-stone-400 mt-1 font-malayalam">
            {ingredients.length} രജിസ്റ്റർ ചെയ്ത ചേരുവകൾ
          </p>
        </div>
      </div>

      {/* Stock Health Segmented Capacity Bar (Image 2 style) */}
      <div className="p-5 rounded-2xl bg-white dark:bg-[#1E1B1B] border border-stone-200 dark:border-[#2E2828] shadow-apple-card dark:shadow-apple-card-dark space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
          <div>
            <h3 className="text-sm font-extrabold text-stone-900 dark:text-white font-malayalam">
              അസംസ്കൃത വസ്തുക്കളുടെ സ്റ്റോക്ക് ആരോഗ്യം (Raw Stock Capacity)
            </h3>
            <p className="text-xs text-stone-500 dark:text-stone-400 font-malayalam">
              സുരക്ഷിത പരിധി, കുറഞ്ഞ സ്റ്റോക്ക്, തീർന്നുപോയ ഇനങ്ങളുടെ വിഭജനം
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs font-bold">
            <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              സുരക്ഷിതം: {healthSegments.safePercent}%
            </span>
            <span className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
              കുറവ്: {healthSegments.lowPercent}%
            </span>
            <span className="flex items-center gap-1.5 text-red-600 dark:text-red-400">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
              തീർന്നവ: {healthSegments.depletedPercent}%
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
              <TrendingUp className="w-4 h-4 text-epso-orange" />
              <h3 className="text-sm font-extrabold text-stone-900 dark:text-white font-malayalam">
                ദിവസേനയുള്ള ഉൽപ്പാദന ട്രെൻഡ് (Daily Production Volume Curve)
              </h3>
            </div>
            <p className="text-xs text-stone-500 dark:text-stone-400 font-malayalam mt-0.5">
              അടുക്കളയിൽ രേഖപ്പെടുത്തിയ ഉൽപ്പാദന അളവ് (കിലോഗ്രാം / Output in kg)
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
              <XAxis
                dataKey="date"
                stroke={isDark ? '#A39E9B' : '#6B7280'}
                fontSize={11}
                tickLine={false}
              />
              <YAxis
                stroke={isDark ? '#A39E9B' : '#6B7280'}
                fontSize={11}
                tickLine={false}
                tickFormatter={(val) => `${val}kg`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: isDark ? '#141212' : '#FFFFFF',
                  borderColor: isDark ? '#2E2828' : '#E5E7EB',
                  borderRadius: '14px',
                  fontSize: '11px',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
                }}
                formatter={(val: any) => [`${val} kg`, 'ഉൽപ്പാദനം (Output)']}
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

      {/* Secondary Dual Charts: Consumption Bar Chart & Capital Pie */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Ingredient Consumption Velocity */}
        <div className="p-5 rounded-2xl bg-white dark:bg-[#1E1B1B] border border-stone-200 dark:border-[#2E2828] shadow-apple-card dark:shadow-apple-card-dark">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-extrabold text-stone-900 dark:text-white font-malayalam">
                ഏറ്റവും കൂടുതൽ ഉപയോഗിച്ച ചേരുവകൾ (Ingredient Consumption)
              </h3>
              <p className="text-xs text-stone-500 dark:text-stone-400 font-malayalam">
                ബാച്ചുകളിൽ ഉപയോഗിച്ച അളവ് (Total Consumed in Production)
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
                    formatter={(val: any, _, item: any) => [`${val} ${item.payload.unit}`, 'ഉപയോഗിച്ചത് (Consumed)']}
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
              <h3 className="text-sm font-extrabold text-stone-900 dark:text-white font-malayalam">
                മൂലധന വിതരണം (Capital Distribution)
              </h3>
              <p className="text-xs text-stone-500 dark:text-stone-400 font-malayalam">
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
                  formatter={(val: any) => [`₹${Number(val).toLocaleString('en-IN')}`, 'മൂല്യം (Valuation)']}
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
                  formatter={(val) => <span className="text-xs font-semibold text-stone-700 dark:text-stone-300 font-malayalam">{val}</span>}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};
