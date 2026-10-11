import React, { useState } from 'react';
import { StockMovement } from '../types';
import {
  History,
  Search,
  ArrowDownRight,
  ArrowUpRight,
  RefreshCw,
  Layers,
  Calendar,
  User,
} from 'lucide-react';

interface StockLedgerAdminViewProps {
  movements: StockMovement[];
  onRefresh: () => void;
}

export const StockLedgerAdminView: React.FC<StockLedgerAdminViewProps> = ({
  movements,
  onRefresh,
}) => {
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'in' | 'out' | 'adjust'>('all');

  const filteredMovements = movements.filter((m) => {
    const matchSearch =
      m.itemName.toLowerCase().includes(search.toLowerCase()) ||
      m.operatorName.toLowerCase().includes(search.toLowerCase()) ||
      m.reference.toLowerCase().includes(search.toLowerCase());

    if (!matchSearch) return false;
    if (filterType !== 'all' && m.movementType !== filterType) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-stone-200 dark:border-[#2E2828]">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-stone-900 dark:text-white font-malayalam">
            സ്റ്റോക്ക് ലെഡ്ജർ & മൂവ്‌മെന്റ് ഹിസ്റ്ററി
          </h1>
          <p className="text-xs sm:text-sm text-stone-500 dark:text-stone-400 font-malayalam mt-0.5">
            അസംസ്കൃത വസ്തുക്കളുടെയും ഉൽപ്പന്നങ്ങളുടെയും എല്ലാ ഇൻ / ഔട്ട് ഇടപാടുകളും
          </p>
        </div>
        <button
          onClick={onRefresh}
          className="flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-stone-100 hover:bg-stone-200 dark:bg-[#282323] dark:hover:bg-[#322c2c] text-stone-700 dark:text-stone-300 font-bold text-xs press-apple transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span className="font-malayalam">പുതുക്കുക (Refresh)</span>
        </button>
      </div>

      {/* Filter and Search */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ഇനം, ഓപ്പറേറ്റർ, റഫറൻസ് നമ്പർ തിരയുക..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-stone-200 dark:border-[#2E2828] bg-white dark:bg-[#1E1B1B] text-xs text-stone-900 dark:text-white placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-epso-red/30 dark:focus:ring-amber-500/30 transition-all font-malayalam"
          />
        </div>

        <div className="flex items-center gap-1.5 p-1 bg-stone-100 dark:bg-[#1E1B1B] rounded-xl border border-stone-200 dark:border-[#2E2828]">
          <button
            onClick={() => setFilterType('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              filterType === 'all'
                ? 'bg-white dark:bg-[#282323] text-stone-900 dark:text-white shadow-sm'
                : 'text-stone-500 hover:text-stone-800 dark:text-stone-400'
            }`}
          >
            എല്ലാം ({movements.length})
          </button>
          <button
            onClick={() => setFilterType('in')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              filterType === 'in'
                ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 shadow-sm'
                : 'text-stone-500 hover:text-stone-800 dark:text-stone-400'
            }`}
          >
            ഇൻവേർഡ് (In)
          </button>
          <button
            onClick={() => setFilterType('out')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              filterType === 'out'
                ? 'bg-red-100 dark:bg-red-950/60 text-red-800 dark:text-red-300 shadow-sm'
                : 'text-stone-500 hover:text-stone-800 dark:text-stone-400'
            }`}
          >
            ഔട്ട്‌വേർഡ് (Out)
          </button>
          <button
            onClick={() => setFilterType('adjust')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              filterType === 'adjust'
                ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 shadow-sm'
                : 'text-stone-500 hover:text-stone-800 dark:text-stone-400'
            }`}
          >
            ക്രമീകരണം (Adjust)
          </button>
        </div>
      </div>

      {/* Movements Table */}
      <div className="p-5 rounded-2xl bg-white dark:bg-[#1E1B1B] border border-stone-200 dark:border-[#2E2828] shadow-apple-card dark:shadow-apple-card-dark">
        {filteredMovements.length === 0 ? (
          <div className="py-12 text-center text-xs text-stone-400 dark:text-stone-500 font-malayalam">
            സ്റ്റോക്ക് മൂവ്‌മെന്റ് രേഖകൾ ഒന്നും കണ്ടെത്താനായില്ല (No stock ledger records found)
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-stone-100 dark:border-[#2E2828] text-stone-400 font-semibold font-malayalam">
                  <th className="py-2.5 px-3">ഇനം (Item)</th>
                  <th className="py-2.5 px-3">തരം (Type)</th>
                  <th className="py-2.5 px-3">മാറ്റം (Qty)</th>
                  <th className="py-2.5 px-3">മുൻപ് / പുതിയത്</th>
                  <th className="py-2.5 px-3">റഫറൻസ് / കാരണം</th>
                  <th className="py-2.5 px-3">ഓപ്പറേറ്റർ</th>
                  <th className="py-2.5 px-3">തീയതി</th>
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
                              <ArrowDownRight className="w-3 h-3" />
                              <span>IN (വരവ്)</span>
                            </>
                          ) : isOut ? (
                            <>
                              <ArrowUpRight className="w-3 h-3" />
                              <span>OUT (ചിലവ്)</span>
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
    </div>
  );
};
