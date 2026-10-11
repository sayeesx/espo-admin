import { createClient } from '@supabase/supabase-js';
import { Product, Ingredient, Recipe, RecipeItem, ProductionRun, StockMovement, AuditLog } from '../types';

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
  await supabase.from('recipe_items').delete().eq('recipe_id', id);
  const { error } = await supabase.from('recipes').delete().eq('id', id);
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
    operatorName: row.operator_name,
    ingredientsConsumed: (row.production_consumption || []).map((c: any) => ({
      ingredientId: c.ingredient_id,
      ingredientName: c.ingredients?.name || 'Ingredient',
      expectedQuantity: Number(c.expected_quantity) || 0,
      actualQuantity: Number(c.actual_quantity) || 0,
      unit: c.unit,
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
