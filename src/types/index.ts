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
  }[];
  createdAt?: string;
}

export interface StockMovement {
  id: string;
  itemId: string;
  itemType: 'raw' | 'finished';
  itemName: string;
  movementType: 'in' | 'out' | 'adjust';
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
