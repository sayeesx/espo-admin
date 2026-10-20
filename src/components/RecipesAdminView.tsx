import React, { useState } from 'react';
import { Recipe, Product, Ingredient, RecipeItem } from '../types';
import {
  FiPlus,
  FiTrash2,
  FiEdit2,
  FiBookOpen,
  FiDollarSign,
  FiLayers,
} from 'react-icons/fi';
import { saveRecipe, deleteRecipe } from '../services/supabase';
import { ThemeSelect } from './ThemeSelect';
import { useLockBodyScroll } from '../hooks/useLockBodyScroll';

interface RecipesAdminViewProps {
  recipes: Recipe[];
  products: Product[];
  ingredients: Ingredient[];
  onRefresh: () => void;
}

export const RecipesAdminView: React.FC<RecipesAdminViewProps> = ({
  recipes,
  products,
  ingredients,
  onRefresh,
}) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRecipe, setEditingRecipe] = useState<Recipe | null>(null);

  useLockBodyScroll(modalOpen);

  // Form states
  const [productId, setProductId] = useState('');
  const [baseOutputQuantity, setBaseOutputQuantity] = useState<number | string>(10);
  const [baseOutputUnit, setBaseOutputUnit] = useState<string>('kg');
  const [instructions, setInstructions] = useState('');
  const [recipeItems, setRecipeItems] = useState<Array<{ ingredientId: string; quantity: number; unit: string }>>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const openCreateModal = () => {
    setEditingRecipe(null);
    setProductId(products[0]?.id || '');
    setBaseOutputQuantity(10);
    setBaseOutputUnit('kg');
    setInstructions('');
    setRecipeItems([
      { ingredientId: ingredients[0]?.id || '', quantity: 1, unit: ingredients[0]?.unit || 'kg' },
    ]);
    setModalOpen(true);
  };

  const openEditModal = (r: Recipe) => {
    setEditingRecipe(r);
    setProductId(r.productId);
    setBaseOutputQuantity(r.baseOutputQuantity);
    setBaseOutputUnit(r.baseOutputUnit);
    setInstructions(r.instructions || '');
    setRecipeItems(
      r.items.map((it) => ({
        ingredientId: it.ingredientId,
        quantity: it.quantity,
        unit: it.unit,
      }))
    );
    setModalOpen(true);
  };

  const handleAddItemRow = () => {
    setRecipeItems([
      ...recipeItems,
      { ingredientId: ingredients[0]?.id || '', quantity: 1, unit: ingredients[0]?.unit || 'kg' },
    ]);
  };

  const handleRemoveItemRow = (idx: number) => {
    setRecipeItems(recipeItems.filter((_, i) => i !== idx));
  };

  const handleItemChange = (idx: number, field: string, value: any) => {
    const updated = [...recipeItems];
    if (field === 'ingredientId') {
      const found = ingredients.find((i) => i.id === value);
      updated[idx] = {
        ...updated[idx],
        ingredientId: value,
        unit: found?.unit || updated[idx].unit,
      };
    } else {
      updated[idx] = { ...updated[idx], [field]: value };
    }
    setRecipeItems(updated);
  };

  const calculateTotalBatchCost = () => {
    return recipeItems.reduce((acc, row) => {
      const ing = ingredients.find((i) => i.id === row.ingredientId);
      const unitCost = ing?.avgCostPerUnit || 0;
      return acc + (row.quantity * unitCost);
    }, 0);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!productId) {
      alert('ഉൽപ്പന്നം തിരഞ്ഞെടുക്കുക');
      return;
    }
    if (recipeItems.length === 0) {
      alert('കുറഞ്ഞത് ഒരു ചേരുവയെങ്കിലും ചേർക്കുക');
      return;
    }

    setIsSubmitting(true);
    try {
      await saveRecipe(
        {
          id: editingRecipe?.id,
          productId,
          baseOutputQuantity: Number(baseOutputQuantity) || 1,
          baseOutputUnit,
          instructions,
        },
        recipeItems.map((item) => ({
          ...item,
          quantity: Number(item.quantity) || 0,
        }))
      );
      setModalOpen(false);
      onRefresh();
    } catch (err: any) {
      alert(`പാചകക്കുറിപ്പ് സംരക്ഷിക്കുന്നതിൽ പിഴവ്: ${err?.message || 'Error saving recipe'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (r: Recipe) => {
    if (!window.confirm(`"${r.productName}" ന്റെ പാചകക്കുറിപ്പ് നീക്കം ചെയ്യണോ?`)) return;
    try {
      await deleteRecipe(r.id);
      onRefresh();
    } catch (err: any) {
      alert(`ഡിലീറ്റ് പരാജയപ്പെട്ടു: ${err?.message || 'Error deleting recipe'}`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-end gap-3 pb-2 border-b border-stone-200 dark:border-[#2E2828]">
        <button
          onClick={openCreateModal}
          className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-epso-red hover:bg-epso-red-hover dark:bg-amber-500 dark:hover:bg-amber-600 text-white dark:text-stone-950 font-bold text-xs shadow-sm press-apple transition-colors"
        >
          <FiPlus className="w-4 h-4" />
          <span>New Recipe</span>
        </button>
      </div>

      {/* Recipes Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {recipes.map((r) => {
          const batchCost = r.items.reduce((acc, it) => acc + (it.cost || 0), 0);
          const costPerUnit = r.baseOutputQuantity > 0 ? batchCost / r.baseOutputQuantity : 0;

          return (
            <div
              key={r.id}
              className="p-5 rounded-2xl bg-white dark:bg-[#1E1B1B] border border-stone-200 dark:border-[#2E2828] shadow-apple-card dark:shadow-apple-card-dark flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div>
                    <h3 className="text-base font-bold text-stone-900 dark:text-white font-malayalam">
                      {r.productName}
                    </h3>
                    <span className="text-xs text-stone-500 dark:text-stone-400 font-malayalam">
                      ബാച്ച് ഔട്ട്പുട്ട്: {r.baseOutputQuantity} {r.baseOutputUnit}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-bold text-stone-900 dark:text-white flex items-center justify-end">
                      ₹{batchCost.toFixed(1)} / ബാച്ച്
                    </span>
                    <span className="text-[10px] text-stone-400 dark:text-stone-500 block">
                      (₹{costPerUnit.toFixed(1)} / {r.baseOutputUnit})
                    </span>
                  </div>
                </div>

                {/* Items List */}
                <div className="p-3 bg-stone-50 dark:bg-[#141212] rounded-xl border border-stone-100 dark:border-[#282323] my-3">
                  <span className="text-[11px] font-bold text-stone-500 dark:text-stone-400 font-malayalam block mb-1.5">
                    ചേരുവകൾ ({r.items.length} എണ്ണം):
                  </span>
                  <div className="space-y-1 text-xs divide-y divide-stone-200/50 dark:divide-[#282323]/50">
                    {r.items.map((it) => (
                      <div key={it.id} className="flex items-center justify-between py-1">
                        <span className="text-stone-800 dark:text-stone-200 font-malayalam">
                          {it.ingredientName}
                        </span>
                        <span className="font-mono font-semibold text-stone-600 dark:text-stone-400">
                          {it.quantity} {it.unit}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {r.instructions && (
                  <p className="text-xs text-stone-500 dark:text-stone-400 italic font-malayalam mb-3">
                    നിർദ്ദേശങ്ങൾ: {r.instructions}
                  </p>
                )}
              </div>

              {/* Action buttons */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-stone-100 dark:border-[#282323]">
                <button
                  onClick={() => openEditModal(r)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-stone-100 dark:bg-[#282323] text-stone-700 dark:text-stone-300 text-xs font-bold font-malayalam hover:bg-stone-200 transition-colors"
                >
                  <FiEdit2 className="w-3.5 h-3.5" />
                  <span>തിരുത്തുക (Edit)</span>
                </button>
                <button
                  onClick={() => handleDelete(r)}
                  className="p-1.5 rounded-xl text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
                  title="ഡിലീറ്റ് ചെയ്യുക"
                >
                  <FiTrash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {recipes.length === 0 && (
        <div className="py-12 text-center text-xs text-stone-400 dark:text-stone-500 font-malayalam">
          പാചകക്കുറിപ്പുകൾ ചേർത്തിട്ടില്ല (No recipes found)
        </div>
      )}

      {/* Modal: Create/Edit Recipe */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
          <div className="w-full max-w-lg bg-white dark:bg-[#1E1B1B] rounded-3xl p-6 border border-stone-200 dark:border-[#2E2828] shadow-apple-modal my-8">
            <h2 className="text-lg font-bold text-stone-900 dark:text-white font-malayalam mb-1">
              {editingRecipe ? 'പാചകക്കുറിപ്പ് തിരുത്തുക (Edit)' : 'പുതിയ പാചകക്കുറിപ്പ് (New Recipe)'}
            </h2>
            <p className="text-xs text-stone-500 dark:text-stone-400 font-malayalam mb-4">
              ഉൽപ്പന്നവും ചേരുവകളുടെ കൃത്യമായ അനുപാതവും
            </p>

            <form onSubmit={handleSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-stone-700 dark:text-stone-300 font-malayalam mb-1">
                  സ്നാക്ക് ഉൽപ്പന്നം (Product) *
                </label>
                <select
                  value={productId}
                  onChange={(e) => setProductId(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-stone-200 dark:border-[#2E2828] bg-stone-50 dark:bg-[#141212] text-stone-900 dark:text-white focus:outline-none font-malayalam"
                >
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.unit})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-stone-700 dark:text-stone-300 font-malayalam mb-1">
                    ഔട്ട്പുട്ട് അളവ് (Base Output Qty)
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0.1"
                    required
                    value={baseOutputQuantity}
                    onChange={(e) => setBaseOutputQuantity(e.target.value === '' ? '' : parseFloat(e.target.value))}
                    onFocus={(e) => e.target.select()}
                    className="w-full p-2.5 rounded-xl border border-stone-200 dark:border-[#2E2828] bg-stone-50 dark:bg-[#141212] text-stone-900 dark:text-white focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-bold text-stone-700 dark:text-stone-300 font-malayalam mb-1">
                    ഔട്ട്പുട്ട് യൂണിറ്റ് (Unit)
                  </label>
                  <ThemeSelect
                    value={baseOutputUnit}
                    onChange={(val) => setBaseOutputUnit(val)}
                    options={[
                      { value: 'kg', label: 'kg (കിലോഗ്രാം)' },
                      { value: 'packs', label: 'packs (പാക്കറ്റുകൾ)' },
                      { value: 'pcs', label: 'pcs (എണ്ണം)' },
                      { value: 'g', label: 'g (ഗ്രാം)' },
                      { value: 'L', label: 'L (ലിറ്റർ)' },
                    ]}
                  />
                </div>
              </div>

              {/* Recipe Items Section */}
              <div className="p-3.5 rounded-2xl bg-stone-50 dark:bg-[#141212] border border-stone-200 dark:border-[#2E2828]">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-stone-900 dark:text-white font-malayalam">
                    ചേരുവകളുടെ ലിസ്റ്റ് (Ingredients)
                  </span>
                  <button
                    type="button"
                    onClick={handleAddItemRow}
                    className="flex items-center gap-1 text-[11px] text-epso-red dark:text-amber-400 font-bold hover:underline cursor-pointer"
                  >
                    <FiPlus className="w-3.5 h-3.5" />
                    <span>ചേരുവ ചേർക്കുക</span>
                  </button>
                </div>

                <div className="space-y-2">
                  {recipeItems.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <select
                        value={item.ingredientId}
                        onChange={(e) => handleItemChange(idx, 'ingredientId', e.target.value)}
                        className="flex-1 p-2 rounded-xl border border-stone-200 dark:border-[#2E2828] bg-white dark:bg-[#1E1B1B] text-stone-900 dark:text-white focus:outline-none font-malayalam text-xs"
                      >
                        {ingredients.map((ing) => (
                          <option key={ing.id} value={ing.id}>
                            {ing.name} ({ing.unit})
                          </option>
                        ))}
                      </select>

                      <input
                        type="number"
                        step="any"
                        min="0.001"
                        placeholder="അളവ്"
                        value={item.quantity === 0 ? '' : item.quantity}
                        onChange={(e) => handleItemChange(idx, 'quantity', e.target.value === '' ? 0 : parseFloat(e.target.value))}
                        onFocus={(e) => e.target.select()}
                        className="w-20 p-2 rounded-xl border border-stone-200 dark:border-[#2E2828] bg-white dark:bg-[#1E1B1B] text-stone-900 dark:text-white text-xs font-mono focus:outline-none"
                      />

                      <span className="text-stone-400 text-xs w-8">{item.unit}</span>

                      {recipeItems.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveItemRow(idx)}
                          className="p-1 text-red-500 hover:text-red-700"
                        >
                          <FiTrash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                {/* Real-time batch cost estimate */}
                <div className="mt-3 pt-2 border-t border-stone-200 dark:border-[#2E2828] flex items-center justify-between text-xs">
                  <span className="text-stone-500 dark:text-stone-400 font-malayalam">
                    ഏകദേശ ബാച്ച് ചെലവ് (Est. Batch Cost):
                  </span>
                  <span className="font-extrabold text-stone-900 dark:text-white">
                    ₹{calculateTotalBatchCost().toFixed(2)}
                  </span>
                </div>
              </div>

              <div>
                <label className="block font-bold text-stone-700 dark:text-stone-300 font-malayalam mb-1">
                  നിർമ്മാണ നിർദ്ദേശങ്ങൾ (Instructions)
                </label>
                <textarea
                  rows={2}
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  placeholder="ഉദാ: ചേരുവകൾ കൃത്യമായി ഇളക്കി ചേർക്കുക..."
                  className="w-full p-2.5 rounded-xl border border-stone-200 dark:border-[#2E2828] bg-stone-50 dark:bg-[#141212] text-stone-900 dark:text-white focus:outline-none font-malayalam"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-stone-100 dark:border-[#2E2828]">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-[#282323] font-bold font-malayalam"
                >
                  റദ്ദാക്കുക (Cancel)
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-xl bg-epso-red hover:bg-epso-red-hover dark:bg-amber-500 dark:hover:bg-amber-600 text-white dark:text-stone-950 font-bold shadow-sm press-apple font-malayalam"
                >
                  {isSubmitting ? 'സൂക്ഷിക്കുന്നു...' : 'സൂക്ഷിക്കുക (Save)'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
