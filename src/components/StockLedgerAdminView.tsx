import React, { useState, useMemo, useEffect } from 'react';
import { StockMovement, Ingredient, Product, ProductionRun } from '../types';
import { isEligibleProductionBatch, getEffectiveDailyWage, roundCurrency } from '../services/costing';
import {
  FiSearch,
  FiArrowDownRight,
  FiArrowUpRight,
  FiRefreshCw,
  FiLayers,
  FiPrinter,
  FiFilter,
  FiChevronLeft,
  FiChevronRight,
  FiChevronsLeft,
  FiChevronsRight,
  FiPackage,
  FiDollarSign,
  FiDroplet,
  FiBox,
  FiArrowUp,
  FiArrowDown,
  FiRotateCcw,
  FiX,
} from 'react-icons/fi';
import { PrintPurchaseListModal } from './PrintPurchaseListModal';
import { useLockBodyScroll } from '../hooks/useLockBodyScroll';

// Helper to format technical IDs / internal codes into clean, human-readable labels
export const formatHumanReference = (
  reference?: string,
  reason?: string,
  movementType?: string,
  category?: string
): string => {
  const ref = (reference || '').trim();
  const reasonText = (reason || '').trim();

  // 1. Wage references: WAGE-YYYY-MM-DD or wage-...
  if (/^wage[-_]/i.test(ref) || category === 'wages') {
    const dateMatch = ref.match(/\d{4}-\d{2}-\d{2}/);
    return dateMatch ? `കൂലി വിഹിതം (${dateMatch[0]})` : 'കൂലി വിഹിതം';
  }

  // 2. Admin adjustment codes: ADMIN-PRD-ADJ-123456, ADMIN-ADJ-123456
  if (/^admin[-_]prd[-_]adj/i.test(ref)) {
    return 'പ്രൊഡക്ഷൻ അഡ്ജസ്റ്റ്മെന്റ്';
  }
  if (/^admin[-_]adj/i.test(ref)) {
    return 'സ്റ്റോക്ക് അഡ്ജസ്റ്റ്മെന്റ്';
  }

  // 3. Cover / packaging codes: COVER-123456
  if (/^cover[-_]/i.test(ref) || category === 'packets') {
    return 'കവർ / പാക്കിംഗ് ഉപയോഗം';
  }

  // 4. Sales references: Sale #uuid, Sale Reversal #uuid
  if (/^sale reversal/i.test(ref)) {
    return 'വിൽപ്പന റദ്ദാക്കൽ';
  }
  if (/^sale\s*#/i.test(ref)) {
    return 'സ്നാക്ക് വിൽപ്പന';
  }

  // 5. Daily closing references: Daily Closing YYYY-MM-DD
  if (/^daily closing/i.test(ref)) {
    const dateMatch = ref.match(/\d{4}-\d{2}-\d{2}/);
    return dateMatch ? `ദിവസേനയുള്ള കണക്ക് (${dateMatch[0]})` : 'ദിവസേനയുള്ള കണക്ക്';
  }

  // 6. Packing references: Packing YYYY-MM-DD
  if (/^packing\b/i.test(ref)) {
    const dateMatch = ref.match(/\d{4}-\d{2}-\d{2}/);
    return dateMatch ? `പാക്കിംഗ് (${dateMatch[0]})` : 'പാക്കിംഗ് രേഖ';
  }

  // 7. Run delete / reversal references
  if (/^del run\s*(\S+)\s*reversal/i.test(ref)) {
    const m = ref.match(/^del run\s*(\S+)\s*reversal/i);
    return `ബാച്ച് ${m ? m[1] : ''} തിരിച്ചിടൽ`;
  }
  if (/^del run\s*(\S+)/i.test(ref)) {
    const m = ref.match(/^del run\s*(\S+)/i);
    return `ബാച്ച് ${m ? m[1] : ''} ഒഴിവാക്കൽ`;
  }
  if (/^reversal of\s*(\S+)/i.test(ref)) {
    const m = ref.match(/^reversal of\s*(\S+)/i);
    return `ബാച്ച് ${m ? m[1] : ''} തിരിച്ചിടൽ`;
  }
  if (/^run\s*(\S+)\s*edit/i.test(ref)) {
    const m = ref.match(/^run\s*(\S+)\s*edit/i);
    return `ബാച്ച് ${m ? m[1] : ''} മാറ്റം`;
  }
  if (/^run\s*(\S+)/i.test(ref)) {
    const m = ref.match(/^run\s*(\S+)/i);
    return `ബാച്ച് ${m ? m[1] : ''} ഉൽപ്പാദനം`;
  }

  // 8. UUID or contains UUID: Hide raw UUID and display clean label
  const isUuid = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(ref);
  if (isUuid) {
    if (movementType === 'production_consumption') return 'ബാച്ച് ചേരുവ ഉപയോഗം';
    if (movementType === 'production_output') return 'ബാച്ച് ഉൽപ്പാദനം';
    if (movementType === 'purchase') return 'പർച്ചേസ് എൻട്രി';
    if (movementType === 'adjust') return 'സ്റ്റോക്ക് ക്രമീകരണം';
    if (category === 'products') return 'ഉൽപ്പാദന ബാച്ച്';
    if (category === 'basic') return 'അടിസ്ഥാന ചേരുവ ഉപയോഗം';
    if (reasonText && !/[0-9a-f]{8}-[0-9a-f]{4}/i.test(reasonText)) {
      return reasonText;
    }
    return 'പ്രൊഡക്ഷൻ രേഖ';
  }

  return ref || 'സ്റ്റോക്ക് രേഖ';
};

// Clean UUIDs from reason string if present
export const cleanHumanReason = (reason?: string): string => {
  if (!reason) return '';
  return reason.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '').trim();
};

export type LedgerCategory = 'all' | 'basic' | 'packets' | 'wages' | 'ingredients' | 'products';
export type SortField = 'date' | 'name' | 'quantity' | 'type' | 'category';
export type SortOrder = 'asc' | 'desc';

export interface UnifiedLedgerEntry {
  id: string;
  itemId: string;
  itemType: 'raw' | 'finished' | 'ingredient' | 'product' | 'wage' | 'packaging';
  itemName: string;
  category: 'basic' | 'packets' | 'wages' | 'ingredients' | 'products';
  movementType: StockMovement['movementType'];
  quantity: number;
  unit: string;
  previousBalance: number;
  newBalance: number;
  costPerUnit?: number;
  reference: string;
  operatorName: string;
  reason?: string;
  createdAt: string;
}

interface StockLedgerAdminViewProps {
  movements: StockMovement[];
  ingredients?: Ingredient[];
  products?: Product[];
  wages?: any[];
  productionRuns?: ProductionRun[];
  onRefresh: () => void;
}

export const StockLedgerAdminView: React.FC<StockLedgerAdminViewProps> = ({
  movements,
  ingredients = [],
  products = [],
  wages = [],
  productionRuns = [],
  onRefresh,
}) => {
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'in' | 'out' | 'adjust'>('all');
  const [selectedCategory, setSelectedCategory] = useState<LedgerCategory>('all');
  const [selectedIngredient, setSelectedIngredient] = useState<string>('all');
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(25);
  const [purchaseListModalOpen, setPurchaseListModalOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useLockBodyScroll(purchaseListModalOpen);

  // Map ingredients by ID and name for quick lookups
  const ingredientMap = useMemo(() => {
    const map = new Map<string, Ingredient>();
    ingredients.forEach((ing) => {
      map.set(ing.id, ing);
      if (ing.name) map.set(ing.name.toLowerCase().trim(), ing);
    });
    return map;
  }, [ingredients]);

  // Function to classify any stock movement into its primary category
  const classifyItem = (
    m: StockMovement
  ): 'basic' | 'packets' | 'wages' | 'ingredients' | 'products' => {
    if (m.itemType === ('wage' as any)) return 'wages';

    const ing = ingredientMap.get(m.itemId) || ingredientMap.get((m.itemName || '').toLowerCase().trim());
    const nameLower = (m.itemName || '').toLowerCase();
    const unitLower = (m.unit || '').toLowerCase();
    const refLower = (m.reference || '').toLowerCase();
    const reasonLower = (m.reason || '').toLowerCase();

    // Black Salt must ALWAYS be classified under raw ingredients, NEVER basic!
    const isBlackSalt =
      nameLower.includes('black') ||
      nameLower.includes('കറുത്ത') ||
      nameLower.includes('ബ്ലാക്ക്');

    if (isBlackSalt) {
      return 'ingredients';
    }

    // 1. Packets & Packaging items
    if (
      m.itemType === ('packaging' as any) ||
      ['packs', 'packet', 'packets', 'covers', 'cover', 'rolls', 'roll', 'pieces', 'pcs'].includes(unitLower) ||
      nameLower.includes('cover') ||
      nameLower.includes('packet') ||
      nameLower.includes('pouch') ||
      nameLower.includes('കവർ') ||
      nameLower.includes('പാക്കറ്റ്') ||
      refLower.includes('packing') ||
      reasonLower.includes('packing')
    ) {
      return 'packets';
    }

    // 2. Basic Ingredients (Oil, Salt, Cashew Shell, Curry leaves, Chippli, Sugar, etc.)
    const isPowderedSugar = nameLower.includes('പൊടി') || nameLower.includes('powder') || nameLower.includes('icing');
    const isBasicName =
      !isBlackSalt && (
        nameLower.includes('വെളിച്ചെണ്ണ') ||
        nameLower.includes('oil') ||
        nameLower.includes('എണ്ണ') ||
        nameLower.includes('ഉപ്പ്') ||
        nameLower.includes('salt') ||
        nameLower.includes('കറിവേപ്പില') ||
        nameLower.includes('curry') ||
        nameLower.includes('കശുവണ്ടി') ||
        nameLower.includes('അണ്ടി തോട്') ||
        nameLower.includes('cashew') ||
        nameLower.includes('ചിപ്പിലി') ||
        nameLower.includes('ചിപ്പ്ളി') ||
        nameLower.includes('chippli') ||
        (!isPowderedSugar && (nameLower.includes('പഞ്ചസാര') || nameLower.includes('sugar')))
      );

    if (
      ing?.category === 'basic' ||
      isBasicName ||
      refLower.includes('closing') ||
      reasonLower.includes('closing') ||
      reasonLower.includes('basic')
    ) {
      return 'basic';
    }

    // 3. Finished Products
    if (m.itemType === 'finished' || m.itemType === 'product') {
      return 'products';
    }

    // 4. Raw Ingredients / Spices
    return 'ingredients';
  };

  // Build unified ledger list combining stock movements + daily wages
  const allEntries: UnifiedLedgerEntry[] = useMemo(() => {
    // 1. Process regular stock movements
    const list: UnifiedLedgerEntry[] = movements.map((m) => {
      const cat = classifyItem(m);
      return {
        ...m,
        category: cat,
      };
    });

    // 2. Synthesize wage entries from daily wages so they are part of the ledger
    if (Array.isArray(wages)) {
      wages.forEach((w) => {
        if (!w || !w.productionDate) return;
        const totalBudget = getEffectiveDailyWage(w);
        if (totalBudget <= 0) return;

        const dayEligibleRuns = (productionRuns || []).filter(
          (r) => r.productionDate === w.productionDate && isEligibleProductionBatch(r)
        );
        const liveKg = dayEligibleRuns.reduce((s, r) => s + (Number(r.actualQuantity) || 0), 0);
        const prodKg = liveKg > 0 ? liveKg : (Number(w.totalProductionKg) || 0);
        const wagePerKg = prodKg > 0 ? roundCurrency(totalBudget / prodKg) : 0;

        list.push({
          id: `wage-tot-${w.id || w.productionDate}`,
          itemId: `wage-tot-${w.productionDate}`,
          itemType: 'wage',
          itemName: 'ദിവസേനയുള്ള ആകെ കൂലി (Daily Total Wage)',
          category: 'wages',
          movementType: 'out',
          quantity: totalBudget,
          unit: '₹',
          previousBalance: 0,
          newBalance: totalBudget,
          costPerUnit: wagePerKg,
          reference: `WAGE-${w.productionDate}`,
          operatorName: prodKg > 0 ? `₹${wagePerKg.toFixed(2)} / kg (${dayEligibleRuns.length} ബാച്ചുകൾ)` : 'തൂക്കം അടിസ്ഥാനത്തിൽ (Weight-based)',
          reason: `${prodKg.toFixed(1)} kg ആകെ ഉൽപ്പാദനത്തിന് ആനുപാതികമായി വിഭജിച്ച കൂലി`,
          createdAt: `${w.productionDate}T18:00:00.000Z`,
        });
      });
    }

    return list;
  }, [movements, wages, productionRuns, ingredientMap]);

  // Unique list of ingredient & item names for the specific filter dropdown
  const uniqueItemNames = useMemo(() => {
    const set = new Set<string>();
    allEntries.forEach((e) => {
      if (e.itemName) set.add(e.itemName);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [allEntries]);

  // Category counts for quick filter tabs
  const categoryCounts = useMemo(() => {
    const counts = {
      all: allEntries.length,
      basic: 0,
      packets: 0,
      wages: 0,
      ingredients: 0,
      products: 0,
    };
    allEntries.forEach((e) => {
      if (counts[e.category] !== undefined) {
        counts[e.category]++;
      }
    });
    return counts;
  }, [allEntries]);

  // Filtered entries
  const filteredEntries = useMemo(() => {
    return allEntries.filter((m) => {
      // 1. Category filter
      if (selectedCategory !== 'all' && m.category !== selectedCategory) {
        return false;
      }

      // 2. Specific ingredient filter
      if (selectedIngredient !== 'all' && m.itemName !== selectedIngredient) {
        return false;
      }

      // 3. Movement direction / type filter
      if (filterType !== 'all') {
        const delta = Number(m.quantity) || 0;
        const isWage = m.category === 'wages';
        const isAdjustment =
          !isWage &&
          (m.movementType === 'adjustment' ||
            m.movementType === 'adjust' ||
            m.movementType === 'opening' ||
            m.movementType === 'cancellation_reversal');

        const isIn =
          !isWage &&
          !isAdjustment &&
          (m.movementType === 'in' ||
            m.movementType === 'purchase' ||
            m.movementType === 'purchase_inward' ||
            m.movementType === 'production_output' ||
            m.movementType === 'packing_reversal' ||
            m.movementType === 'sale_reversal' ||
            (delta > 0 && !m.movementType.includes('consumption') && !m.movementType.includes('out')));

        const isOut =
          isWage ||
          (!isAdjustment &&
            (m.movementType === 'out' ||
              m.movementType === 'production_consumption' ||
              m.movementType === 'packing_deduction' ||
              m.movementType === 'wastage' ||
              m.movementType === 'sale' ||
              (delta < 0 && !isIn)));

        if (filterType === 'in' && !isIn) return false;
        if (filterType === 'out' && !isOut) return false;
        if (filterType === 'adjust' && !isAdjustment) return false;
      }

      // 4. Text search
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchSearch =
          (m.itemName || '').toLowerCase().includes(q) ||
          (m.operatorName || '').toLowerCase().includes(q) ||
          (m.reference || '').toLowerCase().includes(q) ||
          (m.reason || '').toLowerCase().includes(q) ||
          (m.createdAt || '').toLowerCase().includes(q);
        if (!matchSearch) return false;
      }

      return true;
    });
  }, [allEntries, selectedCategory, selectedIngredient, filterType, search]);

  // Sorted entries
  const sortedEntries = useMemo(() => {
    return [...filteredEntries].sort((a, b) => {
      let comparison = 0;

      if (sortField === 'date') {
        const timeA = new Date(a.createdAt).getTime();
        const timeB = new Date(b.createdAt).getTime();
        comparison = timeA - timeB;
      } else if (sortField === 'name') {
        comparison = (a.itemName || '').localeCompare(b.itemName || '');
      } else if (sortField === 'quantity') {
        comparison = a.quantity - b.quantity;
      } else if (sortField === 'type') {
        comparison = (a.movementType || '').localeCompare(b.movementType || '');
      } else if (sortField === 'category') {
        comparison = (a.category || '').localeCompare(b.category || '');
      }

      return sortOrder === 'asc' ? comparison : -comparison;
    });
  }, [filteredEntries, sortField, sortOrder]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [search, filterType, selectedCategory, selectedIngredient, sortField, sortOrder, pageSize]);

  // Pagination calculations
  const totalEntries = sortedEntries.length;
  const totalPages = Math.max(1, Math.ceil(totalEntries / pageSize));
  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);

  const paginatedEntries = useMemo(() => {
    const startIndex = (safeCurrentPage - 1) * pageSize;
    return sortedEntries.slice(startIndex, startIndex + pageSize);
  }, [sortedEntries, safeCurrentPage, pageSize]);

  // Quick action: Sort by Ingredients (Alphabetical) - Click cycles: asc -> desc -> cancel (default date desc)
  const handleSortByIngredients = () => {
    if (sortField === 'name') {
      if (sortOrder === 'asc') {
        setSortOrder('desc');
      } else {
        // Cancel / reset sort back to default
        setSortField('date');
        setSortOrder('desc');
      }
    } else {
      setSortField('name');
      setSortOrder('asc');
    }
  };

  const handleCancelIngredientSort = (e: React.MouseEvent) => {
    e.stopPropagation();
    setSortField('date');
    setSortOrder('desc');
  };

  // Toggle column sort
  const handleToggleSort = (field: SortField) => {
    if (sortField === field) {
      if (sortOrder === 'asc') {
        setSortOrder('desc');
      } else {
        // 3rd click cancels and resets to default date desc
        setSortField('date');
        setSortOrder('desc');
      }
    } else {
      setSortField(field);
      setSortOrder(field === 'name' ? 'asc' : 'desc');
    }
  };

  const handleCategoryClick = (cat: LedgerCategory) => {
    setSelectedCategory((prev) => (prev === cat ? 'all' : cat));
  };

  const handleFilterTypeClick = (type: 'in' | 'out' | 'adjust') => {
    setFilterType((prev) => (prev === type ? 'all' : type));
  };

  const hasActiveFilters = Boolean(
    search.trim() ||
    selectedCategory !== 'all' ||
    selectedIngredient !== 'all' ||
    filterType !== 'all' ||
    sortField !== 'date' ||
    sortOrder !== 'desc'
  );

  const handleResetFilters = () => {
    setSearch('');
    setSelectedCategory('all');
    setSelectedIngredient('all');
    setFilterType('all');
    setSortField('date');
    setSortOrder('desc');
    setCurrentPage(1);
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setTimeout(() => setIsRefreshing(false), 400);
    }
  };

  // Helper for Category badge rendering
  const renderCategoryBadge = (cat: UnifiedLedgerEntry['category']) => {
    switch (cat) {
      case 'basic':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300">
            <FiDroplet className="w-2.5 h-2.5 shrink-0" />
            <span>അടിസ്ഥാന ചേരുവ</span>
          </span>
        );
      case 'packets':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-purple-100 dark:bg-purple-950/60 text-purple-800 dark:text-purple-300">
            <FiPackage className="w-2.5 h-2.5 shrink-0" />
            <span>പാക്കറ്റ് / കവർ</span>
          </span>
        );
      case 'wages':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-indigo-100 dark:bg-indigo-950/60 text-indigo-800 dark:text-indigo-300">
            <FiDollarSign className="w-2.5 h-2.5 shrink-0" />
            <span>കൂലി വിഹിതം</span>
          </span>
        );
      case 'products':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-100 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300">
            <FiBox className="w-2.5 h-2.5 shrink-0" />
            <span>ഫിനിഷ്ഡ് സ്നാക്ക്</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-stone-100 dark:bg-[#282323] text-stone-700 dark:text-stone-300">
            <FiLayers className="w-2.5 h-2.5 shrink-0" />
            <span>അസംസ്കൃത വസ്തു</span>
          </span>
        );
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto font-malayalam pb-12">
      {/* ======================================================== */}
      {/* Header Bar                                               */}
      {/* ======================================================== */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-stone-200 dark:border-[#2E2828]">
        <div>
          <h2 className="text-lg sm:text-xl font-black text-stone-900 dark:text-white flex items-center gap-2">
            <span>സ്റ്റോക്ക് ലെഡ്ജർ (Stock Movement Ledger)</span>
          </h2>
          <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
            അടിസ്ഥാന ചേരുവകൾ, പാക്കറ്റുകൾ, കൂലി, സ്നാക്കുകൾ എന്നിവയുടെ പൂർണ്ണ വരവ്-ചിലവ് ചരിത്രം
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {ingredients.length > 0 && (
            <button
              onClick={() => setPurchaseListModalOpen(true)}
              className="flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl border border-stone-200 dark:border-[#2E2828] bg-white dark:bg-[#1E1B1B] text-stone-700 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-[#282323] font-bold text-xs shadow-2xs press-apple transition-colors cursor-pointer"
              title="Print purchase & reorder list"
            >
              <FiPrinter className="w-3.5 h-3.5 text-epso-orange" />
              <span>Print Purchase List</span>
            </button>
          )}

          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-stone-100 hover:bg-stone-200 dark:bg-[#282323] dark:hover:bg-[#322c2c] text-stone-700 dark:text-stone-300 font-bold text-xs press-apple transition-colors cursor-pointer disabled:opacity-60"
          >
            <FiRefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* ======================================================== */}
      {/* HIGH-LEVEL SUMMARY METRIC CHIPS                          */}
      {/* ======================================================== */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
        <div className="p-3 rounded-2xl bg-white dark:bg-[#1E1B1B] border border-stone-200 dark:border-[#2E2828] shadow-apple-card">
          <span className="text-[10px] font-bold text-stone-400 block uppercase">ആകെ രേഖകൾ</span>
          <span className="text-lg font-black font-mono text-stone-900 dark:text-white mt-0.5 block">
            {allEntries.length}
          </span>
          <span className="text-[10px] text-stone-500">ലെഡ്ജർ എൻട്രികൾ</span>
        </div>

        <div className="p-3 rounded-2xl bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-900/40">
          <span className="text-[10px] font-bold text-amber-700 dark:text-amber-400 block uppercase">അടിസ്ഥാന ചേരുവകൾ</span>
          <span className="text-lg font-black font-mono text-amber-900 dark:text-amber-200 mt-0.5 block">
            {categoryCounts.basic}
          </span>
          <span className="text-[10px] text-amber-600/80 dark:text-amber-400/80">വെളിച്ചെണ്ണ, ഉപ്പ്..</span>
        </div>

        <div className="p-3 rounded-2xl bg-purple-50/50 dark:bg-purple-950/20 border border-purple-200/60 dark:border-purple-900/40">
          <span className="text-[10px] font-bold text-purple-700 dark:text-purple-400 block uppercase">പാക്കറ്റുകൾ & കവർ</span>
          <span className="text-lg font-black font-mono text-purple-900 dark:text-purple-200 mt-0.5 block">
            {categoryCounts.packets}
          </span>
          <span className="text-[10px] text-purple-600/80 dark:text-purple-400/80">കവർ ഉപയോഗം</span>
        </div>

        <div className="p-3 rounded-2xl bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-200/60 dark:border-indigo-900/40">
          <span className="text-[10px] font-bold text-indigo-700 dark:text-indigo-400 block uppercase">കൂലി വിഹിതം</span>
          <span className="text-lg font-black font-mono text-indigo-900 dark:text-indigo-200 mt-0.5 block">
            {categoryCounts.wages}
          </span>
          <span className="text-[10px] text-indigo-600/80 dark:text-indigo-400/80">കുക്കിംഗ് & പാക്കിംഗ്</span>
        </div>

        <div className="p-3 rounded-2xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200/60 dark:border-emerald-900/40">
          <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 block uppercase">മറ്റ് ചേരുവകൾ</span>
          <span className="text-lg font-black font-mono text-emerald-900 dark:text-emerald-200 mt-0.5 block">
            {categoryCounts.ingredients}
          </span>
          <span className="text-[10px] text-emerald-600/80 dark:text-emerald-400/80">മസാലകൾ & മാവ്</span>
        </div>

        <div className="p-3 rounded-2xl bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200/60 dark:border-blue-900/40">
          <span className="text-[10px] font-bold text-blue-700 dark:text-blue-400 block uppercase">സ്നാക്കുകൾ</span>
          <span className="text-lg font-black font-mono text-blue-900 dark:text-blue-200 mt-0.5 block">
            {categoryCounts.products}
          </span>
          <span className="text-[10px] text-blue-600/80 dark:text-blue-400/80">ഫിനിഷ്ഡ് ബാച്ചുകൾ</span>
        </div>
      </div>

      {/* ======================================================== */}
      {/* CATEGORY TABS (All, Basic, Packets, Wages, etc.)         */}
      {/* ======================================================== */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
        <button
          onClick={() => setSelectedCategory('all')}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
            selectedCategory === 'all'
              ? 'bg-epso-red text-white shadow-sm dark:bg-amber-500 dark:text-stone-950'
              : 'bg-white dark:bg-[#1E1B1B] text-stone-600 dark:text-stone-300 border border-stone-200 dark:border-[#2E2828] hover:bg-stone-50 dark:hover:bg-[#252020]'
          }`}
        >
          <span>എല്ലാം (All)</span>
          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-black/10 dark:bg-white/20">
            {categoryCounts.all}
          </span>
        </button>

        <button
          onClick={() => handleCategoryClick('basic')}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
            selectedCategory === 'basic'
              ? 'bg-amber-600 text-white shadow-sm dark:bg-amber-500 dark:text-stone-950'
              : 'bg-white dark:bg-[#1E1B1B] text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-900/40 hover:bg-amber-50 dark:hover:bg-amber-950/30'
          }`}
          title={selectedCategory === 'basic' ? 'ഫിൽട്ടർ ഒഴിവാക്കാൻ വീണ്ടും ക്ലിക്ക് ചെയ്യുക' : 'അടിസ്ഥാന ചേരുവകൾ മാത്രം കാണിക്കുക'}
        >
          <FiDroplet className="w-3.5 h-3.5" />
          <span>അടിസ്ഥാന ചേരുവകൾ (Basic)</span>
          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-black/10 dark:bg-white/20">
            {categoryCounts.basic}
          </span>
        </button>

        <button
          onClick={() => handleCategoryClick('packets')}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
            selectedCategory === 'packets'
              ? 'bg-purple-600 text-white shadow-sm dark:bg-purple-500 dark:text-white'
              : 'bg-white dark:bg-[#1E1B1B] text-purple-800 dark:text-purple-300 border border-purple-200 dark:border-purple-900/40 hover:bg-purple-50 dark:hover:bg-purple-950/30'
          }`}
          title={selectedCategory === 'packets' ? 'ഫിൽട്ടർ ഒഴിവാക്കാൻ വീണ്ടും ക്ലിക്ക് ചെയ്യുക' : 'പാക്കറ്റുകൾ മാത്രം കാണിക്കുക'}
        >
          <FiPackage className="w-3.5 h-3.5" />
          <span>പാക്കറ്റുകൾ & കവർ (Packets)</span>
          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-black/10 dark:bg-white/20">
            {categoryCounts.packets}
          </span>
        </button>

        <button
          onClick={() => handleCategoryClick('wages')}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
            selectedCategory === 'wages'
              ? 'bg-indigo-600 text-white shadow-sm dark:bg-indigo-500 dark:text-white'
              : 'bg-white dark:bg-[#1E1B1B] text-indigo-800 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-900/40 hover:bg-indigo-50 dark:hover:bg-indigo-950/30'
          }`}
          title={selectedCategory === 'wages' ? 'ഫിൽട്ടർ ഒഴിവാക്കാൻ വീണ്ടും ക്ലിക്ക് ചെയ്യുക' : 'കൂലി വിഹിതം മാത്രം കാണിക്കുക'}
        >
          <FiDollarSign className="w-3.5 h-3.5" />
          <span>കൂലി വിഹിതം (Wages)</span>
          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-black/10 dark:bg-white/20">
            {categoryCounts.wages}
          </span>
        </button>

        <button
          onClick={() => handleCategoryClick('ingredients')}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
            selectedCategory === 'ingredients'
              ? 'bg-emerald-600 text-white shadow-sm dark:bg-emerald-500 dark:text-stone-950'
              : 'bg-white dark:bg-[#1E1B1B] text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900/40 hover:bg-emerald-50 dark:hover:bg-emerald-950/30'
          }`}
          title={selectedCategory === 'ingredients' ? 'ഫിൽട്ടർ ഒഴിവാക്കാൻ വീണ്ടും ക്ലിക്ക് ചെയ്യുക' : 'മറ്റ് ചേരുവകൾ മാത്രം കാണിക്കുക'}
        >
          <FiLayers className="w-3.5 h-3.5" />
          <span>മറ്റ് ചേരുവകൾ (Ingredients)</span>
          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-black/10 dark:bg-white/20">
            {categoryCounts.ingredients}
          </span>
        </button>

        <button
          onClick={() => handleCategoryClick('products')}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
            selectedCategory === 'products'
              ? 'bg-blue-600 text-white shadow-sm dark:bg-blue-500 dark:text-white'
              : 'bg-white dark:bg-[#1E1B1B] text-blue-800 dark:text-blue-300 border border-blue-200 dark:border-blue-900/40 hover:bg-blue-50 dark:hover:bg-blue-950/30'
          }`}
          title={selectedCategory === 'products' ? 'ഫിൽട്ടർ ഒഴിവാക്കാൻ വീണ്ടും ക്ലിക്ക് ചെയ്യുക' : 'സ്നാക്കുകൾ മാത്രം കാണിക്കുക'}
        >
          <FiBox className="w-3.5 h-3.5" />
          <span>സ്നാക്കുകൾ (Products)</span>
          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-black/10 dark:bg-white/20">
            {categoryCounts.products}
          </span>
        </button>
      </div>

      {/* ======================================================== */}
      {/* CONTROLS BAR: Search, Filter, Sort by Ingredients       */}
      {/* ======================================================== */}
      <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between">
        {/* Search */}
        <div className="relative flex-1">
          <FiSearch className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ചേരുവ, ഓപ്പറേറ്റർ, റെഫറൻസ്, തീയതി പ്രകാരം തിരയുക..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-stone-200 dark:border-[#2E2828] bg-white dark:bg-[#1E1B1B] text-xs text-stone-900 dark:text-white placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-epso-red/30 dark:focus:ring-amber-500/30 transition-all font-malayalam"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-stone-400 hover:text-stone-600"
            >
              ✕
            </button>
          )}
        </div>

        {/* Filter by Specific Ingredient Dropdown */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <div className="relative flex items-center">
            <select
              value={selectedIngredient}
              onChange={(e) => setSelectedIngredient(e.target.value)}
              className="px-3 py-2.5 pr-7 rounded-xl border border-stone-200 dark:border-[#2E2828] bg-white dark:bg-[#1E1B1B] text-xs font-bold text-stone-800 dark:text-stone-200 focus:outline-none cursor-pointer max-w-[200px]"
              title="Filter by specific item or ingredient"
            >
              <option value="all">എല്ലാ ഇനങ്ങളും (All Items)</option>
              {uniqueItemNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
            {selectedIngredient !== 'all' && (
              <button
                type="button"
                onClick={() => setSelectedIngredient('all')}
                className="absolute right-2 text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 cursor-pointer p-0.5"
                title="ചേരുവ ഫിൽട്ടർ ഒഴിവാക്കുക (Clear ingredient filter)"
              >
                <FiX className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Quick "Sort by Ingredients" Button */}
          <button
            type="button"
            onClick={handleSortByIngredients}
            className={`flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-bold border transition-all cursor-pointer whitespace-nowrap ${
              sortField === 'name'
                ? 'bg-amber-100 border-amber-300 text-amber-900 dark:bg-amber-950/60 dark:border-amber-800 dark:text-amber-300 shadow-xs'
                : 'bg-white dark:bg-[#1E1B1B] border-stone-200 dark:border-[#2E2828] text-stone-700 dark:text-stone-300 hover:bg-stone-50'
            }`}
            title={sortField === 'name' ? 'അക്ഷരമാലാക്രമം മാറ്റാൻ ക്ലിക്ക് ചെയ്യുക (3rd ക്ലിക്കിൽ പഴയപടിയാകും)' : 'ചേരുവകൾ പ്രകാരം അടുക്കുക (Sort by ingredients)'}
          >
            <FiFilter className="w-3.5 h-3.5 text-epso-orange" />
            <span>ചേരുവകൾ പ്രകാരം അടുക്കുക</span>
            {sortField === 'name' && (
              sortOrder === 'asc' ? <FiArrowUp className="w-3 h-3" /> : <FiArrowDown className="w-3 h-3" />
            )}
            {sortField === 'name' && (
              <span
                onClick={handleCancelIngredientSort}
                className="ml-1 p-0.5 rounded-full hover:bg-amber-200 dark:hover:bg-amber-900/50 cursor-pointer"
                title="അടുക്കൽ റദ്ദാക്കുക (Cancel sort)"
              >
                <FiX className="w-3 h-3 text-amber-800 dark:text-amber-300" />
              </span>
            )}
          </button>
        </div>

        {/* Direction Tabs: All, In, Out, Adjust */}
        <div className="flex items-center gap-1 p-1 bg-stone-100 dark:bg-[#1E1B1B] rounded-xl border border-stone-200 dark:border-[#2E2828] shrink-0">
          <button
            type="button"
            onClick={() => setFilterType('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              filterType === 'all'
                ? 'bg-white dark:bg-[#282323] text-stone-900 dark:text-white shadow-sm'
                : 'text-stone-500 hover:text-stone-800 dark:text-stone-400'
            }`}
          >
            All
          </button>
          <button
            type="button"
            onClick={() => handleFilterTypeClick('in')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              filterType === 'in'
                ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 shadow-sm'
                : 'text-stone-500 hover:text-stone-800 dark:text-stone-400'
            }`}
            title={filterType === 'in' ? 'ഫിൽട്ടർ ഒഴിവാക്കാൻ വീണ്ടും ക്ലിക്ക് ചെയ്യുക' : 'വരവ് മാത്രം കാണിക്കുക'}
          >
            In (വരവ്)
          </button>
          <button
            type="button"
            onClick={() => handleFilterTypeClick('out')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              filterType === 'out'
                ? 'bg-red-100 dark:bg-red-950/60 text-red-800 dark:text-red-300 shadow-sm'
                : 'text-stone-500 hover:text-stone-800 dark:text-stone-400'
            }`}
            title={filterType === 'out' ? 'ഫിൽട്ടർ ഒഴിവാക്കാൻ വീണ്ടും ക്ലിക്ക് ചെയ്യുക' : 'ചിലവ് മാത്രം കാണിക്കുക'}
          >
            Out (ചിലവ്)
          </button>
          <button
            type="button"
            onClick={() => handleFilterTypeClick('adjust')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              filterType === 'adjust'
                ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 shadow-sm'
                : 'text-stone-500 hover:text-stone-800 dark:text-stone-400'
            }`}
            title={filterType === 'adjust' ? 'ഫിൽട്ടർ ഒഴിവാക്കാൻ വീണ്ടും ക്ലിക്ക് ചെയ്യുക' : 'അഡ്ജസ്റ്റ്മെന്റ് മാത്രം കാണിക്കുക'}
          >
            Adjust (മാറ്റം)
          </button>
        </div>

        {/* Global Reset Filters Button if any filter or custom sort is active */}
        {hasActiveFilters && (
          <button
            type="button"
            onClick={handleResetFilters}
            className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-stone-100 hover:bg-stone-200 dark:bg-[#282323] dark:hover:bg-[#322c2c] text-stone-700 dark:text-stone-300 font-bold text-xs press-apple transition-colors cursor-pointer shrink-0"
            title="എല്ലാ ഫിൽട്ടറുകളും പഴയപടിയാക്കുക (Reset all filters & sorting)"
          >
            <FiRotateCcw className="w-3.5 h-3.5 text-epso-red dark:text-amber-400" />
            <span>റീസെറ്റ് (Reset)</span>
          </button>
        )}
      </div>

      {/* ======================================================== */}
      {/* Movements & Expenses Table with Clickable Sort Headers   */}
      {/* ======================================================== */}
      <div className="rounded-3xl bg-white dark:bg-[#1E1B1B] border border-stone-200 dark:border-[#2E2828] shadow-apple-card overflow-hidden">
        {paginatedEntries.length === 0 ? (
          <div className="py-16 text-center text-xs text-stone-400 dark:text-stone-500 font-malayalam space-y-2">
            <FiLayers className="w-8 h-8 mx-auto text-stone-300 dark:text-stone-600" />
            <p className="font-bold text-stone-600 dark:text-stone-400">
              തിരഞ്ഞെടുത്ത ഫിൽട്ടറുകൾക്കനുസരിച്ച് ലെഡ്ജർ രേഖകൾ ലഭ്യമല്ല
            </p>
            <p className="text-[11px] text-stone-400">
              ഫിൽട്ടറുകൾ റീസെറ്റ് ചെയ്യുക അല്ലെങ്കിൽ തിരയൽ പദം മാറ്റുക.
            </p>
            {(search || selectedCategory !== 'all' || selectedIngredient !== 'all' || filterType !== 'all') && (
              <button
                onClick={() => {
                  setSearch('');
                  setSelectedCategory('all');
                  setSelectedIngredient('all');
                  setFilterType('all');
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-stone-100 dark:bg-[#282323] text-stone-700 dark:text-stone-300 text-xs font-bold mt-2 cursor-pointer hover:bg-stone-200"
              >
                <FiRotateCcw className="w-3.5 h-3.5" />
                <span>എല്ലാ ഫിൽട്ടറുകളും ഒഴിവാക്കുക (Reset Filters)</span>
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-stone-200 dark:border-[#2E2828] bg-stone-50/70 dark:bg-[#161414] text-stone-500 dark:text-stone-400 font-bold font-malayalam select-none">
                  {/* Item / Ingredient Column */}
                  <th
                    onClick={() => handleToggleSort('name')}
                    className="py-3 px-4 cursor-pointer hover:text-stone-900 dark:hover:text-white transition-colors"
                  >
                    <div className="flex items-center gap-1.5">
                      <span>ചേരുവ / ഇനം (Item / Ingredient)</span>
                      {sortField === 'name' && (
                        sortOrder === 'asc' ? <FiArrowUp className="w-3 h-3 text-epso-orange" /> : <FiArrowDown className="w-3 h-3 text-epso-orange" />
                      )}
                    </div>
                  </th>

                  {/* Category Column */}
                  <th
                    onClick={() => handleToggleSort('category')}
                    className="py-3 px-4 cursor-pointer hover:text-stone-900 dark:hover:text-white transition-colors"
                  >
                    <div className="flex items-center gap-1.5">
                      <span>വിഭാഗം (Category)</span>
                      {sortField === 'category' && (
                        sortOrder === 'asc' ? <FiArrowUp className="w-3 h-3 text-epso-orange" /> : <FiArrowDown className="w-3 h-3 text-epso-orange" />
                      )}
                    </div>
                  </th>

                  {/* Type Column */}
                  <th
                    onClick={() => handleToggleSort('type')}
                    className="py-3 px-4 cursor-pointer hover:text-stone-900 dark:hover:text-white transition-colors"
                  >
                    <div className="flex items-center gap-1.5">
                      <span>തരം (Type)</span>
                      {sortField === 'type' && (
                        sortOrder === 'asc' ? <FiArrowUp className="w-3 h-3 text-epso-orange" /> : <FiArrowDown className="w-3 h-3 text-epso-orange" />
                      )}
                    </div>
                  </th>

                  {/* Quantity / Amount Column */}
                  <th
                    onClick={() => handleToggleSort('quantity')}
                    className="py-3 px-4 cursor-pointer hover:text-stone-900 dark:hover:text-white transition-colors text-right"
                  >
                    <div className="flex items-center justify-end gap-1.5">
                      <span>അളവ് / തുക (Change)</span>
                      {sortField === 'quantity' && (
                        sortOrder === 'asc' ? <FiArrowUp className="w-3 h-3 text-epso-orange" /> : <FiArrowDown className="w-3 h-3 text-epso-orange" />
                      )}
                    </div>
                  </th>

                  {/* Old -> New Balance */}
                  <th className="py-3 px-4">ബാലൻസ് (Old → New)</th>

                  {/* Reference / Reason */}
                  <th className="py-3 px-4">റെഫറൻസ് / കാരണം</th>

                  {/* Operator */}
                  <th className="py-3 px-4">ഓപ്പറേറ്റർ / തൊഴിലാളികൾ</th>

                  {/* Date Column */}
                  <th
                    onClick={() => handleToggleSort('date')}
                    className="py-3 px-4 cursor-pointer hover:text-stone-900 dark:hover:text-white transition-colors"
                  >
                    <div className="flex items-center gap-1.5">
                      <span>തീയതി (Date)</span>
                      {sortField === 'date' && (
                        sortOrder === 'asc' ? <FiArrowUp className="w-3 h-3 text-epso-orange" /> : <FiArrowDown className="w-3 h-3 text-epso-orange" />
                      )}
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 dark:divide-[#2E2828]/60">
                {paginatedEntries.map((m) => {
                  const deltaNum = Number(m.quantity) || 0;
                  const isWage = m.category === 'wages';
                  const isAdjustment =
                    !isWage &&
                    (m.movementType === 'adjustment' ||
                      m.movementType === 'adjust' ||
                      m.movementType === 'opening' ||
                      m.movementType === 'cancellation_reversal');

                  const isIn =
                    !isWage &&
                    !isAdjustment &&
                    (m.movementType === 'in' ||
                      m.movementType === 'purchase' ||
                      m.movementType === 'purchase_inward' ||
                      m.movementType === 'production_output' ||
                      m.movementType === 'packing_reversal' ||
                      m.movementType === 'sale_reversal' ||
                      (deltaNum > 0 && !m.movementType.includes('consumption') && !m.movementType.includes('out')));

                  const isOut =
                    isWage ||
                    (!isAdjustment &&
                      (m.movementType === 'out' ||
                        m.movementType === 'production_consumption' ||
                        m.movementType === 'packing_deduction' ||
                        m.movementType === 'wastage' ||
                        m.movementType === 'sale' ||
                        (deltaNum < 0 && !isIn)));

                  return (
                    <tr key={m.id} className="hover:bg-stone-50/80 dark:hover:bg-[#252020] transition-colors">
                      {/* Item Name & Details */}
                      <td className="py-3 px-4">
                        <span className="font-bold text-stone-900 dark:text-white font-malayalam block">
                          {m.itemName}
                        </span>
                        <span className="text-[10px] text-stone-400 font-medium">
                          {formatHumanReference(m.reference, m.reason, m.movementType, m.category)}
                        </span>
                      </td>

                      {/* Category Badge */}
                      <td className="py-3 px-4">
                        {renderCategoryBadge(m.category)}
                      </td>

                      {/* Direction / Type Badge */}
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black ${
                            isWage
                              ? 'bg-indigo-100 dark:bg-indigo-950/50 text-indigo-800 dark:text-indigo-300'
                              : isIn
                              ? 'bg-emerald-100 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300'
                              : isOut
                              ? 'bg-red-100 dark:bg-red-950/50 text-red-800 dark:text-red-300'
                              : 'bg-amber-100 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300'
                          }`}
                        >
                          {isIn ? (
                            <>
                              <FiArrowDownRight className="w-3 h-3" />
                              <span>IN (വരവ്)</span>
                            </>
                          ) : isOut ? (
                            <>
                              <FiArrowUpRight className="w-3 h-3" />
                              <span>{isWage ? 'WAGE (കൂലി)' : 'OUT (ചിലവ്)'}</span>
                            </>
                          ) : (
                            <span>ADJUST</span>
                          )}
                        </span>
                      </td>

                      {/* Change Quantity / Amount */}
                      <td className="py-3 px-4 font-mono font-bold text-right text-stone-900 dark:text-white">
                        <span
                          className={
                            isWage
                              ? 'text-indigo-600 dark:text-indigo-400'
                              : deltaNum > 0 || (deltaNum === 0 && m.newBalance > m.previousBalance)
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-red-600 dark:text-red-400'
                          }
                        >
                          {isWage
                            ? '-'
                            : deltaNum > 0 || (deltaNum === 0 && m.newBalance > m.previousBalance)
                            ? '+'
                            : deltaNum < 0 || (deltaNum === 0 && m.newBalance < m.previousBalance)
                            ? '-'
                            : ''}
                          {m.unit === '₹' ? '₹' : ''}
                          {Math.abs(deltaNum).toLocaleString('en-IN')} {m.unit !== '₹' ? m.unit : ''}
                        </span>
                      </td>

                      {/* Old -> New Balance */}
                      <td className="py-3 px-4 font-mono text-[11px] text-stone-500 dark:text-stone-400">
                        {isWage ? (
                          <span>-</span>
                        ) : (
                          <>
                            {m.previousBalance} → <span className="font-bold text-stone-900 dark:text-white">{m.newBalance}</span>
                          </>
                        )}
                      </td>

                      {/* Reference / Reason */}
                      <td className="py-3 px-4 max-w-xs">
                        <span className="text-[11px] font-semibold text-stone-700 dark:text-stone-300 block truncate" title={formatHumanReference(m.reference, m.reason, m.movementType, m.category)}>
                          {formatHumanReference(m.reference, m.reason, m.movementType, m.category)}
                        </span>
                        {m.reason && cleanHumanReason(m.reason) && cleanHumanReason(m.reason) !== formatHumanReference(m.reference, m.reason, m.movementType, m.category) && (
                          <span className="text-[10px] text-stone-400 dark:text-stone-500 font-malayalam block line-clamp-2" title={cleanHumanReason(m.reason)}>
                            {cleanHumanReason(m.reason)}
                          </span>
                        )}
                      </td>

                      {/* Operator / Workers info */}
                      <td className="py-3 px-4 text-stone-600 dark:text-stone-300 font-medium">
                        {m.operatorName || '-'}
                      </td>

                      {/* Date */}
                      <td className="py-3 px-4 text-stone-400 text-[11px] font-mono whitespace-nowrap">
                        {new Date(m.createdAt).toLocaleDateString('en-IN', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* ======================================================== */}
        {/* PAGINATION BAR ("add pages if the list becomes full")     */}
        {/* ======================================================== */}
        {totalEntries > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-5 py-4 border-t border-stone-200 dark:border-[#2E2828] bg-stone-50/50 dark:bg-[#161414] text-xs">
            {/* Range Indicator */}
            <div className="text-stone-500 dark:text-stone-400">
              <span>ആകെ </span>
              <span className="font-mono font-bold text-stone-900 dark:text-white">{totalEntries}</span>
              <span> രേഖകളിൽ </span>
              <span className="font-mono font-bold text-stone-900 dark:text-white">
                {(safeCurrentPage - 1) * pageSize + 1} - {Math.min(safeCurrentPage * pageSize, totalEntries)}
              </span>
              <span> എണ്ണം കാണിക്കുന്നു</span>
            </div>

            {/* Pagination Controls */}
            <div className="flex items-center gap-2 flex-wrap">
              {/* Page size selector */}
              <div className="flex items-center gap-1.5 mr-2">
                <span className="text-stone-400 text-[11px]">പേജിൽ:</span>
                <select
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value))}
                  className="px-2 py-1 rounded-lg border border-stone-200 dark:border-[#2E2828] bg-white dark:bg-[#1E1B1B] text-xs font-bold text-stone-800 dark:text-stone-200 focus:outline-none cursor-pointer"
                >
                  <option value={15}>15</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>

              {/* First Page */}
              <button
                onClick={() => setCurrentPage(1)}
                disabled={safeCurrentPage === 1}
                className="p-1.5 rounded-lg border border-stone-200 dark:border-[#2E2828] bg-white dark:bg-[#1E1B1B] text-stone-700 dark:text-stone-300 hover:bg-stone-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                title="ആദ്യ പേജ് (First Page)"
              >
                <FiChevronsLeft className="w-4 h-4" />
              </button>

              {/* Prev Page */}
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={safeCurrentPage === 1}
                className="p-1.5 rounded-lg border border-stone-200 dark:border-[#2E2828] bg-white dark:bg-[#1E1B1B] text-stone-700 dark:text-stone-300 hover:bg-stone-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                title="മുമ്പത്തെ പേജ് (Previous Page)"
              >
                <FiChevronLeft className="w-4 h-4" />
              </button>

              {/* Page Numbers */}
              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum: number;
                  if (totalPages <= 5) {
                    pageNum = i + 1;
                  } else if (safeCurrentPage <= 3) {
                    pageNum = i + 1;
                  } else if (safeCurrentPage >= totalPages - 2) {
                    pageNum = totalPages - 4 + i;
                  } else {
                    pageNum = safeCurrentPage - 2 + i;
                  }

                  return (
                    <button
                      key={pageNum}
                      onClick={() => setCurrentPage(pageNum)}
                      className={`w-7 h-7 rounded-lg text-xs font-bold font-mono transition-all cursor-pointer ${
                        safeCurrentPage === pageNum
                          ? 'bg-epso-red text-white shadow-xs dark:bg-amber-500 dark:text-stone-950'
                          : 'bg-white dark:bg-[#1E1B1B] border border-stone-200 dark:border-[#2E2828] text-stone-700 dark:text-stone-300 hover:bg-stone-100'
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                })}
              </div>

              {/* Next Page */}
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={safeCurrentPage === totalPages}
                className="p-1.5 rounded-lg border border-stone-200 dark:border-[#2E2828] bg-white dark:bg-[#1E1B1B] text-stone-700 dark:text-stone-300 hover:bg-stone-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                title="അടുത്ത പേജ് (Next Page)"
              >
                <FiChevronRight className="w-4 h-4" />
              </button>

              {/* Last Page */}
              <button
                onClick={() => setCurrentPage(totalPages)}
                disabled={safeCurrentPage === totalPages}
                className="p-1.5 rounded-lg border border-stone-200 dark:border-[#2E2828] bg-white dark:bg-[#1E1B1B] text-stone-700 dark:text-stone-300 hover:bg-stone-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                title="അവസാന പേജ് (Last Page)"
              >
                <FiChevronsRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

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
