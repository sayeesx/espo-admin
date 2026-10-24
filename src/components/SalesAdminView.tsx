import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  FiDollarSign,
  FiPlus,
  FiTrash2,
  FiCalendar,
  FiShoppingBag,
  FiUser,
  FiX,
  FiCheck,
  FiAlertCircle,
  FiSearch,
  FiPrinter,
  FiUserPlus,
  FiRefreshCw,
  FiCopy,
} from 'react-icons/fi';
import { Product, SaleRecord } from '../types';
import { fetchSales, recordSale, deleteSale, fetchProductSellingPrices } from '../services/supabase';
import { AnimatedNumber } from './AnimatedNumber';
import { createPortal } from 'react-dom';
import { ThemeSelect } from './ThemeSelect';

interface SalesAdminViewProps {
  products: Product[];
}

interface BuyerInfo {
  name: string;
  phone?: string;
  shopName?: string;
}

export const SalesAdminView: React.FC<SalesAdminViewProps> = ({ products }) => {
  const [sales, setSales] = useState<SaleRecord[]>([]);
  const [costingPrices, setCostingPrices] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedDateFilter, setSelectedDateFilter] = useState<string>('');

  // Bill print modal state
  const [activeBillSale, setActiveBillSale] = useState<SaleRecord | null>(null);
  const [isBillModalOpen, setIsBillModalOpen] = useState<boolean>(false);
  const [deletingSaleId, setDeletingSaleId] = useState<string | null>(null);
  const [billCopied, setBillCopied] = useState<boolean>(false);

  const handleCopyBillWhatsApp = () => {
    if (!activeBillSale) return;
    const text = `🧾 *EPSO FOOD PRODUCTS - INVOICE*
--------------------------------
Invoice: #EPS-${String(activeBillSale.id).slice(0, 8).toUpperCase()}
Date: ${activeBillSale.sale_date}
Customer: ${activeBillSale.customer_name || 'Counter Sale'}
Payment: ${String(activeBillSale.payment_method || 'CASH').toUpperCase()} (${activeBillSale.payment_status === 'paid' ? 'PAID' : 'PENDING'})
--------------------------------
*Item:* ${activeBillSale.product_name}
*Qty:* ${activeBillSale.quantity} ${activeBillSale.unit}
*Rate:* ₹${Number(activeBillSale.unit_price).toFixed(2)}
--------------------------------
*Total Amount:* ₹${Number(activeBillSale.total_amount).toFixed(2)}
--------------------------------
_Thank you for your business!_
EPSO Food Products, Kerala`;

    navigator.clipboard.writeText(text).then(() => {
      setBillCopied(true);
      setTimeout(() => setBillCopied(false), 2000);
    });
  };

  // Buyers management state
  const [buyersList, setBuyersList] = useState<BuyerInfo[]>(() => {
    try {
      const saved = localStorage.getItem('epso_buyers_list');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [showAddBuyerModal, setShowAddBuyerModal] = useState<boolean>(false);
  const [newBuyerName, setNewBuyerName] = useState<string>('');
  const [newBuyerPhone, setNewBuyerPhone] = useState<string>('');
  const [newBuyerShop, setNewBuyerShop] = useState<string>('');

  // Form State
  const [saleDate, setSaleDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [productId, setProductId] = useState<string>('');
  const [quantity, setQuantity] = useState<string>('1');
  const [unit, setUnit] = useState<string>('kg');
  const [unitPrice, setUnitPrice] = useState<string>('');
  const [customerName, setCustomerName] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<string>('cash');
  const [paymentStatus, setPaymentStatus] = useState<string>('paid');
  const [notes, setNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [fetchedCostingRate, setFetchedCostingRate] = useState<number | null>(null);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [salesData, pricesData] = await Promise.all([
        fetchSales(),
        fetchProductSellingPrices(),
      ]);

      setSales(salesData);

      // Build costing price map (Product-wise Costing Sell Price/kg)
      const priceMap: Record<string, number> = {};
      for (const p of pricesData) {
        if (p.productId && p.wholesalePricePerKg > 0) {
          priceMap[p.productId] = p.wholesalePricePerKg;
        }
      }
      setCostingPrices(priceMap);

      // Extract past buyers if not in list
      const pastBuyerNames = Array.from(new Set(salesData.map((s) => s.customer_name).filter(Boolean)));
      setBuyersList((prev) => {
        const existingNames = new Set(prev.map((b) => b.name.toLowerCase()));
        const additions: BuyerInfo[] = [];
        for (const name of pastBuyerNames) {
          if (name && !existingNames.has(name.toLowerCase())) {
            additions.push({ name });
          }
        }
        return [...prev, ...additions];
      });
    } catch (err) {
      console.error('Failed to load sales data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Save buyers list to localStorage
  const handleAddNewBuyer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBuyerName.trim()) return;

    const newBuyer: BuyerInfo = {
      name: newBuyerName.trim(),
      phone: newBuyerPhone.trim() || undefined,
      shopName: newBuyerShop.trim() || undefined,
    };

    const updated = [newBuyer, ...buyersList.filter((b) => b.name.toLowerCase() !== newBuyer.name.toLowerCase())];
    setBuyersList(updated);
    try {
      localStorage.setItem('epso_buyers_list', JSON.stringify(updated));
    } catch (err) {
      console.error('Failed to save buyers:', err);
    }

    setCustomerName(newBuyer.name);
    setNewBuyerName('');
    setNewBuyerPhone('');
    setNewBuyerShop('');
    setShowAddBuyerModal(false);
  };

  // When product changes in form, auto-fetch unit price from Product-wise Costing Sell Price/kg
  const handleProductChange = (pId: string) => {
    setProductId(pId);
    const prod = products.find((p) => p.id === pId);
    if (!prod) {
      setFetchedCostingRate(null);
      return;
    }

    // Default unit
    if (prod.unit) {
      setUnit(prod.unit);
    }

    // Costing Sell Price/kg priority
    const costingSellPrice = costingPrices[pId];
    if (costingSellPrice && costingSellPrice > 0) {
      setUnitPrice(String(costingSellPrice));
      setFetchedCostingRate(costingSellPrice);
    } else if (prod.wholesalePrice && prod.wholesalePrice > 0) {
      setUnitPrice(String(prod.wholesalePrice));
      setFetchedCostingRate(prod.wholesalePrice);
    } else {
      setUnitPrice('');
      setFetchedCostingRate(null);
    }
  };

  const calculatedTotal = useMemo(() => {
    const q = parseFloat(quantity) || 0;
    const p = parseFloat(unitPrice) || 0;
    return q * p;
  }, [quantity, unitPrice]);

  const saveSaleRecord = async (shouldPrint: boolean = false) => {
    setErrorMsg('');

    const prod = products.find((p) => p.id === productId);
    const finalProductName = prod ? prod.name : 'മറ്റു വിൽപ്പനകൾ';
    const numQty = parseFloat(quantity) || 0;
    const numPrice = parseFloat(unitPrice) || 0;

    if (numQty <= 0) {
      setErrorMsg('അളവ് 0-ൽ കൂടുതലായിരിക്കണം');
      return null;
    }
    if (numPrice <= 0) {
      setErrorMsg('വില നൽകുക');
      return null;
    }

    setIsSubmitting(true);
    try {
      const saved = await recordSale({
        sale_date: saleDate,
        product_id: productId || undefined,
        product_name: finalProductName,
        quantity: numQty,
        unit: unit || 'kg',
        unit_price: numPrice,
        total_amount: numQty * numPrice,
        customer_name: customerName.trim() || undefined,
        payment_method: paymentMethod,
        payment_status: paymentStatus,
        notes: notes.trim() || undefined,
      });

      setIsModalOpen(false);
      // Reset form
      setProductId('');
      setQuantity('1');
      setUnitPrice('');
      setCustomerName('');
      setNotes('');
      await loadData();

      if (shouldPrint && saved) {
        setActiveBillSale(saved);
        setIsBillModalOpen(true);
      }
      return saved;
    } catch (err: any) {
      setErrorMsg(err.message || 'വിൽപ്പന സേവ് ചെയ്യാനായില്ല');
      return null;
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await saveSaleRecord(false);
  };

  const handleSaveAndPrintBill = async () => {
    await saveSaleRecord(true);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('ഈ വിൽപ്പന റെക്കോർഡ് നീക്കം ചെയ്യണോ?')) return;
    try {
      setDeletingSaleId(id);
      await deleteSale(id);
      setSales((prev) => prev.filter((s) => s.id !== id));
    } catch (err) {
      alert('ഡിലീറ്റ് ചെയ്യാനായില്ല');
    } finally {
      setDeletingSaleId(null);
    }
  };

  // Filtered Sales
  const filteredSales = useMemo(() => {
    return sales.filter((s) => {
      const matchesSearch =
        searchQuery === '' ||
        s.product_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (s.customer_name && s.customer_name.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesDate =
        selectedDateFilter === '' || s.sale_date === selectedDateFilter;

      return matchesSearch && matchesDate;
    });
  }, [sales, searchQuery, selectedDateFilter]);

  // Statistics
  const todayStr = new Date().toISOString().split('T')[0];
  const currentMonthStr = todayStr.substring(0, 7);

  const stats = useMemo(() => {
    let todayTotal = 0;
    let monthTotal = 0;
    let allTotal = 0;
    let totalQty = 0;

    sales.forEach((s) => {
      const amt = Number(s.total_amount) || 0;
      allTotal += amt;
      totalQty += Number(s.quantity) || 0;

      if (s.sale_date === todayStr) {
        todayTotal += amt;
      }
      if (s.sale_date.startsWith(currentMonthStr)) {
        monthTotal += amt;
      }
    });

    return {
      todayTotal,
      monthTotal,
      allTotal,
      totalQty,
      ordersCount: sales.length,
    };
  }, [sales, todayStr, currentMonthStr]);

  return (
    <div className="space-y-6 font-malayalam">
      {/* Printable Receipt CSS */}
      <style>{`
        @media print {
          @page {
            size: auto;
            margin: 4mm 6mm;
          }
          body {
            background: #ffffff !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          body * {
            visibility: hidden !important;
          }
          #epso-bill-print-area, #epso-bill-print-area * {
            visibility: visible !important;
          }
          #epso-bill-print-area {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            max-width: 380px !important;
            margin: 0 auto !important;
            padding: 12px 14px !important;
            background: #ffffff !important;
            color: #000000 !important;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
            border: 1px dashed #aaaaaa !important;
            border-radius: 4px !important;
            box-shadow: none !important;
            z-index: 999999 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .no-print, .no-print * {
            display: none !important;
            visibility: hidden !important;
          }
        }
      `}</style>

      {/* New Sale Action */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-base font-black text-stone-900 dark:text-white">
            വിൽപ്പന മാനേജ്‌മെന്റ് (Sales)
          </h2>
          <p className="text-xs text-stone-500 dark:text-stone-400">
            ഉൽപ്പന്നങ്ങളുടെ വിറ്റുവരവും ബില്ലിംഗും
          </p>
        </div>

        <button
          onClick={() => {
            setSaleDate(todayStr);
            if (products.length > 0 && !productId) {
              handleProductChange(products[0].id);
            }
            setIsModalOpen(true);
          }}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-apple cursor-pointer press-apple transition-all"
        >
          <FiPlus className="w-4 h-4" />
          <span>വിൽപ്പന രേഖപ്പെടുത്തുക</span>
        </button>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="p-4 rounded-3xl bg-white dark:bg-[#1E1B1B] border border-stone-200 dark:border-[#2E2828] shadow-apple-card">
          <p className="text-[11px] font-bold text-stone-400">ഇന്നത്തെ വിൽപ്പന</p>
          <p className="text-xl sm:text-2xl font-black text-emerald-600 dark:text-emerald-400 font-mono mt-1">
            <AnimatedNumber value={stats.todayTotal} prefix="₹" decimals={2} />
          </p>
          <p className="text-[10px] text-stone-400 mt-0.5">ഇന്ന് ലഭിച്ച തുക</p>
        </div>

        <div className="p-4 rounded-3xl bg-white dark:bg-[#1E1B1B] border border-stone-200 dark:border-[#2E2828] shadow-apple-card">
          <p className="text-[11px] font-bold text-stone-400">ഈ മാസത്തെ വിൽപ്പന</p>
          <p className="text-xl sm:text-2xl font-black text-stone-900 dark:text-white font-mono mt-1">
            <AnimatedNumber value={stats.monthTotal} prefix="₹" decimals={2} />
          </p>
          <p className="text-[10px] text-stone-400 mt-0.5">നടപ്പു മാസം</p>
        </div>

        <div className="p-4 rounded-3xl bg-white dark:bg-[#1E1B1B] border border-stone-200 dark:border-[#2E2828] shadow-apple-card">
          <p className="text-[11px] font-bold text-stone-400">ആകെ വിറ്റ തുക</p>
          <p className="text-xl sm:text-2xl font-black text-stone-900 dark:text-white font-mono mt-1">
            <AnimatedNumber value={stats.allTotal} prefix="₹" decimals={2} />
          </p>
          <p className="text-[10px] text-stone-400 mt-0.5">ആകെ റെക്കോർഡുകൾ: {stats.ordersCount}</p>
        </div>

        <div className="p-4 rounded-3xl bg-white dark:bg-[#1E1B1B] border border-stone-200 dark:border-[#2E2828] shadow-apple-card">
          <p className="text-[11px] font-bold text-stone-400">വിറ്റ അളവ്</p>
          <p className="text-xl sm:text-2xl font-black text-amber-600 dark:text-amber-400 font-mono mt-1">
            <AnimatedNumber value={stats.totalQty} decimals={1} />
          </p>
          <p className="text-[10px] text-stone-400 mt-0.5">ആകെ പാക്കറ്റ് / kg</p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="p-3 bg-white dark:bg-[#1E1B1B] rounded-2xl border border-stone-200 dark:border-[#2E2828] flex flex-wrap items-center gap-2.5">
        <div className="relative flex-1 min-w-[180px]">
          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
          <input
            type="text"
            placeholder="ഉൽപ്പന്നം അല്ലെങ്കിൽ ഉപഭോക്താവിനെ തിരയുക..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-stone-50 dark:bg-[#141212] text-stone-900 dark:text-white border border-stone-200 dark:border-[#2E2828] rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <FiCalendar className="w-4 h-4 text-stone-400" />
          <input
            type="date"
            value={selectedDateFilter}
            onChange={(e) => setSelectedDateFilter(e.target.value)}
            className="px-2.5 py-1.5 text-xs bg-stone-50 dark:bg-[#141212] text-stone-900 dark:text-white border border-stone-200 dark:border-[#2E2828] rounded-xl font-mono focus:outline-none"
          />
          {selectedDateFilter && (
            <button
              onClick={() => setSelectedDateFilter('')}
              className="text-[11px] text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 ml-1 cursor-pointer"
            >
              എല്ലാം
            </button>
          )}
        </div>
      </div>

      {/* Sales List Table */}
      <div className="bg-white dark:bg-[#1E1B1B] rounded-3xl border border-stone-200 dark:border-[#2E2828] shadow-apple-card overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-xs text-stone-400 flex items-center justify-center gap-2">
            <FiRefreshCw className="w-4 h-4 animate-spin text-epso-red" />
            <span>വിൽപ്പന വിവരങ്ങൾ ശേഖരിക്കുന്നു...</span>
          </div>
        ) : filteredSales.length === 0 ? (
          <div className="p-12 text-center text-stone-400 space-y-2">
            <FiDollarSign className="w-8 h-8 mx-auto opacity-40" />
            <p className="text-sm font-bold">വിൽപ്പന റെക്കോർഡുകൾ ഒന്നും ലഭ്യമല്ല</p>
            <p className="text-xs">മുകളിലുള്ള ബട്ടൺ ഉപയോഗിച്ച് പുതിയ വിൽപ്പന ചേർക്കുക</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-stone-100 dark:border-[#282323] text-stone-400 bg-stone-50/50 dark:bg-[#141212]">
                  <th className="py-3 px-4">തീയതി</th>
                  <th className="py-3 px-4">ഉൽപ്പന്നം</th>
                  <th className="py-3 px-4 text-right">അളവ്</th>
                  <th className="py-3 px-4 text-right">വില / യൂണിറ്റ്</th>
                  <th className="py-3 px-4 text-right">ആകെ തുക</th>
                  <th className="py-3 px-4">ഉപഭോക്താവ് (Buyer)</th>
                  <th className="py-3 px-4">പേയ്‌മെന്റ്</th>
                  <th className="py-3 px-4 text-center">ബില്ലിംഗ്</th>
                  <th className="py-3 px-4 text-center">ഡിലീറ്റ്</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 dark:divide-[#282323]">
                {filteredSales.map((sale) => (
                  <tr key={sale.id} className="hover:bg-stone-50/50 dark:hover:bg-[#201D1D] transition-colors">
                    <td className="py-3 px-4 font-mono text-stone-500 dark:text-stone-400">
                      {sale.sale_date}
                    </td>
                    <td className="py-3 px-4 font-bold text-stone-900 dark:text-white">
                      {sale.product_name}
                      {sale.notes && (
                        <p className="text-[10px] text-stone-400 font-normal mt-0.5">{sale.notes}</p>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-semibold text-stone-700 dark:text-stone-300">
                      {sale.quantity} <span className="text-[10px] text-stone-400 font-sans">{sale.unit}</span>
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-stone-600 dark:text-stone-400">
                      ₹{Number(sale.unit_price).toFixed(2)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-black text-emerald-600 dark:text-emerald-400">
                      ₹{Number(sale.total_amount).toFixed(2)}
                    </td>
                    <td className="py-3 px-4 text-stone-600 dark:text-stone-300">
                      {sale.customer_name || '—'}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1.5">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300">
                          {sale.payment_method || 'cash'}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            sale.payment_status === 'paid'
                              ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400'
                              : 'bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400'
                          }`}
                        >
                          {sale.payment_status === 'paid' ? 'ലഭിച്ചു' : 'ബാക്കി'}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <button
                        onClick={() => {
                          setActiveBillSale(sale);
                          setIsBillModalOpen(true);
                        }}
                        className="p-1.5 text-stone-600 dark:text-stone-300 hover:text-epso-red dark:hover:text-amber-400 transition-colors cursor-pointer"
                        title="ബിൽ പ്രിന്റ് ചെയ്യുക (Print Bill)"
                      >
                        <FiPrinter className="w-4 h-4" />
                      </button>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <button
                        onClick={() => handleDelete(sale.id)}
                        disabled={deletingSaleId === sale.id}
                        className="p-1.5 text-stone-400 hover:text-red-500 transition-colors cursor-pointer disabled:opacity-50"
                        title="വിൽപ്പന ഒഴിവാക്കുക"
                      >
                        {deletingSaleId === sale.id ? (
                          <FiRefreshCw className="w-3.5 h-3.5 animate-spin text-red-500" />
                        ) : (
                          <FiTrash2 className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Record Sale Modal with Apple Fluid Animation */}
      {isModalOpen && createPortal(
        <div className="fixed inset-0 z-[9999] w-screen h-screen min-h-screen bg-black/65 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-apple-backdrop">
          <div className="w-full md:w-[70vw] md:max-w-4xl bg-white dark:bg-[#1E1B1B] rounded-3xl p-6 border border-stone-200 dark:border-[#2E2828] shadow-apple-modal animate-apple-modal my-auto">
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-stone-100 dark:border-[#282323]">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400">
                  <FiDollarSign className="w-5 h-5 stroke-[2.5]" />
                </div>
                <div>
                  <h3 className="text-base font-black text-stone-900 dark:text-white">
                    വിൽപ്പന രേഖപ്പെടുത്തുക
                  </h3>
                  <p className="text-[11px] text-stone-400 font-sans">New Product Sale & Bill Generation</p>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 bg-stone-100 dark:bg-[#282323]"
              >
                <FiX className="w-4 h-4" />
              </button>
            </div>

            {errorMsg && (
              <div className="p-3 mb-3 rounded-xl bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 text-xs flex items-center gap-2 border border-red-200 dark:border-red-900/60">
                <FiAlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-stone-700 dark:text-stone-300 mb-1">
                    തീയതി (Date)
                  </label>
                  <input
                    type="date"
                    required
                    value={saleDate}
                    onChange={(e) => setSaleDate(e.target.value)}
                    className="w-full px-3 py-2 bg-stone-50 dark:bg-[#141212] border border-stone-200 dark:border-[#2E2828] rounded-xl font-mono text-stone-900 dark:text-white focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-bold text-stone-700 dark:text-stone-300 mb-1">
                    യൂണിറ്റ് (Unit)
                  </label>
                  <ThemeSelect
                    value={unit}
                    onChange={(val) => setUnit(val)}
                    options={[
                      { value: 'kg', label: 'kg (കിലോഗ്രാം)' },
                      { value: 'packet', label: 'packet (പാക്കറ്റ്)' },
                      { value: 'box', label: 'box (ബോക്സ്)' },
                      { value: 'pcs', label: 'pcs' },
                    ]}
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-stone-700 dark:text-stone-300 mb-1">
                  ഉൽപ്പന്നം (Product) *
                </label>
                <ThemeSelect
                  value={productId}
                  onChange={(val) => handleProductChange(val)}
                  placeholder="ഉൽപ്പന്നം തിരഞ്ഞെടുക്കുക"
                  searchable={true}
                  options={products.map((p) => {
                    const costPrice = costingPrices[p.id];
                    return {
                      value: p.id,
                      label: `${p.name} ${costPrice ? `(കോസ്റ്റിംഗ് വില: ₹${costPrice}/kg)` : p.wholesalePrice ? `(₹${p.wholesalePrice})` : ''}`.trim(),
                    };
                  })}
                />
                {fetchedCostingRate !== null && (
                  <p className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-1 font-semibold flex items-center gap-1">
                    <FiCheck className="w-3 h-3" />
                    <span>വില Product-wise Costing-ൽ നിന്ന് നേരിട്ട് കണ്ടെത്തി: ₹{fetchedCostingRate}/kg</span>
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-stone-700 dark:text-stone-300 mb-1">
                    അളവ് (Quantity) *
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0.1"
                    required
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    className="w-full px-3 py-2 bg-stone-50 dark:bg-[#141212] border border-stone-200 dark:border-[#2E2828] rounded-xl font-mono text-stone-900 dark:text-white focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-bold text-stone-700 dark:text-stone-300 mb-1">
                    വില (Rate / Unit) *
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    required
                    placeholder="₹"
                    value={unitPrice}
                    onChange={(e) => setUnitPrice(e.target.value)}
                    className="w-full px-3 py-2 bg-stone-50 dark:bg-[#141212] border border-stone-200 dark:border-[#2E2828] rounded-xl font-mono text-stone-900 dark:text-white font-bold focus:outline-none"
                  />
                </div>
              </div>

              {/* Total Calculation Display */}
              <div className="p-3 bg-emerald-50 dark:bg-emerald-950/20 rounded-2xl border border-emerald-200 dark:border-emerald-900/40 flex items-center justify-between">
                <span className="font-bold text-emerald-800 dark:text-emerald-300">
                  ആകെ തുക (Total Amount):
                </span>
                <span className="text-lg font-black text-emerald-600 dark:text-emerald-400 font-mono">
                  ₹{calculatedTotal.toFixed(2)}
                </span>
              </div>

              {/* Buyer Management Field */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-bold text-stone-700 dark:text-stone-300">
                    ഉപഭോക്താവ് / ബയർ (Buyer)
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowAddBuyerModal(true)}
                    className="text-[11px] font-bold text-epso-red hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <FiUserPlus className="w-3 h-3" />
                    <span>+ പുതിയ ബയറെ ചേർക്കുക</span>
                  </button>
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    list="buyers-datalist"
                    placeholder="ബയറുടെ പേര് തിരഞ്ഞെടുക്കുക അല്ലെങ്കിൽ ടൈപ്പ് ചെയ്യുക"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="w-full px-3 py-2 bg-stone-50 dark:bg-[#141212] border border-stone-200 dark:border-[#2E2828] rounded-xl text-stone-900 dark:text-white focus:outline-none"
                  />
                  <datalist id="buyers-datalist">
                    {buyersList.map((b, idx) => (
                      <option key={idx} value={b.name}>
                        {b.shopName ? `${b.shopName} (${b.name})` : b.name}
                      </option>
                    ))}
                  </datalist>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-stone-700 dark:text-stone-300 mb-1">
                    പേയ്‌മെന്റ് രീതി
                  </label>
                  <ThemeSelect
                    value={paymentMethod}
                    onChange={(val) => setPaymentMethod(val as any)}
                    options={[
                      { value: 'cash', label: 'Cash (പണം)' },
                      { value: 'upi', label: 'UPI / GPay' },
                      { value: 'bank', label: 'Bank Transfer' },
                      { value: 'credit', label: 'Credit (കടം)' },
                    ]}
                  />
                </div>

                <div>
                  <label className="block font-bold text-stone-700 dark:text-stone-300 mb-1">
                    സ്റ്റാറ്റസ്
                  </label>
                  <ThemeSelect
                    value={paymentStatus}
                    onChange={(val) => setPaymentStatus(val as any)}
                    options={[
                      { value: 'paid', label: 'പൂർണ്ണമായി ലഭിച്ചു (Paid)' },
                      { value: 'pending', label: 'തുക ബാക്കി (Pending)' },
                    ]}
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-stone-700 dark:text-stone-300 mb-1">
                  കുറിപ്പ് (Notes)
                </label>
                <input
                  type="text"
                  placeholder="ഓപ്ഷണൽ കുറിപ്പ്..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-3 py-2 bg-stone-50 dark:bg-[#141212] border border-stone-200 dark:border-[#2E2828] rounded-xl text-stone-900 dark:text-white focus:outline-none"
                />
              </div>

              {/* Action Buttons: Print Bill with Epso Logo or Save */}
              <div className="pt-3 border-t border-stone-100 dark:border-[#282323] flex items-center justify-between gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-3.5 py-2.5 rounded-xl border border-stone-200 dark:border-[#2E2828] text-stone-600 dark:text-stone-400 font-bold hover:bg-stone-100 dark:hover:bg-[#282323] cursor-pointer"
                >
                  റദ്ദാക്കുക
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-4 py-2.5 rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-[#1E1B1B] text-stone-700 dark:text-stone-200 font-bold shadow-xs hover:bg-stone-50 dark:hover:bg-[#282323] transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {isSubmitting ? (
                      <FiRefreshCw className="w-3.5 h-3.5 animate-spin text-stone-500" />
                    ) : (
                      <FiCheck className="w-3.5 h-3.5" />
                    )}
                    <span>സേവ് മാത്രം</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleSaveAndPrintBill}
                    disabled={isSubmitting}
                    className="px-5 py-2.5 rounded-2xl bg-epso-red hover:bg-epso-red-hover text-white font-black shadow-md press-apple flex items-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {isSubmitting ? (
                      <FiRefreshCw className="w-4 h-4 animate-spin text-white" />
                    ) : (
                      <FiPrinter className="w-4 h-4" />
                    )}
                    <span>ബിൽ പ്രിന്റ് ചെയ്യുക (Print Bill)</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Add New Buyer Modal */}
      {showAddBuyerModal && createPortal(
        <div className="fixed inset-0 z-[10000] w-screen h-screen min-h-screen bg-black/65 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-apple-backdrop">
          <div className="w-full max-w-sm bg-white dark:bg-[#1E1B1B] rounded-3xl p-5 border border-stone-200 dark:border-[#2E2828] shadow-apple-modal animate-apple-modal my-auto">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-black text-stone-900 dark:text-white flex items-center gap-2">
                <FiUserPlus className="w-4 h-4 text-epso-red" />
                <span>പുതിയ ബയറെ ചേർക്കുക</span>
              </h4>
              <button
                onClick={() => setShowAddBuyerModal(false)}
                className="w-7 h-7 rounded-full flex items-center justify-center bg-stone-100 dark:bg-[#282323] text-stone-400"
              >
                <FiX className="w-3.5 h-3.5" />
              </button>
            </div>

            <form onSubmit={handleAddNewBuyer} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-stone-700 dark:text-stone-300 mb-1">
                  ബയറുടെ പേര് (Buyer Name) *
                </label>
                <input
                  type="text"
                  required
                  placeholder="ഉദാ: പ്രവീൺ, അക്ബർ..."
                  value={newBuyerName}
                  onChange={(e) => setNewBuyerName(e.target.value)}
                  className="w-full px-3 py-2 bg-stone-50 dark:bg-[#141212] border border-stone-200 dark:border-[#2E2828] rounded-xl text-stone-900 dark:text-white focus:outline-none"
                  autoFocus
                />
              </div>

              <div>
                <label className="block font-bold text-stone-700 dark:text-stone-300 mb-1">
                  കട / സ്ഥാപനം (Shop Name)
                </label>
                <input
                  type="text"
                  placeholder="ഉദാ: റോയൽ സ്റ്റോഴ്സ്, കോഴിക്കോട്"
                  value={newBuyerShop}
                  onChange={(e) => setNewBuyerShop(e.target.value)}
                  className="w-full px-3 py-2 bg-stone-50 dark:bg-[#141212] border border-stone-200 dark:border-[#2E2828] rounded-xl text-stone-900 dark:text-white focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-bold text-stone-700 dark:text-stone-300 mb-1">
                  ഫോൺ നമ്പർ (Phone)
                </label>
                <input
                  type="tel"
                  placeholder="ഉദാ: 9876543210"
                  value={newBuyerPhone}
                  onChange={(e) => setNewBuyerPhone(e.target.value)}
                  className="w-full px-3 py-2 bg-stone-50 dark:bg-[#141212] border border-stone-200 dark:border-[#2E2828] rounded-xl text-stone-900 dark:text-white font-mono focus:outline-none"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddBuyerModal(false)}
                  className="px-3.5 py-1.5 rounded-xl border border-stone-200 dark:border-[#2E2828] text-stone-600 dark:text-stone-400 font-bold"
                >
                  റദ്ദാക്കുക
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-xl bg-epso-red text-white font-black hover:bg-epso-red-hover transition-colors"
                >
                  ചേർക്കുക
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Modern Clean Printable Receipt / Bill Modal */}
      {isBillModalOpen && activeBillSale && createPortal(
        <div className="fixed inset-0 z-[9999] w-screen h-screen min-h-screen bg-black/70 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-apple-backdrop">
          <div className="w-full max-w-md bg-stone-100 dark:bg-[#181515] rounded-3xl p-4 sm:p-5 shadow-2xl text-stone-900 border border-stone-200 dark:border-[#2E2828] animate-apple-modal max-h-[96vh] flex flex-col my-auto">
            {/* Modal Action Bar (Screen Only - Not Printed) */}
            <div className="flex items-center justify-between pb-3 border-b border-stone-200 dark:border-[#2E2828] mb-3 shrink-0 no-print">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-xs font-black text-stone-800 dark:text-stone-200">
                  ബിൽ പ്രിവ്യൂ (Receipt Preview)
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopyBillWhatsApp}
                  className="px-3 py-1.5 rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-[#252020] text-stone-700 dark:text-stone-300 hover:bg-stone-50 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
                  title="Copy receipt for WhatsApp"
                >
                  {billCopied ? (
                    <>
                      <FiCheck className="w-3.5 h-3.5 text-emerald-500" />
                      <span className="text-emerald-600 dark:text-emerald-400">Copied!</span>
                    </>
                  ) : (
                    <>
                      <FiCopy className="w-3.5 h-3.5 text-stone-500" />
                      <span>WhatsApp</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-3.5 py-1.5 rounded-xl bg-epso-red hover:bg-epso-red-hover text-white font-black text-xs flex items-center gap-1.5 shadow-md press-apple cursor-pointer"
                >
                  <FiPrinter className="w-3.5 h-3.5" />
                  <span>Print Receipt</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsBillModalOpen(false)}
                  className="w-7 h-7 rounded-full flex items-center justify-center bg-stone-200 dark:bg-stone-800 text-stone-600 dark:text-stone-300 hover:text-stone-900 cursor-pointer"
                >
                  <FiX className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Printable Modern Receipt Area */}
            <div className="flex-1 overflow-y-auto no-scrollbar rounded-2xl bg-white shadow-xs p-1">
              <div
                id="epso-bill-print-area"
                className="w-full bg-white text-stone-900 font-sans p-4 sm:p-5 text-xs select-text"
                style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}
              >
                {/* Modern Brand Receipt Header */}
                <div className="text-center pb-3">
                  <div className="flex justify-center mb-1.5">
                    <img
                      src="/epso-logo-transparent.png"
                      alt="Epso Logo"
                      className="w-12 h-12 object-contain"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = '/epso-swirl-transparent.png';
                      }}
                    />
                  </div>
                  <h1 className="text-base font-black tracking-tight text-stone-950 uppercase leading-none">
                    EPSO FOOD PRODUCTS
                  </h1>
                  <p className="text-[10px] font-bold text-stone-600 font-malayalam mt-0.5">
                    രുചിയുടെ ഉത്തമ കൂട്ടായ്മ • കേരളം
                  </p>
                  <p className="text-[9px] text-stone-500 font-mono mt-0.5">
                    Mob: +91 94470 00000 • FSSAI Lic: 21324189000124
                  </p>
                </div>

                {/* Receipt Title & Divider */}
                <div className="border-t border-b border-dashed border-stone-300 py-1.5 my-2 flex items-center justify-between font-mono text-[10px]">
                  <span className="font-black uppercase tracking-wider text-stone-800">
                    TAX / CASH RECEIPT
                  </span>
                  <span className="font-bold text-stone-600">
                    #{String(activeBillSale.id).slice(0, 8).toUpperCase()}
                  </span>
                </div>

                {/* Receipt Meta Details */}
                <div className="grid grid-cols-2 gap-1 text-[10px] font-mono py-1 text-stone-600">
                  <div>
                    <span className="text-stone-400">Date: </span>
                    <strong className="text-stone-900">{activeBillSale.sale_date}</strong>
                  </div>
                  <div className="text-right">
                    <span className="text-stone-400">Time: </span>
                    <strong className="text-stone-900">
                      {new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                    </strong>
                  </div>
                  <div>
                    <span className="text-stone-400">Cashier: </span>
                    <strong className="text-stone-900">Admin</strong>
                  </div>
                  <div className="text-right">
                    <span className="text-stone-400">Mode: </span>
                    <strong className="text-stone-900 uppercase">{activeBillSale.payment_method || 'CASH'}</strong>
                  </div>
                </div>

                {/* Customer Info Card */}
                <div className="my-2 p-2 rounded-lg bg-stone-50 border border-stone-200 text-[11px]">
                  <div className="text-[9px] font-bold text-stone-400 uppercase tracking-wider">
                    Customer / Billed To:
                  </div>
                  <div className="font-black text-stone-900 font-malayalam leading-tight mt-0.5">
                    {activeBillSale.customer_name || 'റീട്ടെയിൽ കസ്റ്റമർ (Counter Sale)'}
                  </div>
                  <div className="flex items-center justify-between text-[10px] mt-1 text-stone-500 font-mono">
                    <span>Status:</span>
                    <span className="font-black px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 uppercase">
                      {activeBillSale.payment_status === 'paid' ? 'PAID / സ്വീകരിച്ചു' : 'PENDING'}
                    </span>
                  </div>
                </div>

                {/* Line Items Table */}
                <table className="w-full my-2 text-left text-[11px] border-collapse font-sans">
                  <thead>
                    <tr className="border-b border-t border-dashed border-stone-300 text-[10px] font-mono text-stone-500">
                      <th className="py-1.5 text-left font-bold">ITEM</th>
                      <th className="py-1.5 text-right font-bold">QTY</th>
                      <th className="py-1.5 text-right font-bold">RATE</th>
                      <th className="py-1.5 text-right font-bold">AMOUNT</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-dotted divide-stone-200">
                    <tr>
                      <td className="py-2 pr-1 font-bold text-stone-900 font-malayalam leading-tight">
                        {activeBillSale.product_name}
                        {activeBillSale.notes && (
                          <span className="text-[9px] text-stone-400 block font-normal">
                            {activeBillSale.notes}
                          </span>
                        )}
                      </td>
                      <td className="py-2 text-right font-mono font-semibold whitespace-nowrap">
                        {activeBillSale.quantity} {activeBillSale.unit}
                      </td>
                      <td className="py-2 text-right font-mono text-stone-700 whitespace-nowrap">
                        ₹{Number(activeBillSale.unit_price).toFixed(2)}
                      </td>
                      <td className="py-2 text-right font-mono font-black text-stone-950 whitespace-nowrap">
                        ₹{Number(activeBillSale.total_amount).toFixed(2)}
                      </td>
                    </tr>
                  </tbody>
                </table>

                {/* Amount Totals Box */}
                <div className="border-t border-dashed border-stone-300 pt-2 space-y-1 font-mono text-[11px]">
                  <div className="flex items-center justify-between text-stone-600">
                    <span>Subtotal:</span>
                    <span>₹{Number(activeBillSale.total_amount).toFixed(2)}</span>
                  </div>
                  <div className="flex items-center justify-between text-stone-500 text-[10px]">
                    <span>GST (Agro 0%):</span>
                    <span>₹0.00</span>
                  </div>
                  <div className="border-t-2 border-stone-900 pt-2 flex items-center justify-between text-sm sm:text-base font-black text-stone-950">
                    <span className="font-malayalam uppercase">ആകെ തുക (Total):</span>
                    <span className="font-mono text-lg text-stone-950">
                      ₹{Number(activeBillSale.total_amount).toFixed(2)}
                    </span>
                  </div>
                </div>

                {/* Clean Barcode Aesthetic & Sign Off */}
                <div className="mt-4 pt-3 border-t border-dashed border-stone-300 text-center space-y-1">
                  {/* Decorative Barcode Lines */}
                  <div className="flex items-center justify-center gap-0.5 h-6 opacity-75 my-1">
                    {[3, 1, 4, 1, 2, 5, 2, 1, 3, 2, 4, 1, 2, 3, 1, 4, 2, 1, 3, 2, 5, 1, 2].map((w, idx) => (
                      <div
                        key={idx}
                        className="bg-stone-900 h-full"
                        style={{ width: `${w * 1.5}px` }}
                      />
                    ))}
                  </div>
                  <p className="text-[9px] font-mono text-stone-400 tracking-widest">
                    * {String(activeBillSale.id).slice(0, 12).toUpperCase()} *
                  </p>
                  <p className="text-[11px] font-black text-stone-800 font-malayalam mt-1">
                    നന്ദി, വീണ്ടും സന്ദർശിക്കുക!
                  </p>
                  <p className="text-[8px] text-stone-400 font-sans uppercase tracking-wider">
                    Clean Modern Digital Receipt • EPSO Productions
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
