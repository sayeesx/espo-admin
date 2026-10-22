import { createClient } from '@supabase/supabase-js';
import {
  Product,
  Ingredient,
  Recipe,
  RecipeItem,
  ProductionRun,
  StockMovement,
  AuditLog,
  DailyClosing,
  DailyCostAllocation,
  PackagingItem,
  PackingRecord,
} from '../types';
import {
  allocateDailySharedExpenses,
  calculateContinuousOilExpense,
  roundCurrency,
  roundStock,
} from './costing';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://brskubbgvxtzvhncjnle.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJyc2t1YmJndnh0enZobmNqbmxlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE3MDI4NDIsImV4cCI6MjEwNzI3ODg0Mn0.6ewzygZiH-rBS6RPu5QegjAUVz9LvkW9ZaHtBpJGjZM';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export async function verifyAdminPin(pin: string): Promise<{ success: boolean; session_token?: string; error?: string }> {
  try {
    const { data, error } = await supabase.rpc('verify_admin_pin', { p_pin: pin });
    if (error) {
      return { success: false, error: error.message };
    }
    if (data?.success) {
      return { success: true, session_token: data.session_token };
    }
    return { success: false, error: data?.message || 'Invalid PIN' };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Connection error while contacting server' };
  }
}

export async function changeAdminPin(oldPin: string, newPin: string): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const { data, error } = await supabase.rpc('change_admin_pin', {
      p_old_pin: oldPin,
      p_new_pin: newPin,
    });
    if (error) {
      return { success: false, error: error.message };
    }
    if (data?.success) {
      return { success: true, message: data.message };
    }
    return { success: false, error: data?.message || 'Failed to update PIN' };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Network error updating PIN' };
  }
}

export async function fetchProducts(): Promise<Product[]> {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .order('name', { ascending: true });

  if (error) throw error;
  return (data || []).map((row) => ({
    id: row.id,
    name: row.name,
    sku: row.sku || '',
    recipeId: row.recipe_id || '',
    unit: row.unit || 'kg',
    currentStock: Number(row.current_stock) || 0,
    wholesalePrice: Number(row.wholesale_price) || 0,
    isActive: row.is_active ?? true,
    description: row.description || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export async function saveProduct(product: Partial<Product> & { name: string }): Promise<Product> {
  const payload = {
    name: product.name,
    sku: product.sku || null,
    unit: product.unit || 'kg',
    current_stock: product.currentStock ?? 0,
    wholesale_price: product.wholesalePrice ?? 0,
    is_active: product.isActive ?? true,
    recipe_id: product.recipeId || null,
    updated_at: new Date().toISOString(),
  };

  if (product.id) {
    const { data, error } = await supabase
      .from('products')
      .update(payload)
      .eq('id', product.id)
      .select()
      .single();

    if (error) throw error;
    return {
      id: data.id,
      name: data.name,
      sku: data.sku || '',
      unit: data.unit,
      currentStock: Number(data.current_stock) || 0,
      wholesalePrice: Number(data.wholesale_price) || 0,
      isActive: data.is_active,
      createdAt: data.created_at,
    };
  } else {
    const { data, error } = await supabase
      .from('products')
      .insert({
        ...payload,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;
    return {
      id: data.id,
      name: data.name,
      sku: data.sku || '',
      unit: data.unit,
      currentStock: Number(data.current_stock) || 0,
      wholesalePrice: Number(data.wholesale_price) || 0,
      isActive: data.is_active,
      createdAt: data.created_at,
    };
  }
}

export async function deleteProduct(id: string): Promise<void> {
  const { error } = await supabase
    .from('products')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

export async function fetchIngredients(): Promise<Ingredient[]> {
  const { data, error } = await supabase
    .from('ingredients')
    .select('*')
    .order('name', { ascending: true });

  if (error) throw error;
  return (data || []).map((row) => ({
    id: row.id,
    name: row.name,
    category: row.category || 'other',
    unit: row.unit || 'kg',
    currentStock: Number(row.current_stock) || 0,
    minStock: Number(row.min_stock) || 0,
    avgCostPerUnit: Number(row.avg_cost_per_unit) || 0,
    isActive: row.is_active ?? true,
    notes: row.notes || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export async function saveIngredient(ingredient: Partial<Ingredient> & { name: string }): Promise<Ingredient> {
  const payload = {
    name: ingredient.name,
    category: ingredient.category || 'other',
    unit: ingredient.unit || 'kg',
    min_stock: ingredient.minStock ?? 0,
    avg_cost_per_unit: ingredient.avgCostPerUnit ?? 0,
    is_active: ingredient.isActive ?? true,
    notes: ingredient.notes || null,
    updated_at: new Date().toISOString(),
  };

  if (ingredient.id) {
    const { data, error } = await supabase
      .from('ingredients')
      .update(payload)
      .eq('id', ingredient.id)
      .select()
      .single();

    if (error) throw error;
    return {
      id: data.id,
      name: data.name,
      category: data.category,
      unit: data.unit,
      currentStock: Number(data.current_stock) || 0,
      minStock: Number(data.min_stock) || 0,
      avgCostPerUnit: Number(data.avg_cost_per_unit) || 0,
      isActive: data.is_active,
      notes: data.notes,
    };
  } else {
    const { data, error } = await supabase
      .from('ingredients')
      .insert({
        ...payload,
        current_stock: ingredient.currentStock ?? 0,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;
    return {
      id: data.id,
      name: data.name,
      category: data.category,
      unit: data.unit,
      currentStock: Number(data.current_stock) || 0,
      minStock: Number(data.min_stock) || 0,
      avgCostPerUnit: Number(data.avg_cost_per_unit) || 0,
      isActive: data.is_active,
      notes: data.notes,
    };
  }
}

export async function adjustIngredientStock(
  ingredientId: string,
  delta: number,
  reason: string,
  operatorName = 'Admin'
): Promise<void> {
  // Fetch current ingredient balance
  const { data: ing, error: fetchErr } = await supabase
    .from('ingredients')
    .select('id, name, unit, current_stock, avg_cost_per_unit')
    .eq('id', ingredientId)
    .single();

  if (fetchErr) throw fetchErr;

  const prevStock = Number(ing.current_stock) || 0;
  if (delta < 0 && prevStock <= 0) {
    throw new Error('സ്റ്റോക്ക് 0 ആണ്, നെഗറ്റീവ് ആക്കാൻ കഴിയില്ല (Stock is 0, cannot deduct)');
  }
  if (delta < 0 && Math.abs(delta) > prevStock) {
    throw new Error('ലഭ്യമായ സ്റ്റോക്കിനേക്കാൾ കൂടുതൽ കുറയ്ക്കാൻ കഴിയില്ല (Cannot deduct more than available stock)');
  }
  const newStock = Math.max(0, prevStock + delta);

  // Update ingredient balance
  const { error: updateErr } = await supabase
    .from('ingredients')
    .update({ current_stock: newStock, updated_at: new Date().toISOString() })
    .eq('id', ingredientId);

  if (updateErr) throw updateErr;

  // Insert stock movement record
  await supabase.from('stock_movements').insert({
    item_id: ingredientId,
    item_type: 'raw',
    item_name: ing.name,
    movement_type: delta >= 0 ? 'in' : 'out',
    quantity: Math.abs(delta),
    unit: ing.unit,
    previous_balance: prevStock,
    new_balance: newStock,
    cost_per_unit: ing.avg_cost_per_unit,
    reference: `ADMIN-ADJ-${Date.now().toString().slice(-6)}`,
    operator_name: operatorName,
    reason,
    created_at: new Date().toISOString(),
  });
}

export async function deleteIngredient(id: string): Promise<void> {
  const { error } = await supabase
    .from('ingredients')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

export async function fetchRecipes(): Promise<Recipe[]> {
  const { data: recipesData, error: recipesErr } = await supabase
    .from('recipes')
    .select(`
      *,
      products (name)
    `)
    .order('created_at', { ascending: false });

  if (recipesErr) throw recipesErr;

  const { data: itemsData, error: itemsErr } = await supabase
    .from('recipe_items')
    .select(`
      *,
      ingredients (name, avg_cost_per_unit)
    `);

  if (itemsErr) throw itemsErr;

  return (recipesData || []).map((r) => {
    const items = (itemsData || [])
      .filter((it) => it.recipe_id === r.id)
      .map((it) => ({
        id: it.id,
        recipeId: it.recipe_id,
        ingredientId: it.ingredient_id,
        ingredientName: it.ingredients?.name || 'Unknown',
        quantity: Number(it.quantity) || 0,
        unit: it.unit || 'kg',
        cost: (Number(it.quantity) || 0) * (Number(it.ingredients?.avg_cost_per_unit) || 0),
      }));

    return {
      id: r.id,
      productId: r.product_id,
      productName: r.products?.name || 'Unknown Snack',
      version: r.version || 1,
      baseOutputQuantity: Number(r.base_output_quantity) || 1,
      baseOutputUnit: r.base_output_unit || 'kg',
      instructions: r.instructions || '',
      notes: r.notes || '',
      isActive: r.is_active ?? true,
      items,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  });
}

export async function saveRecipe(
  recipe: Partial<Recipe> & { productId: string; baseOutputQuantity: number; baseOutputUnit: string },
  items: Array<{ ingredientId: string; quantity: number; unit: string }>
): Promise<void> {
  let recipeId = recipe.id;

  if (!recipeId) {
    const { data: newRec, error: recErr } = await supabase
      .from('recipes')
      .insert({
        product_id: recipe.productId,
        version: recipe.version || 1,
        base_output_quantity: recipe.baseOutputQuantity,
        base_output_unit: recipe.baseOutputUnit,
        instructions: recipe.instructions || null,
        notes: recipe.notes || null,
        is_active: recipe.isActive ?? true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (recErr) throw recErr;
    recipeId = newRec.id;

    // Link recipe to product
    await supabase.from('products').update({ recipe_id: recipeId }).eq('id', recipe.productId);
  } else {
    const { error: recErr } = await supabase
      .from('recipes')
      .update({
        base_output_quantity: recipe.baseOutputQuantity,
        base_output_unit: recipe.baseOutputUnit,
        instructions: recipe.instructions || null,
        notes: recipe.notes || null,
        is_active: recipe.isActive ?? true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', recipeId);

    if (recErr) throw recErr;

    // Ensure product is linked
    if (recipe.productId) {
      await supabase.from('products').update({ recipe_id: recipeId }).eq('id', recipe.productId);
    }

    // Remove old recipe items
    await supabase.from('recipe_items').delete().eq('recipe_id', recipeId);
  }

  // Insert items
  if (items.length > 0) {
    const itemsPayload = items.map((it) => ({
      recipe_id: recipeId,
      ingredient_id: it.ingredientId,
      quantity: it.quantity,
      unit: it.unit,
      created_at: new Date().toISOString(),
    }));

    const { error: itemsErr } = await supabase.from('recipe_items').insert(itemsPayload);
    if (itemsErr) throw itemsErr;
  }
}

export async function deleteRecipe(id: string): Promise<void> {
  await supabase.from('products').update({ recipe_id: null }).eq('recipe_id', id);
  await supabase.from('recipe_items').delete().eq('recipe_id', id);
  const { error } = await supabase.from('recipes').delete().eq('id', id);
  if (error) throw error;
}

export async function deleteProductionRun(id: string): Promise<void> {
  const { data: run } = await supabase
    .from('production_runs')
    .select('run_number')
    .eq('id', id)
    .maybeSingle();

  if (run?.run_number) {
    await supabase.from('stock_movements').delete().ilike('reference', `%${run.run_number}%`);
  }

  await supabase.from('production_consumption').delete().eq('run_id', id);
  const { error } = await supabase.from('production_runs').delete().eq('id', id).select('id');
  if (error) throw error;
}

export async function fetchProductionRuns(): Promise<ProductionRun[]> {
  const { data, error } = await supabase
    .from('production_runs')
    .select(`
      *,
      products (name),
      production_consumption (
        *,
        ingredients (name)
      )
    `)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) throw error;
  return (data || []).map((row: any) => ({
    id: row.id,
    runNumber: row.run_number,
    productId: row.product_id,
    productName: row.products?.name || 'Snack',
    recipeId: row.recipe_id,
    recipeVersion: row.recipe_version,
    productionDate: row.production_date,
    plannedQuantity: Number(row.planned_quantity) || 0,
    actualQuantity: Number(row.actual_quantity) || 0,
    unit: row.unit,
    status: row.status as any,
    notes: row.notes,
    operatorName: row.operator_name || 'Staff',
    totalIngredientCost: Number(row.total_ingredient_cost) || 0,
    ingredientsConsumed: (row.production_consumption || []).map((c: any) => ({
      ingredientId: c.ingredient_id,
      ingredientName: c.ingredients?.name || 'Ingredient',
      expectedQuantity: Number(c.expected_quantity) || 0,
      actualQuantity: Number(c.actual_quantity) || 0,
      unit: c.unit,
      unitCost: Number(c.unit_cost) || 0,
      totalCost: Number(c.total_cost) || 0,
    })),
    createdAt: row.created_at,
  }));
}

export async function fetchStockMovements(): Promise<StockMovement[]> {
  const { data, error } = await supabase
    .from('stock_movements')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) throw error;
  return (data || []).map((row) => ({
    id: row.id,
    itemId: row.item_id,
    itemType: row.item_type as any,
    itemName: row.item_name,
    movementType: row.movement_type as any,
    quantity: Number(row.quantity) || 0,
    unit: row.unit,
    previousBalance: Number(row.previous_balance) || 0,
    newBalance: Number(row.new_balance) || 0,
    costPerUnit: row.cost_per_unit ? Number(row.cost_per_unit) : undefined,
    reference: row.reference,
    operatorName: row.operator_name,
    reason: row.reason,
    createdAt: row.created_at,
  }));
}

export async function fetchAuditLogs(): Promise<AuditLog[]> {
  const { data, error } = await supabase
    .from('audit_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) throw error;
  return (data || []).map((row) => ({
    id: row.id,
    actor: row.actor,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    details: row.details,
    createdAt: row.created_at,
  }));
}

// ============================================================================
// DAILY PRODUCTION CLOSING, OIL INVENTORY & SHARED EXPENSE ALLOCATIONS
// ============================================================================

export async function fetchDailyClosing(date: string): Promise<DailyClosing | null> {
  const { data, error } = await supabase
    .from('daily_closings')
    .select('*')
    .eq('production_date', date)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    id: data.id,
    productionDate: data.production_date,
    oilOpeningBalance: Number(data.oil_opening_balance) || 0,
    oilPurchases: Number(data.oil_purchases) || 0,
    oilClosingBalance: Number(data.oil_closing_balance) || 0,
    oilConsumed: Number(data.oil_consumed) || 0,
    oilCostPerKg: Number(data.oil_cost_per_kg) || 0,
    oilTotalExpense: Number(data.oil_total_expense) || 0,
    productionWages: Number(data.production_wages) || 0,
    totalSharedExpense: Number(data.total_shared_expense) || 0,
    totalProductionKg: Number(data.total_production_kg) || 0,
    status: data.status,
    notes: data.notes || '',
    closedBy: data.closed_by || 'Admin',
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

export async function fetchDailyClosings(limit = 60): Promise<DailyClosing[]> {
  const { data, error } = await supabase
    .from('daily_closings')
    .select('*')
    .order('production_date', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data || []).map((data) => ({
    id: data.id,
    productionDate: data.production_date,
    oilOpeningBalance: Number(data.oil_opening_balance) || 0,
    oilPurchases: Number(data.oil_purchases) || 0,
    oilClosingBalance: Number(data.oil_closing_balance) || 0,
    oilConsumed: Number(data.oil_consumed) || 0,
    oilCostPerKg: Number(data.oil_cost_per_kg) || 0,
    oilTotalExpense: Number(data.oil_total_expense) || 0,
    productionWages: Number(data.production_wages) || 0,
    totalSharedExpense: Number(data.total_shared_expense) || 0,
    totalProductionKg: Number(data.total_production_kg) || 0,
    status: data.status,
    notes: data.notes || '',
    closedBy: data.closed_by || 'Admin',
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  }));
}

export async function fetchLatestOilBalance(): Promise<{ currentStock: number; avgCost: number; lastClosingDate?: string }> {
  // 1. Check most recent closing
  const { data: lastClosing } = await supabase
    .from('daily_closings')
    .select('production_date, oil_closing_balance, oil_cost_per_kg')
    .order('production_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  // 2. Also check common oil ingredient
  const { data: oilIng } = await supabase
    .from('ingredients')
    .select('current_stock, avg_cost_per_unit')
    .or("name.eq.ഓയിൽ,name.ilike.%oil%")
    .order('current_stock', { ascending: false })
    .limit(1)
    .maybeSingle();

  const currentStock = lastClosing ? Number(lastClosing.oil_closing_balance) : (oilIng ? Number(oilIng.current_stock) : 0);
  const avgCost = lastClosing && Number(lastClosing.oil_cost_per_kg) > 0 ? Number(lastClosing.oil_cost_per_kg) : (oilIng ? Number(oilIng.avg_cost_per_unit) : 0);

  return {
    currentStock,
    avgCost,
    lastClosingDate: lastClosing?.production_date,
  };
}

export async function fetchOilPurchasesForDate(date: string): Promise<number> {
  // Sum inward stock movements for oil on that date
  const { data: movements } = await supabase
    .from('stock_movements')
    .select('quantity, item_name')
    .or("item_name.eq.ഓയിൽ,item_name.ilike.%oil%")
    .in('movement_type', ['in', 'purchase'])
    .gte('created_at', `${date}T00:00:00.000Z`)
    .lte('created_at', `${date}T23:59:59.999Z`);

  if (!movements || movements.length === 0) return 0;
  return movements.reduce((sum, m) => sum + Math.max(0, Number(m.quantity) || 0), 0);
}

// -------------------------------------------------------------
// Sales Management
// -------------------------------------------------------------

export async function fetchSales(): Promise<any[]> {
  const { data, error } = await supabase
    .from('sales')
    .select('*')
    .order('sale_date', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching sales:', error);
    return [];
  }
  return data || [];
}

export async function recordSale(sale: {
  sale_date: string;
  product_id?: string;
  product_name: string;
  quantity: number;
  unit: string;
  unit_price: number;
  total_amount: number;
  customer_name?: string;
  payment_method?: string;
  payment_status?: string;
  notes?: string;
}): Promise<any> {
  const { data, error } = await supabase
    .from('sales')
    .insert([sale])
    .select()
    .single();

  if (error) {
    console.error('Error recording sale:', error);
    throw error;
  }
  return data;
}

export async function deleteSale(id: string): Promise<void> {
  const { error } = await supabase.from('sales').delete().eq('id', id);
  if (error) {
    console.error('Error deleting sale:', error);
    throw error;
  }
}


export async function saveDailyClosing(params: {
  productionDate: string;
  oilOpeningBalance: number;
  oilPurchases: number;
  oilClosingBalance: number;
  oilCostPerKg: number;
  productionWages: number;
  notes?: string;
  closedBy?: string;
}): Promise<DailyClosing> {
  const {
    productionDate,
    oilOpeningBalance,
    oilPurchases,
    oilClosingBalance,
    oilCostPerKg,
    productionWages,
    notes = '',
    closedBy = 'Admin',
  } = params;

  // 1. Calculate Oil Consumed & Expenses
  const { oilConsumedKg, oilTotalExpense } = calculateContinuousOilExpense(
    oilOpeningBalance,
    oilPurchases,
    oilClosingBalance,
    oilCostPerKg
  );
  const totalSharedExpense = roundCurrency(oilTotalExpense + productionWages);

  // 2. Fetch completed production runs on that date
  const { data: runs, error: runsErr } = await supabase
    .from('production_runs')
    .select(`
      id,
      product_id,
      actual_quantity,
      total_ingredient_cost,
      products (name)
    `)
    .eq('production_date', productionDate)
    .eq('status', 'completed');

  if (runsErr) throw runsErr;

  const totalProductionKg = (runs || []).reduce((sum, r) => sum + (Number(r.actual_quantity) || 0), 0);

  // 3. Upsert daily closing
  const closingPayload = {
    production_date: productionDate,
    oil_opening_balance: oilOpeningBalance,
    oil_purchases: oilPurchases,
    oil_closing_balance: oilClosingBalance,
    oil_consumed: oilConsumedKg,
    oil_cost_per_kg: oilCostPerKg,
    oil_total_expense: oilTotalExpense,
    production_wages: productionWages,
    total_shared_expense: totalSharedExpense,
    total_production_kg: totalProductionKg,
    status: 'closed',
    notes: notes || null,
    closed_by: closedBy,
    updated_at: new Date().toISOString(),
  };

  const { data: upsertedClosing, error: closingErr } = await supabase
    .from('daily_closings')
    .upsert(closingPayload, { onConflict: 'production_date' })
    .select()
    .single();

  if (closingErr) throw closingErr;
  const closingId = upsertedClosing.id;

  // 4. Group production runs by product
  const productMap: Record<string, { productId: string; productName: string; totalProductionKg: number; batchCount: number; ingredientCost: number }> = {};
  for (const r of runs || []) {
    const pId = r.product_id;
    const pName = (r.products as any)?.name || 'Product';
    const qty = Number(r.actual_quantity) || 0;
    const ingCost = Number(r.total_ingredient_cost) || 0;

    if (!productMap[pId]) {
      productMap[pId] = {
        productId: pId,
        productName: pName,
        totalProductionKg: 0,
        batchCount: 0,
        ingredientCost: 0,
      };
    }
    productMap[pId].totalProductionKg += qty;
    productMap[pId].batchCount += 1;
    productMap[pId].ingredientCost += ingCost;
  }

  const productsSummary = Object.values(productMap);

  // 5. Calculate weight-based allocations with exact penny reconciliation
  const allocations = allocateDailySharedExpenses(productsSummary, oilTotalExpense, productionWages);

  // 6. Delete old allocations and save new
  await supabase.from('daily_cost_allocations').delete().eq('closing_id', closingId);

  if (allocations.length > 0) {
    const allocationsPayload = allocations.map((a) => ({
      closing_id: closingId,
      production_date: productionDate,
      product_id: a.productId,
      product_name: a.productName,
      total_production_kg: a.totalProductionKg,
      batch_count: a.batchCount,
      ingredient_cost: a.ingredientCost,
      allocated_oil_cost: a.allocatedOilCost,
      allocated_production_wages: a.allocatedProductionWages,
      total_production_cost: a.totalProductionCost,
      production_cost_per_kg: a.productionCostPerKg,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));

    const { error: allocErr } = await supabase.from('daily_cost_allocations').insert(allocationsPayload);
    if (allocErr) console.error('Failed to insert allocations', allocErr);
  }

  // 7. Update common oil inventory in ingredients
  const { data: oilIng } = await supabase
    .from('ingredients')
    .select('id, current_stock')
    .or("name.eq.ഓയിൽ,name.ilike.%oil%")
    .limit(1)
    .maybeSingle();

  if (oilIng) {
    await supabase
      .from('ingredients')
      .update({
        current_stock: oilClosingBalance,
        avg_cost_per_unit: oilCostPerKg,
        updated_at: new Date().toISOString(),
      })
      .eq('id', oilIng.id);

    if (oilConsumedKg > 0) {
      await supabase.from('stock_movements').insert({
        item_id: oilIng.id,
        item_type: 'ingredient',
        item_name: 'ഓയിൽ',
        movement_type: 'production_consumption',
        quantity: -oilConsumedKg,
        unit: 'kg',
        previous_balance: oilOpeningBalance + oilPurchases,
        new_balance: oilClosingBalance,
        cost_per_unit: oilCostPerKg,
        reference: `Daily Closing ${productionDate}`,
        operator_name: closedBy,
        reason: 'Daily shared factory oil consumption & loss',
        created_at: new Date().toISOString(),
      });
    }
  }

  // 8. Audit log
  await supabase.from('audit_logs').insert({
    actor: closedBy,
    action: 'DAILY_CLOSING_SAVED',
    entity_type: 'DAILY_CLOSING',
    entity_id: closingId,
    details: {
      productionDate,
      oilConsumedKg,
      oilTotalExpense,
      productionWages,
      totalProductionKg,
      productsCount: allocations.length,
    },
    created_at: new Date().toISOString(),
  });

  return {
    id: upsertedClosing.id,
    productionDate: upsertedClosing.production_date,
    oilOpeningBalance: Number(upsertedClosing.oil_opening_balance),
    oilPurchases: Number(upsertedClosing.oil_purchases),
    oilClosingBalance: Number(upsertedClosing.oil_closing_balance),
    oilConsumed: Number(upsertedClosing.oil_consumed),
    oilCostPerKg: Number(upsertedClosing.oil_cost_per_kg),
    oilTotalExpense: Number(upsertedClosing.oil_total_expense),
    productionWages: Number(upsertedClosing.production_wages),
    totalSharedExpense: Number(upsertedClosing.total_shared_expense),
    totalProductionKg: Number(upsertedClosing.total_production_kg),
    status: upsertedClosing.status,
    notes: upsertedClosing.notes || '',
    closedBy: upsertedClosing.closed_by,
    createdAt: upsertedClosing.created_at,
    updatedAt: upsertedClosing.updated_at,
  };
}

export async function fetchCostAllocations(dateOrClosingId: string): Promise<DailyCostAllocation[]> {
  const isDate = dateOrClosingId.includes('-');
  let query = supabase.from('daily_cost_allocations').select('*');
  if (isDate) {
    query = query.eq('production_date', dateOrClosingId);
  } else {
    query = query.eq('closing_id', dateOrClosingId);
  }

  const { data, error } = await query.order('total_production_kg', { ascending: false });
  if (error) throw error;

  return (data || []).map((row) => ({
    id: row.id,
    closingId: row.closing_id,
    productionDate: row.production_date,
    productId: row.product_id,
    productName: row.product_name,
    totalProductionKg: Number(row.total_production_kg) || 0,
    batchCount: Number(row.batch_count) || 1,
    ingredientCost: Number(row.ingredient_cost) || 0,
    allocatedOilCost: Number(row.allocated_oil_cost) || 0,
    allocatedProductionWages: Number(row.allocated_production_wages) || 0,
    totalProductionCost: Number(row.total_production_cost) || 0,
    productionCostPerKg: Number(row.production_cost_per_kg) || 0,
    createdAt: row.created_at,
  }));
}

// ============================================================================
// PACKAGING ITEMS & PACKING ACTIVITIES
// ============================================================================

export async function fetchPackagingItems(productId?: string): Promise<PackagingItem[]> {
  let query = supabase.from('packaging_items').select('*, products(name)').order('size_grams', { ascending: true });
  if (productId) query = query.eq('product_id', productId);

  const { data, error } = await query;
  if (error) throw error;

  return (data || []).map((row: any) => ({
    id: row.id,
    productId: row.product_id,
    productName: row.products?.name || '',
    sizeLabel: row.size_label,
    sizeGrams: Number(row.size_grams) || 100,
    currentStock: Number(row.current_stock) || 0,
    unitCost: Number(row.unit_cost) || 0,
    packingLabourRate: Number(row.packing_labour_rate) || 1.00,
    isActive: row.is_active ?? true,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export async function savePackagingItem(item: Partial<PackagingItem> & { productId: string; sizeLabel: string }): Promise<PackagingItem> {
  const payload = {
    product_id: item.productId,
    size_label: item.sizeLabel.trim(),
    size_grams: item.sizeGrams ?? 100,
    current_stock: item.currentStock ?? 0,
    unit_cost: item.unitCost ?? 0,
    packing_labour_rate: item.packingLabourRate ?? 1.00,
    is_active: item.isActive ?? true,
    updated_at: new Date().toISOString(),
  };

  if (item.id) {
    const { data, error } = await supabase
      .from('packaging_items')
      .update(payload)
      .eq('id', item.id)
      .select('*, products(name)')
      .single();

    if (error) throw error;
    return {
      id: data.id,
      productId: data.product_id,
      productName: data.products?.name || '',
      sizeLabel: data.size_label,
      sizeGrams: Number(data.size_grams),
      currentStock: Number(data.current_stock),
      unitCost: Number(data.unit_cost),
      packingLabourRate: Number(data.packing_labour_rate),
      isActive: data.is_active,
    };
  } else {
    const { data, error } = await supabase
      .from('packaging_items')
      .insert({ ...payload, created_at: new Date().toISOString() })
      .select('*, products(name)')
      .single();

    if (error) throw error;
    return {
      id: data.id,
      productId: data.product_id,
      productName: data.products?.name || '',
      sizeLabel: data.size_label,
      sizeGrams: Number(data.size_grams),
      currentStock: Number(data.current_stock),
      unitCost: Number(data.unit_cost),
      packingLabourRate: Number(data.packing_labour_rate),
      isActive: data.is_active,
    };
  }
}

export async function deletePackagingItem(id: string): Promise<void> {
  const { error } = await supabase.from('packaging_items').delete().eq('id', id);
  if (error) throw error;
}

export async function recordPacking(params: {
  packingDate: string;
  productId: string;
  packagingItemId?: string;
  packetSize: string;
  packetsPacked: number;
  operatorName?: string;
  notes?: string;
}): Promise<PackingRecord> {
  const {
    packingDate,
    productId,
    packagingItemId,
    packetSize,
    packetsPacked,
    operatorName = 'Admin',
    notes = '',
  } = params;

  // 1. Fetch product and packaging item
  const { data: prod } = await supabase.from('products').select('name').eq('id', productId).single();
  const prodName = prod?.name || 'Product';

  let unitCost = 0;
  let labourRate = 1.0;
  let sizeGrams = 100;
  let currStock = 0;

  if (packagingItemId) {
    const { data: packItem } = await supabase
      .from('packaging_items')
      .select('*')
      .eq('id', packagingItemId)
      .single();

    if (packItem) {
      unitCost = Number(packItem.unit_cost) || 0;
      labourRate = Number(packItem.packing_labour_rate) || 1.0;
      sizeGrams = Number(packItem.size_grams) || 100;
      currStock = Number(packItem.current_stock) || 0;

      // Deduct stock
      const newStock = Math.max(0, currStock - packetsPacked);
      await supabase
        .from('packaging_items')
        .update({ current_stock: newStock, updated_at: new Date().toISOString() })
        .eq('id', packagingItemId);

      // Stock movement
      await supabase.from('stock_movements').insert({
        item_id: packagingItemId,
        item_type: 'ingredient',
        item_name: `${prodName} Covers (${packetSize})`,
        movement_type: 'production_consumption',
        quantity: -packetsPacked,
        unit: 'pcs',
        previous_balance: currStock,
        new_balance: newStock,
        cost_per_unit: unitCost,
        reference: `Packing ${packingDate}`,
        operator_name: operatorName,
        reason: `Packaging covers consumed for ${packetsPacked} packets`,
        created_at: new Date().toISOString(),
      });
    }
  }

  const packagingCost = roundCurrency(packetsPacked * unitCost);
  const packingLabourCost = roundCurrency(packetsPacked * labourRate);
  const totalPackingCost = roundCurrency(packagingCost + packingLabourCost);
  const weightPackedKg = roundStock((packetsPacked * sizeGrams) / 1000.0);

  const { data: created, error } = await supabase
    .from('packing_records')
    .insert({
      packing_date: packingDate,
      product_id: productId,
      packaging_item_id: packagingItemId || null,
      packet_size: packetSize,
      packets_packed: packetsPacked,
      covers_consumed: packetsPacked,
      cover_unit_cost: unitCost,
      packaging_cost: packagingCost,
      packing_labour_rate: labourRate,
      packing_labour_cost: packingLabourCost,
      total_packing_cost: totalPackingCost,
      weight_packed_kg: weightPackedKg,
      operator_name: operatorName,
      notes: notes || null,
      created_at: new Date().toISOString(),
    })
    .select('*, products(name)')
    .single();

  if (error) throw error;

  await supabase.from('audit_logs').insert({
    actor: operatorName,
    action: 'RECORD_PACKING',
    entity_type: 'PACKING',
    entity_id: created.id,
    details: {
      productName: prodName,
      packetSize,
      packetsPacked,
      totalPackingCost,
    },
    created_at: new Date().toISOString(),
  });

  return {
    id: created.id,
    packingDate: created.packing_date,
    productId: created.product_id,
    productName: created.products?.name || prodName,
    packagingItemId: created.packaging_item_id,
    packetSize: created.packet_size,
    packetsPacked: Number(created.packets_packed),
    coversConsumed: Number(created.covers_consumed),
    coverUnitCost: Number(created.cover_unit_cost),
    packagingCost: Number(created.packaging_cost),
    packingLabourRate: Number(created.packing_labour_rate),
    packingLabourCost: Number(created.packing_labour_cost),
    totalPackingCost: Number(created.total_packing_cost),
    weightPackedKg: Number(created.weight_packed_kg),
    operatorName: created.operator_name,
    notes: created.notes,
    createdAt: created.created_at,
  };
}

export async function fetchPackingRecords(options?: { productId?: string; date?: string; limit?: number }): Promise<PackingRecord[]> {
  let query = supabase.from('packing_records').select('*, products(name)').order('created_at', { ascending: false });
  if (options?.limit) query = query.limit(options.limit);
  if (options?.productId) query = query.eq('product_id', options.productId);
  if (options?.date) query = query.eq('packing_date', options.date);

  const { data, error } = await query;
  if (error) throw error;

  return (data || []).map((row: any) => ({
    id: row.id,
    packingDate: row.packing_date,
    productId: row.product_id,
    productName: row.products?.name || 'Product',
    packagingItemId: row.packaging_item_id,
    packetSize: row.packet_size,
    packetsPacked: Number(row.packets_packed) || 0,
    coversConsumed: Number(row.covers_consumed) || 0,
    coverUnitCost: Number(row.cover_unit_cost) || 0,
    packagingCost: Number(row.packaging_cost) || 0,
    packingLabourRate: Number(row.packing_labour_rate) || 0,
    packingLabourCost: Number(row.packing_labour_cost) || 0,
    totalPackingCost: Number(row.total_packing_cost) || 0,
    weightPackedKg: Number(row.weight_packed_kg) || 0,
    operatorName: row.operator_name,
    notes: row.notes,
    createdAt: row.created_at,
  }));
}

// ============================================================================
// DAILY WAGES
// ============================================================================

export async function fetchDailyWages(limit = 60): Promise<any[]> {
  const { data, error } = await supabase
    .from('daily_wages')
    .select('*')
    .order('production_date', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data || []).map((row: any) => ({
    id: row.id,
    productionDate: row.production_date,
    totalWageBudget: Number(row.total_wage_budget) || 0,
    numCooks: Number(row.num_cooks) || 0,
    numPackers: Number(row.num_packers) || 0,
    totalPacketsProduced: Number(row.total_packets_produced) || 0,
    totalProductionKg: Number(row.total_production_kg) || 0,
    productionWageAmount: Number(row.production_wage_amount) || 0,
    packingWageAmount: Number(row.packing_wage_amount) || 0,
    wagePerCook: Number(row.wage_per_cook) || 0,
    wagePerPacker: Number(row.wage_per_packer) || 0,
    notes: row.notes || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export async function fetchDailyWage(date: string): Promise<any | null> {
  const { data, error } = await supabase
    .from('daily_wages')
    .select('*')
    .eq('production_date', date)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    id: data.id,
    productionDate: data.production_date,
    totalWageBudget: Number(data.total_wage_budget) || 0,
    numCooks: Number(data.num_cooks) || 0,
    numPackers: Number(data.num_packers) || 0,
    totalPacketsProduced: Number(data.total_packets_produced) || 0,
    totalProductionKg: Number(data.total_production_kg) || 0,
    productionWageAmount: Number(data.production_wage_amount) || 0,
    packingWageAmount: Number(data.packing_wage_amount) || 0,
    wagePerCook: Number(data.wage_per_cook) || 0,
    wagePerPacker: Number(data.wage_per_packer) || 0,
    notes: data.notes || '',
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

export async function saveDailyWage(params: {
  productionDate: string;
  totalWageBudget: number;
  numCooks: number;
  numPackers: number;
  totalPacketsProduced: number;
  totalProductionKg: number;
  productionWageAmount: number;
  packingWageAmount: number;
  wagePerCook: number;
  wagePerPacker: number;
  notes?: string;
}): Promise<any> {
  const payload = {
    production_date: params.productionDate,
    total_wage_budget: params.totalWageBudget,
    num_cooks: params.numCooks,
    num_packers: params.numPackers,
    total_packets_produced: params.totalPacketsProduced,
    total_production_kg: params.totalProductionKg,
    production_wage_amount: params.productionWageAmount,
    packing_wage_amount: params.packingWageAmount,
    wage_per_cook: params.wagePerCook,
    wage_per_packer: params.wagePerPacker,
    notes: params.notes || null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('daily_wages')
    .upsert(payload, { onConflict: 'production_date' })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function fetchTotalPacketsForDate(date: string): Promise<number> {
  const { data, error } = await supabase
    .from('packing_records')
    .select('packets_packed')
    .eq('packing_date', date);

  if (error) return 0;
  return (data || []).reduce((sum: number, r: any) => sum + (Number(r.packets_packed) || 0), 0);
}

export async function fetchTotalProductionKgForDate(date: string): Promise<number> {
  const { data, error } = await supabase
    .from('production_runs')
    .select('actual_quantity')
    .eq('production_date', date)
    .eq('status', 'completed');

  if (error) return 0;
  return (data || []).reduce((sum: number, r: any) => sum + (Number(r.actual_quantity) || 0), 0);
}

// ============================================================================
// PRODUCT SELLING PRICES
// ============================================================================

export async function fetchProductSellingPrices(): Promise<any[]> {
  const { data, error } = await supabase
    .from('product_selling_prices')
    .select('*');

  if (error) throw error;
  return (data || []).map((row: any) => ({
    id: row.id,
    productId: row.product_id,
    wholesalePricePerKg: Number(row.wholesale_price_per_kg) || 0,
    updatedAt: row.updated_at,
    createdAt: row.created_at,
  }));
}

export async function saveProductSellingPrice(productId: string, pricePerKg: number): Promise<any> {
  const { data, error } = await supabase
    .from('product_selling_prices')
    .upsert({
      product_id: productId,
      wholesale_price_per_kg: pricePerKg,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'product_id' })
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ============================================================================
// BULK PURCHASE (Add all ingredients)
// ============================================================================

export async function bulkPurchaseIngredients(
  purchases: Array<{ ingredientId: string; amount: number; costPerUnit: number }>
): Promise<void> {
  for (const purchase of purchases) {
    if (purchase.amount <= 0) continue;

    const { data: ing, error: fetchErr } = await supabase
      .from('ingredients')
      .select('id, name, unit, current_stock, avg_cost_per_unit')
      .eq('id', purchase.ingredientId)
      .single();

    if (fetchErr || !ing) continue;

    const prevStock = Number(ing.current_stock) || 0;
    const newStock = roundStock(prevStock + purchase.amount);

    // Weighted average cost calculation
    const prevCost = Number(ing.avg_cost_per_unit) || 0;
    const totalOldValue = prevStock * prevCost;
    const totalNewValue = purchase.amount * purchase.costPerUnit;
    const newAvgCost = newStock > 0
      ? roundCurrency((totalOldValue + totalNewValue) / newStock)
      : purchase.costPerUnit;

    const { error: updateErr } = await supabase
      .from('ingredients')
      .update({
        current_stock: newStock,
        avg_cost_per_unit: newAvgCost,
        updated_at: new Date().toISOString(),
      })
      .eq('id', purchase.ingredientId);

    if (updateErr) continue;

    await supabase.from('stock_movements').insert({
      item_id: purchase.ingredientId,
      item_type: 'ingredient',
      item_name: ing.name,
      movement_type: 'purchase',
      quantity: purchase.amount,
      unit: ing.unit,
      previous_balance: prevStock,
      new_balance: newStock,
      cost_per_unit: purchase.costPerUnit,
      reference: `BULK-PURCHASE-${Date.now().toString().slice(-6)}`,
      operator_name: 'Admin',
      reason: 'Bulk purchase entry',
      created_at: new Date().toISOString(),
    });
  }
}
