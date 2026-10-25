import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Product,
  Ingredient,
  ProductionRun,
  StockMovement,
} from '../types';
import {
  fetchDailyClosing,
  fetchCostAllocations,
  fetchPackingRecords,
  fetchDailyWage,
  fetchProductSellingPrices,
  saveProductSellingPrice,
  supabase,
} from '../services/supabase';
import { roundCurrency, roundStock } from '../services/costing';
import { LoadingSpinner } from './LoadingSpinner';
import {
  FiCalendar,
  FiDollarSign,
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
  const latestProductionDate = useMemo(() => {
    const dates = productionRuns
      .filter((r) => r.status === 'completed' && r.productionDate)
      .map((r) => r.productionDate)
      .sort();
    return dates.length > 0 ? dates[dates.length - 1] : new Date().toISOString().split('T')[0];
  }, [productionRuns]);

  const [selectedDate, setSelectedDate] = useState<string>(latestProductionDate);

  useEffect(() => {
    setSelectedDate(latestProductionDate);
  }, [latestProductionDate]);
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

  const loadCostingData = useCallback(async (date: string) => {
    setIsLoading(true);
    try {
      // 1. Fetch all needed data in parallel
      const [closing, allocations, packingRecords, wageData, pricesData] = await Promise.all([
        fetchDailyClosing(date),
        fetchCostAllocations(date),
        fetchPackingRecords({ date }),
        fetchDailyWage(date),
        fetchProductSellingPrices(),
      ]);

      // Build selling prices map
      const priceMap: Record<string, number> = {};
      for (const p of pricesData) {
        priceMap[p.productId] = p.wholesalePricePerKg;
      }
      setSellingPrices(priceMap);

      // 2. Filter completed runs for the selected date
      const runsForDate = productionRuns.filter(
        (r) => r.productionDate === date && r.status === 'completed'
      );

      if (runsForDate.length === 0) {
        setProductCosts([]);
        return;
      }

      // 3. Group runs by productId
      const runsByProduct: Record<string, ProductionRun[]> = {};
      for (const run of runsForDate) {
        if (!runsByProduct[run.productId]) {
          runsByProduct[run.productId] = [];
        }
        runsByProduct[run.productId].push(run);
      }

      // 4. Calculate total production kg across all products for weight-proportional allocation
      const totalDayProductionKg = runsForDate.reduce((sum, r) => sum + (r.actualQuantity || 0), 0);

      // 5. Total fresh oil cost for the day
      let dayOilCost = 0;
      if (closing && closing.oilConsumed > 0) {
        dayOilCost = roundCurrency(closing.oilConsumed * (closing.oilCostPerKg || 150));
      }

      // 6. Wages
      const dayProdWages = wageData?.productionWageAmount ?? (closing?.productionWages || 0);
      const dayPackWages = wageData?.packingWageAmount ?? 0;

      // Total packets for the day across all products
      const dayTotalPackets = packingRecords.reduce((sum, pr) => sum + (pr.packetsPacked || 0), 0);

      // 7. Calculate cost summary per product
      const summaries: ProductCostSummary[] = [];

      for (const [pId, pRuns] of Object.entries(runsByProduct)) {
        const prod = products.find((p) => p.id === pId);
        const prodName = prod?.name || pRuns[0]?.productName || 'Product';

        // Total production kg for this product
        const totalKg = pRuns.reduce((sum, r) => sum + (r.actualQuantity || 0), 0);
        const batchCount = pRuns.length;

        // Weight share
        const weightRatio = totalDayProductionKg > 0 ? totalKg / totalDayProductionKg : 0;

        // Ingredients cost from runs
        let ingredientCost = 0;
        for (const run of pRuns) {
          if (run.ingredientsConsumed && Array.isArray(run.ingredientsConsumed)) {
            for (const ing of run.ingredientsConsumed) {
              ingredientCost += (ing.totalCost || 0);
            }
          }
        }
        ingredientCost = roundCurrency(ingredientCost);

        // Allocated oil cost
        const oilCost = roundCurrency(dayOilCost * weightRatio);

        // Allocated production wages
        const productionWages = roundCurrency(dayProdWages * weightRatio);

        // Product packing records
        const prodPacking = packingRecords.filter((pr) => pr.productId === pId);
        const prodPackets = prodPacking.reduce((sum, pr) => sum + (pr.packetsPacked || 0), 0);

        // Packaging material cost
        const packagingMaterialCost = roundCurrency(
          prodPacking.reduce((sum, pr) => sum + (pr.packagingCost || 0), 0)
        );

        // Allocated packing wages
        let packingWages = 0;
        if (dayTotalPackets > 0 && prodPackets > 0) {
          packingWages = roundCurrency(dayPackWages * (prodPackets / dayTotalPackets));
        } else if (weightRatio > 0 && dayPackWages > 0) {
          packingWages = roundCurrency(dayPackWages * weightRatio);
        }

        // Total manufacturing cost
        const totalManufacturingCost = roundCurrency(
          ingredientCost + oilCost + productionWages + packingWages + packagingMaterialCost
        );

        // Cost per kg
        const costPerKg = totalKg > 0 ? roundCurrency(totalManufacturingCost / totalKg) : 0;

        // Cost per packet
        const costPerPacket = prodPackets > 0 ? roundCurrency(totalManufacturingCost / prodPackets) : 0;

        // Selling price
        const wholesalePricePerKg = priceMap[pId] || prod?.wholesalePrice || 0;

        // Profit per kg
        const profitPerKg = wholesalePricePerKg > 0 ? roundCurrency(wholesalePricePerKg - costPerKg) : 0;

        // Profit per packet
        const profitPerPacket = wholesalePricePerKg > 0 && prodPackets > 0
          ? roundCurrency((wholesalePricePerKg * totalKg - totalManufacturingCost) / prodPackets)
          : 0;

        // Profit margin %
        const profitMarginPercent = wholesalePricePerKg > 0
          ? Number(((profitPerKg / wholesalePricePerKg) * 100).toFixed(1))
          : 0;

        summaries.push({
          productId: pId,
          productName: prodName,
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
    const runsForDate = productionRuns.filter(
      (r) => r.productionDate === selectedDate && r.status === 'completed' && r.productId === productId
    );

    const ingMap: Record<string, { name: string; unit: string; qty: number; cost: number }> = {};

    for (const run of runsForDate) {
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
    try {
      return new Date(dateStr + 'T00:00:00').toLocaleDateString('ml-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  // Summary totals
  const totals = useMemo(() => {
    return {
      totalKg: productCosts.reduce((s, p) => s + p.totalProductionKg, 0),
      totalIngredientCost: productCosts.reduce((s, p) => s + p.ingredientCost, 0),
      totalOilCost: productCosts.reduce((s, p) => s + p.oilCost, 0),
      totalProdWages: productCosts.reduce((s, p) => s + p.productionWages, 0),
      totalPackWages: productCosts.reduce((s, p) => s + p.packingWages, 0),
      totalPackMaterial: productCosts.reduce((s, p) => s + p.packagingMaterialCost, 0),
      totalMfgCost: productCosts.reduce((s, p) => s + p.totalManufacturingCost, 0),
      totalPackets: productCosts.reduce((s, p) => s + p.totalPacketsPacked, 0),
    };
  }, [productCosts]);

  // Detail view
  if (selectedProduct) {
    const p = selectedProduct;
    return (
      <div className="space-y-5 pb-8 font-malayalam">
        {/* Back Button */}
        <button
          onClick={() => setSelectedProduct(null)}
          className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-stone-100 dark:bg-[#1E1B1B] border border-stone-200 dark:border-[#2E2828] text-xs font-bold text-stone-700 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-[#282323] transition-colors cursor-pointer press-apple"
        >
          <FiArrowLeft className="w-3.5 h-3.5" />
          <span>← തിരികെ ലിസ്റ്റിലേക്ക്</span>
        </button>

        {/* Product Header */}
        <div className="p-5 rounded-2xl bg-gradient-to-br from-stone-50 to-stone-100 dark:from-[#1A1616] dark:to-[#1E1B1B] border border-stone-200 dark:border-[#2E2828]">
          <h2 className="text-lg font-black text-stone-900 dark:text-white">{p.productName}</h2>
          <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">{formatDate(selectedDate)} · {p.batchCount} ബാച്ച് · {p.totalProductionKg.toFixed(1)} kg</p>
        </div>

        {/* Cost Breakdown */}
        <div className="space-y-2">
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
              <div key={idx} className={`flex items-center justify-between p-3.5 rounded-xl ${item.bg} border border-stone-100 dark:border-stone-800/30`}>
                <div className="flex items-center gap-2.5">
                  <Icon className={`w-4 h-4 ${item.color}`} />
                  <span className="text-xs font-bold text-stone-700 dark:text-stone-300">{item.label}</span>
                </div>
                <span className="text-sm font-black text-stone-900 dark:text-white font-mono">{formatCurrency(item.value)}</span>
              </div>
            );
          })}

          {/* Total */}
          <div className="flex items-center justify-between p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/20 border-2 border-emerald-200 dark:border-emerald-800/50 mt-3">
            <span className="text-xs font-black text-emerald-800 dark:text-emerald-300 uppercase tracking-wider">ആകെ ഉൽപ്പാദന ചെലവ്</span>
            <span className="text-lg font-black text-emerald-700 dark:text-emerald-200 font-mono">{formatCurrency(p.totalManufacturingCost)}</span>
          </div>
        </div>

        {/* Production Metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[
            { label: 'ആകെ ഉൽപ്പാദിപ്പിച്ചത്', value: `${p.totalProductionKg.toFixed(1)} kg` },
            { label: 'ആകെ പാക്കറ്റുകൾ', value: String(p.totalPacketsPacked) },
            { label: 'യൂണിറ്റ് ചെലവ് / കിലോ', value: formatCurrency(p.costPerKg) },
            { label: 'യൂണിറ്റ് ചെലവ് / പാക്കറ്റ്', value: p.totalPacketsPacked > 0 ? formatCurrency(p.costPerPacket) : '—' },
            { label: 'വില്പന വില / കിലോ', value: p.wholesalePricePerKg > 0 ? formatCurrency(p.wholesalePricePerKg) : 'നൽകിയിട്ടില്ല' },
            { label: 'ലാഭം / കിലോ', value: p.wholesalePricePerKg > 0 ? formatCurrency(p.profitPerKg) : '—' },
          ].map((item, idx) => (
            <div key={idx} className="p-3 rounded-xl bg-white dark:bg-[#1A1616] border border-stone-200 dark:border-[#2E2828]">
              <p className="text-[10px] font-bold text-stone-500 dark:text-stone-400 uppercase tracking-wider mb-1">{item.label}</p>
              <p className="text-sm font-black text-stone-900 dark:text-white font-mono">{item.value}</p>
            </div>
          ))}
        </div>

        {/* Ingredient Details */}
        {detailIngredients.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-black text-stone-800 dark:text-stone-200 px-1">ഉപയോഗിച്ച ചേരുവകൾ</h3>
            <div className="rounded-xl border border-stone-200 dark:border-[#2E2828] overflow-hidden">
              <div className="grid grid-cols-[1fr_80px_80px] gap-2 px-4 py-2 bg-stone-50 dark:bg-[#1E1B1B] text-[10px] font-bold text-stone-500 dark:text-stone-400 uppercase tracking-wider">
                <span>ചേരുവ</span>
                <span className="text-right">അളവ്</span>
                <span className="text-right">ചെലവ്</span>
              </div>
              {detailIngredients.map((ing, idx) => (
                <div key={idx} className="grid grid-cols-[1fr_80px_80px] gap-2 px-4 py-2.5 border-t border-stone-100 dark:border-[#2E2828]/50 text-xs">
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
      {isLoading ? (
        <div className="min-h-[30vh] flex items-center justify-center">
          <LoadingSpinner size="md" label="കോസ്റ്റിംഗ് വിവരങ്ങൾ ലഭ്യമാക്കുന്നു..." />
        </div>
      ) : productCosts.length === 0 ? (
        <div className="min-h-[30vh] flex flex-col items-center justify-center gap-3 text-center">
          <FiLayers className="w-12 h-12 text-stone-300 dark:text-stone-600" />
          <p className="text-sm font-bold text-stone-500 dark:text-stone-400">ഉൽപ്പാദന വിവരങ്ങൾ ലഭ്യമല്ല</p>
        </div>
      ) : (
        <>

          {/* Product Cards */}
          <div className="space-y-3">
            <h3 className="text-sm font-black text-stone-800 dark:text-stone-200 px-1">ഉൽപ്പന്ന തിരിച്ചുള്ള ചെലവ് കണക്ക്</h3>

            {productCosts.map((p) => {
              const isEditing = editingPriceId === p.productId;
              const hasProfit = p.wholesalePricePerKg > 0;

              return (
                <div
                  key={p.productId}
                  className="p-4 rounded-2xl bg-white dark:bg-[#1A1616] border border-stone-200 dark:border-[#2E2828] shadow-sm hover:shadow-md transition-shadow"
                >
                  {/* Product Name & Quick Stats */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 min-w-0">
                      <button
                        onClick={() => handleOpenDetail(p)}
                        className="text-left group cursor-pointer"
                      >
                        <h4 className="text-sm font-black text-stone-900 dark:text-white truncate group-hover:text-epso-red dark:group-hover:text-amber-400 transition-colors">
                          {p.productName}
                        </h4>
                      </button>
                      <p className="text-[10px] text-stone-500 dark:text-stone-400 mt-0.5">
                        {p.totalProductionKg.toFixed(1)} kg · {p.batchCount} ബാച്ച് · {p.totalPacketsPacked} പാക്കറ്റുകൾ
                      </p>
                    </div>
                    <button
                      onClick={() => handleOpenDetail(p)}
                      className="ml-2 px-2.5 py-1 rounded-lg bg-stone-100 dark:bg-[#282323] text-[10px] font-bold text-stone-600 dark:text-stone-400 hover:bg-stone-200 dark:hover:bg-[#342D2D] transition-colors cursor-pointer whitespace-nowrap"
                    >
                      വിശദാംശങ്ങൾ →
                    </button>
                  </div>

                  {/* Cost Grid */}
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    <div className="p-2 rounded-lg bg-stone-50 dark:bg-[#1E1B1B]">
                      <p className="text-[9px] font-bold text-stone-500 dark:text-stone-400">ഉൽപ്പാദന ചെലവ്</p>
                      <p className="text-xs font-black text-stone-900 dark:text-white font-mono">{formatCurrency(p.totalManufacturingCost)}</p>
                    </div>
                    <div className="p-2 rounded-lg bg-stone-50 dark:bg-[#1E1B1B]">
                      <p className="text-[9px] font-bold text-stone-500 dark:text-stone-400">ചെലവ് / കിലോ</p>
                      <p className="text-xs font-black text-stone-900 dark:text-white font-mono">{formatCurrency(p.costPerKg)}</p>
                    </div>
                    <div className="p-2 rounded-lg bg-stone-50 dark:bg-[#1E1B1B]">
                      <p className="text-[9px] font-bold text-stone-500 dark:text-stone-400">ചെലവ് / പാക്കറ്റ്</p>
                      <p className="text-xs font-black text-stone-900 dark:text-white font-mono">{p.totalPacketsPacked > 0 ? formatCurrency(p.costPerPacket) : '—'}</p>
                    </div>
                  </div>

                  {/* Selling Price & Profit */}
                  <div className="flex items-center justify-between p-3 rounded-xl bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-950/15 dark:to-teal-950/15 border border-emerald-100 dark:border-emerald-900/20">
                    <div className="flex-1 min-w-0">
                      {isEditing ? (
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-stone-500">₹</span>
                          <input
                            type="number"
                            value={editPriceValue}
                            onChange={(e) => setEditPriceValue(e.target.value)}
                            min="0"
                            step="1"
                            className="w-24 px-2 py-1 rounded-lg border border-emerald-300 dark:border-emerald-700 bg-white dark:bg-[#1A1616] text-xs font-bold text-stone-900 dark:text-white font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                            autoFocus
                            placeholder="വില/കിലോ"
                          />
                          <button
                            onClick={() => handleSavePrice(p.productId)}
                            disabled={isSavingPrice}
                            className="p-1 rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 transition-colors cursor-pointer"
                          >
                            {isSavingPrice ? <FiRefreshCw className="w-3.5 h-3.5 animate-spin" /> : <FiCheck className="w-3.5 h-3.5" />}
                          </button>
                          <button
                            onClick={() => setEditingPriceId(null)}
                            className="p-1 rounded-lg bg-stone-200 dark:bg-stone-700 text-stone-600 dark:text-stone-300 hover:bg-stone-300 transition-colors cursor-pointer"
                          >
                            <FiX className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <div>
                            <p className="text-[9px] font-bold text-stone-500 dark:text-stone-400">വില്പന വില / കിലോ</p>
                            <p className="text-sm font-black text-emerald-700 dark:text-emerald-300 font-mono">
                              {hasProfit ? formatCurrency(p.wholesalePricePerKg) : 'നൽകിയിട്ടില്ല'}
                            </p>
                          </div>
                          <button
                            onClick={() => {
                              setEditingPriceId(p.productId);
                              setEditPriceValue(String(p.wholesalePricePerKg || ''));
                            }}
                            className="p-1.5 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-200 dark:hover:bg-emerald-800/40 transition-colors cursor-pointer"
                            title="വില മാറ്റുക"
                          >
                            <FiEdit3 className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </div>

                    {hasProfit && !isEditing && (
                      <div className="text-right">
                        <p className="text-[9px] font-bold text-stone-500 dark:text-stone-400">ലാഭം / കിലോ</p>
                        <div className="flex items-center gap-1 justify-end font-mono">
                          {p.profitPerKg >= 0 ? (
                            <FiTrendingUp className="w-3 h-3 text-emerald-500" />
                          ) : (
                            <FiTrendingDown className="w-3 h-3 text-red-500" />
                          )}
                          <span className={`text-sm font-black ${p.profitPerKg >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                            {formatCurrency(p.profitPerKg)}
                          </span>
                        </div>
                        <p className={`text-[10px] font-bold font-mono ${p.profitMarginPercent >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                          {p.profitMarginPercent.toFixed(1)}% മാർജിൻ
                        </p>
                      </div>
                    )}
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
