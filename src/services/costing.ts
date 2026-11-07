import { DailyCostAllocation, FinalProductCosting, PackagingItem, PackingRecord } from '../types';

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
    n.includes('curry')
  );
}

/**
 * Consistent batch eligibility rule across Epso:
 * Excludes cancelled batches and requires positive produced weight (actualQuantity > 0).
 */
export function isEligibleProductionBatch(
  run: { status?: string; actualQuantity?: number } | null | undefined
): boolean {
  if (!run) return false;
  if (run.status === 'cancelled') return false;
  return (Number(run.actualQuantity) || 0) > 0;
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

export interface BatchWageAllocationItem<T extends { id: string; actualQuantity?: number }> {
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
  T extends { id: string; actualQuantity?: number; status?: string }
>(runsForDate: T[], totalDailyWage: number): BatchWageAllocationItem<T>[] {
  const eligibleRuns = (runsForDate || []).filter((r) => isEligibleProductionBatch(r));
  if (eligibleRuns.length === 0) return [];

  const budget = Math.max(0, roundCurrency(Number(totalDailyWage) || 0));
  const totalEligibleKg = roundStock(
    eligibleRuns.reduce((sum, r) => sum + (Number(r.actualQuantity) || 0), 0)
  );

  if (totalEligibleKg <= 0 || budget <= 0) {
    return eligibleRuns.map((run) => {
      const weight = roundStock(Number(run.actualQuantity) || 0);
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
    const weight = roundStock(Number(run.actualQuantity) || 0);
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
  dailyPackingWages: number = 0
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
  const totalKg = productsSummary.reduce((sum, p) => sum + (Number(p.totalProductionKg) || 0), 0);
  const totalDailyWages = roundCurrency(
    (Number(dailyCookingWages) || 0) + (Number(dailyPackingWages) || 0)
  );

  if (productsSummary.length === 0) {
    return [];
  }

  let runningOil = 0;
  let runningWages = 0;
  let runningBasic = 0;

  let lastPositiveIdx = -1;
  for (let i = productsSummary.length - 1; i >= 0; i--) {
    if ((Number(productsSummary[i].totalProductionKg) || 0) > 0) {
      lastPositiveIdx = i;
      break;
    }
  }
  if (lastPositiveIdx === -1) {
    lastPositiveIdx = productsSummary.length - 1;
  }

  return productsSummary.map((p, idx) => {
    const prodKg = Number(p.totalProductionKg) || 0;
    let oilAlloc = 0;
    let wagesAlloc = 0;
    let basicAlloc = 0;

    if (totalKg > 0 && prodKg > 0) {
      if (idx === lastPositiveIdx) {
        oilAlloc = roundCurrency(dailyOilExpense - runningOil);
        wagesAlloc = roundCurrency(totalDailyWages - runningWages);
        basicAlloc = roundCurrency(dailyBasicIngredientsExpense - runningBasic);
      } else {
        const weightRatio = prodKg / totalKg;
        oilAlloc = roundCurrency(weightRatio * dailyOilExpense);
        wagesAlloc = roundCurrency(weightRatio * totalDailyWages);
        basicAlloc = roundCurrency(weightRatio * dailyBasicIngredientsExpense);

        runningOil = roundCurrency(runningOil + oilAlloc);
        runningWages = roundCurrency(runningWages + wagesAlloc);
        runningBasic = roundCurrency(runningBasic + basicAlloc);
      }
    }

    const totalProdCost = roundCurrency(p.ingredientCost + oilAlloc + wagesAlloc + basicAlloc);
    const costPerKg = prodKg > 0 ? roundCurrency(totalProdCost / prodKg) : 0;

    return {
      productId: p.productId,
      productName: p.productName,
      totalProductionKg: p.totalProductionKg,
      batchCount: p.batchCount,
      ingredientCost: p.ingredientCost,
      allocatedOilCost: oilAlloc,
      allocatedProductionWages: wagesAlloc,
      allocatedCookingWages: wagesAlloc,
      allocatedPackingWages: 0,
      allocatedBasicIngredientsCost: basicAlloc,
      totalProductionCost: totalProdCost,
      productionCostPerKg: costPerKg,
    };
  });
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
  const totalPackagingCost = roundCurrency(packingRecords.reduce((sum, r) => sum + (r.packagingCost || 0), 0));
  // Removed per-packet packing labour calculation; packing labour is allocated as daily wage expense.
  const totalPackingLabourCost = 0;
  const totalPackingCost = totalPackagingCost;

  const totalCost = roundCurrency(productionAllocation.totalProductionCost + totalPackingCost);
  const unpackedKg = Math.max(0, roundStock(productionAllocation.totalProductionKg - totalWeightPackedKg));
  const unpackedValuation = roundCurrency(unpackedKg * productionAllocation.productionCostPerKg);

  // Group packing by size for packet-level costing breakdown
  const sizeMap: Record<string, { packets: number; coverCost: number; totalCost: number; weightKg: number }> = {};
  for (const r of packingRecords) {
    if (!sizeMap[r.packetSize]) {
      sizeMap[r.packetSize] = { packets: 0, coverCost: 0, totalCost: 0, weightKg: 0 };
    }
    sizeMap[r.packetSize].packets += r.packetsPacked;
    sizeMap[r.packetSize].coverCost += (r.packagingCost || 0);
    sizeMap[r.packetSize].totalCost += (r.packagingCost || 0);
    sizeMap[r.packetSize].weightKg += r.weightPackedKg;
  }

  const packetsBySize = Object.entries(sizeMap).map(([size, item]) => {
    // Exact weight per packet: prioritize actual recorded weight / packets, fallback to size label parse (kg vs g)
    let kgPerPacket = 0;
    if (item.packets > 0 && item.weightKg > 0) {
      kgPerPacket = item.weightKg / item.packets;
    } else if (/(\d+(?:\.\d+)?)\s*kg/i.test(size)) {
      const match = size.match(/(\d+(?:\.\d+)?)\s*kg/i);
      kgPerPacket = match ? parseFloat(match[1]) : 1;
    } else if (/(\d+)\s*g/i.test(size)) {
      const match = size.match(/(\d+)\s*g/i);
      kgPerPacket = match ? parseInt(match[1], 10) / 1000 : 0.1;
    } else {
      kgPerPacket = 0.1;
    }

    // Bulk product share inside this packet: kgPerPacket * productionCostPerKg
    // Note: productionCostPerKg ALREADY includes both cooking and packing wages allocated by weight!
    const bulkInsidePacket = roundCurrency(kgPerPacket * productionAllocation.productionCostPerKg);
    const coverInsidePacket = item.packets > 0 ? roundCurrency(item.coverCost / item.packets) : 0;
    const costPerPacket = roundCurrency(bulkInsidePacket + coverInsidePacket);

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
    totalProductionCost: productionAllocation.totalProductionCost,
    productionCostPerKg: productionAllocation.productionCostPerKg,
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
  T extends { id: string; productionDate?: string; actualQuantity?: number; status?: string }
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
} {
  const eligibleRuns = (productionRuns || []).filter((r) => isEligibleProductionBatch(r));
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

  for (const [rDate, dayRuns] of runsByDate.entries()) {
    const wage = wageMap[rDate];
    const closing = closingMap[rDate];

    const dayTotalWage = getEffectiveDailyWage(wage, closing);
    if (dayTotalWage > 0) {
      const wageAllocs = allocateDailyWageToBatches(dayRuns, dayTotalWage);
      for (const item of wageAllocs) {
        batchWageMap.set(item.run.id, item.totalBatchWage);
      }
    }

    const dayOilCost =
      closing && Number(closing.oilConsumed) > 0
        ? roundCurrency(Number(closing.oilConsumed) * (Number(closing.oilCostPerKg) || 150))
        : 0;
    if (dayOilCost > 0) {
      const oilAllocs = allocateDailyWageToBatches(dayRuns, dayOilCost);
      for (const item of oilAllocs) {
        batchOilMap.set(item.run.id, item.totalBatchWage);
      }
    }

    const dayBasicCost = Number(basicCostByDate[rDate]) || 0;
    if (dayBasicCost > 0) {
      const basicAllocs = allocateDailyWageToBatches(dayRuns, dayBasicCost);
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
  };
}

