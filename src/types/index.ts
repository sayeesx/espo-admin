export type UnitType = 'kg' | 'g' | 'L' | 'ml' | 'pcs' | 'packs' | 'rolls' | string;
export type IngredientCategory = 'basic' | 'other';

export interface Product {
  id: string;
  name: string;
  sku?: string;
  recipeId?: string;
  unit: UnitType;
  currentStock: number;
  wholesalePrice: number;
  isActive: boolean;
  description?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Ingredient {
  id: string;
  name: string;
  category: IngredientCategory;
  unit: UnitType;
  currentStock: number;
  minStock: number;
  avgCostPerUnit: number;
  isActive: boolean;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface RecipeItem {
  id: string;
  recipeId: string;
  ingredientId: string;
  ingredientName?: string;
  quantity: number;
  unit: UnitType;
  cost?: number;
}

export interface Recipe {
  id: string;
  productId: string;
  productName?: string;
  version: number;
  baseOutputQuantity: number;
  baseOutputUnit: UnitType;
  instructions?: string;
  notes?: string;
  isActive: boolean;
  items: RecipeItem[];
  createdAt?: string;
  updatedAt?: string;
}

export interface ProductionRun {
  id: string;
  runNumber: string;
  productId: string;
  productName?: string;
  recipeId?: string;
  recipeVersion?: number;
  productionDate: string;
  plannedQuantity: number;
  actualQuantity: number;
  unit: UnitType;
  status: 'completed' | 'cancelled' | 'in_progress';
  cancellationReason?: string;
  notes?: string;
  operatorName: string;
  ingredientsConsumed?: {
    ingredientId: string;
    ingredientName?: string;
    expectedQuantity?: number;
    actualQuantity: number;
    unit: string;
    unitCost?: number;
    totalCost?: number;
  }[];
  totalIngredientCost?: number;
  createdAt?: string;
}

export interface StockMovement {
  id: string;
  itemId: string;
  itemType: 'raw' | 'finished' | 'ingredient' | 'product';
  itemName: string;
  movementType: 'in' | 'out' | 'adjust' | 'opening' | 'purchase' | 'production_consumption' | 'production_output' | 'cancellation_reversal';
  quantity: number;
  unit: string;
  previousBalance: number;
  newBalance: number;
  costPerUnit?: number;
  reference: string;
  operatorName: string;
  reason?: string;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  actor: string;
  action: string;
  entityType: string;
  entityId?: string;
  details?: any;
  createdAt: string;
}

export interface DailyClosing {
  id: string;
  productionDate: string; // YYYY-MM-DD
  oilOpeningBalance: number; // kg
  oilPurchases: number; // kg
  oilClosingBalance: number; // kg
  oilConsumed: number; // kg
  oilCostPerKg: number; // ₹
  oilTotalExpense: number; // ₹
  productionWages: number; // ₹
  totalSharedExpense: number; // ₹
  totalProductionKg: number; // kg
  status: 'open' | 'closed' | 'adjusted';
  notes?: string;
  closedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface DailyCostAllocation {
  id: string;
  closingId: string;
  productionDate: string;
  productId: string;
  productName: string;
  totalProductionKg: number;
  batchCount: number;
  ingredientCost: number;
  allocatedOilCost: number;
  allocatedProductionWages: number;
  totalProductionCost: number;
  productionCostPerKg: number;
  createdAt?: string;
}

export interface PackagingItem {
  id: string;
  productId: string;
  productName?: string;
  sizeLabel: string; // e.g. '100g', '250g', '500g'
  sizeGrams: number;
  currentStock: number;
  unitCost: number;
  packingLabourRate: number;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface PackingRecord {
  id: string;
  packingDate: string;
  productId: string;
  productName?: string;
  packagingItemId?: string;
  packetSize: string;
  packetsPacked: number;
  coversConsumed: number;
  coverUnitCost: number;
  packagingCost: number;
  packingLabourRate: number;
  packingLabourCost: number;
  totalPackingCost: number;
  weightPackedKg: number;
  operatorName: string;
  notes?: string;
  createdAt?: string;
}

export interface FinalProductCosting {
  productId: string;
  productName: string;
  totalProductionKg: number;
  batchCount: number;
  totalIngredientCost: number;
  allocatedOilCost: number;
  allocatedProductionWages: number;
  totalProductionCost: number;
  productionCostPerKg: number;
  // Packing
  totalPacketsPacked: number;
  totalWeightPackedKg: number;
  totalPackagingCost: number;
  totalPackingLabourCost: number;
  totalPackingCost: number;
  totalCost: number;
  packetsBySize: Array<{
    size: string;
    packets: number;
    coverCost: number;
    labourCost: number;
    totalCost: number;
    costPerPacket: number;
  }>;
  // Unpacked stock
  unpackedKg: number;
  unpackedValuation: number;
}
