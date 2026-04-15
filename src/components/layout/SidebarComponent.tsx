'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { getCurrentUser, logout } from '@/lib/permissions';
import { useLANStatus } from '@/lib/lan-status-context';

interface SidebarProps {
  collapsed?: boolean;
  onCollapse?: (collapsed: boolean) => void;
}

export function Sidebar({ collapsed: propCollapsed, onCollapse }: SidebarProps) {
  const [internalCollapsed, setInternalCollapsed] = useState(false);
  const collapsed = propCollapsed !== undefined ? propCollapsed : internalCollapsed;
  const [user, setUser] = useState<any>(null);
  const [mounted, setMounted] = useState(false);
  const { manualConnectionState, manualRole, manualNetworkName } = useLANStatus();

  useEffect(() => {
    setUser(getCurrentUser());
    setMounted(true);
  }, []);

  const toggleCollapse = () => {
    const nextValue = !collapsed;
    if (onCollapse) {
      onCollapse(nextValue);
    } else {
      setInternalCollapsed(nextValue);
    }
  };

  if (!mounted || !user) return null;

  const handleLogout = () => {
    logout();
  };

  const navItems = [
    { name: 'Dashboard', href: '/', icon: '🏠' },
    { name: 'Patients', href: '/patients', moduleId: 'patients', icon: '👥' },
    { name: 'Appointments', href: '/appointments', moduleId: 'appointments', icon: '📅' },
    { name: 'Queue', href: '/queue', moduleId: 'queue', icon: '📋' },
    { name: 'Doctor Panel', href: '/doctor-panel', moduleId: 'doctor-panel', icon: '🩺' },
    { name: 'Pharmacy', href: '/pharmacy', moduleId: 'pharmacy', icon: '💊' },
    { name: 'Prescriptions', href: '/prescriptions', moduleId: 'prescriptions', icon: '📋' },
    { name: 'Billing', href: '/billing', moduleId: 'billing', icon: '💰' },
    { name: 'Reports', href: '/reports', moduleId: 'reports', icon: '📊' },
    { name: 'Materia Medica', href: '/materia-medica', moduleId: 'materia-medica', icon: '📚' },
    // Fee Settings - HIDDEN from sidebar (available in Settings page)
    // Slot Settings - HIDDEN from sidebar (available in Settings page)
    { name: 'Queue Settings', href: '/settings/queue', moduleId: 'settings', icon: '⚙️' },
    { name: 'Settings', href: '/settings', moduleId: 'settings', icon: '⚙️' },
    // Licensing module - HIDDEN from sidebar (still accessible via direct URL)
    { name: 'Admin', href: '/admin/users', moduleId: 'admin', icon: '👨‍💼' },
    // License Manager - HIDDEN from sidebar
    ...(process.env.NEXT_PUBLIC_IS_DEVELOPER === 'true' || process.env.NEXT_PUBLIC_BUILD_MODE === 'dev' ? [{ name: 'Version Release', href: '/developer/version-release', moduleId: 'developer', icon: '🚀' }] : []),
  ];

  const visibleItems = navItems.filter(item => {
    // Always show items without moduleId (like Dashboard)
    if (!item.moduleId) return true;
    
    // For doctors, show all items with moduleId
    if (user.role === 'doctor') return true;
    
    // For other roles, check permissions
    return user.permissions?.includes(item.moduleId);
  });

  return (
    <div className={`fixed left-0 top-0 h-screen bg-white border-r border-gray-200 flex flex-col shadow-sm transition-all duration-300 ${collapsed ? 'w-16' : 'w-64'}`}>
      {/* Header */}
      <div className="p-4 border-b border-gray-200 flex items-center justify-between">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">C</span>
            </div>
            <h1 className="text-lg font-bold text-gray-900">Clinic PMS</h1>
          </div>
        )}
        <button
          onClick={toggleCollapse}
          className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
          title={collapsed ? 'Expand' : 'Collapse'}
        >
          <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto p-3">
        <div className="space-y-1">
          {visibleItems.map(item => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-indigo-50 text-gray-700 hover:text-indigo-600 transition-colors group"
              title={collapsed ? item.name : ''}
            >
              <span className="text-xl">{item.icon}</span>
              {!collapsed && <span className="text-sm font-medium">{item.name}</span>}
            </Link>
          ))}
        </div>
      </nav>

      {/* User Profile */}
      <div className="border-t border-gray-200 p-4">
        {!collapsed && user && (
          <div className="mb-3 px-3 py-2 bg-gray-50 rounded-lg">
            <p className="text-sm font-semibold text-gray-900 truncate">{user.name}</p>
            <p className="text-xs text-gray-500 truncate capitalize">{user.role}</p>
          </div>
        )}

        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-red-50 text-gray-700 hover:text-red-600 transition-colors"
          title={collapsed ? 'Logout' : ''}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          {!collapsed && <span className="text-sm font-medium">Logout</span>}
        </button>
      </div>
    </div>
  );
}

