import { createClient } from '@supabase/supabase-js';
import {
  Product,
  Ingredient,
  Recipe,
  RecipeItem,
  PacketType,
  RecipePacket,
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
  allocateDailySharedExpensesWithWastage,
  WastageBatchSummary,
  calculateContinuousOilExpense,
  calculateDailyOilUsage,
  calculateWeightedAverageCost,
  roundCurrency,
  roundStock,
} from './costing';
import { dbCache } from './dbCache';

const proc = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process;
const isTestEnv =
  (proc?.env?.NODE_ENV === 'test' || Boolean(proc?.env?.VITEST)) ||
  (typeof import.meta !== 'undefined' && import.meta.env?.MODE === 'test');

const PROD_REF = 'brskubbgvxtzvhncjnle';

function resolveSupabaseConfig(): { url: string; anonKey: string } {
  if (isTestEnv) {
    const testUrl = proc?.env?.TEST_SUPABASE_URL?.trim();
    if (testUrl) {
      if (testUrl.includes(PROD_REF)) {
        throw new Error(
          `[SECURITY VIOLATION] Test environment is configured with live production Supabase URL: ${testUrl}`
        );
      }
      return {
        url: testUrl,
        anonKey: proc?.env?.TEST_SUPABASE_ANON_KEY || 'test-isolated-key',
      };
    }
    return {
      url: 'http://127.0.0.1:54321',
      anonKey: 'test-isolated-anon-key',
    };
  }

  return {
    url: import.meta.env.VITE_SUPABASE_URL || 'https://brskubbgvxtzvhncjnle.supabase.co',
    anonKey:
      import.meta.env.VITE_SUPABASE_ANON_KEY ||
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJyc2t1YmJndnh0enZobmNqbmxlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE3MDI4NDIsImV4cCI6MjEwNzI3ODg0Mn0.6ewzygZiH-rBS6RPu5QegjAUVz9LvkW9ZaHtBpJGjZM',
  };
}

const { url: supabaseUrl, anonKey: supabaseAnonKey } = resolveSupabaseConfig();

let activeAdminSessionToken: string | null =
  typeof window !== 'undefined' && typeof sessionStorage !== 'undefined'
    ? sessionStorage.getItem('epso_admin_session')
    : null;

const sessionAwareFetch: typeof fetch = (input, init) => {
  const token =
    activeAdminSessionToken ||
    (typeof window !== 'undefined' && typeof sessionStorage !== 'undefined'
      ? sessionStorage.getItem('epso_admin_session')
      : null);

  if (token && token.trim() !== '') {
    const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
    if (!headers.has('x-admin-session-token')) {
      headers.set('x-admin-session-token', token.trim());
    }
    return globalThis.fetch(input, { ...init, headers });
  }

  return globalThis.fetch(input, init);
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: {
    fetch: sessionAwareFetch,
  },
});

function updateRestHeaders(headers: any, key: string, value: string | null): void {
  if (!headers) return;
  if (typeof Headers !== 'undefined' && headers instanceof Headers) {
    if (value) {
      headers.set(key, value);
    } else {
      headers.delete(key);
    }
  } else {
    if (value) {
      headers[key] = value;
    } else {
      delete headers[key];
    }
  }
}

export function setAdminSessionHeader(token: string | null): void {
  const clean = token && token.trim() !== '' ? token.trim() : null;
  activeAdminSessionToken = clean;
  updateRestHeaders((supabase as any).rest?.headers, 'x-admin-session-token', clean);
  updateRestHeaders((supabase as any).headers, 'x-admin-session-token', clean);
}

if (activeAdminSessionToken) {
  setAdminSessionHeader(activeAdminSessionToken);
}

export function invalidateAdminCache(pattern?: string): void {
  if (pattern) {
    dbCache.invalidate(pattern);
  } else {
    dbCache.invalidateAll();
  }
}

export async function verifyAdminPin(pin: string): Promise<{
  success: boolean;
  session_token?: string;
  error?: string;
  locked?: boolean;
  remaining_attempts?: number;
}> {
  try {
    const cleanPin = pin.trim();
    const { data, error } = await supabase.rpc('verify_admin_pin', { p_pin: cleanPin });
    if (error) {
      return { success: false, error: error.message };
    }
    if (data && (data.valid === true || data.success === true)) {
      const token = data.session_token || ('epso_admin_sess_' + Date.now().toString(36) + Math.random().toString(36).slice(2));
      setAdminSessionHeader(token);
      return { success: true, session_token: token };
    }
    return {
      success: false,
      error: data?.message || 'തെറ്റായ പിൻ (Incorrect PIN)',
      locked: data?.locked,
      remaining_attempts: data?.remaining_attempts,
    };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Connection error while contacting server' };
  }
}

export async function isKitchenPinConfigured(): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc('is_kitchen_pin_configured');
    if (error || typeof data !== 'boolean') return false;
    return data;
  } catch {
    return false;
  }
}

export async function reconcilePhysicalStock(
  itemId: string,
  physicalCount: number,
  reason: string,
  operator: string = 'Shop Owner'
): Promise<{ success: boolean; discrepancy_delta?: number; message?: string; error?: string }> {
  try {
    const sessionToken =
      typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('epso_admin_session') || '' : '';
    const { data, error } = await supabase.rpc('reconcile_physical_inventory_count', {
      p_item_id: itemId,
      p_physical_count: physicalCount,
      p_reason: reason,
      p_operator: operator,
      p_session_token: sessionToken,
    });
    if (!error && data?.success) {
      invalidateAdminCache();
      return data;
    }

    // Direct fallback if RPC is missing in schema cache or failed
    // 1. Check if it's an ingredient
    const { data: ing } = await supabase
      .from('ingredients')
      .select('id, name, unit, current_stock, avg_cost_per_unit')
      .eq('id', itemId)
      .maybeSingle();

    if (ing) {
      const prevStock = Number(ing.current_stock) || 0;
      const delta = Number((physicalCount - prevStock).toFixed(3));
      const { error: updErr } = await supabase
        .from('ingredients')
        .update({
          current_stock: physicalCount,
          updated_at: new Date().toISOString(),
        })
        .eq('id', itemId);

      if (updErr) {
        return { success: false, error: updErr.message };
      }

      try {
        await supabase.from('stock_movements').insert({
          item_id: itemId,
          item_type: 'ingredient',
          item_name: ing.name,
          movement_type: delta >= 0 ? 'adjustment' : 'wastage',
          quantity: delta,
          unit: ing.unit || 'kg',
          previous_balance: prevStock,
          new_balance: physicalCount,
          cost_per_unit: ing.avg_cost_per_unit || 0,
          reference: 'Physical Audit Reconciliation',
          operator_name: operator,
          reason: `Physical count reconciliation: ${reason}`,
          created_at: new Date().toISOString(),
        });
      } catch (movErr) {
        console.warn('Could not record stock movement log:', movErr);
      }

      invalidateAdminCache('admin_ingredients');
      invalidateAdminCache('admin_stock_movements');
      return {
        success: true,
        discrepancy_delta: delta,
        message: 'Physical inventory count reconciled successfully',
      };
    }

    // 2. Check if it's a product
    const { data: prod } = await supabase
      .from('products')
      .select('id, name, unit, current_stock, wholesale_price')
      .eq('id', itemId)
      .maybeSingle();

    if (prod) {
      const prevStock = Number(prod.current_stock) || 0;
      const delta = Number((physicalCount - prevStock).toFixed(3));
      const { error: updErr } = await supabase
        .from('products')
        .update({
          current_stock: physicalCount,
          updated_at: new Date().toISOString(),
        })
        .eq('id', itemId);

      if (updErr) {
        return { success: false, error: updErr.message };
      }

      try {
        await supabase.from('stock_movements').insert({
          item_id: itemId,
          item_type: 'product',
          item_name: prod.name,
          movement_type: delta >= 0 ? 'adjustment' : 'wastage',
          quantity: delta,
          unit: prod.unit || 'kg',
          previous_balance: prevStock,
          new_balance: physicalCount,
          cost_per_unit: prod.wholesale_price || 0,
          reference: 'Physical Audit Reconciliation',
          operator_name: operator,
          reason: `Physical count reconciliation: ${reason}`,
          created_at: new Date().toISOString(),
        });
      } catch (movErr) {
        console.warn('Could not record stock movement log:', movErr);
      }

      invalidateAdminCache('admin_products');
      invalidateAdminCache('admin_stock_movements');
      return {
        success: true,
        discrepancy_delta: delta,
        message: 'Physical inventory count reconciled successfully',
      };
    }

    return {
      success: false,
      error: error?.message || 'Item not found in ingredients or products',
    };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to reconcile physical inventory' };
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

export async function fetchProducts(force = false): Promise<Product[]> {
  return dbCache.wrap('admin_products', async () => {
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
  }, { ttl: dbCache.TTL.PRODUCTS, force });
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

  dbCache.invalidate('admin_products');

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
  // 1. Check if product has production runs
  const { count } = await supabase
    .from('production_runs')
    .select('*', { count: 'exact', head: true })
    .eq('product_id', id);

  if (count && count > 0) {
    throw new Error(
      'ഈ ഉൽപ്പന്നത്തിന് പ്രൊഡക്ഷൻ ബാച്ചുകൾ നിലവിലുണ്ട്. പൂർണ്ണമായി ഡിലീറ്റ് ചെയ്യാൻ കഴിയില്ല. എഡിറ്റ് ചെയ്ത് "Active" മാറ്റുക. (This product has recorded production runs and cannot be permanently deleted. Please deactivate it instead.)'
    );
  }

  // 2. Unlink recipe_id on products to prevent circular dependency
  await supabase.from('products').update({ recipe_id: null }).eq('id', id);

  // 3. Delete recipes associated with this product
  await supabase.from('recipes').delete().eq('product_id', id);

  // 4. Delete the product
  const { error } = await supabase
    .from('products')
    .delete()
    .eq('id', id);

  if (error) throw error;

  dbCache.invalidate('admin_products');
  dbCache.invalidate('admin_recipes');
}

export async function adjustProductStock(
  productId: string,
  delta: number,
  reason: string,
  operatorName = 'Admin'
): Promise<void> {
  const { data: prod, error: fetchErr } = await supabase
    .from('products')
    .select('id, name, unit, current_stock, wholesale_price')
    .eq('id', productId)
    .single();

  if (fetchErr) throw fetchErr;

  const prevStock = Number(prod.current_stock) || 0;
  if (delta < 0 && prevStock <= 0) {
    throw new Error('സ്റ്റോക്ക് 0 ആണ്, നെഗറ്റീവ് ആക്കാൻ കഴിയില്ല (Stock is 0, cannot deduct)');
  }
  if (delta < 0 && Math.abs(delta) > prevStock) {
    throw new Error('ലഭ്യമായ സ്റ്റോക്കിനേക്കാൾ കൂടുതൽ കുറയ്ക്കാൻ കഴിയില്ല (Cannot deduct more than available stock)');
  }
  const newStock = Math.max(0, prevStock + delta);

  const { error: updateErr } = await supabase
    .from('products')
    .update({ current_stock: newStock, updated_at: new Date().toISOString() })
    .eq('id', productId);

  if (updateErr) throw updateErr;

  dbCache.invalidate('admin_products');
  dbCache.invalidate('admin_stock_movements');

  try {
    await supabase.from('stock_movements').insert({
      item_id: productId,
      item_type: 'product',
      item_name: prod.name,
      movement_type: delta >= 0 ? 'adjustment' : 'wastage',
      quantity: delta,
      unit: prod.unit,
      previous_balance: prevStock,
      new_balance: newStock,
      cost_per_unit: prod.wholesale_price,
      reference: `ADMIN-PRD-ADJ-${Date.now().toString().slice(-6)}`,
      operator_name: operatorName,
      reason,
      created_at: new Date().toISOString(),
    });
  } catch (err) {
    console.warn('Could not record stock movement log:', err);
  }
}


export async function fetchIngredients(force = false): Promise<Ingredient[]> {
  return dbCache.wrap('admin_ingredients', async () => {
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
  }, { ttl: dbCache.TTL.INGREDIENTS, force });
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

  dbCache.invalidate('admin_ingredients');

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
  const newStock = Number((prevStock + delta).toFixed(3));
  if (newStock < 0) {
    throw new Error('സ്റ്റോക്ക് 0 ന് താഴെയാക്കാൻ കഴിയില്ല (Stock cannot become negative)');
  }

  // 1. Try atomic RPC if available
  let reconciled = false;
  try {
    const sessionToken =
      typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('epso_admin_session') || '' : '';
    const { data: rpcData, error: rpcErr } = await supabase.rpc('reconcile_physical_inventory_count', {
      p_item_id: ingredientId,
      p_physical_count: newStock,
      p_reason: reason,
      p_operator: operatorName,
      p_session_token: sessionToken,
    });
    if (!rpcErr && rpcData?.success) {
      reconciled = true;
    }
  } catch {
    // RPC not available, fallback to direct update
  }

  // 2. Direct database update fallback
  if (!reconciled) {
    const { error: updateErr } = await supabase
      .from('ingredients')
      .update({ current_stock: newStock, updated_at: new Date().toISOString() })
      .eq('id', ingredientId);

    if (updateErr) throw updateErr;

    try {
      await supabase.from('stock_movements').insert({
        item_id: ingredientId,
        item_type: 'ingredient',
        item_name: ing.name,
        movement_type: delta >= 0 ? 'adjustment' : 'wastage',
        quantity: delta,
        unit: ing.unit || 'kg',
        previous_balance: prevStock,
        new_balance: newStock,
        cost_per_unit: ing.avg_cost_per_unit || 0,
        reference: `ADMIN-ING-ADJ-${Date.now().toString().slice(-6)}`,
        operator_name: operatorName,
        reason,
        created_at: new Date().toISOString(),
      });
    } catch (movErr) {
      console.warn('Could not record stock movement log:', movErr);
    }
  }

  dbCache.invalidate('admin_ingredients');
  dbCache.invalidate('admin_stock_movements');
}

export async function deleteIngredient(id: string): Promise<void> {
  dbCache.invalidate('admin_ingredients');
  dbCache.invalidate('admin_recipes');
  try {
    await supabase.from('recipe_items').delete().eq('ingredient_id', id);
  } catch (e) {
    console.warn('recipe_items cleanup note:', e);
  }
  const { error } = await supabase
    .from('ingredients')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

export async function fetchPacketTypes(force = false): Promise<PacketType[]> {
  return dbCache.wrap('admin_packet_types', async () => {
    const { data, error } = await supabase
      .from('packet_types')
      .select('*')
      .order('name', { ascending: true });

    if (error) {
      console.error('Error fetching packet types:', error);
      return [];
    }

    return (data || []).map((row) => ({
      id: row.id,
      name: row.name,
      bundleCost: Number(row.bundle_cost) || 0,
      bundleQuantity: Math.max(0, Number(row.bundle_quantity ?? 0)),
      costPerPacket: Number(row.cost_per_packet) || 0,
      isActive: row.is_active ?? true,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }, { ttl: dbCache.TTL.PACKET_TYPES, force });
}

export async function savePacketType(packet: Partial<PacketType> & { name: string }): Promise<PacketType> {
  const bundleCost = Math.max(0, Number(packet.bundleCost) || 0);
  const bundleQuantity = Math.max(0, Number(packet.bundleQuantity ?? 0));
  const costPerPacket = packet.costPerPacket !== undefined && Number(packet.costPerPacket) > 0
    ? Number(packet.costPerPacket)
    : bundleQuantity > 0 && bundleCost > 0
      ? Number((bundleCost / bundleQuantity).toFixed(4))
      : Number(packet.costPerPacket) || 0;

  const trimmedName = packet.name.trim();
  const payload = {
    name: trimmedName,
    bundle_cost: bundleCost,
    bundle_quantity: bundleQuantity,
    cost_per_packet: costPerPacket,
    is_active: packet.isActive ?? true,
    updated_at: new Date().toISOString(),
  };

  dbCache.invalidate('admin_packet_types');
  dbCache.invalidate('admin_recipes');

  let targetId = packet.id;
  if (!targetId) {
    const { data: existing } = await supabase
      .from('packet_types')
      .select('id')
      .ilike('name', trimmedName)
      .limit(1)
      .maybeSingle();
    if (existing?.id) {
      targetId = existing.id;
    }
  }

  if (targetId) {
    const { data, error } = await supabase
      .from('packet_types')
      .update(payload)
      .eq('id', targetId)
      .select()
      .single();

    if (error) throw error;
    return {
      id: data.id,
      name: data.name,
      bundleCost: Number(data.bundle_cost) || 0,
      bundleQuantity: Math.max(0, Number(data.bundle_quantity ?? 0)),
      costPerPacket: Number(data.cost_per_packet) || 0,
      isActive: data.is_active,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  } else {
    const { data, error } = await supabase
      .from('packet_types')
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
      bundleCost: Number(data.bundle_cost) || 0,
      bundleQuantity: Math.max(0, Number(data.bundle_quantity ?? 0)),
      costPerPacket: Number(data.cost_per_packet) || 0,
      isActive: data.is_active,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  }
}

export async function recordPacketPurchase(params: {
  packetTypeId: string;
  quantity: number;
  totalPrice: number;
  operatorName?: string;
}): Promise<PacketType> {
  const { packetTypeId, quantity, totalPrice, operatorName = 'Admin' } = params;
  if (quantity <= 0) throw new Error('Quantity must be greater than zero');
  if (totalPrice < 0) throw new Error('Total price cannot be negative');

  dbCache.invalidate('admin_packet_types');
  dbCache.invalidate('admin_stock_movements');

  // 1. Attempt atomic RPC execution
  try {
    const { data: rpcData, error: rpcErr } = await supabase.rpc('record_packet_purchase', {
      p_packet_type_id: packetTypeId,
      p_quantity: Math.round(quantity),
      p_total_cost: totalPrice,
      p_operator_name: operatorName,
    });

    if (!rpcErr && rpcData) {
      return {
        id: rpcData.id,
        name: rpcData.name,
        bundleCost: Number(rpcData.bundle_cost) || 0,
        bundleQuantity: Math.max(0, Number(rpcData.bundle_quantity ?? 0)),
        costPerPacket: Number(rpcData.cost_per_packet) || 0,
        isActive: rpcData.is_active ?? true,
        createdAt: rpcData.created_at,
        updatedAt: rpcData.updated_at,
      };
    }
    if (rpcErr) console.warn('record_packet_purchase RPC failed, fallback to client logic:', rpcErr);
  } catch (err) {
    console.warn('record_packet_purchase RPC error, fallback to client logic:', err);
  }

  // 2. Client fallback
  const { data: pt, error: fetchErr } = await supabase
    .from('packet_types')
    .select('*')
    .eq('id', packetTypeId)
    .single();
  if (fetchErr || !pt) throw fetchErr || new Error('Packet type not found');

  const currStock = Math.max(0, Number(pt.bundle_quantity ?? 0));
  const currUnitCost = Number(pt.cost_per_packet) || 0;
  const purchasedQty = Math.round(quantity);
  const purchasedUnitCost = purchasedQty > 0 ? Number((totalPrice / purchasedQty).toFixed(4)) : 0;

  const newStock = currStock + purchasedQty;
  const newUnitCost = currStock <= 0
    ? purchasedUnitCost
    : Number(((currStock * currUnitCost + totalPrice) / newStock).toFixed(4));
  const newBundleCost = Number((newStock * newUnitCost).toFixed(2));

  const { data: updated, error: updateErr } = await supabase
    .from('packet_types')
    .update({
      bundle_quantity: newStock,
      cost_per_packet: newUnitCost,
      bundle_cost: newBundleCost,
      is_active: true,
      updated_at: new Date().toISOString(),
    })
    .eq('id', packetTypeId)
    .select()
    .single();

  if (updateErr) throw updateErr;

  try {
    await supabase.from('stock_movements').insert({
      item_id: packetTypeId,
      item_type: 'ingredient',
      item_name: pt.name,
      movement_type: 'purchase_inward',
      quantity: purchasedQty,
      unit: 'pcs',
      previous_balance: currStock,
      new_balance: newStock,
      cost_per_unit: newUnitCost,
      reference: 'Purchase Inward',
      operator_name: operatorName,
      reason: `Purchased ${purchasedQty} pcs at ₹${totalPrice} (Weighted Avg: ₹${newUnitCost}/pkt)`,
      created_at: new Date().toISOString(),
    });
  } catch (smErr) {
    console.warn('Could not record stock movement for packet purchase:', smErr);
  }

  return {
    id: updated.id,
    name: updated.name,
    bundleCost: Number(updated.bundle_cost) || 0,
    bundleQuantity: Math.max(0, Number(updated.bundle_quantity ?? 0)),
    costPerPacket: Number(updated.cost_per_packet) || 0,
    isActive: updated.is_active ?? true,
    createdAt: updated.created_at,
    updatedAt: updated.updated_at,
  };
}

export async function adjustPacketStock(params: {
  packetTypeId: string;
  newQuantity: number;
  costPerPacket: number;
  name?: string;
  operatorName?: string;
}): Promise<PacketType> {
  const { packetTypeId, newQuantity, costPerPacket, name, operatorName = 'Admin' } = params;
  if (newQuantity < 0) throw new Error('Quantity cannot be negative');
  if (costPerPacket < 0) throw new Error('Cost per packet cannot be negative');

  dbCache.invalidate('admin_packet_types');
  dbCache.invalidate('admin_stock_movements');

  // 1. Attempt atomic RPC execution
  try {
    const { data: rpcData, error: rpcErr } = await supabase.rpc('adjust_packet_stock', {
      p_packet_type_id: packetTypeId,
      p_new_quantity: Math.round(newQuantity),
      p_cost_per_packet: costPerPacket,
      p_name: name?.trim() || null,
      p_operator_name: operatorName,
    });

    if (!rpcErr && rpcData) {
      return {
        id: rpcData.id,
        name: rpcData.name,
        bundleCost: Number(rpcData.bundle_cost) || 0,
        bundleQuantity: Math.max(0, Number(rpcData.bundle_quantity ?? 0)),
        costPerPacket: Number(rpcData.cost_per_packet) || 0,
        isActive: rpcData.is_active ?? true,
        createdAt: rpcData.created_at,
        updatedAt: rpcData.updated_at,
      };
    }
    if (rpcErr) console.warn('adjust_packet_stock RPC failed, fallback to client logic:', rpcErr);
  } catch (err) {
    console.warn('adjust_packet_stock RPC error, fallback to client logic:', err);
  }

  // 2. Client fallback
  const { data: pt, error: fetchErr } = await supabase
    .from('packet_types')
    .select('*')
    .eq('id', packetTypeId)
    .single();
  if (fetchErr || !pt) throw fetchErr || new Error('Packet type not found');

  const currStock = Math.max(0, Number(pt.bundle_quantity ?? 0));
  const newStockInt = Math.round(newQuantity);
  const delta = newStockInt - currStock;
  const newName = name?.trim() || pt.name;
  const newBundleCost = Number((newStockInt * costPerPacket).toFixed(2));

  const { data: updated, error: updateErr } = await supabase
    .from('packet_types')
    .update({
      name: newName,
      bundle_quantity: newStockInt,
      cost_per_packet: costPerPacket,
      bundle_cost: newBundleCost,
      is_active: true,
      updated_at: new Date().toISOString(),
    })
    .eq('id', packetTypeId)
    .select()
    .single();

  if (updateErr) throw updateErr;

  if (delta !== 0) {
    try {
      await supabase.from('stock_movements').insert({
        item_id: packetTypeId,
        item_type: 'ingredient',
        item_name: newName,
        movement_type: 'adjustment',
        quantity: delta,
        unit: 'pcs',
        previous_balance: currStock,
        new_balance: newStockInt,
        cost_per_unit: costPerPacket,
        reference: 'Stock Adjustment',
        operator_name: operatorName,
        reason: `Manual stock adjustment from ${currStock} to ${newStockInt} pcs`,
        created_at: new Date().toISOString(),
      });
    } catch (smErr) {
      console.warn('Could not record stock movement for packet adjustment:', smErr);
    }
  }

  return {
    id: updated.id,
    name: updated.name,
    bundleCost: Number(updated.bundle_cost) || 0,
    bundleQuantity: Math.max(0, Number(updated.bundle_quantity ?? 0)),
    costPerPacket: Number(updated.cost_per_packet) || 0,
    isActive: updated.is_active ?? true,
    createdAt: updated.created_at,
    updatedAt: updated.updated_at,
  };
}

export async function deletePacketType(id: string): Promise<{ status: 'deleted' | 'archived'; message: string }> {
  dbCache.invalidate('admin_packet_types');
  dbCache.invalidate('admin_recipes');

  // 1. Attempt atomic safe deletion RPC
  try {
    const { data: rpcData, error: rpcErr } = await supabase.rpc('delete_packet_type_safe', {
      p_packet_type_id: id,
    });

    if (!rpcErr && rpcData) {
      return {
        status: (rpcData.status as any) || 'deleted',
        message: rpcData.message || (rpcData.status === 'archived' ? 'Packet type archived' : 'Packet type deleted'),
      };
    }
    if (rpcErr) console.warn('delete_packet_type_safe RPC failed, fallback to client logic:', rpcErr);
  } catch (err) {
    console.warn('delete_packet_type_safe RPC error, fallback to client logic:', err);
  }

  // 2. Client fallback
  const { data: pt } = await supabase.from('packet_types').select('name').eq('id', id).single();
  const ptName = pt?.name || '';

  // Check historical usage
  const [{ count: recipeCount }, { count: packingCount }, { count: movCount }] = await Promise.all([
    supabase.from('recipe_packets').select('id', { count: 'exact', head: true }).eq('packet_type_id', id),
    supabase.from('packing_records').select('id', { count: 'exact', head: true }).ilike('packet_size', ptName),
    supabase.from('stock_movements').select('id', { count: 'exact', head: true }).eq('item_id', id),
  ]);

  if ((recipeCount || 0) > 0 || (packingCount || 0) > 0 || (movCount || 0) > 0) {
    const { error } = await supabase
      .from('packet_types')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
    return { status: 'archived', message: 'Packet type has historical production records and was archived.' };
  } else {
    const { error } = await supabase.from('packet_types').delete().eq('id', id);
    if (error) throw error;
    return { status: 'deleted', message: 'Packet type permanently deleted.' };
  }
}

export async function fetchRecipes(force = false): Promise<Recipe[]> {
  return dbCache.wrap('admin_recipes', async () => {
    const { data: recipesData, error: recipesErr } = await supabase
      .from('recipes')
      .select(`
        *,
        products!recipes_product_id_fkey (name)
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

    const { data: packetsData } = await supabase
      .from('recipe_packets')
      .select('*');

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

      let packets: RecipePacket[] = [];
      if (packetsData && packetsData.length > 0) {
        packets = packetsData
          .filter((p: any) => p.recipe_id === r.id)
          .map((p: any) => ({
            id: p.id,
            recipeId: p.recipe_id,
            packetTypeId: p.packet_type_id,
            packetName: p.packet_name,
            costPerPacket: Number(p.cost_per_packet) || 0,
            bundleCost: Number(p.bundle_cost) || 0,
            bundleQuantity: Number(p.bundle_quantity) || 1,
          }));
      }
      if (packets.length === 0 && Array.isArray(r.packets) && r.packets.length > 0) {
        packets = r.packets.map((p: any) => ({
          id: p.id,
          recipeId: r.id,
          packetTypeId: p.packetTypeId,
          packetName: p.packetName || p.name || 'Packet',
          costPerPacket: Number(p.costPerPacket) || 0,
          bundleCost: Number(p.bundleCost) || 0,
          bundleQuantity: Number(p.bundleQuantity) || 1,
        }));
      }

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
        packets,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      };
    });
  }, { ttl: dbCache.TTL.RECIPES, force });
}

export async function saveRecipe(
  recipe: Partial<Recipe> & { productId: string; baseOutputQuantity: number; baseOutputUnit: string },
  items: Array<{ ingredientId: string; quantity: number; unit: string }>,
  packets?: Array<{ packetTypeId?: string; packetName: string; costPerPacket: number; bundleCost?: number; bundleQuantity?: number }>
): Promise<void> {
  let recipeId = recipe.id;

  const normalizedPackets = (packets || []).map((p) => ({
    packetTypeId: p.packetTypeId,
    packetName: p.packetName,
    costPerPacket: Number(p.costPerPacket) || 0,
    bundleCost: Number(p.bundleCost) || 0,
    bundleQuantity: Number(p.bundleQuantity) || 1,
  }));

  dbCache.invalidate('admin_recipes');
  dbCache.invalidate('admin_products');

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
        packets: normalizedPackets,
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
        packets: normalizedPackets,
        is_active: recipe.isActive ?? true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', recipeId);

    if (recErr) throw recErr;

    // Ensure product is linked
    if (recipe.productId) {
      await supabase.from('products').update({ recipe_id: recipeId }).eq('id', recipe.productId);
    }

    // Remove old recipe items & packets
    await supabase.from('recipe_items').delete().eq('recipe_id', recipeId);
    await supabase.from('recipe_packets').delete().eq('recipe_id', recipeId);
  }

  // Insert items (deduplicate by ingredientId to prevent duplicate consumption)
  if (items.length > 0) {
    const dedupedMap = new Map<string, { ingredientId: string; quantity: number; unit: string }>();
    for (const it of items) {
      if (!it.ingredientId) continue;
      const existing = dedupedMap.get(it.ingredientId);
      if (existing) {
        existing.quantity += Number(it.quantity) || 0;
      } else {
        dedupedMap.set(it.ingredientId, {
          ingredientId: it.ingredientId,
          quantity: Number(it.quantity) || 0,
          unit: it.unit || 'kg',
        });
      }
    }

    const itemsPayload = Array.from(dedupedMap.values()).map((it) => ({
      recipe_id: recipeId,
      ingredient_id: it.ingredientId,
      quantity: it.quantity,
      unit: it.unit,
      created_at: new Date().toISOString(),
    }));

    const { error: itemsErr } = await supabase.from('recipe_items').insert(itemsPayload);
    if (itemsErr) throw itemsErr;
  }

  // Insert packets
  if (normalizedPackets.length > 0) {
    const packetsPayload = normalizedPackets.map((pkt) => ({
      recipe_id: recipeId,
      packet_type_id: pkt.packetTypeId || null,
      packet_name: pkt.packetName,
      cost_per_packet: pkt.costPerPacket,
      bundle_cost: pkt.bundleCost || 0,
      bundle_quantity: pkt.bundleQuantity || 1,
      created_at: new Date().toISOString(),
    }));

    const { error: pktsErr } = await supabase.from('recipe_packets').insert(packetsPayload);
    if (pktsErr) {
      console.error('Error inserting recipe_packets:', pktsErr);
    }
  }
}

export async function deleteRecipe(id: string): Promise<void> {
  dbCache.invalidate('admin_recipes');
  dbCache.invalidate('admin_products');
  await supabase.from('products').update({ recipe_id: null }).eq('recipe_id', id);
  await supabase.from('recipe_items').delete().eq('recipe_id', id);
  await supabase.from('recipe_packets').delete().eq('recipe_id', id);
  const { error } = await supabase.from('recipes').delete().eq('id', id);
  if (error) throw error;
}

export interface DeleteProductionRunOptions {
  restoreIngredients?: boolean;
  operatorName?: string;
  reason?: string;
}

export async function deleteProductionRun(
  id: string,
  options?: DeleteProductionRunOptions
): Promise<void> {
  const { data: run, error: fetchErr } = await supabase
    .from('production_runs')
    .select(`
      id,
      run_number,
      production_date,
      product_id,
      actual_quantity,
      unit,
      production_consumption (
        ingredient_id,
        actual_quantity,
        unit
      )
    `)
    .eq('id', id)
    .maybeSingle();

  if (fetchErr) throw fetchErr;
  if (!run) return;

  // 1. Deduct produced product quantity from product stock
  if (run.product_id && Number(run.actual_quantity) > 0) {
    const { data: prod } = await supabase
      .from('products')
      .select('id, name, current_stock, unit')
      .eq('id', run.product_id)
      .maybeSingle();

    if (prod) {
      const prevStock = Number(prod.current_stock) || 0;
      const deductQty = Number(run.actual_quantity) || 0;
      const newStock = Math.max(0, Number((prevStock - deductQty).toFixed(3)));

      const { error: pUpdateErr } = await supabase
        .from('products')
        .update({ current_stock: newStock, updated_at: new Date().toISOString() })
        .eq('id', run.product_id);

      if (pUpdateErr) throw pUpdateErr;

      try {
        await supabase.from('stock_movements').insert({
          item_id: run.product_id,
          item_type: 'product',
          item_name: prod.name,
          movement_type: 'adjustment',
          quantity: -deductQty,
          unit: prod.unit,
          previous_balance: prevStock,
          new_balance: newStock,
          reference: `Del Run ${run.run_number}`,
          operator_name: options?.operatorName || 'Admin',
          reason: options?.reason || `Batch #${run.run_number} deleted: -${deductQty} ${prod.unit} removed from stock`,
          created_at: new Date().toISOString(),
        });
      } catch (smErr) {
        console.warn('Stock movement insert failed:', smErr);
      }
    }
  }

  // 2. Restore consumed ingredients back to ingredient stock (if requested)
  if (options?.restoreIngredients && run.production_consumption && run.production_consumption.length > 0) {
    for (const item of run.production_consumption) {
      const ingId = item.ingredient_id;
      const qtyToRestore = Number(item.actual_quantity) || 0;
      if (ingId && qtyToRestore > 0) {
        const { data: ing } = await supabase
          .from('ingredients')
          .select('id, name, current_stock, unit')
          .eq('id', ingId)
          .maybeSingle();

        if (ing) {
          const prevIngStock = Number(ing.current_stock) || 0;
          const newIngStock = Number((prevIngStock + qtyToRestore).toFixed(3));

          await supabase
            .from('ingredients')
            .update({ current_stock: newIngStock, updated_at: new Date().toISOString() })
            .eq('id', ingId);

          try {
            await supabase.from('stock_movements').insert({
              item_id: ingId,
              item_type: 'ingredient',
              item_name: ing.name,
              movement_type: 'adjustment',
              quantity: qtyToRestore,
              unit: ing.unit,
              previous_balance: prevIngStock,
              new_balance: newIngStock,
              reference: `Del Run ${run.run_number} Reversal`,
              operator_name: options?.operatorName || 'Admin',
              reason: `Batch #${run.run_number} deleted: +${qtyToRestore} ${ing.unit} restored to stock`,
              created_at: new Date().toISOString(),
            });
          } catch (smErr) {
            console.warn('Stock movement insert failed:', smErr);
          }
        }
      }
    }
  }

  // 3. Unlink any packing records referencing this run
  try {
    await supabase
      .from('packing_records')
      .update({ production_run_id: null })
      .eq('production_run_id', id);
  } catch (packErr) {
    console.warn('Unlink packing records non-fatal:', packErr);
  }

  // 4. Delete consumption and production run
  await supabase.from('production_consumption').delete().eq('run_id', id);
  const { error: delErr } = await supabase.from('production_runs').delete().eq('id', id);
  if (delErr) throw delErr;

  if (run.production_date) {
    try {
      await supabase
        .from('daily_closings')
        .update({ status: 'adjusted', updated_at: new Date().toISOString() })
        .eq('production_date', run.production_date)
        .eq('status', 'closed');
    } catch (dcErr) {
      console.warn('Could not flag daily closing as adjusted:', dcErr);
    }
  }

  // 5. Invalidate caches
  invalidateAdminCache('admin_products');
  invalidateAdminCache('admin_ingredients');
  invalidateAdminCache('admin_production_runs');
  invalidateAdminCache('admin_stock_movements');
  invalidateAdminCache();
}

export async function fetchProductionRuns(force = false): Promise<ProductionRun[]> {
  return dbCache.wrap('admin_production_runs', async () => {
    const [{ data, error }, { data: packingsData }] = await Promise.all([
      supabase
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
        .limit(500),
      supabase
        .from('packing_records')
        .select('id, production_run_id, packet_size, packets_packed, weight_packed_kg, notes')
        .order('created_at', { ascending: false })
        .limit(500),
    ]);

    if (error) throw error;
    return (data || []).map((row: any) => {
      const runPackings = (packingsData || []).filter((p: any) =>
        p.production_run_id
          ? p.production_run_id === row.id
          : Boolean(p.notes && p.notes.includes(row.run_number))
      );
      const totalPackets = runPackings.reduce(
        (sum: number, p: any) => sum + (Number(p.packets_packed) || 0),
        0
      );

      return {
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
        packingRecords: runPackings.map((p: any) => ({
          id: p.id,
          packetSize: p.packet_size,
          packetsPacked: Number(p.packets_packed) || 0,
          weightPackedKg: Number(p.weight_packed_kg) || 0,
        })),
        totalPacketsPacked: totalPackets,
      };
    });
  }, { ttl: dbCache.TTL.PRODUCTION_RUNS, force });
}

export async function fetchStockMovements(force = false): Promise<StockMovement[]> {
  return dbCache.wrap('admin_stock_movements', async () => {
    const { data, error } = await supabase
      .from('stock_movements')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1000);

    if (error) throw error;
    return (data || []).map((row) => ({
      id: row.id,
      itemId: row.item_id,
      itemType: row.item_type as any,
      itemName: row.item_name || '',
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
  }, { ttl: dbCache.TTL.STOCK_MOVEMENTS, force });
}

export async function fetchAuditLogs(force = false): Promise<AuditLog[]> {
  return dbCache.wrap('admin_audit_logs', async () => {
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
  }, { ttl: dbCache.TTL.AUDIT_LOGS, force });
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

  let totalOilUsedKg: number | undefined = undefined;
  let oilLeftoverKg: number | undefined = undefined;
  if (data.notes) {
    try {
      const meta = JSON.parse(data.notes);
      if (typeof meta.oilUsedKg === 'number') totalOilUsedKg = meta.oilUsedKg;
      if (typeof meta.leftoverOilKg === 'number') oilLeftoverKg = meta.leftoverOilKg;
    } catch {}
  }

  return {
    id: data.id,
    productionDate: data.production_date,
    oilOpeningBalance: Number(data.oil_opening_balance) || 0,
    oilPurchases: Number(data.oil_purchases) || 0,
    oilClosingBalance: Number(data.oil_closing_balance) || 0,
    oilConsumed: Number(data.oil_consumed) || 0,
    totalOilUsedKg,
    oilLeftoverKg,
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

export async function fetchDailyClosings(limit = 60, force = false): Promise<DailyClosing[]> {
  return dbCache.wrap(`admin_daily_closings_${limit}`, async () => {
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
  }, { ttl: dbCache.TTL.DAILY_CLOSINGS, force });
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
  discount?: number;
  total_amount: number;
  customer_name?: string;
  payment_method?: string;
  payment_status?: string;
  notes?: string;
}): Promise<any> {
  const saleQty = Number(sale.quantity) || 0;
  if (saleQty <= 0) {
    throw new Error('Sale quantity must be greater than zero');
  }

  // Atomically record sale, update stock with row-level lock (FOR UPDATE), and insert ledger movement
  const { data, error } = await supabase.rpc('record_sale_atomic', {
    p_sale_date: sale.sale_date,
    p_product_name: sale.product_name,
    p_quantity: saleQty,
    p_unit: sale.unit || 'kg',
    p_unit_price: Number(sale.unit_price) || 0,
    p_discount: Number(sale.discount) || 0,
    p_total_amount: Number(sale.total_amount) || 0,
    p_product_id: sale.product_id ? sale.product_id : null,
    p_customer_name: sale.customer_name || null,
    p_payment_method: sale.payment_method || null,
    p_payment_status: sale.payment_status || 'paid',
    p_notes: sale.notes || null,
  });

  if (error) {
    console.error('Error recording sale atomically:', error);
    throw new Error(error.message || 'Failed to record sale');
  }

  dbCache.invalidate('admin_products');
  return data;
}

export async function recordSalesBatch(sales: Array<{
  sale_date: string;
  product_id?: string;
  product_name: string;
  quantity: number;
  unit: string;
  unit_price: number;
  discount?: number;
  total_amount: number;
  customer_name?: string;
  payment_method?: string;
  payment_status?: string;
  notes?: string;
}>): Promise<any[]> {
  if (!sales || sales.length === 0) return [];

  const results: any[] = [];
  for (const s of sales) {
    const result = await recordSale(s);
    results.push(result);
  }
  return results;
}

export async function deleteSale(id: string, restoreStock: boolean = true): Promise<void> {
  const { error } = await supabase.rpc('delete_sale_atomic', {
    p_sale_id: id,
    p_restore_stock: restoreStock,
  });

  if (error) {
    console.error('Error deleting sale atomically:', error);
    throw new Error(error.message || 'Failed to delete sale');
  }

  dbCache.invalidate('admin_products');
}


export async function saveDailyClosing(params: {
  productionDate: string;
  oilOpeningBalance?: number;
  oilPurchases?: number;
  oilClosingBalance?: number;
  oilUsedKg?: number;
  oilLeftoverKg?: number;
  oilCostPerKg?: number;
  productionWages?: number;
  notes?: string;
  closedBy?: string;
}): Promise<DailyClosing> {
  const {
    productionDate,
    oilPurchases = 0,
    notes = '',
    closedBy = 'Admin',
  } = params;

  // 1. Fetch current oil ingredient from inventory
  const { data: oilIng } = await supabase
    .from('ingredients')
    .select('id, name, unit, current_stock, avg_cost_per_unit')
    .or("name.eq.ഓയിൽ,name.ilike.%oil%")
    .limit(1)
    .maybeSingle();

  // 2. Check for an existing closing for this production date
  const { data: existingClosing } = await supabase
    .from('daily_closings')
    .select('id, oil_consumed, oil_opening_balance, oil_closing_balance, notes')
    .eq('production_date', productionDate)
    .maybeSingle();

  // 3. Determine previous available stock:
  // If editing/re-saving for this date, reverse previously deducted net consumption
  // so neither used oil nor leftover oil is counted twice.
  const prevNetDeducted = existingClosing ? (Number(existingClosing.oil_consumed) || 0) : 0;
  const currentStockInDb = oilIng ? (Number(oilIng.current_stock) || 0) : 0;
  const previousAvailableStock = existingClosing
    ? roundStock(currentStockInDb + prevNetDeducted)
    : (currentStockInDb > 0 ? currentStockInDb : (params.oilOpeningBalance ?? 0));

  // 4. Determine oil used and leftover oil
  let oilUsed = 0;
  let leftoverOil = 0;

  if (params.oilUsedKg !== undefined) {
    oilUsed = Math.max(0, roundStock(params.oilUsedKg));
    leftoverOil = Math.max(0, Math.min(oilUsed, roundStock(params.oilLeftoverKg ?? 0)));
  } else if (params.oilOpeningBalance !== undefined && params.oilClosingBalance !== undefined) {
    oilUsed = Math.max(0, roundStock(params.oilOpeningBalance - params.oilClosingBalance));
    leftoverOil = Math.max(0, roundStock(params.oilClosingBalance));
  }

  // 5. Backend Inventory Calculation:
  // Final Oil Stock = Previous Available Stock - Oil Used + Leftover Oil
  // Net Oil Consumed = Oil Used - Leftover Oil
  const oilUnitCost = params.oilCostPerKg ?? (Number(oilIng?.avg_cost_per_unit) || 150);
  const {
    netOilConsumedKg: oilConsumedKg,
    finalOilStockKg: finalOilStock,
    oilTotalExpense,
  } = calculateDailyOilUsage(
    previousAvailableStock,
    oilUsed,
    leftoverOil,
    oilUnitCost
  );

  // Wages: read only the admin-entered wage for this exact date (never copy from previous days)
  let productionWages = params.productionWages || 0;
  try {
    const { data: todayWage } = await supabase
      .from('daily_wages')
      .select('*')
      .eq('production_date', productionDate)
      .maybeSingle();

    const todayBudget =
      Number(todayWage?.total_wage_budget) ||
      Number(todayWage?.daily_wage_budget) ||
      ((Number(todayWage?.production_wage_amount) || 0) + (Number(todayWage?.packing_wage_amount) || 0)) ||
      0;
    if (todayWage && todayBudget > 0) {
      if (!productionWages) {
        productionWages = todayBudget;
      }
    }
  } catch (e) {
    console.warn('Could not read daily wage for closing:', e);
  }

  // Query basic ingredients adjustments recorded on this date (Salt, Cashew shell, Chippli, Curry leaves)
  let dailyBasicIngredientsExpense = 0;
  try {
    const { data: basicMovements } = await supabase
      .from('stock_movements')
      .select('quantity, unit, cost_per_unit, item_name, reason')
      .eq('item_type', 'ingredient')
      .ilike('reason', `%${productionDate}%`);

    if (basicMovements && basicMovements.length > 0) {
      for (const m of basicMovements) {
        const cost = Number(m.cost_per_unit) || 0;
        let qty = Math.abs(Number(m.quantity) || 0);
        const u = (m.unit || '').trim().toLowerCase();
        if (u === 'g' || u === 'ml') {
          qty = qty / 1000;
        }
        dailyBasicIngredientsExpense += qty * cost;
      }
    }
  } catch (e) {
    console.warn('Could not query basic ingredients expense for allocation', e);
  }

  const totalSharedExpense = roundCurrency(oilTotalExpense + productionWages + dailyBasicIngredientsExpense);

  // 6. Fetch production runs on that date (both completed good runs and wastage runs)
  const { data: runs, error: runsErr } = await supabase
    .from('production_runs')
    .select(`
      id,
      run_number,
      product_id,
      actual_quantity,
      planned_quantity,
      total_ingredient_cost,
      status,
      cancellation_reason,
      products (name)
    `)
    .eq('production_date', productionDate);

  if (runsErr) throw runsErr;

  const goodRuns = (runs || []).filter((r: any) => r.status === 'completed' && (Number(r.actual_quantity) || 0) > 0);
  const wastageRuns = (runs || []).filter((r: any) => r.status === 'cancelled' && r.cancellation_reason === 'wastage');

  const totalProductionKg = goodRuns.reduce((sum: number, r: any) => sum + (Number(r.actual_quantity) || 0), 0);

  // Group good production runs by product
  const productMap: Record<string, { productId: string; productName: string; totalProductionKg: number; batchCount: number; ingredientCost: number }> = {};
  for (const r of goodRuns) {
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

  const wastageSummary: WastageBatchSummary[] = wastageRuns.map((r: any) => {
    const attempted = Number(r.actual_quantity) > 0 ? Number(r.actual_quantity) : Number(r.planned_quantity) || 0;
    return {
      runId: r.id,
      runNumber: r.run_number,
      productName: (r.products as any)?.name || 'Product',
      attemptedKg: attempted,
      directMaterialLoss: Number(r.total_ingredient_cost) || 0,
    };
  });

  // Distribute shared expenses: keeps good production costs separate from wastage / spoilage losses
  const {
    productAllocations: allocations,
    wastageAllocations,
    totalSpoilageLoss,
    totalWastageKg,
  } = allocateDailySharedExpensesWithWastage(
    productsSummary,
    wastageSummary,
    oilTotalExpense,
    productionWages,
    dailyBasicIngredientsExpense
  );

  // Metadata preserving exact cook inputs and wastage breakdown
  const metaPayload = {
    oilUsedKg: oilUsed,
    leftoverOilKg: leftoverOil,
    previousAvailableStock,
    finalOilStock,
    basicIngredientsExpense: dailyBasicIngredientsExpense,
    totalWastageKg,
    totalSpoilageLoss,
    wastageDetails: wastageAllocations,
    userNotes: notes || '',
  };

  const closingPayload: Record<string, any> = {
    production_date: productionDate,
    oil_opening_balance: previousAvailableStock,
    oil_purchases: oilPurchases,
    oil_closing_balance: finalOilStock,
    oil_consumed: oilConsumedKg,
    oil_cost_per_kg: oilUnitCost,
    oil_total_expense: oilTotalExpense,
    production_wages: productionWages,
    total_shared_expense: totalSharedExpense,
    total_production_kg: totalProductionKg,
    total_spoilage_loss: totalSpoilageLoss,
    total_wastage_kg: totalWastageKg,
    status: 'closed',
    notes: JSON.stringify(metaPayload),
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

  // Update production_runs for wastage batches with their allocated spoilage loss
  for (const wa of wastageAllocations) {
    try {
      await supabase
        .from('production_runs')
        .update({
          allocated_oil_cost: wa.allocatedOilLoss,
          allocated_labour_cost: wa.allocatedLabourLoss,
          allocated_basic_cost: wa.allocatedBasicLoss,
          spoilage_loss: wa.totalSpoilageLoss,
          updated_at: new Date().toISOString(),
        })
        .eq('id', wa.runId);
    } catch (e) {
      console.warn('Could not update wastage run spoilage loss:', e);
    }
  }

  // Update moving weighted average inventory valuation on products for good production
  for (const a of allocations) {
    if (a.totalProductionKg > 0 && a.productionCostPerKg > 0) {
      try {
        const { data: prod } = await supabase
          .from('products')
          .select('current_stock, avg_cost_per_unit')
          .eq('id', a.productId)
          .single();
        if (prod) {
          const currStock = Number(prod.current_stock) || 0;
          const prevCost = Number(prod.avg_cost_per_unit) || 0;
          const prevStock = Math.max(0, roundStock(currStock - a.totalProductionKg));
          const newAvg = calculateWeightedAverageCost(prevStock, prevCost, a.totalProductionKg, a.productionCostPerKg);
          await supabase
            .from('products')
            .update({ avg_cost_per_unit: newAvg, updated_at: new Date().toISOString() })
            .eq('id', a.productId);
        }
      } catch (e) {
        console.warn('Could not update product valuation:', e);
      }
    }
  }

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
      allocated_basic_ingredients_cost: a.allocatedBasicIngredientsCost || 0,
      total_production_cost: a.totalProductionCost,
      production_cost_per_kg: a.productionCostPerKg,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));

    let { error: allocErr } = await supabase.from('daily_cost_allocations').insert(allocationsPayload);
    if (allocErr && allocErr.message?.includes('allocated_basic_ingredients_cost')) {
      const fallbackPayload = allocationsPayload.map(({ allocated_basic_ingredients_cost, ...rest }: any) => rest);
      const retry = await supabase.from('daily_cost_allocations').insert(fallbackPayload);
      if (retry.error) console.error('Failed to insert allocations fallback', retry.error);
    } else if (allocErr) {
      console.error('Failed to insert allocations', allocErr);
    }
  }

  // 7. Update common oil inventory and reconcile stock movements atomically without deleting ledger rows (remediating BUG-01)
  if (oilIng) {
    const { error: rpcErr } = await supabase.rpc('reconcile_daily_closing_oil_movement', {
      p_production_date: productionDate,
      p_oil_ing_id: oilIng.id,
      p_oil_used: oilUsed,
      p_leftover_oil: leftoverOil,
      p_oil_consumed_kg: oilConsumedKg,
      p_oil_unit_cost: oilUnitCost,
      p_previous_available_stock: previousAvailableStock,
      p_final_oil_stock: finalOilStock,
      p_closed_by: closedBy,
    });

    if (rpcErr) {
      console.error('Failed to reconcile daily closing oil movement:', rpcErr);
      throw new Error(`Failed to reconcile oil inventory: ${rpcErr.message}`);
    }
  }

  invalidateAdminCache('daily_closings');
  invalidateAdminCache('ingredients');
  invalidateAdminCache('admin_stock_movements');

  return {
    id: upsertedClosing.id,
    productionDate: upsertedClosing.production_date,
    oilOpeningBalance: Number(upsertedClosing.oil_opening_balance),
    oilPurchases: Number(upsertedClosing.oil_purchases),
    oilClosingBalance: Number(upsertedClosing.oil_closing_balance),
    oilConsumed: Number(upsertedClosing.oil_consumed),
    totalOilUsedKg: oilUsed,
    oilLeftoverKg: leftoverOil,
    oilCostPerKg: Number(upsertedClosing.oil_cost_per_kg),
    oilTotalExpense: Number(upsertedClosing.oil_total_expense),
    productionWages: Number(upsertedClosing.production_wages),
    totalSharedExpense: Number(upsertedClosing.total_shared_expense),
    totalProductionKg: Number(upsertedClosing.total_production_kg),
    status: upsertedClosing.status,
    notes: upsertedClosing.notes || '',
    closedBy: upsertedClosing.closed_by || 'Admin',
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

export async function adjustPackagingItemStock(
  id: string,
  delta: number,
  reason: string = 'Stock adjustment'
): Promise<PackagingItem> {
  const { data: item, error: fetchErr } = await supabase
    .from('packaging_items')
    .select('*, products(name)')
    .eq('id', id)
    .single();

  if (fetchErr || !item) throw new Error(fetchErr?.message || 'Packaging item not found');

  const prevStock = Number(item.current_stock) || 0;
  const newStock = Math.max(0, prevStock + delta);

  const { data, error } = await supabase
    .from('packaging_items')
    .update({
      current_stock: newStock,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('*, products(name)')
    .single();

  if (error) throw error;

  await supabase.from('stock_movements').insert({
    item_id: id,
    item_type: 'ingredient',
    item_name: `${item.products?.name || 'Product'} ${item.size_label} Cover`,
    movement_type: delta >= 0 ? 'purchase' : 'adjust',
    quantity: delta,
    unit: 'pcs',
    previous_balance: prevStock,
    new_balance: newStock,
    cost_per_unit: Number(item.unit_cost) || 0,
    reference: `COVER-${Date.now().toString().slice(-6)}`,
    operator_name: 'Admin',
    reason,
    created_at: new Date().toISOString(),
  });

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

export async function recordPacking(params: {
  packingDate: string;
  productId: string;
  productionRunId?: string;
  packagingItemId?: string;
  packetSize: string;
  packetsPacked: number;
  operatorName?: string;
  coverUnitCost?: number;
  notes?: string;
}): Promise<PackingRecord> {
  const {
    packingDate,
    productId,
    productionRunId,
    packagingItemId,
    packetSize,
    packetsPacked,
    operatorName = 'Admin',
    coverUnitCost,
    notes = '',
  } = params;

  // 1. Attempt atomic RPC execution for transaction safety
  try {
    const { data: rpcData, error: rpcErr } = await supabase.rpc('record_packing_atomic', {
      p_packing_date: packingDate,
      p_product_id: productId,
      p_packet_size: packetSize,
      p_packets_packed: packetsPacked,
      p_operator_name: operatorName,
      p_production_run_id: productionRunId || null,
      p_packaging_item_id: packagingItemId || null,
      p_cover_unit_cost: coverUnitCost ?? 0.00,
      p_notes: notes || '',
    });

    if (!rpcErr && rpcData) {
      dbCache.invalidate('admin_packing_records');
      dbCache.invalidate('admin_production_runs');
      dbCache.invalidate('admin_packet_types');
      dbCache.invalidate('admin_stock_movements');

      const { data: prod } = await supabase.from('products').select('name').eq('id', productId).single();

      return {
        id: rpcData.id,
        packingDate: rpcData.packing_date,
        productId: rpcData.product_id,
        productName: prod?.name || 'Product',
        productionRunId: rpcData.production_run_id,
        packagingItemId: rpcData.packaging_item_id,
        packetSize: rpcData.packet_size,
        packetsPacked: Number(rpcData.packets_packed),
        coversConsumed: Number(rpcData.covers_consumed),
        coverUnitCost: Number(rpcData.cover_unit_cost),
        packagingCost: Number(rpcData.packaging_cost),
        packingLabourRate: Number(rpcData.packing_labour_rate),
        packingLabourCost: Number(rpcData.packing_labour_cost),
        totalPackingCost: Number(rpcData.total_packing_cost),
        weightPackedKg: Number(rpcData.weight_packed_kg),
        operatorName: rpcData.operator_name,
        notes: rpcData.notes,
        createdAt: rpcData.created_at,
      };
    }
    if (rpcErr && rpcErr.message?.includes('Insufficient')) {
      throw new Error(rpcErr.message);
    }
    console.warn('record_packing_atomic fallback to client logic in Admin:', rpcErr);
  } catch (err: any) {
    if (err.message?.includes('Insufficient')) {
      throw err;
    }
    console.warn('record_packing_atomic error, attempting fallback:', err);
  }

  // 1. Fetch product and packaging item
  const { data: prod } = await supabase.from('products').select('name').eq('id', productId).single();
  const prodName = prod?.name || 'Product';

  let unitCost = Number(coverUnitCost) || 0;
  let labourRate = 0;
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
  } else if (packetSize) {
    const match = packetSize.match(/(\d+(?:\.\d+)?)\s*(kg|g|gm)?/i);
    if (match) {
      const val = parseFloat(match[1]);
      const unit = (match[2] || 'g').toLowerCase();
      sizeGrams = unit === 'kg' ? val * 1000 : val;
    }
  }

  if (packetSize) {
    try {
      const { data: pt } = await supabase
        .from('packet_types')
        .select('id, name, cost_per_packet, bundle_cost, bundle_quantity')
        .eq('name', packetSize)
        .limit(1)
        .maybeSingle();
      if (pt) {
        const ptUnitCost = Number(pt.cost_per_packet) || (Number(pt.bundle_cost) / Math.max(1, Number(pt.bundle_quantity))) || 0;
        if (unitCost <= 0) {
          unitCost = ptUnitCost;
        }
        if (packetsPacked > 0) {
          const currPktStock = Math.max(0, Number(pt.bundle_quantity ?? 0));
          const newPktStock = Math.max(0, currPktStock - packetsPacked);
          const preservedUnitCost = Number(pt.cost_per_packet) || unitCost;
          const newBundleCost = roundCurrency(newPktStock * preservedUnitCost);

          await supabase
            .from('packet_types')
            .update({
              bundle_quantity: newPktStock,
              bundle_cost: newBundleCost,
              updated_at: new Date().toISOString(),
            })
            .eq('id', pt.id);

          if (!packagingItemId) {
            await supabase.from('stock_movements').insert({
              item_id: pt.id,
              item_type: 'ingredient',
              item_name: pt.name,
              movement_type: 'production_consumption',
              quantity: -packetsPacked,
              unit: 'pcs',
              previous_balance: currPktStock,
              new_balance: newPktStock,
              cost_per_unit: unitCost,
              reference: productionRunId || `Packing ${packingDate}`,
              operator_name: operatorName,
              reason: `Packaging covers consumed for ${packetsPacked} packets (${prodName})`,
              created_at: new Date().toISOString(),
            });
          }
        }
      }
    } catch (e) {
      console.warn('Could not query or update packet_types for', packetSize, e);
    }
  }

  const packagingCost = roundCurrency(packetsPacked * unitCost);
  const packingLabourCost = 0;
  const totalPackingCost = packagingCost;
  const weightPackedKg = roundStock((packetsPacked * sizeGrams) / 1000.0);

  const { data: created, error } = await supabase
    .from('packing_records')
    .insert({
      packing_date: packingDate,
      product_id: productId,
      production_run_id: productionRunId || null,
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

  dbCache.invalidate('admin_packing_records');
  dbCache.invalidate('admin_production_runs');
  dbCache.invalidate('admin_packet_types');
  dbCache.invalidate('admin_stock_movements');

  return {
    id: created.id,
    packingDate: created.packing_date,
    productId: created.product_id,
    productName: created.products?.name || prodName,
    productionRunId: created.production_run_id,
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

export async function deletePackingRecord(id: string, operatorName = 'Admin'): Promise<void> {
  dbCache.invalidate('admin_packing_records');
  dbCache.invalidate('admin_production_runs');
  dbCache.invalidate('admin_packet_types');
  dbCache.invalidate('admin_stock_movements');

  try {
    const { data: rpcData, error: rpcErr } = await supabase.rpc('delete_packing_atomic', {
      p_packing_id: id,
      p_operator_name: operatorName,
    });
    if (!rpcErr && rpcData) return;
    if (rpcErr) console.warn('delete_packing_atomic RPC failed, fallback to client logic:', rpcErr);
  } catch (err) {
    console.warn('delete_packing_atomic RPC error:', err);
  }

  // Fallback
  const { data: rec } = await supabase.from('packing_records').select('*').eq('id', id).maybeSingle();
  if (rec && rec.packet_size && Number(rec.packets_packed) > 0) {
    const { data: pt } = await supabase.from('packet_types').select('*').eq('name', rec.packet_size).maybeSingle();
    if (pt) {
      const restored = Number(rec.packets_packed);
      const currStock = Number(pt.bundle_quantity ?? 0);
      const newStock = currStock + restored;
      const unitCost = Number(pt.cost_per_packet) || Number(rec.cover_unit_cost) || 0;
      await supabase.from('packet_types').update({
        bundle_quantity: newStock,
        bundle_cost: Number((newStock * unitCost).toFixed(2)),
        updated_at: new Date().toISOString(),
      }).eq('id', pt.id);

      await supabase.from('stock_movements').insert({
        item_id: pt.id,
        item_type: 'ingredient',
        item_name: pt.name,
        movement_type: 'packing_reversal',
        quantity: restored,
        unit: 'pcs',
        previous_balance: currStock,
        new_balance: newStock,
        cost_per_unit: unitCost,
        reference: rec.production_run_id || `Packing ${rec.packing_date}`,
        operator_name: operatorName,
        reason: `Reversal of deleted packing record (${restored} covers restored)`,
        created_at: new Date().toISOString(),
      });
    }
  }

  await supabase.from('packing_records').delete().eq('id', id);
}

export async function deletePackingRecordsForRun(runId: string, runNumber?: string, operatorName = 'Admin'): Promise<void> {
  dbCache.invalidate('admin_packing_records');
  dbCache.invalidate('admin_production_runs');
  dbCache.invalidate('admin_packet_types');
  dbCache.invalidate('admin_stock_movements');

  try {
    const { data: rpcData, error: rpcErr } = await supabase.rpc('delete_packing_for_run_atomic', {
      p_run_id: runId,
      p_run_number: runNumber || null,
      p_operator_name: operatorName,
    });
    if (!rpcErr && rpcData) return;
  } catch (err) {
    console.warn('delete_packing_for_run_atomic error:', err);
  }

  // Fallback: delete individually
  const { data: records } = await supabase
    .from('packing_records')
    .select('id')
    .eq('production_run_id', runId);
  for (const r of (records || [])) {
    await deletePackingRecord(r.id, operatorName);
  }
}

export async function fetchPackingRecords(options?: { productId?: string; date?: string; limit?: number }, force = false): Promise<PackingRecord[]> {
  const cacheKey = `admin_packing_records_${options?.productId || 'all'}_${options?.date || 'all'}_${options?.limit || 0}`;
  return dbCache.wrap(cacheKey, async () => {
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
      productionRunId: row.production_run_id,
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
  }, { ttl: dbCache.TTL.PACKING_RECORDS, force });
}

// ============================================================================
// DAILY WAGES
// ============================================================================

export async function fetchDailyWages(limit = 60, force = false): Promise<any[]> {
  return dbCache.wrap(`admin_daily_wages_${limit}`, async () => {
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
  }, { ttl: dbCache.TTL.DAILY_WAGES, force });
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

  dbCache.invalidate('admin_daily_wages');

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
    .neq('status', 'cancelled')
    .gt('actual_quantity', 0);

  if (error) return 0;
  return (data || []).reduce((sum: number, r: any) => sum + (Number(r.actual_quantity) || 0), 0);
}

// ============================================================================
// PRODUCT SELLING PRICES
// ============================================================================

export async function fetchProductSellingPrices(force = false): Promise<any[]> {
  return dbCache.wrap('admin_selling_prices', async () => {
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
  }, { ttl: dbCache.TTL.SELLING_PRICES, force });
}

export async function saveProductSellingPrice(productId: string, pricePerKg: number): Promise<any> {
  dbCache.invalidate('admin_selling_prices');

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
  const validPurchases = purchases.filter((p) => p.amount > 0);
  if (validPurchases.length === 0) return;

  const payload = validPurchases.map((p) => ({
    ingredient_id: p.ingredientId,
    amount: p.amount,
    cost_per_unit: p.costPerUnit,
  }));

  const { error } = await supabase.rpc('bulk_purchase_ingredients_atomic', {
    p_purchases: payload,
    p_operator_name: 'Admin',
  });

  if (error) {
    console.error('Error in atomic bulk purchase:', error);
    throw new Error(error.message || 'Failed to complete atomic bulk purchase');
  }

  dbCache.invalidate('admin_ingredients');
  dbCache.invalidate('admin_stock_movements');
}

export type AdminResetType = 'sales' | 'batches' | 'ledger' | 'stock' | 'zero_all_stocks' | 'full';

export async function resetAllStocksToZero(): Promise<{ success: boolean; message: string }> {
  try {
    const now = new Date().toISOString();
    const zeroFilter = '00000000-0000-0000-0000-000000000000';
    const { error: pErr } = await supabase.from('products').update({ current_stock: 0, updated_at: now }).neq('id', zeroFilter);
    if (pErr) throw pErr;
    const { error: iErr } = await supabase.from('ingredients').update({ current_stock: 0, updated_at: now }).neq('id', zeroFilter);
    if (iErr) throw iErr;
    const { error: packErr } = await supabase.from('packaging_items').update({ current_stock: 0, updated_at: now }).neq('id', zeroFilter);
    if (packErr) throw packErr;
    const { error: ptErr } = await supabase.from('packet_types').update({ bundle_quantity: 0, bundle_cost: 0, updated_at: now }).neq('id', zeroFilter);
    if (ptErr) throw ptErr;
    invalidateAdminCache();
    return { success: true, message: 'All stocks have been reset to zero successfully.' };
  } catch (err: any) {
    return { success: false, message: err?.message || 'Failed to reset stocks to zero.' };
  }
}

async function restorePacketsFromPackingRecords(): Promise<void> {
  const { data: allPackingRecs } = await supabase
    .from('packing_records')
    .select('packet_size, packets_packed, covers_consumed, packaging_item_id');

  if (!allPackingRecs || allPackingRecs.length === 0) return;

  const pktRestoreMap = new Map<string, number>();
  const packItemRestoreMap = new Map<string, number>();
  for (const rec of allPackingRecs) {
    if (rec.packet_size && Number(rec.packets_packed) > 0) {
      const key = rec.packet_size.trim().toLowerCase();
      pktRestoreMap.set(key, (pktRestoreMap.get(key) || 0) + Number(rec.packets_packed));
    }
    if (rec.packaging_item_id && Number(rec.packets_packed) > 0) {
      const covers = Number(rec.covers_consumed) || Number(rec.packets_packed);
      packItemRestoreMap.set(
        rec.packaging_item_id,
        (packItemRestoreMap.get(rec.packaging_item_id) || 0) + covers
      );
    }
  }

  if (pktRestoreMap.size > 0) {
    const { data: packetTypes } = await supabase.from('packet_types').select('id, name, bundle_quantity, cost_per_packet');
    for (const pt of packetTypes || []) {
      const restoreQty = pktRestoreMap.get((pt.name || '').trim().toLowerCase());
      if (restoreQty && restoreQty > 0) {
        const newQty = Math.max(0, Number(pt.bundle_quantity ?? 0)) + restoreQty;
        const unitCost = Number(pt.cost_per_packet) || 0;
        await supabase
          .from('packet_types')
          .update({
            bundle_quantity: newQty,
            bundle_cost: Number((newQty * unitCost).toFixed(2)),
            updated_at: new Date().toISOString(),
          })
          .eq('id', pt.id);
      }
    }
  }

  for (const [packItemId, restoreCovers] of packItemRestoreMap.entries()) {
    const { data: pi } = await supabase
      .from('packaging_items')
      .select('current_stock')
      .eq('id', packItemId)
      .maybeSingle();
    if (pi) {
      const newStock = Math.max(0, Number(pi.current_stock ?? 0)) + restoreCovers;
      await supabase
        .from('packaging_items')
        .update({ current_stock: newStock, updated_at: new Date().toISOString() })
        .eq('id', packItemId);
    }
  }
}

export async function executeAdminReset(
  resetType: AdminResetType,
  adminPin: string
): Promise<{ success: boolean; details?: Record<string, any> }> {
  const cleanPin = adminPin.trim();
  const sessionToken =
    activeAdminSessionToken ||
    (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('epso_admin_session') || '' : '');

  // 1. Prefer authoritative server-side atomic RPC (migration 020)
  const { data: rpcData, error: rpcErr } = await supabase.rpc('admin_reset_data', {
    p_reset_type: resetType,
    p_session_token: sessionToken || null,
    p_admin_pin: cleanPin,
  });

  if (!rpcErr) {
    if (rpcData && rpcData.success === true) {
      invalidateAdminCache();
      return { success: true, details: rpcData };
    }
    throw new Error(rpcData?.error || 'റീസെറ്റ് പരാജയപ്പെട്ടു (Reset failed)');
  }

  const isMissingRpc =
    rpcErr.code === 'PGRST202' ||
    rpcErr.code === '42883' ||
    Boolean(rpcErr.message?.includes('Could not find the function')) ||
    Boolean(rpcErr.message?.match(/function\s+(public\.)?admin_reset_data.*does not exist/i));

  if (!isMissingRpc) {
    throw new Error(rpcErr.message || 'Database reset error');
  }

  const writeResetAuditLog = async (type: AdminResetType, timestamp: string) => {
    try {
      await supabase.from('audit_logs').insert([
        {
          actor: 'Super Admin',
          action: `RESET_${type.toUpperCase()}`,
          entity_type: 'SYSTEM',
          entity_id: 'MAINTENANCE',
          details: { type, executed_at: timestamp },
        },
      ]);
    } catch (logErr) {
      console.warn('Audit log write error (non-fatal):', logErr);
    }
  };

  // 2. Fallback when migration 020 RPC has not yet been applied
  const pinRes = await verifyAdminPin(cleanPin);
  if (!pinRes.success) {
    throw new Error(pinRes.error || 'നൽകിയ അഡ്മിൻ പിൻ തെറ്റാണ്! (Invalid Admin PIN)');
  }
  if (pinRes.session_token && typeof sessionStorage !== 'undefined') {
    sessionStorage.setItem('epso_admin_session', pinRes.session_token);
    setAdminSessionHeader(pinRes.session_token);
  }

  const zeroFilter = '00000000-0000-0000-0000-000000000000';
  const now = new Date().toISOString();

  if (resetType === 'sales') {
    const { error } = await supabase.from('sales').delete().neq('id', zeroFilter);
    if (error) throw error;
  } else if (resetType === 'batches') {
    const { data: allRuns } = await supabase
      .from('production_runs')
      .select(`
        id,
        status,
        actual_quantity,
        product_id,
        production_consumption (
          ingredient_id,
          actual_quantity,
          unit
        )
      `);

    const { data: ingRows } = await supabase.from('ingredients').select('id, unit, current_stock');
    const ingUnitMap = new Map<string, string>();
    const ingStockMap = new Map<string, number>();
    for (const ing of ingRows || []) {
      ingUnitMap.set(ing.id, (ing.unit || 'kg').trim().toLowerCase());
      ingStockMap.set(ing.id, Number(ing.current_stock) || 0);
    }

    if (allRuns && allRuns.length > 0) {
      const prodDeductMap = new Map<string, number>();
      const ingRestoreMap = new Map<string, number>();

      for (const run of allRuns) {
        if (run.status === 'cancelled') continue;
        if (run.product_id && Number(run.actual_quantity) > 0) {
          prodDeductMap.set(run.product_id, (prodDeductMap.get(run.product_id) || 0) + Number(run.actual_quantity));
        }
        if (Array.isArray(run.production_consumption)) {
          for (const pc of run.production_consumption as any[]) {
            if (pc.ingredient_id && Number(pc.actual_quantity) > 0) {
              const pcUnit = (pc.unit || '').trim().toLowerCase();
              const targetUnit = ingUnitMap.get(pc.ingredient_id) || 'kg';
              const normalizedQty =
                ['g', 'ml', 'gm', 'gram', 'grams'].includes(pcUnit) &&
                ['kg', 'l', 'liter', 'litre'].includes(targetUnit)
                  ? Number(pc.actual_quantity) / 1000
                  : Number(pc.actual_quantity);
              ingRestoreMap.set(pc.ingredient_id, (ingRestoreMap.get(pc.ingredient_id) || 0) + normalizedQty);
            }
          }
        }
      }

      for (const [pId, qty] of prodDeductMap.entries()) {
        const { data: prod } = await supabase.from('products').select('current_stock').eq('id', pId).maybeSingle();
        if (prod) {
          const newStock = Math.max(0, Number(((Number(prod.current_stock) || 0) - qty).toFixed(3)));
          await supabase.from('products').update({ current_stock: newStock, updated_at: now }).eq('id', pId);
        }
      }

      for (const [iId, qty] of ingRestoreMap.entries()) {
        const base = ingStockMap.get(iId) ?? 0;
        const newStock = Number((base + qty).toFixed(3));
        ingStockMap.set(iId, newStock);
        await supabase.from('ingredients').update({ current_stock: newStock, updated_at: now }).eq('id', iId);
      }
    }

    await restorePacketsFromPackingRecords();

    const { error: pkrErr } = await supabase.from('packing_records').delete().neq('id', zeroFilter);
    if (pkrErr) throw pkrErr;
    const { error: pcErr } = await supabase.from('production_consumption').delete().neq('id', zeroFilter);
    if (pcErr) throw pcErr;
    const { error: prErr } = await supabase.from('production_runs').delete().neq('id', zeroFilter);
    if (prErr) throw prErr;
    const { error: dcaErr } = await supabase.from('daily_cost_allocations').delete().neq('id', zeroFilter);
    if (dcaErr) throw dcaErr;
    const { error: dcErr } = await supabase.from('daily_closings').delete().neq('id', zeroFilter);
    if (dcErr) throw dcErr;

    await supabase
      .from('stock_movements')
      .delete()
      .or(
        'movement_type.in.(production_consumption,production_output,packing_reversal,cancellation_reversal,packing_deduction),reference.ilike.Daily Closing%,reference.ilike.Run %,reference.ilike.Del Run %,reference.ilike.Reversal of %,reference.ilike.Packing %,reason.ilike.Daily basic ingredient usage%'
      );

    const { count: remainingBatchMovements } = await supabase
      .from('stock_movements')
      .select('id', { count: 'exact', head: true })
      .or(
        'movement_type.in.(production_consumption,production_output,packing_reversal,cancellation_reversal,packing_deduction),reference.ilike.Daily Closing%,reference.ilike.Run %,reference.ilike.Del Run %,reference.ilike.Reversal of %,reference.ilike.Packing %,reason.ilike.Daily basic ingredient usage%'
      );

    if ((remainingBatchMovements || 0) > 0) {
      await writeResetAuditLog(resetType, now);
      invalidateAdminCache();
      throw new Error(
        'ബാച്ചുകളും ക്ലോസിംഗും ക്ലിയർ ചെയ്തു, എന്നാൽ സ്റ്റോക്ക് ലെഡ്ജറിലെ ബാച്ച്/ബേസിക് ലോഗുകൾ നീക്കം ചെയ്യാൻ Supabase Migration 020 (admin_reset_data) അപ്ലൈ ചെയ്യുക. (Apply 020_admin_reset_data_rpc.sql in Supabase SQL Editor)'
      );
    }
  } else if (resetType === 'ledger') {
    const { error: dwErr } = await supabase.from('daily_wages').delete().neq('id', zeroFilter);
    if (dwErr) throw dwErr;
    await supabase.from('stock_movements').delete().neq('id', zeroFilter);
    const { count } = await supabase.from('stock_movements').select('id', { count: 'exact', head: true });
    if ((count || 0) > 0) {
      throw new Error(
        'സ്റ്റോക്ക് ലെഡ്ജർ ക്ലിയർ ചെയ്യാൻ Supabase Migration 020/021 (admin_reset_data) റൺ ചെയ്യേണ്ടതുണ്ട്. (RLS blocks direct DELETE on stock_movements — apply migration 021_clear_ledger_includes_wages.sql)'
      );
    }
  } else if (resetType === 'stock') {
    const { data: ingRows, error: fetchErr } = await supabase.from('ingredients').select('id, category');
    if (fetchErr) throw fetchErr;
    for (const ing of ingRows || []) {
      const baseline = ing.category === 'basic' ? 50 : 20;
      const { error } = await supabase.from('ingredients').update({ current_stock: baseline, updated_at: now }).eq('id', ing.id);
      if (error) throw error;
    }
  } else if (resetType === 'zero_all_stocks') {
    const res = await resetAllStocksToZero();
    if (!res.success) throw new Error(res.message);
  } else if (resetType === 'full') {
    await restorePacketsFromPackingRecords();

    const { error: sErr } = await supabase.from('sales').delete().neq('id', zeroFilter);
    if (sErr) throw sErr;
    const { error: pkrErr } = await supabase.from('packing_records').delete().neq('id', zeroFilter);
    if (pkrErr) throw pkrErr;
    const { error: pcErr } = await supabase.from('production_consumption').delete().neq('id', zeroFilter);
    if (pcErr) throw pcErr;
    const { error: prErr } = await supabase.from('production_runs').delete().neq('id', zeroFilter);
    if (prErr) throw prErr;
    const { error: dcaErr } = await supabase.from('daily_cost_allocations').delete().neq('id', zeroFilter);
    if (dcaErr) throw dcaErr;
    const { error: dcErr } = await supabase.from('daily_closings').delete().neq('id', zeroFilter);
    if (dcErr) throw dcErr;
    const { error: dwErr } = await supabase.from('daily_wages').delete().neq('id', zeroFilter);
    if (dwErr) throw dwErr;

    await supabase.from('stock_movements').delete().neq('id', zeroFilter);

    const { error: pZeroErr } = await supabase
      .from('products')
      .update({ current_stock: 0, avg_cost_per_unit: 0, updated_at: now })
      .neq('id', zeroFilter);
    if (pZeroErr) throw pZeroErr;

    const { data: ingRows } = await supabase.from('ingredients').select('id, category');
    for (const ing of ingRows || []) {
      const baseline = ing.category === 'basic' ? 50 : 20;
      await supabase.from('ingredients').update({ current_stock: baseline, updated_at: now }).eq('id', ing.id);
    }

    const { count } = await supabase.from('stock_movements').select('id', { count: 'exact', head: true });
    if ((count || 0) > 0) {
      await writeResetAuditLog(resetType, now);
      invalidateAdminCache();
      throw new Error(
        'സെയിൽസും ബാച്ചുകളും ക്ലിയർ ചെയ്തു, എന്നാൽ സ്റ്റോക്ക് ലെഡ്ജർ ക്ലിയർ ചെയ്യാൻ Supabase Migration 020 (admin_reset_data) അപ്ലൈ ചെയ്യുക. (Apply 020_admin_reset_data_rpc.sql in Supabase SQL Editor)'
      );
    }
  }

  await writeResetAuditLog(resetType, now);

  invalidateAdminCache();
  return { success: true };
}


