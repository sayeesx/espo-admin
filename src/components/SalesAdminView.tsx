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
} from 'react-icons/fi';
import { Product, SaleRecord } from '../types';
import { fetchSales, recordSale, deleteSale, fetchProductSellingPrices } from '../services/supabase';
import { AnimatedNumber } from './AnimatedNumber';

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
          body * {
            visibility: hidden;
          }
          #epso-bill-print-area, #epso-bill-print-area * {
            visibility: visible;
          }
          #epso-bill-print-area {
            position: fixed;
            left: 0;
            top: 0;
            width: 100%;
            height: 100%;
            background: white !important;
            color: black !important;
            padding: 24px;
            z-index: 999999;
          }
          .no-print {
            display: none !important;
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
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-apple-backdrop">
          <div className="w-full md:w-[70vw] md:max-w-4xl bg-white dark:bg-[#1E1B1B] rounded-3xl p-6 border border-stone-200 dark:border-[#2E2828] shadow-apple-modal animate-apple-modal overflow-hidden">
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
                  <select
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                    className="w-full px-3 py-2 bg-stone-50 dark:bg-[#141212] border border-stone-200 dark:border-[#2E2828] rounded-xl text-stone-900 dark:text-white focus:outline-none"
                  >
                    <option value="kg">kg (കിലോഗ്രാം)</option>
                    <option value="packet">packet (പാക്കറ്റ്)</option>
                    <option value="box">box (ബോക്സ്)</option>
                    <option value="pcs">pcs</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-stone-700 dark:text-stone-300 mb-1">
                  ഉൽപ്പന്നം (Product) *
                </label>
                <select
                  required
                  value={productId}
                  onChange={(e) => handleProductChange(e.target.value)}
                  className="w-full px-3 py-2.5 bg-stone-50 dark:bg-[#141212] border border-stone-200 dark:border-[#2E2828] rounded-xl text-stone-900 dark:text-white font-bold focus:outline-none"
                >
                  <option value="">ഉൽപ്പന്നം തിരഞ്ഞെടുക്കുക</option>
                  {products.map((p) => {
                    const costPrice = costingPrices[p.id];
                    return (
                      <option key={p.id} value={p.id}>
                        {p.name} {costPrice ? `(കോസ്റ്റിംഗ് വില: ₹${costPrice}/kg)` : p.wholesalePrice ? `(₹${p.wholesalePrice})` : ''}
                      </option>
                    );
                  })}
                </select>
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
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className="w-full px-3 py-2 bg-stone-50 dark:bg-[#141212] border border-stone-200 dark:border-[#2E2828] rounded-xl text-stone-900 dark:text-white focus:outline-none"
                  >
                    <option value="cash">Cash (പണം)</option>
                    <option value="upi">UPI / GPay</option>
                    <option value="bank">Bank Transfer</option>
                    <option value="credit">Credit (കടം)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-stone-700 dark:text-stone-300 mb-1">
                    സ്റ്റാറ്റസ്
                  </label>
                  <select
                    value={paymentStatus}
                    onChange={(e) => setPaymentStatus(e.target.value)}
                    className="w-full px-3 py-2 bg-stone-50 dark:bg-[#141212] border border-stone-200 dark:border-[#2E2828] rounded-xl text-stone-900 dark:text-white focus:outline-none"
                  >
                    <option value="paid">പൂർണ്ണമായി ലഭിച്ചു (Paid)</option>
                    <option value="pending">തുക ബാക്കി (Pending)</option>
                  </select>
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
        </div>
      )}

      {/* Add New Buyer Modal */}
      {showAddBuyerModal && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-apple-backdrop">
          <div className="w-full max-w-sm bg-white dark:bg-[#1E1B1B] rounded-3xl p-5 border border-stone-200 dark:border-[#2E2828] shadow-apple-modal animate-apple-modal">
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
        </div>
      )}

      {/* Printable Invoice / Bill Modal with EPSO Logo */}
      {isBillModalOpen && activeBillSale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-md animate-apple-backdrop">
          <div className="w-full max-w-lg bg-white rounded-3xl p-6 shadow-2xl text-stone-900 border border-stone-200 animate-apple-modal overflow-hidden max-h-[95vh] flex flex-col">
            {/* Action Bar (Not printed) */}
            <div className="flex items-center justify-between pb-4 border-b border-stone-200 mb-4 shrink-0 no-print">
              <span className="text-xs font-bold text-stone-500">
                ബിൽ പ്രിവ്യൂ (Invoice Preview)
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-4 py-2 rounded-xl bg-epso-red hover:bg-epso-red-hover text-white font-black text-xs flex items-center gap-1.5 shadow-md press-apple cursor-pointer"
                >
                  <FiPrinter className="w-4 h-4" />
                  <span>പ്രിന്റ് ചെയ്യുക</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsBillModalOpen(false)}
                  className="w-8 h-8 rounded-full flex items-center justify-center bg-stone-100 text-stone-500 hover:text-stone-800"
                >
                  <FiX className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Print Area with EPSO Logo */}
            <div id="epso-bill-print-area" className="flex-1 overflow-y-auto space-y-4 p-2 bg-white text-stone-900 font-sans">
              {/* Header with Epso Logo */}
              <div className="flex items-center justify-between pb-3 border-b-2 border-stone-800">
                <div className="flex items-center gap-3">
                  <img
                    src="/epso-logo-transparent.png"
                    alt="Epso Logo"
                    className="w-14 h-14 object-contain"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = '/epso-swirl-transparent.png';
                    }}
                  />
                  <div>
                    <h1 className="text-xl font-black tracking-tight text-stone-950 font-serif">
                      EPSO FOOD PRODUCTS
                    </h1>
                    <p className="text-[11px] font-bold text-stone-600 font-malayalam">
                      രുചിയുടെ ഉത്തമ കൂട്ടായ്മ • കേരളം
                    </p>
                    <p className="text-[10px] text-stone-500 font-mono">
                      Ph: +91 94470 00000 • FSSAI Lic. Verified
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="px-2 py-0.5 rounded-md bg-stone-900 text-white text-[10px] font-black uppercase tracking-wider">
                    TAX INVOICE
                  </span>
                  <p className="text-xs font-black text-stone-800 font-mono mt-1">
                    #{String(activeBillSale.id).slice(0, 8).toUpperCase()}
                  </p>
                  <p className="text-[11px] text-stone-600 font-mono">
                    {activeBillSale.sale_date}
                  </p>
                </div>
              </div>

              {/* Customer / Buyer Information */}
              <div className="p-3 rounded-xl bg-stone-50 border border-stone-200 text-xs">
                <span className="text-[10px] font-bold text-stone-500 uppercase tracking-wider block mb-0.5">
                  ബിൽ നൽകിയത് (Billed To):
                </span>
                <p className="text-sm font-black text-stone-900 font-malayalam">
                  {activeBillSale.customer_name || 'റീട്ടെയിൽ കസ്റ്റമർ (Counter Sale)'}
                </p>
                <div className="flex items-center justify-between text-[11px] text-stone-600 mt-1">
                  <span>പേയ്‌മെന്റ്: <strong className="uppercase">{activeBillSale.payment_method || 'CASH'}</strong></span>
                  <span className="font-bold text-emerald-700 uppercase">
                    {activeBillSale.payment_status === 'paid' ? 'പൂർണ്ണമായി അടച്ചു (PAID)' : 'തുക ബാക്കി (PENDING)'}
                  </span>
                </div>
              </div>

              {/* Items Table */}
              <table className="w-full text-left text-xs border border-stone-300 rounded-lg overflow-hidden">
                <thead className="bg-stone-100 text-stone-700 font-bold border-b border-stone-300">
                  <tr>
                    <th className="py-2 px-3">ഇനം (Item)</th>
                    <th className="py-2 px-3 text-right">അളവ് (Qty)</th>
                    <th className="py-2 px-3 text-right">വില (Rate)</th>
                    <th className="py-2 px-3 text-right">ആകെ (Total)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-200">
                  <tr>
                    <td className="py-3 px-3 font-bold text-stone-900 font-malayalam">
                      {activeBillSale.product_name}
                      {activeBillSale.notes && (
                        <span className="text-[10px] text-stone-500 font-normal block">
                          {activeBillSale.notes}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-semibold">
                      {activeBillSale.quantity} {activeBillSale.unit}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-stone-700">
                      ₹{Number(activeBillSale.unit_price).toFixed(2)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-black text-stone-900">
                      ₹{Number(activeBillSale.total_amount).toFixed(2)}
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* Grand Total */}
              <div className="p-3 rounded-xl bg-stone-100 border border-stone-300 flex items-center justify-between">
                <span className="text-sm font-black text-stone-900 font-malayalam uppercase">
                  ആകെ തുക (Grand Total):
                </span>
                <span className="text-xl font-black text-stone-950 font-mono">
                  ₹{Number(activeBillSale.total_amount).toFixed(2)}
                </span>
              </div>

              {/* Signatory Footer */}
              <div className="pt-6 border-t border-stone-200 flex items-end justify-between text-[11px] text-stone-500">
                <div>
                  <p className="font-malayalam">നന്ദി, വീണ്ടും സന്ദർശിക്കുക!</p>
                  <p className="text-[9px] font-sans">Computer Generated Invoice</p>
                </div>
                <div className="text-center">
                  <div className="w-28 border-b border-stone-400 mb-1" />
                  <p className="font-bold text-[10px]">Authorized Signatory</p>
                  <p className="text-[9px]">EPSO PRODUCTIONS</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
