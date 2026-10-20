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
 * Distributes shared daily expenses (Oil & Wages) across products produced that day by production weight.
 * Formula: Product allocation = (Product production kg / Total production kg) * Total daily expense.
 * Exact reconciliation: The final product absorbs any fractional paisa rounding discrepancy
 * so that sum(allocated) strictly equals the original expense amount.
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
  dailyProductionWages: number
): Array<{
  productId: string;
  productName: string;
  totalProductionKg: number;
  batchCount: number;
  ingredientCost: number;
  allocatedOilCost: number;
  allocatedProductionWages: number;
  totalProductionCost: number;
  productionCostPerKg: number;
}> {
  const totalKg = productsSummary.reduce((sum, p) => sum + p.totalProductionKg, 0);
  if (totalKg <= 0 || productsSummary.length === 0) {
    return productsSummary.map((p) => ({
      ...p,
      allocatedOilCost: 0,
      allocatedProductionWages: 0,
      totalProductionCost: p.ingredientCost,
      productionCostPerKg: 0,
    }));
  }

  let runningOil = 0;
  let runningWages = 0;
  const count = productsSummary.length;

  return productsSummary.map((p, idx) => {
    const isLast = idx === count - 1;
    let oilAlloc: number;
    let wagesAlloc: number;

    if (isLast) {
      oilAlloc = roundCurrency(dailyOilExpense - runningOil);
      wagesAlloc = roundCurrency(dailyProductionWages - runningWages);
    } else {
      const ratio = p.totalProductionKg / totalKg;
      oilAlloc = roundCurrency(ratio * dailyOilExpense);
      wagesAlloc = roundCurrency(ratio * dailyProductionWages);
      runningOil += oilAlloc;
      runningWages += wagesAlloc;
    }

    const totalProdCost = roundCurrency(p.ingredientCost + oilAlloc + wagesAlloc);
    const costPerKg = p.totalProductionKg > 0 ? roundCurrency(totalProdCost / p.totalProductionKg) : 0;

    return {
      productId: p.productId,
      productName: p.productName,
      totalProductionKg: p.totalProductionKg,
      batchCount: p.batchCount,
      ingredientCost: p.ingredientCost,
      allocatedOilCost: oilAlloc,
      allocatedProductionWages: wagesAlloc,
      totalProductionCost: totalProdCost,
      productionCostPerKg: costPerKg,
    };
  });
}

/**
 * Calculates Final Product Costing Breakdown.
 * Total product cost = Ingredient cost + Allocated oil cost + Allocated wages + Packaging cover cost + Packing labour.
 * Clearly separates bulk production cost from packing cost and maintains unpacked bulk stock valuation.
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
    totalProductionCost: number;
    productionCostPerKg: number;
  },
  packingRecords: Array<{
    packetSize: string;
    packetsPacked: number;
    coverUnitCost: number;
    packagingCost: number;
    packingLabourRate: number;
    packingLabourCost: number;
    totalPackingCost: number;
    weightPackedKg: number;
  }>
): FinalProductCosting {
  const totalPacketsPacked = packingRecords.reduce((sum, r) => sum + r.packetsPacked, 0);
  const totalWeightPackedKg = roundStock(packingRecords.reduce((sum, r) => sum + r.weightPackedKg, 0));
  const totalPackagingCost = roundCurrency(packingRecords.reduce((sum, r) => sum + r.packagingCost, 0));
  const totalPackingLabourCost = roundCurrency(packingRecords.reduce((sum, r) => sum + r.packingLabourCost, 0));
  const totalPackingCost = roundCurrency(totalPackagingCost + totalPackingLabourCost);

  const totalCost = roundCurrency(productionAllocation.totalProductionCost + totalPackingCost);
  const unpackedKg = Math.max(0, roundStock(productionAllocation.totalProductionKg - totalWeightPackedKg));
  const unpackedValuation = roundCurrency(unpackedKg * productionAllocation.productionCostPerKg);

  // Group packing by size for packet-level costing breakdown
  const sizeMap: Record<string, { packets: number; coverCost: number; labourCost: number; totalCost: number; grams: number }> = {};
  for (const r of packingRecords) {
    if (!sizeMap[r.packetSize]) {
      const gramsMatch = r.packetSize.match(/(\d+)/);
      const grams = gramsMatch ? parseInt(gramsMatch[1], 10) : 100;
      sizeMap[r.packetSize] = { packets: 0, coverCost: 0, labourCost: 0, totalCost: 0, grams };
    }
    sizeMap[r.packetSize].packets += r.packetsPacked;
    sizeMap[r.packetSize].coverCost += r.packagingCost;
    sizeMap[r.packetSize].labourCost += r.packingLabourCost;
    sizeMap[r.packetSize].totalCost += r.totalPackingCost;
  }

  const packetsBySize = Object.entries(sizeMap).map(([size, item]) => {
    // Bulk product share inside this packet: (grams / 1000) * productionCostPerKg
    const bulkInsidePacket = roundCurrency((item.grams / 1000) * productionAllocation.productionCostPerKg);
    const packingInsidePacket = item.packets > 0 ? roundCurrency(item.totalCost / item.packets) : 0;
    const costPerPacket = roundCurrency(bulkInsidePacket + packingInsidePacket);

    return {
      size,
      packets: item.packets,
      coverCost: roundCurrency(item.coverCost),
      labourCost: roundCurrency(item.labourCost),
      totalCost: roundCurrency(item.totalCost),
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
    totalProductionCost: productionAllocation.totalProductionCost,
    productionCostPerKg: productionAllocation.productionCostPerKg,
    totalPacketsPacked,
    totalWeightPackedKg,
    totalPackagingCost,
    totalPackingLabourCost,
    totalPackingCost,
    totalCost,
    packetsBySize,
    unpackedKg,
    unpackedValuation,
  };
}
