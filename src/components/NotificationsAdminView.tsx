import React, { useState, useMemo } from 'react';
import { Ingredient, Product, ProductionRun, AuditLog } from '../types';
import {
  FiBell,
  FiAlertTriangle,
  FiAlertCircle,
  FiInfo,
  FiBookOpen,
  FiCheckCircle,
  FiRefreshCw,
  FiArrowRight,
  FiX,
  FiTrendingDown,
} from 'react-icons/fi';

interface NotificationsAdminViewProps {
  ingredients: Ingredient[];
  products: Product[];
  productionRuns: ProductionRun[];
  auditLogs?: AuditLog[];
  onNavigateTab: (tab: any) => void;
  onRefresh: () => void;
}

export type NotificationFilter = 'all' | 'stock' | 'batches' | 'recipes';

export interface AdminNotification {
  id: string;
  type: 'critical_stock' | 'low_stock' | 'recipe_missing' | 'batch_variance';
  severity: 'critical' | 'warning' | 'info';
  titleEn: string;
  titleMl: string;
  descriptionEn: string;
  descriptionMl: string;
  timestamp?: string;
  referenceId?: string;
  actionTab?: 'ingredients' | 'recipes' | 'products' | 'movements';
  actionLabelEn?: string;
  actionLabelMl?: string;
  meta?: {
    current?: number;
    required?: number;
    unit?: string;
    deficit?: number;
  };
}

export const NotificationsAdminView: React.FC<NotificationsAdminViewProps> = ({
  ingredients,
  products,
  productionRuns,
  onNavigateTab,
  onRefresh,
}) => {
  const [filter, setFilter] = useState<NotificationFilter>('all');
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  // Generate dynamic real-time notifications from active state (No security)
  const notifications = useMemo<AdminNotification[]>(() => {
    const list: AdminNotification[] = [];

    // 1. Ingredients Critical & Low Stock
    ingredients.forEach((ing) => {
      if (!ing.isActive) return;

      if (ing.currentStock <= 0) {
        list.push({
          id: `stock-zero-${ing.id}`,
          type: 'critical_stock',
          severity: 'critical',
          titleEn: `Out of Stock: ${ing.name}`,
          titleMl: `സ്റ്റോക്ക് തീർന്നു: ${ing.name}`,
          descriptionEn: `Current stock is 0. Immediate reorder required.`,
          descriptionMl: `സ്റ്റോക്ക് പൂർണ്ണമായി തീർന്നു. ഉടൻ വാങ്ങുക.`,
          timestamp: ing.updatedAt || 'Now',
          referenceId: ing.id,
          actionTab: 'ingredients',
          actionLabelEn: 'Restock',
          actionLabelMl: 'സ്റ്റോക്ക് ചേർക്കുക',
          meta: {
            current: 0,
            required: ing.minStock,
            unit: ing.unit,
            deficit: ing.minStock,
          },
        });
      } else if (ing.minStock > 0 && ing.currentStock <= ing.minStock) {
        const deficit = Number((ing.minStock - ing.currentStock).toFixed(2));
        list.push({
          id: `stock-low-${ing.id}`,
          type: 'low_stock',
          severity: 'warning',
          titleEn: `Low Stock: ${ing.name}`,
          titleMl: `കുറഞ്ഞ സ്റ്റോക്ക്: ${ing.name}`,
          descriptionEn: `Stock is below safety limit (${ing.currentStock} ${ing.unit} / Min: ${ing.minStock} ${ing.unit}).`,
          descriptionMl: `സുരക്ഷിത പരിധിക്ക് താഴെയാണ്. കുറവുള്ള അളവ്: ${deficit} ${ing.unit}.`,
          timestamp: ing.updatedAt || 'Now',
          referenceId: ing.id,
          actionTab: 'ingredients',
          actionLabelEn: 'Adjust Stock',
          actionLabelMl: 'സ്റ്റോക്ക് മാറ്റുക',
          meta: {
            current: ing.currentStock,
            required: ing.minStock,
            unit: ing.unit,
            deficit,
          },
        });
      }
    });

    // 2. Products without recipes
    products.forEach((prod) => {
      if (prod.isActive && !prod.recipeId) {
        list.push({
          id: `recipe-missing-${prod.id}`,
          type: 'recipe_missing',
          severity: 'info',
          titleEn: `Recipe Not Configured: ${prod.name}`,
          titleMl: `റെസിപ്പി ചേർത്തിട്ടില്ല: ${prod.name}`,
          descriptionEn: `Bill of materials formula is missing for this snack.`,
          descriptionMl: `ഈ ഉൽപ്പന്നത്തിന് ചേരുവകളുടെ അനുപാതം നൽകിയിട്ടില്ല.`,
          referenceId: prod.id,
          actionTab: 'recipes',
          actionLabelEn: 'Add Recipe',
          actionLabelMl: 'റെസിപ്പി ചേർക്കുക',
        });
      }
    });

    // 3. Batch Output Discrepancies or Cancellations
    productionRuns.slice(0, 15).forEach((run) => {
      if (run.status === 'cancelled') {
        list.push({
          id: `batch-cancel-${run.id}`,
          type: 'batch_variance',
          severity: 'warning',
          titleEn: `Cancelled Batch: ${run.productName} (#${run.runNumber})`,
          titleMl: `റദ്ദാക്കിയ ബാച്ച്: ${run.productName}`,
          descriptionEn: `Batch cancelled by ${run.operatorName}. Reason: ${run.cancellationReason || run.notes || 'None stated'}.`,
          descriptionMl: `ബാച്ച് റദ്ദാക്കി: ${run.cancellationReason || run.notes || 'കാരണം നൽകിയിട്ടില്ല'}.`,
          timestamp: run.productionDate,
          referenceId: run.id,
          actionTab: 'movements',
          actionLabelEn: 'View Batch',
          actionLabelMl: 'ബാച്ച് കാണുക',
        });
      } else if (run.plannedQuantity > 0 && run.actualQuantity < run.plannedQuantity * 0.85) {
        const shortKg = Number((run.plannedQuantity - run.actualQuantity).toFixed(1));
        list.push({
          id: `batch-short-${run.id}`,
          type: 'batch_variance',
          severity: 'warning',
          titleEn: `Yield Shortage: ${run.productName} (#${run.runNumber})`,
          titleMl: `ബാച്ച് അളവ് കുറവ്: ${run.productName}`,
          descriptionEn: `Output was ${shortKg} ${run.unit} below planned target (${run.actualQuantity}/${run.plannedQuantity} ${run.unit}).`,
          descriptionMl: `ആസൂത്രണം ചെയ്തതിനേക്കാൾ ${shortKg} ${run.unit} കുറവാണ് ഉൽപ്പാദിപ്പിച്ചത്.`,
          timestamp: run.productionDate,
          referenceId: run.id,
          actionTab: 'movements',
          actionLabelEn: 'Inspect Run',
          actionLabelMl: 'പരിശോധിക്കുക',
        });
      }
    });

    return list;
  }, [ingredients, products, productionRuns]);

  const filteredNotifications = useMemo(() => {
    return notifications
      .filter((n) => !dismissedIds.has(n.id))
      .filter((n) => {
        if (filter === 'stock') return n.type === 'critical_stock' || n.type === 'low_stock';
        if (filter === 'batches') return n.type === 'batch_variance';
        if (filter === 'recipes') return n.type === 'recipe_missing';
        return true;
      });
  }, [notifications, filter, dismissedIds]);

  const criticalCount = notifications.filter((n) => n.severity === 'critical' && !dismissedIds.has(n.id)).length;
  const warningCount = notifications.filter((n) => n.severity === 'warning' && !dismissedIds.has(n.id)).length;
  const infoCount = notifications.filter((n) => n.severity === 'info' && !dismissedIds.has(n.id)).length;

  const handleDismiss = (id: string) => {
    setDismissedIds((prev) => new Set(prev).add(id));
  };

  const handleDismissAll = () => {
    setDismissedIds(new Set(notifications.map((n) => n.id)));
  };

  return (
    <div className="space-y-5 pb-20 max-w-5xl">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-stone-200 dark:border-[#2E2828]">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-epso-red/10 dark:bg-amber-400/20 text-epso-red dark:text-amber-400 flex items-center justify-center font-bold">
              <FiBell className="w-4 h-4" />
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-stone-900 dark:text-white">
              Notifications & Alerts
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-stone-500 dark:text-stone-400 font-malayalam mt-0.5">
            അടിയന്തിര സ്റ്റോക്ക് കുറവുകളും ഉൽപ്പാദന അലേർട്ടുകളും
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onRefresh}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-white dark:bg-[#1E1B1B] text-stone-700 dark:text-stone-300 border border-stone-200 dark:border-[#2E2828] hover:bg-stone-50 press-apple transition-colors cursor-pointer"
          >
            <FiRefreshCw className="w-3.5 h-3.5" />
            <span>Refresh</span>
          </button>
          {filteredNotifications.length > 0 && (
            <button
              onClick={handleDismissAll}
              className="px-3 py-1.5 rounded-xl text-xs font-bold text-stone-500 hover:text-stone-800 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-[#282323] transition-colors cursor-pointer"
            >
              Clear All
            </button>
          )}
        </div>
      </div>

      {/* Structured Summary Stat Strip */}
      <div className="grid grid-cols-3 gap-3">
        <div className="p-3.5 sm:p-4 rounded-2xl bg-red-50/80 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-red-100 dark:bg-red-900/60 text-red-600 dark:text-red-400 flex items-center justify-center shrink-0">
            <FiAlertTriangle className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <span className="text-xl sm:text-2xl font-black text-red-700 dark:text-red-300 block leading-tight">
              {criticalCount}
            </span>
            <p className="text-[11px] font-bold text-red-600 dark:text-red-400 truncate">
              Critical (തീർന്നവ)
            </p>
          </div>
        </div>

        <div className="p-3.5 sm:p-4 rounded-2xl bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-900/60 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
            <FiTrendingDown className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <span className="text-xl sm:text-2xl font-black text-amber-700 dark:text-amber-300 block leading-tight">
              {warningCount}
            </span>
            <p className="text-[11px] font-bold text-amber-600 dark:text-amber-400 truncate">
              Low Stock (കുറഞ്ഞത്)
            </p>
          </div>
        </div>

        <div className="p-3.5 sm:p-4 rounded-2xl bg-blue-50/80 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/50 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-100 dark:bg-blue-900/60 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
            <FiInfo className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <span className="text-xl sm:text-2xl font-black text-blue-700 dark:text-blue-300 block leading-tight">
              {infoCount}
            </span>
            <p className="text-[11px] font-bold text-blue-600 dark:text-blue-400 truncate">
              Notices (അറിയിപ്പുകൾ)
            </p>
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
        {[
          { id: 'all', label: `All (${notifications.length})` },
          { id: 'stock', label: `Stock Alerts (${criticalCount + warningCount})` },
          { id: 'batches', label: 'Batch Issues' },
          { id: 'recipes', label: 'Missing Recipes' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setFilter(tab.id as NotificationFilter)}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all press-apple cursor-pointer ${
              filter === tab.id
                ? 'bg-epso-red text-white dark:bg-amber-400 dark:text-stone-950 shadow-sm'
                : 'bg-white dark:bg-[#1E1B1B] text-stone-600 dark:text-stone-400 border border-stone-200 dark:border-[#2E2828] hover:bg-stone-50'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Perfectly Aligned Notification Cards */}
      <div className="space-y-3">
        {filteredNotifications.length === 0 ? (
          <div className="p-10 text-center rounded-3xl bg-white dark:bg-[#1E1B1B] border border-stone-200 dark:border-[#2E2828]">
            <div className="w-12 h-12 mx-auto rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-2.5">
              <FiCheckCircle className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-black text-stone-900 dark:text-white">
              No Issues Detected
            </h3>
            <p className="text-xs text-stone-400 font-malayalam mt-0.5">
              എല്ലാ സ്റ്റോക്കും സുരക്ഷിത പരിധിയിലാണ്. ഉൽപ്പാദനം സുഗമമായി നടക്കുന്നു.
            </p>
          </div>
        ) : (
          filteredNotifications.map((n) => {
            const isCritical = n.severity === 'critical';
            const isWarning = n.severity === 'warning';

            return (
              <div
                key={n.id}
                className={`p-4 rounded-2xl transition-all border shadow-2xs flex flex-col justify-between gap-3 ${
                  isCritical
                    ? 'bg-red-50/50 dark:bg-red-950/20 border-red-200 dark:border-red-900/40 border-l-4 border-l-red-500'
                    : isWarning
                    ? 'bg-amber-50/50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/40 border-l-4 border-l-amber-500'
                    : 'bg-white dark:bg-[#1E1B1B] border-stone-200 dark:border-[#2E2828] border-l-4 border-l-blue-500'
                }`}
              >
                {/* Header row: Icon, Titles, Severity badge, and Dismiss Button */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-3 min-w-0">
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                        isCritical
                          ? 'bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-400'
                          : isWarning
                          ? 'bg-amber-100 dark:bg-amber-900/50 text-amber-600 dark:text-amber-400'
                          : 'bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400'
                      }`}
                    >
                      {n.type === 'critical_stock' && <FiAlertTriangle className="w-4 h-4" />}
                      {n.type === 'low_stock' && <FiTrendingDown className="w-4 h-4" />}
                      {n.type === 'recipe_missing' && <FiBookOpen className="w-4 h-4" />}
                      {n.type === 'batch_variance' && <FiAlertCircle className="w-4 h-4" />}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-sm font-black text-stone-900 dark:text-white leading-tight">
                          {n.titleEn}
                        </h4>
                        <span
                          className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider ${
                            isCritical
                              ? 'bg-red-100 dark:bg-red-900/80 text-red-700 dark:text-red-200'
                              : isWarning
                              ? 'bg-amber-100 dark:bg-amber-900/80 text-amber-700 dark:text-amber-200'
                              : 'bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300'
                          }`}
                        >
                          {n.severity}
                        </span>
                      </div>
                      <p className="text-[11px] text-stone-500 dark:text-stone-400 font-malayalam mt-0.5">
                        {n.titleMl}
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => handleDismiss(n.id)}
                    className="p-1 rounded-lg text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-[#282323] transition-colors cursor-pointer shrink-0"
                    title="Dismiss"
                  >
                    <FiX className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Description */}
                <p className="text-xs text-stone-600 dark:text-stone-300 font-medium pl-12 -mt-1 font-malayalam">
                  {n.descriptionMl} <span className="text-[11px] text-stone-400 font-sans">({n.descriptionEn})</span>
                </p>

                {/* Meta Pills (Aligned and structured) */}
                {n.meta && (
                  <div className="flex items-center gap-2 pl-12 flex-wrap text-[11px] font-bold">
                    <span className="px-2 py-1 rounded-lg bg-stone-100 dark:bg-[#282323] text-stone-600 dark:text-stone-300">
                      Current: <strong className="text-stone-900 dark:text-white">{n.meta.current} {n.meta.unit}</strong>
                    </span>
                    <span className="px-2 py-1 rounded-lg bg-stone-100 dark:bg-[#282323] text-stone-600 dark:text-stone-300">
                      Min Limit: <strong className="text-stone-900 dark:text-white">{n.meta.required} {n.meta.unit}</strong>
                    </span>
                    <span className="px-2 py-1 rounded-lg bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-300">
                      Deficit: <strong>{n.meta.deficit} {n.meta.unit}</strong>
                    </span>
                  </div>
                )}

                {/* Footer Action Row */}
                <div className="flex items-center justify-between pl-12 pt-1 border-t border-stone-100 dark:border-[#282323]">
                  <span className="text-[10px] text-stone-400 font-medium">
                    {n.timestamp ? `Updated: ${n.timestamp}` : 'Live Alert'}
                  </span>

                  {n.actionTab && (
                    <button
                      onClick={() => onNavigateTab(n.actionTab)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black transition-all press-apple cursor-pointer ${
                        isCritical
                          ? 'bg-red-600 hover:bg-red-700 text-white shadow-xs'
                          : isWarning
                          ? 'bg-amber-600 hover:bg-amber-700 text-white shadow-xs'
                          : 'bg-stone-900 hover:bg-stone-800 dark:bg-white dark:text-stone-900 text-white'
                      }`}
                    >
                      <span>{n.actionLabelEn}</span>
                      <FiArrowRight className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
