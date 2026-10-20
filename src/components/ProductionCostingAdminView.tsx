import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Product,
  Ingredient,
  ProductionRun,
  DailyClosing,
  DailyCostAllocation,
  PackagingItem,
  PackingRecord,
  FinalProductCosting,
  StockMovement,
} from '../types';
import {
  fetchDailyClosing,
  fetchDailyClosings,
  saveDailyClosing,
  fetchCostAllocations,
  fetchPackagingItems,
  savePackagingItem,
  deletePackagingItem,
  recordPacking,
  fetchPackingRecords,
  fetchOilPurchasesForDate,
  fetchLatestOilBalance,
  adjustIngredientStock,
} from '../services/supabase';
import {
  calculateContinuousOilExpense,
  allocateDailySharedExpenses,
  calculateFinalProductCosting,
  roundCurrency,
  roundStock,
} from '../services/costing';
import { AnimatedNumber } from './AnimatedNumber';
import { ThemeSelect } from './ThemeSelect';
import { LoadingSpinner } from './LoadingSpinner';
import { useLockBodyScroll } from '../hooks/useLockBodyScroll';
import {
  FiCalendar,
  FiDroplet,
  FiDollarSign,
  FiCheckCircle,
  FiPackage,
  FiTrendingUp,
  FiLayers,
  FiPlus,
  FiRefreshCw,
  FiBox,
  FiAlertCircle,
  FiSave,
  FiPieChart,
} from 'react-icons/fi';

interface ProductionCostingAdminViewProps {
  products: Product[];
  ingredients: Ingredient[];
  productionRuns: ProductionRun[];
  stockMovements?: StockMovement[];
  onRefresh: () => void;
}

type SubTab = 'closing' | 'final_costing' | 'oil_tracker' | 'packaging';

export const ProductionCostingAdminView: React.FC<ProductionCostingAdminViewProps> = ({
  products,
  ingredients,
  productionRuns,
  onRefresh,
}) => {
  const [subTab, setSubTab] = useState<SubTab>('closing');
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    return new Date().toISOString().split('T')[0];
  });

  // Loading states
  const [isLoadingDateData, setIsLoadingDateData] = useState<boolean>(false);
  const [isSavingClosing, setIsSavingClosing] = useState<boolean>(false);
  const [isSavingPacking, setIsSavingPacking] = useState<boolean>(false);
  const [isSavingPackaging, setIsSavingPackaging] = useState<boolean>(false);

  // Closing State for selected date
  const [existingClosing, setExistingClosing] = useState<DailyClosing | null>(null);
  const [oilOpeningKg, setOilOpeningKg] = useState<string>('30');
  const [oilPurchasesKg, setOilPurchasesKg] = useState<string>('0');
  const [oilClosingKg, setOilClosingKg] = useState<string>('22');
  const [oilCostPerKg, setOilCostPerKg] = useState<string>('150');
  const [productionWages, setProductionWages] = useState<string>('4000');
  const [closingNotes, setClosingNotes] = useState<string>('');

  // Daily Allocations & History
  const [dailyClosingsHistory, setDailyClosingsHistory] = useState<DailyClosing[]>([]);
  const [savedAllocations, setSavedAllocations] = useState<DailyCostAllocation[]>([]);

  // Packaging & Packing state
  const [packagingItems, setPackagingItems] = useState<PackagingItem[]>([]);
  const [packingRecords, setPackingRecords] = useState<PackingRecord[]>([]);

  // Modals
  const [isAddCoverModalOpen, setIsAddCoverModalOpen] = useState<boolean>(false);
  const [isRecordPackingModalOpen, setIsRecordPackingModalOpen] = useState<boolean>(false);
  const [isAdjustOilModalOpen, setIsAdjustOilModalOpen] = useState<boolean>(false);
  const [isWagesModalOpen, setIsWagesModalOpen] = useState<boolean>(false);

  useLockBodyScroll(isAddCoverModalOpen || isRecordPackingModalOpen || isAdjustOilModalOpen || isWagesModalOpen);

  // Packing Form
  const [packProductId, setPackProductId] = useState<string>('');
  const [packItemId, setPackItemId] = useState<string>('');
  const [packSizeLabel, setPackSizeLabel] = useState<string>('100g');
  const [packCount, setPackCount] = useState<string>('100');
  const [packNotes, setPackNotes] = useState<string>('');

  // Packaging Item Form
  const [newCoverProductId, setNewCoverProductId] = useState<string>('');
  const [newCoverSizeLabel, setNewCoverSizeLabel] = useState<string>('100g');
  const [newCoverGrams, setNewCoverGrams] = useState<string>('100');
  const [newCoverStock, setNewCoverStock] = useState<string>('500');
  const [newCoverUnitCost, setNewCoverUnitCost] = useState<string>('2.50');
  const [newCoverLabourRate, setNewCoverLabourRate] = useState<string>('1.00');

  // Oil Adjustment Form
  const [oilAdjustDelta, setOilAdjustDelta] = useState<string>('5');
  const [oilAdjustIsAdd, setOilAdjustIsAdd] = useState<boolean>(true);
  const [oilAdjustReason, setOilAdjustReason] = useState<string>('പുതിയ വാങ്ങൽ (New purchase)');

  // --------------------------------------------------------------------------
  // Data Loading
  // --------------------------------------------------------------------------

  const loadDateSpecificData = useCallback(async (date: string) => {
    setIsLoadingDateData(true);
    try {
      const [closing, allocations, purchases] = await Promise.all([
        fetchDailyClosing(date),
        fetchCostAllocations(date),
        fetchOilPurchasesForDate(date),
      ]);

      setExistingClosing(closing);
      setSavedAllocations(allocations);

      if (closing) {
        setOilOpeningKg(String(closing.oilOpeningBalance));
        setOilPurchasesKg(String(closing.oilPurchases));
        setOilClosingKg(String(closing.oilClosingBalance));
        setOilCostPerKg(String(closing.oilCostPerKg));
        setProductionWages(String(closing.productionWages));
        setClosingNotes(closing.notes || '');
      } else {
        // Auto-fetch continuous oil balance
        const latest = await fetchLatestOilBalance();
        setOilOpeningKg(String(latest.currentStock || 30));
        setOilPurchasesKg(String(purchases || 0));
        setOilClosingKg(String(Math.max(0, (latest.currentStock || 30) + (purchases || 0) - 8)));
        setOilCostPerKg(String(latest.avgCost || 150));
        setProductionWages('4000');
        setClosingNotes('');
      }
    } catch (err) {
      console.error('Error loading date data', err);
    } finally {
      setIsLoadingDateData(false);
    }
  }, []);

  const loadGeneralData = useCallback(async () => {
    try {
      const [closings, packItems, pRecords] = await Promise.all([
        fetchDailyClosings(60),
        fetchPackagingItems(),
        fetchPackingRecords({ limit: 100 }),
      ]);
      setDailyClosingsHistory(closings);
      setPackagingItems(packItems);
      setPackingRecords(pRecords);
    } catch (err) {
      console.error('Error loading general costing data', err);
    }
  }, []);

  useEffect(() => {
    loadDateSpecificData(selectedDate);
    loadGeneralData();
  }, [selectedDate, loadDateSpecificData, loadGeneralData]);

  // --------------------------------------------------------------------------
  // Computed Batches for Selected Date
  // --------------------------------------------------------------------------

  const dateRuns = useMemo(() => {
    return productionRuns.filter(
      (r) => r.productionDate === selectedDate && r.status === 'completed'
    );
  }, [productionRuns, selectedDate]);

  const dateProductsSummary = useMemo(() => {
    const map: Record<
      string,
      {
        productId: string;
        productName: string;
        totalProductionKg: number;
        batchCount: number;
        ingredientCost: number;
      }
    > = {};

    for (const r of dateRuns) {
      const pId = r.productId;
      const pName = r.productName || 'Product';
      const qty = Number(r.actualQuantity) || 0;
      const ingCost = Number(r.totalIngredientCost) || 0;

      if (!map[pId]) {
        map[pId] = {
          productId: pId,
          productName: pName,
          totalProductionKg: 0,
          batchCount: 0,
          ingredientCost: 0,
        };
      }
      map[pId].totalProductionKg += qty;
      map[pId].batchCount += 1;
      map[pId].ingredientCost += ingCost;
    }

    return Object.values(map);
  }, [dateRuns]);

  const totalDayProductionKg = useMemo(() => {
    return dateProductsSummary.reduce((sum, p) => sum + p.totalProductionKg, 0);
  }, [dateProductsSummary]);

  const totalDayIngredientCost = useMemo(() => {
    return dateProductsSummary.reduce((sum, p) => sum + p.ingredientCost, 0);
  }, [dateProductsSummary]);

  // --------------------------------------------------------------------------
  // Live Calculated Shared Expenses & Weight Allocations
  // --------------------------------------------------------------------------

  const liveOilCalculations = useMemo(() => {
    const openKg = parseFloat(oilOpeningKg) || 0;
    const purKg = parseFloat(oilPurchasesKg) || 0;
    const closeKg = parseFloat(oilClosingKg) || 0;
    const costKg = parseFloat(oilCostPerKg) || 0;

    return calculateContinuousOilExpense(openKg, purKg, closeKg, costKg);
  }, [oilOpeningKg, oilPurchasesKg, oilClosingKg, oilCostPerKg]);

  const liveAllocations = useMemo(() => {
    const wagesAmount = parseFloat(productionWages) || 0;
    return allocateDailySharedExpenses(
      dateProductsSummary,
      liveOilCalculations.oilTotalExpense,
      wagesAmount
    );
  }, [dateProductsSummary, liveOilCalculations.oilTotalExpense, productionWages]);

  const totalAllocatedCost = useMemo(() => {
    return liveAllocations.reduce((sum, a) => sum + a.totalProductionCost, 0);
  }, [liveAllocations]);

  // Reconciled Check
  const isOilReconciled = useMemo(() => {
    const sumAlloc = liveAllocations.reduce((sum, a) => sum + a.allocatedOilCost, 0);
    return Math.abs(roundCurrency(sumAlloc) - roundCurrency(liveOilCalculations.oilTotalExpense)) < 0.05;
  }, [liveAllocations, liveOilCalculations.oilTotalExpense]);

  const isWagesReconciled = useMemo(() => {
    const wagesAmount = parseFloat(productionWages) || 0;
    const sumAlloc = liveAllocations.reduce((sum, a) => sum + a.allocatedProductionWages, 0);
    return Math.abs(roundCurrency(sumAlloc) - roundCurrency(wagesAmount)) < 0.05;
  }, [liveAllocations, productionWages]);

  // --------------------------------------------------------------------------
  // Final Product Costings for Date
  // --------------------------------------------------------------------------

  const finalCostingsForDate = useMemo<FinalProductCosting[]>(() => {
    const currentAllocations = savedAllocations.length > 0 ? savedAllocations : liveAllocations;

    return currentAllocations.map((alloc) => {
      // Find packing records for this product on or related to this date
      const relevantPacking = packingRecords.filter(
        (p) => p.productId === alloc.productId && (p.packingDate === selectedDate || !selectedDate)
      );

      return calculateFinalProductCosting(alloc, relevantPacking);
    });
  }, [savedAllocations, liveAllocations, packingRecords, selectedDate]);

  // --------------------------------------------------------------------------
  // Handlers
  // --------------------------------------------------------------------------

  const handleSaveClosing = async () => {
    const openKg = parseFloat(oilOpeningKg) || 0;
    const purKg = parseFloat(oilPurchasesKg) || 0;
    const closeKg = parseFloat(oilClosingKg) || 0;
    const costKg = parseFloat(oilCostPerKg) || 0;
    const wages = parseFloat(productionWages) || 0;

    setIsSavingClosing(true);
    try {
      const saved = await saveDailyClosing({
        productionDate: selectedDate,
        oilOpeningBalance: openKg,
        oilPurchases: purKg,
        oilClosingBalance: closeKg,
        oilCostPerKg: costKg,
        productionWages: wages,
        notes: closingNotes,
        closedBy: 'Admin',
      });

      setExistingClosing(saved);
      await loadDateSpecificData(selectedDate);
      await loadGeneralData();
      onRefresh();
      alert(`വിജയകരം: ${selectedDate}-ലെ ദിവസേനയുള്ള ക്ലോസിംഗ് സേവ് ചെയ്തു!`);
    } catch (err: any) {
      alert(`ക്ലോസിംഗ് സേവ് ചെയ്യുന്നതിൽ പിഴവ്: ${err?.message || 'Error'}`);
    } finally {
      setIsSavingClosing(false);
    }
  };

  const handleRecordPackingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!packProductId) {
      alert('ദയവായി ഉൽപ്പന്നം തിരഞ്ഞെടുക്കുക');
      return;
    }
    const count = parseInt(packCount, 10);
    if (!count || count <= 0) {
      alert('പാക്കറ്റുകളുടെ എണ്ണം നൽകുക');
      return;
    }

    setIsSavingPacking(true);
    try {
      await recordPacking({
        packingDate: selectedDate,
        productId: packProductId,
        packagingItemId: packItemId || undefined,
        packetSize: packSizeLabel,
        packetsPacked: count,
        operatorName: 'Admin',
        notes: packNotes,
      });

      setIsRecordPackingModalOpen(false);
      setPackNotes('');
      await loadGeneralData();
      await loadDateSpecificData(selectedDate);
      alert('പാക്കിംഗ് റെക്കോർഡ് വിജയകരമായി രേഖപ്പെടുത്തി!');
    } catch (err: any) {
      alert(`പാക്കിംഗ് രേഖപ്പെടുത്തുന്നതിൽ പിഴവ്: ${err?.message || 'Error'}`);
    } finally {
      setIsSavingPacking(false);
    }
  };

  const handleCreatePackagingCover = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCoverProductId) {
      alert('ദയവായി ഉൽപ്പന്നം തിരഞ്ഞെടുക്കുക');
      return;
    }
    if (!newCoverSizeLabel.trim()) {
      alert('പാക്കറ്റ് സൈസ് നൽകുക (e.g. 100g)');
      return;
    }

    setIsSavingPackaging(true);
    try {
      await savePackagingItem({
        productId: newCoverProductId,
        sizeLabel: newCoverSizeLabel.trim(),
        sizeGrams: parseFloat(newCoverGrams) || 100,
        currentStock: parseFloat(newCoverStock) || 0,
        unitCost: parseFloat(newCoverUnitCost) || 0,
        packingLabourRate: parseFloat(newCoverLabourRate) || 1.0,
      });

      setIsAddCoverModalOpen(false);
      await loadGeneralData();
      alert('പാക്കേജിംഗ് കവർ വിജയകരമായി ചേർത്തു!');
    } catch (err: any) {
      alert(`പാക്കേജിംഗ് കവർ ചേർക്കുന്നതിൽ പിഴവ്: ${err?.message || 'Error'}`);
    } finally {
      setIsSavingPackaging(false);
    }
  };

  const handleOilAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    const delta = parseFloat(oilAdjustDelta) || 0;
    if (delta <= 0) return;

    // Find oil ingredient
    const oil = ingredients.find(
      (i) => i.name === 'ഓയിൽ' || i.name.toLowerCase().includes('oil')
    );
    if (!oil) {
      alert('ഓയിൽ ചേരുവ കണ്ടെത്താനായില്ല');
      return;
    }

    try {
      const signedDelta = oilAdjustIsAdd ? delta : -delta;
      await adjustIngredientStock(oil.id, signedDelta, oilAdjustReason, 'Admin');
      setIsAdjustOilModalOpen(false);
      await loadGeneralData();
      await loadDateSpecificData(selectedDate);
      onRefresh();
      alert('ഓയിൽ സ്റ്റോക്ക് വിജയകരമായി ക്രമീകരിച്ചു!');
    } catch (err: any) {
      alert(`ഓയിൽ സ്റ്റോക്ക് ക്രമീകരണത്തിൽ പിഴവ്: ${err?.message || 'Error'}`);
    }
  };

  // Find oil ingredient for live info
  const oilIngredient = useMemo(() => {
    return ingredients.find(
      (i) => i.name === 'ഓയിൽ' || i.name.toLowerCase().includes('oil')
    );
  }, [ingredients]);

  return (
    <div className="space-y-6 pb-20">
      {/* Date Controls */}
      <div className="flex items-center justify-end pb-1 border-b border-stone-200 dark:border-[#2E2828]">


        {/* Date Selector & Refresh */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-stone-50 dark:bg-[#141212] border border-stone-200 dark:border-[#282323] text-xs">
            <FiCalendar className="w-4 h-4 text-stone-400" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-transparent text-stone-800 dark:text-stone-200 font-bold outline-none cursor-pointer"
            />
          </div>

          <button
            onClick={() => {
              loadDateSpecificData(selectedDate);
              loadGeneralData();
              onRefresh();
            }}
            className="p-2 rounded-xl bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 text-stone-700 dark:text-stone-300 press-apple transition-colors"
            title="റീഫ്രഷ് ചെയ്യുക"
          >
            <FiRefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Navigation Subtabs */}
      <div className="flex items-center gap-1 p-1 bg-stone-100 dark:bg-[#141212] rounded-2xl border border-stone-200 dark:border-[#282323] max-w-2xl">
        <button
          onClick={() => setSubTab('closing')}
          className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold font-malayalam transition-all flex items-center justify-center gap-1.5 ${
            subTab === 'closing'
              ? 'bg-white dark:bg-[#252020] text-stone-900 dark:text-white shadow-sm'
              : 'text-stone-500 hover:text-stone-800 dark:text-stone-400'
          }`}
        >
          <FiDollarSign className="w-3.5 h-3.5 text-red-500" />
          <span>ദിവസ ക്ലോസിംഗ്</span>
        </button>

        <button
          onClick={() => setSubTab('final_costing')}
          className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold font-malayalam transition-all flex items-center justify-center gap-1.5 ${
            subTab === 'final_costing'
              ? 'bg-white dark:bg-[#252020] text-stone-900 dark:text-white shadow-sm'
              : 'text-stone-500 hover:text-stone-800 dark:text-stone-400'
          }`}
        >
          <FiPieChart className="w-3.5 h-3.5 text-emerald-500" />
          <span>ഉൽപ്പന്ന ചിലവ്</span>
        </button>

        <button
          onClick={() => setSubTab('oil_tracker')}
          className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold font-malayalam transition-all flex items-center justify-center gap-1.5 ${
            subTab === 'oil_tracker'
              ? 'bg-white dark:bg-[#252020] text-stone-900 dark:text-white shadow-sm'
              : 'text-stone-500 hover:text-stone-800 dark:text-stone-400'
          }`}
        >
          <FiDroplet className="w-3.5 h-3.5 text-amber-500" />
          <span>ഓയിൽ കണക്ക്</span>
        </button>

        <button
          onClick={() => setSubTab('packaging')}
          className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold font-malayalam transition-all flex items-center justify-center gap-1.5 ${
            subTab === 'packaging'
              ? 'bg-white dark:bg-[#252020] text-stone-900 dark:text-white shadow-sm'
              : 'text-stone-500 hover:text-stone-800 dark:text-stone-400'
          }`}
        >
          <FiPackage className="w-3.5 h-3.5 text-indigo-500" />
          <span>പാക്കിംഗ്</span>
        </button>
      </div>

      {isLoadingDateData ? (
        <div className="py-20 flex flex-col items-center justify-center">
          <LoadingSpinner size="lg" label="വിവരങ്ങൾ ശേഖരിക്കുന്നു..." />
        </div>
      ) : (
        <>
          {/* ================================================================= */}
          {/* SUBTAB 1: DAILY CLOSING & SHARED EXPENSES                         */}
          {/* ================================================================= */}
          {subTab === 'closing' && (
            <div className="space-y-6">
              {/* Cost Allocation Table (Weight Pro-Rata) */}
              <div className="p-5 rounded-3xl bg-white dark:bg-[#1E1B1B] border border-stone-200 dark:border-[#2E2828] shadow-apple-card space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-bold text-stone-900 dark:text-white font-malayalam flex items-center gap-2">
                      <FiLayers className="w-4 h-4 text-red-500" />
                      <span>തൂക്ക അനുപാത ചിലവ് വിഭജനം (Automatic Cost Allocation)</span>
                    </h2>
                    <p className="text-xs text-stone-400 font-malayalam mt-0.5">
                      ഉൽപ്പാദിപ്പിച്ച ഓരോ ഉൽപ്പന്നത്തിനും തൂക്കത്തിന് ആനുപാതികമായി ഓയിലും വേതനവും വിഭജിക്കുന്നു
                    </p>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Button to add daily production wages */}
                    <button
                      onClick={() => setIsWagesModalOpen(true)}
                      className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 text-xs font-bold font-malayalam transition-all press-apple cursor-pointer"
                      title="ദിവസേനയുള്ള പ്രൊഡക്ഷൻ വേതനം ചേർക്കുക"
                    >
                      <FiDollarSign className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                      <span>ദിവസേനയുള്ള പ്രൊഡക്ഷൻ വേതനം (Wages)</span>
                      {parseFloat(productionWages) > 0 && (
                        <span className="font-mono font-bold text-emerald-800 dark:text-emerald-200 ml-1">
                          (₹{parseFloat(productionWages).toLocaleString('en-IN')})
                        </span>
                      )}
                    </button>
                  </div>
                </div>

                {liveAllocations.length === 0 ? (
                  <div className="py-12 text-center text-xs text-stone-400 font-malayalam">
                    ഈ തീയതിയിൽ ഉൽപ്പാദന ബാച്ചുകൾ ഒന്നും രേഖപ്പെടുത്തിയിട്ടില്ല ({selectedDate})
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-2xl border border-stone-200 dark:border-[#282323]">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-stone-50 dark:bg-[#141212] border-b border-stone-200 dark:border-[#282323] text-stone-500 dark:text-stone-400 font-malayalam">
                          <th className="py-3 px-3.5 font-bold">ഉൽപ്പന്നം (Product)</th>
                          <th className="py-3 px-3.5 font-bold text-right">ഉൽപ്പാദനം (kg)</th>
                          <th className="py-3 px-3.5 font-bold text-right">അനുപാതം (Share)</th>
                          <th className="py-3 px-3.5 font-bold text-right">ചേരുവ ചിലവ്</th>
                          <th className="py-3 px-3.5 font-bold text-right text-amber-600 dark:text-amber-400">വിഭജിച്ച ഓയിൽ ചിലവ്</th>
                          <th className="py-3 px-3.5 font-bold text-right text-emerald-600 dark:text-emerald-400">വിഭജിച്ച വേതനം</th>
                          <th className="py-3 px-3.5 font-bold text-right text-stone-900 dark:text-white">ആകെ പ്രൊഡക്ഷൻ ചിലവ്</th>
                          <th className="py-3 px-3.5 font-bold text-right">ഒരു kg ചിലവ്</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-100 dark:divide-[#282323]">
                        {liveAllocations.map((a) => {
                          const sharePct = totalDayProductionKg > 0 ? (a.totalProductionKg / totalDayProductionKg) * 100 : 0;
                          return (
                            <tr key={a.productId} className="hover:bg-stone-50/50 dark:hover:bg-[#1A1717] transition-colors">
                              <td className="py-3 px-3.5 font-bold text-stone-900 dark:text-white font-malayalam">
                                {a.productName}
                                <span className="text-[10px] text-stone-400 block font-sans">
                                  {a.batchCount} ബാച്ചുകൾ
                                </span>
                              </td>
                              <td className="py-3 px-3.5 text-right font-mono font-bold text-stone-800 dark:text-stone-200">
                                {a.totalProductionKg} kg
                              </td>
                              <td className="py-3 px-3.5 text-right font-mono text-stone-500">
                                {sharePct.toFixed(1)}%
                              </td>
                              <td className="py-3 px-3.5 text-right font-mono">
                                ₹{a.ingredientCost.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                              </td>
                              <td className="py-3 px-3.5 text-right font-mono font-bold text-amber-600 dark:text-amber-400">
                                ₹{a.allocatedOilCost.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                              </td>
                              <td className="py-3 px-3.5 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                                ₹{a.allocatedProductionWages.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                              </td>
                              <td className="py-3 px-3.5 text-right font-mono font-black text-stone-900 dark:text-white">
                                ₹{a.totalProductionCost.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                              </td>
                              <td className="py-3 px-3.5 text-right font-mono font-black text-indigo-600 dark:text-indigo-400">
                                ₹{a.productionCostPerKg.toFixed(2)}/kg
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="bg-stone-100/70 dark:bg-[#141212] font-bold border-t-2 border-stone-300 dark:border-[#3A3333]">
                          <td className="py-3 px-3.5 font-malayalam">ആകെ (Total)</td>
                          <td className="py-3 px-3.5 text-right font-mono">{totalDayProductionKg} kg</td>
                          <td className="py-3 px-3.5 text-right font-mono">100%</td>
                          <td className="py-3 px-3.5 text-right font-mono">
                            ₹{totalDayIngredientCost.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="py-3 px-3.5 text-right font-mono text-amber-600 dark:text-amber-400">
                            ₹{liveOilCalculations.oilTotalExpense.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="py-3 px-3.5 text-right font-mono text-emerald-600 dark:text-emerald-400">
                            ₹{(parseFloat(productionWages) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="py-3 px-3.5 text-right font-mono text-stone-900 dark:text-white">
                            ₹{totalAllocatedCost.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="py-3 px-3.5 text-right font-mono text-indigo-600 dark:text-indigo-400">
                            {totalDayProductionKg > 0 ? `₹${(totalAllocatedCost / totalDayProductionKg).toFixed(2)}/kg` : '—'}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}

                {/* Save Daily Closing Button */}
                <div className="flex items-center justify-end pt-3">
                  <button
                    onClick={handleSaveClosing}
                    disabled={isSavingClosing}
                    className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs font-malayalam press-apple transition-all shadow-md disabled:opacity-50"
                  >
                    <FiSave className="w-4 h-4" />
                    <span>
                      {isSavingClosing
                        ? 'സേവ് ചെയ്യുന്നു...'
                        : existingClosing
                        ? 'ദിവസേനയുള്ള ക്ലോസിംഗ് അപ്ഡേറ്റ് ചെയ്യുക'
                        : 'ദിവസേനയുള്ള ക്ലോസിംഗ് പൂർത്തിയാക്കി സേവ് ചെയ്യുക'}
                    </span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ================================================================= */}
          {/* SUBTAB 2: FINAL PRODUCT COSTING & PACKING                         */}
          {/* ================================================================= */}
          {subTab === 'final_costing' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-stone-900 dark:text-white font-malayalam">
                    ഫൈനൽ പ്രൊഡക്റ്റ് കോസ്റ്റിംഗ് (Final Product Costing)
                  </h2>
                  <p className="text-xs text-stone-400 font-malayalam mt-0.5">
                    ചേരുവകൾ + ഓയിൽ + പ്രൊഡക്ഷൻ വേതനം + പാക്കേജിംഗ് കവർ + പാക്കിംഗ് കൂലി
                  </p>
                </div>

                <button
                  onClick={() => setIsRecordPackingModalOpen(true)}
                  className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold font-malayalam press-apple transition-colors"
                >
                  <FiPackage className="w-4 h-4" />
                  <span>പാക്കിംഗ് രേഖപ്പെടുത്തുക</span>
                </button>
              </div>

              {finalCostingsForDate.length === 0 ? (
                <div className="py-16 text-center text-xs text-stone-400 font-malayalam p-8 rounded-3xl bg-white dark:bg-[#1E1B1B] border border-stone-200 dark:border-[#2E2828]">
                  ഈ തീയതിയിലെ ഉൽപ്പന്ന കോസ്റ്റിംഗ് വിവരങ്ങൾ ലഭ്യമല്ല. ദയവായി &apos;ദിവസേനയുള്ള ക്ലോസിംഗ്&apos; പൂർത്തിയാക്കുക.
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-5">
                  {finalCostingsForDate.map((costing) => (
                    <div
                      key={costing.productId}
                      className="p-5 rounded-3xl bg-white dark:bg-[#1E1B1B] border border-stone-200 dark:border-[#2E2828] shadow-apple-card space-y-4"
                    >
                      {/* Product Header Strip */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-stone-100 dark:border-[#282323] gap-2">
                        <div>
                          <h3 className="text-lg font-black text-stone-900 dark:text-white font-malayalam">
                            {costing.productName}
                          </h3>
                          <span className="text-xs text-stone-400 font-malayalam">
                            ഉൽപ്പാദനം: {costing.totalProductionKg} kg • {costing.batchCount} ബാച്ചുകൾ
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <div className="text-right">
                            <span className="text-[10px] text-stone-400 font-malayalam block">ബൾക്ക് പ്രൊഡക്ഷൻ നിരക്ക്</span>
                            <span className="text-base font-extrabold text-indigo-600 dark:text-indigo-400 font-mono">
                              ₹{costing.productionCostPerKg.toFixed(2)} / kg
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* 2-Column Breakdown: Production vs Packing */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* 1. Production Cost Components */}
                        <div className="p-4 rounded-2xl bg-stone-50 dark:bg-[#141212] border border-stone-200 dark:border-[#282323] space-y-2.5 text-xs">
                          <p className="font-bold text-stone-900 dark:text-white font-malayalam border-b border-stone-200/60 dark:border-[#282323] pb-1.5 flex items-center justify-between">
                            <span>പ്രൊഡക്ഷൻ ചിലവ് (Bulk Production)</span>
                            <span className="font-mono text-stone-700 dark:text-stone-300">
                              ₹{costing.totalProductionCost.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </span>
                          </p>

                          <div className="flex justify-between">
                            <span className="text-stone-500 font-malayalam">ചേരുവ ചിലവ്:</span>
                            <span className="font-mono font-bold">₹{costing.totalIngredientCost.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-stone-500 font-malayalam">വിഭജിച്ച ഓയിൽ ചിലവ്:</span>
                            <span className="font-mono font-bold text-amber-600 dark:text-amber-400">
                              ₹{costing.allocatedOilCost.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-stone-500 font-malayalam">വിഭജിച്ച പ്രൊഡക്ഷൻ വേതനം:</span>
                            <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                              ₹{costing.allocatedProductionWages.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </span>
                          </div>

                          {/* Unpacked bulk finished stock valuation */}
                          <div className="pt-2 border-t border-stone-200/60 dark:border-[#282323] flex justify-between bg-amber-500/5 p-2 rounded-xl">
                            <span className="text-amber-800 dark:text-amber-300 font-malayalam font-bold">
                              പാക്ക് ചെയ്യാത്ത സ്റ്റോക്ക്:
                            </span>
                            <span className="font-mono font-bold text-amber-700 dark:text-amber-400">
                              {costing.unpackedKg} kg (മൂല്യം: ₹{costing.unpackedValuation.toLocaleString('en-IN', { minimumFractionDigits: 2 })})
                            </span>
                          </div>
                        </div>

                        {/* 2. Packing Cost Components */}
                        <div className="p-4 rounded-2xl bg-stone-50 dark:bg-[#141212] border border-stone-200 dark:border-[#282323] space-y-2.5 text-xs">
                          <p className="font-bold text-stone-900 dark:text-white font-malayalam border-b border-stone-200/60 dark:border-[#282323] pb-1.5 flex items-center justify-between">
                            <span>പാക്കിംഗ് ചിലവ് (Packing Activity)</span>
                            <span className="font-mono text-stone-700 dark:text-stone-300">
                              ₹{costing.totalPackingCost.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </span>
                          </p>

                          <div className="flex justify-between">
                            <span className="text-stone-500 font-malayalam">ആകെ പാക്കറ്റുകൾ:</span>
                            <span className="font-mono font-bold">{costing.totalPacketsPacked} പാക്കറ്റുകൾ ({costing.totalWeightPackedKg} kg)</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-stone-500 font-malayalam">പാക്കേജിംഗ് കവർ ചിലവ്:</span>
                            <span className="font-mono font-bold text-stone-900 dark:text-white">
                              ₹{costing.totalPackagingCost.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-stone-500 font-malayalam">പാക്കിംഗ് കൂലി:</span>
                            <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">
                              ₹{costing.totalPackingLabourCost.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </span>
                          </div>

                          <div className="pt-2 border-t border-stone-200/60 dark:border-[#282323] flex justify-between font-extrabold text-stone-900 dark:text-white">
                            <span className="font-malayalam">ആകെ ചിലവ് (Total Product Cost):</span>
                            <span className="font-mono text-sm text-red-600 dark:text-amber-400">
                              ₹{costing.totalCost.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Packet Sizes Costing Strip */}
                      {costing.packetsBySize.length > 0 && (
                        <div className="pt-2">
                          <p className="text-[11px] font-bold text-stone-500 dark:text-stone-400 font-malayalam mb-2">
                            പാക്കറ്റ് സൈസ് തിരിച്ചുള്ള ചിലവ് (Cost per Packet):
                          </p>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                            {costing.packetsBySize.map((ps) => (
                              <div
                                key={ps.size}
                                className="p-3 rounded-2xl bg-stone-100/70 dark:bg-[#1A1717] border border-stone-200 dark:border-[#282323] text-xs space-y-1"
                              >
                                <div className="flex justify-between font-bold">
                                  <span className="text-stone-700 dark:text-stone-300">{ps.size}</span>
                                  <span className="font-mono text-stone-500">{ps.packets} pcs</span>
                                </div>
                                <div className="pt-1 border-t border-stone-200/60 dark:border-[#282323] flex justify-between items-baseline">
                                  <span className="text-[10px] text-stone-400 font-malayalam">പാക്കറ്റ് ചിലവ്:</span>
                                  <span className="font-mono font-black text-sm text-emerald-600 dark:text-emerald-400">
                                    ₹{ps.costPerPacket.toFixed(2)}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ================================================================= */}
          {/* SUBTAB 3: CONTINUOUS OIL INVENTORY TRACKER                        */}
          {/* ================================================================= */}
          {subTab === 'oil_tracker' && (
            <div className="space-y-6">
              {/* Oil KPI Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-5 rounded-3xl bg-white dark:bg-[#1E1B1B] border border-stone-200 dark:border-[#2E2828] shadow-apple-card space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-stone-400 font-malayalam">നിലവിലെ ഫാക്ടറി ഓയിൽ സ്റ്റോക്ക്</span>
                    <FiDroplet className="w-5 h-5 text-amber-500" />
                  </div>
                  <p className="text-2xl font-black text-stone-900 dark:text-white font-mono">
                    <AnimatedNumber value={oilIngredient ? Number(oilIngredient.currentStock) : 0} decimals={2} />{' '}
                    <span className="text-xs text-stone-400 font-sans">kg</span>
                  </p>
                  <p className="text-[11px] text-emerald-500 font-malayalam">തുടർച്ചയായ സ്റ്റോക്ക് ബാലൻസ് (Continuous Balance)</p>
                </div>

                <div className="p-5 rounded-3xl bg-white dark:bg-[#1E1B1B] border border-stone-200 dark:border-[#2E2828] shadow-apple-card space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-stone-400 font-malayalam">ശരാശരി വാങ്ങൽ നിരക്ക് (Cost / kg)</span>
                    <FiDollarSign className="w-5 h-5 text-emerald-500" />
                  </div>
                  <p className="text-2xl font-black text-stone-900 dark:text-white font-mono">
                    ₹{oilIngredient ? Number(oilIngredient.avgCostPerUnit).toFixed(2) : '150.00'}{' '}
                    <span className="text-xs text-stone-400 font-sans">/ kg</span>
                  </p>
                  <p className="text-[11px] text-stone-400 font-malayalam">Weighted average purchase rate</p>
                </div>

                <div className="p-5 rounded-3xl bg-white dark:bg-[#1E1B1B] border border-stone-200 dark:border-[#2E2828] shadow-apple-card flex flex-col justify-between">
                  <div>
                    <span className="text-xs text-stone-400 font-malayalam block mb-1">മാനുവൽ സ്റ്റോക്ക് ക്രമീകരണം</span>
                    <p className="text-xs text-stone-500 font-malayalam">
                      വാങ്ങൽ, പാഴാകൽ അല്ലെങ്കിൽ ഓഡിറ്റ് തിരുത്തലുകൾ
                    </p>
                  </div>
                  <button
                    onClick={() => setIsAdjustOilModalOpen(true)}
                    className="w-full py-2.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-400 font-bold text-xs font-malayalam border border-amber-500/30 press-apple transition-colors"
                  >
                    സ്റ്റോക്ക് മാറ്റുക / രേഖപ്പെടുത്തുക
                  </button>
                </div>
              </div>

              {/* Oil History Table */}
              <div className="p-5 rounded-3xl bg-white dark:bg-[#1E1B1B] border border-stone-200 dark:border-[#2E2828] shadow-apple-card space-y-4">
                <h3 className="text-base font-bold text-stone-900 dark:text-white font-malayalam">
                  ദിവസേനയുള്ള ഓയിൽ ഉപഭോഗ ചരിത്രം (Continuous Oil Ledger)
                </h3>

                {dailyClosingsHistory.length === 0 ? (
                  <div className="py-12 text-center text-xs text-stone-400 font-malayalam">
                    ഓയിൽ ക്ലോസിംഗ് ചരിത്രം ലഭ്യമല്ല
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-2xl border border-stone-200 dark:border-[#282323]">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-stone-50 dark:bg-[#141212] border-b border-stone-200 dark:border-[#282323] text-stone-500 font-malayalam">
                          <th className="py-3 px-3.5 font-bold">തീയതി (Date)</th>
                          <th className="py-3 px-3.5 font-bold text-right">ഓപ്പണിംഗ് (kg)</th>
                          <th className="py-3 px-3.5 font-bold text-right">വാങ്ങിയത് (kg)</th>
                          <th className="py-3 px-3.5 font-bold text-right">ക്ലോസിംഗ് (kg)</th>
                          <th className="py-3 px-3.5 font-bold text-right text-amber-600 dark:text-amber-400">ഉപഭോഗം/നഷ്ടം</th>
                          <th className="py-3 px-3.5 font-bold text-right">നിരക്ക് (₹/kg)</th>
                          <th className="py-3 px-3.5 font-bold text-right">ആകെ ചിലവ്</th>
                          <th className="py-3 px-3.5 font-bold text-right">ഓപ്പറേറ്റർ</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-100 dark:divide-[#282323]">
                        {dailyClosingsHistory.map((c) => (
                          <tr key={c.id} className="hover:bg-stone-50/50 dark:hover:bg-[#1A1717] transition-colors">
                            <td className="py-3 px-3.5 font-mono font-bold text-stone-900 dark:text-white">
                              {c.productionDate}
                            </td>
                            <td className="py-3 px-3.5 text-right font-mono">{c.oilOpeningBalance} kg</td>
                            <td className="py-3 px-3.5 text-right font-mono text-emerald-600">+{c.oilPurchases} kg</td>
                            <td className="py-3 px-3.5 text-right font-mono font-bold">{c.oilClosingBalance} kg</td>
                            <td className="py-3 px-3.5 text-right font-mono font-bold text-amber-600 dark:text-amber-400">
                              {c.oilConsumed} kg
                            </td>
                            <td className="py-3 px-3.5 text-right font-mono">₹{c.oilCostPerKg}</td>
                            <td className="py-3 px-3.5 text-right font-mono font-black text-stone-900 dark:text-white">
                              ₹{c.oilTotalExpense.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </td>
                            <td className="py-3 px-3.5 text-right text-stone-400 font-malayalam">{c.closedBy}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ================================================================= */}
          {/* SUBTAB 4: PACKAGING COVERS & PACKING RECORDS                      */}
          {/* ================================================================= */}
          {subTab === 'packaging' && (
            <div className="space-y-6">
              {/* Packaging Covers Inventory Card */}
              <div className="p-5 rounded-3xl bg-white dark:bg-[#1E1B1B] border border-stone-200 dark:border-[#2E2828] shadow-apple-card space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-bold text-stone-900 dark:text-white font-malayalam">
                      പാക്കേജിംഗ് കവറുകൾ (Packaging Covers by Size)
                    </h3>
                    <p className="text-xs text-stone-400 font-malayalam mt-0.5">
                      ഓരോ ഉൽപ്പന്നത്തിനും കവർ സൈസ് അനുസരിച്ചുള്ള സ്റ്റോക്കും വാങ്ങൽ നിരക്കും
                    </p>
                  </div>

                  <button
                    onClick={() => setIsAddCoverModalOpen(true)}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold font-malayalam press-apple transition-colors"
                  >
                    <FiPlus className="w-4 h-4" />
                    <span>കവർ സൈസ് ചേർക്കുക</span>
                  </button>
                </div>

                {packagingItems.length === 0 ? (
                  <div className="py-12 text-center text-xs text-stone-400 font-malayalam">
                    പാക്കേജിംഗ് കവർ വിവരങ്ങൾ ചേർത്തിട്ടില്ല. &apos;കവർ സൈസ് ചേർക്കുക&apos; ക്ലിക്ക് ചെയ്യുക.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                    {packagingItems.map((item) => (
                      <div
                        key={item.id}
                        className="p-4 rounded-2xl bg-stone-50 dark:bg-[#141212] border border-stone-200 dark:border-[#282323] space-y-2 text-xs"
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <span className="font-black text-stone-900 dark:text-white font-malayalam text-sm">
                              {item.productName}
                            </span>
                            <span className="px-2 py-0.5 ml-2 rounded-full font-mono text-[10px] font-bold bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800">
                              {item.sizeLabel}
                            </span>
                          </div>

                          <button
                            onClick={async () => {
                              if (confirm(`ഈ കവർ സൈസ് നീക്കം ചെയ്യണോ?`)) {
                                await deletePackagingItem(item.id);
                                loadGeneralData();
                              }
                            }}
                            className="text-stone-400 hover:text-red-500"
                          >
                            ×
                          </button>
                        </div>

                        <div className="pt-2 border-t border-stone-200/60 dark:border-[#282323] space-y-1">
                          <div className="flex justify-between">
                            <span className="text-stone-400 font-malayalam">ലഭ്യമായ സ്റ്റോക്ക്:</span>
                            <span className="font-mono font-bold text-stone-900 dark:text-white">
                              {item.currentStock} കവറുകൾ
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-stone-400 font-malayalam">ഒരു കവർ വില:</span>
                            <span className="font-mono font-bold">₹{item.unitCost.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-stone-400 font-malayalam">പാക്കിംഗ് കൂലി നിരക്ക്:</span>
                            <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">
                              ₹{item.packingLabourRate.toFixed(2)} / packet
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Packing History Card */}
              <div className="p-5 rounded-3xl bg-white dark:bg-[#1E1B1B] border border-stone-200 dark:border-[#2E2828] shadow-apple-card space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-bold text-stone-900 dark:text-white font-malayalam">
                      പാക്കിംഗ് ലോഗ് (Recent Packing Activities)
                    </h3>
                    <p className="text-xs text-stone-400 font-malayalam mt-0.5">
                      പാക്കറ്റുകളുടെ എണ്ണം, കവർ ഉപയോഗം & പാക്കിംഗ് കൂലി
                    </p>
                  </div>

                  <button
                    onClick={() => setIsRecordPackingModalOpen(true)}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold font-malayalam press-apple transition-colors"
                  >
                    <FiPackage className="w-4 h-4" />
                    <span>പാക്കിംഗ് രേഖപ്പെടുത്തുക</span>
                  </button>
                </div>

                {packingRecords.length === 0 ? (
                  <div className="py-12 text-center text-xs text-stone-400 font-malayalam">
                    പാക്കിംഗ് രേഖകൾ ഒന്നും കണ്ടെത്തിയില്ല
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-2xl border border-stone-200 dark:border-[#282323]">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-stone-50 dark:bg-[#141212] border-b border-stone-200 dark:border-[#282323] text-stone-500 font-malayalam">
                          <th className="py-3 px-3.5 font-bold">തീയതി</th>
                          <th className="py-3 px-3.5 font-bold">ഉൽപ്പന്നം</th>
                          <th className="py-3 px-3.5 font-bold">സൈസ്</th>
                          <th className="py-3 px-3.5 font-bold text-right">പാക്കറ്റുകൾ</th>
                          <th className="py-3 px-3.5 font-bold text-right">തൂക്കം</th>
                          <th className="py-3 px-3.5 font-bold text-right">കവർ ചിലവ്</th>
                          <th className="py-3 px-3.5 font-bold text-right">പാക്കിംഗ് കൂലി</th>
                          <th className="py-3 px-3.5 font-bold text-right">ആകെ പാക്കിംഗ് ചിലവ്</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-100 dark:divide-[#282323]">
                        {packingRecords.map((pr) => (
                          <tr key={pr.id} className="hover:bg-stone-50/50 dark:hover:bg-[#1A1717] transition-colors">
                            <td className="py-3 px-3.5 font-mono text-stone-500">{pr.packingDate}</td>
                            <td className="py-3 px-3.5 font-bold text-stone-900 dark:text-white font-malayalam">
                              {pr.productName}
                            </td>
                            <td className="py-3 px-3.5 font-mono">{pr.packetSize}</td>
                            <td className="py-3 px-3.5 text-right font-mono font-bold">{pr.packetsPacked} pcs</td>
                            <td className="py-3 px-3.5 text-right font-mono">{pr.weightPackedKg} kg</td>
                            <td className="py-3 px-3.5 text-right font-mono">₹{pr.packagingCost.toFixed(2)}</td>
                            <td className="py-3 px-3.5 text-right font-mono text-indigo-600 dark:text-indigo-400">
                              ₹{pr.packingLabourCost.toFixed(2)}
                            </td>
                            <td className="py-3 px-3.5 text-right font-mono font-black text-stone-900 dark:text-white">
                              ₹{pr.totalPackingCost.toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* ===================================================================== */}
      {/* MODALS                                                                */}
      {/* ===================================================================== */}

      {/* 1. Add Packaging Cover Modal */}
      {isAddCoverModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md bg-white dark:bg-[#1E1B1B] rounded-3xl p-6 border border-stone-200 dark:border-[#2E2828] shadow-apple-modal space-y-4">
            <h2 className="text-base font-bold text-stone-900 dark:text-white font-malayalam">
              പുതിയ പാക്കേജിംഗ് കവർ ചേർക്കുക
            </h2>

            <form onSubmit={handleCreatePackagingCover} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-stone-700 dark:text-stone-300 font-malayalam mb-1">
                  ഉൽപ്പന്നം *
                </label>
                <select
                  value={newCoverProductId}
                  onChange={(e) => setNewCoverProductId(e.target.value)}
                  className="w-full p-2.5 rounded-xl bg-stone-50 dark:bg-[#141212] border border-stone-200 dark:border-[#282323] text-stone-900 dark:text-white font-malayalam outline-none"
                  required
                >
                  <option value="">ഉൽപ്പന്നം തിരഞ്ഞെടുക്കുക...</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-stone-700 dark:text-stone-300 font-malayalam mb-1">
                    സൈസ് ലേബൽ *
                  </label>
                  <input
                    type="text"
                    value={newCoverSizeLabel}
                    onChange={(e) => setNewCoverSizeLabel(e.target.value)}
                    placeholder="e.g. 100g, 250g"
                    className="w-full p-2.5 rounded-xl bg-stone-50 dark:bg-[#141212] border border-stone-200 dark:border-[#282323] text-stone-900 dark:text-white outline-none font-bold"
                    required
                  />
                </div>

                <div>
                  <label className="block font-bold text-stone-700 dark:text-stone-300 font-malayalam mb-1">
                    തൂക്കം (grams) *
                  </label>
                  <input
                    type="number"
                    value={newCoverGrams}
                    onChange={(e) => setNewCoverGrams(e.target.value)}
                    className="w-full p-2.5 rounded-xl bg-stone-50 dark:bg-[#141212] border border-stone-200 dark:border-[#282323] text-stone-900 dark:text-white outline-none font-mono font-bold"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2.5">
                <div>
                  <label className="block font-bold text-stone-700 dark:text-stone-300 font-malayalam mb-1">
                    സ്റ്റോക്ക് (pcs)
                  </label>
                  <input
                    type="number"
                    value={newCoverStock}
                    onChange={(e) => setNewCoverStock(e.target.value)}
                    className="w-full p-2 rounded-xl bg-stone-50 dark:bg-[#141212] border border-stone-200 dark:border-[#282323] font-mono outline-none"
                  />
                </div>

                <div>
                  <label className="block font-bold text-stone-700 dark:text-stone-300 font-malayalam mb-1">
                    കവർ വില (₹)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={newCoverUnitCost}
                    onChange={(e) => setNewCoverUnitCost(e.target.value)}
                    className="w-full p-2 rounded-xl bg-stone-50 dark:bg-[#141212] border border-stone-200 dark:border-[#282323] font-mono outline-none"
                  />
                </div>

                <div>
                  <label className="block font-bold text-stone-700 dark:text-stone-300 font-malayalam mb-1">
                    കൂലി നിരക്ക് (₹)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={newCoverLabourRate}
                    onChange={(e) => setNewCoverLabourRate(e.target.value)}
                    className="w-full p-2 rounded-xl bg-stone-50 dark:bg-[#141212] border border-stone-200 dark:border-[#282323] font-mono outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setIsAddCoverModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-stone-500 font-malayalam"
                >
                  റദ്ദാക്കുക
                </button>
                <button
                  type="submit"
                  disabled={isSavingPackaging}
                  className="px-5 py-2.5 rounded-xl bg-red-600 text-white font-bold font-malayalam shadow-sm"
                >
                  {isSavingPackaging ? 'സേവ് ചെയ്യുന്നു...' : 'സേവ് ചെയ്യുക'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2. Record Packing Modal */}
      {isRecordPackingModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md bg-white dark:bg-[#1E1B1B] rounded-3xl p-6 border border-stone-200 dark:border-[#2E2828] shadow-apple-modal space-y-4">
            <h2 className="text-base font-bold text-stone-900 dark:text-white font-malayalam">
              പാക്കിംഗ് രേഖപ്പെടുത്തുക (Record Packing)
            </h2>

            <form onSubmit={handleRecordPackingSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-stone-700 dark:text-stone-300 font-malayalam mb-1">
                  ഉൽപ്പന്നം *
                </label>
                <select
                  value={packProductId}
                  onChange={(e) => {
                    setPackProductId(e.target.value);
                    const covers = packagingItems.filter((i) => i.productId === e.target.value);
                    if (covers.length > 0) {
                      setPackItemId(covers[0].id);
                      setPackSizeLabel(covers[0].sizeLabel);
                    }
                  }}
                  className="w-full p-2.5 rounded-xl bg-stone-50 dark:bg-[#141212] border border-stone-200 dark:border-[#282323] text-stone-900 dark:text-white font-malayalam outline-none"
                  required
                >
                  <option value="">ഉൽപ്പന്നം തിരഞ്ഞെടുക്കുക...</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-stone-700 dark:text-stone-300 font-malayalam mb-1">
                  പാക്കേജിംഗ് കവർ സൈസ് *
                </label>
                <select
                  value={packItemId}
                  onChange={(e) => {
                    setPackItemId(e.target.value);
                    const selected = packagingItems.find((i) => i.id === e.target.value);
                    if (selected) setPackSizeLabel(selected.sizeLabel);
                  }}
                  className="w-full p-2.5 rounded-xl bg-stone-50 dark:bg-[#141212] border border-stone-200 dark:border-[#282323] text-stone-900 dark:text-white font-mono outline-none"
                >
                  <option value="">സാധാരണ കവർ (Default)</option>
                  {packagingItems
                    .filter((i) => !packProductId || i.productId === packProductId)
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.sizeLabel} (സ്റ്റോക്ക്: {item.currentStock} pcs, കവർ: ₹{item.unitCost}, കൂലി: ₹
                        {item.packingLabourRate})
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-stone-700 dark:text-stone-300 font-malayalam mb-1">
                  പാക്ക് ചെയ്ത പാക്കറ്റുകളുടെ എണ്ണം *
                </label>
                <input
                  type="number"
                  value={packCount}
                  onChange={(e) => setPackCount(e.target.value)}
                  onFocus={(e) => e.target.select()}
                  className="w-full p-3 rounded-2xl bg-stone-50 dark:bg-[#141212] border border-stone-200 dark:border-[#282323] text-lg font-black font-mono text-indigo-600 outline-none"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-stone-700 dark:text-stone-300 font-malayalam mb-1">
                  കുറിപ്പ്
                </label>
                <input
                  type="text"
                  value={packNotes}
                  onChange={(e) => setPackNotes(e.target.value)}
                  placeholder="പാക്കിംഗ് ബാച്ച് വിവരങ്ങൾ..."
                  className="w-full p-2.5 rounded-xl bg-stone-50 dark:bg-[#141212] border border-stone-200 dark:border-[#282323] font-malayalam outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setIsRecordPackingModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-stone-500 font-malayalam"
                >
                  റദ്ദാക്കുക
                </button>
                <button
                  type="submit"
                  disabled={isSavingPacking}
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 text-white font-bold font-malayalam shadow-sm"
                >
                  {isSavingPacking ? 'രേഖപ്പെടുത്തുന്നു...' : 'പാക്കിംഗ് രേഖപ്പെടുത്തുക'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 3. Adjust Oil Stock Modal */}
      {isAdjustOilModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md bg-white dark:bg-[#1E1B1B] rounded-3xl p-6 border border-stone-200 dark:border-[#2E2828] shadow-apple-modal space-y-4">
            <h2 className="text-base font-bold text-stone-900 dark:text-white font-malayalam">
              ഓയിൽ സ്റ്റോക്ക് ക്രമീകരിക്കുക (Adjust Oil Stock)
            </h2>

            <form onSubmit={handleOilAdjustment} className="space-y-3 text-xs">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setOilAdjustIsAdd(true)}
                  className={`flex-1 py-2 rounded-xl font-bold font-malayalam border ${
                    oilAdjustIsAdd
                      ? 'bg-emerald-600 text-white border-emerald-600'
                      : 'bg-stone-50 dark:bg-[#141212] text-stone-600 border-stone-200 dark:border-[#282323]'
                  }`}
                >
                  + ഇൻവാർഡ് / വാങ്ങൽ (+ Inward)
                </button>
                <button
                  type="button"
                  onClick={() => setOilAdjustIsAdd(false)}
                  className={`flex-1 py-2 rounded-xl font-bold font-malayalam border ${
                    !oilAdjustIsAdd
                      ? 'bg-red-600 text-white border-red-600'
                      : 'bg-stone-50 dark:bg-[#141212] text-stone-600 border-stone-200 dark:border-[#282323]'
                  }`}
                >
                  - കുറവ് / പാഴാകൽ (- Outward)
                </button>
              </div>

              <div>
                <label className="block font-bold text-stone-700 dark:text-stone-300 font-malayalam mb-1">
                  അളവ് (kg) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={oilAdjustDelta}
                  onChange={(e) => setOilAdjustDelta(e.target.value)}
                  onFocus={(e) => e.target.select()}
                  className="w-full p-2.5 rounded-xl bg-stone-50 dark:bg-[#141212] border border-stone-200 dark:border-[#282323] font-mono text-base font-black outline-none"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-stone-700 dark:text-stone-300 font-malayalam mb-1">
                  കാരണം (Reason) *
                </label>
                <input
                  type="text"
                  value={oilAdjustReason}
                  onChange={(e) => setOilAdjustReason(e.target.value)}
                  className="w-full p-2.5 rounded-xl bg-stone-50 dark:bg-[#141212] border border-stone-200 dark:border-[#282323] font-malayalam outline-none"
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setIsAdjustOilModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-stone-500 font-malayalam"
                >
                  റദ്ദാക്കുക
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-amber-600 text-white font-bold font-malayalam shadow-sm"
                >
                  സ്റ്റോക്ക് അപ്ഡേറ്റ് ചെയ്യുക
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Daily Production Wages Modal */}
      {isWagesModalOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white dark:bg-[#1C1818] rounded-3xl p-6 max-w-md w-full border border-stone-200 dark:border-[#2E2828] shadow-2xl space-y-4 animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-2 border-b border-stone-200 dark:border-[#2E2828]">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                  <FiDollarSign className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-stone-900 dark:text-white font-malayalam">
                    ദിവസേനയുള്ള പ്രൊഡക്ഷൻ വേതനം (Wages)
                  </h3>
                  <p className="text-xs text-stone-400 font-mono">{selectedDate}</p>
                </div>
              </div>
              <button
                onClick={() => setIsWagesModalOpen(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-stone-400 hover:text-stone-700 dark:hover:text-white hover:bg-stone-100 dark:hover:bg-[#282323] cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-stone-700 dark:text-stone-300 font-malayalam block mb-1">
                  ആകെ ദിവസ വേതനം (Total Daily Wages) ₹ *
                </label>
                <input
                  type="number"
                  step="1"
                  value={productionWages}
                  onChange={(e) => setProductionWages(e.target.value)}
                  onFocus={(e) => e.target.select()}
                  className="w-full px-4 py-3 rounded-2xl bg-stone-50 dark:bg-[#141212] border border-stone-200 dark:border-[#282323] font-mono text-xl font-black text-emerald-600 dark:text-emerald-400 outline-none focus:border-emerald-500"
                  placeholder="e.g. 4000"
                  autoFocus
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-stone-500 dark:text-stone-400 font-malayalam block mb-1">
                  കുറിപ്പ് (Notes)
                </label>
                <input
                  type="text"
                  value={closingNotes}
                  onChange={(e) => setClosingNotes(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-stone-50 dark:bg-[#141212] border border-stone-200 dark:border-[#282323] text-xs font-malayalam text-stone-900 dark:text-white outline-none"
                  placeholder="വേതനം സംബന്ധിച്ച കുറിപ്പുകൾ..."
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-200 dark:border-[#2E2828]">
              <button
                type="button"
                onClick={() => setIsWagesModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-[#282323] transition-colors cursor-pointer"
              >
                റദ്ദാക്കുക
              </button>
              <button
                type="button"
                onClick={async () => {
                  await handleSaveClosing();
                  setIsWagesModalOpen(false);
                }}
                disabled={isSavingClosing}
                className="px-5 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white font-malayalam transition-all shadow-sm cursor-pointer disabled:opacity-50"
              >
                {isSavingClosing ? 'സേവ് ചെയ്യുന്നു...' : 'വേതനം സേവ് ചെയ്യുക'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
