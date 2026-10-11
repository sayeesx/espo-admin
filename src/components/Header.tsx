import React from 'react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import {
  LayoutDashboard,
  Activity,
  Package,
  Boxes,
  ScrollText,
  History,
  ShieldCheck,
  LogOut,
  Sun,
  Moon,
  RefreshCw,
  Bell,
} from 'lucide-react';

export type AdminTab =
  | 'dashboard'
  | 'insights'
  | 'products'
  | 'ingredients'
  | 'recipes'
  | 'movements'
  | 'notifications'
  | 'security';

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

  const navItems: { id: AdminTab; labelMl: string; labelEn: string; icon: React.ElementType; badge?: number }[] = [
    { id: 'dashboard', labelMl: 'ഡാഷ്‌ബോർഡ്', labelEn: 'Dashboard', icon: LayoutDashboard },
    { id: 'insights', labelMl: 'അനലിറ്റിക്സ്', labelEn: 'Insights', icon: Activity },
    { id: 'products', labelMl: 'ഉൽപ്പന്നങ്ങൾ', labelEn: 'Products', icon: Package },
    { id: 'ingredients', labelMl: 'ചേരുവകൾ', labelEn: 'Ingredients', icon: Boxes },
    { id: 'recipes', labelMl: 'പാചകക്കുറിപ്പ്', labelEn: 'Recipes', icon: ScrollText },
    { id: 'movements', labelMl: 'ലെഡ്ജർ', labelEn: 'Ledger', icon: History },
    { id: 'notifications', labelMl: 'അറിയിപ്പുകൾ', labelEn: 'Alerts', icon: Bell, badge: notificationCount },
    { id: 'security', labelMl: 'സെക്യൂരിറ്റി', labelEn: 'Security', icon: ShieldCheck },
  ];

  return (
    <header className="hidden md:block sticky top-0 z-30 bg-[#FFFFFF] dark:bg-[#1E1B1B] border-b border-stone-200 dark:border-[#2E2828] shadow-sm backdrop-blur-md bg-opacity-95 dark:bg-opacity-95 transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Brand title */}
          <div className="flex items-center gap-3">
            <img
              src="/favicon.png"
              alt="Epso Logo"
              className="w-8 h-8 object-contain rounded-lg drop-shadow"
              onError={(e) => {
                (e.target as HTMLElement).style.display = 'none';
              }}
            />
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-base tracking-tight text-stone-900 dark:text-white">
                  EPSO
                </span>
                <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-epso-red/10 text-epso-red dark:bg-amber-400/20 dark:text-amber-400 border border-epso-red/20 dark:border-amber-400/30 uppercase tracking-wider">
                  Admin
                </span>
              </div>
              <p className="text-[11px] text-stone-500 dark:text-stone-400 font-malayalam leading-none mt-0.5">
                പ്രൊഡക്ഷൻ & പാൻട്രി മാനേജ്മെന്റ്
              </p>
            </div>
          </div>

          {/* Controls: Refresh, Theme, Notifications, Logout */}
          <div className="flex items-center gap-2">
            <button
              onClick={onRefresh}
              title="Refresh Data from Supabase"
              disabled={isRefreshing}
              className="p-2 rounded-xl text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-[#282323] border border-stone-200 dark:border-[#2E2828] press-apple transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-epso-red dark:text-amber-400' : ''}`} />
            </button>

            <button
              onClick={() => onTabChange('notifications')}
              title="Notifications & Alerts"
              className="relative p-2 rounded-xl text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-[#282323] border border-stone-200 dark:border-[#2E2828] press-apple transition-colors"
            >
              <Bell className="w-4 h-4" />
              {notificationCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[17px] h-[17px] px-1 rounded-full bg-epso-red text-white text-[9px] font-black flex items-center justify-center animate-pulse">
                  {notificationCount > 9 ? '9+' : notificationCount}
                </span>
              )}
            </button>

            <button
              onClick={toggleTheme}
              title="Toggle Dark / Light Mode"
              className="p-2 rounded-xl text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-[#282323] border border-stone-200 dark:border-[#2E2828] press-apple transition-colors"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-stone-700" />}
            </button>

            <button
              onClick={logout}
              title="Logout (ലോഗ് ഔട്ട്)"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-red-50 hover:bg-red-100 dark:bg-red-950/40 dark:hover:bg-red-900/50 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-900/60 press-apple transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline font-malayalam">ലോഗ് ഔട്ട്</span>
            </button>
          </div>
        </div>

        {/* Navigation Tabs (Malayalam 90% / English 10%) */}
        <nav className="flex space-x-1 overflow-x-auto py-2 border-t border-stone-100 dark:border-[#2E2828]/60 no-scrollbar">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onTabChange(item.id)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all press-apple relative ${
                  isActive
                    ? 'bg-epso-red text-white shadow-sm dark:bg-amber-500 dark:text-stone-950 font-bold'
                    : 'text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-[#282323]'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-white dark:text-stone-950' : 'text-stone-400 dark:text-stone-400'}`} />
                <span className="font-malayalam">{item.labelMl}</span>
                <span className={`text-[10px] font-sans opacity-70 ${isActive ? 'font-bold' : ''}`}>
                  ({item.labelEn})
                </span>
                {item.badge && item.badge > 0 ? (
                  <span className={`ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                    isActive ? 'bg-white text-epso-red dark:bg-stone-950 dark:text-amber-400' : 'bg-epso-red text-white'
                  }`}>
                    {item.badge}
                  </span>
                ) : null}
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
};
