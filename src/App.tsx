import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from './context/AuthContext';
import { PinGate } from './components/PinGate';
import { Header, AdminTab } from './components/Header';
import { MobileAppHeader } from './components/MobileAppHeader';
import { MobileBottomNav } from './components/MobileBottomNav';
import { DashboardView } from './components/DashboardView';
import { InsightsAdminView } from './components/InsightsAdminView';
import { NotificationsAdminView } from './components/NotificationsAdminView';
import { ProductsAdminView } from './components/ProductsAdminView';
import { IngredientsAdminView } from './components/IngredientsAdminView';
import { RecipesAdminView } from './components/RecipesAdminView';
import { StockLedgerAdminView } from './components/StockLedgerAdminView';
import { ProductionPinModal } from './components/ProductionPinModal';
import { ProductionCostingAdminView } from './components/ProductionCostingAdminView';
import { LoadingSpinner } from './components/LoadingSpinner';
import { OfflineScreen } from './components/OfflineScreen';
import { SalesAdminView } from './components/SalesAdminView';
import { WagesAdminView } from './components/WagesAdminView';
import {
  fetchProducts,
  fetchIngredients,
  fetchRecipes,
  fetchProductionRuns,
  fetchStockMovements,
  fetchAuditLogs,
} from './services/supabase';
import { Product, Ingredient, Recipe, ProductionRun, StockMovement, AuditLog } from './types';

const DISMISSED_NOTIFICATIONS_KEY = 'epso_admin_dismissed_notifications';
const ACTIVE_TAB_KEY = 'epso_admin_active_tab';

export const App: React.FC = () => {
  const { isAuthenticated } = useAuth();

  // Tab persistence: check URL parameter first, then localStorage, defaulting to 'dashboard'
  const getInitialTab = (): AdminTab => {
    try {
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get('tab') as AdminTab;
      const validTabs: AdminTab[] = [
        'dashboard',
        'insights',
        'sales',
        'wages',
        'costing',
        'notifications',
        'products',
        'ingredients',
        'recipes',
        'movements',
      ];
      if (tabParam && validTabs.includes(tabParam)) return tabParam;

      const savedTab = localStorage.getItem(ACTIVE_TAB_KEY) as AdminTab;
      if (savedTab && validTabs.includes(savedTab)) return savedTab;
    } catch {
      // fallback
    }
    return 'dashboard';
  };

  const [activeTab, setActiveTab] = useState<AdminTab>(getInitialTab);

  const handleTabChange = useCallback((newTab: AdminTab) => {
    setActiveTab(newTab);
    try {
      localStorage.setItem(ACTIVE_TAB_KEY, newTab);
      const url = new URL(window.location.href);
      url.searchParams.set('tab', newTab);
      window.history.replaceState({}, '', url.toString());
    } catch {
      // ignore
    }
  }, []);

  const [products, setProducts] = useState<Product[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [productionRuns, setProductionRuns] = useState<ProductionRun[]>([]);
  const [stockMovements, setStockMovements] = useState<StockMovement[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

  const [isInitialLoading, setIsInitialLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [isPinModalOpen, setIsPinModalOpen] = useState<boolean>(false);

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

  const loadAllData = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const [
        productsRes,
        ingredientsRes,
        recipesRes,
        runsRes,
        movementsRes,
        logsRes,
      ] = await Promise.allSettled([
        fetchProducts(),
        fetchIngredients(),
        fetchRecipes(),
        fetchProductionRuns(),
        fetchStockMovements(),
        fetchAuditLogs(),
      ]);

      if (productsRes.status === 'fulfilled') setProducts(productsRes.value);
      if (ingredientsRes.status === 'fulfilled') setIngredients(ingredientsRes.value);
      if (recipesRes.status === 'fulfilled') setRecipes(recipesRes.value);
      if (runsRes.status === 'fulfilled') setProductionRuns(runsRes.value);
      if (movementsRes.status === 'fulfilled') setStockMovements(movementsRes.value);
      if (logsRes.status === 'fulfilled') setAuditLogs(logsRes.value);
    } catch (err) {
      console.error('Failed to load admin dataset from Supabase:', err);
    } finally {
      setIsInitialLoading(false);
      setIsRefreshing(false);
    }
  }, []);

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
    return <PinGate />;
  }

  return (
    <div className="min-h-screen bg-[#F8F9FA] dark:bg-[#141212] text-[#141212] dark:text-[#FFFFFF] transition-colors pb-16 md:pb-12">
      {/* Mobile Top App Header */}
      <MobileAppHeader
        activeTab={activeTab}
        onTabChange={handleTabChange}
        onRefresh={loadAllData}
        isRefreshing={isRefreshing}
        notificationCount={notificationCount}
        onOpenPinModal={() => setIsPinModalOpen(true)}
      />

      {/* Desktop Vertical Sidebar */}
      <Header
        activeTab={activeTab}
        onTabChange={handleTabChange}
        onRefresh={loadAllData}
        isRefreshing={isRefreshing}
        notificationCount={notificationCount}
        onOpenPinModal={() => setIsPinModalOpen(true)}
      />

      {/* Main Content Area with Desktop Sidebar Offset */}
      <div className="md:pl-56 lg:pl-60 transition-all">
        <main className="max-w-7xl mx-auto px-4 sm:px-6 pt-4 md:pt-6">
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
                  onRefresh={loadAllData}
                />
              )}

              {activeTab === 'insights' && (
                <InsightsAdminView
                  products={products}
                  ingredients={ingredients}
                  productionRuns={productionRuns}
                  stockMovements={stockMovements}
                  onNavigateTab={handleTabChange}
                />
              )}

              {activeTab === 'sales' && (
                <SalesAdminView
                  products={products}
                />
              )}

              {activeTab === 'wages' && (
                <WagesAdminView
                  onRefresh={loadAllData}
                />
              )}

              {activeTab === 'costing' && (
                <ProductionCostingAdminView
                  products={products}
                  ingredients={ingredients}
                  productionRuns={productionRuns}
                  stockMovements={stockMovements}
                  onRefresh={loadAllData}
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
                  onRefresh={loadAllData}
                />
              )}

              {activeTab === 'products' && (
                <ProductsAdminView
                  products={products}
                  ingredients={ingredients}
                  recipes={recipes}
                  onRefresh={loadAllData}
                />
              )}

              {activeTab === 'ingredients' && (
                <IngredientsAdminView
                  ingredients={ingredients}
                  stockMovements={stockMovements}
                  onRefresh={loadAllData}
                />
              )}

              {activeTab === 'recipes' && (
                <RecipesAdminView
                  recipes={recipes}
                  products={products}
                  ingredients={ingredients}
                  onRefresh={loadAllData}
                />
              )}

              {activeTab === 'movements' && (
                <StockLedgerAdminView
                  movements={stockMovements}
                  ingredients={ingredients}
                  onRefresh={loadAllData}
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
      />

      {/* Production PIN Configuration Modal */}
      <ProductionPinModal
        isOpen={isPinModalOpen}
        onClose={() => setIsPinModalOpen(false)}
      />
    </div>
  );
};
