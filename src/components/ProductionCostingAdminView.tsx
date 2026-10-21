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
  const [selectedDate, setSelectedDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
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

      // 2. Get completed runs for this date
      const runsForDate = productionRuns.filter(
        (r) => r.productionDate === date && r.status === 'completed'
      );

      // 3. Group production by product
      const productMap: Record<string, {
        productId: string;
        productName: string;
        totalProductionKg: number;
        batchCount: number;
        ingredientCost: number;
        runs: ProductionRun[];
      }> = {};

      for (const run of runsForDate) {
        const pId = run.productId;
        if (!productMap[pId]) {
          productMap[pId] = {
            productId: pId,
            productName: run.productName || 'Product',
            totalProductionKg: 0,
            batchCount: 0,
            ingredientCost: 0,
            runs: [],
          };
        }
        productMap[pId].totalProductionKg += run.actualQuantity;
        productMap[pId].batchCount += 1;
        productMap[pId].runs.push(run);

        // Calculate ingredient cost from consumption data
        if (run.ingredientsConsumed) {
          for (const ic of run.ingredientsConsumed) {
            const costPerUnit = ic.unitCost || 0;
            const ingCost = costPerUnit > 0 ? costPerUnit * ic.actualQuantity : 0;
            productMap[pId].ingredientCost += ingCost;
          }
        }
        // Also add from totalIngredientCost if available and no consumption detail
        if ((!run.ingredientsConsumed || run.ingredientsConsumed.length === 0) && run.totalIngredientCost) {
          productMap[pId].ingredientCost += run.totalIngredientCost;
        }
      }

      const totalProductionKg = Object.values(productMap).reduce((sum, p) => sum + p.totalProductionKg, 0);

      // 4. Get oil and wage data
      const oilExpense = closing?.oilTotalExpense || 0;
      const productionWagesTotal = wageData?.productionWageAmount || closing?.productionWages || 0;
      const packingWagesTotal = wageData?.packingWageAmount || 0;

      // 5. Get total packets from packing records
      const packingByProduct: Record<string, { packets: number; materialCost: number }> = {};
      for (const pr of packingRecords) {
        if (!packingByProduct[pr.productId]) {
          packingByProduct[pr.productId] = { packets: 0, materialCost: 0 };
        }
        packingByProduct[pr.productId].packets += pr.packetsPacked;
        packingByProduct[pr.productId].materialCost += pr.packagingCost || 0;
      }
      const totalPackets = Object.values(packingByProduct).reduce((sum, p) => sum + p.packets, 0);

      // 6. Calculate allocations per product
      const productCostList: ProductCostSummary[] = Object.values(productMap).map((p) => {
        const weightRatio = totalProductionKg > 0 ? p.totalProductionKg / totalProductionKg : 0;
        const productPackets = packingByProduct[p.productId]?.packets || 0;
        const packetRatio = totalPackets > 0 ? productPackets / totalPackets : 0;

        // Use saved allocations if available, otherwise calculate from ratios
        const savedAlloc = allocations.find((a) => a.productId === p.productId);

        const allocOilCost = savedAlloc?.allocatedOilCost ?? roundCurrency(weightRatio * oilExpense);
        const allocProdWages = savedAlloc?.allocatedProductionWages ?? roundCurrency(weightRatio * productionWagesTotal);
        const allocPackWages = roundCurrency(packetRatio * packingWagesTotal);
        const packMaterialCost = packingByProduct[p.productId]?.materialCost || 0;

        const ingCost = savedAlloc?.ingredientCost ?? roundCurrency(p.ingredientCost);

        const totalMfgCost = roundCurrency(
          ingCost + allocOilCost + allocProdWages + allocPackWages + packMaterialCost
        );

        const costPerKg = p.totalProductionKg > 0 ? roundCurrency(totalMfgCost / p.totalProductionKg) : 0;
        const costPerPacket = productPackets > 0 ? roundCurrency(totalMfgCost / productPackets) : 0;

        const sellingPrice = priceMap[p.productId] || 0;
        const profitPerKg = sellingPrice > 0 ? roundCurrency(sellingPrice - costPerKg) : 0;
        const profitPerPacket = productPackets > 0 && sellingPrice > 0
          ? roundCurrency((sellingPrice * p.totalProductionKg / productPackets) - costPerPacket)
          : 0;
        const profitMargin = sellingPrice > 0 ? roundCurrency((profitPerKg / sellingPrice) * 100) : 0;

        return {
          productId: p.productId,
          productName: p.productName,
          totalProductionKg: p.totalProductionKg,
          batchCount: p.batchCount,
          ingredientCost: ingCost,
          oilCost: allocOilCost,
          productionWages: allocProdWages,
          packingWages: allocPackWages,
          packagingMaterialCost: packMaterialCost,
          totalPacketsPacked: productPackets,
          totalManufacturingCost: totalMfgCost,
          costPerKg,
          costPerPacket,
          wholesalePricePerKg: sellingPrice,
          profitPerKg,
          profitPerPacket,
          profitMarginPercent: profitMargin,
        };
      });

      setProductCosts(productCostList);
    } catch (err) {
      console.error('Error loading costing data:', err);
    } finally {
      setIsLoading(false);
    }
  }, [productionRuns]);

  useEffect(() => {
    loadCostingData(selectedDate);
  }, [selectedDate, loadCostingData]);

  // Load ingredient details for a specific product
  const loadProductDetail = useCallback(async (productId: string) => {
    const runsForDate = productionRuns.filter(
      (r) => r.productionDate === selectedDate && r.status === 'completed' && r.productId === productId
    );

    const ingMap: Record<string, { name: string; qty: number; unit: string; cost: number }> = {};
    for (const run of runsForDate) {
      if (run.ingredientsConsumed) {
        for (const ic of run.ingredientsConsumed) {
          const name = ic.ingredientName || 'Unknown';
          if (!ingMap[name]) {
            ingMap[name] = { name, qty: 0, unit: ic.unit, cost: 0 };
          }
          ingMap[name].qty += ic.actualQuantity;
          const unitCost = ic.unitCost || 0;
          ingMap[name].cost += unitCost * ic.actualQuantity;
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
      // Recalculate costs with new price
      await loadCostingData(selectedDate);
    } catch (err: any) {
      alert(`Failed to save price: ${err?.message || 'Unknown error'}`);
    } finally {
      setIsSavingPrice(false);
    }
  };

  const formatCurrency = (val: number) => `₹${val.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
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
      <div className="space-y-5 pb-8">
        {/* Back Button */}
        <button
          onClick={() => setSelectedProduct(null)}
          className="flex items-center gap-2 px-3 py-2 rounded-xl bg-stone-100 dark:bg-[#1E1B1B] border border-stone-200 dark:border-[#2E2828] text-xs font-bold text-stone-700 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-[#282323] transition-colors cursor-pointer press-apple"
        >
          <FiArrowLeft className="w-3.5 h-3.5" />
          Back to Dashboard
        </button>

        {/* Product Header */}
        <div className="p-5 rounded-2xl bg-gradient-to-br from-stone-50 to-stone-100 dark:from-[#1A1616] dark:to-[#1E1B1B] border border-stone-200 dark:border-[#2E2828]">
          <h2 className="text-lg font-black text-stone-900 dark:text-white font-malayalam">{p.productName}</h2>
          <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">{formatDate(selectedDate)} · {p.batchCount} batch(es) · {p.totalProductionKg.toFixed(1)} kg</p>
        </div>

        {/* Cost Breakdown */}
        <div className="space-y-2">
          <h3 className="text-sm font-black text-stone-800 dark:text-stone-200 px-1">Cost Breakdown</h3>

          {[
            { label: 'Ingredients', value: p.ingredientCost, icon: FiBox, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-950/20' },
            { label: 'Fresh Oil Consumed', value: p.oilCost, icon: FiDroplet, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-950/20' },
            { label: 'Production Wages (Cooks)', value: p.productionWages, icon: FiUsers, color: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-50 dark:bg-orange-950/20' },
            { label: 'Packing Wages', value: p.packingWages, icon: FiUsers, color: 'text-indigo-600 dark:text-indigo-400', bg: 'bg-indigo-50 dark:bg-indigo-950/20' },
            { label: 'Packaging Materials', value: p.packagingMaterialCost, icon: FiPackage, color: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-50 dark:bg-purple-950/20' },
          ].map((item, idx) => {
            const Icon = item.icon;
            return (
              <div key={idx} className={`flex items-center justify-between p-3.5 rounded-xl ${item.bg} border border-stone-100 dark:border-stone-800/30`}>
                <div className="flex items-center gap-2.5">
                  <Icon className={`w-4 h-4 ${item.color}`} />
                  <span className="text-xs font-bold text-stone-700 dark:text-stone-300">{item.label}</span>
                </div>
                <span className="text-sm font-black text-stone-900 dark:text-white">{formatCurrency(item.value)}</span>
              </div>
            );
          })}

          {/* Total */}
          <div className="flex items-center justify-between p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/20 border-2 border-emerald-200 dark:border-emerald-800/50 mt-3">
            <span className="text-xs font-black text-emerald-800 dark:text-emerald-300 uppercase tracking-wider">Total Manufacturing Cost</span>
            <span className="text-lg font-black text-emerald-700 dark:text-emerald-200">{formatCurrency(p.totalManufacturingCost)}</span>
          </div>
        </div>

        {/* Production Metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[
            { label: 'Total Produced', value: `${p.totalProductionKg.toFixed(1)} kg` },
            { label: 'Total Packets', value: String(p.totalPacketsPacked) },
            { label: 'Cost / kg', value: formatCurrency(p.costPerKg) },
            { label: 'Cost / Packet', value: p.totalPacketsPacked > 0 ? formatCurrency(p.costPerPacket) : 'N/A' },
            { label: 'Selling Price / kg', value: p.wholesalePricePerKg > 0 ? formatCurrency(p.wholesalePricePerKg) : 'Not Set' },
            { label: 'Profit / kg', value: p.wholesalePricePerKg > 0 ? formatCurrency(p.profitPerKg) : 'N/A' },
          ].map((item, idx) => (
            <div key={idx} className="p-3 rounded-xl bg-white dark:bg-[#1A1616] border border-stone-200 dark:border-[#2E2828]">
              <p className="text-[10px] font-bold text-stone-500 dark:text-stone-400 uppercase tracking-wider mb-1">{item.label}</p>
              <p className="text-sm font-black text-stone-900 dark:text-white">{item.value}</p>
            </div>
          ))}
        </div>

        {/* Ingredient Details */}
        {detailIngredients.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-black text-stone-800 dark:text-stone-200 px-1">Ingredients Used</h3>
            <div className="rounded-xl border border-stone-200 dark:border-[#2E2828] overflow-hidden">
              <div className="grid grid-cols-[1fr_80px_80px] gap-2 px-4 py-2 bg-stone-50 dark:bg-[#1E1B1B] text-[10px] font-bold text-stone-500 dark:text-stone-400 uppercase tracking-wider">
                <span>Ingredient</span>
                <span className="text-right">Qty Used</span>
                <span className="text-right">Cost</span>
              </div>
              {detailIngredients.map((ing, idx) => (
                <div key={idx} className="grid grid-cols-[1fr_80px_80px] gap-2 px-4 py-2.5 border-t border-stone-100 dark:border-[#2E2828]/50 text-xs">
                  <span className="font-bold text-stone-800 dark:text-stone-200 font-malayalam truncate">{ing.name}</span>
                  <span className="text-right text-stone-600 dark:text-stone-400">{ing.qty.toFixed(2)} {ing.unit}</span>
                  <span className="text-right font-bold text-stone-900 dark:text-white">{formatCurrency(ing.cost)}</span>
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
      </div>

      {isLoading ? (
        <div className="min-h-[30vh] flex items-center justify-center">
          <LoadingSpinner size="md" label="Loading costing data..." />
        </div>
      ) : productCosts.length === 0 ? (
        <div className="min-h-[30vh] flex flex-col items-center justify-center gap-3 text-center">
          <FiLayers className="w-12 h-12 text-stone-300 dark:text-stone-600" />
          <p className="text-sm font-bold text-stone-500 dark:text-stone-400">No production data for this date</p>
          <p className="text-xs text-stone-400 dark:text-stone-500">Select a date with completed production runs</p>
        </div>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3.5 rounded-2xl bg-blue-50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/30">
              <p className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider">Production</p>
              <p className="text-lg font-black text-blue-800 dark:text-blue-200">{totals.totalKg.toFixed(1)} kg</p>
            </div>
            <div className="p-3.5 rounded-2xl bg-purple-50 dark:bg-purple-950/20 border border-purple-100 dark:border-purple-900/30">
              <p className="text-[10px] font-bold text-purple-600 dark:text-purple-400 uppercase tracking-wider">Packets</p>
              <p className="text-lg font-black text-purple-800 dark:text-purple-200">{totals.totalPackets}</p>
            </div>
            <div className="p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30">
              <p className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">Total Cost</p>
              <p className="text-lg font-black text-emerald-800 dark:text-emerald-200">{formatCurrency(totals.totalMfgCost)}</p>
            </div>
            <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/30">
              <p className="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider">Products</p>
              <p className="text-lg font-black text-amber-800 dark:text-amber-200">{productCosts.length}</p>
            </div>
          </div>

          {/* Expense Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {[
              { label: 'Ingredients', value: totals.totalIngredientCost, color: 'text-blue-600 dark:text-blue-400' },
              { label: 'Oil', value: totals.totalOilCost, color: 'text-amber-600 dark:text-amber-400' },
              { label: 'Prod. Wages', value: totals.totalProdWages, color: 'text-orange-600 dark:text-orange-400' },
              { label: 'Pack. Wages', value: totals.totalPackWages, color: 'text-indigo-600 dark:text-indigo-400' },
              { label: 'Packaging', value: totals.totalPackMaterial, color: 'text-purple-600 dark:text-purple-400' },
            ].map((item, idx) => (
              <div key={idx} className="p-2.5 rounded-xl bg-white dark:bg-[#1A1616] border border-stone-200 dark:border-[#2E2828]">
                <p className="text-[9px] font-bold text-stone-500 dark:text-stone-400 uppercase tracking-wider">{item.label}</p>
                <p className={`text-sm font-black ${item.color}`}>{formatCurrency(item.value)}</p>
              </div>
            ))}
          </div>

          {/* Product Cards */}
          <div className="space-y-3">
            <h3 className="text-sm font-black text-stone-800 dark:text-stone-200 px-1">Product-wise Costing</h3>

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
                        <h4 className="text-sm font-black text-stone-900 dark:text-white font-malayalam truncate group-hover:text-epso-red dark:group-hover:text-amber-400 transition-colors">
                          {p.productName}
                        </h4>
                      </button>
                      <p className="text-[10px] text-stone-500 dark:text-stone-400 mt-0.5">
                        {p.totalProductionKg.toFixed(1)} kg · {p.batchCount} batch · {p.totalPacketsPacked} packets
                      </p>
                    </div>
                    <button
                      onClick={() => handleOpenDetail(p)}
                      className="ml-2 px-2.5 py-1 rounded-lg bg-stone-100 dark:bg-[#282323] text-[10px] font-bold text-stone-600 dark:text-stone-400 hover:bg-stone-200 dark:hover:bg-[#342D2D] transition-colors cursor-pointer whitespace-nowrap"
                    >
                      Details →
                    </button>
                  </div>

                  {/* Cost Grid */}
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    <div className="p-2 rounded-lg bg-stone-50 dark:bg-[#1E1B1B]">
                      <p className="text-[9px] font-bold text-stone-500 dark:text-stone-400">MFG Cost</p>
                      <p className="text-xs font-black text-stone-900 dark:text-white">{formatCurrency(p.totalManufacturingCost)}</p>
                    </div>
                    <div className="p-2 rounded-lg bg-stone-50 dark:bg-[#1E1B1B]">
                      <p className="text-[9px] font-bold text-stone-500 dark:text-stone-400">Cost/kg</p>
                      <p className="text-xs font-black text-stone-900 dark:text-white">{formatCurrency(p.costPerKg)}</p>
                    </div>
                    <div className="p-2 rounded-lg bg-stone-50 dark:bg-[#1E1B1B]">
                      <p className="text-[9px] font-bold text-stone-500 dark:text-stone-400">Cost/pkt</p>
                      <p className="text-xs font-black text-stone-900 dark:text-white">{p.totalPacketsPacked > 0 ? formatCurrency(p.costPerPacket) : '—'}</p>
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
                            className="w-24 px-2 py-1 rounded-lg border border-emerald-300 dark:border-emerald-700 bg-white dark:bg-[#1A1616] text-xs font-bold text-stone-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                            autoFocus
                            placeholder="Price/kg"
                          />
                          <button
                            onClick={() => handleSavePrice(p.productId)}
                            disabled={isSavingPrice}
                            className="p-1 rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 transition-colors cursor-pointer"
                          >
                            <FiCheck className="w-3.5 h-3.5" />
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
                            <p className="text-[9px] font-bold text-stone-500 dark:text-stone-400">Sell Price/kg</p>
                            <p className="text-sm font-black text-emerald-700 dark:text-emerald-300">
                              {hasProfit ? formatCurrency(p.wholesalePricePerKg) : 'Not Set'}
                            </p>
                          </div>
                          <button
                            onClick={() => {
                              setEditingPriceId(p.productId);
                              setEditPriceValue(String(p.wholesalePricePerKg || ''));
                            }}
                            className="p-1.5 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-200 dark:hover:bg-emerald-800/40 transition-colors cursor-pointer"
                          >
                            <FiEdit3 className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </div>

                    {hasProfit && !isEditing && (
                      <div className="text-right">
                        <p className="text-[9px] font-bold text-stone-500 dark:text-stone-400">Profit/kg</p>
                        <div className="flex items-center gap-1 justify-end">
                          {p.profitPerKg >= 0 ? (
                            <FiTrendingUp className="w-3 h-3 text-emerald-500" />
                          ) : (
                            <FiTrendingDown className="w-3 h-3 text-red-500" />
                          )}
                          <span className={`text-sm font-black ${p.profitPerKg >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                            {formatCurrency(p.profitPerKg)}
                          </span>
                        </div>
                        <p className={`text-[10px] font-bold ${p.profitMarginPercent >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                          {p.profitMarginPercent.toFixed(1)}% margin
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
