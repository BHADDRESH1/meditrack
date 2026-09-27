import React, { useState, useEffect, useMemo, Suspense } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { PageLoadingFallback } from '@/components/common/PageLoadingFallback';
import { 
  Menu, 
  X,
  Warehouse,
  ChevronDown,
  ChevronRight,
  LogOut,
  Lock
} from 'lucide-react';
import { HOSPITAL_LOCATIONS } from '@/data/hospitalLocations';
import { useAuth } from '@/context/AuthContext';
import { UserRole } from '@/types/inventory';
import { Permission } from '@/services/permissions';
import { 
  NavItemConfig, 
  NavSectionConfig, 
  getNavigationSections, 
  isRouteActive, 
  shouldBlockKeyboardShortcut 
} from './navigationConfig';

export type { NavItemConfig, NavSectionConfig };

interface AppShellProps {
  selectedLocationId: string;
  onLocationChange: (locationId: string) => void;
}

export const AppShell: React.FC<AppShellProps> = ({
  selectedLocationId,
  onLocationChange,
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser, logout, hasPermission, isDemoMode, dataMode, setDataMode, switchDemoRole } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Department User Location Locking
  const isDeptUser = currentUser?.role === 'DEPARTMENT_USER';
  const assignedLocId = currentUser?.assignedLocationId;

  useEffect(() => {
    if (isDeptUser && assignedLocId && selectedLocationId !== assignedLocId) {
      onLocationChange(assignedLocId);
    }
  }, [isDeptUser, assignedLocId, selectedLocationId, onLocationChange]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // Section-Organized Navigation Definition (including Recommendations advisory view)
  const navigationSections = useMemo(() => getNavigationSections(isDeptUser, true), [isDeptUser]);

  // Flattened accessible items for keyboard shortcuts
  const accessibleShortcuts = useMemo(() => {
    const map = new Map<string, { to: string; permission?: Permission }>();
    for (const section of navigationSections) {
      for (const item of section.items) {
        if (item.shortcut && (!item.permission || hasPermission(item.permission))) {
          map.set(item.shortcut, { to: item.to, permission: item.permission });
        }
      }
    }
    return map;
  }, [navigationSections, hasPermission]);

  // Numbered Keyboard Shortcuts Listener (1-0)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (shouldBlockKeyboardShortcut(e.target as HTMLElement | null, e)) {
        return;
      }
      if (typeof document !== 'undefined' && shouldBlockKeyboardShortcut(document.activeElement as HTMLElement | null, e)) {
        return;
      }

      const match = accessibleShortcuts.get(e.key);
      if (match) {
        e.preventDefault();
        navigate(match.to);
        setSidebarOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [accessibleShortcuts, navigate]);

  const currentLocation = HOSPITAL_LOCATIONS.find(l => l.id === selectedLocationId);

  const getInitials = (name?: string) => {
    if (!name) return 'U';
    const parts = name.split(' ');
    return parts.map(p => p[0]).join('').slice(0, 2).toUpperCase();
  };

  // Dynamic Breadcrumb Label & Meta
  const breadcrumb = useMemo(() => {
    const path = location.pathname;
    if (path === '/' || path === '') return { section: 'Overview', title: 'Command Center', subtitle: 'Hospital inventory overview' };
    if (path.startsWith('/products')) return { section: 'Inventory', title: 'Products', subtitle: 'Manage the hospital product catalog' };
    if (path.startsWith('/receiving')) return { section: 'Inventory', title: 'Receive Stock', subtitle: 'Guided intake and purchase order receiving' };
    if (path === '/stock/transfer') return { section: 'Inventory', title: 'Stock Transfers', subtitle: 'Inter-department inventory distribution' };
    if (path.startsWith('/stock')) return { section: 'Inventory', title: 'Stock', subtitle: 'View current inventory across hospital locations' };
    if (path.startsWith('/movements')) return { section: 'Inventory', title: 'Movements', subtitle: 'Inventory movement history' };
    if (path.startsWith('/command-center')) return { section: 'Overview', title: 'Command Center', subtitle: 'Hospital inventory overview' };
    if (path.startsWith('/expiry-risk')) return { section: 'Risk & Planning', title: 'Expiry Risk', subtitle: 'Inventory that may expire before use' };
    if (path.startsWith('/transfers')) return { section: 'Risk & Planning', title: 'Recommendations', subtitle: 'Suggested inventory actions based on stock and demand' };
    if (path === '/procurement/requests') return { section: 'Risk & Planning', title: 'Purchase Requests', subtitle: 'Hospital department purchase requests' };
    if (path.startsWith('/procurement')) return { section: 'Risk & Planning', title: 'Procurement', subtitle: 'Replenishment planning and vendor orders' };
    if (path.startsWith('/locations')) return { section: 'Administration', title: 'Locations', subtitle: 'Hospital facilities and storage locations' };
    if (path.startsWith('/audit')) return { section: 'Administration', title: 'Audit Trail', subtitle: 'Immutable system activity and compliance ledger' };
    if (path.startsWith('/users')) return { section: 'Administration', title: 'Users', subtitle: 'Clinical staff and access management' };
    return { section: 'Navigation', title: 'Overview', subtitle: 'Hospital inventory management' };
  }, [location.pathname]);

  return (
    <div className="h-screen flex flex-col bg-slate-50 text-slate-900 font-sans overflow-hidden antialiased">
      {/* Top Navbar */}
      <header className="shrink-0 z-40 bg-white border-b border-slate-200/90 h-16 flex items-center justify-between px-4 sm:px-6 shadow-2xs">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            aria-label="Toggle navigation sidebar"
            aria-expanded={sidebarOpen}
            aria-controls="app-sidebar-nav"
            className="lg:hidden p-2 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-colors cursor-pointer"
          >
            {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>

          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-700 via-cyan-600 to-teal-500 flex items-center justify-center text-white font-black shadow-xs tracking-wider">
              M
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-base tracking-tight text-slate-900">
                  MED<span className="text-cyan-600">i</span>TRACK
                </span>
                <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded-sm bg-slate-100 text-slate-700 border border-slate-200">
                  Hospital OS
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-medium hidden sm:block">
                Smart Medical Inventory &amp; Expiry Prevention
              </p>
            </div>
          </div>
        </div>

        {/* Center/Right Controls: Location Filter, Role Switcher, Data Mode & User Profile */}
        <div className="flex items-center gap-2.5 sm:gap-3">
          {/* Facility Location Context Filter */}
          <div className="relative flex items-center">
            <Warehouse className="w-4 h-4 text-slate-400 absolute left-3 pointer-events-none" />
            <select
              value={selectedLocationId}
              disabled={isDeptUser}
              onChange={e => onLocationChange(e.target.value)}
              aria-label="Filter active hospital location"
              className={`appearance-none pl-9 pr-8 py-1.5 text-xs font-semibold rounded-lg border transition-all ${
                isDeptUser
                  ? 'bg-purple-50/70 border-purple-200 text-purple-900 cursor-not-allowed'
                  : 'bg-slate-50 border-slate-200 text-slate-800 hover:border-cyan-600 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 cursor-pointer shadow-2xs'
              }`}
            >
              {isDeptUser ? (
                <option value={selectedLocationId}>
                  Scope: {currentLocation?.name || 'Assigned Department'} (Restricted)
                </option>
              ) : (
                <>
                  <option value="ALL">All Hospital Locations (Global View)</option>
                  <optgroup label="Central Depots">
                    {HOSPITAL_LOCATIONS.filter(l => l.type === 'CENTRAL_STORE').map(l => (
                      <option key={l.id} value={l.id}>
                        {l.code} &bull; {l.name}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Clinical Departments &amp; Units">
                    {HOSPITAL_LOCATIONS.filter(l => l.type !== 'CENTRAL_STORE' && l.isActive).map(l => (
                      <option key={l.id} value={l.id}>
                        {l.code} &bull; {l.name}
                      </option>
                    ))}
                  </optgroup>
                </>
              )}
            </select>
            {isDeptUser ? (
              <Lock className="w-3.5 h-3.5 text-purple-600 absolute right-2.5 pointer-events-none" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 pointer-events-none" />
            )}
          </div>

          {/* Quick Demo Role Switcher Bar */}
          {isDemoMode && (
            <div className="hidden xl:flex items-center gap-1 bg-slate-100 p-1 rounded-lg text-[10px] font-bold border border-slate-200/80">
              <span className="text-slate-400 px-1">Role:</span>
              {(['ADMIN', 'INVENTORY_MANAGER', 'STOREKEEPER', 'DEPARTMENT_USER'] as UserRole[]).map(r => (
                <button
                  key={r}
                  onClick={() => switchDemoRole(r)}
                  className={`px-2 py-0.5 rounded transition-all cursor-pointer ${
                    currentUser?.role === r
                      ? 'bg-cyan-700 text-white shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                  }`}
                >
                  {r === 'INVENTORY_MANAGER' ? 'Manager' : r === 'DEPARTMENT_USER' ? 'Dept' : r === 'STOREKEEPER' ? 'Store' : 'Admin'}
                </button>
              ))}
            </div>
          )}

          {/* Operational Data Mode Pill */}
          <div className="flex items-center">
            {dataMode === 'SUPABASE' ? (
              <button
                type="button"
                onClick={() => setDataMode('DEMO')}
                title="Connected to live Supabase PostgreSQL. Click to switch to Demo Mode."
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-300 hover:bg-emerald-100 transition-colors cursor-pointer"
              >
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                <span className="hidden sm:inline">Connected to live database</span>
                <span className="sm:hidden font-bold">Live</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setDataMode('SUPABASE')}
                title="Operating on local synthetic demo data. Click to connect to Live Supabase."
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-300 hover:bg-amber-100 transition-colors cursor-pointer"
              >
                <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                <span className="hidden sm:inline">Demo Data</span>
                <span className="sm:hidden font-bold">Demo</span>
              </button>
            )}
          </div>

          {/* User Profile & Sign Out */}
          {currentUser && (
            <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
              <div className="w-8 h-8 rounded-full bg-slate-800 text-cyan-300 flex items-center justify-center font-bold text-xs shadow-2xs shrink-0">
                {getInitials(currentUser.fullName)}
              </div>
              <div className="text-left hidden md:block">
                <div className="text-xs font-bold text-slate-800 leading-tight">
                  {currentUser.fullName}
                </div>
                <div className="text-[10px] font-semibold text-slate-500 flex items-center gap-1">
                  <span>{currentUser.role.replace(/_/g, ' ')}</span>
                  {currentUser.assignedLocationId && (
                    <span className="text-slate-400 font-normal">
                      &bull; {currentLocation?.code || 'Dept'}
                    </span>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                title="Sign out of MediTrack"
                aria-label="Sign out of MediTrack"
                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors ml-1 cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Main Workspace Body */}
      <div className="flex-1 flex min-h-0 overflow-hidden relative">
        {/* Mobile Backdrop */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-xs lg:hidden transition-opacity"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Fixed Left Sidebar */}
        <aside
          id="app-sidebar-nav"
          aria-label="Main application sidebar"
          className={`fixed lg:static inset-y-0 left-0 z-50 lg:z-30 w-64 xl:w-68 shrink-0 bg-white border-r border-slate-200/90 flex flex-col justify-between transition-transform duration-200 ease-in-out ${
            sidebarOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full lg:translate-x-0'
          }`}
        >
          {/* Mobile Drawer Header */}
          <div className="lg:hidden flex items-center justify-between p-3.5 border-b border-slate-200/90 bg-slate-50/50 shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-cyan-700 flex items-center justify-center text-white font-black text-xs shadow-xs">
                M
              </div>
              <div>
                <span className="font-extrabold text-xs text-slate-900 tracking-tight">MEDiTRACK</span>
                <span className="text-[10px] block text-slate-500 font-medium">Navigation</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSidebarOpen(false)}
              aria-label="Close navigation drawer"
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Scrollable Navigation Items */}
          <div className="flex-1 overflow-y-auto px-3 py-3.5 space-y-4">
            {/* Facility Context Tag */}
            <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200/80">
              <div className="text-[9px] uppercase font-bold tracking-wider text-slate-400 mb-0.5">
                Hospital Scope
              </div>
              <div className="text-xs font-semibold text-slate-800 truncate">
                {currentUser?.facility || 'Al-Mansoor General Hospital'}
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                <span className="truncate">
                  {isDeptUser ? `${currentLocation?.name} (Restricted)` : (currentLocation?.name || 'All Locations (System-wide)')}
                </span>
              </div>
            </div>

            {/* Navigation Groups */}
            {navigationSections.map(section => {
              const authorizedItems = section.items.filter(
                item => !item.permission || hasPermission(item.permission)
              );

              if (authorizedItems.length === 0) return null;
              const isDashboardSection = section.id === 'dashboard';

              return (
                <div key={section.id} className="space-y-1">
                  {!isDashboardSection && (
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-3 pt-1.5 pb-1">
                      {section.displayTitle || section.title}
                    </div>
                  )}

                  <nav className="space-y-0.5">
                    {authorizedItems.map(item => {
                      const Icon = item.icon;
                      const isDashboardItem = item.to === '/';
                      const isItemActive = isRouteActive(item.to, location.pathname, item.exact);
                      const displayLabel = item.displayLabel || item.label;

                      return (
                        <NavLink
                          key={item.to}
                          to={item.to}
                          end={item.exact || isDashboardItem || item.to === '/stock' || item.to === '/procurement'}
                          title={displayLabel}
                          aria-current={isItemActive ? 'page' : undefined}
                          onClick={() => setSidebarOpen(false)}
                          className={`group flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 ${
                            isItemActive
                              ? 'bg-cyan-50 text-cyan-900 font-bold border-l-2 border-cyan-600 shadow-2xs'
                              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 truncate">
                            <Icon 
                              className={`w-4 h-4 shrink-0 transition-colors ${
                                isItemActive ? 'text-cyan-700' : 'text-slate-400 group-hover:text-slate-600'
                              }`} 
                            />
                            <span className="truncate">{displayLabel}</span>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0 ml-2">
                            {item.badge && (
                              <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold ${
                                isItemActive
                                  ? 'bg-cyan-100 text-cyan-800'
                                  : 'bg-slate-100 text-slate-500'
                              }`}>
                                {item.badge}
                              </span>
                            )}
                            {item.shortcut && (
                              <kbd className={`text-[10px] font-mono px-1.5 py-0.2 rounded border shadow-2xs ${
                                isItemActive
                                  ? 'bg-white border-cyan-200 text-cyan-800'
                                  : 'bg-slate-50 border-slate-200 text-slate-400 group-hover:text-slate-600'
                              }`}>
                                {item.shortcut}
                              </kbd>
                            )}
                          </div>
                        </NavLink>
                      );
                    })}
                  </nav>
                </div>
              );
            })}
          </div>

          {/* Sidebar Footer */}
          <div className="p-3.5 border-t border-slate-200/90 bg-slate-50/50 space-y-2 shrink-0">
            <div className="flex items-center justify-between text-xs">
              <div className="truncate">
                <div className="font-bold text-slate-900 text-xs truncate">
                  {currentUser?.fullName || 'Authenticated Staff'}
                </div>
                <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-tight">
                  {currentUser?.role.replace(/_/g, ' ')}
                </div>
              </div>

              {/* Sign out shortcut button */}
              <button
                type="button"
                onClick={handleLogout}
                title="Log out"
                aria-label="Log out"
                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-6 lg:p-8 bg-slate-50/60">
          <div className="max-w-7xl mx-auto w-full space-y-6">
            {/* Page Title & Breadcrumb Header */}
            <div className="pb-4 border-b border-slate-200/80">
              <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-slate-400 font-medium mb-1.5">
                <span className="hover:text-slate-700 transition-colors">MEDiTRACK</span>
                <ChevronRight className="w-3 h-3 text-slate-300" />
                <span className="text-slate-500 font-semibold">{breadcrumb.section}</span>
                <ChevronRight className="w-3 h-3 text-slate-300" />
                <span className="text-slate-900 font-bold" aria-current="page">{breadcrumb.title}</span>
              </nav>
              <div>
                <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
                  {breadcrumb.title}
                </h1>
                <p className="mt-0.5 text-xs sm:text-sm text-slate-500">
                  {breadcrumb.subtitle}
                </p>
              </div>
            </div>

            {/* Routed View */}
            <Suspense fallback={<PageLoadingFallback />}>
              <Outlet />
            </Suspense>
          </div>
        </main>
      </div>
    </div>
  );
};
