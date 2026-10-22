import React, { useState } from 'react';
import { StockMovement, Ingredient } from '../types';
import {
  FiSearch,
  FiArrowDownRight,
  FiArrowUpRight,
  FiRefreshCw,
  FiClock,
  FiLayers,
  FiPrinter,
} from 'react-icons/fi';
import { PrintPurchaseListModal } from './PrintPurchaseListModal';
import { useLockBodyScroll } from '../hooks/useLockBodyScroll';

interface StockLedgerAdminViewProps {
  movements: StockMovement[];
  ingredients?: Ingredient[];
  onRefresh: () => void;
}

export const StockLedgerAdminView: React.FC<StockLedgerAdminViewProps> = ({
  movements,
  ingredients = [],
  onRefresh,
}) => {
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'in' | 'out' | 'adjust'>('all');
  const [purchaseListModalOpen, setPurchaseListModalOpen] = useState(false);

  useLockBodyScroll(purchaseListModalOpen);

  const filteredMovements = movements.filter((m) => {
    const matchSearch =
      m.itemName.toLowerCase().includes(search.toLowerCase()) ||
      m.operatorName.toLowerCase().includes(search.toLowerCase()) ||
      m.reference.toLowerCase().includes(search.toLowerCase());

    if (!matchSearch) return false;
    if (filterType !== 'all' && m.movementType !== filterType) return false;
    return true;
  });

  const inCount = movements.filter((m) => m.movementType === 'in').length;
  const outCount = movements.filter((m) => m.movementType === 'out').length;
  const adjustCount = movements.filter((m) => m.movementType === 'adjust').length;

  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setTimeout(() => setIsRefreshing(false), 400);
    }
  };

  return (
    <div className="space-y-6">
      {/* Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-end gap-3 pb-2 border-b border-stone-200 dark:border-[#2E2828]">
        <div className="flex items-center gap-2">
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

      {/* Filter and Search */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <FiSearch className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search item, operator, reference..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-stone-200 dark:border-[#2E2828] bg-white dark:bg-[#1E1B1B] text-xs text-stone-900 dark:text-white placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-epso-red/30 dark:focus:ring-amber-500/30 transition-all font-malayalam"
          />
        </div>

        {/* English Status Tabs */}
        <div className="flex items-center gap-1.5 p-1 bg-stone-100 dark:bg-[#1E1B1B] rounded-xl border border-stone-200 dark:border-[#2E2828]">
          <button
            onClick={() => setFilterType('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              filterType === 'all'
                ? 'bg-white dark:bg-[#282323] text-stone-900 dark:text-white shadow-sm'
                : 'text-stone-500 hover:text-stone-800 dark:text-stone-400'
            }`}
          >
            All ({movements.length})
          </button>
          <button
            onClick={() => setFilterType('in')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              filterType === 'in'
                ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 shadow-sm'
                : 'text-stone-500 hover:text-stone-800 dark:text-stone-400'
            }`}
          >
            In ({inCount})
          </button>
          <button
            onClick={() => setFilterType('out')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              filterType === 'out'
                ? 'bg-red-100 dark:bg-red-950/60 text-red-800 dark:text-red-300 shadow-sm'
                : 'text-stone-500 hover:text-stone-800 dark:text-stone-400'
            }`}
          >
            Out ({outCount})
          </button>
          <button
            onClick={() => setFilterType('adjust')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              filterType === 'adjust'
                ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 shadow-sm'
                : 'text-stone-500 hover:text-stone-800 dark:text-stone-400'
            }`}
          >
            Adjust ({adjustCount})
          </button>
        </div>
      </div>

      {/* Movements Table */}
      <div className="p-5 rounded-2xl bg-white dark:bg-[#1E1B1B] border border-stone-200 dark:border-[#2E2828] shadow-apple-card dark:shadow-apple-card-dark">
        {filteredMovements.length === 0 ? (
          <div className="py-12 text-center text-xs text-stone-400 dark:text-stone-500 font-malayalam">
            സ്റ്റോക്ക് മൂവ്‌മെന്റ് രേഖകൾ ലഭ്യമല്ല (No stock records found)
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-stone-100 dark:border-[#2E2828] text-stone-400 font-semibold font-malayalam">
                  <th className="py-2.5 px-3">Item</th>
                  <th className="py-2.5 px-3">Type</th>
                  <th className="py-2.5 px-3">Change (Qty)</th>
                  <th className="py-2.5 px-3">Old → New</th>
                  <th className="py-2.5 px-3">Reference / Reason</th>
                  <th className="py-2.5 px-3">Operator</th>
                  <th className="py-2.5 px-3">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 dark:divide-[#2E2828]/50">
                {filteredMovements.map((m) => {
                  const isIn = m.movementType === 'in';
                  const isOut = m.movementType === 'out';

                  return (
                    <tr key={m.id} className="hover:bg-stone-50 dark:hover:bg-[#282323] transition-colors">
                      <td className="py-3 px-3">
                        <span className="font-bold text-stone-900 dark:text-white font-malayalam block">
                          {m.itemName}
                        </span>
                        <span className="text-[10px] text-stone-400">
                          {m.itemType === 'raw' ? 'അസംസ്കൃത വസ്തു' : 'ഫിനിഷ്ഡ് സ്നാക്ക്'}
                        </span>
                      </td>

                      <td className="py-3 px-3">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            isIn
                              ? 'bg-emerald-100 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-400'
                              : isOut
                              ? 'bg-red-100 dark:bg-red-950/50 text-red-800 dark:text-red-400'
                              : 'bg-amber-100 dark:bg-amber-950/50 text-amber-800 dark:text-amber-400'
                          }`}
                        >
                          {isIn ? (
                            <>
                              <FiArrowDownRight className="w-3 h-3" />
                              <span>IN</span>
                            </>
                          ) : isOut ? (
                            <>
                              <FiArrowUpRight className="w-3 h-3" />
                              <span>OUT</span>
                            </>
                          ) : (
                            <span>ADJUST</span>
                          )}
                        </span>
                      </td>

                      <td className="py-3 px-3 font-mono font-bold text-stone-900 dark:text-white">
                        <span className={isIn ? 'text-emerald-600 dark:text-emerald-400' : isOut ? 'text-red-600 dark:text-red-400' : ''}>
                          {isIn ? '+' : isOut ? '-' : ''}{m.quantity} {m.unit}
                        </span>
                      </td>

                      <td className="py-3 px-3 font-mono text-[11px] text-stone-500 dark:text-stone-400">
                        {m.previousBalance} → <span className="font-bold text-stone-900 dark:text-white">{m.newBalance}</span>
                      </td>

                      <td className="py-3 px-3">
                        <span className="font-mono text-[10px] text-stone-500 dark:text-stone-400 block">
                          {m.reference}
                        </span>
                        {m.reason && (
                          <span className="text-[11px] text-stone-700 dark:text-stone-300 font-malayalam">
                            {m.reason}
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-3 text-stone-600 dark:text-stone-300 font-medium">
                        {m.operatorName}
                      </td>

                      <td className="py-3 px-3 text-stone-400 text-[11px]">
                        {new Date(m.createdAt).toLocaleDateString('en-IN', {
                          day: '2-digit',
                          month: 'short',
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
