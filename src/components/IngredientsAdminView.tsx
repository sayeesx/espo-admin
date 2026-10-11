import React, { useState } from 'react';
import { Ingredient, IngredientCategory, UnitType } from '../types';
import {
  FiPlus,
  FiSearch,
  FiEdit2,
  FiTrash2,
  FiAlertTriangle,
  FiRepeat,
  FiCheckCircle,
  FiXCircle,
  FiDollarSign,
  FiLayers,
} from 'react-icons/fi';
import {
  saveIngredient,
  deleteIngredient,
  adjustIngredientStock,
} from '../services/supabase';

interface IngredientsAdminViewProps {
  ingredients: Ingredient[];
  onRefresh: () => void;
}

export const IngredientsAdminView: React.FC<IngredientsAdminViewProps> = ({
  ingredients,
  onRefresh,
}) => {
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState<'all' | 'basic' | 'other' | 'low_stock'>('all');

  // Modals
  const [formModalOpen, setFormModalOpen] = useState(false);
  const [adjustModalOpen, setAdjustModalOpen] = useState(false);
  const [selectedIngredient, setSelectedIngredient] = useState<Ingredient | null>(null);

  // Form states
  const [name, setName] = useState('');
  const [category, setCategory] = useState<IngredientCategory>('basic');
  const [unit, setUnit] = useState<UnitType>('kg');
  const [currentStock, setCurrentStock] = useState<number>(0);
  const [minStock, setMinStock] = useState<number>(0);
  const [avgCostPerUnit, setAvgCostPerUnit] = useState<number>(0);
  const [notes, setNotes] = useState('');
  const [isActive, setIsActive] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Stock Adjust states
  const [adjustDelta, setAdjustDelta] = useState<number>(0);
  const [adjustReason, setAdjustReason] = useState<string>('പുതിയ പർച്ചേസ് (Purchase Inward)');
  const [adjustIsAdd, setAdjustIsAdd] = useState<boolean>(true);

  const openCreateModal = () => {
    setSelectedIngredient(null);
    setName('');
    setCategory('basic');
    setUnit('kg');
    setCurrentStock(0);
    setMinStock(5);
    setAvgCostPerUnit(0);
    setNotes('');
    setIsActive(true);
    setFormModalOpen(true);
  };

  const openEditModal = (ing: Ingredient) => {
    setSelectedIngredient(ing);
    setName(ing.name);
    setCategory(ing.category);
    setUnit(ing.unit);
    setCurrentStock(ing.currentStock);
    setMinStock(ing.minStock);
    setAvgCostPerUnit(ing.avgCostPerUnit);
    setNotes(ing.notes || '');
    setIsActive(ing.isActive);
    setFormModalOpen(true);
  };

  const openAdjustModal = (ing: Ingredient) => {
    setSelectedIngredient(ing);
    setAdjustDelta(0);
    setAdjustReason('പുതിയ പർച്ചേസ് (Purchase Inward)');
    setAdjustIsAdd(true);
    setAdjustModalOpen(true);
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsSubmitting(true);
    try {
      await saveIngredient({
        id: selectedIngredient?.id,
        name: name.trim(),
        category,
        unit,
        currentStock: Number(currentStock) || 0,
        minStock: Number(minStock) || 0,
        avgCostPerUnit: Number(avgCostPerUnit) || 0,
        notes: notes.trim() || undefined,
        isActive,
      });
      setFormModalOpen(false);
      onRefresh();
    } catch (err: any) {
      alert(`ചേരുവ സൂക്ഷിക്കുന്നതിൽ പിഴവ്: ${err?.message || 'Error saving ingredient'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAdjustSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedIngredient || adjustDelta <= 0) return;

    setIsSubmitting(true);
    try {
      const delta = adjustIsAdd ? adjustDelta : -adjustDelta;
      await adjustIngredientStock(selectedIngredient.id, delta, adjustReason, 'Admin');
      setAdjustModalOpen(false);
      onRefresh();
    } catch (err: any) {
      alert(`സ്റ്റോക്ക് മാറ്റുന്നതിൽ പിഴവ്: ${err?.message || 'Error updating stock'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (ing: Ingredient) => {
    const confirmDelete = window.confirm(
      `"${ing.name}" എന്ന ചേരുവ നീക്കം ചെയ്യണോ?\nAre you sure you want to delete this ingredient?`
    );
    if (!confirmDelete) return;

    try {
      await deleteIngredient(ing.id);
      onRefresh();
    } catch (err: any) {
      alert(`ഡിലീറ്റ് പരാജയപ്പെട്ടു: ${err?.message || 'Failed to delete'}`);
    }
  };

  const filteredIngredients = ingredients.filter((ing) => {
    const matchSearch = ing.name.toLowerCase().includes(search.toLowerCase());
    if (!matchSearch) return false;

    if (filterCategory === 'basic') return ing.category === 'basic';
    if (filterCategory === 'other') return ing.category === 'other';
    if (filterCategory === 'low_stock') {
      return ing.isActive && ing.minStock > 0 && ing.currentStock <= ing.minStock;
    }
    return true;
  });

  const lowStockCount = ingredients.filter((i) => i.isActive && i.minStock > 0 && i.currentStock <= i.minStock).length;
  const basicCount = ingredients.filter((i) => i.category === 'basic').length;
  const otherCount = ingredients.filter((i) => i.category === 'other').length;

  return (
    <div className="space-y-6">
      {/* Header and Add Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-stone-200 dark:border-[#2E2828]">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-stone-900 dark:text-white tracking-tight">
            Ingredients
          </h1>
          <p className="text-xs sm:text-sm text-stone-500 dark:text-stone-400 font-malayalam mt-0.5">
            അസംസ്കൃത ചേരുവകളും സ്റ്റോക്ക് പരിധിയും
          </p>
        </div>
        <button
          onClick={openCreateModal}
          className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-epso-red hover:bg-epso-red-hover dark:bg-amber-500 dark:hover:bg-amber-600 text-white dark:text-stone-950 font-bold text-xs shadow-sm press-apple transition-colors"
        >
          <FiPlus className="w-4 h-4" />
          <span>New Ingredient</span>
        </button>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <FiSearch className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search ingredient..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-stone-200 dark:border-[#2E2828] bg-white dark:bg-[#1E1B1B] text-xs text-stone-900 dark:text-white placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-epso-red/30 dark:focus:ring-amber-500/30 transition-all font-malayalam"
          />
        </div>

        {/* English Status Tabs */}
        <div className="flex items-center gap-1.5 p-1 bg-stone-100 dark:bg-[#1E1B1B] rounded-xl border border-stone-200 dark:border-[#2E2828] overflow-x-auto">
          <button
            onClick={() => setFilterCategory('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
              filterCategory === 'all'
                ? 'bg-white dark:bg-[#282323] text-stone-900 dark:text-white shadow-sm'
                : 'text-stone-500 hover:text-stone-800 dark:text-stone-400'
            }`}
          >
            All ({ingredients.length})
          </button>
          <button
            onClick={() => setFilterCategory('basic')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
              filterCategory === 'basic'
                ? 'bg-white dark:bg-[#282323] text-stone-900 dark:text-white shadow-sm'
                : 'text-stone-500 hover:text-stone-800 dark:text-stone-400'
            }`}
          >
            Basic ({basicCount})
          </button>
          <button
            onClick={() => setFilterCategory('other')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
              filterCategory === 'other'
                ? 'bg-white dark:bg-[#282323] text-stone-900 dark:text-white shadow-sm'
                : 'text-stone-500 hover:text-stone-800 dark:text-stone-400'
            }`}
          >
            Other ({otherCount})
          </button>
          <button
            onClick={() => setFilterCategory('low_stock')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1 ${
              filterCategory === 'low_stock'
                ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 shadow-sm'
                : 'text-stone-500 hover:text-stone-800 dark:text-stone-400'
            }`}
          >
            <FiAlertTriangle className="w-3.5 h-3.5 text-amber-500" />
            <span>Low Stock ({lowStockCount})</span>
          </button>
        </div>
      </div>

      {/* Ingredients Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredIngredients.map((ing) => {
          const isLowStock = ing.isActive && ing.minStock > 0 && ing.currentStock <= ing.minStock;

          return (
            <div
              key={ing.id}
              className={`p-5 rounded-2xl bg-white dark:bg-[#1E1B1B] border transition-all shadow-apple-card dark:shadow-apple-card-dark flex flex-col justify-between ${
                isLowStock
                  ? 'border-amber-300 dark:border-amber-800/80 ring-1 ring-amber-300 dark:ring-amber-800'
                  : 'border-stone-200 dark:border-[#2E2828]'
              }`}
            >
              <div>
                {/* Header */}
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <h3 className="text-base font-bold text-stone-900 dark:text-white font-malayalam flex items-center gap-1.5">
                      <span>{ing.name}</span>
                      {isLowStock && (
                        <span title="കുറഞ്ഞ സ്റ്റോക്ക് മുന്നറിയിപ്പ്" className="text-amber-500">
                          <FiAlertTriangle className="w-4 h-4 inline" />
                        </span>
                      )}
                    </h3>
                    <span className="text-[11px] text-stone-400 dark:text-stone-500 font-malayalam">
                      {ing.category === 'basic' ? 'പ്രധാന ചേരുവ (Basic)' : 'സഹായ ചേരുവ (Other)'}
                    </span>
                  </div>

                  <span
                    className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                      ing.isActive
                        ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800'
                        : 'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-400'
                    }`}
                  >
                    {ing.isActive ? (
                      <>
                        <FiCheckCircle className="w-3 h-3 text-emerald-500" />
                        <span>Active</span>
                      </>
                    ) : (
                      <>
                        <FiXCircle className="w-3 h-3 text-stone-400" />
                        <span>Inactive</span>
                      </>
                    )}
                  </span>
                </div>

                {/* Stock Stats Box */}
                <div className="p-3 bg-stone-50 dark:bg-[#141212] rounded-xl border border-stone-100 dark:border-[#282323] space-y-2 my-3 text-xs">
                  {/* Current Stock */}
                  <div className="flex items-center justify-between">
                    <span className="text-stone-500 dark:text-stone-400 font-malayalam">
                      സ്റ്റോക്ക് (Current Stock):
                    </span>
                    <span className={`font-extrabold text-sm ${isLowStock ? 'text-amber-600 dark:text-amber-400' : 'text-stone-900 dark:text-white'}`}>
                      {ing.currentStock} {ing.unit}
                    </span>
                  </div>

                  {/* Min Stock Alert */}
                  <div className="flex items-center justify-between">
                    <span className="text-stone-500 dark:text-stone-400 font-malayalam">
                      കുറഞ്ഞ പരിധി (Min Alert):
                    </span>
                    <span className="font-semibold text-stone-600 dark:text-stone-300">
                      {ing.minStock} {ing.unit}
                    </span>
                  </div>

                  {/* Avg Cost per Unit */}
                  <div className="flex items-center justify-between pt-1 border-t border-stone-200/60 dark:border-[#282323]">
                    <span className="text-stone-500 dark:text-stone-400 font-malayalam">
                      വാങ്ങൽ നിരക്ക് (Cost / Unit):
                    </span>
                    <span className="font-bold text-stone-900 dark:text-white">
                      ₹{ing.avgCostPerUnit.toLocaleString('en-IN')} / {ing.unit}
                    </span>
                  </div>
                </div>

                {ing.notes && (
                  <p className="text-[11px] text-stone-500 dark:text-stone-400 italic mb-3 font-malayalam">
                    കുറിപ്പ്: {ing.notes}
                  </p>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 pt-2 border-t border-stone-100 dark:border-[#282323]">
                <button
                  onClick={() => openAdjustModal(ing)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-400 text-xs font-bold press-apple transition-colors border border-amber-500/30"
                >
                  <FiRepeat className="w-3.5 h-3.5" />
                  <span className="font-malayalam">സ്റ്റോക്ക് മാറ്റുക</span>
                </button>
                <button
                  onClick={() => openEditModal(ing)}
                  className="p-2 rounded-xl text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-[#282323] border border-stone-200 dark:border-[#2E2828] press-apple transition-colors"
                  title="തിരുത്തുക (Edit)"
                >
                  <FiEdit2 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => handleDelete(ing)}
                  className="p-2 rounded-xl text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 border border-transparent hover:border-red-200 dark:hover:border-red-900 press-apple transition-colors"
                  title="ഡിലീറ്റ് ചെയ്യുക"
                >
                  <FiTrash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {filteredIngredients.length === 0 && (
        <div className="py-12 text-center text-xs text-stone-400 dark:text-stone-500 font-malayalam">
          ചേരുവകൾ ഒന്നും കണ്ടെത്താനായില്ല (No ingredients found)
        </div>
      )}

      {/* Modal: Adjust Stock */}
      {adjustModalOpen && selectedIngredient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md bg-white dark:bg-[#1E1B1B] rounded-3xl p-6 border border-stone-200 dark:border-[#2E2828] shadow-apple-modal">
            <h2 className="text-lg font-bold text-stone-900 dark:text-white font-malayalam mb-1">
              സ്റ്റോക്ക് ക്രമീകരിക്കുക (Adjust Stock)
            </h2>
            <p className="text-xs text-stone-500 dark:text-stone-400 font-malayalam mb-4">
              {selectedIngredient.name} • നിലവിലെ സ്റ്റോക്ക്: {selectedIngredient.currentStock} {selectedIngredient.unit}
            </p>

            <form onSubmit={handleAdjustSubmit} className="space-y-4 text-xs">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setAdjustIsAdd(true)}
                  className={`flex-1 py-2 rounded-xl font-bold font-malayalam border ${
                    adjustIsAdd
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                      : 'bg-stone-50 dark:bg-[#141212] text-stone-600 dark:text-stone-300 border-stone-200 dark:border-[#2E2828]'
                  }`}
                >
                  + ഇൻവാർഡ് (Inward)
                </button>
                <button
                  type="button"
                  onClick={() => setAdjustIsAdd(false)}
                  className={`flex-1 py-2 rounded-xl font-bold font-malayalam border ${
                    !adjustIsAdd
                      ? 'bg-red-600 text-white border-red-600 shadow-sm'
                      : 'bg-stone-50 dark:bg-[#141212] text-stone-600 dark:text-stone-300 border-stone-200 dark:border-[#2E2828]'
                  }`}
                >
                  - ഔട്ട്‌വാർഡ് (Outward)
                </button>
              </div>

              <div>
                <label className="block font-bold text-stone-700 dark:text-stone-300 font-malayalam mb-1">
                  അളവ് ({selectedIngredient.unit}) *
                </label>
                <input
                  type="number"
                  step="any"
                  min="0.01"
                  required
                  value={adjustDelta || ''}
                  onChange={(e) => setAdjustDelta(parseFloat(e.target.value) || 0)}
                  placeholder={`0.00 ${selectedIngredient.unit}`}
                  className="w-full p-2.5 rounded-xl border border-stone-200 dark:border-[#2E2828] bg-stone-50 dark:bg-[#141212] text-sm font-bold text-stone-900 dark:text-white focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-bold text-stone-700 dark:text-stone-300 font-malayalam mb-1">
                  കാരണം (Reason) *
                </label>
                <select
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-stone-200 dark:border-[#2E2828] bg-stone-50 dark:bg-[#141212] text-stone-900 dark:text-white focus:outline-none font-malayalam"
                >
                  <option value="പുതിയ പർച്ചേസ് (Purchase Inward)">പുതിയ പർച്ചേസ് (Purchase Inward)</option>
                  <option value="കേടുപാടുകൾ / വേസ്റ്റേജ് (Damaged/Wastage)">കേടുപാടുകൾ / വേസ്റ്റേജ് (Damaged/Wastage)</option>
                  <option value="ഫിസിക്കൽ ഓഡിറ്റ് തിരുത്തൽ (Stock Audit Adjustment)">ഫിസിക്കൽ ഓഡിറ്റ് തിരുത്തൽ (Stock Audit Adjustment)</option>
                  <option value="സാമ്പിൾ നൽകിയത് (Free Sample)">സാമ്പിൾ നൽകിയത് (Free Sample)</option>
                </select>
              </div>

              <div className="p-3 rounded-xl bg-stone-50 dark:bg-[#141212] border border-stone-200 dark:border-[#2E2828] text-xs">
                <span className="text-stone-400 font-malayalam block">പുതിയ സ്റ്റോക്ക് ബാലൻസ്:</span>
                <span className="text-base font-extrabold text-stone-900 dark:text-white">
                  {Math.max(0, selectedIngredient.currentStock + (adjustIsAdd ? adjustDelta : -adjustDelta))}{' '}
                  {selectedIngredient.unit}
                </span>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-stone-100 dark:border-[#2E2828]">
                <button
                  type="button"
                  onClick={() => setAdjustModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-[#282323] font-bold font-malayalam"
                >
                  റദ്ദാക്കുക (Cancel)
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || adjustDelta <= 0}
                  className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold shadow-sm press-apple font-malayalam"
                >
                  {isSubmitting ? 'സൂക്ഷിക്കുന്നു...' : 'അപ്ഡേറ്റ് ചെയ്യുക (Update)'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Add / Edit Ingredient */}
      {formModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md bg-white dark:bg-[#1E1B1B] rounded-3xl p-6 border border-stone-200 dark:border-[#2E2828] shadow-apple-modal">
            <h2 className="text-lg font-bold text-stone-900 dark:text-white font-malayalam mb-1">
              {selectedIngredient ? 'ചേരുവ തിരുത്തുക (Edit)' : 'പുതിയ ചേരുവ (New Ingredient)'}
            </h2>
            <p className="text-xs text-stone-500 dark:text-stone-400 font-malayalam mb-4">
              അസംസ്കൃത വസ്തുക്കളുടെ വിവരങ്ങളും നിരക്കുകളും
            </p>

            <form onSubmit={handleFormSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-stone-700 dark:text-stone-300 font-malayalam mb-1">
                  ചേരുവയുടെ പേര് (Name) *
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="ഉദാ: ഓയിൽ, കറിവേപ്പില"
                  className="w-full p-2.5 rounded-xl border border-stone-200 dark:border-[#2E2828] bg-stone-50 dark:bg-[#141212] text-stone-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-epso-red/30 font-malayalam"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-stone-700 dark:text-stone-300 font-malayalam mb-1">
                    വിഭാഗം (Category)
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as IngredientCategory)}
                    className="w-full p-2.5 rounded-xl border border-stone-200 dark:border-[#2E2828] bg-stone-50 dark:bg-[#141212] text-stone-900 dark:text-white focus:outline-none font-malayalam"
                  >
                    <option value="basic">Category A (Basic)</option>
                    <option value="other">Category B (Other)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-stone-700 dark:text-stone-300 font-malayalam mb-1">
                    യൂണിറ്റ് (Unit)
                  </label>
                  <select
                    value={unit}
                    onChange={(e) => setUnit(e.target.value as UnitType)}
                    className="w-full p-2.5 rounded-xl border border-stone-200 dark:border-[#2E2828] bg-stone-50 dark:bg-[#141212] text-stone-900 dark:text-white focus:outline-none"
                  >
                    <option value="kg">Kilogram (kg)</option>
                    <option value="L">Liter (L)</option>
                    <option value="g">Gram (g)</option>
                    <option value="ml">Milliliter (ml)</option>
                    <option value="pcs">Pieces (എണ്ണം)</option>
                    <option value="packs">Packs (പാക്കറ്റ്)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-stone-700 dark:text-stone-300 font-malayalam mb-1">
                    കുറഞ്ഞ പരിധി (Min Alert)
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={minStock}
                    onChange={(e) => setMinStock(parseFloat(e.target.value) || 0)}
                    className="w-full p-2.5 rounded-xl border border-stone-200 dark:border-[#2E2828] bg-stone-50 dark:bg-[#141212] text-stone-900 dark:text-white focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-bold text-stone-700 dark:text-stone-300 font-malayalam mb-1">
                    വാങ്ങൽ നിരക്ക് (Cost / {unit})
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={avgCostPerUnit}
                    onChange={(e) => setAvgCostPerUnit(parseFloat(e.target.value) || 0)}
                    className="w-full p-2.5 rounded-xl border border-stone-200 dark:border-[#2E2828] bg-stone-50 dark:bg-[#141212] text-stone-900 dark:text-white focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-stone-700 dark:text-stone-300 font-malayalam mb-1">
                  കുറിപ്പ് (Notes / Supplier)
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="ഉദാ: സപ്ലയർ വിവരങ്ങൾ..."
                  className="w-full p-2.5 rounded-xl border border-stone-200 dark:border-[#2E2828] bg-stone-50 dark:bg-[#141212] text-stone-900 dark:text-white focus:outline-none font-malayalam"
                />
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-stone-50 dark:bg-[#141212] border border-stone-200 dark:border-[#2E2828]">
                <span className="font-bold text-stone-900 dark:text-white font-malayalam">
                  Active (സജീവം)
                </span>
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="w-5 h-5 accent-epso-red rounded cursor-pointer"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-stone-100 dark:border-[#2E2828]">
                <button
                  type="button"
                  onClick={() => setFormModalOpen(false)}
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
