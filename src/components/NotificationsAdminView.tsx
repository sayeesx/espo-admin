import React, { useState, useMemo } from 'react';
import { Ingredient, Product, ProductionRun, AuditLog } from '../types';
import {
  AlertTriangle,
  AlertCircle,
  ShieldAlert,
  Boxes,
  ScrollText,
  Clock,
  ArrowRight,
  TrendingDown,
  Info,
  CheckCircle2,
  RefreshCw,
  Bell,
} from 'lucide-react';

interface NotificationsAdminViewProps {
  ingredients: Ingredient[];
  products: Product[];
  productionRuns: ProductionRun[];
  auditLogs: AuditLog[];
  onNavigateTab: (tab: any) => void;
  onRefresh: () => void;
}

export type NotificationFilter = 'all' | 'stock' | 'batches' | 'recipes' | 'security';

export interface AdminNotification {
  id: string;
  type: 'critical_stock' | 'low_stock' | 'recipe_missing' | 'batch_variance' | 'security';
  severity: 'critical' | 'warning' | 'info';
  titleMl: string;
  titleEn: string;
  descriptionMl: string;
  descriptionEn: string;
  timestamp?: string;
  referenceId?: string;
  actionTab?: 'ingredients' | 'recipes' | 'products' | 'movements' | 'security';
  actionLabelMl?: string;
  actionLabelEn?: string;
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
  auditLogs,
  onNavigateTab,
  onRefresh,
}) => {
  const [filter, setFilter] = useState<NotificationFilter>('all');
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  // Generate dynamic real-time notifications from active state
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
          titleMl: `സ്റ്റോക്ക് പൂർണ്ണമായി തീർന്നു: ${ing.name}`,
          titleEn: `Out of Stock: ${ing.name}`,
          descriptionMl: `നിലവിൽ സ്റ്റോക്ക് പൂജ്യമാണ്. ഉൽപ്പാദനം തടസ്സപ്പെടാതിരിക്കാൻ ഉടൻ വാങ്ങുക (Min: ${ing.minStock} ${ing.unit}).`,
          descriptionEn: `Current balance is 0. Immediate reorder required to prevent kitchen batch halt.`,
          timestamp: ing.updatedAt || 'Now',
          referenceId: ing.id,
          actionTab: 'ingredients',
          actionLabelMl: 'സ്റ്റോക്ക് ചേർക്കുക',
          actionLabelEn: 'Restock Now',
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
          titleMl: `കുറഞ്ഞ സ്റ്റോക്ക് മുന്നറിയിപ്പ്: ${ing.name}`,
          titleEn: `Low Safety Stock: ${ing.name}`,
          descriptionMl: `സ്റ്റോക്ക് കുറവാണ് (${ing.currentStock} ${ing.unit}). കുറഞ്ഞ പരിധി: ${ing.minStock} ${ing.unit}. ബാക്കി കുറവ്: ${deficit} ${ing.unit}.`,
          descriptionEn: `Current balance (${ing.currentStock} ${ing.unit}) has breached safety threshold (${ing.minStock} ${ing.unit}).`,
          timestamp: ing.updatedAt || 'Now',
          referenceId: ing.id,
          actionTab: 'ingredients',
          actionLabelMl: 'സ്റ്റോക്ക് അഡ്ജസ്റ്റ് ചെയ്യുക',
          actionLabelEn: 'Adjust Stock',
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
          titleMl: `റെസിപ്പി നിർവചിച്ചിട്ടില്ല: ${prod.name}`,
          titleEn: `Recipe Not Configured: ${prod.name}`,
          descriptionMl: `ഈ ഉൽപ്പന്നത്തിന് ചേരുവകളുടെ അനുപാതം ചേർത്തിട്ടില്ല. പാചകക്കാർക്ക് ഓട്ടോമാറ്റിക് സ്റ്റോക്ക് കുറയാൻ ഫോർമുല നൽകുക.`,
          descriptionEn: `Bill of materials (BOM) missing. Ingredients won't auto-calculate in kitchen runs.`,
          referenceId: prod.id,
          actionTab: 'recipes',
          actionLabelMl: 'റെസിപ്പി ഉണ്ടാക്കുക',
          actionLabelEn: 'Add Recipe',
        });
      }
    });

    // 3. Batch Output Discrepancies or Cancellations
    productionRuns.slice(0, 20).forEach((run) => {
      if (run.status === 'cancelled') {
        list.push({
          id: `batch-cancel-${run.id}`,
          type: 'batch_variance',
          severity: 'warning',
          titleMl: `റദ്ദാക്കിയ ബാച്ച്: ${run.productName} (#${run.runNumber})`,
          titleEn: `Cancelled Batch: ${run.productName} (#${run.runNumber})`,
          descriptionMl: `ബാച്ച് റദ്ദാക്കി. കാരണം: ${run.cancellationReason || run.notes || 'കാരണം നൽകിയിട്ടില്ല'}. ഓപ്പറേറ്റർ: ${run.operatorName}.`,
          descriptionEn: `Production run was marked as cancelled. Reason: ${run.cancellationReason || run.notes || 'N/A'}.`,
          timestamp: run.productionDate,
          referenceId: run.id,
          actionTab: 'movements',
          actionLabelMl: 'വിശദാംശങ്ങൾ കാണുക',
          actionLabelEn: 'View Ledger',
        });
      } else if (run.plannedQuantity > 0 && run.actualQuantity < run.plannedQuantity * 0.85) {
        const shortKg = Number((run.plannedQuantity - run.actualQuantity).toFixed(1));
        list.push({
          id: `batch-short-${run.id}`,
          type: 'batch_variance',
          severity: 'warning',
          titleMl: `ബാച്ച് അളവ് കുറവ്: ${run.productName} (#${run.runNumber})`,
          titleEn: `Batch Yield Shortage: ${run.productName} (#${run.runNumber})`,
          descriptionMl: `ആസൂത്രണം ചെയ്ത അളവിനേക്കാൾ ${shortKg} ${run.unit} കുറവാണ് ഉൽപ്പാദിപ്പിച്ചത് (${run.actualQuantity}/${run.plannedQuantity} ${run.unit}).`,
          descriptionEn: `Actual yield (${run.actualQuantity} ${run.unit}) was significantly below planned output (${run.plannedQuantity} ${run.unit}).`,
          timestamp: run.productionDate,
          referenceId: run.id,
          actionTab: 'movements',
          actionLabelMl: 'ബാച്ച് പരിശോധിക്കുക',
          actionLabelEn: 'Inspect Run',
        });
      }
    });

    // 4. Security & Sensitive Audit Logs
    auditLogs.slice(0, 10).forEach((log) => {
      if (log.action.toLowerCase().includes('pin') || log.action.toLowerCase().includes('delete') || log.action.toLowerCase().includes('failed')) {
        list.push({
          id: `audit-${log.id}`,
          type: 'security',
          severity: 'info',
          titleMl: `സെക്യൂരിറ്റി പ്രവർത്തനം: ${log.action}`,
          titleEn: `Security Event: ${log.action}`,
          descriptionMl: `${log.actor} നിർവഹിച്ച സുരക്ഷാ പ്രവർത്തനം (${log.entityType}).`,
          descriptionEn: `Action: ${log.action} performed by ${log.actor} on ${log.entityType}.`,
          timestamp: log.createdAt,
          referenceId: log.id,
          actionTab: 'security',
          actionLabelMl: 'സെക്യൂരിറ്റി ലോഗ്',
          actionLabelEn: 'View Log',
        });
      }
    });

    return list;
  }, [ingredients, products, productionRuns, auditLogs]);

  const filteredNotifications = useMemo(() => {
    return notifications
      .filter((n) => !dismissedIds.has(n.id))
      .filter((n) => {
        if (filter === 'stock') return n.type === 'critical_stock' || n.type === 'low_stock';
        if (filter === 'batches') return n.type === 'batch_variance';
        if (filter === 'recipes') return n.type === 'recipe_missing';
        if (filter === 'security') return n.type === 'security';
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
    <div className="space-y-5 pb-20">
      {/* Top Banner & Stats */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-stone-200 dark:border-[#2E2828]">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-epso-red/10 dark:bg-amber-400/20 text-epso-red dark:text-amber-400 flex items-center justify-center font-bold">
              <Bell className="w-4 h-4" />
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-stone-900 dark:text-white font-malayalam">
              അറിയിപ്പുകൾ & അലേർട്ടുകൾ
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-stone-500 dark:text-stone-400 font-malayalam mt-1">
            സ്റ്റോക്ക് തീരുന്നത്, ബാച്ച് പ്രശ്നങ്ങൾ, സിസ്റ്റം മുന്നറിയിപ്പുകൾ
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onRefresh}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-white dark:bg-[#1E1B1B] text-stone-700 dark:text-stone-300 border border-stone-200 dark:border-[#2E2828] hover:bg-stone-50 press-apple transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>റീഫ്രഷ് (Refresh)</span>
          </button>
          {filteredNotifications.length > 0 && (
            <button
              onClick={handleDismissAll}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold text-stone-500 hover:text-stone-800 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-[#282323] transition-colors"
            >
              എല്ലാം മായ്ക്കുക (Clear All)
            </button>
          )}
        </div>
      </div>

      {/* Quick Summary Pill Bar */}
      <div className="grid grid-cols-3 gap-2.5 sm:gap-4">
        <div className="p-3 sm:p-4 rounded-2xl bg-red-50/80 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-red-100 dark:bg-red-900/60 text-red-600 dark:text-red-400 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <span className="text-lg sm:text-2xl font-black text-red-700 dark:text-red-300">
              {criticalCount}
            </span>
            <p className="text-[11px] font-bold text-red-600 dark:text-red-400 font-malayalam leading-tight">
              സ്റ്റോക്ക് തീർന്നവ (Critical)
            </p>
          </div>
        </div>

        <div className="p-3 sm:p-4 rounded-2xl bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-900/60 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
            <TrendingDown className="w-5 h-5" />
          </div>
          <div>
            <span className="text-lg sm:text-2xl font-black text-amber-700 dark:text-amber-300">
              {warningCount}
            </span>
            <p className="text-[11px] font-bold text-amber-600 dark:text-amber-400 font-malayalam leading-tight">
              കുറഞ്ഞ സ്റ്റോക്ക് (Low Stock)
            </p>
          </div>
        </div>

        <div className="p-3 sm:p-4 rounded-2xl bg-blue-50/80 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/50 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-100 dark:bg-blue-900/60 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
            <Info className="w-5 h-5" />
          </div>
          <div>
            <span className="text-lg sm:text-2xl font-black text-blue-700 dark:text-blue-300">
              {infoCount}
            </span>
            <p className="text-[11px] font-bold text-blue-600 dark:text-blue-400 font-malayalam leading-tight">
              മറ്റ് അറിയിപ്പുകൾ (Info)
            </p>
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
        {[
          { id: 'all', label: `എല്ലാം (${notifications.length})`, en: 'All' },
          { id: 'stock', label: `സ്റ്റോക്ക് അലേർട്ടുകൾ (${criticalCount + warningCount})`, en: 'Stock' },
          { id: 'batches', label: 'ബാച്ച് പ്രശ്നങ്ങൾ', en: 'Batches' },
          { id: 'recipes', label: 'റെസിപ്പികൾ', en: 'Recipes' },
          { id: 'security', label: 'സുരക്ഷ', en: 'Security' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setFilter(tab.id as NotificationFilter)}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all press-apple ${
              filter === tab.id
                ? 'bg-epso-red text-white dark:bg-amber-400 dark:text-stone-950 shadow-sm'
                : 'bg-white dark:bg-[#1E1B1B] text-stone-600 dark:text-stone-400 border border-stone-200 dark:border-[#2E2828] hover:bg-stone-50'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Notification List */}
      <div className="space-y-3">
        {filteredNotifications.length === 0 ? (
          <div className="p-12 text-center rounded-3xl bg-white dark:bg-[#1E1B1B] border border-stone-200 dark:border-[#2E2828]">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-3">
              <CheckCircle2 className="w-7 h-7" />
            </div>
            <h3 className="text-base font-bold text-stone-900 dark:text-white font-malayalam">
              നിലവിൽ പ്രശ്നങ്ങളോ മുന്നറിയിപ്പുകളോ ഇല്ല!
            </h3>
            <p className="text-xs text-stone-500 dark:text-stone-400 font-malayalam mt-1 max-w-sm mx-auto">
              എല്ലാ ചേരുവകളുടെയും സ്റ്റോക്ക് സുരക്ഷിത പരിധിയിലാണ്. ഉൽപ്പാദന ബാച്ചുകൾ സാധാരണ നിലയിൽ നടക്കുന്നു.
            </p>
          </div>
        ) : (
          filteredNotifications.map((n) => {
            const isCritical = n.severity === 'critical';
            const isWarning = n.severity === 'warning';

            return (
              <div
                key={n.id}
                className={`p-4 rounded-2xl transition-all border shadow-2xs ${
                  isCritical
                    ? 'bg-red-50/50 dark:bg-red-950/20 border-red-200 dark:border-red-900/40'
                    : isWarning
                    ? 'bg-amber-50/50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/40'
                    : 'bg-white dark:bg-[#1E1B1B] border-stone-200 dark:border-[#2E2828]'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
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
                      {n.type === 'critical_stock' && <AlertTriangle className="w-5 h-5" />}
                      {n.type === 'low_stock' && <TrendingDown className="w-5 h-5" />}
                      {n.type === 'recipe_missing' && <ScrollText className="w-5 h-5" />}
                      {n.type === 'batch_variance' && <AlertCircle className="w-5 h-5" />}
                      {n.type === 'security' && <ShieldAlert className="w-5 h-5" />}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-sm font-black text-stone-900 dark:text-white font-malayalam">
                          {n.titleMl}
                        </h4>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                            isCritical
                              ? 'bg-red-200 dark:bg-red-900/80 text-red-800 dark:text-red-200'
                              : isWarning
                              ? 'bg-amber-200 dark:bg-amber-900/80 text-amber-800 dark:text-amber-200'
                              : 'bg-stone-200 dark:bg-stone-800 text-stone-700 dark:text-stone-300'
                          }`}
                        >
                          {n.severity}
                        </span>
                      </div>

                      <p className="text-xs text-stone-600 dark:text-stone-300 font-malayalam mt-1">
                        {n.descriptionMl}
                      </p>

                      {/* Meta badge if stock */}
                      {n.meta && (
                        <div className="flex items-center gap-3 mt-2 text-[11px] font-bold">
                          <span className="text-stone-500">
                            നിലവിലെ സ്റ്റോക്ക്: <span className="text-stone-900 dark:text-white">{n.meta.current} {n.meta.unit}</span>
                          </span>
                          <span className="text-stone-500">
                            ആവശ്യമുള്ള കുറഞ്ഞ അളവ്: <span className="text-epso-red dark:text-amber-400">{n.meta.required} {n.meta.unit}</span>
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    {n.actionTab && (
                      <button
                        onClick={() => onNavigateTab(n.actionTab)}
                        className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold transition-all press-apple cursor-pointer ${
                          isCritical
                            ? 'bg-red-600 hover:bg-red-700 text-white shadow-xs'
                            : isWarning
                            ? 'bg-amber-600 hover:bg-amber-700 text-white shadow-xs'
                            : 'bg-stone-900 hover:bg-stone-800 dark:bg-white dark:text-stone-900 text-white'
                        }`}
                      >
                        <span className="font-malayalam">{n.actionLabelMl}</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    )}

                    <button
                      onClick={() => handleDismiss(n.id)}
                      className="text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 p-1 rounded-lg"
                      title="Dismiss notification"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
