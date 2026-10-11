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
import {
  fetchProducts,
  fetchIngredients,
  fetchRecipes,
  fetchProductionRuns,
  fetchStockMovements,
  fetchAuditLogs,
} from './services/supabase';
import { Product, Ingredient, Recipe, ProductionRun, StockMovement, AuditLog } from './types';

export const App: React.FC = () => {
  const { isAuthenticated } = useAuth();
  const [activeTab, setActiveTab] = useState<AdminTab>('dashboard');

  const [products, setProducts] = useState<Product[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [productionRuns, setProductionRuns] = useState<ProductionRun[]>([]);
  const [stockMovements, setStockMovements] = useState<StockMovement[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

  const [isInitialLoading, setIsInitialLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

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

  // Real-time calculation of pending alerts for notification badges
  const notificationCount = useMemo(() => {
    let count = 0;
    ingredients.forEach((i) => {
      if (i.isActive && (i.currentStock <= 0 || (i.minStock > 0 && i.currentStock <= i.minStock))) {
        count++;
      }
    });
    products.forEach((p) => {
      if (p.isActive && !p.recipeId) {
        count++;
      }
    });
    return count;
  }, [ingredients, products]);

  if (!isAuthenticated) {
    return <PinGate />;
  }

  return (
    <div className="min-h-screen bg-[#F8F9FA] dark:bg-[#141212] text-[#141212] dark:text-[#FFFFFF] transition-colors pb-16 md:pb-12">
      {/* Mobile Top App Header */}
      <MobileAppHeader
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onRefresh={loadAllData}
        isRefreshing={isRefreshing}
        notificationCount={notificationCount}
      />

      {/* Desktop Vertical Sidebar */}
      <Header
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onRefresh={loadAllData}
        isRefreshing={isRefreshing}
        notificationCount={notificationCount}
      />

      {/* Main Content Area with Desktop Sidebar Offset */}
      <div className="md:pl-64 lg:pl-72 transition-all">
        <main className="max-w-7xl mx-auto px-4 sm:px-6 pt-4 md:pt-6">
          {isInitialLoading ? (
            <div className="min-h-[60vh] flex flex-col items-center justify-center">
              {/* Custom Brand Flame Swirl Vortex Loader */}
              <div className="relative w-14 h-14 flex items-center justify-center">
                <div className="absolute inset-0 rounded-full border-2 border-epso-red/20 dark:border-amber-400/20" />
                <div className="w-12 h-12 rounded-full border-3 border-transparent border-t-epso-red border-r-epso-amber animate-epso-spin" />
                <img
                  src="/favicon.png"
                  alt="Loading"
                  className="w-6 h-6 object-contain animate-epso-pulse"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />
              </div>
              <p className="mt-4 text-xs font-semibold text-stone-500 dark:text-stone-400 font-malayalam">
                ഡാറ്റാബേസിൽ നിന്ന് വിവരങ്ങൾ ശേഖരിക്കുന്നു...
              </p>
            </div>
          ) : (
            <>
              {activeTab === 'dashboard' && (
                <DashboardView
                  products={products}
                  ingredients={ingredients}
                  productionRuns={productionRuns}
                  onNavigateTab={setActiveTab}
                />
              )}

              {activeTab === 'insights' && (
                <InsightsAdminView
                  products={products}
                  ingredients={ingredients}
                  productionRuns={productionRuns}
                  stockMovements={stockMovements}
                  onNavigateTab={setActiveTab}
                />
              )}

              {activeTab === 'notifications' && (
                <NotificationsAdminView
                  ingredients={ingredients}
                  products={products}
                  productionRuns={productionRuns}
                  auditLogs={auditLogs}
                  onNavigateTab={setActiveTab}
                  onRefresh={loadAllData}
                />
              )}

              {activeTab === 'products' && (
                <ProductsAdminView
                  products={products}
                  onRefresh={loadAllData}
                />
              )}

              {activeTab === 'ingredients' && (
                <IngredientsAdminView
                  ingredients={ingredients}
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
        onTabChange={setActiveTab}
        notificationCount={notificationCount}
      />
    </div>
  );
};
