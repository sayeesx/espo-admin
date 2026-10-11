import React, { useState } from 'react';
import { Product, UnitType } from '../types';
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
} from 'react-icons/fi';
import { saveProduct, deleteProduct } from '../services/supabase';

interface ProductsAdminViewProps {
  products: Product[];
  onRefresh: () => void;
}

export const ProductsAdminView: React.FC<ProductsAdminViewProps> = ({
  products,
  onRefresh,
}) => {
  const [search, setSearch] = useState('');
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive'>('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Form states
  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [unit, setUnit] = useState<UnitType>('kg');
  const [wholesalePrice, setWholesalePrice] = useState<number>(0);
  const [currentStock, setCurrentStock] = useState<number>(0);
  const [isActive, setIsActive] = useState<boolean>(true);

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

    try {
      await deleteProduct(p.id);
      onRefresh();
    } catch (err: any) {
      alert(`ഡിലീറ്റ് പരാജയപ്പെട്ടു: ${err?.message || 'Error deleting product'}`);
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
      {/* Header and Add Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-stone-200 dark:border-[#2E2828]">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-stone-900 dark:text-white tracking-tight">
            Products
          </h1>
          <p className="text-xs sm:text-sm text-stone-500 dark:text-stone-400 font-malayalam mt-0.5">
            സ്നാക്ക് ഉൽപ്പന്നങ്ങളും മൊത്തവില മാനേജ്മെന്റും
          </p>
        </div>
        <button
          onClick={openCreateModal}
          className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-epso-red hover:bg-epso-red-hover dark:bg-amber-500 dark:hover:bg-amber-600 text-white dark:text-stone-950 font-bold text-xs shadow-sm press-apple transition-colors"
        >
          <FiPlus className="w-4 h-4" />
          <span>New Product</span>
        </button>
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
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-stone-200 dark:border-[#2E2828] bg-white dark:bg-[#1E1B1B] text-xs text-stone-900 dark:text-white placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-epso-red/30 dark:focus:ring-amber-500/30 transition-all font-malayalam"
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
          return (
            <div
              key={p.id}
              className="p-5 rounded-2xl bg-white dark:bg-[#1E1B1B] border border-stone-200 dark:border-[#2E2828] shadow-apple-card dark:shadow-apple-card-dark flex flex-col justify-between transition-all"
            >
              <div>
                {/* Header: Title and Status */}
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <h3 className="text-base font-bold text-stone-900 dark:text-white font-malayalam">
                      {p.name}
                    </h3>
                    {p.sku && (
                      <span className="text-[11px] font-mono text-stone-400 dark:text-stone-500 block">
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
                    <span className="text-stone-500 dark:text-stone-400 font-malayalam">
                      മൊത്തവില (Wholesale):
                    </span>
                    <span className="font-extrabold text-sm text-epso-red dark:text-amber-400">
                      ₹{p.wholesalePrice.toLocaleString('en-IN')}
                      <span className="text-[10px] font-normal text-stone-400 ml-1">/ {p.unit}</span>
                    </span>
                  </div>

                  {/* Current Finished Stock */}
                  <div className="flex items-center justify-between">
                    <span className="text-stone-500 dark:text-stone-400 font-malayalam">
                      സ്റ്റോക്ക് (Current Stock):
                    </span>
                    <span className="font-bold text-stone-900 dark:text-white">
                      {p.currentStock} {p.unit}
                    </span>
                  </div>

                  {/* Stock Valuation */}
                  <div className="flex items-center justify-between pt-1 border-t border-stone-200/60 dark:border-[#282323]">
                    <span className="text-stone-500 dark:text-stone-400 font-malayalam">
                      സ്റ്റോക്ക് മൂല്യം (Valuation):
                    </span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400">
                      ₹{totalValuation.toLocaleString('en-IN')}
                    </span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 pt-2 border-t border-stone-100 dark:border-[#282323]">
                <button
                  onClick={() => openEditModal(p)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-stone-100 hover:bg-stone-200 dark:bg-[#282323] dark:hover:bg-[#322c2c] text-stone-800 dark:text-stone-200 text-xs font-bold press-apple transition-colors"
                >
                  <FiEdit2 className="w-3.5 h-3.5" />
                  <span className="font-malayalam">തിരുത്തുക (Edit)</span>
                </button>
                <button
                  onClick={() => handleDelete(p)}
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

      {filteredProducts.length === 0 && (
        <div className="py-12 text-center text-xs text-stone-400 dark:text-stone-500 font-malayalam">
          ഉൽപ്പന്നങ്ങൾ ഒന്നും കണ്ടെത്താനായില്ല (No products found)
        </div>
      )}

      {/* Modal: Add / Edit Product */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md bg-white dark:bg-[#1E1B1B] rounded-3xl p-6 border border-stone-200 dark:border-[#2E2828] shadow-apple-modal">
            <h2 className="text-lg font-bold text-stone-900 dark:text-white font-malayalam mb-1">
              {editingProduct ? 'ഉൽപ്പന്നം തിരുത്തുക (Edit)' : 'പുതിയ ഉൽപ്പന്നം (New Product)'}
            </h2>
            <p className="text-xs text-stone-500 dark:text-stone-400 font-malayalam mb-4">
              വിലയും സ്റ്റോക്ക് വിവരങ്ങളും രേഖപ്പെടുത്തുക
            </p>

            {errorMsg && (
              <div className="p-3 mb-4 rounded-xl bg-red-50 dark:bg-red-950/50 text-red-600 dark:text-red-400 text-xs flex items-center gap-2 border border-red-200 dark:border-red-900/60 font-malayalam">
                <FiAlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-stone-700 dark:text-stone-300 font-malayalam mb-1">
                  പേര് (Product Name) *
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="ഉദാ: പെരി പെരി മിക്സ്ചർ"
                  className="w-full p-2.5 rounded-xl border border-stone-200 dark:border-[#2E2828] bg-stone-50 dark:bg-[#141212] text-stone-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-epso-red/30 font-malayalam"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-stone-700 dark:text-stone-300 mb-1">
                    SKU Code
                  </label>
                  <input
                    type="text"
                    value={sku}
                    onChange={(e) => setSku(e.target.value)}
                    placeholder="EPSO-PRD-101"
                    className="w-full p-2.5 rounded-xl border border-stone-200 dark:border-[#2E2828] bg-stone-50 dark:bg-[#141212] text-stone-900 dark:text-white font-mono focus:outline-none"
                  />
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
                    <option value="packs">Packs (പാക്കറ്റ്)</option>
                    <option value="pcs">Pieces (എണ്ണം)</option>
                    <option value="g">Gram (g)</option>
                  </select>
                </div>
              </div>

              {/* Wholesale Selling Price - Admin Special Field */}
              <div className="p-3.5 rounded-2xl bg-red-50/70 dark:bg-amber-950/20 border border-epso-red/30 dark:border-amber-500/30">
                <label className="block font-extrabold text-epso-red dark:text-amber-400 font-malayalam mb-1 flex items-center justify-between">
                  <span>മൊത്ത വിൽപ്പന വില (Wholesale Price ₹) *</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-epso-red/10 text-epso-red dark:bg-amber-400/20 dark:text-amber-300">
                    Admin Only
                  </span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 font-bold">₹</span>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    required
                    value={wholesalePrice}
                    onChange={(e) => setWholesalePrice(parseFloat(e.target.value) || 0)}
                    className="w-full pl-8 pr-3 py-2 rounded-xl border border-stone-300 dark:border-[#3E3434] bg-white dark:bg-[#141212] text-sm font-extrabold text-stone-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-epso-red/40"
                  />
                </div>
                <p className="text-[10px] text-stone-500 dark:text-stone-400 mt-1 font-malayalam">
                  ഈ വില മാത്രമേ മൊത്തം സെയിൽസ് കണക്കുകൂട്ടലിൽ ഉപയോഗിക്കൂ.
                </p>
              </div>

              <div>
                <label className="block font-bold text-stone-700 dark:text-stone-300 font-malayalam mb-1">
                  നിലവിലെ ഫിനിഷ്ഡ് സ്റ്റോക്ക് (Current Stock)
                </label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={currentStock}
                  onChange={(e) => setCurrentStock(parseFloat(e.target.value) || 0)}
                  className="w-full p-2.5 rounded-xl border border-stone-200 dark:border-[#2E2828] bg-stone-50 dark:bg-[#141212] text-stone-900 dark:text-white focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-stone-50 dark:bg-[#141212] border border-stone-200 dark:border-[#2E2828]">
                <div>
                  <span className="font-bold text-stone-900 dark:text-white font-malayalam">
                    ഉൽപ്പാദനത്തിൽ സജീവം (Active)
                  </span>
                  <p className="text-[10px] text-stone-400 font-malayalam">
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
