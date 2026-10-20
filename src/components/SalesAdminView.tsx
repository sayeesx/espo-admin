import React, { useState, useEffect, useMemo } from 'react';
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
} from 'react-icons/fi';
import { Product, SaleRecord } from '../types';
import { fetchSales, recordSale, deleteSale } from '../services/supabase';
import { AnimatedNumber } from './AnimatedNumber';

interface SalesAdminViewProps {
  products: Product[];
}

export const SalesAdminView: React.FC<SalesAdminViewProps> = ({ products }) => {
  const [sales, setSales] = useState<SaleRecord[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedDateFilter, setSelectedDateFilter] = useState<string>('');

  // Form State
  const [saleDate, setSaleDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [productId, setProductId] = useState<string>('');
  const [quantity, setQuantity] = useState<string>('1');
  const [unit, setUnit] = useState<string>('packet');
  const [unitPrice, setUnitPrice] = useState<string>('');
  const [customerName, setCustomerName] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<string>('cash');
  const [paymentStatus, setPaymentStatus] = useState<string>('paid');
  const [notes, setNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');

  const loadSales = async () => {
    setIsLoading(true);
    try {
      const data = await fetchSales();
      setSales(data);
    } catch (err) {
      console.error('Failed to load sales:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadSales();
  }, []);

  // When product changes in form, auto-fill unit price and unit if empty
  const handleProductChange = (pId: string) => {
    setProductId(pId);
    const prod = products.find((p) => p.id === pId);
    if (prod) {
      if (prod.wholesalePrice && prod.wholesalePrice > 0) {
        setUnitPrice(String(prod.wholesalePrice));
      }
      if (prod.unit) {
        setUnit(prod.unit);
      }
    }
  };

  const calculatedTotal = useMemo(() => {
    const q = parseFloat(quantity) || 0;
    const p = parseFloat(unitPrice) || 0;
    return q * p;
  }, [quantity, unitPrice]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    const prod = products.find((p) => p.id === productId);
    const finalProductName = prod ? prod.name : 'മറ്റു വിൽപ്പനകൾ';
    const numQty = parseFloat(quantity) || 0;
    const numPrice = parseFloat(unitPrice) || 0;

    if (numQty <= 0) {
      setErrorMsg('അളവ് 0-ൽ കൂടുതലായിരിക്കണം');
      return;
    }
    if (numPrice <= 0) {
      setErrorMsg('വില നൽകുക');
      return;
    }

    setIsSubmitting(true);
    try {
      await recordSale({
        sale_date: saleDate,
        product_id: productId || undefined,
        product_name: finalProductName,
        quantity: numQty,
        unit: unit || 'packet',
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
      await loadSales();
    } catch (err: any) {
      setErrorMsg(err.message || 'വിൽപ്പന സേവ് ചെയ്യാനായില്ല');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('ഈ വിൽപ്പന റെക്കോർഡ് നീക്കം ചെയ്യണോ?')) return;
    try {
      await deleteSale(id);
      setSales((prev) => prev.filter((s) => s.id !== id));
    } catch (err) {
      alert('ഡിലീറ്റ് ചെയ്യാനായില്ല');
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
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header & New Sale Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-stone-900 dark:text-white font-malayalam flex items-center gap-2">
            <span className="p-2 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <FiShoppingBag className="w-5 h-5" />
            </span>
            <span>വിൽപ്പന (Sales)</span>
          </h1>
          <p className="text-xs text-stone-500 dark:text-stone-400 font-malayalam mt-1">
            പ്രൊഡക്റ്റ് വിൽപ്പനകളും വരുമാനവും രേഖപ്പെടുത്തുക
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
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs font-malayalam shadow-apple cursor-pointer press-apple transition-all"
        >
          <FiPlus className="w-4 h-4" />
          <span>വിൽപ്പന രേഖപ്പെടുത്തുക</span>
        </button>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="p-4 rounded-3xl bg-white dark:bg-[#1E1B1B] border border-stone-200 dark:border-[#2E2828] shadow-apple-card">
          <p className="text-[11px] font-bold text-stone-400 font-malayalam">ഇന്നത്തെ വിൽപ്പന</p>
          <p className="text-xl sm:text-2xl font-black text-emerald-600 dark:text-emerald-400 font-mono mt-1">
            <AnimatedNumber value={stats.todayTotal} prefix="₹" decimals={2} />
          </p>
          <p className="text-[10px] text-stone-400 font-malayalam mt-0.5">ഇന്ന് ലഭിച്ച തുക</p>
        </div>

        <div className="p-4 rounded-3xl bg-white dark:bg-[#1E1B1B] border border-stone-200 dark:border-[#2E2828] shadow-apple-card">
          <p className="text-[11px] font-bold text-stone-400 font-malayalam">ഈ മാസത്തെ വിൽപ്പന</p>
          <p className="text-xl sm:text-2xl font-black text-stone-900 dark:text-white font-mono mt-1">
            <AnimatedNumber value={stats.monthTotal} prefix="₹" decimals={2} />
          </p>
          <p className="text-[10px] text-stone-400 font-malayalam mt-0.5">നടപ്പു മാസം</p>
        </div>

        <div className="p-4 rounded-3xl bg-white dark:bg-[#1E1B1B] border border-stone-200 dark:border-[#2E2828] shadow-apple-card">
          <p className="text-[11px] font-bold text-stone-400 font-malayalam">ആകെ വിറ്റ തുക</p>
          <p className="text-xl sm:text-2xl font-black text-stone-900 dark:text-white font-mono mt-1">
            <AnimatedNumber value={stats.allTotal} prefix="₹" decimals={2} />
          </p>
          <p className="text-[10px] text-stone-400 font-malayalam mt-0.5">ആകെ റെക്കോർഡുകൾ: {stats.ordersCount}</p>
        </div>

        <div className="p-4 rounded-3xl bg-white dark:bg-[#1E1B1B] border border-stone-200 dark:border-[#2E2828] shadow-apple-card">
          <p className="text-[11px] font-bold text-stone-400 font-malayalam">വിറ്റ അളവ്</p>
          <p className="text-xl sm:text-2xl font-black text-amber-600 dark:text-amber-400 font-mono mt-1">
            <AnimatedNumber value={stats.totalQty} decimals={1} />
          </p>
          <p className="text-[10px] text-stone-400 font-malayalam mt-0.5">ആകെ പാക്കറ്റ് / kg</p>
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
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-stone-50 dark:bg-[#141212] text-stone-900 dark:text-white border border-stone-200 dark:border-[#2E2828] rounded-xl font-malayalam focus:outline-none focus:ring-1 focus:ring-emerald-500"
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
              className="text-[11px] text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 font-malayalam ml-1"
            >
              എല്ലാം
            </button>
          )}
        </div>
      </div>

      {/* Sales List Table */}
      <div className="bg-white dark:bg-[#1E1B1B] rounded-3xl border border-stone-200 dark:border-[#2E2828] shadow-apple-card overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-xs text-stone-400 font-malayalam">
            വിൽപ്പന വിവരങ്ങൾ ശേഖരിക്കുന്നു...
          </div>
        ) : filteredSales.length === 0 ? (
          <div className="p-12 text-center text-stone-400 space-y-2">
            <FiDollarSign className="w-8 h-8 mx-auto opacity-40" />
            <p className="text-sm font-bold font-malayalam">വിൽപ്പന റെക്കോർഡുകൾ ഒന്നും ലഭ്യമല്ല</p>
            <p className="text-xs font-malayalam">മുകളിലുള്ള ബട്ടൺ ഉപയോഗിച്ച് പുതിയ വിൽപ്പന ചേർക്കുക</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-stone-100 dark:border-[#282323] text-stone-400 font-malayalam bg-stone-50/50 dark:bg-[#141212]">
                  <th className="py-3 px-4">തീയതി</th>
                  <th className="py-3 px-4">ഉൽപ്പന്നം</th>
                  <th className="py-3 px-4 text-right">അളവ്</th>
                  <th className="py-3 px-4 text-right">വില / യൂണിറ്റ്</th>
                  <th className="py-3 px-4 text-right">ആകെ തുക</th>
                  <th className="py-3 px-4">ഉപഭോക്താവ്</th>
                  <th className="py-3 px-4">പേയ്‌മെന്റ്</th>
                  <th className="py-3 px-4 text-center">ഡിലീറ്റ്</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 dark:divide-[#282323]">
                {filteredSales.map((sale) => (
                  <tr key={sale.id} className="hover:bg-stone-50/50 dark:hover:bg-[#201D1D] transition-colors">
                    <td className="py-3 px-4 font-mono text-stone-500 dark:text-stone-400">
                      {sale.sale_date}
                    </td>
                    <td className="py-3 px-4 font-bold text-stone-900 dark:text-white font-malayalam">
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
                    <td className="py-3 px-4 text-stone-600 dark:text-stone-300 font-malayalam">
                      {sale.customer_name || '—'}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1.5">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300">
                          {sale.payment_method || 'cash'}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold font-malayalam ${
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
                        onClick={() => handleDelete(sale.id)}
                        className="p-1.5 text-stone-400 hover:text-red-500 transition-colors"
                        title="Delete Sale"
                      >
                        <FiTrash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Record Sale Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-white dark:bg-[#1E1B1B] rounded-3xl p-6 border border-stone-200 dark:border-[#2E2828] shadow-apple-modal">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400">
                  <FiDollarSign className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-stone-900 dark:text-white font-malayalam">
                    വിൽപ്പന രേഖപ്പെടുത്തുക
                  </h3>
                  <p className="text-[11px] text-stone-400">Record Product Sale</p>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 rounded-xl text-stone-400 hover:text-stone-600 dark:hover:text-stone-200"
              >
                <FiX className="w-4 h-4" />
              </button>
            </div>

            {errorMsg && (
              <div className="p-3 mb-3 rounded-xl bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 text-xs flex items-center gap-2 border border-red-200 dark:border-red-900/60 font-malayalam">
                <FiAlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-stone-700 dark:text-stone-300 font-malayalam mb-1">
                    തീയതി (Date)
                  </label>
                  <input
                    type="date"
                    required
                    value={saleDate}
                    onChange={(e) => setSaleDate(e.target.value)}
                    className="w-full px-3 py-2 bg-stone-50 dark:bg-[#141212] border border-stone-200 dark:border-[#282323] rounded-xl font-mono text-stone-900 dark:text-white focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-bold text-stone-700 dark:text-stone-300 font-malayalam mb-1">
                    യൂണിറ്റ് (Unit)
                  </label>
                  <select
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                    className="w-full px-3 py-2 bg-stone-50 dark:bg-[#141212] border border-stone-200 dark:border-[#282323] rounded-xl text-stone-900 dark:text-white focus:outline-none"
                  >
                    <option value="packet">packet (പാക്കറ്റ്)</option>
                    <option value="kg">kg (കിലോഗ്രാം)</option>
                    <option value="box">box (ബോക്സ്)</option>
                    <option value="pcs">pcs</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-stone-700 dark:text-stone-300 font-malayalam mb-1">
                  ഉൽപ്പന്നം (Product)
                </label>
                <select
                  required
                  value={productId}
                  onChange={(e) => handleProductChange(e.target.value)}
                  className="w-full px-3 py-2 bg-stone-50 dark:bg-[#141212] border border-stone-200 dark:border-[#282323] rounded-xl text-stone-900 dark:text-white font-malayalam focus:outline-none"
                >
                  <option value="">ഉൽപ്പന്നം തിരഞ്ഞെടുക്കുക</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} {p.wholesalePrice ? `(₹${p.wholesalePrice})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-stone-700 dark:text-stone-300 font-malayalam mb-1">
                    അളവ് (Quantity)
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0.1"
                    required
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    className="w-full px-3 py-2 bg-stone-50 dark:bg-[#141212] border border-stone-200 dark:border-[#282323] rounded-xl font-mono text-stone-900 dark:text-white focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-bold text-stone-700 dark:text-stone-300 font-malayalam mb-1">
                    വില (Rate / Unit)
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    required
                    placeholder="₹"
                    value={unitPrice}
                    onChange={(e) => setUnitPrice(e.target.value)}
                    className="w-full px-3 py-2 bg-stone-50 dark:bg-[#141212] border border-stone-200 dark:border-[#282323] rounded-xl font-mono text-stone-900 dark:text-white focus:outline-none"
                  />
                </div>
              </div>

              {/* Total Calculation Display */}
              <div className="p-3 bg-emerald-50 dark:bg-emerald-950/20 rounded-2xl border border-emerald-200 dark:border-emerald-900/40 flex items-center justify-between">
                <span className="font-bold text-emerald-800 dark:text-emerald-300 font-malayalam">
                  ആകെ തുക (Total Amount):
                </span>
                <span className="text-base font-black text-emerald-600 dark:text-emerald-400 font-mono">
                  ₹{calculatedTotal.toFixed(2)}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-stone-700 dark:text-stone-300 font-malayalam mb-1">
                    ഉപഭോക്താവ് (Buyer Name)
                  </label>
                  <input
                    type="text"
                    placeholder="കസ്റ്റമർ പേര്"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="w-full px-3 py-2 bg-stone-50 dark:bg-[#141212] border border-stone-200 dark:border-[#282323] rounded-xl font-malayalam text-stone-900 dark:text-white focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-bold text-stone-700 dark:text-stone-300 font-malayalam mb-1">
                    പേയ്‌മെന്റ് രീതി
                  </label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className="w-full px-3 py-2 bg-stone-50 dark:bg-[#141212] border border-stone-200 dark:border-[#282323] rounded-xl text-stone-900 dark:text-white focus:outline-none"
                  >
                    <option value="cash">Cash (പണം)</option>
                    <option value="upi">UPI / GPay</option>
                    <option value="bank">Bank Transfer</option>
                    <option value="credit">Credit (കടം)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-stone-700 dark:text-stone-300 font-malayalam mb-1">
                  കുറിപ്പ് (Notes)
                </label>
                <input
                  type="text"
                  placeholder="ഓപ്ഷണൽ കുറിപ്പ്"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-3 py-2 bg-stone-50 dark:bg-[#141212] border border-stone-200 dark:border-[#282323] rounded-xl font-malayalam text-stone-900 dark:text-white focus:outline-none"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-stone-200 dark:border-[#2E2828] text-stone-600 dark:text-stone-400 font-bold font-malayalam hover:bg-stone-100 dark:hover:bg-[#282323]"
                >
                  റദ്ദാക്കുക
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold font-malayalam shadow-apple flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <FiCheck className="w-4 h-4" />
                  <span>{isSubmitting ? 'സേവ് ചെയ്യുന്നു...' : 'സേവ് ചെയ്യുക'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
