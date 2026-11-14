import React, { useState, useEffect } from 'react';
import { PacketType } from '../types';
import {
  fetchPacketTypes,
  savePacketType,
  deletePacketType,
  recordPacketPurchase,
  adjustPacketStock,
} from '../services/supabase';
import {
  FiPackage,
  FiTrash2,
  FiCheck,
  FiX,
  FiAlertCircle,
  FiPlusCircle,
  FiEdit2,
  FiShoppingCart,
  FiSliders,
} from 'react-icons/fi';
import { useLockBodyScroll } from '../hooks/useLockBodyScroll';
import { createPortal } from 'react-dom';
import { useFeedback } from '../context/FeedbackContext';

interface ManagePacketTypesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpdated?: () => void;
  initialPacket?: PacketType | null;
}

export const ManagePacketTypesModal: React.FC<ManagePacketTypesModalProps> = ({
  isOpen,
  onClose,
  onUpdated,
  initialPacket,
}) => {
  const { showToast, confirm } = useFeedback();
  useLockBodyScroll(isOpen);

  const [packetTypes, setPacketTypes] = useState<PacketType[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedPacket, setSelectedPacket] = useState<PacketType | null>(null);

  // Operation Mode: 'purchase' (Inward Purchase) vs 'direct' (Direct Edit / Adjustment)
  const [mode, setMode] = useState<'purchase' | 'direct'>('purchase');

  // Form states:
  const [name, setName] = useState('');
  // Inward purchase fields:
  const [quantity, setQuantity] = useState<number | string>('');
  const [totalPrice, setTotalPrice] = useState<number | string>('');
  // Direct adjustment fields:
  const [directStock, setDirectStock] = useState<number | string>('');
  const [directCost, setDirectCost] = useState<number | string>('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const isSinglePacketMode = Boolean(initialPacket);
  const displayedPackets = isSinglePacketMode
    ? (packetTypes.filter((pkt) => pkt.id === initialPacket?.id).length > 0
        ? packetTypes.filter((pkt) => pkt.id === initialPacket?.id)
        : (initialPacket ? [initialPacket] : []))
    : packetTypes;

  const loadData = async () => {
    try {
      setLoading(true);
      const data = await fetchPacketTypes(true);
      setPacketTypes(data);
      if (initialPacket?.id) {
        const fresh = data.find((p) => p.id === initialPacket.id);
        if (fresh) {
          selectPacketForAction(fresh, 'purchase');
        }
      }
    } catch (err: any) {
      console.error('Failed to load packet types:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      if (initialPacket) {
        selectPacketForAction(initialPacket, 'purchase');
      } else {
        resetForm();
      }
      loadData();
    }
  }, [isOpen, initialPacket]);

  const resetForm = () => {
    setSelectedPacket(null);
    setName('');
    setQuantity('');
    setTotalPrice('');
    setDirectStock('');
    setDirectCost('');
    setErrorMsg('');
    setMode('purchase');
  };

  const selectPacketForAction = (pkt: PacketType, opMode: 'purchase' | 'direct' = 'purchase') => {
    setSelectedPacket(pkt);
    setName(pkt.name);
    setMode(opMode);
    setQuantity('');
    setTotalPrice('');
    setDirectStock(pkt.bundleQuantity ?? 0);
    setDirectCost(Number(pkt.costPerPacket ?? 0).toFixed(2));
    setErrorMsg('');
  };

  // Auto-calculated Weighted Average Unit Cost for Inward Purchase:
  const numQty = parseFloat(String(quantity)) || 0;
  const numTotal = parseFloat(String(totalPrice)) || 0;
  const hasTotalPrice = String(totalPrice).trim() !== '' && numTotal > 0;
  const currStock = selectedPacket ? Number(selectedPacket.bundleQuantity ?? 0) : 0;
  const currCost = selectedPacket ? Number(selectedPacket.costPerPacket ?? 0) : 0;
  const purchasedUnitCost = numQty > 0 ? (hasTotalPrice ? numTotal / numQty : currCost) : 0;
  const newPurchaseStock = currStock + Math.round(numQty);
  const newWeightedAvgCost = currStock <= 0
    ? purchasedUnitCost
    : numQty > 0
    ? (hasTotalPrice ? ((currStock * currCost) + numTotal) / newPurchaseStock : currCost)
    : currCost;

  // Direct edit calculations:
  const numDirectStock = parseInt(String(directStock), 10);
  const numDirectCost = parseFloat(String(directCost));
  const validDirectStock = isNaN(numDirectStock) ? 0 : Math.max(0, numDirectStock);
  const validDirectCost = isNaN(numDirectCost) ? 0 : Math.max(0, numDirectCost);
  const stockDelta = selectedPacket ? validDirectStock - currStock : validDirectStock;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setErrorMsg('പാക്കറ്റിന്റെ പേര് നൽകുക (Enter packet name)');
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMsg('');

      if (mode === 'purchase') {
        // OPERATION 1: INWARD PURCHASE
        if (numQty <= 0) {
          setErrorMsg('എണ്ണം നൽകുക (Quantity must be greater than zero)');
          return;
        }
        if (numTotal < 0) {
          setErrorMsg('ആകെ തുക തെറ്റാണ് (Total price cannot be negative)');
          return;
        }

        if (selectedPacket?.id) {
          const finalTotalPrice = hasTotalPrice ? numTotal : Math.round(numQty) * currCost;
          await recordPacketPurchase({
            packetTypeId: selectedPacket.id,
            quantity: Math.round(numQty),
            totalPrice: finalTotalPrice,
            operatorName: 'Admin',
          });
          showToast(
            `${trimmedName}: ${Math.round(numQty)} pcs ചേർത്തു. പുതിയ സ്റ്റോക്ക്: ${newPurchaseStock} pcs${hasTotalPrice ? ` (ശരാശരി: ₹${newWeightedAvgCost.toFixed(2)}/pkt)` : ` (@ ₹${currCost.toFixed(2)}/pkt)`}`,
            'success'
          );
        } else {
          // New packet type with initial purchase
          const unitRate = numQty > 0 ? (hasTotalPrice ? Number((numTotal / numQty).toFixed(4)) : 0) : 0;
          const newQty = Math.round(numQty);
          const bundleCost = Number((newQty * unitRate).toFixed(2));
          await savePacketType({
            name: trimmedName,
            bundleCost,
            bundleQuantity: newQty,
            costPerPacket: unitRate,
          });
          showToast(
            `പുതിയ പാക്കറ്റ് തരം ചേർത്തു: ${trimmedName} (${newQty} pcs @ ₹${unitRate.toFixed(2)})`,
            'success'
          );
        }
      } else {
        // OPERATION 2: DIRECT EDIT / STOCK ADJUSTMENT
        if (validDirectStock < 0) {
          setErrorMsg('സ്റ്റോക്ക് 0 അല്ലെങ്കിൽ അതിൽ കൂടുതൽ ആയിരിക്കണം (Stock cannot be negative)');
          return;
        }
        if (validDirectCost < 0) {
          setErrorMsg('യൂണിറ്റ് വില 0 അല്ലെങ്കിൽ അതിൽ കൂടുതൽ ആയിരിക്കണം (Cost cannot be negative)');
          return;
        }

        if (selectedPacket?.id) {
          await adjustPacketStock({
            packetTypeId: selectedPacket.id,
            newQuantity: validDirectStock,
            costPerPacket: validDirectCost,
            name: trimmedName,
            operatorName: 'Admin',
          });
          showToast(
            `${trimmedName}: സ്റ്റോക്ക് ${validDirectStock} pcs, നിരക്ക് ₹${validDirectCost.toFixed(2)} ആയി ക്രമീകരിച്ചു`,
            'success'
          );
        } else {
          // Create new with exact stock and unit cost
          await savePacketType({
            name: trimmedName,
            bundleCost: Number((validDirectStock * validDirectCost).toFixed(2)),
            bundleQuantity: validDirectStock,
            costPerPacket: validDirectCost,
          });
          showToast(`പുതിയ പാക്കറ്റ് ചേർത്തു: ${trimmedName}`, 'success');
        }
      }

      resetForm();
      await loadData();
      if (onUpdated) onUpdated();
    } catch (err: any) {
      console.error('Failed to save packet type:', err);
      setErrorMsg(err?.message || 'Error saving packet type');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string, pktName: string) => {
    const confirmed = await confirm({
      title: 'പാക്കറ്റ് തരം നീക്കം ചെയ്യണോ? (Delete Packet Type)',
      message: `"${pktName}" പാക്കറ്റ് തരം നീക്കം ചെയ്യണോ? മുൻകാല ഉൽപ്പാദന രേഖകൾ നിലവിലുണ്ടെങ്കിൽ ചരിത്രം നിലനിർത്താൻ ഇത് ആർക്കൈവ് ചെയ്യപ്പെടും. ഇല്ലെങ്കിൽ പൂർണ്ണമായി ഡിലീറ്റ് ചെയ്യപ്പെടും.`,
      confirmLabel: 'ഡിലീറ്റ് / ആർക്കൈവ് ചെയ്യുക',
      cancelLabel: 'റദ്ദാക്കുക',
      isDestructive: true,
    });
    if (!confirmed) return;

    try {
      const res = await deletePacketType(id);
      if (res?.status === 'archived') {
        showToast(`'${pktName}' ചരിത്ര രേഖകൾ ഉള്ളതിനാൽ ആർക്കൈവ് ചെയ്തു (Archived)`, 'info');
      } else {
        showToast(`'${pktName}' വിജയകരമായി നീക്കം ചെയ്തു`, 'success');
      }
      if (selectedPacket?.id === id) {
        resetForm();
      }
      await loadData();
      if (onUpdated) onUpdated();
    } catch (err: any) {
      showToast(`ഡിലീറ്റ് പരാജയപ്പെട്ടു: ${err?.message || 'Error deleting packet type'}`, 'error');
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] overflow-hidden">
      <div
        className="fixed inset-0 w-full h-full bg-black/65 backdrop-blur-md animate-apple-backdrop"
        onClick={() => !isSubmitting && onClose()}
      />

      <div className="fixed inset-0 flex items-center justify-center p-3 sm:p-5 relative z-10 pointer-events-none">
        <div className="w-full max-w-2xl max-h-[92vh] flex flex-col bg-white dark:bg-[#1E1B1B] rounded-3xl border border-stone-200 dark:border-[#2E2828] shadow-apple-modal animate-apple-modal google-modal pointer-events-auto overflow-hidden">
          {/* Header */}
          <div className="p-5 pb-3 border-b border-stone-200 dark:border-[#2E2828] shrink-0 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="p-2.5 rounded-2xl bg-orange-500/10 text-epso-orange dark:text-amber-400">
                <FiPackage className="w-5 h-5 stroke-[2.2]" />
              </span>
              <div>
                <h2 className="text-lg font-bold text-stone-900 dark:text-white font-malayalam leading-tight">
                  പാക്കറ്റ് കവർ സ്റ്റോക്കും നിരക്കുകളും (Packet Inventory & Rates)
                </h2>
                <p className="text-xs text-stone-500 dark:text-stone-400 font-malayalam">
                  വാങ്ങിയ സ്റ്റോക്ക് ചേർക്കുകയോ നേരിട്ട് സ്റ്റോക്കും വിലയും അഡ്ജസ്റ്റ് ചെയ്യുകയോ ചെയ്യാം
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full flex items-center justify-center text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-[#282323] transition-colors cursor-pointer"
            >
              <FiX className="w-5 h-5" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs font-sans">
            {errorMsg && (
              <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/50 text-red-600 dark:text-red-400 text-xs flex items-center gap-2 border border-red-200 dark:border-red-900/60 font-malayalam">
                <FiAlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* FORM CONTAINER */}
            <form onSubmit={handleSubmit} className="p-4 rounded-2xl bg-stone-50 dark:bg-[#141212] border border-stone-200 dark:border-[#282323] space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-bold text-stone-900 dark:text-white font-malayalam flex items-center gap-1.5 text-sm">
                  {mode === 'purchase' ? (
                    <FiShoppingCart className="w-4 h-4 text-epso-orange" />
                  ) : (
                    <FiSliders className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                  )}
                  {selectedPacket
                    ? (mode === 'purchase' ? `സ്റ്റോക്ക് വാങ്ങിയത് ചേർക്കുക: ${selectedPacket.name}` : `സ്റ്റോക്ക് അഡ്ജസ്റ്റ് ചെയ്യുക: ${selectedPacket.name}`)
                    : 'പുതിയ പാക്കറ്റ് കവർ ചേർക്കുക'}
                </span>

                <div className="flex items-center gap-1.5">
                  {/* Mode Selector Toggle */}
                  <div className="inline-flex rounded-xl bg-stone-200/70 dark:bg-[#282323] p-0.5 text-[11px] font-bold font-malayalam">
                    <button
                      type="button"
                      onClick={() => setMode('purchase')}
                      className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer flex items-center gap-1 ${
                        mode === 'purchase'
                          ? 'bg-white dark:bg-[#1E1B1B] text-epso-red dark:text-amber-400 shadow-xs'
                          : 'text-stone-500 dark:text-stone-400 hover:text-stone-700'
                      }`}
                    >
                      <FiShoppingCart className="w-3 h-3" />
                      <span>വാങ്ങിയത് (Inward)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setMode('direct')}
                      className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer flex items-center gap-1 ${
                        mode === 'direct'
                          ? 'bg-white dark:bg-[#1E1B1B] text-purple-700 dark:text-purple-400 shadow-xs'
                          : 'text-stone-500 dark:text-stone-400 hover:text-stone-700'
                      }`}
                    >
                      <FiSliders className="w-3 h-3" />
                      <span>തിരുത്തുക (Edit / Adjust)</span>
                    </button>
                  </div>

                  {selectedPacket && (
                    <button
                      type="button"
                      onClick={resetForm}
                      className="text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 font-bold text-[11px] font-malayalam px-1.5"
                    >
                      പുതിയത്
                    </button>
                  )}
                </div>
              </div>

              {/* Packet Type Name */}
              <div>
                <label className="block font-bold text-stone-700 dark:text-stone-300 font-malayalam mb-1">
                  പാക്കറ്റ് തരം / പേര് (Packet Type Name) *
                </label>
                {selectedPacket && mode === 'purchase' ? (
                  <div className="p-3 rounded-xl bg-stone-100 dark:bg-[#282323] border border-stone-200 dark:border-[#383333] flex items-center justify-between">
                    <div>
                      <span className="font-bold text-stone-900 dark:text-white font-mono text-sm block">{selectedPacket.name}</span>
                      <span className="text-[11px] text-stone-500 font-malayalam">തിരഞ്ഞെടുത്ത പാക്കറ്റ്</span>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-stone-400 block font-bold uppercase font-malayalam">നിലവിലെ സ്റ്റോക്ക് (Current Stock)</span>
                      <span className="text-xs font-black text-amber-600 dark:text-amber-400 font-mono">
                        {currStock} pcs <span className="text-stone-400 font-normal">(@ ₹{currCost.toFixed(2)}/pkt)</span>
                      </span>
                    </div>
                  </div>
                ) : (
                  <input
                    type="text"
                    required
                    placeholder="e.g. 10 x 12 Packet, 2KG HM Packet"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full google-input text-stone-900 dark:text-white font-bold"
                  />
                )}
              </div>

              {/* MODE A: INWARD PURCHASE */}
              {mode === 'purchase' && (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    {/* 1. Quantity Purchased / Added */}
                    <div>
                      <label className="block font-bold text-stone-700 dark:text-stone-300 font-malayalam mb-1">
                        {selectedPacket ? 'വാങ്ങിയ എണ്ണം / ചേർക്കേണ്ട അളവ് (pcs) *' : 'വാങ്ങിയ എണ്ണം / Quantity (pcs) *'}
                      </label>
                      <input
                        type="number"
                        step="1"
                        min="1"
                        required
                        placeholder={selectedPacket ? "e.g. 100" : "e.g. 500"}
                        value={quantity}
                        onChange={(e) => setQuantity(e.target.value)}
                        className="w-full google-input text-stone-900 dark:text-white font-bold font-mono text-sm"
                      />
                    </div>

                    {/* 2. Total Purchase Price (Optional if existing packet) */}
                    <div>
                      <label className="block font-bold text-stone-700 dark:text-stone-300 font-malayalam mb-1">
                        {selectedPacket ? 'ആകെ തുക / Total Price (₹) (Optional)' : 'ആകെ തുക / Total Price (₹) *'}
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        required={!selectedPacket}
                        placeholder={selectedPacket ? `ഒഴിവാക്കിയാൽ പഴയ നിരക്ക് (₹${currCost.toFixed(2)}) തുടരും` : "e.g. 1250"}
                        value={totalPrice}
                        onChange={(e) => setTotalPrice(e.target.value)}
                        className="w-full google-input text-stone-900 dark:text-white font-bold font-mono text-sm"
                      />
                    </div>
                  </div>

                  {/* Live Balance Preview Card */}
                  {numQty > 0 && (
                    <div className="p-3.5 rounded-2xl bg-orange-500/10 border border-orange-500/20 space-y-2 font-malayalam">
                      {/* Live Balance Preview matching Ingredient Adjust Stock */}
                      <div className="flex flex-wrap items-center justify-between text-xs">
                        <span className="font-bold text-stone-700 dark:text-stone-300">
                          പുതിയ സ്റ്റോക്ക് ബാലൻസ്:
                        </span>
                        <span className="text-sm font-black text-stone-900 dark:text-white font-mono">
                          {selectedPacket ? (
                            <>
                              <span className="text-stone-600 dark:text-stone-400">{currStock}</span> + <span className="text-amber-600 dark:text-amber-400">{Math.round(numQty)}</span> = <span className="text-emerald-600 dark:text-emerald-400">{newPurchaseStock} pcs</span>
                            </>
                          ) : (
                            <span className="text-emerald-600 dark:text-emerald-400">{newPurchaseStock} pcs</span>
                          )}
                        </span>
                      </div>

                      {hasTotalPrice ? (
                        <>
                          <div className="flex flex-wrap items-center justify-between text-xs pt-1 border-t border-orange-500/20">
                            <span className="text-stone-600 dark:text-stone-400">
                              വാങ്ങിയ നിരക്ക് (Purchased Rate):
                            </span>
                            <span className="font-mono font-bold text-stone-900 dark:text-white">
                              ₹{numTotal.toFixed(2)} / {Math.round(numQty)} pcs = ₹{purchasedUnitCost.toFixed(2)} / pkt
                            </span>
                          </div>

                          <div className="pt-1 flex flex-wrap items-center justify-between text-xs">
                            <span className="font-bold text-orange-950 dark:text-amber-300">
                              പുതിയ ശരാശരി വില (Weighted Avg Cost):
                            </span>
                            <span className="text-sm font-black text-emerald-600 dark:text-emerald-400 font-mono">
                              ₹{newWeightedAvgCost.toFixed(2)} / pkt
                            </span>
                          </div>
                        </>
                      ) : (
                        selectedPacket && (
                          <div className="pt-1 border-t border-orange-500/20 flex flex-wrap items-center justify-between text-[11px]">
                            <span className="text-stone-500 dark:text-stone-400">
                              പഴയ നിരക്ക് മാറ്റമില്ലാതെ തുടരും:
                            </span>
                            <span className="font-mono font-bold text-stone-700 dark:text-stone-300">
                              ₹{currCost.toFixed(2)} / pkt
                            </span>
                          </div>
                        )
                      )}
                    </div>
                  )}
                </>
              )}

              {/* MODE B: DIRECT EDIT / ADJUSTMENT */}
              {mode === 'direct' && (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    {/* Exact Stock (pcs) */}
                    <div>
                      <label className="block font-bold text-stone-700 dark:text-stone-300 font-malayalam mb-1">
                        യഥാർത്ഥ സ്റ്റോക്ക് / Exact Stock (pcs) *
                      </label>
                      <input
                        type="number"
                        step="1"
                        min="0"
                        required
                        placeholder="e.g. 450"
                        value={directStock}
                        onChange={(e) => setDirectStock(e.target.value)}
                        className="w-full google-input text-stone-900 dark:text-white font-bold font-mono text-sm"
                      />
                    </div>

                    {/* Cost per packet */}
                    <div>
                      <label className="block font-bold text-stone-700 dark:text-stone-300 font-malayalam mb-1">
                        ഒരു പാക്കറ്റിന്റെ വില / Cost per Packet (₹) *
                      </label>
                      <input
                        type="number"
                        step="0.0001"
                        min="0"
                        required
                        placeholder="e.g. 2.50"
                        value={directCost}
                        onChange={(e) => setDirectCost(e.target.value)}
                        className="w-full google-input text-stone-900 dark:text-white font-bold font-mono text-sm"
                      />
                    </div>
                  </div>

                  {/* Direct Adjustment Preview Card */}
                  {selectedPacket && (
                    <div className="p-3.5 rounded-2xl bg-purple-500/10 border border-purple-500/20 space-y-1 font-malayalam text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-stone-600 dark:text-stone-300">സ്റ്റോക്ക് വ്യത്യാസം (Stock Delta):</span>
                        <span className={`font-mono font-bold ${stockDelta >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                          {stockDelta >= 0 ? `+${stockDelta}` : stockDelta} pcs ({currStock} → {validDirectStock})
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-stone-600 dark:text-stone-300">
                        <span>പുതിയ ആകെ മൂല്യം (Valuation):</span>
                        <span className="font-mono font-black text-purple-700 dark:text-purple-300">
                          ₹{(validDirectStock * validDirectCost).toFixed(2)}
                        </span>
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Submit Buttons */}
              <div className="flex items-center justify-end gap-2 pt-1 font-malayalam">
                <button
                  type="submit"
                  disabled={isSubmitting || (mode === 'purchase' && numQty <= 0)}
                  className="px-5 py-2.5 rounded-xl bg-epso-red hover:bg-epso-red-hover dark:bg-amber-500 dark:hover:bg-amber-600 text-white dark:text-stone-950 font-bold text-xs shadow-sm press-apple flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <span>സൂക്ഷിക്കുന്നു...</span>
                  ) : (
                    <>
                      <FiCheck className="w-4 h-4" />
                      <span>
                        {mode === 'purchase'
                          ? 'വാങ്ങിയ സ്റ്റോക്ക് ചേർക്കുക (Add Stock)'
                          : 'സ്റ്റോക്കും വിലയും അപ്ഡേറ്റ് ചെയ്യുക (Update)'}
                      </span>
                    </>
                  )}
                </button>
              </div>
            </form>

            {/* List of Defined Packet Types */}
            <div className="space-y-2">
              <div className="flex items-center justify-between font-malayalam">
                <span className="font-bold text-stone-700 dark:text-stone-300">
                  {isSinglePacketMode
                    ? 'തിരഞ്ഞെടുത്ത പാക്കറ്റ് കവർ:'
                    : `നിലവിലെ പാക്കറ്റ് കവറുകൾ (${packetTypes.length} എണ്ണം):`}
                </span>
                {loading && <span className="text-stone-400 animate-pulse text-[11px]">റീലോഡ് ചെയ്യുന്നു...</span>}
              </div>

              <div className={`grid gap-2.5 ${isSinglePacketMode ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2'}`}>
                {displayedPackets.map((pkt) => {
                  const isSelected = selectedPacket?.id === pkt.id;
                  const stockCount = Math.max(0, Number(pkt.bundleQuantity ?? 0));
                  const isOutOfStock = stockCount <= 0;
                  const cPerPkt = Number(pkt.costPerPacket) || 0;
                  const totalValuation = stockCount * cPerPkt;
                  const isArchived = pkt.isActive === false;

                  return (
                    <div
                      key={pkt.id}
                      onClick={() => selectPacketForAction(pkt, 'purchase')}
                      className={`p-3 rounded-2xl border transition-all flex flex-col justify-between gap-2 cursor-pointer ${
                        isSelected
                          ? 'border-epso-red dark:border-amber-500 bg-orange-50/50 dark:bg-amber-950/20 ring-2 ring-orange-500/20'
                          : isArchived
                          ? 'border-stone-200 dark:border-[#282323] bg-stone-100/60 dark:bg-[#181515] opacity-60'
                          : 'border-stone-200 dark:border-[#282323] bg-white dark:bg-[#1E1B1B] hover:border-orange-300'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-1.5">
                            <h4 className="font-black text-stone-900 dark:text-white text-sm">
                              {pkt.name}
                            </h4>
                            {isArchived && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] bg-stone-200 dark:bg-[#282323] text-stone-600 dark:text-stone-400 font-bold font-malayalam">
                                ആർക്കൈവ്ഡ്
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-1 text-stone-500 dark:text-stone-400 font-mono text-[11px]">
                            <span
                              className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                                isOutOfStock
                                  ? 'bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-400'
                                  : 'bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300'
                              }`}
                            >
                              {stockCount} pcs
                            </span>
                            <span>•</span>
                            <span>₹{cPerPkt.toFixed(2)} / കവർ</span>
                          </div>
                          <div className="text-[10px] text-stone-400 font-mono mt-0.5">
                            ആകെ മൂല്യം: ₹{totalValuation.toFixed(2)}
                          </div>
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              selectPacketForAction(pkt, 'direct');
                            }}
                            className="p-1.5 text-stone-400 hover:text-purple-600 dark:hover:text-purple-400 rounded-lg transition-colors cursor-pointer"
                            title="നേരിട്ട് തിരുത്തുക (Edit / Adjust Stock)"
                          >
                            <FiEdit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(pkt.id, pkt.name);
                            }}
                            className="p-1.5 text-stone-400 hover:text-red-500 rounded-lg transition-colors cursor-pointer"
                            title="ഡിലീറ്റ് / ആർക്കൈവ്"
                          >
                            <FiTrash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {displayedPackets.length === 0 && !loading && (
                <div className="py-8 text-center text-stone-400 font-malayalam">
                  പാക്കറ്റുകൾ ചേർത്തിട്ടില്ല
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="p-4 px-5 border-t border-stone-100 dark:border-[#2E2828] bg-stone-50/80 dark:bg-[#1A1616]/80 backdrop-blur-sm shrink-0 flex items-center justify-end font-malayalam">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 rounded-xl bg-stone-200 dark:bg-[#282323] hover:bg-stone-300 dark:hover:bg-[#342e2e] text-stone-800 dark:text-stone-200 font-bold cursor-pointer"
            >
              പൂർത്തിയായി (Done)
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
