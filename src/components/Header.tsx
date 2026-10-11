import React from 'react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import {
  FiGrid,
  FiActivity,
  FiPackage,
  FiBox,
  FiBookOpen,
  FiClock,
  FiBell,
  FiSun,
  FiMoon,
  FiRefreshCw,
  FiLogOut,
  FiUser,
} from 'react-icons/fi';

export type AdminTab =
  | 'dashboard'
  | 'insights'
  | 'products'
  | 'ingredients'
  | 'recipes'
  | 'movements'
  | 'notifications';

interface HeaderProps {
  activeTab: AdminTab;
  onTabChange: (tab: AdminTab) => void;
  onRefresh: () => void;
  isRefreshing?: boolean;
  notificationCount?: number;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  onTabChange,
  onRefresh,
  isRefreshing,
  notificationCount = 0,
}) => {
  const { logout } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const navItems: {
    id: AdminTab;
    labelEn: string;
    labelMl: string;
    icon: React.ElementType;
    badge?: number;
  }[] = [
    { id: 'dashboard', labelEn: 'Dashboard', labelMl: 'ഡാഷ്‌ബോർഡ്', icon: FiGrid },
    { id: 'insights', labelEn: 'Insights', labelMl: 'അനലിറ്റിക്സ്', icon: FiActivity },
    { id: 'products', labelEn: 'Products', labelMl: 'ഉൽപ്പന്നങ്ങൾ', icon: FiPackage },
    { id: 'ingredients', labelEn: 'Ingredients', labelMl: 'ചേരുവകൾ', icon: FiBox },
    { id: 'recipes', labelEn: 'Recipes', labelMl: 'പാചകക്കുറിപ്പ്', icon: FiBookOpen },
    { id: 'movements', labelEn: 'Stock Ledger', labelMl: 'ലെഡ്ജർ', icon: FiClock },
    { id: 'notifications', labelEn: 'Alerts', labelMl: 'അറിയിപ്പുകൾ', icon: FiBell, badge: notificationCount },
  ];

  return (
    <aside className="hidden md:flex md:w-64 lg:w-72 md:fixed md:inset-y-0 md:left-0 z-40 flex-col bg-white dark:bg-[#181515] border-r border-stone-200 dark:border-[#2E2828] transition-colors select-none">
      {/* Brand Header */}
      <div className="p-5 border-b border-stone-100 dark:border-[#282323]">
        <div className="flex items-center gap-3">
          <img
            src="/favicon.png"
            alt="Epso Logo"
            className="w-9 h-9 object-contain rounded-xl drop-shadow"
            onError={(e) => {
              (e.target as HTMLElement).style.display = 'none';
            }}
          />
          <div>
            <div className="flex items-center gap-2">
              <span className="font-black text-lg tracking-tight text-stone-900 dark:text-white">
                EPSO
              </span>
              <span className="px-2 py-0.5 text-[10px] font-black rounded-md bg-epso-red/10 text-epso-red dark:bg-amber-400/20 dark:text-amber-400 uppercase tracking-wider">
                Admin
              </span>
            </div>
            <p className="text-[11px] font-semibold text-stone-400 dark:text-stone-500 font-malayalam leading-tight mt-0.5">
              പ്രൊഡക്ഷൻ & പാൻട്രി കൺസോൾ
            </p>
          </div>
        </div>
      </div>

      {/* Vertical Navigation Menu */}
      <div className="flex-1 py-4 px-3 overflow-y-auto no-scrollbar space-y-1">
        <span className="px-3 text-[10px] font-extrabold uppercase tracking-wider text-stone-400 dark:text-stone-500 block mb-2">
          Main Menu
        </span>

        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;

          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              className={`w-full flex items-center justify-between px-3.5 py-3 rounded-2xl text-xs font-bold transition-all press-apple group cursor-pointer ${
                isActive
                  ? 'bg-epso-red text-white shadow-md dark:bg-amber-500 dark:text-stone-950 font-black'
                  : 'text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-[#242020]'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <Icon
                  className={`w-4 h-4 shrink-0 transition-transform duration-200 group-hover:scale-110 ${
                    isActive ? 'text-white dark:text-stone-950' : 'text-stone-400 dark:text-stone-400'
                  }`}
                />
                <div className="text-left min-w-0">
                  <span className="block leading-tight truncate">{item.labelEn}</span>
                  <span
                    className={`text-[10px] font-normal font-malayalam block leading-none mt-0.5 ${
                      isActive ? 'opacity-85' : 'text-stone-400 dark:text-stone-500'
                    }`}
                  >
                    {item.labelMl}
                  </span>
                </div>
              </div>

              {item.badge && item.badge > 0 ? (
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-black shrink-0 ${
                    isActive
                      ? 'bg-white text-epso-red dark:bg-stone-950 dark:text-amber-400'
                      : 'bg-epso-red text-white animate-pulse'
                  }`}
                >
                  {item.badge}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {/* User Card & Utility Footer */}
      <div className="p-4 border-t border-stone-100 dark:border-[#282323] space-y-3 bg-stone-50/50 dark:bg-[#141212]/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-epso-red to-epso-amber text-white flex items-center justify-center font-black text-sm shadow-sm ring-2 ring-white dark:ring-[#2E2828] shrink-0">
              J
            </div>
            <div className="min-w-0">
              <span className="text-xs font-black text-stone-900 dark:text-white leading-tight block truncate">
                Jabir
              </span>
              <span className="text-[10px] text-stone-400 font-semibold font-malayalam leading-tight block truncate">
                സൂപ്പർ അഡ്മിൻ
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={onRefresh}
              disabled={isRefreshing}
              title="Refresh Data"
              className="p-1.5 rounded-lg text-stone-500 hover:text-stone-800 dark:hover:text-stone-200 hover:bg-stone-200/60 dark:hover:bg-[#282323] transition-colors press-apple cursor-pointer"
            >
              <FiRefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-epso-orange' : ''}`} />
            </button>

            <button
              onClick={toggleTheme}
              title="Toggle Dark / Light Mode"
              className="p-1.5 rounded-lg text-stone-500 hover:text-stone-800 dark:hover:text-stone-200 hover:bg-stone-200/60 dark:hover:bg-[#282323] transition-colors press-apple cursor-pointer"
            >
              {theme === 'dark' ? <FiSun className="w-3.5 h-3.5 text-amber-400" /> : <FiMoon className="w-3.5 h-3.5 text-stone-700" />}
            </button>

            <button
              onClick={logout}
              title="Logout (ലോഗ് ഔട്ട്)"
              className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors press-apple cursor-pointer"
            >
              <FiLogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
};
