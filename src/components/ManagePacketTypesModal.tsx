import React, { useState, useEffect } from 'react';
import { PacketType } from '../types';
import {
  fetchPacketTypes,
  savePacketType,
  deletePacketType,
} from '../services/supabase';
import {
  FiPackage,
  FiTrash2,
  FiCheck,
  FiX,
  FiAlertCircle,
  FiPlusCircle,
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

  // Form states: Admin enters ONLY Quantity and Total Price
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState<number | string>('');
  const [totalPrice, setTotalPrice] = useState<number | string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const loadData = async () => {
    try {
      setLoading(true);
      const data = await fetchPacketTypes(true);
      setPacketTypes(data);
      if (initialPacket?.id) {
        const fresh = data.find((p) => p.id === initialPacket.id);
        if (fresh) {
          selectPacketForPurchase(fresh);
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
        selectPacketForPurchase(initialPacket);
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
    setErrorMsg('');
  };

  const selectPacketForPurchase = (pkt: PacketType) => {
    setSelectedPacket(pkt);
    setName(pkt.name);
    setQuantity('');
    setTotalPrice('');
    setErrorMsg('');
  };

  // Auto-calculated Cover Unit Cost: Total Price / Quantity
  const numQty = parseFloat(String(quantity)) || 0;
  const numTotal = parseFloat(String(totalPrice)) || 0;
  const coverUnitCost = numQty > 0 && numTotal > 0 ? Number((numTotal / numQty).toFixed(4)) : (selectedPacket?.costPerPacket || 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setErrorMsg('പാക്കറ്റിന്റെ പേര് നൽകുക (Enter packet name)');
      return;
    }

    if (numQty <= 0) {
      setErrorMsg('എണ്ണം നൽകുക (Quantity must be greater than zero)');
      return;
    }

    if (numTotal < 0) {
      setErrorMsg('ആകെ തുക തെറ്റാണ് (Total price cannot be negative)');
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMsg('');

      const existingStock = selectedPacket ? Number(selectedPacket.bundleQuantity ?? 0) : 0;
      // Packet stock increases by the entered quantity
      const newStock = existingStock + Math.round(numQty);
      const unitCost = numQty > 0 ? Number((numTotal / numQty).toFixed(4)) : 0;
      const newBundleCost = Number((newStock * unitCost).toFixed(2));

      await savePacketType({
        id: selectedPacket?.id || undefined,
        name: trimmedName,
        bundleCost: newBundleCost,
        bundleQuantity: newStock,
        costPerPacket: unitCost,
      });

      showToast(
        `${trimmedName}: ${Math.round(numQty)} pcs ചേർത്തു. പുതിയ സ്റ്റോക്ക്: ${newStock} pcs (₹${unitCost.toFixed(2)}/കവർ)`,
        'success'
      );
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
      title: 'പാക്കറ്റ് തരം നീക്കം ചെയ്യണോ?',
      message: `"${pktName}" പാക്കറ്റ് തരം നീക്കം ചെയ്യണോ?`,
      confirmLabel: 'ഡിലീറ്റ് ചെയ്യുക',
      cancelLabel: 'റദ്ദാക്കുക',
      isDestructive: true,
    });
    if (!confirmed) return;

    try {
      await deletePacketType(id);
      showToast('പാക്കറ്റ് തരം വിജയകരമായി നീക്കം ചെയ്തു', 'success');
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
        <div className="w-full max-w-2xl max-h-[90vh] flex flex-col bg-white dark:bg-[#1E1B1B] rounded-3xl border border-stone-200 dark:border-[#2E2828] shadow-apple-modal animate-apple-modal google-modal pointer-events-auto overflow-hidden">
          {/* Header */}
          <div className="p-5 pb-3 border-b border-stone-200 dark:border-[#2E2828] shrink-0 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="p-2 rounded-xl bg-orange-500/10 text-epso-orange dark:text-amber-400">
                <FiPackage className="w-5 h-5 stroke-[2.2]" />
              </span>
              <div>
                <h2 className="text-lg font-bold text-stone-900 dark:text-white font-malayalam leading-tight">
                  പാക്കറ്റ് കവറുകൾ ചേർക്കുക (Packet Covers & Stock)
                </h2>
                <p className="text-xs text-stone-500 dark:text-stone-400 font-malayalam">
                  എണ്ണവും ആകെ തുകയും നൽകി കവർ സ്റ്റോക്ക് ചേർക്കുക
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
          <div className="flex-1 overflow-y-auto p-5 space-y-5 text-xs">
            {errorMsg && (
              <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/50 text-red-600 dark:text-red-400 text-xs flex items-center gap-2 border border-red-200 dark:border-red-900/60">
                <FiAlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Form: Enter ONLY Quantity + Total Price */}
            <form onSubmit={handleSubmit} className="p-4 rounded-2xl bg-stone-50 dark:bg-[#141212] border border-stone-200 dark:border-[#282323] space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-bold text-stone-900 dark:text-white font-malayalam flex items-center gap-1.5 text-sm">
                  <FiPlusCircle className="w-4 h-4 text-epso-orange" />
                  {selectedPacket ? `സ്റ്റോക്ക് ചേർക്കുക: ${selectedPacket.name}` : 'പുതിയ പാക്കറ്റ് കവർ ചേർക്കുക'}
                </span>
                {selectedPacket && (
                  <button
                    type="button"
                    onClick={resetForm}
                    className="text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 font-bold text-[11px]"
                  >
                    പുതിയത് ചേർക്കാൻ മാറ്റുക
                  </button>
                )}
              </div>

              {/* Packet Type Selection */}
              <div>
                <label className="block font-bold text-stone-700 dark:text-stone-300 font-malayalam mb-1">
                  പാക്കറ്റ് തരം / പേര് (Packet Type) *
                </label>
                {selectedPacket ? (
                  <div className="p-2.5 rounded-xl bg-stone-200/60 dark:bg-[#282323] flex items-center justify-between">
                    <span className="font-bold text-stone-900 dark:text-white font-mono text-sm">{selectedPacket.name}</span>
                    <span className="text-[11px] font-bold text-stone-500">
                      നിലവിലെ സ്റ്റോക്ക്: {selectedPacket.bundleQuantity ?? 0} pcs
                    </span>
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                {/* 1. Quantity (number of covers purchased, e.g. 500) */}
                <div>
                  <label className="block font-bold text-stone-700 dark:text-stone-300 font-malayalam mb-1">
                    വാങ്ങിയ എണ്ണം / Quantity (pcs) *
                  </label>
                  <input
                    type="number"
                    step="1"
                    min="1"
                    required
                    placeholder="e.g. 500"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    className="w-full google-input text-stone-900 dark:text-white font-bold font-mono text-sm"
                  />
                </div>

                {/* 2. Total Price (total purchase amount, e.g. ₹250) */}
                <div>
                  <label className="block font-bold text-stone-700 dark:text-stone-300 font-malayalam mb-1">
                    ആകെ വില / Total Price (₹) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    placeholder="e.g. 250"
                    value={totalPrice}
                    onChange={(e) => setTotalPrice(e.target.value)}
                    className="w-full google-input text-stone-900 dark:text-white font-bold font-mono text-sm"
                  />
                </div>
              </div>

              {/* Auto-Calculated Summary Card */}
              {numQty > 0 && (
                <div className="p-3 rounded-xl bg-orange-500/10 border border-orange-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-2 mt-2">
                  <div>
                    <span className="font-bold text-orange-900 dark:text-amber-300 block font-malayalam">
                      ഒരു കവറിന്റെ ചിലവ് (Cover Unit Cost):
                    </span>
                    <span className="text-[11px] text-stone-500 dark:text-stone-400 font-mono">
                      ₹{numTotal} / {numQty} pcs = ₹{coverUnitCost.toFixed(2)} / കവർ
                    </span>
                  </div>

                  <div className="text-right">
                    <span className="text-[11px] text-stone-500 block font-malayalam">പുതിയ ആകെ സ്റ്റോക്ക്:</span>
                    <span className="text-sm font-black text-emerald-600 dark:text-emerald-400 font-mono">
                      {((selectedPacket?.bundleQuantity ?? 0) + Math.round(numQty))} pcs
                    </span>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="submit"
                  disabled={isSubmitting || numQty <= 0}
                  className="px-5 py-2.5 rounded-xl bg-epso-red hover:bg-epso-red-hover dark:bg-amber-500 dark:hover:bg-amber-600 text-white dark:text-stone-950 font-bold text-xs shadow-sm press-apple flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <span>സൂക്ഷിക്കുന്നു...</span>
                  ) : (
                    <>
                      <FiCheck className="w-4 h-4" />
                      <span>സ്റ്റോക്ക് ചേർക്കുക (Add Stock)</span>
                    </>
                  )}
                </button>
              </div>
            </form>

            {/* List of Defined Packet Types */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-stone-700 dark:text-stone-300 font-malayalam">
                  പാക്കറ്റ് കവർ സ്റ്റോക്ക് ({packetTypes.length} എണ്ണം):
                </span>
                {loading && <span className="text-stone-400 animate-pulse">റീലോഡ് ചെയ്യുന്നു...</span>}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {packetTypes.map((pkt) => {
                  const isSelected = selectedPacket?.id === pkt.id;
                  const stockCount = Math.max(0, Number(pkt.bundleQuantity ?? 0));
                  const isOutOfStock = stockCount <= 0;
                  const cPerPkt = Number(pkt.costPerPacket) || 0;

                  return (
                    <div
                      key={pkt.id}
                      onClick={() => selectPacketForPurchase(pkt)}
                      className={`p-3 rounded-2xl border transition-all flex flex-col justify-between gap-2 cursor-pointer ${
                        isSelected
                          ? 'border-epso-red dark:border-amber-500 bg-orange-50/50 dark:bg-amber-950/20 ring-2 ring-orange-500/20'
                          : 'border-stone-200 dark:border-[#282323] bg-white dark:bg-[#1E1B1B] hover:border-orange-300'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h4 className="font-black text-stone-900 dark:text-white text-sm">
                            {pkt.name}
                          </h4>
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
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(pkt.id, pkt.name);
                            }}
                            className="p-1.5 text-stone-400 hover:text-red-500 rounded-lg transition-colors cursor-pointer"
                            title="ഡിലീറ്റ്"
                          >
                            <FiTrash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {packetTypes.length === 0 && !loading && (
                <div className="py-8 text-center text-stone-400 font-malayalam">
                  പാക്കറ്റുകൾ ചേർത്തിട്ടില്ല
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="p-4 px-5 border-t border-stone-100 dark:border-[#2E2828] bg-stone-50/80 dark:bg-[#1A1616]/80 backdrop-blur-sm shrink-0 flex items-center justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 rounded-xl bg-stone-200 dark:bg-[#282323] hover:bg-stone-300 dark:hover:bg-[#342e2e] text-stone-800 dark:text-stone-200 font-bold font-malayalam cursor-pointer"
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
