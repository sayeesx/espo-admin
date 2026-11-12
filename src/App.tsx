// Canonical Domain Enforcement: redirect typo domain espo-admin.vercel.app to epso-admin.vercel.app
if (typeof window !== 'undefined' && window.location.hostname === 'espo-admin.vercel.app') {
  window.location.replace('https://epso-admin.vercel.app' + window.location.pathname + window.location.search + window.location.hash);
}

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAuth } from './context/AuthContext';
import { useFeedback } from './context/FeedbackContext';
import { PinGate } from './components/PinGate';
import { Header, AdminTab } from './components/Header';
import { MobileAppHeader } from './components/MobileAppHeader';
import { MobileBottomNav } from './components/MobileBottomNav';
import { DashboardView } from './components/DashboardView';
import { InsightsAdminView } from './components/InsightsAdminView';
import { NotificationsAdminView } from './components/NotificationsAdminView';
import { ProductsAdminView } from './components/ProductsAdminView';
import { IngredientsAdminView } from './components/IngredientsAdminView';
import { StockLedgerAdminView } from './components/StockLedgerAdminView';
import { ProductionPinModal } from './components/ProductionPinModal';
import { ProductionCostingAdminView } from './components/ProductionCostingAdminView';
import { LoadingSpinner } from './components/LoadingSpinner';
import { OfflineScreen } from './components/OfflineScreen';
import { SalesAdminView } from './components/SalesAdminView';
import { WagesAdminView } from './components/WagesAdminView';
import { AIAdminAssistant } from './components/AIAdminAssistant';
import { SettingsAdminView } from './components/SettingsAdminView';
import { InventoryStockAdminView } from './components/InventoryStockAdminView';
import { CompulsoryUpdateModal } from './components/CompulsoryUpdateModal';
import { useUpdateChecker } from './hooks/useUpdateChecker';
import {
  fetchProducts,
  fetchIngredients,
  fetchRecipes,
  fetchProductionRuns,
  fetchStockMovements,
  fetchAuditLogs,
  fetchDailyWage,
  fetchDailyWages,
  invalidateAdminCache,
  supabase,
} from './services/supabase';
import { Product, Ingredient, Recipe, ProductionRun, StockMovement, AuditLog } from './types';

const DISMISSED_NOTIFICATIONS_KEY = 'epso_admin_dismissed_notifications';
const ACTIVE_TAB_KEY = 'epso_admin_active_tab';

export const App: React.FC = () => {
  const { isAuthenticated } = useAuth();
  const { showToast } = useFeedback();
  const { hasUpdate, isUpdating, newVersion, applyUpdateAndClearCache, checkVersion } = useUpdateChecker();

  // Tab persistence: check URL parameter first, then localStorage, defaulting to 'dashboard'
  const getInitialTab = (): AdminTab => {
    try {
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get('tab') as AdminTab;
      const validTabs: AdminTab[] = [
        'dashboard',
        'inventory',
        'insights',
        'sales',
        'wages',
        'costing',
        'ai',
        'notifications',
        'products',
        'ingredients',
        'movements',
        'settings',
      ];
      if (tabParam && validTabs.includes(tabParam)) return tabParam;
      if (tabParam === ('recipes' as any)) return 'products';

      const savedTab = localStorage.getItem(ACTIVE_TAB_KEY) as AdminTab;
      if (savedTab && validTabs.includes(savedTab)) return savedTab;
      if (savedTab === ('recipes' as any)) return 'products';
    } catch {
      // fallback
    }
    return 'dashboard';
  };

  const [activeTab, setActiveTab] = useState<AdminTab>(getInitialTab);
  const [changingTab, setChangingTab] = useState<AdminTab | null>(null);
  const [costingNavKey, setCostingNavKey] = useState(0);
  const [ingredientsNavKey, setIngredientsNavKey] = useState(0);

  const handleTabChange = useCallback((newTab: AdminTab) => {
    checkVersion();
    if (newTab === 'ai') {
      setIsAIOpen(true);
    }
    if (newTab === 'costing') {
      setCostingNavKey((k) => k + 1);
      loadAllData(true);
    }
    if (newTab === 'ingredients') {
      setIngredientsNavKey((k) => k + 1);
    }
    setChangingTab(newTab);
    setTimeout(() => {
      setActiveTab(newTab);
      setChangingTab(null);
    }, 150);

    try {
      localStorage.setItem(ACTIVE_TAB_KEY, newTab);
      localStorage.removeItem('epso_admin_costing_selected_product_id');
      localStorage.setItem('epso_admin_ingredients_active_subtab', 'ingredients');
      localStorage.removeItem('epso_admin_selected_ingredient_id');
      const url = new URL(window.location.href);
      url.searchParams.delete('productId');
      url.searchParams.delete('subtab');
      url.searchParams.delete('ingredientId');
      if (url.searchParams.get('tab') !== newTab || newTab === 'costing' || newTab === 'ingredients') {
        url.searchParams.set('tab', newTab);
        window.history.pushState({ tab: newTab }, '', url.toString());
      }
    } catch {
      // ignore
    }
  }, []);

  // Guarantee activeTab is mirrored in URL searchParams and localStorage at all times
  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      let urlChanged = false;
      if (activeTab !== 'costing' && url.searchParams.has('productId')) {
        url.searchParams.delete('productId');
        urlChanged = true;
      }
      if (activeTab !== 'ingredients') {
        if (url.searchParams.has('subtab')) {
          url.searchParams.delete('subtab');
          urlChanged = true;
        }
        if (url.searchParams.has('ingredientId')) {
          url.searchParams.delete('ingredientId');
          urlChanged = true;
        }
        localStorage.setItem('epso_admin_ingredients_active_subtab', 'ingredients');
        localStorage.removeItem('epso_admin_selected_ingredient_id');
      }
      if (url.searchParams.get('tab') !== activeTab || urlChanged) {
        url.searchParams.set('tab', activeTab);
        window.history.replaceState({ tab: activeTab }, '', url.toString());
      }
      localStorage.setItem(ACTIVE_TAB_KEY, activeTab);
    } catch {
      // ignore
    }
  }, [activeTab]);

  // Browser Back/Forward navigation support so user stays in the right tab
  useEffect(() => {
    const handlePopState = () => {
      try {
        const params = new URLSearchParams(window.location.search);
        const tabParam = params.get('tab') as AdminTab;
        const validTabs: AdminTab[] = [
          'dashboard',
          'inventory',
          'insights',
          'sales',
          'wages',
          'costing',
          'ai',
          'notifications',
          'products',
          'ingredients',
          'movements',
          'settings',
        ];
        if (tabParam && validTabs.includes(tabParam)) {
          setActiveTab(tabParam);
          localStorage.setItem(ACTIVE_TAB_KEY, tabParam);
        } else {
          const savedTab = localStorage.getItem(ACTIVE_TAB_KEY) as AdminTab;
          if (savedTab && validTabs.includes(savedTab)) {
            setActiveTab(savedTab);
          } else {
            setActiveTab('dashboard');
            localStorage.setItem(ACTIVE_TAB_KEY, 'dashboard');
          }
        }
      } catch {
        // ignore
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const [products, setProducts] = useState<Product[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [productionRuns, setProductionRuns] = useState<ProductionRun[]>([]);
  const [stockMovements, setStockMovements] = useState<StockMovement[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [dailyWages, setDailyWages] = useState<any[]>([]);

  const [isInitialLoading, setIsInitialLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [isPinModalOpen, setIsPinModalOpen] = useState<boolean>(false);
  const [isAIOpen, setIsAIOpen] = useState<boolean>(false);
  const [isTodayWageAdded, setIsTodayWageAdded] = useState<boolean>(true);

  // Persistent dismissed notification IDs
  const [dismissedNotificationIds, setDismissedNotificationIds] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(DISMISSED_NOTIFICATIONS_KEY);
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch {
      return new Set();
    }
  });

  const handleDismissNotification = useCallback((id: string) => {
    setDismissedNotificationIds((prev) => {
      const next = new Set(prev).add(id);
      try {
        localStorage.setItem(DISMISSED_NOTIFICATIONS_KEY, JSON.stringify(Array.from(next)));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  const handleDismissAllNotifications = useCallback((ids: string[]) => {
    setDismissedNotificationIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.add(id));
      try {
        localStorage.setItem(DISMISSED_NOTIFICATIONS_KEY, JSON.stringify(Array.from(next)));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  const handleRestoreNotifications = useCallback(() => {
    setDismissedNotificationIds(new Set());
    try {
      localStorage.removeItem(DISMISSED_NOTIFICATIONS_KEY);
    } catch {
      // ignore
    }
  }, []);

  const loadAllData = useCallback(async (force = false) => {
    setIsRefreshing(true);
    if (force) {
      invalidateAdminCache();
    }
    try {
      const todayStr = new Date().toISOString().split('T')[0];
      const [
        productsRes,
        ingredientsRes,
        recipesRes,
        runsRes,
        movementsRes,
        logsRes,
        todayWageRes,
        dailyWagesRes,
      ] = await Promise.allSettled([
        fetchProducts(force),
        fetchIngredients(force),
        fetchRecipes(force),
        fetchProductionRuns(force),
        fetchStockMovements(force),
        fetchAuditLogs(force),
        fetchDailyWage(todayStr),
        fetchDailyWages(90, force),
      ]);

      if (productsRes.status === 'fulfilled') setProducts(productsRes.value);
      if (ingredientsRes.status === 'fulfilled') setIngredients(ingredientsRes.value);
      if (recipesRes.status === 'fulfilled') setRecipes(recipesRes.value);
      if (runsRes.status === 'fulfilled') setProductionRuns(runsRes.value);
      if (movementsRes.status === 'fulfilled') setStockMovements(movementsRes.value);
      if (logsRes.status === 'fulfilled') setAuditLogs(logsRes.value);
      if (dailyWagesRes.status === 'fulfilled') setDailyWages(dailyWagesRes.value);
      if (todayWageRes.status === 'fulfilled') {
        const tw = todayWageRes.value;
        setIsTodayWageAdded(Boolean(tw && tw.totalWageBudget > 0));
      } else {
        setIsTodayWageAdded(false);
      }
    } catch (err) {
      console.error('Failed to load admin dataset from Supabase:', err);
    } finally {
      setIsInitialLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  const handleForceRefresh = useCallback(() => loadAllData(true), [loadAllData]);

  // Tab-specific targeted refresh states and handlers to avoid reloading the entire application.
  // Use a ref guard so callbacks stay identity-stable and tab effects never loop infinitely.
  const [tabRefreshing, setTabRefreshing] = useState<Record<string, boolean>>({});
  const tabRefreshingRef = useRef<Record<string, boolean>>({});

  const runTabRefresh = useCallback(async (tabKey: string, task: () => Promise<void>) => {
    if (tabRefreshingRef.current[tabKey]) return;
    tabRefreshingRef.current[tabKey] = true;
    setTabRefreshing((prev) => ({ ...prev, [tabKey]: true }));
    try {
      await task();
    } finally {
      tabRefreshingRef.current[tabKey] = false;
      setTabRefreshing((prev) => ({ ...prev, [tabKey]: false }));
    }
  }, []);

  const refreshDashboardData = useCallback(() => runTabRefresh('dashboard', async () => {
    invalidateAdminCache('admin_products');
    invalidateAdminCache('admin_ingredients');
    invalidateAdminCache('admin_production_runs');
    invalidateAdminCache('daily_wages');
    const todayStr = new Date().toISOString().split('T')[0];
    const [pRes, iRes, rRes, wRes, twRes] = await Promise.allSettled([
      fetchProducts(true),
      fetchIngredients(true),
      fetchProductionRuns(true),
      fetchDailyWages(90, true),
      fetchDailyWage(todayStr),
    ]);
    if (pRes.status === 'fulfilled') setProducts(pRes.value);
    if (iRes.status === 'fulfilled') setIngredients(iRes.value);
    if (rRes.status === 'fulfilled') setProductionRuns(rRes.value);
    if (wRes.status === 'fulfilled') setDailyWages(wRes.value);
    if (twRes.status === 'fulfilled') {
      const tw = twRes.value;
      setIsTodayWageAdded(Boolean(tw && tw.totalWageBudget > 0));
    }
  }), [runTabRefresh]);

  const refreshInventoryData = useCallback(() => runTabRefresh('inventory', async () => {
    invalidateAdminCache('admin_products');
    invalidateAdminCache('admin_production_runs');
    const [pRes, rRes] = await Promise.allSettled([
      fetchProducts(true),
      fetchProductionRuns(true),
    ]);
    if (pRes.status === 'fulfilled') setProducts(pRes.value);
    if (rRes.status === 'fulfilled') setProductionRuns(rRes.value);
  }), [runTabRefresh]);

  const refreshInsightsData = useCallback(() => runTabRefresh('insights', async () => {
    invalidateAdminCache('admin_products');
    invalidateAdminCache('admin_ingredients');
    invalidateAdminCache('admin_production_runs');
    invalidateAdminCache('admin_stock_movements');
    const [pRes, iRes, rRes, mRes] = await Promise.allSettled([
      fetchProducts(true),
      fetchIngredients(true),
      fetchProductionRuns(true),
      fetchStockMovements(true),
    ]);
    if (pRes.status === 'fulfilled') setProducts(pRes.value);
    if (iRes.status === 'fulfilled') setIngredients(iRes.value);
    if (rRes.status === 'fulfilled') setProductionRuns(rRes.value);
    if (mRes.status === 'fulfilled') setStockMovements(mRes.value);
  }), [runTabRefresh]);

  const refreshSalesData = useCallback(() => runTabRefresh('sales', async () => {
    invalidateAdminCache('admin_products');
    invalidateAdminCache('sales');
    const pRes = await fetchProducts(true);
    setProducts(pRes);
  }), [runTabRefresh]);

  const refreshWagesData = useCallback(() => runTabRefresh('wages', async () => {
    invalidateAdminCache('admin_production_runs');
    invalidateAdminCache('daily_wages');
    const todayStr = new Date().toISOString().split('T')[0];
    const [rRes, wRes, twRes] = await Promise.allSettled([
      fetchProductionRuns(true),
      fetchDailyWages(90, true),
      fetchDailyWage(todayStr),
    ]);
    if (rRes.status === 'fulfilled') setProductionRuns(rRes.value);
    if (wRes.status === 'fulfilled') setDailyWages(wRes.value);
    if (twRes.status === 'fulfilled') {
      const tw = twRes.value;
      setIsTodayWageAdded(Boolean(tw && tw.totalWageBudget > 0));
    }
  }), [runTabRefresh]);

  const refreshCostingData = useCallback(() => runTabRefresh('costing', async () => {
    invalidateAdminCache('admin_products');
    invalidateAdminCache('admin_ingredients');
    invalidateAdminCache('admin_production_runs');
    invalidateAdminCache('admin_stock_movements');
    invalidateAdminCache('admin_daily_closings');
    invalidateAdminCache('admin_daily_wages');
    invalidateAdminCache('admin_packing_records');
    invalidateAdminCache('admin_packet_types');
    invalidateAdminCache('admin_selling_prices');
    const [pRes, iRes, rRes, mRes, wRes] = await Promise.allSettled([
      fetchProducts(true),
      fetchIngredients(true),
      fetchProductionRuns(true),
      fetchStockMovements(true),
      fetchDailyWages(90, true),
    ]);
    if (pRes.status === 'fulfilled') setProducts(pRes.value);
    if (iRes.status === 'fulfilled') setIngredients(iRes.value);
    if (rRes.status === 'fulfilled') setProductionRuns(rRes.value);
    if (mRes.status === 'fulfilled') setStockMovements(mRes.value);
    if (wRes.status === 'fulfilled') setDailyWages(wRes.value);
  }), [runTabRefresh]);

  const refreshNotificationsData = useCallback(() => runTabRefresh('notifications', async () => {
    invalidateAdminCache('admin_audit_logs');
    invalidateAdminCache('admin_ingredients');
    invalidateAdminCache('admin_products');
    invalidateAdminCache('admin_production_runs');
    const [lRes, iRes, pRes, rRes] = await Promise.allSettled([
      fetchAuditLogs(true),
      fetchIngredients(true),
      fetchProducts(true),
      fetchProductionRuns(true),
    ]);
    if (lRes.status === 'fulfilled') setAuditLogs(lRes.value);
    if (iRes.status === 'fulfilled') setIngredients(iRes.value);
    if (pRes.status === 'fulfilled') setProducts(pRes.value);
    if (rRes.status === 'fulfilled') setProductionRuns(rRes.value);
  }), [runTabRefresh]);

  const refreshProductsData = useCallback(() => runTabRefresh('products', async () => {
    invalidateAdminCache('admin_products');
    invalidateAdminCache('admin_recipes');
    const [pRes, rRes] = await Promise.allSettled([
      fetchProducts(true),
      fetchRecipes(true),
    ]);
    if (pRes.status === 'fulfilled') setProducts(pRes.value);
    if (rRes.status === 'fulfilled') setRecipes(rRes.value);
  }), [runTabRefresh]);

  const refreshIngredientsData = useCallback(() => runTabRefresh('ingredients', async () => {
    invalidateAdminCache('admin_ingredients');
    invalidateAdminCache('admin_stock_movements');
    const [iRes, mRes] = await Promise.allSettled([
      fetchIngredients(true),
      fetchStockMovements(true),
    ]);
    if (iRes.status === 'fulfilled') setIngredients(iRes.value);
    if (mRes.status === 'fulfilled') setStockMovements(mRes.value);
  }), [runTabRefresh]);

  const refreshMovementsData = useCallback(() => runTabRefresh('movements', async () => {
    invalidateAdminCache('admin_stock_movements');
    invalidateAdminCache('admin_production_runs');
    invalidateAdminCache('admin_ingredients');
    invalidateAdminCache('daily_wages');
    const [mRes, rRes, iRes, wRes] = await Promise.allSettled([
      fetchStockMovements(true),
      fetchProductionRuns(true),
      fetchIngredients(true),
      fetchDailyWages(90, true),
    ]);
    if (mRes.status === 'fulfilled') setStockMovements(mRes.value);
    if (rRes.status === 'fulfilled') setProductionRuns(rRes.value);
    if (iRes.status === 'fulfilled') setIngredients(iRes.value);
    if (wRes.status === 'fulfilled') setDailyWages(wRes.value);
  }), [runTabRefresh]);

  const refreshSettingsData = useCallback(() => runTabRefresh('settings', async () => {
    invalidateAdminCache();
    const todayStr = new Date().toISOString().split('T')[0];
    const [pRes, iRes, recRes, rRes, mRes, lRes, wRes, twRes] = await Promise.allSettled([
      fetchProducts(true),
      fetchIngredients(true),
      fetchRecipes(true),
      fetchProductionRuns(true),
      fetchStockMovements(true),
      fetchAuditLogs(true),
      fetchDailyWages(90, true),
      fetchDailyWage(todayStr),
    ]);
    if (pRes.status === 'fulfilled') setProducts(pRes.value);
    if (iRes.status === 'fulfilled') setIngredients(iRes.value);
    if (recRes.status === 'fulfilled') setRecipes(recRes.value);
    if (rRes.status === 'fulfilled') setProductionRuns(rRes.value);
    if (mRes.status === 'fulfilled') setStockMovements(mRes.value);
    if (lRes.status === 'fulfilled') setAuditLogs(lRes.value);
    if (wRes.status === 'fulfilled') setDailyWages(wRes.value);
    if (twRes.status === 'fulfilled') {
      const tw = twRes.value;
      setIsTodayWageAdded(Boolean(tw && tw.totalWageBudget > 0));
    } else {
      setIsTodayWageAdded(false);
    }
  }), [runTabRefresh]);

  // Auto-refresh fresh data from Supabase when navigating to specific data views
  useEffect(() => {
    if (!isAuthenticated) return;
    if (activeTab === 'ingredients') {
      refreshIngredientsData();
    } else if (activeTab === 'movements') {
      refreshMovementsData();
    } else if (activeTab === 'products') {
      refreshProductsData();
    }
  }, [activeTab, isAuthenticated, refreshIngredientsData, refreshMovementsData, refreshProductsData]);

  // Supabase Realtime for live production updates, inventory changes, and live order notifications
  useEffect(() => {
    if (!isAuthenticated) return;

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const debouncedSync = (type: 'production' | 'inventory') => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(async () => {
        if (type === 'production') {
          invalidateAdminCache('admin_production_runs');
          invalidateAdminCache('admin_ingredients');
          invalidateAdminCache('admin_products');
          invalidateAdminCache('admin_stock_movements');
          const [runs, ings, prods, movs] = await Promise.all([
            fetchProductionRuns(true).catch(() => null),
            fetchIngredients(true).catch(() => null),
            fetchProducts(true).catch(() => null),
            fetchStockMovements(true).catch(() => null),
          ]);
          if (runs) setProductionRuns(runs);
          if (ings) setIngredients(ings);
          if (prods) setProducts(prods);
          if (movs) setStockMovements(movs);
        } else if (type === 'inventory') {
          invalidateAdminCache('admin_ingredients');
          invalidateAdminCache('admin_products');
          invalidateAdminCache('admin_stock_movements');
          const [ings, prods, movs] = await Promise.all([
            fetchIngredients(true).catch(() => null),
            fetchProducts(true).catch(() => null),
            fetchStockMovements(true).catch(() => null),
          ]);
          if (ings) setIngredients(ings);
          if (prods) setProducts(prods);
          if (movs) setStockMovements(movs);
        }
      }, 400);
    };

    const channel = supabase
      .channel('admin-core-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'production_runs' },
        () => {
          debouncedSync('production');
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'stock_movements' },
        () => {
          debouncedSync('inventory');
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'ingredients' },
        () => {
          debouncedSync('inventory');
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'products' },
        () => {
          debouncedSync('inventory');
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'daily_wages' },
        () => {
          invalidateAdminCache('daily_wages');
          fetchDailyWages(90, true).then(setDailyWages).catch(() => {});
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'audit_logs' },
        (payload: any) => {
          if (typeof payload?.new?.action === 'string' && payload.new.action.startsWith('RESET_')) {
            debouncedSync('production');
            invalidateAdminCache();
            fetchDailyWages(90, true).then(setDailyWages).catch(() => {});
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'sales' },
        (payload: any) => {
          const newOrder = payload?.new;
          const invoice = newOrder?.invoice_number || 'Sale';
          const amount = newOrder?.grand_total || newOrder?.total_amount || 0;
          showToast(`പുതിയ ഓർഡർ ലഭിച്ചു! (#${invoice} - ₹${amount})`, 'info');
        }
      )
      .subscribe();

    // Periodic refresh for non-realtime datasets (dashboard statistics, reports, ledger)
    // Avoids exceeding Supabase Free Plan limits while keeping background stats and ledger fresh
    const periodicTimer = setInterval(() => {
      fetchStockMovements(true).then((m) => setStockMovements(m)).catch(() => {});
      const todayStr = new Date().toISOString().split('T')[0];
      fetchDailyWage(todayStr).then((tw) => {
        setIsTodayWageAdded(Boolean(tw && tw.totalWageBudget > 0));
      }).catch(() => {});
    }, 90000);

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      clearInterval(periodicTimer);
      supabase.removeChannel(channel);
    };
  }, [isAuthenticated, showToast]);

  useEffect(() => {
    if (isAuthenticated) {
      loadAllData();
    }
  }, [isAuthenticated, loadAllData]);

  // Real-time calculation of pending alerts for notification badges (excluding dismissed alerts)
  const notificationCount = useMemo(() => {
    let count = 0;
    ingredients.forEach((i) => {
      if (i.isActive) {
        if (i.currentStock <= 0 && !dismissedNotificationIds.has(`stock-zero-${i.id}`)) {
          count++;
        } else if (i.minStock > 0 && i.currentStock <= i.minStock && !dismissedNotificationIds.has(`stock-low-${i.id}`)) {
          count++;
        }
      }
    });

    products.forEach((p) => {
      if (p.isActive && !p.recipeId && !dismissedNotificationIds.has(`recipe-missing-${p.id}`)) {
        count++;
      }
    });

    productionRuns.slice(0, 15).forEach((run) => {
      if (run.status === 'cancelled' && !dismissedNotificationIds.has(`batch-cancel-${run.id}`)) {
        count++;
      } else if (
        run.plannedQuantity > 0 &&
        run.actualQuantity < run.plannedQuantity * 0.85 &&
        !dismissedNotificationIds.has(`batch-short-${run.id}`)
      ) {
        count++;
      }
    });

    return count;
  }, [ingredients, products, productionRuns, dismissedNotificationIds]);

  const [isOffline, setIsOffline] = useState<boolean>(!navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (isOffline) {
    return <OfflineScreen onRetry={() => window.location.reload()} />;
  }

  if (!isAuthenticated) {
    return (
      <>
        <PinGate />
        <CompulsoryUpdateModal
          isOpen={hasUpdate}
          isUpdating={isUpdating}
          newVersion={newVersion}
          onUpdate={applyUpdateAndClearCache}
        />
      </>
    );
  }

  return (
    <div className="min-h-screen min-h-[100dvh] bg-[#F8F9FA] dark:bg-[#141212] text-[#141212] dark:text-[#FFFFFF] transition-colors pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))] md:pb-12">
      {/* Google Theme Linear Progress Loader across all navigation and data refreshes */}
      {(isRefreshing || changingTab !== null) && (
        <div className="fixed top-0 inset-x-0 z-50 h-[3px] bg-stone-200/50 dark:bg-stone-800/50 overflow-hidden pointer-events-none">
          <div className="google-linear-progress w-full h-full" />
        </div>
      )}

      {/* Mobile Top App Header */}
      <MobileAppHeader
        activeTab={activeTab}
        onTabChange={handleTabChange}
        onRefresh={loadAllData}
        isRefreshing={isRefreshing}
        notificationCount={notificationCount}
        onOpenPinModal={() => setIsPinModalOpen(true)}
        changingTab={changingTab}
        isTodayWagePending={!isTodayWageAdded}
      />

      {/* Desktop Vertical Sidebar */}
      <Header
        activeTab={activeTab}
        onTabChange={handleTabChange}
        onRefresh={loadAllData}
        isRefreshing={isRefreshing}
        notificationCount={notificationCount}
        onOpenPinModal={() => setIsPinModalOpen(true)}
        changingTab={changingTab}
        isTodayWagePending={!isTodayWageAdded}
      />

      {/* Main Content Area with Desktop Sidebar Offset */}
      <div className="md:pl-64 transition-all">
        <main className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 xl:px-10 pt-4 md:pt-6 pb-20">
          {isInitialLoading ? (
            <div className="min-h-[60vh] flex flex-col items-center justify-center">
              <LoadingSpinner size="lg" label="ഡാറ്റാബേസിൽ നിന്ന് വിവരങ്ങൾ ശേഖരിക്കുന്നു..." />
            </div>
          ) : (
            <>
              {activeTab === 'dashboard' && (
                <DashboardView
                  products={products}
                  ingredients={ingredients}
                  productionRuns={productionRuns}
                  onNavigateTab={handleTabChange}
                  onRefresh={refreshDashboardData}
                  isRefreshing={tabRefreshing['dashboard']}
                  onOpenAI={() => setIsAIOpen(true)}
                  isTodayWagePending={!isTodayWageAdded}
                />
              )}

              {activeTab === 'inventory' && (
                <InventoryStockAdminView
                  products={products}
                  productionRuns={productionRuns}
                  onRefresh={refreshInventoryData}
                />
              )}

              {activeTab === 'insights' && (
                <InsightsAdminView
                  products={products}
                  ingredients={ingredients}
                  productionRuns={productionRuns}
                  stockMovements={stockMovements}
                  onNavigateTab={handleTabChange}
                  onRefresh={refreshInsightsData}
                />
              )}

              {activeTab === 'sales' && (
                <SalesAdminView
                  products={products}
                  onRefresh={refreshSalesData}
                />
              )}

              {activeTab === 'wages' && (
                <WagesAdminView
                  productionRuns={productionRuns}
                  onRefresh={refreshWagesData}
                />
              )}

              {activeTab === 'costing' && (
                <ProductionCostingAdminView
                  key={costingNavKey}
                  products={products}
                  ingredients={ingredients}
                  productionRuns={productionRuns}
                  stockMovements={stockMovements}
                  onRefresh={refreshCostingData}
                />
              )}

              {activeTab === 'notifications' && (
                <NotificationsAdminView
                  ingredients={ingredients}
                  products={products}
                  productionRuns={productionRuns}
                  auditLogs={auditLogs}
                  dismissedIds={dismissedNotificationIds}
                  onDismiss={handleDismissNotification}
                  onDismissAll={handleDismissAllNotifications}
                  onRestore={handleRestoreNotifications}
                  onNavigateTab={handleTabChange}
                  onRefresh={refreshNotificationsData}
                />
              )}

              {activeTab === 'ai' && (
                <DashboardView
                  products={products}
                  ingredients={ingredients}
                  productionRuns={productionRuns}
                  onNavigateTab={handleTabChange}
                  onRefresh={refreshDashboardData}
                  isRefreshing={tabRefreshing['dashboard']}
                />
              )}

              {activeTab === 'products' && (
                <ProductsAdminView
                  products={products}
                  ingredients={ingredients}
                  recipes={recipes}
                  onRefresh={refreshProductsData}
                />
              )}

              {activeTab === 'ingredients' && (
                <IngredientsAdminView
                  key={ingredientsNavKey}
                  ingredients={ingredients}
                  products={products}
                  stockMovements={stockMovements}
                  onRefresh={refreshIngredientsData}
                />
              )}

              {activeTab === 'movements' && (
                <StockLedgerAdminView
                  products={products}
                  wages={dailyWages}
                  movements={stockMovements}
                  ingredients={ingredients}
                  productionRuns={productionRuns}
                  onRefresh={refreshMovementsData}
                />
              )}

              {activeTab === 'settings' && (
                <SettingsAdminView
                  products={products}
                  ingredients={ingredients}
                  productionRuns={productionRuns}
                  stockMovements={stockMovements}
                  onRefresh={refreshSettingsData}
                />
              )}
            </>
          )}
        </main>
      </div>

      {/* Mobile PWA Bottom Navigation Bar */}
      <MobileBottomNav
        activeTab={activeTab}
        onTabChange={handleTabChange}
        notificationCount={notificationCount}
        changingTab={changingTab}
      />

      {/* Floating AI Assistant Chat Bot Widget in Left Corner */}
      <AIAdminAssistant
        products={products}
        ingredients={ingredients}
        productionRuns={productionRuns}
        stockMovements={stockMovements}
        recipes={recipes}
        onRefresh={loadAllData}
        isOpen={isAIOpen || activeTab === 'ai'}
        onToggle={() => {
          setIsAIOpen((prev) => !prev);
          if (activeTab === 'ai') {
            setActiveTab('dashboard');
          }
        }}
      />

      {/* Production PIN Configuration Modal */}
      <ProductionPinModal
        isOpen={isPinModalOpen}
        onClose={() => setIsPinModalOpen(false)}
      />

      {/* Compulsory Immediate Update Modal for New Deployments (Without Shadows) */}
      <CompulsoryUpdateModal
        isOpen={hasUpdate}
        isUpdating={isUpdating}
        newVersion={newVersion}
        onUpdate={applyUpdateAndClearCache}
      />
    </div>
  );
};
