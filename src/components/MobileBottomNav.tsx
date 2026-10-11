import React from 'react';
import {
  LayoutDashboard,
  Activity,
  Package,
  Bell,
  ShieldCheck,
  Boxes,
} from 'lucide-react';
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
    { id: 'dashboard', label: 'Home', icon: LayoutDashboard },
    { id: 'insights', label: 'Insights', icon: Activity },
    { id: 'products', label: 'Products', icon: Package },
    { id: 'notifications', label: 'Alerts', icon: Bell, hasBadge: true },
    { id: 'security', label: 'Security', icon: ShieldCheck },
  ];

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-[#181515]/95 backdrop-blur-xl border-t border-stone-200/80 dark:border-[#2E2828] pb-safe transition-colors">
      <div className="flex items-center justify-around h-16 px-2">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive =
            activeTab === tab.id ||
            (tab.id === 'products' && (activeTab === 'ingredients' || activeTab === 'recipes' || activeTab === 'movements'));

          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`flex-1 flex flex-col items-center justify-center py-1 transition-all relative press-apple cursor-pointer ${
                isActive
                  ? 'text-epso-orange dark:text-amber-400 font-extrabold'
                  : 'text-stone-400 dark:text-stone-500 hover:text-stone-700 dark:hover:text-stone-300'
              }`}
            >
              <div className="relative">
                <Icon className={`w-5 h-5 transition-transform duration-200 ${isActive ? 'scale-110' : ''}`} />
                {tab.hasBadge && notificationCount > 0 && (
                  <span className="absolute -top-1 -right-2 min-w-[15px] h-[15px] px-0.5 rounded-full bg-epso-red text-white text-[9px] font-black flex items-center justify-center border border-white dark:border-[#181515]">
                    {notificationCount > 9 ? '9+' : notificationCount}
                  </span>
                )}
              </div>
              <span className={`text-[10px] mt-1 font-semibold tracking-tight ${isActive ? 'font-bold' : ''}`}>
                {tab.label}
              </span>
              {isActive && (
                <span className="w-1.5 h-1.5 rounded-full bg-epso-orange dark:bg-amber-400 mt-0.5" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
};
