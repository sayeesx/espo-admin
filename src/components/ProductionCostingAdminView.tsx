import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Product,
  Ingredient,
  ProductionRun,
  StockMovement,
} from '../types';
import {
  fetchDailyClosings,
  fetchPackingRecords,
  fetchDailyWages,
  fetchProductSellingPrices,
  saveProductSellingPrice,
} from '../services/supabase';
import { roundCurrency, roundStock } from '../services/costing';
import { LoadingSpinner } from './LoadingSpinner';
import {
  FiCalendar,
  FiArrowLeft,
  FiEdit3,
  FiCheck,
  FiX,
  FiTrendingUp,
  FiTrendingDown,
  FiPackage,
  FiLayers,
  FiDroplet,
  FiUsers,
  FiBox,
  FiRefreshCw,
  FiSearch,
} from 'react-icons/fi';

interface ProductionCostingAdminViewProps {
  products: Product[];
  ingredients: Ingredient[];
  productionRuns: ProductionRun[];
  stockMovements?: StockMovement[];
  onRefresh: () => void;
}

interface ProductCostSummary {
  productId: string;
  productName: string;
  totalProductionKg: number;
  batchCount: number;
  ingredientCost: number;
  oilCost: number;
  productionWages: number;
  packingWages: number;
  packagingMaterialCost: number;
  totalPacketsPacked: number;
  totalManufacturingCost: number;
  costPerKg: number;
  costPerPacket: number;
  wholesalePricePerKg: number;
  profitPerKg: number;
  profitPerPacket: number;
  profitMarginPercent: number;
}

export const ProductionCostingAdminView: React.FC<ProductionCostingAdminViewProps> = ({
  products,
  ingredients,
  productionRuns,
  onRefresh,
}) => {
  // Available distinct production dates
  const availableDates = useMemo(() => {
    const dates = Array.from(
      new Set(
        productionRuns
          .filter((r) => r.status === 'completed' && r.productionDate)
          .map((r) => r.productionDate)
      )
    ).sort().reverse();
    return dates;
  }, [productionRuns]);

  // Default to 'all' so that ALL products are shown immediately!
  const [selectedDate, setSelectedDate] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<ProductCostSummary | null>(null);

  // Data states
  const [productCosts, setProductCosts] = useState<ProductCostSummary[]>([]);
  const [sellingPrices, setSellingPrices] = useState<Record<string, number>>({});
  const [editingPriceId, setEditingPriceId] = useState<string | null>(null);
  const [editPriceValue, setEditPriceValue] = useState<string>('');
  const [isSavingPrice, setIsSavingPrice] = useState(false);

  // Per-product detail data
  const [detailIngredients, setDetailIngredients] = useState<any[]>([]);

  const loadCostingData = useCallback(async (dateFilter: string) => {
    setIsLoading(true);
    try {
      // 1. Fetch all needed data in parallel
      const [closings, allPackingRecords, wageList, pricesData] = await Promise.all([
        fetchDailyClosings(90),
        fetchPackingRecords({ limit: 500 }),
        fetchDailyWages(90),
        fetchProductSellingPrices(),
      ]);

      // Build selling prices map
      const priceMap: Record<string, number> = {};
      for (const p of pricesData) {
        priceMap[p.productId] = p.wholesalePricePerKg;
      }
      setSellingPrices(priceMap);

      // Wage map by date
      const wageMap: Record<string, any> = {};
      for (const w of wageList) {
        wageMap[w.productionDate] = w;
      }

      // Closing map by date
      const closingMap: Record<string, any> = {};
      for (const c of closings) {
        closingMap[c.productionDate] = c;
      }

      // Completed runs
      const completedRuns = productionRuns.filter((r) => r.status === 'completed');

      // 2. Compute costing for ALL products in catalog
      const summaries: ProductCostSummary[] = [];

      for (const prod of products) {
        let pRuns = completedRuns.filter((r) => r.productId === prod.id);

        if (dateFilter !== 'all') {
          const dateRuns = pRuns.filter((r) => r.productionDate === dateFilter);
          if (dateRuns.length > 0) {
            pRuns = dateRuns;
          } else {
            // Not produced on this specific date
            pRuns = [];
          }
        }

        const totalKg = pRuns.reduce((sum, r) => sum + (r.actualQuantity || 0), 0);
        const batchCount = pRuns.length;

        // Ingredients cost from runs
        let ingredientCost = 0;
        for (const run of pRuns) {
          if (run.ingredientsConsumed && Array.isArray(run.ingredientsConsumed) && run.ingredientsConsumed.length > 0) {
            for (const ing of run.ingredientsConsumed) {
              ingredientCost += (ing.totalCost || 0);
            }
          } else if (run.totalIngredientCost) {
            ingredientCost += run.totalIngredientCost;
          }
        }
        ingredientCost = roundCurrency(ingredientCost);

        // Product packing records
        let prodPacking = allPackingRecords.filter((pr) => pr.productId === prod.id);
        if (dateFilter !== 'all') {
          prodPacking = prodPacking.filter((pr) => pr.packingDate === dateFilter);
        }
        const prodPackets = prodPacking.reduce((sum, pr) => sum + (pr.packetsPacked || 0), 0);
        const packagingMaterialCost = roundCurrency(
          prodPacking.reduce((sum, pr) => sum + (pr.packagingCost || 0), 0)
        );

        // Oil and Wages allocation: proportional to production weight on respective dates
        let oilCost = 0;
        let productionWages = 0;
        let packingWages = 0;

        if (pRuns.length > 0) {
          for (const run of pRuns) {
            const rDate = run.productionDate;
            const closing = rDate ? closingMap[rDate] : null;
            const wage = rDate ? wageMap[rDate] : null;

            // Day total production weight
            const dayRuns = completedRuns.filter((r) => r.productionDate === rDate);
            const dayTotalKg = dayRuns.reduce((s, r) => s + (r.actualQuantity || 0), 0);
            const ratio = dayTotalKg > 0 ? (run.actualQuantity || 0) / dayTotalKg : 1;

            if (closing && closing.oilConsumed > 0) {
              const dayOilCost = roundCurrency(closing.oilConsumed * (closing.oilCostPerKg || 150));
              oilCost += roundCurrency(dayOilCost * ratio);
            }

            const dayProdWages = wage?.productionWageAmount ?? (closing?.productionWages || 0);
            productionWages += roundCurrency(dayProdWages * ratio);

            const dayPackWages = wage?.packingWageAmount ?? 0;
            if (dayPackWages > 0) {
              packingWages += roundCurrency(dayPackWages * ratio);
            }
          }
        }

        oilCost = roundCurrency(oilCost);
        productionWages = roundCurrency(productionWages);
        packingWages = roundCurrency(packingWages);

        const totalManufacturingCost = roundCurrency(
          ingredientCost + oilCost + productionWages + packingWages + packagingMaterialCost
        );

        const costPerKg = totalKg > 0 ? roundCurrency(totalManufacturingCost / totalKg) : 0;
        const costPerPacket = prodPackets > 0 ? roundCurrency(totalManufacturingCost / prodPackets) : 0;
        const wholesalePricePerKg = priceMap[prod.id] || prod.wholesalePrice || 0;
        const profitPerKg = wholesalePricePerKg > 0 && costPerKg > 0 ? roundCurrency(wholesalePricePerKg - costPerKg) : 0;
        const profitPerPacket = wholesalePricePerKg > 0 && prodPackets > 0
          ? roundCurrency((wholesalePricePerKg * totalKg - totalManufacturingCost) / prodPackets)
          : 0;
        const profitMarginPercent = wholesalePricePerKg > 0 && profitPerKg !== 0
          ? Number(((profitPerKg / wholesalePricePerKg) * 100).toFixed(1))
          : 0;

        summaries.push({
          productId: prod.id,
          productName: prod.name,
          totalProductionKg: totalKg,
          batchCount,
          ingredientCost,
          oilCost,
          productionWages,
          packingWages,
          packagingMaterialCost,
          totalPacketsPacked: prodPackets,
          totalManufacturingCost,
          costPerKg,
          costPerPacket,
          wholesalePricePerKg,
          profitPerKg,
          profitPerPacket,
          profitMarginPercent,
        });
      }

      setProductCosts(summaries);
    } catch (err) {
      console.error('Failed to load costing data:', err);
    } finally {
      setIsLoading(false);
    }
  }, [products, productionRuns]);

  useEffect(() => {
    loadCostingData(selectedDate);
  }, [selectedDate, loadCostingData]);

  // Load detail ingredients for a product
  const loadProductDetail = useCallback(async (productId: string) => {
    const runs = productionRuns.filter(
      (r) =>
        r.productId === productId &&
        r.status === 'completed' &&
        (selectedDate === 'all' || r.productionDate === selectedDate)
    );

    const ingMap: Record<string, { name: string; unit: string; qty: number; cost: number }> = {};

    for (const run of runs) {
      if (run.ingredientsConsumed) {
        for (const ing of run.ingredientsConsumed) {
          const key = ing.ingredientId || ing.ingredientName || 'unknown';
          if (!ingMap[key]) {
            ingMap[key] = {
              name: ing.ingredientName || ing.ingredientId || 'Unknown',
              unit: ing.unit || 'kg',
              qty: 0,
              cost: 0,
            };
          }
          ingMap[key].qty += (ing.actualQuantity || 0);
          ingMap[key].cost += (ing.totalCost || 0);
        }
      }
    }

    setDetailIngredients(Object.values(ingMap));
  }, [productionRuns, selectedDate]);

  const handleOpenDetail = (product: ProductCostSummary) => {
    setSelectedProduct(product);
    loadProductDetail(product.productId);
  };

  const handleSavePrice = async (productId: string) => {
    const price = Number(editPriceValue) || 0;
    if (price < 0) return;

    setIsSavingPrice(true);
    try {
      await saveProductSellingPrice(productId, price);
      setSellingPrices((prev) => ({ ...prev, [productId]: price }));
      setEditingPriceId(null);
      await loadCostingData(selectedDate);
    } catch (err: any) {
      alert(`വില സേവ് ചെയ്യാനായില്ല: ${err?.message || 'Unknown error'}`);
    } finally {
      setIsSavingPrice(false);
    }
  };

  const formatCurrency = (val: number) => `₹${val.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const formatDate = (dateStr: string) => {
    if (dateStr === 'all') return 'എല്ലാ ബാച്ചുകളും (All Batches)';
    try {
      return new Date(dateStr + 'T00:00:00').toLocaleDateString('ml-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  // Filtered by search
  const filteredProductCosts = useMemo(() => {
    return productCosts.filter((p) =>
      p.productName.toLowerCase().includes(search.toLowerCase())
    );
  }, [productCosts, search]);

  // Detail view
  if (selectedProduct) {
    const p = selectedProduct;
    return (
      <div className="space-y-5 pb-8 font-malayalam max-w-4xl mx-auto">
        {/* Back Button */}
        <button
          onClick={() => setSelectedProduct(null)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-stone-100 dark:bg-[#1E1B1B] border border-stone-200 dark:border-[#2E2828] text-xs font-bold text-stone-700 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-[#282323] transition-colors cursor-pointer press-apple"
        >
          <FiArrowLeft className="w-4 h-4" />
          <span>← തിരികെ ലിസ്റ്റിലേക്ക്</span>
        </button>

        {/* Product Header */}
        <div className="p-6 rounded-3xl bg-gradient-to-br from-stone-50 to-stone-100 dark:from-[#1A1616] dark:to-[#1E1B1B] border border-stone-200 dark:border-[#2E2828] shadow-apple-card">
          <h2 className="text-xl font-black text-stone-900 dark:text-white">{p.productName}</h2>
          <p className="text-xs text-stone-500 dark:text-stone-400 mt-1">
            {formatDate(selectedDate)} · {p.batchCount} ബാച്ച് · {p.totalProductionKg.toFixed(1)} kg · {p.totalPacketsPacked} പാക്കറ്റുകൾ
          </p>
        </div>

        {/* Cost Breakdown */}
        <div className="space-y-2.5">
          <h3 className="text-sm font-black text-stone-800 dark:text-stone-200 px-1">ചെലവ് വിതരണ കണക്ക്</h3>

          {[
            { label: 'ചേരുവകളുടെ ചെലവ്', value: p.ingredientCost, icon: FiBox, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-950/20' },
            { label: 'ഉപയോഗിച്ച ഓയിലിന്റെ ചെലവ്', value: p.oilCost, icon: FiDroplet, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-950/20' },
            { label: 'കുക്കിംഗ് തൊഴിലാളികളുടെ കൂലി', value: p.productionWages, icon: FiUsers, color: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-50 dark:bg-orange-950/20' },
            { label: 'പാക്കിംഗ് തൊഴിലാളികളുടെ കൂലി', value: p.packingWages, icon: FiUsers, color: 'text-indigo-600 dark:text-indigo-400', bg: 'bg-indigo-50 dark:bg-indigo-950/20' },
            { label: 'പാക്കിംഗ് കവർ / മെറ്റീരിയലുകൾ', value: p.packagingMaterialCost, icon: FiPackage, color: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-50 dark:bg-purple-950/20' },
          ].map((item, idx) => {
            const Icon = item.icon;
            return (
              <div key={idx} className={`flex items-center justify-between p-4 rounded-2xl ${item.bg} border border-stone-100 dark:border-stone-800/30`}>
                <div className="flex items-center gap-3">
                  <Icon className={`w-5 h-5 ${item.color}`} />
                  <span className="text-xs sm:text-sm font-bold text-stone-700 dark:text-stone-300">{item.label}</span>
                </div>
                <span className="text-sm sm:text-base font-black text-stone-900 dark:text-white font-mono">{formatCurrency(item.value)}</span>
              </div>
            );
          })}

          {/* Total */}
          <div className="flex items-center justify-between p-5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/20 border-2 border-emerald-200 dark:border-emerald-800/50 mt-4">
            <span className="text-xs sm:text-sm font-black text-emerald-800 dark:text-emerald-300 uppercase tracking-wider">ആകെ ഉൽപ്പാദന ചെലവ്</span>
            <span className="text-xl font-black text-emerald-700 dark:text-emerald-200 font-mono">{formatCurrency(p.totalManufacturingCost)}</span>
          </div>
        </div>

        {/* Production Metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[
            { label: 'ആകെ ഉൽപ്പാദിപ്പിച്ചത്', value: `${p.totalProductionKg.toFixed(1)} kg` },
            { label: 'ആകെ പാക്കറ്റുകൾ', value: String(p.totalPacketsPacked) },
            { label: 'യൂണിറ്റ് ചെലവ് / കിലോ', value: formatCurrency(p.costPerKg) },
            { label: 'യൂണിറ്റ് ചെലവ് / പാക്കറ്റ്', value: p.totalPacketsPacked > 0 ? formatCurrency(p.costPerPacket) : '—' },
            { label: 'വില്പന വില / കിലോ', value: p.wholesalePricePerKg > 0 ? formatCurrency(p.wholesalePricePerKg) : 'നൽകിയിട്ടില്ല.' },
            { label: 'ലാഭം / കിലോ', value: p.wholesalePricePerKg > 0 ? formatCurrency(p.profitPerKg) : '—' },
          ].map((item, idx) => (
            <div key={idx} className="p-4 rounded-2xl bg-white dark:bg-[#1A1616] border border-stone-200 dark:border-[#2E2828] shadow-apple-card">
              <p className="text-[10px] font-bold text-stone-500 dark:text-stone-400 uppercase tracking-wider mb-1">{item.label}</p>
              <p className="text-base font-black text-stone-900 dark:text-white font-mono">{item.value}</p>
            </div>
          ))}
        </div>

        {/* Ingredient Details */}
        {detailIngredients.length > 0 && (
          <div className="space-y-2.5">
            <h3 className="text-sm font-black text-stone-800 dark:text-stone-200 px-1">ഉപയോഗിച്ച ചേരുവകൾ</h3>
            <div className="rounded-2xl border border-stone-200 dark:border-[#2E2828] overflow-hidden shadow-sm">
              <div className="grid grid-cols-[1fr_100px_100px] gap-2 px-4 py-3 bg-stone-50 dark:bg-[#1E1B1B] text-[10px] font-bold text-stone-500 dark:text-stone-400 uppercase tracking-wider">
                <span>ചേരുവ</span>
                <span className="text-right">അളവ്</span>
                <span className="text-right">ചെലവ്</span>
              </div>
              {detailIngredients.map((ing, idx) => (
                <div key={idx} className="grid grid-cols-[1fr_100px_100px] gap-2 px-4 py-3 border-t border-stone-100 dark:border-[#2E2828]/50 text-xs sm:text-sm">
                  <span className="font-bold text-stone-800 dark:text-stone-200 truncate">{ing.name}</span>
                  <span className="text-right text-stone-600 dark:text-stone-400 font-mono">{ing.qty.toFixed(2)} {ing.unit}</span>
                  <span className="text-right font-bold text-stone-900 dark:text-white font-mono">{formatCurrency(ing.cost)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Dashboard view
  return (
    <div className="space-y-6 pb-8 font-malayalam">
      {/* Top Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-stone-200 dark:border-[#2E2828]">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <FiSearch className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search product..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-stone-200 dark:border-[#2E2828] bg-white dark:bg-[#1E1B1B] text-xs text-stone-900 dark:text-white placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-epso-red/30 dark:focus:ring-amber-500/30 transition-all"
          />
        </div>

        {/* Date Selector & Refresh */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-stone-200 dark:border-[#2E2828] bg-white dark:bg-[#1E1B1B]">
            <FiCalendar className="w-4 h-4 text-stone-500 dark:text-stone-400" />
            <select
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-transparent text-xs font-bold text-stone-900 dark:text-white focus:outline-none cursor-pointer"
            >
              <option value="all">എല്ലാ ഉൽപ്പന്നങ്ങളും (All Products / Latest)</option>
              {availableDates.map((d) => (
                <option key={d} value={d}>
                  {formatDate(d)}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={() => loadCostingData(selectedDate)}
            disabled={isLoading}
            className="p-2.5 rounded-xl border border-stone-200 dark:border-[#2E2828] bg-white dark:bg-[#1E1B1B] text-stone-700 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-[#282323] transition-colors cursor-pointer disabled:opacity-50"
            title="Refresh Costing"
          >
            <FiRefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-epso-red dark:text-amber-400' : ''}`} />
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="min-h-[35vh] flex items-center justify-center">
          <LoadingSpinner size="md" label="കോസ്റ്റിംഗ് വിവരങ്ങൾ ലഭ്യമാക്കുന്നു..." />
        </div>
      ) : filteredProductCosts.length === 0 ? (
        <div className="min-h-[35vh] flex flex-col items-center justify-center gap-3 text-center">
          <FiLayers className="w-12 h-12 text-stone-300 dark:text-stone-600" />
          <p className="text-sm font-bold text-stone-500 dark:text-stone-400">ഉൽപ്പന്നങ്ങൾ ഒന്നും കണ്ടെത്താനായില്ല</p>
        </div>
      ) : (
        <>
          {/* Products Costing Grid - 3 cards in a row */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredProductCosts.map((p) => {
              const isEditing = editingPriceId === p.productId;
              const hasSellingPrice = p.wholesalePricePerKg > 0;
              const hasProfit = hasSellingPrice && p.costPerKg > 0;

              return (
                <div
                  key={p.productId}
                  className="p-5 rounded-2xl bg-white dark:bg-[#1E1B1B] border border-stone-200 dark:border-[#2E2828] shadow-apple-card dark:shadow-apple-card-dark flex flex-col justify-between transition-all hover:border-stone-300 dark:hover:border-stone-700"
                >
                  <div>
                    {/* Header: Title, Subtitle, and Details Button */}
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex-1 min-w-0 pr-2">
                        <h3 className="text-base font-bold text-stone-900 dark:text-white truncate">
                          {p.productName}
                        </h3>
                        <p className="text-[11px] text-stone-500 dark:text-stone-400 font-malayalam mt-0.5">
                          {p.totalProductionKg.toFixed(1)} kg · {p.batchCount} ബാച്ച് · {p.totalPacketsPacked} പാക്കറ്റുകൾ
                        </p>
                      </div>

                      <button
                        onClick={() => handleOpenDetail(p)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-stone-100 dark:bg-[#282323] text-stone-700 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-[#342D2D] text-xs font-bold transition-colors cursor-pointer shrink-0 font-malayalam"
                      >
                        <span>വിശദാംശങ്ങൾ →</span>
                      </button>
                    </div>

                    {/* Details Box - EXACTLY as requested */}
                    <div className="p-3 bg-stone-50 dark:bg-[#141212] rounded-xl border border-stone-100 dark:border-[#282323] space-y-2.5 my-3 text-xs font-malayalam">
                      {/* ഉൽപ്പാദന ചെലവ് */}
                      <div className="flex items-center justify-between">
                        <span className="text-stone-500 dark:text-stone-400 font-semibold">
                          ഉൽപ്പാദന ചെലവ്
                        </span>
                        <span className="font-black text-sm text-stone-900 dark:text-white font-mono">
                          {formatCurrency(p.totalManufacturingCost)}
                        </span>
                      </div>

                      {/* ചെലവ് / കിലോ */}
                      <div className="flex items-center justify-between pt-1 border-t border-stone-200/60 dark:border-[#282323]">
                        <span className="text-stone-500 dark:text-stone-400 font-semibold">
                          ചെലവ് / കിലോ
                        </span>
                        <span className="font-bold text-stone-900 dark:text-white font-mono">
                          {formatCurrency(p.costPerKg)}
                        </span>
                      </div>

                      {/* ചെലവ് / പാക്കറ്റ് */}
                      <div className="flex items-center justify-between pt-1 border-t border-stone-200/60 dark:border-[#282323]">
                        <span className="text-stone-500 dark:text-stone-400 font-semibold">
                          ചെലവ് / പാക്കറ്റ്
                        </span>
                        <span className="font-bold text-stone-900 dark:text-white font-mono">
                          {p.totalPacketsPacked > 0 ? formatCurrency(p.costPerPacket) : '—'}
                        </span>
                      </div>

                      {/* വില്പന വില / കിലോ */}
                      <div className="flex items-center justify-between pt-1 border-t border-stone-200/60 dark:border-[#282323]">
                        <span className="text-stone-500 dark:text-stone-400 font-semibold">
                          വില്പന വില / കിലോ
                        </span>
                        {isEditing ? (
                          <div className="flex items-center gap-1">
                            <span className="text-xs font-bold text-stone-400">₹</span>
                            <input
                              type="number"
                              value={editPriceValue}
                              onChange={(e) => setEditPriceValue(e.target.value)}
                              min="0"
                              step="1"
                              className="w-20 px-2 py-0.5 rounded-lg border border-epso-red dark:border-amber-500 bg-white dark:bg-[#1E1B1B] text-xs font-mono font-bold text-stone-900 dark:text-white focus:outline-none"
                              autoFocus
                            />
                            <button
                              onClick={() => handleSavePrice(p.productId)}
                              disabled={isSavingPrice}
                              className="p-1 rounded-md bg-emerald-600 text-white hover:bg-emerald-700 cursor-pointer"
                            >
                              {isSavingPrice ? <FiRefreshCw className="w-3 h-3 animate-spin" /> : <FiCheck className="w-3 h-3" />}
                            </button>
                            <button
                              onClick={() => setEditingPriceId(null)}
                              className="p-1 rounded-md bg-stone-200 dark:bg-stone-700 text-stone-600 dark:text-stone-300 hover:bg-stone-300 cursor-pointer"
                            >
                              <FiX className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <span className={`font-extrabold text-sm font-mono ${hasSellingPrice ? 'text-epso-red dark:text-amber-400' : 'text-stone-400 font-sans italic text-xs'}`}>
                              {hasSellingPrice ? formatCurrency(p.wholesalePricePerKg) : 'നൽകിയിട്ടില്ല.'}
                            </span>
                            <button
                              onClick={() => {
                                setEditingPriceId(p.productId);
                                setEditPriceValue(String(p.wholesalePricePerKg || ''));
                              }}
                              className="p-1 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 transition-colors cursor-pointer"
                              title="വില മാറ്റുക"
                            >
                              <FiEdit3 className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Profit / Margin info if available */}
                      {hasProfit && !isEditing && (
                        <div className="flex items-center justify-between pt-1 border-t border-stone-200/60 dark:border-[#282323]">
                          <span className="text-stone-500 dark:text-stone-400 font-semibold">
                            ലാഭം / കിലോ
                          </span>
                          <div className="flex items-center gap-1.5 font-mono">
                            <span className={`font-bold ${p.profitPerKg >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>
                              {formatCurrency(p.profitPerKg)}
                            </span>
                            <span className={`text-[10px] px-1.5 py-0.2 rounded font-bold ${p.profitMarginPercent >= 0 ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300' : 'bg-red-50 text-red-600'}`}>
                              {p.profitMarginPercent.toFixed(1)}%
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};
