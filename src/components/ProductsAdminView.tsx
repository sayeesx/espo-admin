import React, { useState, useMemo, useEffect } from 'react';
import { Product, UnitType, Ingredient, Recipe, PacketType, RecipePacket } from '../types';
import {
  FiPlus,
  FiSearch,
  FiEdit2,
  FiTrash2,
  FiPackage,
  FiDollarSign,
  FiCheckCircle,
  FiXCircle,
  FiAlertCircle,
  FiLayers,
  FiPrinter,
  FiBookOpen,
  FiX,
  FiCheck,
  FiArrowRight,
  FiArrowLeft,
} from 'react-icons/fi';
import { saveProduct, deleteProduct, saveRecipe, deleteRecipe, fetchPacketTypes } from '../services/supabase';
import { PrintPurchaseListModal } from './PrintPurchaseListModal';
import { useLockBodyScroll } from '../hooks/useLockBodyScroll';
import { createPortal } from 'react-dom';
import { ThemeSelect } from './ThemeSelect';

interface ProductsAdminViewProps {
  products: Product[];
  ingredients?: Ingredient[];
  recipes?: Recipe[];
  onRefresh: () => void;
}

export const isExcludedRecipeIngredient = (ing: { name?: string; category?: string }) => {
  const n = (ing.name || '').trim().toLowerCase();
  const c = (ing.category || '').trim().toLowerCase();

  // Basic categories and operational wages
  if (c === 'basic' || c === 'packaging' || c === 'wages') return true;

  // Basic ingredient names and operational costs
  return (
    n.includes('കൂലി') ||
    n.includes('wage') ||
    n.includes('salary') ||
    n.includes('ഓയിൽ') ||
    n.includes('oil') ||
    n.includes('സൺഫ്ലവർ') ||
    n.includes('വെളിച്ചെണ്ണ') ||
    n.includes('ഉപ്പ്') ||
    (n.includes('salt') && !n.includes('black salt')) ||
    n.includes('അണ്ടി തോട്') ||
    n.includes('തോട്') ||
    n.includes('കവർ') ||
    n.includes('cover') ||
    n.includes('പാക്കിങ്') ||
    n.includes('packing') ||
    n.includes('കറിവേപ്പില') ||
    n.includes('curry leaves') ||
    n.includes('വിറക്') ||
    n.includes('firewood')
  );
};

export const isDailySharedBasic = (name: string) => isExcludedRecipeIngredient({ name });

export const ProductsAdminView: React.FC<ProductsAdminViewProps> = ({
  products,
  ingredients = [],
  recipes = [],
  onRefresh,
}) => {
  const recipeEligibleIngredients = useMemo(
    () => ingredients.filter((ing) => ing.isActive && !isExcludedRecipeIngredient(ing)),
    [ingredients]
  );

  const [search, setSearch] = useState('');
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive'>('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [purchaseListModalOpen, setPurchaseListModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeletingProductId, setIsDeletingProductId] = useState<string | null>(null);
  const [isDeletingRecipe, setIsDeletingRecipe] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Form states
  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [unit, setUnit] = useState<UnitType>('kg');
  const [wholesalePrice, setWholesalePrice] = useState<number | string>(0);
  const [currentStock, setCurrentStock] = useState<number | string>(0);
  const [isActive, setIsActive] = useState<boolean>(true);

  // Recipe Modal States
  const [recipeModalOpen, setRecipeModalOpen] = useState(false);
  const [recipeProduct, setRecipeProduct] = useState<Product | null>(null);
  const [existingRecipe, setExistingRecipe] = useState<Recipe | null>(null);
  const [recipeBaseQuantity, setRecipeBaseQuantity] = useState<number | string>(10);
  const [recipeBaseUnit, setRecipeBaseUnit] = useState<string>('kg');
  const [recipeInstructions, setRecipeInstructions] = useState<string>('');
  const [recipeItems, setRecipeItems] = useState<Array<{ ingredientId: string; quantity: number; unit: string }>>([]);
  const [recipePackets, setRecipePackets] = useState<Array<{ packetTypeId?: string; packetName: string; costPerPacket: number; bundleCost?: number; bundleQuantity?: number }>>([]);
  const [availablePacketTypes, setAvailablePacketTypes] = useState<PacketType[]>([]);
  const [isSavingRecipe, setIsSavingRecipe] = useState(false);
  const [recipeError, setRecipeError] = useState('');
  const [recipeModalStep, setRecipeModalStep] = useState<1 | 2>(1);

  const loadPacketCatalog = async () => {
    try {
      const data = await fetchPacketTypes();
      setAvailablePacketTypes(data);
    } catch (err) {
      console.error('Failed to load packet types:', err);
    }
  };

  useEffect(() => {
    loadPacketCatalog();
  }, []);

  // Lock scroll whenever any modal is open
  useLockBodyScroll(modalOpen || purchaseListModalOpen || recipeModalOpen);

  const openCreateModal = () => {
    setEditingProduct(null);
    setName('');
    setSku(`EPSO-PRD-${Math.floor(100 + Math.random() * 900)}`);
    setUnit('kg');
    setWholesalePrice(250);
    setCurrentStock(0);
    setIsActive(true);
    setErrorMsg('');
    setModalOpen(true);
  };

  const openEditModal = (p: Product) => {
    setEditingProduct(p);
    setName(p.name);
    setSku(p.sku || '');
    setUnit(p.unit);
    setWholesalePrice(p.wholesalePrice);
    setCurrentStock(p.currentStock);
    setIsActive(p.isActive);
    setErrorMsg('');
    setModalOpen(true);
  };

  const openRecipeModal = (p: Product) => {
    setRecipeProduct(p);
    setRecipeError('');
    const rec = recipes.find((r) => r.productId === p.id);
    if (rec) {
      setExistingRecipe(rec);
      setRecipeBaseQuantity(rec.baseOutputQuantity || 10);
      setRecipeBaseUnit(rec.baseOutputUnit || p.unit || 'kg');
      setRecipeInstructions(rec.instructions || '');
      setRecipeItems(
        rec.items && rec.items.length > 0
          ? rec.items.map((it) => ({
              ingredientId: it.ingredientId,
              quantity: it.quantity,
              unit: it.unit,
            }))
          : [{ ingredientId: recipeEligibleIngredients[0]?.id || '', quantity: 1, unit: recipeEligibleIngredients[0]?.unit || 'kg' }]
      );
      setRecipePackets(
        rec.packets && rec.packets.length > 0
          ? rec.packets.map((pkt) => ({
              packetTypeId: pkt.packetTypeId,
              packetName: pkt.packetName,
              costPerPacket: pkt.costPerPacket,
              bundleCost: pkt.bundleCost,
              bundleQuantity: pkt.bundleQuantity,
            }))
          : []
      );
    } else {
      setExistingRecipe(null);
      setRecipeBaseQuantity(10);
      setRecipeBaseUnit(p.unit || 'kg');
      setRecipeInstructions('');
      setRecipeItems([
        { ingredientId: recipeEligibleIngredients[0]?.id || '', quantity: 1, unit: recipeEligibleIngredients[0]?.unit || 'kg' },
      ]);
      setRecipePackets([]);
    }
    setRecipeModalStep(1);
    setRecipeError('');
    setRecipeModalOpen(true);
  };

  const handleNextToPackets = () => {
    setRecipeError('');
    if (!recipeItems || recipeItems.length === 0) {
      setRecipeError('കുറഞ്ഞത് ഒരു ചേരുവയെങ്കിലും ചേർക്കുക (Add at least 1 ingredient)');
      return;
    }
    const hasInvalid = recipeItems.some((it) => !it.ingredientId || Number(it.quantity) <= 0);
    if (hasInvalid) {
      setRecipeError('എല്ലാ ചേരുവകളുടെയും പേരും അളവും സാധുവാണെന്ന് ഉറപ്പാക്കുക (Ensure all ingredients have a name and quantity > 0)');
      return;
    }
    setRecipeModalStep(2);
  };

  const handleAddRecipeItem = () => {
    setRecipeItems([
      ...recipeItems,
      { ingredientId: recipeEligibleIngredients[0]?.id || '', quantity: 1, unit: recipeEligibleIngredients[0]?.unit || 'kg' },
    ]);
  };

  const handleRemoveRecipeItem = (index: number) => {
    setRecipeItems(recipeItems.filter((_, i) => i !== index));
  };

  const handleRecipeItemChange = (index: number, field: string, value: any) => {
    const updated = [...recipeItems];
    if (field === 'ingredientId') {
      const found = ingredients.find((i) => i.id === value);
      updated[index] = {
        ...updated[index],
        ingredientId: value,
        unit: found?.unit || updated[index].unit,
      };
    } else {
      updated[index] = { ...updated[index], [field]: value };
    }
    setRecipeItems(updated);
  };

  // Recipe Packet Rows Handlers
  const handleAddRecipePacketRow = () => {
    const firstPkt = availablePacketTypes[0];
    setRecipePackets([
      ...recipePackets,
      {
        packetTypeId: firstPkt?.id,
        packetName: firstPkt?.name || '3kg HM Packet',
        costPerPacket: firstPkt?.costPerPacket || 0,
        bundleCost: firstPkt?.bundleCost || 0,
        bundleQuantity: firstPkt?.bundleQuantity || 100,
      },
    ]);
  };

  const handleToggleRecipePacket = (pt: PacketType) => {
    const isSelected = recipePackets.some(
      (p) => (p.packetTypeId && p.packetTypeId === pt.id) || p.packetName === pt.name
    );
    if (isSelected) {
      setRecipePackets(
        recipePackets.filter(
          (p) => !((p.packetTypeId && p.packetTypeId === pt.id) || p.packetName === pt.name)
        )
      );
    } else {
      setRecipePackets([
        ...recipePackets,
        {
          packetTypeId: pt.id,
          packetName: pt.name,
          costPerPacket: pt.costPerPacket || 0,
          bundleCost: pt.bundleCost || 0,
          bundleQuantity: pt.bundleQuantity || 100,
        },
      ]);
    }
  };

  const handleSelectAllRecipePackets = () => {
    const all = availablePacketTypes.map((pt) => {
      const existing = recipePackets.find((p) => p.packetTypeId === pt.id || p.packetName === pt.name);
      return existing || {
        packetTypeId: pt.id,
        packetName: pt.name,
        costPerPacket: pt.costPerPacket || 0,
        bundleCost: pt.bundleCost || 0,
        bundleQuantity: pt.bundleQuantity || 100,
      };
    });
    setRecipePackets(all);
  };

  const handleDeselectAllRecipePackets = () => {
    setRecipePackets([]);
  };

  const handleRemoveRecipePacketRow = (index: number) => {
    setRecipePackets(recipePackets.filter((_, i) => i !== index));
  };

  const handleRecipePacketSelect = (index: number, packetTypeId: string) => {
    const found = availablePacketTypes.find((pt) => pt.id === packetTypeId);
    const updated = [...recipePackets];
    updated[index] = {
      ...updated[index],
      packetTypeId,
      packetName: found?.name || updated[index].packetName,
      costPerPacket: found?.costPerPacket ?? updated[index].costPerPacket,
      bundleCost: found?.bundleCost ?? updated[index].bundleCost,
      bundleQuantity: found?.bundleQuantity ?? updated[index].bundleQuantity,
    };
    setRecipePackets(updated);
  };

  const handleRecipePacketChange = (index: number, field: string, value: any) => {
    const updated = [...recipePackets];
    updated[index] = { ...updated[index], [field]: value };
    setRecipePackets(updated);
  };

  const calculateTotalRecipeCost = () => {
    return recipeItems.reduce((acc, row) => {
      const ing = ingredients.find((i) => i.id === row.ingredientId);
      const unitCost = ing?.avgCostPerUnit || 0;
      return acc + (Number(row.quantity) || 0) * unitCost;
    }, 0);
  };

  const handleSaveRecipeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (recipeModalStep === 1) {
      handleNextToPackets();
      return;
    }
    if (!recipeProduct) return;
    if (recipeItems.length === 0) {
      setRecipeError('കുറഞ്ഞത് ഒരു ചേരുവയെങ്കിലും നൽകുക (At least one ingredient is required)');
      return;
    }

    setIsSavingRecipe(true);
    setRecipeError('');
    try {
      await saveRecipe(
        {
          id: existingRecipe?.id,
          productId: recipeProduct.id,
          baseOutputQuantity: Number(recipeBaseQuantity) || 1,
          baseOutputUnit: recipeBaseUnit,
          instructions: recipeInstructions,
        },
        recipeItems.map((it) => ({
          ingredientId: it.ingredientId,
          quantity: Number(it.quantity) || 0,
          unit: it.unit,
        })),
        recipePackets
      );
      setRecipeModalOpen(false);
      onRefresh();
    } catch (err: any) {
      setRecipeError(err?.message || 'പാചകക്കുറിപ്പ് സേവ് ചെയ്യാനായില്ല');
    } finally {
      setIsSavingRecipe(false);
    }
  };

  const handleDeleteRecipe = async () => {
    if (!existingRecipe) return;
    if (!window.confirm(`"${recipeProduct?.name}" ന്റെ പാചകക്കുറിപ്പ് നീക്കം ചെയ്യണോ?`)) return;

    setIsDeletingRecipe(true);
    try {
      await deleteRecipe(existingRecipe.id);
      setRecipeModalOpen(false);
      onRefresh();
    } catch (err: any) {
      alert(`ഡിലീറ്റ് പരാജയപ്പെട്ടു: ${err?.message || 'Error deleting recipe'}`);
    } finally {
      setIsDeletingRecipe(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setErrorMsg('ഉൽപ്പന്നത്തിന്റെ പേര് നൽകുക (Product name is required)');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg('');
    try {
      await saveProduct({
        id: editingProduct?.id,
        name: name.trim(),
        sku: sku.trim() || undefined,
        unit,
        wholesalePrice: Number(wholesalePrice) || 0,
        currentStock: Number(currentStock) || 0,
        isActive,
      });
      setModalOpen(false);
      onRefresh();
    } catch (err: any) {
      setErrorMsg(err?.message || 'ഉൽപ്പന്നം സേവ് ചെയ്യുന്നതിൽ പരാജയപ്പെട്ടു');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (p: Product) => {
    const confirmDelete = window.confirm(
      `"${p.name}" എന്ന ഉൽപ്പന്നം നീക്കം ചെയ്യണോ?\nAre you sure you want to delete this product?`
    );
    if (!confirmDelete) return;

    setIsDeletingProductId(p.id);
    try {
      await deleteProduct(p.id);
      onRefresh();
    } catch (err: any) {
      alert(`ഡിലീറ്റ് പരാജയപ്പെട്ടു: ${err?.message || 'Error deleting product'}`);
    } finally {
      setIsDeletingProductId(null);
    }
  };

  const filteredProducts = products.filter((p) => {
    const matchSearch =
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.sku && p.sku.toLowerCase().includes(search.toLowerCase()));

    if (!matchSearch) return false;
    if (filterActive === 'active') return p.isActive;
    if (filterActive === 'inactive') return !p.isActive;
    return true;
  });

  const activeCount = products.filter((p) => p.isActive).length;
  const inactiveCount = products.filter((p) => !p.isActive).length;

  return (
    <div className="space-y-6">
      {/* Top Action Toolbar (Tab Title Removed) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-end gap-3 pb-2 border-b border-stone-200 dark:border-[#2E2828]">
        <div className="flex items-center gap-2">
          {ingredients.length > 0 && (
            <button
              onClick={() => setPurchaseListModalOpen(true)}
              className="flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-stone-200 dark:border-[#2E2828] bg-white dark:bg-[#1E1B1B] text-stone-700 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-[#282323] font-bold text-xs shadow-2xs press-apple transition-colors cursor-pointer"
              title="Print purchase list for raw materials"
            >
              <FiPrinter className="w-3.5 h-3.5 text-epso-orange" />
              <span>Print Purchase List</span>
            </button>
          )}
          <button
            onClick={openCreateModal}
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-epso-red hover:bg-epso-red-hover dark:bg-amber-500 dark:hover:bg-amber-600 text-white dark:text-stone-950 font-bold text-xs shadow-sm press-apple transition-colors cursor-pointer"
          >
            <FiPlus className="w-4 h-4" />
            <span>New Product</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <FiSearch className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search product, SKU..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-stone-200 dark:border-[#2E2828] bg-white dark:bg-[#1E1B1B] text-xs text-stone-900 dark:text-white placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-epso-red/30 dark:focus:ring-amber-500/30 transition-all"
          />
        </div>

        {/* English Status Tabs */}
        <div className="flex items-center gap-1.5 p-1 bg-stone-100 dark:bg-[#1E1B1B] rounded-xl border border-stone-200 dark:border-[#2E2828]">
          <button
            onClick={() => setFilterActive('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              filterActive === 'all'
                ? 'bg-white dark:bg-[#282323] text-stone-900 dark:text-white shadow-sm'
                : 'text-stone-500 hover:text-stone-800 dark:text-stone-400'
            }`}
          >
            All ({products.length})
          </button>
          <button
            onClick={() => setFilterActive('active')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              filterActive === 'active'
                ? 'bg-white dark:bg-[#282323] text-stone-900 dark:text-white shadow-sm'
                : 'text-stone-500 hover:text-stone-800 dark:text-stone-400'
            }`}
          >
            Active ({activeCount})
          </button>
          <button
            onClick={() => setFilterActive('inactive')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              filterActive === 'inactive'
                ? 'bg-white dark:bg-[#282323] text-stone-900 dark:text-white shadow-sm'
                : 'text-stone-500 hover:text-stone-800 dark:text-stone-400'
            }`}
          >
            Inactive ({inactiveCount})
          </button>
        </div>
      </div>

      {/* Products Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredProducts.map((p) => {
          const totalValuation = p.currentStock * p.wholesalePrice;
          const productRecipe = recipes.find((r) => r.productId === p.id);

          return (
            <div
              key={p.id}
              className="p-5 rounded-2xl bg-white dark:bg-[#1E1B1B] border border-stone-200 dark:border-[#2E2828] shadow-apple-card dark:shadow-apple-card-dark flex flex-col justify-between transition-all"
            >
              <div>
                {/* Header: Title and Status */}
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <h3 className="text-base font-bold text-stone-900 dark:text-white">
                      {p.name}
                    </h3>
                    {p.sku && (
                      <span className="text-[11px] text-stone-400 dark:text-stone-500 block">
                        SKU: {p.sku}
                      </span>
                    )}
                  </div>
                  <span
                    className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                      p.isActive
                        ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800'
                        : 'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-400'
                    }`}
                  >
                    {p.isActive ? (
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

                {/* Details Box */}
                <div className="p-3 bg-stone-50 dark:bg-[#141212] rounded-xl border border-stone-100 dark:border-[#282323] space-y-2 my-3 text-xs">
                  {/* Wholesale Price Highlight */}
                  <div className="flex items-center justify-between">
                    <span className="text-stone-500 dark:text-stone-400">
                      മൊത്തവില (Wholesale):
                    </span>
                    <span className="font-extrabold text-sm text-epso-red dark:text-amber-400">
                      ₹{p.wholesalePrice.toLocaleString('en-IN')}
                      <span className="text-[10px] font-normal text-stone-400 ml-1">/ {p.unit}</span>
                    </span>
                  </div>

                  {/* Current Finished Stock */}
                  <div className="flex items-center justify-between">
                    <span className="text-stone-500 dark:text-stone-400">
                      സ്റ്റോക്ക് (Current Stock):
                    </span>
                    <span className="font-bold text-stone-900 dark:text-white">
                      {p.currentStock} {p.unit}
                    </span>
                  </div>

                  {/* Recipe / Ingredients Config Status */}
                  <div className="flex items-center justify-between pt-1 border-t border-stone-200/60 dark:border-[#282323]">
                    <span className="text-stone-500 dark:text-stone-400">
                      ചേരുവകൾ (Recipe):
                    </span>
                    {productRecipe && productRecipe.items && productRecipe.items.length > 0 ? (
                      <span className="font-bold text-[11px] text-amber-600 dark:text-amber-400">
                        {productRecipe.items.length} ചേരുവകൾ ({productRecipe.baseOutputQuantity} {productRecipe.baseOutputUnit || p.unit})
                      </span>
                    ) : (
                      <span className="text-[11px] text-stone-400 italic">
                        നൽകിയിട്ടില്ല
                      </span>
                    )}
                  </div>

                  {/* Stock Valuation */}
                  <div className="flex items-center justify-between pt-1 border-t border-stone-200/60 dark:border-[#282323]">
                    <span className="text-stone-500 dark:text-stone-400">
                      സ്റ്റോക്ക് മൂല്യം (Valuation):
                    </span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400">
                      ₹{totalValuation.toLocaleString('en-IN')}
                    </span>
                  </div>
                </div>
              </div>

              {/* Action Buttons: Set Ingredients (Recipe), Edit, Delete */}
              <div className="flex items-center gap-2 pt-2 border-t border-stone-100 dark:border-[#282323]">
                <button
                  onClick={() => openRecipeModal(p)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/40 dark:hover:bg-amber-950/60 text-amber-900 dark:text-amber-300 text-xs font-bold press-apple transition-colors cursor-pointer"
                  title="ചേരുവകൾ നൽകുക (Set Ingredients / Recipe)"
                >
                  <FiBookOpen className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                  <span>ചേരുവകൾ</span>
                </button>

                <button
                  onClick={() => openEditModal(p)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl bg-stone-100 hover:bg-stone-200 dark:bg-[#282323] dark:hover:bg-[#322c2c] text-stone-800 dark:text-stone-200 text-xs font-bold press-apple transition-colors cursor-pointer"
                >
                  <FiEdit2 className="w-3.5 h-3.5" />
                  <span>തിരുത്തുക</span>
                </button>

                <button
                  onClick={() => handleDelete(p)}
                  disabled={isDeletingProductId === p.id}
                  className="p-2 rounded-xl text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 border border-transparent hover:border-red-200 dark:hover:border-red-900 press-apple transition-colors cursor-pointer disabled:opacity-50"
                  title="ഡിലീറ്റ് ചെയ്യുക"
                >
                  {isDeletingProductId === p.id ? (
                    <div className="w-4 h-4 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <FiTrash2 className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {filteredProducts.length === 0 && (
        <div className="py-12 text-center text-xs text-stone-400 dark:text-stone-500">
          ഉൽപ്പന്നങ്ങൾ ഒന്നും കണ്ടെത്താനായില്ല (No products found)
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 1: Add / Edit Product                                           */}
      {/* ===================================================================== */}
      {modalOpen && createPortal(
        <div className="fixed inset-0 z-[9999] overflow-y-auto">
          {/* Edge-to-edge backdrop covering entire screen */}
          <div
            className="fixed inset-0 w-full h-full bg-black/65 backdrop-blur-md animate-apple-backdrop"
            onClick={() => !isSubmitting && setModalOpen(false)}
          />

          <div className="min-h-full flex items-center justify-center p-3 sm:p-5 relative z-10 pointer-events-none">
            <div className="w-full max-w-2xl bg-white dark:bg-[#1E1B1B] rounded-3xl p-6 sm:p-8 border border-stone-200 dark:border-[#2E2828] shadow-apple-modal animate-apple-modal pointer-events-auto google-modal">
              <div className="flex items-start justify-between gap-3 mb-4">
                <div>
                  <h2 className="text-xl font-bold text-stone-900 dark:text-white mb-1">
                    {editingProduct ? 'ഉൽപ്പന്നം തിരുത്തുക (Edit)' : 'പുതിയ ഉൽപ്പന്നം (New Product)'}
                  </h2>
                  <p className="text-xs sm:text-sm text-stone-500 dark:text-stone-400">
                    വിലയും സ്റ്റോക്ക് വിവരങ്ങളും രേഖപ്പെടുത്തുക
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="w-8 h-8 rounded-full flex items-center justify-center text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-[#282323] transition-colors cursor-pointer shrink-0"
                  aria-label="Close"
                  title="അടയ്ക്കുക (Close)"
                >
                  <FiX className="w-5 h-5" />
                </button>
              </div>

              {errorMsg && (
                <div className="p-3 mb-4 rounded-xl bg-red-50 dark:bg-red-950/50 text-red-600 dark:text-red-400 text-xs flex items-center gap-2 border border-red-200 dark:border-red-900/60">
                  <FiAlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4 text-xs sm:text-sm">
                <div>
                  <label className="block text-xs sm:text-sm font-bold text-stone-700 dark:text-stone-300 mb-1.5">
                    പേര് (Product Name) *
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. മിക്സ്ചർ (Mixture)"
                    className="google-input"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-xs sm:text-sm font-bold text-stone-700 dark:text-stone-300 mb-1.5">
                      SKU കോഡ്
                    </label>
                    <input
                      type="text"
                      value={sku}
                      onChange={(e) => setSku(e.target.value)}
                      className="google-input font-mono"
                    />
                  </div>

                  <div>
                    <ThemeSelect
                      label="അളവ് യൂണിറ്റ് (Unit)"
                      value={unit}
                      onChange={(val) => setUnit(val as UnitType)}
                      options={[
                        { value: 'kg', label: 'kg (കിലോഗ്രാം)' },
                        { value: 'g', label: 'g (ഗ്രാം)' },
                        { value: 'pkt', label: 'pkt (പാക്കറ്റ്)' },
                        { value: 'pcs', label: 'pcs (എണ്ണം)' },
                        { value: 'box', label: 'box (ബോക്സ്)' },
                      ]}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs sm:text-sm font-bold text-stone-700 dark:text-stone-300 mb-1.5">
                    മൊത്ത വിൽപ്പന വില (Wholesale Price ₹) *
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    required
                    value={wholesalePrice === 0 ? '' : wholesalePrice}
                    onChange={(e) => setWholesalePrice(e.target.value === '' ? '' : parseFloat(e.target.value))}
                    onFocus={(e) => e.target.select()}
                    className="google-input font-mono font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs sm:text-sm font-bold text-stone-700 dark:text-stone-300 mb-1.5">
                    നിലവിലെ ഫിനിഷ്ഡ് സ്റ്റോക്ക് (Current Stock)
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={currentStock === 0 ? '' : currentStock}
                    onChange={(e) => setCurrentStock(e.target.value === '' ? '' : parseFloat(e.target.value))}
                    onFocus={(e) => e.target.select()}
                    className="google-input font-mono font-bold"
                  />
                </div>

                <div className="flex items-center justify-between p-4 rounded-2xl bg-stone-50 dark:bg-[#141212] border border-stone-200 dark:border-[#2E2828]">
                  <div>
                    <span className="font-bold text-sm text-stone-900 dark:text-white">
                      ഉൽപ്പാദനത്തിൽ സജീവം (Active)
                    </span>
                    <p className="text-xs text-stone-400 mt-0.5">
                      അടുക്കളയിൽ തിരഞ്ഞെടുക്കാൻ അനുവദിക്കുക
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={isActive}
                    onClick={() => setIsActive(!isActive)}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-epso-red/30 ${
                      isActive ? 'bg-epso-red dark:bg-amber-500' : 'bg-stone-300 dark:bg-stone-700'
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white dark:bg-stone-900 shadow-md ring-0 transition duration-200 ease-in-out ${
                        isActive ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                <div className="flex items-center justify-end gap-3 pt-3 border-t border-stone-100 dark:border-[#2E2828]">
                  <button
                    type="button"
                    onClick={() => setModalOpen(false)}
                    className="px-5 py-2.5 rounded-xl text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-[#282323] font-bold cursor-pointer"
                  >
                    റദ്ദാക്കുക (Cancel)
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-6 py-2.5 rounded-xl bg-epso-red hover:bg-epso-red-hover dark:bg-amber-500 dark:hover:bg-amber-600 text-white dark:text-stone-950 font-bold shadow-sm press-apple flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {isSubmitting ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white dark:border-stone-950 border-t-transparent rounded-full animate-spin shrink-0" />
                        <span>സൂക്ഷിക്കുന്നു...</span>
                      </>
                    ) : (
                      <span>സൂക്ഷിക്കുക (Save)</span>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ===================================================================== */}
      {/* MODAL 2: Set Ingredients / Recipe for Product                          */}
      {/* ===================================================================== */}
      {recipeModalOpen && recipeProduct && createPortal(
        <div className="fixed inset-0 z-[9999] overflow-hidden">
          {/* Edge-to-edge backdrop covering entire screen */}
          <div
            className="fixed inset-0 w-full h-full bg-black/65 backdrop-blur-md animate-apple-backdrop"
            onClick={() => !isSavingRecipe && setRecipeModalOpen(false)}
          />

          <div className="fixed inset-0 flex items-center justify-center p-3 sm:p-5 relative z-10 pointer-events-none">
            <div className="w-full md:w-[80vw] md:max-w-5xl max-h-[92vh] flex flex-col bg-white dark:bg-[#1E1B1B] rounded-3xl border border-stone-200 dark:border-[#2E2828] shadow-apple-modal animate-apple-modal pointer-events-auto overflow-hidden google-modal">
              {/* Pinned Modal Header */}
              <div className="flex items-center justify-between p-5 pb-3 border-b border-stone-200 dark:border-[#2E2828] shrink-0">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="p-2 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
                      <FiBookOpen className="w-5 h-5" />
                    </span>
                    <h2 className="text-lg font-bold text-stone-900 dark:text-white">
                      {recipeProduct.name} - {recipeModalStep === 1 ? 'ചേരുവകൾ (Recipe Ingredients)' : 'പാക്കറ്റുകളും ചിലവും (Packets & Costing)'}
                    </h2>
                  </div>
                  <p className="text-xs text-stone-500 dark:text-stone-400 mt-1">
                    {recipeModalStep === 1
                      ? 'ഈ ഉൽപ്പന്നത്തിനുള്ള അസംസ്കൃത ചേരുവകളുടെ അനുപാതം നൽകുക (ഘട്ടം 1 / 2)'
                      : 'പാക്കറ്റ് തരങ്ങളും ചിലവുകളും നിർദ്ദേശങ്ങളും നൽകുക (ഘട്ടം 2 / 2)'}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 rounded-full text-xs font-bold font-mono bg-stone-100 dark:bg-[#282323] text-stone-600 dark:text-stone-300">
                    {recipeModalStep} / 2
                  </span>
                  <button
                    type="button"
                    onClick={() => setRecipeModalOpen(false)}
                    className="w-8 h-8 rounded-full flex items-center justify-center text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-[#282323] transition-colors cursor-pointer"
                  >
                    <FiX className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {recipeError && (
                <div className="mx-5 mt-3 p-3 rounded-xl bg-red-50 dark:bg-red-950/50 text-red-600 dark:text-red-400 text-xs flex items-center gap-2 border border-red-200 dark:border-red-900/60 shrink-0">
                  <FiAlertCircle className="w-4 h-4 shrink-0" />
                  <span>{recipeError}</span>
                </div>
              )}

              {/* Scrollable Form Body */}
              <form onSubmit={handleSaveRecipeSubmit} id="recipeForm" className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
                {/* STEP 1: Ingredients List & Base Batch Output */}
                {recipeModalStep === 1 && (
                  <div className="space-y-4">
                    {/* Base Batch Output */}
                    <div className="p-4 rounded-2xl bg-stone-50 dark:bg-[#141212] border border-stone-200 dark:border-[#282323] grid grid-cols-2 gap-4">
                      <div>
                        <label className="block font-bold text-stone-700 dark:text-stone-300 mb-1">
                          ഒരു ബാച്ചിലെ ഉൽപ്പാദനം (Base Output Quantity) *
                        </label>
                        <input
                          type="number"
                          step="0.1"
                          min="0.1"
                          required
                          value={recipeBaseQuantity}
                          onChange={(e) => setRecipeBaseQuantity(e.target.value)}
                          className="w-full p-2.5 rounded-xl border border-stone-200 dark:border-[#2E2828] bg-white dark:bg-[#1E1B1B] text-stone-900 dark:text-white font-bold outline-none"
                          placeholder="e.g. 10"
                        />
                      </div>

                      <div>
                        <ThemeSelect
                          label="യൂണിറ്റ് (Unit)"
                          value={recipeBaseUnit}
                          onChange={(val) => setRecipeBaseUnit(val)}
                          options={[
                            { value: 'kg', label: 'kg (കിലോഗ്രാം)' },
                            { value: 'pkt', label: 'pkt (പാക്കറ്റ്)' },
                            { value: 'pcs', label: 'pcs (എണ്ണം)' },
                          ]}
                        />
                      </div>
                    </div>

                    {/* Recipe Ingredients Rows */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="font-bold text-stone-700 dark:text-stone-300">
                          ചേരുവകൾ (Ingredients List) *
                        </label>
                        <button
                          type="button"
                          onClick={handleAddRecipeItem}
                          className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-stone-950 font-bold text-xs flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
                        >
                          <FiPlus className="w-3.5 h-3.5" />
                          <span>ചേരുവ ചേർക്കുക</span>
                        </button>
                      </div>

                      {/* Scrollable container for ingredients list */}
                      <div className="space-y-2 max-h-[48vh] overflow-y-auto pr-1.5 p-1 rounded-xl bg-stone-100/50 dark:bg-[#141212]/50 border border-stone-200/60 dark:border-[#282323]">
                        {recipeItems.map((item, idx) => {
                          const ing = ingredients.find((i) => i.id === item.ingredientId);
                          const lineCost = (Number(item.quantity) || 0) * (ing?.avgCostPerUnit || 0);

                          const ingOptions = recipeEligibleIngredients.map((ingItem: Ingredient) => ({
                            value: ingItem.id,
                            label: ingItem.name,
                            badge: `${ingItem.unit} • ₹${ingItem.avgCostPerUnit || 0}/${ingItem.unit}`,
                          }));

                          return (
                            <div
                              key={idx}
                              className="flex items-center gap-2 p-2.5 rounded-xl bg-white dark:bg-[#1E1B1B] border border-stone-200 dark:border-[#282323] shadow-xs"
                            >
                              {/* Ingredient ThemeSelect with search */}
                              <div className="flex-1 min-w-[140px]">
                                <ThemeSelect
                                  value={item.ingredientId}
                                  onChange={(val) => handleRecipeItemChange(idx, 'ingredientId', val)}
                                  options={ingOptions}
                                  searchable={true}
                                  placeholder="ചേരുവ തിരഞ്ഞെടുക്കുക..."
                                />
                              </div>

                              {/* Quantity */}
                              <div className="w-24">
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0.01"
                                  required
                                  value={item.quantity}
                                  onChange={(e) => handleRecipeItemChange(idx, 'quantity', e.target.value)}
                                  className="w-full p-2.5 rounded-xl border border-stone-200 dark:border-[#2E2828] bg-stone-50 dark:bg-[#141212] text-stone-900 dark:text-white text-xs font-bold outline-none text-right"
                                  placeholder="Qty"
                                />
                              </div>

                              {/* Unit Badge */}
                              <div className="w-12 text-center text-xs font-bold text-stone-500">
                                {item.unit}
                              </div>

                              {/* Line Cost */}
                              <div className="w-20 text-right font-bold text-xs text-stone-700 dark:text-stone-300">
                                ₹{lineCost.toFixed(1)}
                              </div>

                              {/* Delete Button */}
                              <button
                                type="button"
                                onClick={() => handleRemoveRecipeItem(idx)}
                                disabled={recipeItems.length <= 1}
                                className="p-1.5 text-stone-400 hover:text-red-600 disabled:opacity-30 transition-colors cursor-pointer"
                              >
                                <FiTrash2 className="w-4 h-4" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

                {/* STEP 2: Cost Estimation, Packets Checklist, Custom Rates, and Instructions */}
                {recipeModalStep === 2 && (
                  <div className="space-y-4">
                    {/* Recipe Costing Estimation Strip */}
                    <div className="p-3.5 bg-amber-500/10 rounded-2xl border border-amber-500/20 flex items-center justify-between text-xs">
                      <div>
                        <span className="text-amber-800 dark:text-amber-300 block">
                          ഏകദേശ ബാച്ച് ചെലവ് (Est. Batch Raw Material Cost):
                        </span>
                        <span className="font-extrabold text-base text-stone-900 dark:text-white">
                          ₹{calculateTotalRecipeCost().toFixed(2)}
                        </span>
                      </div>

                      <div className="text-right">
                        <span className="text-amber-800 dark:text-amber-300 block">
                          കിലോഗ്രാമിന് ചിലവ് (Cost / {recipeBaseUnit}):
                        </span>
                        <span className="font-extrabold text-base text-amber-700 dark:text-amber-400">
                          ₹{(calculateTotalRecipeCost() / (Number(recipeBaseQuantity) || 1)).toFixed(2)}
                        </span>
                      </div>
                    </div>

                    {/* Recipe Packets Section */}
                    <div className="p-3.5 rounded-2xl bg-stone-50 dark:bg-[#141212] border border-stone-200 dark:border-[#282323] space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div>
                          <span className="font-bold text-stone-900 dark:text-white font-malayalam flex items-center gap-1.5">
                            <FiPackage className="w-4 h-4 text-epso-orange" />
                            <span>പാക്കറ്റുകൾ (Recipe Packets)</span>
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-100 dark:bg-orange-950/60 text-orange-800 dark:text-orange-300">
                              {recipePackets.length} തിരഞ്ഞെടുത്തു
                            </span>
                          </span>
                          <p className="text-[10px] text-stone-400 font-malayalam mt-0.5">
                            ലഭ്യമായ പാക്കറ്റ് തരങ്ങൾ താഴെ ക്ലിക്ക് ചെയ്ത് ടിക്ക് ചെയ്യുക (PWA-യിൽ ഇവ മാത്രമേ കാണിക്കൂ)
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {availablePacketTypes.length > 0 && (
                            <>
                              <button
                                type="button"
                                onClick={handleSelectAllRecipePackets}
                                className="text-[10px] text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 font-bold hover:underline cursor-pointer"
                              >
                                എല്ലാം
                              </button>
                              <span className="text-stone-300 dark:text-stone-600 text-xs">|</span>
                              <button
                                type="button"
                                onClick={handleDeselectAllRecipePackets}
                                className="text-[10px] text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 font-bold hover:underline cursor-pointer"
                              >
                                ഒഴിവാക്കുക
                              </button>
                            </>
                          )}
                          <button
                            type="button"
                            onClick={handleAddRecipePacketRow}
                            className="px-2.5 py-1 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold text-[11px] flex items-center gap-1 cursor-pointer transition-colors shadow-2xs ml-1"
                            title="Add custom packet"
                          >
                            <FiPlus className="w-3.5 h-3.5" />
                            <span>കസ്റ്റം പാക്കറ്റ്</span>
                          </button>
                        </div>
                      </div>

                      {/* Available Packets Checklist / Ticks */}
                      {availablePacketTypes.length > 0 ? (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                          {availablePacketTypes.map((pt) => {
                            const isTicked = recipePackets.some(
                              (p) => (p.packetTypeId && p.packetTypeId === pt.id) || p.packetName === pt.name
                            );
                            return (
                              <button
                                key={pt.id}
                                type="button"
                                onClick={() => handleToggleRecipePacket(pt)}
                                className={`p-2 rounded-xl text-left border transition-all flex items-center justify-between gap-1.5 cursor-pointer press-apple select-none ${
                                  isTicked
                                    ? 'bg-orange-50 dark:bg-orange-950/40 border-orange-400 dark:border-orange-600 text-stone-900 dark:text-white shadow-2xs ring-1 ring-orange-400/30'
                                    : 'bg-white dark:bg-[#1E1B1B] border-stone-200 dark:border-[#282323] text-stone-600 dark:text-stone-400 hover:border-stone-300 dark:hover:border-stone-600'
                                }`}
                              >
                                <div className="min-w-0 flex-1">
                                  <p className="text-xs font-bold font-mono truncate">{pt.name}</p>
                                  <span className="text-[10px] text-stone-400 block font-mono">
                                    ₹{(pt.costPerPacket || 0).toFixed(2)}/pkt
                                  </span>
                                </div>
                                <div
                                  className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 border transition-all ${
                                    isTicked
                                      ? 'bg-orange-500 border-orange-500 text-white'
                                      : 'border-stone-300 dark:border-stone-600 bg-transparent'
                                  }`}
                                >
                                  {isTicked && <FiCheck className="w-3.5 h-3.5 stroke-[3]" />}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="p-3 text-center rounded-xl bg-white/40 dark:bg-[#1E1B1B]/40 border border-dashed border-stone-200 dark:border-[#282323] text-stone-400 text-xs font-malayalam">
                          ലഭ്യമായ പാക്കറ്റ് തരങ്ങൾ ഒന്നും ചേർത്തിട്ടില്ല ('കസ്റ്റം പാക്കറ്റ്' ക്ലിക്ക് ചെയ്ത് ചേർക്കുക)
                        </div>
                      )}

                      {/* Selected Packets Rate Customization */}
                      {recipePackets.length > 0 && (
                        <div className="mt-2 pt-2 border-t border-stone-200/60 dark:border-[#282323] space-y-1.5">
                          <span className="text-[11px] font-bold text-stone-500 dark:text-stone-400 font-malayalam block">
                            തിരഞ്ഞെടുത്ത പാക്കറ്റുകളുടെ ചിലവ് നിരക്ക് (Custom Rate ₹/pkt):
                          </span>
                          <div className="flex flex-wrap gap-2 max-h-[22vh] overflow-y-auto p-1">
                            {recipePackets.map((pkt, idx) => (
                              <div
                                key={idx}
                                className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-white dark:bg-[#1E1B1B] border border-stone-200 dark:border-[#282323] shadow-2xs"
                              >
                                <span className="text-xs font-bold font-mono text-stone-800 dark:text-stone-200">
                                  {pkt.packetName}
                                </span>
                                <span className="text-[10px] text-stone-400 font-bold">₹:</span>
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  value={pkt.costPerPacket === 0 ? '' : pkt.costPerPacket}
                                  onChange={(e) => handleRecipePacketChange(idx, 'costPerPacket', parseFloat(e.target.value) || 0)}
                                  placeholder="0.00"
                                  className="w-14 p-0.5 bg-stone-50 dark:bg-[#141212] rounded border border-stone-200 dark:border-stone-700 text-stone-900 dark:text-white text-[11px] font-mono font-bold text-right outline-none"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleRemoveRecipePacketRow(idx)}
                                  className="p-1 text-stone-400 hover:text-red-500 cursor-pointer"
                                  title="ഒഴിവാക്കുക"
                                >
                                  <FiTrash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Instructions / Formulation Notes */}
                    <div>
                      <label className="block font-bold text-stone-700 dark:text-stone-300 mb-1">
                        പാചകക്കുറിപ്പ് നിർദ്ദേശങ്ങൾ / ഫോർമുലേഷൻ (Instructions / Method)
                      </label>
                      <textarea
                        rows={2}
                        value={recipeInstructions}
                        onChange={(e) => setRecipeInstructions(e.target.value)}
                        placeholder="ഉദാ: വറുത്ത ചേരുവകൾ തണുത്ത ശേഷം മസാല ചേർക്കുക..."
                        className="w-full p-2.5 rounded-xl border border-stone-200 dark:border-[#2E2828] bg-stone-50 dark:bg-[#141212] text-stone-900 dark:text-white text-xs focus:outline-none"
                      />
                    </div>
                  </div>
                )}
              </form>

              {/* Pinned Modal Footer */}
              <div className="p-4 px-5 border-t border-stone-100 dark:border-[#2E2828] bg-stone-50/80 dark:bg-[#1A1616]/80 backdrop-blur-sm shrink-0 flex items-center justify-between">
                {recipeModalStep === 1 ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setRecipeModalOpen(false)}
                      className="px-4 py-2 rounded-xl text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-[#282323] font-bold cursor-pointer"
                    >
                      റദ്ദാക്കുക (Cancel)
                    </button>
                    <button
                      type="button"
                      onClick={handleNextToPackets}
                      className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-stone-950 font-bold shadow-sm press-apple cursor-pointer flex items-center gap-1.5"
                    >
                      <span>അടുത്തത് (Next)</span>
                      <FiArrowRight className="w-4 h-4" />
                    </button>
                  </>
                ) : (
                  <>
                    {existingRecipe ? (
                      <button
                        type="button"
                        onClick={handleDeleteRecipe}
                        disabled={isDeletingRecipe}
                        className="px-3 py-2 rounded-xl text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                      >
                        {isDeletingRecipe ? (
                          <>
                            <div className="w-3.5 h-3.5 border-2 border-red-600 border-t-transparent rounded-full animate-spin shrink-0" />
                            <span>ഒഴിവാക്കുന്നു...</span>
                          </>
                        ) : (
                          <span>പാചകക്കുറിപ്പ് ഒഴിവാക്കുക</span>
                        )}
                      </button>
                    ) : (
                      <div />
                    )}

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setRecipeError('');
                          setRecipeModalStep(1);
                        }}
                        disabled={isSavingRecipe}
                        className="px-4 py-2 rounded-xl border border-stone-300 dark:border-stone-700 text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-[#282323] font-bold cursor-pointer flex items-center gap-1.5"
                      >
                        <FiArrowLeft className="w-4 h-4" />
                        <span>പിന്നോട്ട് (Back)</span>
                      </button>
                      <button
                        type="submit"
                        form="recipeForm"
                        disabled={isSavingRecipe}
                        className="px-5 py-2 rounded-xl bg-epso-red hover:bg-epso-red-hover dark:bg-amber-500 dark:hover:bg-amber-600 text-white dark:text-stone-950 font-bold shadow-sm press-apple cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                      >
                        {isSavingRecipe ? (
                          <>
                            <div className="w-3.5 h-3.5 border-2 border-white dark:border-stone-950 border-t-transparent rounded-full animate-spin shrink-0" />
                            <span>സൂക്ഷിക്കുന്നു...</span>
                          </>
                        ) : (
                          <span>പാചകക്കുറിപ്പ് സേവ് ചെയ്യുക</span>
                        )}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Printable Purchase List Modal */}
      {ingredients.length > 0 && (
        <PrintPurchaseListModal
          isOpen={purchaseListModalOpen}
          onClose={() => setPurchaseListModalOpen(false)}
          ingredients={ingredients}
        />
      )}
    </div>
  );
};
