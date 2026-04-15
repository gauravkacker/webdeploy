// ============================================
// Layout Components - Header
// Single-workspace interface based on Module 1
// ============================================

'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { logout } from '@/lib/permissions';
import { TimeDisplay } from './TimeDisplay';
import { ShutdownBackupModal } from '../ShutdownBackupModal';
import { ServerSelectionModal } from '../lan/ServerSelectionModal';
import { useLANStatus } from '@/lib/lan-status-context';
import { isServerDataMode } from '@/lib/db/data-mode';

interface HeaderProps {
  title: React.ReactNode;
  subtitle?: string;
  actions?: React.ReactNode;
  syncStatus?: {
    lastSyncTime: string;
    lastPatientName: string;
    isAutoSyncing: boolean;
  };
}

export function Header({ title, subtitle, actions, syncStatus }: HeaderProps) {
  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showServerSelectionModal, setShowServerSelectionModal] = useState(false);
  const [clinicDoctor, setClinicDoctor] = useState({
    doctorName: 'Dr. Smith',
    doctorQualification: 'Homeopathic Physician',
  });
  const [notifications, setNotifications] = useState<any[]>([]);
  const [serverRole, setServerRole] = useState<'parent' | 'child'>('parent');
  const { manualConnectionState, manualRole } = useLANStatus();

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      
      // Close notifications if clicking outside
      if (showNotifications && !target.closest('.notifications-container')) {
        setShowNotifications(false);
      }
      
      // Close user menu if clicking outside
      if (showUserMenu && !target.closest('.user-menu-container')) {
        setShowUserMenu(false);
      }
    };

    // Listen for server selection event from prompt
    const handleOpenServerSelection = () => {
      setShowServerSelectionModal(true);
      setShowUserMenu(false);
    };

    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('openServerSelection', handleOpenServerSelection);
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('openServerSelection', handleOpenServerSelection);
    };
  }, [showNotifications, showUserMenu, showServerSelectionModal]);

  // Load clinic/doctor settings
  useEffect(() => {
    const saved = localStorage.getItem('clinicDoctorSettings');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setClinicDoctor({
          doctorName: parsed.doctorName || 'Dr. Smith',
          doctorQualification: parsed.doctorSpecialization || 'Homeopathic Physician',
        });
      } catch (e) {
        console.error('Failed to load clinic settings:', e);
      }
    }
  }, [setClinicDoctor]);

  // Determine server role using LAN election (not sessions database)
  useEffect(() => {
    const checkServerRole = async () => {
      try {
        const res = await fetch('/api/lan/status');
        const data = await res.json();
        // Use LAN election result: isMainServer = true means this is the main server
        setServerRole(data.isMainServer ? 'parent' : 'child');
        console.log('[Header] Server role from LAN election:', data.isMainServer ? 'parent' : 'child');
      } catch (e) {
        // Default to parent if can't determine (single computer or offline)
        console.warn('[Header] Could not fetch LAN status, defaulting to parent:', e);
        setServerRole('parent');
      }
    }
    
    checkServerRole();
    
    // Check periodically to stay in sync with LAN election changes (every 5 seconds)
    const interval = setInterval(checkServerRole, 5000);
    return () => clearInterval(interval);
  }, [setServerRole]);

  // Load notifications from database
  useEffect(() => {
    try {
      const appointmentDb = require('@/lib/db/database').appointmentDb;
      const allAppointments = appointmentDb.getAll();
      
      // Generate notifications from appointments
      const generatedNotifications = [];
      
      // New appointments today
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayEnd = new Date(today);
      todayEnd.setHours(23, 59, 59, 999);
      
      const todayAppointments = allAppointments.filter((apt: any) => {
        const aptDate = new Date(apt.appointmentDate);
        return aptDate >= today && aptDate <= todayEnd;
      });
      
      if (todayAppointments.length > 0) {
        generatedNotifications.push({
          id: 1,
          message: `${todayAppointments.length} appointment(s) scheduled for today`,
          time: 'Today',
          unread: true,
        });
      }
      
      // Pending appointments
      const pendingAppointments = allAppointments.filter((apt: any) => 
        apt.status === 'scheduled' || apt.status === 'confirmed'
      );
      
      if (pendingAppointments.length > 0) {
        generatedNotifications.push({
          id: 2,
          message: `${pendingAppointments.length} pending appointment(s)`,
          time: 'Recent',
          unread: true,
        });
      }
      
      // Unpaid fees
      const unpaidAppointments = allAppointments.filter((apt: any) => 
        apt.feeStatus === 'pending'
      );
      
      if (unpaidAppointments.length > 0) {
        generatedNotifications.push({
          id: 3,
          message: `${unpaidAppointments.length} appointment(s) with pending fees`,
          time: 'Recent',
          unread: false,
        });
      }
      
      setNotifications(generatedNotifications.length > 0 ? generatedNotifications : [
        { id: 1, message: 'No new notifications', time: 'Just now', unread: false },
      ]);
    } catch (error) {
      console.error('Failed to load notifications:', error);
    }
  }, [setNotifications]);

  return (
    <>
      <ShutdownBackupModal />
      <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6">
        {/* Page Title */}
        <div>
          <h1 className="text-xl font-semibold text-gray-900">{title}</h1>
          {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
        </div>

      {/* Time Display */}
      <TimeDisplay />

      {/* Spacer */}
      <div className="flex-1"></div>

      {/* Right Actions */}
      <div className="flex items-center gap-4">
        {/* Custom Actions */}
        {actions && (
          <div className="flex items-center gap-2">
            {actions}
          </div>
        )}

        {/* Sync Status Badge */}
        {syncStatus && (
          <div className="relative group">
            <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium transition-all ${
              syncStatus.isAutoSyncing 
                ? 'bg-blue-100 text-blue-700 animate-pulse' 
                : syncStatus.lastSyncTime 
                ? 'bg-green-100 text-green-700 hover:bg-green-200' 
                : 'bg-gray-100 text-gray-600'
            }`}>
              <span className={`w-2 h-2 rounded-full ${
                syncStatus.isAutoSyncing 
                  ? 'bg-blue-600 animate-pulse' 
                  : syncStatus.lastSyncTime 
                  ? 'bg-green-600' 
                  : 'bg-gray-400'
              }`}></span>
              <span>
                {syncStatus.isAutoSyncing ? 'Syncing...' : syncStatus.lastSyncTime ? '✓ Synced' : 'Not synced'}
              </span>
            </div>
            
            {/* Tooltip on hover - positioned below */}
            {syncStatus.lastSyncTime && (
              <div className="absolute top-full left-1/2 transform -translate-x-1/2 mt-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                <div className="font-medium">Last synced: {syncStatus.lastSyncTime}</div>
                {syncStatus.lastPatientName && (
                  <div className="text-gray-300">Patient: {syncStatus.lastPatientName}</div>
                )}
              </div>
            )}
          </div>
        )}
        
        {/* Notifications */}
        <div className="relative notifications-container">
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="relative p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
              />
            </svg>
            <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
          </button>

          {/* Notifications Dropdown */}
          {showNotifications && (
            <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl shadow-lg border border-gray-200 py-2 z-50">
              <div className="px-4 py-2 border-b border-gray-100">
                <h3 className="font-semibold text-gray-900">Notifications</h3>
              </div>
              <div className="max-h-64 overflow-y-auto">
                {notifications.map((notification) => (
                  <div
                    key={notification.id}
                    className={`px-4 py-3 hover:bg-gray-50 cursor-pointer ${
                      notification.unread ? 'bg-indigo-50/50' : ''
                    }`}
                  >
                    <p className="text-sm text-gray-900">{notification.message}</p>
                    <p className="text-xs text-gray-500 mt-1">{notification.time}</p>
                  </div>
                ))}
              </div>
              <div className="px-4 py-2 border-t border-gray-100">
                <button className="text-sm text-indigo-600 hover:text-indigo-700 font-medium">
                  View all notifications
                </button>
              </div>
            </div>
          )}
        </div>

        {/* User Menu */}
        <div className="relative user-menu-container">
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="flex items-center gap-3 pl-4 border-l border-gray-200 hover:bg-gray-50 rounded-lg px-2 py-1 transition-colors"
          >
            <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center">
              <span className="text-sm font-medium text-indigo-600">DR</span>
            </div>
            <div className="hidden sm:block text-left">
              <p className="text-sm font-medium text-gray-900">{clinicDoctor.doctorName}</p>
              <p className="text-xs text-gray-500">{clinicDoctor.doctorQualification}</p>
            </div>
          </button>

          {/* User Menu Dropdown */}
          {showUserMenu && (
            <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-lg border border-gray-200 py-2 z-50">
              <div className="px-4 py-3 border-b border-gray-100">
                <p className="text-sm font-semibold text-gray-900">{clinicDoctor.doctorName}</p>
                <p className="text-xs text-gray-500">{clinicDoctor.doctorQualification}</p>
                {/* Server role and connection status hidden in server mode */}
                {!isServerDataMode && (
                  <div className="mt-2 flex items-center gap-2">
                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                      serverRole === 'parent' 
                        ? 'bg-blue-100 text-blue-800' 
                        : 'bg-purple-100 text-purple-800'
                    }`}>
                      <span className={`w-2 h-2 rounded-full mr-1 ${
                        serverRole === 'parent' ? 'bg-blue-600' : 'bg-purple-600'
                      }`}></span>
                      {serverRole === 'parent' ? 'Main Server' : 'Child Server'}
                    </span>
                    {manualConnectionState && (
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                        manualConnectionState === 'connected'
                          ? 'bg-green-100 text-green-800'
                          : manualConnectionState === 'connecting'
                          ? 'bg-yellow-100 text-yellow-800'
                          : manualConnectionState === 'error'
                          ? 'bg-red-100 text-red-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        <span className={`w-2 h-2 rounded-full mr-1 ${
                          manualConnectionState === 'connected'
                            ? 'bg-green-600'
                            : manualConnectionState === 'connecting'
                            ? 'bg-yellow-600 animate-pulse'
                            : manualConnectionState === 'error'
                            ? 'bg-red-600'
                            : 'bg-gray-600'
                        }`}></span>
                        {manualConnectionState === 'connected' ? 'Connected' : 
                         manualConnectionState === 'connecting' ? 'Connecting...' :
                         manualConnectionState === 'error' ? 'Error' : 'Disconnected'}
                      </span>
                    )}
                  </div>
                )}
              </div>
              <Link href="/settings/clinic-doctor">
                <button className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  Clinic & Doctor Settings
                </button>
              </Link>
              {/* Server Selection hidden in server mode */}
              {!isServerDataMode && (
                <button
                  onClick={() => {
                    setShowServerSelectionModal(true);
                    setShowUserMenu(false);
                  }}
                  className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2m-6 0a2 2 0 00-2 2m6-2a2 2 0 012 2m-6 0h6m0 0v6m0-6v6" />
                  </svg>
                  Server Selection
                </button>
              )}
              <Link href="/settings/database">
                <button className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
                  </svg>
                  Database Info
                </button>
              </Link>
              <button 
                onClick={() => {
                  if (confirm('Are you sure you want to logout?')) {
                    logout();
                  }
                }}
                className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2 border-t border-gray-100 mt-2 pt-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                Logout
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
    <ServerSelectionModal 
      isOpen={showServerSelectionModal} 
      onClose={() => setShowServerSelectionModal(false)} 
    />
    </>
  );
}
