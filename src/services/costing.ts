import { DailyCostAllocation, FinalProductCosting, PackagingItem, PackingRecord, BatchIngredientUsage, UnitType } from '../types';

/**
 * Computes the ingredient usage line items, including difference and cost breakdowns.
 * Normalizes units when rate is per base unit (e.g. rate per kg or per Liter):
 * - 'g' (grams) -> actual / 1000 kg
 * - 'ml' (milliliters) -> actual / 1000 L
 * - 'kg', 'l', 'pcs', 'packs', 'rolls' -> actual
 */
export function computeBatchUsageSummary(
  scaledItems: Array<{ ingredientId: string; ingredientName: string; unit: UnitType; expectedQuantity: number }>,
  actualQuantities: Record<string, number>,
  ingredientCostMap: Record<string, number>
): BatchIngredientUsage[] {
  return scaledItems.map((item) => {
    const actual = roundStock(actualQuantities[item.ingredientId] ?? item.expectedQuantity);
    const expected = roundStock(item.expectedQuantity);
    const difference = roundStock(actual - expected);
    const unitCost = ingredientCostMap[item.ingredientId] ?? 0;

    const unitLower = (item.unit || '').trim().toLowerCase();
    let qtyInBaseUnit = actual;
    if (unitLower === 'g' || unitLower === 'ml') {
      qtyInBaseUnit = actual / 1000;
    }

    const totalCost = roundCurrency(qtyInBaseUnit * unitCost);

    return {
      ingredientId: item.ingredientId,
      ingredientName: item.ingredientName,
      unit: item.unit,
      expectedQuantity: expected,
      actualQuantity: actual,
      differenceQuantity: difference,
      unitCost: roundCurrency(unitCost),
      totalCost,
    };
  });
}

export function computeBatchMetrics(
  ingredientsUsed: BatchIngredientUsage[],
  actualOutputKg: number,
  plannedOutputKg: number
) {
  const totalIngredientCost = roundCurrency(
    ingredientsUsed.reduce((sum, item) => sum + (item.totalCost || 0), 0)
  );
  const costPerKg = actualOutputKg > 0 ? roundCurrency(totalIngredientCost / actualOutputKg) : 0;
  const outputDifferenceKg = roundStock(actualOutputKg - plannedOutputKg);
  const yieldPercentage = plannedOutputKg > 0 ? roundTo((actualOutputKg / plannedOutputKg) * 100, 1) : 100;
  return {
    totalIngredientCost,
    costPerKg,
    outputDifferenceKg,
    yieldPercentage,
  };
}

/**
 * Rounds a number to a specified number of decimal places without floating-point drift.
 */
export function roundTo(value: number, decimals: number = 2): number {
  if (isNaN(value) || !isFinite(value)) return 0;
  const factor = Math.pow(10, decimals);
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function roundStock(value: number): number {
  return roundTo(value, 3);
}

export function roundCurrency(value: number): number {
  return roundTo(value, 2);
}

/**
 * Normalizes an ingredient quantity into the base pricing unit (kg or L)
 * when measured in grams ('g') or milliliters ('ml').
 */
export function normalizeQuantityForCost(quantity: number, unit?: string): number {
  if (!quantity || !isFinite(quantity)) return 0;
  const u = (unit || '').trim().toLowerCase();
  if (u === 'g' || u === 'ml') {
    return quantity / 1000;
  }
  return quantity;
}

/**
 * Calculates new weighted-average unit cost when new stock is purchased,
 * safely handling negative or zero current stock.
 */
export function calculateWeightedAverageCost(
  currentStock: number,
  currentAvgCost: number,
  purchasedQty: number,
  purchasedUnitCost: number
): number {
  if (purchasedQty <= 0) return currentAvgCost;
  
  // If current stock was zero or negative, previous deficit has no positive inventory valuation.
  // The new inventory takes strictly the new purchase cost.
  if (currentStock <= 0) {
    return roundCurrency(purchasedUnitCost);
  }

  const currentTotalValue = currentStock * currentAvgCost;
  const newPurchaseValue = purchasedQty * purchasedUnitCost;
  const combinedQty = currentStock + purchasedQty;

  if (combinedQty <= 0) return roundCurrency(purchasedUnitCost);

  return roundCurrency((currentTotalValue + newPurchaseValue) / combinedQty);
}

export const calculateMovingWeightedAverage = calculateWeightedAverageCost;

/**
 * Continuous Oil Balance Calculator.
 * Closing oil balance = Opening oil balance + Purchases − Oil consumption/loss.
 * Oil consumed/lost = Opening + Purchases - Closing.
 * Daily oil expense = Oil consumed * Weighted avg cost per kg.
 */
/**
 * Daily Oil Stock & Consumption Calculator according to Cook's Workflow:
 * 1. Automatically uses previous available oil stock from inventory.
 * 2. Subtracts oil used during production.
 * 3. Adds leftover oil entered at the end of the day back to stock.
 *
 * Formula:
 * Final Oil Stock = Previous Available Stock - Oil Used + Leftover Oil
 * Net Oil Consumed = Oil Used - Leftover Oil
 * Daily Oil Expense = Net Oil Consumed * Cost per kg
 *
 * Example:
 * Previous available: 20 kg
 * Oil used: 5 kg
 * Leftover: 2 kg
 * -> Final available: 20 - 5 + 2 = 17 kg
 * -> Net consumed: 3 kg
 */
export function calculateDailyOilUsage(
  previousAvailableStockKg: number,
  oilUsedKg: number,
  leftoverOilKg: number,
  oilCostPerKg: number
): {
  previousAvailableStockKg: number;
  oilUsedKg: number;
  leftoverOilKg: number;
  netOilConsumedKg: number;
  finalOilStockKg: number;
  oilTotalExpense: number;
} {
  const prevStock = Math.max(0, roundStock(previousAvailableStockKg));
  const used = Math.max(0, roundStock(oilUsedKg));
  const leftover = Math.max(0, Math.min(used, roundStock(leftoverOilKg)));
  const netOilConsumedKg = Math.max(0, roundStock(used - leftover));
  const finalOilStockKg = Math.max(0, roundStock(prevStock - netOilConsumedKg));
  const oilTotalExpense = roundCurrency(netOilConsumedKg * Math.max(0, oilCostPerKg));

  return {
    previousAvailableStockKg: prevStock,
    oilUsedKg: used,
    leftoverOilKg: leftover,
    netOilConsumedKg,
    finalOilStockKg,
    oilTotalExpense,
  };
}

export function calculateContinuousOilExpense(
  openingBalanceKg: number,
  purchasesKg: number,
  closingBalanceKg: number,
  avgCostPerKg: number
): { oilConsumedKg: number; oilTotalExpense: number } {
  const available = Math.max(0, roundStock(openingBalanceKg + purchasesKg));
  const closing = Math.max(0, roundStock(closingBalanceKg));
  const consumed = Math.max(0, roundStock(available - closing));
  const expense = roundCurrency(consumed * Math.max(0, avgCostPerKg));

  return {
    oilConsumedKg: consumed,
    oilTotalExpense: expense,
  };
}

/**
 * Checks if an ingredient name matches any of the 4 basic ingredients:
 * - ഉപ്പ് (Salt)
 * - അണ്ടി തോട് (Cashew shell)
 * - ചിപ്പ്ളി പൊടി (Chippli powder)
 * - കറിവേപ്പില (Curry leaves)
 */
export function isBasicIngredientName(name: string): boolean {
  if (!name) return false;
  const n = name.toLowerCase().trim();

  // Black Salt must NEVER be treated as a basic ingredient
  if (
    n.includes('black salt') ||
    n.includes('black') ||
    n.includes('കറുത്ത ഉപ്പ്') ||
    n.includes('കറുത്ത') ||
    n.includes('ബ്ലാക്ക്') ||
    n.includes('കാലാ നമക്') ||
    n.includes('kala namak')
  ) {
    return false;
  }

  const isPowderedSugar =
    n.includes('പൊടി') ||
    n.includes('powder') ||
    n.includes('icing');
  const isBasicSugar =
    !isPowderedSugar && (n.includes('പഞ്ചസാര') || n === 'sugar' || /\bsugar\b/.test(n));

  return (
    n.includes('ഉപ്പ്') ||
    n.includes('salt') ||
    n.includes('അണ്ടി തോട്') ||
    (n.includes('തോട്') && n.includes('അണ്ടി')) ||
    n.includes('cashew') ||
    n.includes('ചിപ്പ്ളി') ||
    n.includes('chippli') ||
    n.includes('കറിവേപ്പില') ||
    n.includes('കറിവേപ്പി') ||
    n.includes('curry') ||
    isBasicSugar
  );
}

/**
 * Returns true if an ingredient record is a daily shared basic ingredient
 * (by category === 'basic' or known basic name, excluding wages, covers, and black salt).
 */
export function isBasicIngredientRecord(ing: { name?: string; category?: string }): boolean {
  const n = (ing.name || '').toLowerCase().trim();
  if (!n) return false;
  if (
    n.includes('black salt') ||
    n.includes('black') ||
    n.includes('കറുത്ത ഉപ്പ്') ||
    n.includes('കറുത്ത') ||
    n.includes('ബ്ലാക്ക്') ||
    n.includes('കാലാ നമക്') ||
    n.includes('kala namak') ||
    n.includes('കൂലി') ||
    n.includes('wage') ||
    n.includes('salary') ||
    n === 'കവർ' ||
    n === 'cover' ||
    n.startsWith('കവർ')
  ) {
    return false;
  }
  return ing.category === 'basic' || isBasicIngredientName(n);
}

/**
 * Consistent batch eligibility rule across Epso:
 * Excludes cancelled batches and requires positive produced weight (actualQuantity > 0),
 * or allows plannedQuantity if pending weighing.
 */
export function isEligibleProductionBatch(
  run: { status?: string; actualQuantity?: number; plannedQuantity?: number } | null | undefined,
  allowPlannedIfPending: boolean = false
): boolean {
  if (!run) return false;
  if (run.status === 'cancelled') return false;
  if ((Number(run.actualQuantity) || 0) > 0) return true;
  if (allowPlannedIfPending && (Number(run.plannedQuantity) || 0) > 0) return true;
  return false;
}

/**
 * Extracts the effective total daily wage from a daily_wages record or daily_closings fallback.
 */
export function getEffectiveDailyWage(
  wage?: {
    totalWageBudget?: number;
    dailyWageBudget?: number;
    productionWageAmount?: number;
    packingWageAmount?: number;
  } | null,
  closing?: { productionWages?: number } | null
): number {
  if (wage) {
    const total = Number(wage.totalWageBudget) || Number(wage.dailyWageBudget) || 0;
    if (total > 0) return roundCurrency(total);
    const splitSum =
      (Number(wage.productionWageAmount) || 0) + (Number(wage.packingWageAmount) || 0);
    if (splitSum > 0) return roundCurrency(splitSum);
  }
  if (closing) {
    const closingWage = Number(closing.productionWages) || 0;
    if (closingWage > 0) return roundCurrency(closingWage);
  }
  return 0;
}

export interface BatchWageAllocationItem<T extends { id: string; actualQuantity?: number; plannedQuantity?: number }> {
  run: T;
  weight: number;
  shareRatio: number;
  sharePercent: number;
  totalBatchWage: number;
  wagePerKg: number;
}

/**
 * Allocates the total daily wage across all eligible batches on a given date
 * based on production weight:
 *   Batch Wage = (Batch Production kg / Total Eligible Daily Production kg) × Total Daily Wage
 *
 * Rounding is reconciled on the final eligible batch so that the sum of all batch
 * allocations strictly equals the entered daily wage.
 */
export function allocateDailyWageToBatches<
  T extends { id: string; actualQuantity?: number; plannedQuantity?: number; status?: string }
>(runsForDate: T[], totalDailyWage: number, allowPlannedIfPending: boolean = true): BatchWageAllocationItem<T>[] {
  const eligibleRuns = (runsForDate || []).filter((r) => isEligibleProductionBatch(r, allowPlannedIfPending));
  if (eligibleRuns.length === 0) return [];

  const getWeight = (r: T) => {
    const act = Number(r.actualQuantity) || 0;
    if (act > 0) return roundStock(act);
    if (allowPlannedIfPending) {
      const plan = Number(r.plannedQuantity) || 0;
      if (plan > 0) return roundStock(plan);
    }
    return 0;
  };

  const budget = Math.max(0, roundCurrency(Number(totalDailyWage) || 0));
  const totalEligibleKg = roundStock(
    eligibleRuns.reduce((sum, r) => sum + getWeight(r), 0)
  );

  if (totalEligibleKg <= 0 || budget <= 0) {
    return eligibleRuns.map((run) => {
      const weight = getWeight(run);
      return {
        run,
        weight,
        shareRatio: 0,
        sharePercent: 0,
        totalBatchWage: 0,
        wagePerKg: 0,
      };
    });
  }

  let runningWage = 0;
  let runningPercent = 0;
  const count = eligibleRuns.length;

  return eligibleRuns.map((run, idx) => {
    const isLast = idx === count - 1;
    const weight = getWeight(run);
    const shareRatio = weight / totalEligibleKg;

    let totalBatchWage: number;
    let sharePercent: number;

    if (isLast) {
      totalBatchWage = roundCurrency(budget - runningWage);
      sharePercent = roundTo(100 - runningPercent, 1);
    } else {
      totalBatchWage = roundCurrency(shareRatio * budget);
      sharePercent = roundTo(shareRatio * 100, 1);
      runningWage = roundCurrency(runningWage + totalBatchWage);
      runningPercent = roundTo(runningPercent + sharePercent, 1);
    }

    const wagePerKg = weight > 0 ? roundCurrency(totalBatchWage / weight) : 0;

    return {
      run,
      weight,
      shareRatio,
      sharePercent,
      totalBatchWage,
      wagePerKg,
    };
  });
}

export interface WastageBatchSummary {
  runId: string;
  runNumber?: string;
  productName: string;
  attemptedKg: number;
  directMaterialLoss: number;
}

export interface WastageAllocationResult {
  runId: string;
  runNumber?: string;
  productName: string;
  attemptedKg: number;
  directMaterialLoss: number;
  allocatedOilLoss: number;
  allocatedLabourLoss: number;
  allocatedBasicLoss: number;
  totalSpoilageLoss: number;
}

/**
 * Distributes shared daily expenses across products produced that day:
 * - Keeps Good Production costs separate from Abnormal Wastage / Spoilage Losses.
 * - Oil, Basic Ingredients & Daily Wages are allocated proportionally by attempted production weight.
 * - Good batches do NOT absorb wastage costs.
 * - Exact reconciliation: The final item absorbs fractional paisa rounding discrepancy.
 */
export function allocateDailySharedExpensesWithWastage(
  productsSummary: Array<{
    productId: string;
    productName: string;
    totalProductionKg: number;
    batchCount: number;
    ingredientCost: number;
  }>,
  wastageSummary: WastageBatchSummary[] = [],
  dailyOilExpense: number,
  dailyCookingWages: number,
  dailyBasicIngredientsExpense: number = 0,
  dailyPackingWages: number = 0
): {
  productAllocations: Array<{
    productId: string;
    productName: string;
    totalProductionKg: number;
    batchCount: number;
    ingredientCost: number;
    allocatedOilCost: number;
    allocatedProductionWages: number;
    allocatedCookingWages: number;
    allocatedPackingWages: number;
    allocatedBasicIngredientsCost: number;
    totalProductionCost: number;
    productionCostPerKg: number;
  }>;
  wastageAllocations: WastageAllocationResult[];
  totalSpoilageLoss: number;
  totalGoodKg: number;
  totalWastageKg: number;
} {
  const goodKg = roundStock(productsSummary.reduce((sum, p) => sum + (Number(p.totalProductionKg) || 0), 0));
  const wasteKg = roundStock(wastageSummary.reduce((sum, w) => sum + (Number(w.attemptedKg) || 0), 0));
  const totalFactoryKg = roundStock(goodKg + wasteKg);

  const oilExpense = Math.max(0, roundCurrency(dailyOilExpense));
  const totalDailyWages = roundCurrency((Number(dailyCookingWages) || 0) + (Number(dailyPackingWages) || 0));
  const basicExpense = Math.max(0, roundCurrency(dailyBasicIngredientsExpense));

  if (totalFactoryKg <= 0) {
    const productAllocations = productsSummary.map((p) => ({
      productId: p.productId,
      productName: p.productName,
      totalProductionKg: p.totalProductionKg,
      batchCount: p.batchCount,
      ingredientCost: p.ingredientCost,
      allocatedOilCost: 0,
      allocatedProductionWages: 0,
      allocatedCookingWages: 0,
      allocatedPackingWages: 0,
      allocatedBasicIngredientsCost: 0,
      totalProductionCost: p.ingredientCost,
      productionCostPerKg: p.totalProductionKg > 0 ? roundCurrency(p.ingredientCost / p.totalProductionKg) : 0,
    }));

    const wastageAllocations: WastageAllocationResult[] = wastageSummary.map((w) => ({
      runId: w.runId,
      runNumber: w.runNumber,
      productName: w.productName,
      attemptedKg: w.attemptedKg,
      directMaterialLoss: w.directMaterialLoss,
      allocatedOilLoss: 0,
      allocatedLabourLoss: 0,
      allocatedBasicLoss: 0,
      totalSpoilageLoss: w.directMaterialLoss,
    }));

    return {
      productAllocations,
      wastageAllocations,
      totalSpoilageLoss: roundCurrency(wastageAllocations.reduce((sum, w) => sum + w.totalSpoilageLoss, 0)),
      totalGoodKg: 0,
      totalWastageKg: wasteKg,
    };
  }

  type AllocRecipient = 
    | { type: 'good'; item: (typeof productsSummary)[0]; weight: number }
    | { type: 'waste'; item: WastageBatchSummary; weight: number };

  const recipients: AllocRecipient[] = [
    ...productsSummary.filter((p) => (Number(p.totalProductionKg) || 0) > 0).map((p) => ({ type: 'good' as const, item: p, weight: Number(p.totalProductionKg) || 0 })),
    ...wastageSummary.filter((w) => (Number(w.attemptedKg) || 0) > 0).map((w) => ({ type: 'waste' as const, item: w, weight: Number(w.attemptedKg) || 0 })),
  ];

  let runningOil = 0;
  let runningWages = 0;
  let runningBasic = 0;
  const count = recipients.length;

  const goodAllocMap = new Map<string, { oil: number; wage: number; basic: number }>();
  const wasteAllocMap = new Map<string, { oil: number; wage: number; basic: number }>();

  recipients.forEach((rec, idx) => {
    const isLast = idx === count - 1;
    let oilAlloc = 0;
    let wageAlloc = 0;
    let basicAlloc = 0;

    if (isLast) {
      oilAlloc = roundCurrency(oilExpense - runningOil);
      wageAlloc = roundCurrency(totalDailyWages - runningWages);
      basicAlloc = roundCurrency(basicExpense - runningBasic);
    } else {
      const ratio = rec.weight / totalFactoryKg;
      oilAlloc = roundCurrency(ratio * oilExpense);
      wageAlloc = roundCurrency(ratio * totalDailyWages);
      basicAlloc = roundCurrency(ratio * basicExpense);

      runningOil = roundCurrency(runningOil + oilAlloc);
      runningWages = roundCurrency(runningWages + wageAlloc);
      runningBasic = roundCurrency(runningBasic + basicAlloc);
    }

    if (rec.type === 'good') {
      goodAllocMap.set(rec.item.productId, { oil: oilAlloc, wage: wageAlloc, basic: basicAlloc });
    } else {
      wasteAllocMap.set(rec.item.runId, { oil: oilAlloc, wage: wageAlloc, basic: basicAlloc });
    }
  });

  const productAllocations = productsSummary.map((p) => {
    const alloc = goodAllocMap.get(p.productId) || { oil: 0, wage: 0, basic: 0 };
    const prodKg = Number(p.totalProductionKg) || 0;
    const totalProdCost = roundCurrency(p.ingredientCost + alloc.oil + alloc.wage + alloc.basic);
    const costPerKg = prodKg > 0 ? roundCurrency(totalProdCost / prodKg) : 0;

    return {
      productId: p.productId,
      productName: p.productName,
      totalProductionKg: p.totalProductionKg,
      batchCount: p.batchCount,
      ingredientCost: p.ingredientCost,
      allocatedOilCost: alloc.oil,
      allocatedProductionWages: alloc.wage,
      allocatedCookingWages: alloc.wage,
      allocatedPackingWages: 0,
      allocatedBasicIngredientsCost: alloc.basic,
      totalProductionCost: totalProdCost,
      productionCostPerKg: costPerKg,
    };
  });

  const wastageAllocations: WastageAllocationResult[] = wastageSummary.map((w) => {
    const alloc = wasteAllocMap.get(w.runId) || { oil: 0, wage: 0, basic: 0 };
    const totalSpoilageLoss = roundCurrency(w.directMaterialLoss + alloc.oil + alloc.wage + alloc.basic);

    return {
      runId: w.runId,
      runNumber: w.runNumber,
      productName: w.productName,
      attemptedKg: w.attemptedKg,
      directMaterialLoss: w.directMaterialLoss,
      allocatedOilLoss: alloc.oil,
      allocatedLabourLoss: alloc.wage,
      allocatedBasicLoss: alloc.basic,
      totalSpoilageLoss,
    };
  });

  const totalSpoilageLoss = roundCurrency(wastageAllocations.reduce((sum, w) => sum + w.totalSpoilageLoss, 0));

  return {
    productAllocations,
    wastageAllocations,
    totalSpoilageLoss,
    totalGoodKg: goodKg,
    totalWastageKg: wasteKg,
  };
}

/**
 * Distributes shared daily expenses across products produced that day:
 * - Oil, Basic Ingredients & Daily Wages: Allocated proportional to production weight:
 *   Product Share = (Product Production kg / Total Eligible Daily Production kg) × Daily Expense
 *
 * Exact reconciliation: The final product absorbs any fractional paisa rounding discrepancy
 * so that sum(allocated) strictly equals the original expense amounts.
 */
export function allocateDailySharedExpenses(
  productsSummary: Array<{
    productId: string;
    productName: string;
    totalProductionKg: number;
    batchCount: number;
    ingredientCost: number;
  }>,
  dailyOilExpense: number,
  dailyCookingWages: number,
  dailyBasicIngredientsExpense: number = 0,
  dailyPackingWages: number = 0,
  wastageSummary: WastageBatchSummary[] = []
): Array<{
  productId: string;
  productName: string;
  totalProductionKg: number;
  batchCount: number;
  ingredientCost: number;
  allocatedOilCost: number;
  allocatedProductionWages: number;
  allocatedCookingWages: number;
  allocatedPackingWages: number;
  allocatedBasicIngredientsCost: number;
  totalProductionCost: number;
  productionCostPerKg: number;
}> {
  const result = allocateDailySharedExpensesWithWastage(
    productsSummary,
    wastageSummary,
    dailyOilExpense,
    dailyCookingWages,
    dailyBasicIngredientsExpense,
    dailyPackingWages
  );
  return result.productAllocations;
}

/**
 * Calculates Final Product Costing Breakdown.
 *
 * Packing labour is treated as a wage expense allocated across production batches
 * by weight (included in productionAllocation). Per-packet packing labour calculation
 * is removed, ensuring labour is NOT calculated based on the number of packets.
 *
 * Total product cost = Bulk production cost + Packaging material (cover) cost.
 */
export function parsePacketWeightKg(size: string): number {
  if (!size) return 0.1;
  const s = size.toLowerCase().trim();
  const kgMatch = s.match(/(\d+(?:\.\d+)?)\s*kg/i);
  if (kgMatch) return parseFloat(kgMatch[1]);
  const gMatch = s.match(/(\d+(?:\.\d+)?)\s*(?:g|gm|grams)/i);
  if (gMatch) return parseFloat(gMatch[1]) / 1000;
  if (s.includes('8 x 10') || s.includes('8x10')) return 0.100;
  if (s.includes('8 x 12') || s.includes('8x12')) return 0.250;
  if (s.includes('10 x 12') || s.includes('10x12')) return 0.250;
  if (s.includes('10 x 14') || s.includes('10x14')) return 0.500;
  if (s.includes('10 x 16') || s.includes('10x16')) return 1.000;
  return 0.100;
}

export function calculateFinalProductCosting(
  productionAllocation: {
    productId: string;
    productName: string;
    totalProductionKg: number;
    batchCount: number;
    ingredientCost: number;
    allocatedOilCost: number;
    allocatedProductionWages: number;
    allocatedCookingWages?: number;
    allocatedPackingWages?: number;
    allocatedBasicIngredientsCost?: number;
    totalProductionCost: number;
    productionCostPerKg: number;
  },
  packingRecords: Array<{
    packetSize: string;
    packetsPacked: number;
    coverUnitCost?: number;
    packagingCost: number;
    packingLabourRate?: number;
    packingLabourCost?: number;
    totalPackingCost?: number;
    weightPackedKg: number;
  }>
): FinalProductCosting {
  const totalPacketsPacked = packingRecords.reduce((sum, r) => sum + r.packetsPacked, 0);
  const totalWeightPackedKg = roundStock(packingRecords.reduce((sum, r) => sum + r.weightPackedKg, 0));
  const totalPackagingCost = roundCurrency(
    packingRecords.reduce((sum, r) => sum + (r.packagingCost || (r.packetsPacked * (r.coverUnitCost || 0))), 0)
  );
  // Removed per-packet packing labour calculation; packing labour is allocated as daily wage expense.
  const totalPackingLabourCost = 0;
  const totalPackingCost = totalPackagingCost;

  // Regular Ingredient Costing:
  // Total Production Cost = Ingredients + Oil + Basic Ingredients + Labour + Packet Cost
  const baseManufacturing = roundCurrency(
    (productionAllocation.ingredientCost || 0) +
    (productionAllocation.allocatedOilCost || 0) +
    (productionAllocation.allocatedBasicIngredientsCost || 0) +
    (productionAllocation.allocatedProductionWages || 0)
  );
  const totalProductionCost = roundCurrency(baseManufacturing + totalPackagingCost);
  const productionCostPerKg = productionAllocation.totalProductionKg > 0
    ? roundCurrency(totalProductionCost / productionAllocation.totalProductionKg)
    : 0;

  const totalCost = totalProductionCost;
  const unpackedKg = Math.max(0, roundStock(productionAllocation.totalProductionKg - totalWeightPackedKg));
  const unpackedValuation = roundCurrency(unpackedKg * productionCostPerKg);

  // Group packing by size for packet-level costing breakdown
  const sizeMap: Record<string, { packets: number; coverCost: number; totalCost: number; weightKg: number }> = {};
  for (const r of packingRecords) {
    if (!sizeMap[r.packetSize]) {
      sizeMap[r.packetSize] = { packets: 0, coverCost: 0, totalCost: 0, weightKg: 0 };
    }
    const cost = (r.packagingCost && r.packagingCost > 0)
      ? r.packagingCost
      : ((r.packetsPacked || 0) * (r.coverUnitCost || 0));
    sizeMap[r.packetSize].packets += r.packetsPacked;
    sizeMap[r.packetSize].coverCost += cost;
    sizeMap[r.packetSize].totalCost += cost;
    sizeMap[r.packetSize].weightKg += r.weightPackedKg;
  }

  const packetsBySize = Object.entries(sizeMap).map(([size, item]) => {
    // Actual packet unit cost as regular ingredient: item.coverCost / item.packets
    const costPerPacket = item.packets > 0 ? roundCurrency(item.coverCost / item.packets) : 0;

    return {
      size,
      packets: item.packets,
      coverCost: roundCurrency(item.coverCost),
      labourCost: 0,
      totalCost: roundCurrency(item.coverCost),
      costPerPacket,
    };
  });

  return {
    productId: productionAllocation.productId,
    productName: productionAllocation.productName,
    totalProductionKg: productionAllocation.totalProductionKg,
    batchCount: productionAllocation.batchCount,
    totalIngredientCost: productionAllocation.ingredientCost,
    allocatedOilCost: productionAllocation.allocatedOilCost,
    allocatedProductionWages: productionAllocation.allocatedProductionWages,
    allocatedCookingWages: productionAllocation.allocatedCookingWages ?? productionAllocation.allocatedProductionWages,
    allocatedPackingWages: productionAllocation.allocatedPackingWages ?? 0,
    allocatedBasicIngredientsCost: productionAllocation.allocatedBasicIngredientsCost ?? 0,
    totalProductionCost,
    productionCostPerKg,
    totalPacketsPacked,
    totalWeightPackedKg,
    totalPackagingCost,
    totalPackingLabourCost: 0,
    totalPackingCost,
    totalCost,
    packetsBySize,
    unpackedKg,
    unpackedValuation,
  };
}

/**
 * Precomputes weight-based daily batch allocations for Wages, Oil, and Basic Ingredients
 * across all eligible production runs, ensuring exact paisa reconciliation per day.
 */
export function computeDailyBatchCostMaps<
  T extends { id: string; productionDate?: string; actualQuantity?: number; plannedQuantity?: number; status?: string }
>(
  productionRuns: T[],
  wageMap: Record<string, any>,
  closingMap: Record<string, any>,
  basicCostByDate: Record<string, number>
): {
  eligibleRuns: T[];
  batchWageMap: Map<string, number>;
  batchOilMap: Map<string, number>;
  batchBasicMap: Map<string, number>;
  /** Dates that have weighed batches but no admin-entered daily wage (total_wage_budget = 0 / missing) */
  datesWithoutWage: Set<string>;
} {
  const eligibleRuns = (productionRuns || []).filter((r) => isEligibleProductionBatch(r, true));
  const runsByDate = new Map<string, T[]>();

  for (const run of eligibleRuns) {
    const rDate = run.productionDate;
    if (!rDate) continue;
    if (!runsByDate.has(rDate)) {
      runsByDate.set(rDate, []);
    }
    runsByDate.get(rDate)!.push(run);
  }

  const batchWageMap = new Map<string, number>();
  const batchOilMap = new Map<string, number>();
  const batchBasicMap = new Map<string, number>();
  const datesWithoutWage = new Set<string>();

  for (const [rDate, dayRuns] of runsByDate.entries()) {
    const wage = wageMap[rDate];
    const closing = closingMap[rDate];

    // Single source of truth for wages: the admin-entered daily_wages.total_wage_budget for this date.
    // Derived on the fly from current batch weights (never cached): (batch kg / day kg) × day wage.
    const dayTotalWage = getEffectiveDailyWage(wage);
    if (dayTotalWage > 0) {
      const wageAllocs = allocateDailyWageToBatches(dayRuns, dayTotalWage, true);
      for (const item of wageAllocs) {
        batchWageMap.set(item.run.id, item.totalBatchWage);
      }
    } else {
      datesWithoutWage.add(rDate);
    }

    const dayOilCost =
      closing && Number(closing.oilConsumed) > 0
        ? roundCurrency(Number(closing.oilConsumed) * (Number(closing.oilCostPerKg) || 150))
        : 0;
    if (dayOilCost > 0) {
      const oilAllocs = allocateDailyWageToBatches(dayRuns, dayOilCost, true);
      for (const item of oilAllocs) {
        batchOilMap.set(item.run.id, item.totalBatchWage);
      }
    }

    const dayBasicCost = Number(basicCostByDate[rDate]) || 0;
    if (dayBasicCost > 0) {
      const basicAllocs = allocateDailyWageToBatches(dayRuns, dayBasicCost, true);
      for (const item of basicAllocs) {

        batchBasicMap.set(item.run.id, item.totalBatchWage);
      }
    }
  }

  return {
    eligibleRuns,
    batchWageMap,
    batchOilMap,
    batchBasicMap,
    datesWithoutWage,
  };
}
