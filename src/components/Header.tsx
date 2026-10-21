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
  FiUsers,
  FiDollarSign,
  FiShoppingBag,
} from 'react-icons/fi';

export type AdminTab =
  | 'dashboard'
  | 'insights'
  | 'sales'
  | 'wages'
  | 'costing'
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
  onOpenPinModal?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  onTabChange,
  onRefresh,
  isRefreshing,
  notificationCount = 0,
  onOpenPinModal,
}) => {
  const { logout } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const navItems: {
    id: AdminTab;
    labelMl: string;
    icon: React.ElementType;
    badge?: number;
  }[] = [
    { id: 'dashboard', labelMl: 'ഡാഷ്‌ബോർഡ്', icon: FiGrid },
    { id: 'insights', labelMl: 'അനലിറ്റിക്സ്', icon: FiActivity },
    { id: 'sales', labelMl: 'വിൽപ്പന', icon: FiShoppingBag },
    { id: 'wages', labelMl: 'കൂലി', icon: FiUsers },
    { id: 'costing', labelMl: 'കോസ്റ്റിംഗ്', icon: FiDollarSign },
    { id: 'products', labelMl: 'ഉൽപ്പന്നങ്ങൾ', icon: FiPackage },
    { id: 'ingredients', labelMl: 'ചേരുവകൾ', icon: FiBox },
    { id: 'recipes', labelMl: 'പാചകക്കുറിപ്പ്', icon: FiBookOpen },
    { id: 'movements', labelMl: 'ലെഡ്ജർ', icon: FiClock },
    { id: 'notifications', labelMl: 'അറിയിപ്പുകൾ', icon: FiBell, badge: notificationCount },
  ];

  return (
    <aside className="hidden md:flex md:w-56 lg:w-60 md:fixed md:inset-y-0 md:left-0 z-40 flex-col bg-white dark:bg-[#181515] border-r border-stone-200 dark:border-[#2E2828] transition-colors select-none">
      {/* Brand Header */}
      <div className="p-4 border-b border-stone-100 dark:border-[#282323]">
        <div className="flex items-center gap-2.5">
          <img
            src="/epso-swirl-transparent.png"
            alt="Epso Logo"
            className="w-8 h-8 object-contain"
            onError={(e) => {
              (e.target as HTMLElement).style.display = 'none';
            }}
          />
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-black text-base tracking-tight text-stone-900 dark:text-white">
                EPSO
              </span>
              <span className="px-1.5 py-0.5 text-[9px] font-black rounded-md bg-epso-red/10 text-epso-red dark:bg-amber-400/20 dark:text-amber-400 uppercase tracking-wider">
                Admin
              </span>
            </div>
            <p className="text-[10px] font-semibold text-stone-400 dark:text-stone-500 font-malayalam leading-tight mt-0.5">
              അഡ്മിൻ കൺസോൾ
            </p>
          </div>
        </div>
      </div>

      {/* Vertical Navigation Menu */}
      <div className="flex-1 py-3 px-2.5 overflow-y-auto no-scrollbar space-y-1.5">
        <span className="px-2.5 text-[10px] font-extrabold uppercase tracking-wider text-stone-400 dark:text-stone-500 block mb-1">
          മെനു
        </span>

        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;

          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl font-bold transition-all press-apple group cursor-pointer ${
                isActive
                  ? 'bg-epso-red text-white shadow-md dark:bg-amber-500 dark:text-stone-950 font-black'
                  : 'text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-[#242020]'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <Icon
                  className={`w-4 h-4 shrink-0 transition-transform duration-200 group-hover:scale-110 ${
                    isActive ? 'text-white dark:text-stone-950' : 'text-stone-400 dark:text-stone-400'
                  }`}
                />
                <span className="block font-bold text-sm lg:text-[15px] font-malayalam leading-tight truncate">
                  {item.labelMl}
                </span>
              </div>

              {item.badge && item.badge > 0 ? (
                <span
                  className={`px-1.5 py-0.5 rounded-full text-[10px] font-black shrink-0 ${
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

        {/* Production PIN Settings Trigger */}
        {onOpenPinModal && (
          <div className="pt-2 mt-2 border-t border-stone-100 dark:border-[#282323]">
            <button
              onClick={onOpenPinModal}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-[#242020] hover:text-epso-orange dark:hover:text-amber-400 transition-all press-apple group cursor-pointer"
              title="Set Production PWA PIN"
            >
              <FiUser className="w-4 h-4 shrink-0 text-stone-400 group-hover:text-epso-orange" />
              <span className="block font-bold text-xs lg:text-sm font-malayalam leading-tight truncate">
                പ്രൊഡക്ഷൻ പിൻ (PIN)
              </span>
            </button>
          </div>
        )}
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
