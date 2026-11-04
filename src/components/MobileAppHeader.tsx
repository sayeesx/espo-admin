import React from 'react';
import { useTheme } from '../context/ThemeContext';
import { FiBell, FiSun, FiMoon, FiRefreshCw, FiLock } from 'react-icons/fi';
import { AdminTab } from './Header';

interface MobileAppHeaderProps {
  activeTab: AdminTab;
  onTabChange: (tab: AdminTab) => void;
  onRefresh: () => void;
  isRefreshing?: boolean;
  notificationCount: number;
  onOpenPinModal?: () => void;
  changingTab?: AdminTab | null;
  isTodayWagePending?: boolean;
}

export const MobileAppHeader: React.FC<MobileAppHeaderProps> = ({
  activeTab,
  onTabChange,
  onRefresh,
  isRefreshing,
  notificationCount,
  onOpenPinModal,
  changingTab = null,
  isTodayWagePending = false,
}) => {
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="md:hidden sticky top-0 z-30 bg-white dark:bg-[#181515] border-b border-stone-200/80 dark:border-[#2E2828] px-4 pt-safe py-3 transition-colors select-none">
      <div className="flex items-center justify-between">
        {/* User Avatar & Welcome Jabir */}
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-epso-red to-epso-amber text-white flex items-center justify-center font-black text-sm shadow-md ring-2 ring-white dark:ring-[#2E2828]">
              J
            </div>
            {/* Live Online Dot */}
            <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-500 border-2 border-white dark:border-[#181515]" />
          </div>

          <div>
            <span className="text-[11px] font-semibold text-stone-400 dark:text-stone-500 block leading-tight font-malayalam">
              സ്വാഗതം, ജാബിർ
            </span>
            <span className="text-sm font-black text-stone-900 dark:text-white leading-tight block">
              Welcome Jabir
            </span>
          </div>
        </div>

        {/* Right Controls: Wages Warning, Refresh, Theme Toggle, Notification Bell */}
        <div className="flex items-center gap-1.5">
          {isTodayWagePending && (
            <button
              type="button"
              onClick={() => onTabChange('wages')}
              className="px-2.5 py-1 rounded-full bg-amber-500 text-stone-950 font-black text-[10px] font-malayalam flex items-center gap-1 shadow-xs animate-pulse cursor-pointer press-apple"
              title="ഇന്നത്തെ കൂലി നൽകിയിട്ടില്ല (Add Today's Wage)"
            >
              <span>⚠️</span>
              <span className="hidden xs:inline">കൂലി ബാക്കി</span>
            </button>
          )}

          {/* Refresh button */}
          <button
            type="button"
            onClick={onRefresh}
            disabled={isRefreshing}
            className="w-9 h-9 rounded-full flex items-center justify-center bg-stone-100 hover:bg-stone-200 dark:bg-[#282323] dark:hover:bg-[#342D2D] text-stone-700 dark:text-stone-300 transition-colors press-apple cursor-pointer"
            title="Refresh from Supabase"
          >
            <FiRefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-epso-orange' : ''}`} />
          </button>

          {/* Theme toggle */}
          <button
            type="button"
            onClick={toggleTheme}
            className="w-9 h-9 rounded-full flex items-center justify-center bg-stone-100 hover:bg-stone-200 dark:bg-[#282323] dark:hover:bg-[#342D2D] text-stone-700 dark:text-stone-300 transition-colors press-apple cursor-pointer"
            title="Toggle theme"
          >
            {theme === 'dark' ? <FiSun className="w-4 h-4 text-amber-400" /> : <FiMoon className="w-4 h-4 text-stone-700" />}
          </button>

          {/* Notification Bell with Badge */}
          <button
            type="button"
            onClick={() => onTabChange('notifications')}
            className={`w-9 h-9 rounded-full relative flex items-center justify-center transition-colors press-apple cursor-pointer ${
              activeTab === 'notifications'
                ? 'bg-epso-red text-white dark:bg-amber-400 dark:text-stone-950 shadow-md'
                : 'bg-stone-100 hover:bg-stone-200 dark:bg-[#282323] dark:hover:bg-[#342D2D] text-stone-700 dark:text-stone-300'
            }`}
            title="Notifications"
          >
            <FiBell className="w-4 h-4" />
            {notificationCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-epso-red text-white text-[10px] font-black flex items-center justify-center shadow-sm animate-pulse border-2 border-white dark:border-[#181515]">
                {notificationCount > 9 ? '9+' : notificationCount}
              </span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
