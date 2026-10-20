import React from 'react';
import { FiGrid, FiActivity, FiPackage, FiBell, FiClock, FiDollarSign, FiShoppingBag } from 'react-icons/fi';
import { AdminTab } from './Header';

interface MobileBottomNavProps {
  activeTab: AdminTab;
  onTabChange: (tab: AdminTab) => void;
  notificationCount: number;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  activeTab,
  onTabChange,
  notificationCount,
}) => {
  const tabs: {
    id: AdminTab;
    label: string;
    icon: React.ElementType;
    hasBadge?: boolean;
  }[] = [
    { id: 'dashboard', label: 'ഡാഷ്‌ബോർഡ്', icon: FiGrid },
    { id: 'sales', label: 'വിൽപ്പന', icon: FiShoppingBag },
    { id: 'costing', label: 'കോസ്റ്റിംഗ്', icon: FiDollarSign },
    { id: 'products', label: 'ഉൽപ്പന്നങ്ങൾ', icon: FiPackage },
    { id: 'movements', label: 'ലെഡ്ജർ', icon: FiClock },
    { id: 'notifications', label: 'അറിയിപ്പുകൾ', icon: FiBell, hasBadge: true },
  ];

  return (
    <nav className="md:hidden fixed bottom-3 inset-x-3 z-40 max-w-md mx-auto select-none pointer-events-none">
      <div className="bg-white/90 dark:bg-[#1A1616]/90 backdrop-blur-2xl rounded-2xl border border-stone-200/80 dark:border-[#2E2828] shadow-[0_10px_35px_rgba(0,0,0,0.12)] dark:shadow-[0_10px_35px_rgba(0,0,0,0.5)] p-1.5 flex items-center justify-between gap-1 pointer-events-auto">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive =
            activeTab === tab.id ||
            (tab.id === 'products' && (activeTab === 'ingredients' || activeTab === 'recipes'));

          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`flex-1 flex flex-col items-center justify-center py-2 px-1 rounded-xl transition-all duration-200 relative press-apple cursor-pointer ${
                isActive
                  ? 'bg-stone-900 text-white dark:bg-white dark:text-stone-950 shadow-xs'
                  : 'text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200 hover:bg-stone-50 dark:hover:bg-[#252020]'
              }`}
            >
              <div className="relative">
                <Icon
                  className={`w-4 h-4 transition-transform duration-200 ${
                    isActive ? 'scale-105' : ''
                  }`}
                />
                {tab.hasBadge && notificationCount > 0 && (
                  <span
                    className={`absolute -top-1.5 -right-2 min-w-[15px] h-[15px] px-0.5 rounded-full text-[9px] font-black flex items-center justify-center ${
                      isActive
                        ? 'bg-epso-red text-white ring-2 ring-stone-900 dark:ring-white'
                        : 'bg-epso-red text-white'
                    }`}
                  >
                    {notificationCount > 9 ? '9+' : notificationCount}
                  </span>
                )}
              </div>
              <span
                className={`text-[10px] mt-1 font-malayalam tracking-tight leading-none ${
                  isActive ? 'font-bold' : 'font-medium'
                }`}
              >
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
