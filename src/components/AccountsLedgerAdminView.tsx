import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  FiBookOpen,
  FiUsers,
  FiDollarSign,
  FiPlus,
  FiSearch,
  FiX,
  FiCheck,
  FiAlertCircle,
  FiRefreshCw,
  FiTrash2,
  FiChevronDown,
  FiChevronUp,
  FiCreditCard,
  FiTrendingDown,
  FiFilter,
  FiCalendar,
  FiPhone,
  FiShoppingBag,
} from 'react-icons/fi';
import { createPortal } from 'react-dom';
import { Product, Buyer, BuyerPayment, OperationalExpense, SaleRecord } from '../types';
import {
  fetchBuyers,
  saveBuyer,
  deleteBuyer,
  syncBuyersFromSales,
  fetchBuyerPayments,
  recordBuyerPayment,
  deleteBuyerPayment,
  fetchOperationalExpenses,
  recordOperationalExpense,
  deleteOperationalExpense,
  fetchSales,
} from '../services/supabase';
import { useFeedback } from '../context/FeedbackContext';

// ─── Types ───────────────────────────────────────────────────────────────────

interface AccountsLedgerAdminViewProps {
  products: Product[];
  onRefresh?: () => Promise<void> | void;
}

type SubTab = 'buyer' | 'expense';

interface BuyerStats {
  buyer: Buyer;
  totalBilled: number;
  totalPaid: number;
  netCredit: number;
  linkedSales: SaleRecord[];
  payments: BuyerPayment[];
}

interface AddBuyerForm {
  name: string;
  phone: string;
  shop_name: string;
  address: string;
  notes: string;
}

interface PaymentForm {
  payment_date: string;
  amount: string;
  payment_method: 'cash' | 'upi' | 'bank' | 'other';
  notes: string;
}

interface ExpenseForm {
  expense_date: string;
  category: string;
  amount: string;
  product_id: string;
  notes: string;
}

const EXPENSE_CATEGORIES: { value: string; label: string }[] = [
  { value: 'vehicle_delivery', label: 'വാഹനം / ഡെലിവറി (Vehicle/Delivery)' },
  { value: 'electricity', label: 'വൈദ്യുതി (Electricity)' },
  { value: 'fuel', label: 'ഇന്ധനം (Fuel)' },
  { value: 'maintenance', label: 'അറ്റകുറ്റപ്പണി (Maintenance)' },
  { value: 'rent', label: 'വാടക (Rent)' },
  { value: 'other', label: 'മറ്റുള്ളവ (Other)' },
];

const EXPENSE_CATEGORY_LABELS: Record<string, string> = {
  vehicle_delivery: 'വാഹനം / ഡെലിവറി',
  electricity: 'വൈദ്യുതി',
  fuel: 'ഇന്ധനം',
  maintenance: 'അറ്റകുറ്റപ്പണി',
  rent: 'വാടക',
  other: 'മറ്റുള്ളവ',
};

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function fmt(n: number): string {
  return '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ─── Modal Backdrop ───────────────────────────────────────────────────────────

const ModalBackdrop: React.FC<{ onClose: () => void; children: React.ReactNode }> = ({
  onClose,
  children,
}) => {
  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-md">{children}</div>
    </div>,
    document.body
  );
};

// ─── KPI Card ─────────────────────────────────────────────────────────────────

const KpiCard: React.FC<{
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  value: string;
  badge?: string;
  valueClass?: string;
}> = ({ icon, title, subtitle, value, badge, valueClass }) => (
  <div className="bg-white dark:bg-[#181515] border border-stone-200 dark:border-[#2E2828] rounded-2xl p-4 min-w-[160px] flex-shrink-0 space-y-2">
    <div className="flex items-center justify-between">
      <div className="w-9 h-9 rounded-xl bg-stone-100 dark:bg-[#2E2828] flex items-center justify-center text-stone-500 dark:text-stone-400">
        {icon}
      </div>
      {badge && (
        <span className="text-[9px] font-bold uppercase tracking-wide bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 px-1.5 py-0.5 rounded-full font-malayalam">
          {badge}
        </span>
      )}
    </div>
    <div>
      <p className="text-[11px] font-bold text-stone-500 dark:text-stone-400 font-malayalam leading-tight">
        {title}
      </p>
      <p className="text-[9px] text-stone-400 dark:text-stone-500">{subtitle}</p>
    </div>
    <p className={`text-lg font-black tracking-tight ${valueClass ?? 'text-stone-900 dark:text-white'}`}>
      {value}
    </p>
  </div>
);

// ─── Main Component ───────────────────────────────────────────────────────────

export const AccountsLedgerAdminView: React.FC<AccountsLedgerAdminViewProps> = ({
  products,
  onRefresh,
}) => {
  const { showToast, confirm } = useFeedback();

  // ── Data state ──
  const [sales, setSales] = useState<SaleRecord[]>([]);
  const [buyers, setBuyers] = useState<Buyer[]>([]);
  const [payments, setPayments] = useState<BuyerPayment[]>([]);
  const [expenses, setExpenses] = useState<OperationalExpense[]>([]);
  const [loading, setLoading] = useState(true);

  // ── UI state ──
  const [subTab, setSubTab] = useState<SubTab>('buyer');

  // Tab A
  const [searchQuery, setSearchQuery] = useState('');
  const [pendingOnly, setPendingOnly] = useState(false);
  const [expandedBuyerId, setExpandedBuyerId] = useState<string | null>(null);
  const [showAddBuyer, setShowAddBuyer] = useState(false);
  const [paymentBuyer, setPaymentBuyer] = useState<Buyer | null>(null);
  const [addBuyerForm, setAddBuyerForm] = useState<AddBuyerForm>({
    name: '',
    phone: '',
    shop_name: '',
    address: '',
    notes: '',
  });
  const [paymentForm, setPaymentForm] = useState<PaymentForm>({
    payment_date: todayISO(),
    amount: '',
    payment_method: 'cash',
    notes: '',
  });
  const [buyerSaving, setBuyerSaving] = useState(false);
  const [paymentSaving, setPaymentSaving] = useState(false);
  const [importingFromSales, setImportingFromSales] = useState(false);

  // Tab B
  const [expenseCategoryFilter, setExpenseCategoryFilter] = useState('all');
  const [expenseStartDate, setExpenseStartDate] = useState('');
  const [expenseEndDate, setExpenseEndDate] = useState('');
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [expenseForm, setExpenseForm] = useState<ExpenseForm>({
    expense_date: todayISO(),
    category: 'vehicle_delivery',
    amount: '',
    product_id: '',
    notes: '',
  });
  const [expenseSaving, setExpenseSaving] = useState(false);
  const [deletingExpenseId, setDeletingExpenseId] = useState<string | null>(null);

  // ── Load all data ──
  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [s, b, p, e] = await Promise.all([
        fetchSales(),
        fetchBuyers(),
        fetchBuyerPayments(),
        fetchOperationalExpenses(),
      ]);
      setSales(s);
      setBuyers(b);
      setPayments(p);
      setExpenses(e);
    } catch (err: any) {
      showToast(err?.message || 'ഡാറ്റ ലോഡ് ചെയ്യുന്നതിൽ പിഴവ് (Error loading data)', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // ── KPI calculations ──
  const kpi = useMemo(() => {
    const totalBilled = sales.reduce((s, r) => s + (Number(r.total_amount) || 0), 0);
    const salesCollected = sales.reduce(
      (s, r) => s + (r.paid_amount != null ? Number(r.paid_amount) : Number(r.total_amount) || 0),
      0
    );
    const paymentCollected = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
    const cashCollected = salesCollected + paymentCollected;
    const outstanding = Math.max(0, totalBilled - cashCollected);
    const totalExpenses = expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);

    // Buyers with net outstanding > 0
    const buyersWithCredit = buyers.filter((b) => {
      const bSales = sales.filter(
        (s) => s.buyer_id === b.id || s.customer_name?.trim().toLowerCase() === b.name.trim().toLowerCase()
      );
      const bBilled = bSales.reduce((acc, r) => acc + (Number(r.total_amount) || 0), 0);
      const bPaid = payments
        .filter((p) => p.buyer_id === b.id)
        .reduce((acc, p) => acc + (Number(p.amount) || 0), 0);
      return bBilled - bPaid > 0;
    }).length;

    return { totalBilled, cashCollected, outstanding, buyersWithCredit, totalExpenses };
  }, [sales, buyers, payments, expenses]);

  // ── Buyer stats ──
  const buyerStats = useMemo<BuyerStats[]>(() => {
    return buyers.map((buyer) => {
      const linkedSales = sales.filter(
        (s) =>
          s.buyer_id === buyer.id ||
          s.customer_name?.trim().toLowerCase() === buyer.name.trim().toLowerCase()
      );
      const totalBilled = linkedSales.reduce((acc, r) => acc + (Number(r.total_amount) || 0), 0);
      const buyerPayments = payments.filter((p) => p.buyer_id === buyer.id);
      const totalPaid = buyerPayments.reduce((acc, p) => acc + (Number(p.amount) || 0), 0);
      const netCredit = totalBilled - totalPaid;
      return { buyer, totalBilled, totalPaid, netCredit, linkedSales, payments: buyerPayments };
    });
  }, [buyers, sales, payments]);

  // ── Filtered buyers ──
  const filteredBuyerStats = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return buyerStats.filter((bs) => {
      const matchSearch =
        !q ||
        bs.buyer.name.toLowerCase().includes(q) ||
        (bs.buyer.phone || '').toLowerCase().includes(q) ||
        (bs.buyer.shop_name || '').toLowerCase().includes(q);
      const matchPending = !pendingOnly || bs.netCredit > 0;
      return matchSearch && matchPending;
    });
  }, [buyerStats, searchQuery, pendingOnly]);

  // ── Filtered expenses ──
  const filteredExpenses = useMemo(() => {
    return expenses.filter((e) => {
      const matchCat = expenseCategoryFilter === 'all' || e.category === expenseCategoryFilter;
      const matchStart = !expenseStartDate || e.expense_date >= expenseStartDate;
      const matchEnd = !expenseEndDate || e.expense_date <= expenseEndDate;
      return matchCat && matchStart && matchEnd;
    });
  }, [expenses, expenseCategoryFilter, expenseStartDate, expenseEndDate]);

  const filteredExpenseTotal = useMemo(
    () => filteredExpenses.reduce((s, e) => s + (Number(e.amount) || 0), 0),
    [filteredExpenses]
  );

  // ── Import from sales ──
  const handleImportFromSales = useCallback(async () => {
    setImportingFromSales(true);
    try {
      await syncBuyersFromSales(sales);
      const freshBuyers = await fetchBuyers();
      setBuyers(freshBuyers);
      showToast('Sales-ൽ നിന്ന് ബയർ ഇംപോർട്ട് ചെയ്തു (Buyers imported from sales)', 'success');
    } catch (err: any) {
      showToast(err?.message || 'ഇംപോർട്ട് പരാജയപ്പെട്ടു (Import failed)', 'error');
    } finally {
      setImportingFromSales(false);
    }
  }, [sales, showToast]);

  // ── Add buyer ──
  const handleSaveBuyer = useCallback(async () => {
    if (!addBuyerForm.name.trim()) {
      showToast('പേര് ആവശ്യമാണ് (Name is required)', 'warning');
      return;
    }
    setBuyerSaving(true);
    try {
      await saveBuyer({
        name: addBuyerForm.name.trim(),
        phone: addBuyerForm.phone.trim() || undefined,
        shop_name: addBuyerForm.shop_name.trim() || undefined,
        address: addBuyerForm.address.trim() || undefined,
        notes: addBuyerForm.notes.trim() || undefined,
        is_active: true,
      });
      const freshBuyers = await fetchBuyers();
      setBuyers(freshBuyers);
      setShowAddBuyer(false);
      setAddBuyerForm({ name: '', phone: '', shop_name: '', address: '', notes: '' });
      showToast('ബയർ ചേർത്തു (Buyer added)', 'success');
    } catch (err: any) {
      showToast(err?.message || 'ബയർ സേവ് ചെയ്യുന്നതിൽ പിഴവ് (Error saving buyer)', 'error');
    } finally {
      setBuyerSaving(false);
    }
  }, [addBuyerForm, showToast]);

  // ── Delete buyer ──
  const handleDeleteBuyer = useCallback(
    async (buyer: Buyer) => {
      const confirmed = await confirm({
        title: 'ബയർ നീക്കം ചെയ്യണോ?',
        message: `"${buyer.name}" നിഷ്ക്രിയമാക്കും. (This will deactivate the buyer.)`,
        confirmLabel: 'നീക്കം ചെയ്യുക (Remove)',
        isDestructive: true,
      });
      if (!confirmed) return;
      try {
        await deleteBuyer(buyer.id);
        const freshBuyers = await fetchBuyers();
        setBuyers(freshBuyers);
        showToast('ബയർ നിഷ്ക്രിയമാക്കി (Buyer deactivated)', 'success');
      } catch (err: any) {
        showToast(err?.message || 'ഡിലീറ്റ് ചെയ്യുന്നതിൽ പിഴവ് (Error deleting buyer)', 'error');
      }
    },
    [confirm, showToast]
  );

  // ── Record payment ──
  const handleRecordPayment = useCallback(async () => {
    if (!paymentBuyer) return;
    const amount = parseFloat(paymentForm.amount);
    if (!paymentForm.amount || isNaN(amount) || amount <= 0) {
      showToast('സാധുതയുള്ള തുക നൽകുക (Enter a valid amount)', 'warning');
      return;
    }
    setPaymentSaving(true);
    try {
      await recordBuyerPayment({
        buyer_id: paymentBuyer.id,
        payment_date: paymentForm.payment_date,
        amount,
        payment_method: paymentForm.payment_method,
        notes: paymentForm.notes.trim() || undefined,
      });
      const freshPayments = await fetchBuyerPayments();
      setPayments(freshPayments);
      setPaymentBuyer(null);
      setPaymentForm({ payment_date: todayISO(), amount: '', payment_method: 'cash', notes: '' });
      showToast('അടവ് രേഖപ്പെടുത്തി (Payment recorded)', 'success');
    } catch (err: any) {
      showToast(err?.message || 'അടവ് സേവ് ചെയ്യുന്നതിൽ പിഴവ് (Error recording payment)', 'error');
    } finally {
      setPaymentSaving(false);
    }
  }, [paymentBuyer, paymentForm, showToast]);

  // ── Delete payment ──
  const handleDeletePayment = useCallback(
    async (payment: BuyerPayment) => {
      const confirmed = await confirm({
        title: 'അടവ് ഡിലീറ്റ് ചെയ്യണോ?',
        message: `${fmt(payment.amount)} — ${payment.payment_date} ഡിലീറ്റ് ചെയ്യും.`,
        isDestructive: true,
      });
      if (!confirmed) return;
      try {
        await deleteBuyerPayment(payment.id);
        const freshPayments = await fetchBuyerPayments();
        setPayments(freshPayments);
        showToast('അടവ് ഡിലീറ്റ് ചെയ്തു (Payment deleted)', 'success');
      } catch (err: any) {
        showToast(err?.message || 'ഡിലീറ്റ് ചെയ്യുന്നതിൽ പിഴവ്', 'error');
      }
    },
    [confirm, showToast]
  );

  // ── Log expense ──
  const handleSaveExpense = useCallback(async () => {
    const amount = parseFloat(expenseForm.amount);
    if (!expenseForm.amount || isNaN(amount) || amount <= 0) {
      showToast('സാധുതയുള്ള തുക നൽകുക (Enter a valid amount)', 'warning');
      return;
    }
    setExpenseSaving(true);
    try {
      await recordOperationalExpense({
        expense_date: expenseForm.expense_date,
        category: expenseForm.category,
        amount,
        product_id: expenseForm.product_id || undefined,
        notes: expenseForm.notes.trim() || undefined,
      });
      const freshExpenses = await fetchOperationalExpenses();
      setExpenses(freshExpenses);
      setShowAddExpense(false);
      setExpenseForm({
        expense_date: todayISO(),
        category: 'vehicle_delivery',
        amount: '',
        product_id: '',
        notes: '',
      });
      showToast('ചെലവ് രേഖപ്പെടുത്തി (Expense logged)', 'success');
    } catch (err: any) {
      showToast(err?.message || 'ചെലവ് സേവ് ചെയ്യുന്നതിൽ പിഴവ്', 'error');
    } finally {
      setExpenseSaving(false);
    }
  }, [expenseForm, showToast]);

  // ── Delete expense ──
  const handleDeleteExpense = useCallback(
    async (expense: OperationalExpense) => {
      const confirmed = await confirm({
        title: 'ചെലവ് ഡിലീറ്റ് ചെയ്യണോ?',
        message: `${fmt(expense.amount)} — ${EXPENSE_CATEGORY_LABELS[expense.category] ?? expense.category} ഡിലീറ്റ് ചെയ്യും.`,
        isDestructive: true,
      });
      if (!confirmed) return;
      setDeletingExpenseId(expense.id);
      try {
        await deleteOperationalExpense(expense.id);
        const freshExpenses = await fetchOperationalExpenses();
        setExpenses(freshExpenses);
        showToast('ചെലവ് ഡിലീറ്റ് ചെയ്തു (Expense deleted)', 'success');
      } catch (err: any) {
        showToast(err?.message || 'ഡിലീറ്റ് ചെയ്യുന്നതിൽ പിഴവ്', 'error');
      } finally {
        setDeletingExpenseId(null);
      }
    },
    [confirm, showToast]
  );

  // ── Refresh ──
  const handleRefresh = useCallback(async () => {
    await loadAll();
    if (onRefresh) await onRefresh();
  }, [loadAll, onRefresh]);

  // ── Combined timeline for buyer history ──
  const getBuyerTimeline = useCallback(
    (bs: BuyerStats) => {
      type TimelineItem =
        | { type: 'sale'; date: string; record: SaleRecord }
        | { type: 'payment'; date: string; record: BuyerPayment };

      const items: TimelineItem[] = [
        ...bs.linkedSales.map((s) => ({
          type: 'sale' as const,
          date: s.sale_date,
          record: s,
        })),
        ...bs.payments.map((p) => ({
          type: 'payment' as const,
          date: p.payment_date,
          record: p,
        })),
      ];
      return items.sort((a, b) => (a.date > b.date ? -1 : 1));
    },
    []
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <FiRefreshCw className="w-8 h-8 text-stone-400 dark:text-stone-500 animate-spin" />
        <p className="text-stone-500 dark:text-stone-400 font-malayalam text-sm">
          ലോഡ് ചെയ്യുന്നു... (Loading...)
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-16">
      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
            <FiBookOpen className="w-5 h-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <h2 className="text-base font-black text-stone-900 dark:text-white font-malayalam leading-tight">
              അക്കൗണ്ട്സ് ലെഡ്ജർ
            </h2>
            <p className="text-xs text-stone-500 dark:text-stone-400">Accounts Ledger</p>
          </div>
        </div>
        <button
          onClick={handleRefresh}
          className="press-apple cursor-pointer flex items-center gap-2 px-3 py-2 rounded-xl border border-stone-200 dark:border-[#2E2828] bg-white dark:bg-[#181515] text-stone-600 dark:text-stone-300 text-xs font-bold hover:bg-stone-50 dark:hover:bg-[#1E1B1B] transition-colors"
        >
          <FiRefreshCw className="w-3.5 h-3.5" />
          <span className="font-malayalam">പുതുക്കുക</span>
        </button>
      </div>

      {/* ── KPI Cards ── */}
      <div className="flex gap-3 overflow-x-auto pb-1 no-scrollbar">
        <KpiCard
          icon={<FiShoppingBag className="w-4 h-4" />}
          title="ആകെ ബില്ല്"
          subtitle="Total Billed"
          value={fmt(kpi.totalBilled)}
        />
        <KpiCard
          icon={<FiCheck className="w-4 h-4" />}
          title="അടച്ചത്"
          subtitle="Cash Collected"
          value={fmt(kpi.cashCollected)}
          valueClass="text-emerald-600 dark:text-emerald-400"
        />
        <KpiCard
          icon={<FiAlertCircle className="w-4 h-4" />}
          title="ബാക്കി കുടിശ്ശിക"
          subtitle="Outstanding Credit"
          value={fmt(kpi.outstanding)}
          valueClass={
            kpi.outstanding > 0
              ? 'text-amber-600 dark:text-amber-400'
              : 'text-stone-900 dark:text-white'
          }
        />
        <KpiCard
          icon={<FiUsers className="w-4 h-4" />}
          title="കുടിശ്ശികയുള്ളവർ"
          subtitle="Buyers on Credit"
          value={String(kpi.buyersWithCredit)}
          valueClass={
            kpi.buyersWithCredit > 0
              ? 'text-amber-600 dark:text-amber-400'
              : 'text-stone-900 dark:text-white'
          }
        />
        <KpiCard
          icon={<FiTrendingDown className="w-4 h-4" />}
          title="പ്രവർത്തന ചെലവ്"
          subtitle="Operational Expenses"
          value={fmt(kpi.totalExpenses)}
          badge="കുറിപ്പ് മാത്രം"
        />
      </div>

      {/* ── Sub-Tab Navigation ── */}
      <div className="flex gap-1 p-1 bg-stone-100 dark:bg-[#1A1717] rounded-2xl w-fit">
        {(
          [
            { key: 'buyer', ml: 'ബയർ ലെഡ്ജർ', en: 'Buyer Ledger', icon: <FiUsers className="w-3.5 h-3.5" /> },
            { key: 'expense', ml: 'ചെലവ് കുറിപ്പ്', en: 'Expense Notes', icon: <FiDollarSign className="w-3.5 h-3.5" /> },
          ] as const
        ).map((tab) => (
          <button
            key={tab.key}
            onClick={() => setSubTab(tab.key)}
            className={`press-apple cursor-pointer flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all font-malayalam ${
              subTab === tab.key
                ? 'bg-epso-red text-white dark:bg-amber-500 dark:text-stone-950 shadow-sm'
                : 'text-stone-600 dark:text-stone-400 hover:bg-white/50 dark:hover:bg-white/5'
            }`}
          >
            {tab.icon}
            <span>{tab.ml}</span>
          </button>
        ))}
      </div>

      {/* ═══════════════════════════════ TAB A: BUYER LEDGER ══════════════════════════════ */}
      {subTab === 'buyer' && (
        <div className="space-y-4">
          {/* Controls */}
          <div className="flex flex-wrap gap-2 items-center">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px]">
              <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400 dark:text-stone-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="പേര്, ഫോൺ, ഷോപ്പ്... (Name, Phone, Shop)"
                className="w-full pl-9 pr-3 py-2.5 text-xs font-malayalam bg-white dark:bg-[#181515] border border-stone-200 dark:border-[#2E2828] rounded-xl text-stone-900 dark:text-white placeholder:text-stone-400 dark:placeholder:text-stone-600 focus:outline-none focus:ring-2 focus:ring-amber-500/40"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-lg hover:bg-stone-100 dark:hover:bg-[#2E2828] cursor-pointer"
                >
                  <FiX className="w-3.5 h-3.5 text-stone-400" />
                </button>
              )}
            </div>

            {/* Pending only toggle */}
            <button
              onClick={() => setPendingOnly((v) => !v)}
              className={`press-apple cursor-pointer flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-bold font-malayalam border transition-all ${
                pendingOnly
                  ? 'bg-amber-500 text-stone-950 border-amber-500'
                  : 'bg-white dark:bg-[#181515] text-stone-700 dark:text-stone-300 border-stone-200 dark:border-[#2E2828]'
              }`}
            >
              <FiFilter className="w-3.5 h-3.5" />
              കുടിശ്ശിക മാത്രം
            </button>

            {/* Add buyer */}
            <button
              onClick={() => setShowAddBuyer(true)}
              className="press-apple cursor-pointer flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-bold font-malayalam bg-epso-red text-white dark:bg-amber-500 dark:text-stone-950 shadow-sm"
            >
              <FiPlus className="w-3.5 h-3.5" />+ പുതിയ ബയർ
            </button>

            {/* Import from sales */}
            <button
              onClick={handleImportFromSales}
              disabled={importingFromSales}
              className="press-apple cursor-pointer flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-bold font-malayalam bg-white dark:bg-[#181515] text-stone-700 dark:text-stone-300 border border-stone-200 dark:border-[#2E2828] disabled:opacity-50"
            >
              {importingFromSales ? (
                <FiRefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <FiShoppingBag className="w-3.5 h-3.5" />
              )}
              Sales-ൽ നിന്ന് ഇംപോർട്ട്
            </button>
          </div>

          {/* Buyer list */}
          {filteredBuyerStats.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <FiUsers className="w-10 h-10 text-stone-300 dark:text-stone-600" />
              <p className="text-stone-500 dark:text-stone-400 font-malayalam text-sm text-center">
                {pendingOnly ? 'കുടിശ്ശിക ഉള്ള ബയർ ഇല്ല' : 'ഒരു ബയറും ഇല്ല'}
              </p>
              <p className="text-stone-400 dark:text-stone-500 text-xs text-center">
                {pendingOnly ? 'No buyers with outstanding credit' : 'No buyers found'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredBuyerStats.map((bs) => {
                const isExpanded = expandedBuyerId === bs.buyer.id;
                const timeline = isExpanded ? getBuyerTimeline(bs) : [];
                const creditClass =
                  bs.netCredit > 500
                    ? 'text-red-600 dark:text-red-400'
                    : bs.netCredit > 0
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-emerald-600 dark:text-emerald-400';

                return (
                  <div
                    key={bs.buyer.id}
                    className="bg-white dark:bg-[#181515] border border-stone-200 dark:border-[#2E2828] rounded-2xl overflow-hidden"
                  >
                    {/* Buyer header */}
                    <div className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <p className="font-black text-stone-900 dark:text-white text-sm font-malayalam truncate">
                            {bs.buyer.name}
                          </p>
                          {bs.buyer.shop_name && (
                            <p className="text-xs text-stone-500 dark:text-stone-400 font-malayalam truncate">
                              {bs.buyer.shop_name}
                            </p>
                          )}
                          {bs.buyer.phone && (
                            <div className="flex items-center gap-1 mt-0.5">
                              <FiPhone className="w-3 h-3 text-stone-400" />
                              <p className="text-xs text-stone-500 dark:text-stone-400">{bs.buyer.phone}</p>
                            </div>
                          )}
                        </div>

                        {/* Delete */}
                        <button
                          onClick={() => handleDeleteBuyer(bs.buyer)}
                          className="press-apple cursor-pointer p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 text-stone-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                        >
                          <FiTrash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Mini stats */}
                      <div className="grid grid-cols-3 gap-2 mt-3">
                        <div className="bg-stone-50 dark:bg-[#1A1717] rounded-xl p-2.5 text-center">
                          <p className="text-[9px] font-bold text-stone-500 dark:text-stone-400 font-malayalam uppercase tracking-wide">
                            വാങ്ങിയത്
                          </p>
                          <p className="text-xs font-black text-stone-800 dark:text-stone-200 mt-0.5">
                            {fmt(bs.totalBilled)}
                          </p>
                        </div>
                        <div className="bg-stone-50 dark:bg-[#1A1717] rounded-xl p-2.5 text-center">
                          <p className="text-[9px] font-bold text-stone-500 dark:text-stone-400 font-malayalam uppercase tracking-wide">
                            അടച്ചത്
                          </p>
                          <p className="text-xs font-black text-emerald-600 dark:text-emerald-400 mt-0.5">
                            {fmt(bs.totalPaid)}
                          </p>
                        </div>
                        <div className="bg-stone-50 dark:bg-[#1A1717] rounded-xl p-2.5 text-center">
                          <p className="text-[9px] font-bold text-stone-500 dark:text-stone-400 font-malayalam uppercase tracking-wide">
                            ബാക്കി
                          </p>
                          <p className={`text-xs font-black mt-0.5 ${creditClass}`}>
                            {fmt(bs.netCredit)}
                          </p>
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="flex gap-2 mt-3">
                        <button
                          onClick={() => {
                            setPaymentBuyer(bs.buyer);
                            setPaymentForm({
                              payment_date: todayISO(),
                              amount: '',
                              payment_method: 'cash',
                              notes: '',
                            });
                          }}
                          className="press-apple cursor-pointer flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold font-malayalam bg-epso-red text-white dark:bg-amber-500 dark:text-stone-950 shadow-sm"
                        >
                          <FiCreditCard className="w-3.5 h-3.5" />
                          അടവ് രേഖ. (Payment)
                        </button>
                        <button
                          onClick={() =>
                            setExpandedBuyerId(isExpanded ? null : bs.buyer.id)
                          }
                          className="press-apple cursor-pointer flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold font-malayalam bg-stone-100 dark:bg-[#2E2828] text-stone-700 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-[#3A3333] transition-colors"
                        >
                          {isExpanded ? (
                            <FiChevronUp className="w-3.5 h-3.5" />
                          ) : (
                            <FiChevronDown className="w-3.5 h-3.5" />
                          )}
                          ഹിസ്റ്ററി (History)
                        </button>
                      </div>
                    </div>

                    {/* Expanded history */}
                    {isExpanded && (
                      <div className="border-t border-stone-100 dark:border-[#2E2828] bg-stone-50 dark:bg-[#141212] p-4 space-y-2">
                        <p className="text-xs font-black text-stone-500 dark:text-stone-400 uppercase tracking-wide font-malayalam">
                          ഇടപാട് ചരിത്രം — Transaction History
                        </p>
                        {timeline.length === 0 ? (
                          <p className="text-xs text-stone-400 dark:text-stone-500 font-malayalam py-4 text-center">
                            ഇടപാടുകൾ ഒന്നും ഇല്ല (No transactions)
                          </p>
                        ) : (
                          <div className="space-y-2">
                            {timeline.map((item, idx) => (
                              <div
                                key={idx}
                                className={`flex items-center justify-between gap-3 p-2.5 rounded-xl border text-xs ${
                                  item.type === 'sale'
                                    ? 'bg-white dark:bg-[#1A1717] border-stone-200 dark:border-[#2E2828]'
                                    : 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/40'
                                }`}
                              >
                                <div className="flex items-center gap-2">
                                  <div
                                    className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${
                                      item.type === 'sale'
                                        ? 'bg-stone-100 dark:bg-[#2E2828]'
                                        : 'bg-emerald-100 dark:bg-emerald-900/40'
                                    }`}
                                  >
                                    {item.type === 'sale' ? (
                                      <FiShoppingBag className="w-3 h-3 text-stone-500 dark:text-stone-400" />
                                    ) : (
                                      <FiCheck className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                                    )}
                                  </div>
                                  <div>
                                    <p className="font-bold text-stone-700 dark:text-stone-300 font-malayalam">
                                      {item.type === 'sale'
                                        ? (item.record as SaleRecord).product_name
                                        : 'അടവ് (Payment)'}
                                    </p>
                                    <p className="text-stone-400 dark:text-stone-500">
                                      {item.date}
                                      {item.type === 'payment' &&
                                        ` · ${(item.record as BuyerPayment).payment_method}`}
                                    </p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <span
                                    className={`font-black ${
                                      item.type === 'sale'
                                        ? 'text-stone-800 dark:text-stone-200'
                                        : 'text-emerald-600 dark:text-emerald-400'
                                    }`}
                                  >
                                    {item.type === 'sale'
                                      ? fmt((item.record as SaleRecord).total_amount)
                                      : '+' + fmt((item.record as BuyerPayment).amount)}
                                  </span>
                                  {item.type === 'payment' && (
                                    <button
                                      onClick={() =>
                                        handleDeletePayment(item.record as BuyerPayment)
                                      }
                                      className="press-apple cursor-pointer p-1 rounded-lg hover:bg-red-100 dark:hover:bg-red-950/40 text-stone-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                                    >
                                      <FiTrash2 className="w-3 h-3" />
                                    </button>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════ TAB B: EXPENSE NOTES ═════════════════════════════ */}
      {subTab === 'expense' && (
        <div className="space-y-4">
          {/* Disclaimer */}
          <div className="flex gap-3 p-4 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/40 rounded-2xl">
            <FiAlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-black text-amber-800 dark:text-amber-400 font-malayalam leading-snug">
                ശ്രദ്ധിക്കുക: പ്രവർത്തന ചെലവുകൾ റഫറൻസിനായുള്ള കുറിപ്പുകൾ മാത്രമാണ്; ഉൽപ്പന്ന
                കോസ്റ്റിംഗിലോ വിൽപ്പന ലാഭത്തിലോ ഇവ കുറയ്ക്കില്ല.
              </p>
              <p className="text-[11px] text-amber-700 dark:text-amber-500 mt-1">
                Note: Operational expenses are reference notes only; they are NOT deducted from
                product costing or sales profit.
              </p>
            </div>
          </div>

          {/* Controls */}
          <div className="flex flex-wrap gap-2 items-center">
            {/* Category filter */}
            <div className="relative">
              <FiFilter className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stone-400 dark:text-stone-500 pointer-events-none" />
              <select
                value={expenseCategoryFilter}
                onChange={(e) => setExpenseCategoryFilter(e.target.value)}
                className="pl-8 pr-3 py-2.5 text-xs font-malayalam bg-white dark:bg-[#181515] border border-stone-200 dark:border-[#2E2828] rounded-xl text-stone-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500/40 cursor-pointer"
              >
                <option value="all">എല്ലാ വിഭാഗം (All)</option>
                {EXPENSE_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Date range */}
            <div className="relative">
              <FiCalendar className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stone-400 dark:text-stone-500 pointer-events-none" />
              <input
                type="date"
                value={expenseStartDate}
                onChange={(e) => setExpenseStartDate(e.target.value)}
                className="pl-8 pr-3 py-2.5 text-xs bg-white dark:bg-[#181515] border border-stone-200 dark:border-[#2E2828] rounded-xl text-stone-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500/40 cursor-pointer"
              />
            </div>
            <span className="text-xs text-stone-400 dark:text-stone-500">→</span>
            <input
              type="date"
              value={expenseEndDate}
              onChange={(e) => setExpenseEndDate(e.target.value)}
              className="px-3 py-2.5 text-xs bg-white dark:bg-[#181515] border border-stone-200 dark:border-[#2E2828] rounded-xl text-stone-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500/40 cursor-pointer"
            />

            {(expenseStartDate || expenseEndDate) && (
              <button
                onClick={() => {
                  setExpenseStartDate('');
                  setExpenseEndDate('');
                }}
                className="press-apple cursor-pointer p-2 rounded-xl border border-stone-200 dark:border-[#2E2828] bg-white dark:bg-[#181515] text-stone-500 hover:text-red-500 dark:hover:text-red-400 transition-colors"
              >
                <FiX className="w-3.5 h-3.5" />
              </button>
            )}

            <div className="flex-1" />

            {/* Log expense button */}
            <button
              onClick={() => setShowAddExpense(true)}
              className="press-apple cursor-pointer flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-bold font-malayalam bg-epso-red text-white dark:bg-amber-500 dark:text-stone-950 shadow-sm"
            >
              <FiPlus className="w-3.5 h-3.5" />+ ചെലവ് ചേർക്കുക
            </button>
          </div>

          {/* Expense table */}
          <div className="bg-white dark:bg-[#181515] border border-stone-200 dark:border-[#2E2828] rounded-2xl overflow-hidden">
            {filteredExpenses.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <FiDollarSign className="w-10 h-10 text-stone-300 dark:text-stone-600" />
                <p className="text-stone-500 dark:text-stone-400 font-malayalam text-sm text-center">
                  ചെലവ് ഒന്നും ഇല്ല
                </p>
                <p className="text-stone-400 dark:text-stone-500 text-xs text-center">
                  No expenses found for this period
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-stone-100 dark:border-[#2E2828] bg-stone-50 dark:bg-[#1A1717]">
                      <th className="text-left px-4 py-3 font-black text-stone-500 dark:text-stone-400 uppercase tracking-wide font-malayalam">
                        തീയതി
                      </th>
                      <th className="text-left px-4 py-3 font-black text-stone-500 dark:text-stone-400 uppercase tracking-wide font-malayalam">
                        വിഭാഗം
                      </th>
                      <th className="text-right px-4 py-3 font-black text-stone-500 dark:text-stone-400 uppercase tracking-wide font-malayalam">
                        തുക (₹)
                      </th>
                      <th className="text-left px-4 py-3 font-black text-stone-500 dark:text-stone-400 uppercase tracking-wide font-malayalam">
                        ഉൽപ്പന്നം
                      </th>
                      <th className="text-left px-4 py-3 font-black text-stone-500 dark:text-stone-400 uppercase tracking-wide font-malayalam">
                        കുറിപ്പ്
                      </th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100 dark:divide-[#2E2828]">
                    {filteredExpenses.map((exp) => (
                      <tr
                        key={exp.id}
                        className="hover:bg-stone-50 dark:hover:bg-[#1A1717] transition-colors"
                      >
                        <td className="px-4 py-3 text-stone-700 dark:text-stone-300 whitespace-nowrap">
                          {exp.expense_date}
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-block px-2 py-0.5 rounded-lg bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 font-bold font-malayalam text-[10px]">
                            {EXPENSE_CATEGORY_LABELS[exp.category] ?? exp.category}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-black text-stone-800 dark:text-stone-200 whitespace-nowrap">
                          {fmt(exp.amount)}
                        </td>
                        <td className="px-4 py-3 text-stone-500 dark:text-stone-400 font-malayalam">
                          {exp.product_name ?? '—'}
                        </td>
                        <td className="px-4 py-3 text-stone-500 dark:text-stone-400 font-malayalam max-w-[180px] truncate">
                          {exp.notes ?? '—'}
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => handleDeleteExpense(exp)}
                            disabled={deletingExpenseId === exp.id}
                            className="press-apple cursor-pointer p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 text-stone-400 hover:text-red-500 dark:hover:text-red-400 transition-colors disabled:opacity-50"
                          >
                            {deletingExpenseId === exp.id ? (
                              <FiRefreshCw className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <FiTrash2 className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-stone-200 dark:border-[#3A3333] bg-amber-50 dark:bg-amber-950/10">
                      <td
                        colSpan={2}
                        className="px-4 py-3 font-black text-stone-700 dark:text-stone-300 font-malayalam"
                      >
                        ആകെ (Period Total)
                      </td>
                      <td className="px-4 py-3 text-right font-black text-amber-700 dark:text-amber-400">
                        {fmt(filteredExpenseTotal)}
                      </td>
                      <td colSpan={3} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════ MODALS ═════════════════════════════════════════ */}

      {/* Add Buyer Modal */}
      {showAddBuyer && (
        <ModalBackdrop onClose={() => !buyerSaving && setShowAddBuyer(false)}>
          <div className="bg-white dark:bg-[#181515] border border-stone-200 dark:border-[#2E2828] rounded-3xl p-6 shadow-2xl space-y-5">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-black text-stone-900 dark:text-white font-malayalam">
                  പുതിയ ബയർ
                </h3>
                <p className="text-xs text-stone-500 dark:text-stone-400">Add New Buyer</p>
              </div>
              <button
                onClick={() => setShowAddBuyer(false)}
                disabled={buyerSaving}
                className="press-apple cursor-pointer p-2 rounded-xl hover:bg-stone-100 dark:hover:bg-[#2E2828] text-stone-500 dark:text-stone-400 transition-colors disabled:opacity-50"
              >
                <FiX className="w-4 h-4" />
              </button>
            </div>

            {/* Fields */}
            <div className="space-y-3">
              {[
                { key: 'name', label: 'പേര് (Name) *', placeholder: 'ബയർ / ഷോപ്പ് ഉടമ', required: true },
                { key: 'phone', label: 'ഫോൺ (Phone)', placeholder: '+91 9xxxxxxxx' },
                { key: 'shop_name', label: 'ഷോപ്പ് (Shop Name)', placeholder: 'ഷോപ്പ് / സ്ഥാപനം' },
                { key: 'address', label: 'വിലാസം (Address)', placeholder: 'ഓപ്ഷണൽ' },
                { key: 'notes', label: 'കുറിപ്പ് (Notes)', placeholder: 'ഓപ്ഷണൽ' },
              ].map(({ key, label, placeholder }) => (
                <div key={key}>
                  <label className="block text-xs font-bold text-stone-600 dark:text-stone-400 font-malayalam mb-1">
                    {label}
                  </label>
                  <input
                    type="text"
                    value={(addBuyerForm as any)[key]}
                    onChange={(e) =>
                      setAddBuyerForm((f) => ({ ...f, [key]: e.target.value }))
                    }
                    placeholder={placeholder}
                    className="w-full px-3 py-2.5 text-xs font-malayalam bg-stone-50 dark:bg-[#1A1717] border border-stone-200 dark:border-[#2E2828] rounded-xl text-stone-900 dark:text-white placeholder:text-stone-400 dark:placeholder:text-stone-600 focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                  />
                </div>
              ))}
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setShowAddBuyer(false)}
                disabled={buyerSaving}
                className="press-apple cursor-pointer flex-1 py-2.5 rounded-2xl border border-stone-200 dark:border-[#2E2828] bg-stone-100 dark:bg-[#2E2828] text-stone-700 dark:text-stone-300 text-xs font-bold font-malayalam disabled:opacity-50"
              >
                റദ്ദാക്കുക (Cancel)
              </button>
              <button
                onClick={handleSaveBuyer}
                disabled={buyerSaving || !addBuyerForm.name.trim()}
                className="press-apple cursor-pointer flex-1 py-2.5 rounded-2xl bg-epso-red text-white dark:bg-amber-500 dark:text-stone-950 text-xs font-black font-malayalam shadow-sm disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {buyerSaving ? (
                  <FiRefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <FiCheck className="w-3.5 h-3.5" />
                )}
                സേവ് ചെയ്യുക (Save)
              </button>
            </div>
          </div>
        </ModalBackdrop>
      )}

      {/* Record Payment Modal */}
      {paymentBuyer && (
        <ModalBackdrop onClose={() => !paymentSaving && setPaymentBuyer(null)}>
          <div className="bg-white dark:bg-[#181515] border border-stone-200 dark:border-[#2E2828] rounded-3xl p-6 shadow-2xl space-y-5">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-black text-stone-900 dark:text-white font-malayalam">
                  അടവ് രേഖപ്പെടുത്തൽ
                </h3>
                <p className="text-xs text-stone-500 dark:text-stone-400">
                  Record Payment — {paymentBuyer.name}
                </p>
              </div>
              <button
                onClick={() => setPaymentBuyer(null)}
                disabled={paymentSaving}
                className="press-apple cursor-pointer p-2 rounded-xl hover:bg-stone-100 dark:hover:bg-[#2E2828] text-stone-500 dark:text-stone-400 transition-colors disabled:opacity-50"
              >
                <FiX className="w-4 h-4" />
              </button>
            </div>

            {/* Buyer badge */}
            <div className="flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/40 rounded-2xl">
              <FiUsers className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
              <div>
                <p className="text-xs font-black text-amber-800 dark:text-amber-400 font-malayalam">
                  {paymentBuyer.name}
                </p>
                {paymentBuyer.shop_name && (
                  <p className="text-[10px] text-amber-600 dark:text-amber-500 font-malayalam">
                    {paymentBuyer.shop_name}
                  </p>
                )}
              </div>
            </div>

            {/* Fields */}
            <div className="space-y-3">
              {/* Date */}
              <div>
                <label className="block text-xs font-bold text-stone-600 dark:text-stone-400 font-malayalam mb-1">
                  തീയതി (Date)
                </label>
                <input
                  type="date"
                  value={paymentForm.payment_date}
                  onChange={(e) =>
                    setPaymentForm((f) => ({ ...f, payment_date: e.target.value }))
                  }
                  className="w-full px-3 py-2.5 text-xs bg-stone-50 dark:bg-[#1A1717] border border-stone-200 dark:border-[#2E2828] rounded-xl text-stone-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500/40 cursor-pointer"
                />
              </div>

              {/* Amount */}
              <div>
                <label className="block text-xs font-bold text-stone-600 dark:text-stone-400 font-malayalam mb-1">
                  തുക ₹ (Amount) *
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={paymentForm.amount}
                  onChange={(e) =>
                    setPaymentForm((f) => ({ ...f, amount: e.target.value }))
                  }
                  placeholder="0.00"
                  className="w-full px-3 py-2.5 text-xs bg-stone-50 dark:bg-[#1A1717] border border-stone-200 dark:border-[#2E2828] rounded-xl text-stone-900 dark:text-white placeholder:text-stone-400 dark:placeholder:text-stone-600 focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                />
              </div>

              {/* Payment method */}
              <div>
                <label className="block text-xs font-bold text-stone-600 dark:text-stone-400 font-malayalam mb-1">
                  മോഡ് (Payment Method)
                </label>
                <div className="flex gap-2 flex-wrap">
                  {(['cash', 'upi', 'bank', 'other'] as const).map((method) => (
                    <button
                      key={method}
                      onClick={() => setPaymentForm((f) => ({ ...f, payment_method: method }))}
                      className={`press-apple cursor-pointer px-3 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wide border transition-all ${
                        paymentForm.payment_method === method
                          ? 'bg-epso-red text-white dark:bg-amber-500 dark:text-stone-950 border-transparent'
                          : 'bg-stone-100 dark:bg-[#2E2828] text-stone-600 dark:text-stone-400 border-stone-200 dark:border-[#3A3333]'
                      }`}
                    >
                      {method}
                    </button>
                  ))}
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-bold text-stone-600 dark:text-stone-400 font-malayalam mb-1">
                  കുറിപ്പ് (Notes)
                </label>
                <input
                  type="text"
                  value={paymentForm.notes}
                  onChange={(e) =>
                    setPaymentForm((f) => ({ ...f, notes: e.target.value }))
                  }
                  placeholder="ഓപ്ഷണൽ"
                  className="w-full px-3 py-2.5 text-xs font-malayalam bg-stone-50 dark:bg-[#1A1717] border border-stone-200 dark:border-[#2E2828] rounded-xl text-stone-900 dark:text-white placeholder:text-stone-400 dark:placeholder:text-stone-600 focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                />
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setPaymentBuyer(null)}
                disabled={paymentSaving}
                className="press-apple cursor-pointer flex-1 py-2.5 rounded-2xl border border-stone-200 dark:border-[#2E2828] bg-stone-100 dark:bg-[#2E2828] text-stone-700 dark:text-stone-300 text-xs font-bold font-malayalam disabled:opacity-50"
              >
                റദ്ദാക്കുക
              </button>
              <button
                onClick={handleRecordPayment}
                disabled={paymentSaving || !paymentForm.amount}
                className="press-apple cursor-pointer flex-1 py-2.5 rounded-2xl bg-epso-red text-white dark:bg-amber-500 dark:text-stone-950 text-xs font-black font-malayalam shadow-sm disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {paymentSaving ? (
                  <FiRefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <FiCheck className="w-3.5 h-3.5" />
                )}
                അടവ് സേവ് ചെയ്യുക (Save)
              </button>
            </div>
          </div>
        </ModalBackdrop>
      )}

      {/* Log Expense Modal */}
      {showAddExpense && (
        <ModalBackdrop onClose={() => !expenseSaving && setShowAddExpense(false)}>
          <div className="bg-white dark:bg-[#181515] border border-stone-200 dark:border-[#2E2828] rounded-3xl p-6 shadow-2xl space-y-5">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-black text-stone-900 dark:text-white font-malayalam">
                  ചെലവ് ചേർക്കുക
                </h3>
                <p className="text-xs text-stone-500 dark:text-stone-400">Log Operational Expense</p>
              </div>
              <button
                onClick={() => setShowAddExpense(false)}
                disabled={expenseSaving}
                className="press-apple cursor-pointer p-2 rounded-xl hover:bg-stone-100 dark:hover:bg-[#2E2828] text-stone-500 dark:text-stone-400 transition-colors disabled:opacity-50"
              >
                <FiX className="w-4 h-4" />
              </button>
            </div>

            {/* Reminder pill */}
            <div className="flex items-center gap-2 p-2.5 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/40 rounded-xl">
              <FiAlertCircle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
              <p className="text-[10px] text-amber-700 dark:text-amber-400 font-malayalam leading-tight">
                കുറിപ്പ് മാത്രം — ലാഭ കണക്കുകൂട്ടലിൽ ഉൾപ്പെടുത്തില്ല
              </p>
            </div>

            {/* Fields */}
            <div className="space-y-3">
              {/* Date */}
              <div>
                <label className="block text-xs font-bold text-stone-600 dark:text-stone-400 font-malayalam mb-1">
                  തീയതി (Date)
                </label>
                <input
                  type="date"
                  value={expenseForm.expense_date}
                  onChange={(e) =>
                    setExpenseForm((f) => ({ ...f, expense_date: e.target.value }))
                  }
                  className="w-full px-3 py-2.5 text-xs bg-stone-50 dark:bg-[#1A1717] border border-stone-200 dark:border-[#2E2828] rounded-xl text-stone-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500/40 cursor-pointer"
                />
              </div>

              {/* Category */}
              <div>
                <label className="block text-xs font-bold text-stone-600 dark:text-stone-400 font-malayalam mb-1">
                  വിഭാഗം (Category) *
                </label>
                <select
                  value={expenseForm.category}
                  onChange={(e) =>
                    setExpenseForm((f) => ({ ...f, category: e.target.value }))
                  }
                  className="w-full px-3 py-2.5 text-xs font-malayalam bg-stone-50 dark:bg-[#1A1717] border border-stone-200 dark:border-[#2E2828] rounded-xl text-stone-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500/40 cursor-pointer"
                >
                  {EXPENSE_CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Amount */}
              <div>
                <label className="block text-xs font-bold text-stone-600 dark:text-stone-400 font-malayalam mb-1">
                  തുക ₹ (Amount) *
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={expenseForm.amount}
                  onChange={(e) =>
                    setExpenseForm((f) => ({ ...f, amount: e.target.value }))
                  }
                  placeholder="0.00"
                  className="w-full px-3 py-2.5 text-xs bg-stone-50 dark:bg-[#1A1717] border border-stone-200 dark:border-[#2E2828] rounded-xl text-stone-900 dark:text-white placeholder:text-stone-400 dark:placeholder:text-stone-600 focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                />
              </div>

              {/* Product (optional) */}
              <div>
                <label className="block text-xs font-bold text-stone-600 dark:text-stone-400 font-malayalam mb-1">
                  ഉൽപ്പന്നം (Product — Optional)
                </label>
                <select
                  value={expenseForm.product_id}
                  onChange={(e) =>
                    setExpenseForm((f) => ({ ...f, product_id: e.target.value }))
                  }
                  className="w-full px-3 py-2.5 text-xs font-malayalam bg-stone-50 dark:bg-[#1A1717] border border-stone-200 dark:border-[#2E2828] rounded-xl text-stone-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500/40 cursor-pointer"
                >
                  <option value="">— ബന്ധിക്കേണ്ടതില്ല (None) —</option>
                  {products.filter((p) => p.isActive).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-bold text-stone-600 dark:text-stone-400 font-malayalam mb-1">
                  കുറിപ്പ് (Notes)
                </label>
                <input
                  type="text"
                  value={expenseForm.notes}
                  onChange={(e) =>
                    setExpenseForm((f) => ({ ...f, notes: e.target.value }))
                  }
                  placeholder="ഓപ്ഷണൽ"
                  className="w-full px-3 py-2.5 text-xs font-malayalam bg-stone-50 dark:bg-[#1A1717] border border-stone-200 dark:border-[#2E2828] rounded-xl text-stone-900 dark:text-white placeholder:text-stone-400 dark:placeholder:text-stone-600 focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                />
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setShowAddExpense(false)}
                disabled={expenseSaving}
                className="press-apple cursor-pointer flex-1 py-2.5 rounded-2xl border border-stone-200 dark:border-[#2E2828] bg-stone-100 dark:bg-[#2E2828] text-stone-700 dark:text-stone-300 text-xs font-bold font-malayalam disabled:opacity-50"
              >
                റദ്ദാക്കുക
              </button>
              <button
                onClick={handleSaveExpense}
                disabled={expenseSaving || !expenseForm.amount}
                className="press-apple cursor-pointer flex-1 py-2.5 rounded-2xl bg-epso-red text-white dark:bg-amber-500 dark:text-stone-950 text-xs font-black font-malayalam shadow-sm disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {expenseSaving ? (
                  <FiRefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <FiCheck className="w-3.5 h-3.5" />
                )}
                ചേർക്കുക (Log)
              </button>
            </div>
          </div>
        </ModalBackdrop>
      )}
    </div>
  );
};
