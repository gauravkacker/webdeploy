// ============================================
// Main Dashboard Page
// Single-workspace interface based on Module 1
// Updated for Module 2: User Roles & Permissions
// ============================================

'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/layout/SidebarComponent';
import { Header } from '@/components/layout/Header';
import { Card, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge, StatusBadge } from '@/components/ui/Badge';
import { getCurrentUser } from '@/lib/permissions';
import { db, seedModule2Data, seedInitialData, patientDb, appointmentDb, billingQueueDb, medicineBillDb, billingReceiptDb, feeHistoryDb } from '@/lib/db/database';
import { queueItemDb } from '@/lib/db/database';
import { doctorPrescriptionDb, doctorVisitDb, pharmacyQueueDb } from '@/lib/db/doctor-panel';
import { useGoogleSheetSync } from '@/hooks/useGoogleSheetSync';
import { scheduleAutoBackup } from '@/lib/db/file-sync';
import type { Patient, Appointment } from '@/types';

export default function Dashboard() {
  const router = useRouter();
  const [user, setUser] = useState<any>(() => getCurrentUser());
  
  // Initialize Google Sheet sync
  useGoogleSheetSync();
  
  // Seed initial data on first load (client only to avoid hydration issues)
  useEffect(() => {
    const hasSeeded = localStorage.getItem('pms_seeded');
    const hasSeededModule2 = localStorage.getItem('pms_module2_seeded');
    
    if (!hasSeeded) {
      seedInitialData();
      localStorage.setItem('pms_seeded', 'true');
    }
    
    if (!hasSeededModule2) {
      seedModule2Data();
      localStorage.setItem('pms_module2_seeded', 'true');
    }
    

    
    // Run cleanup on dashboard load to remove orphaned items from deleted patients
    const runCleanup = async () => {
      try {
        const response = await fetch('/api/cleanup/orphaned-items', { method: 'POST' });
        if (response.ok) {
          const result = await response.json();
          if (result.summary.totalRemoved > 0) {
            console.log('[Dashboard] Cleanup completed:', result.summary);
          }
        }
      } catch (error) {
        console.error('[Dashboard] Cleanup failed:', error);
      }
    };
    
    runCleanup();
  }, []);
  
  // Load real data
  const [stats, setStats] = useState({
    todayPatients: 0,
    pendingAppointments: 0,
    queueCount: 0,
    prescriptions: 0,
    todayPrescriptions: 0,
    totalPrescriptions: 0,
    dailyFeeTotal: 0,
    dailyFeeCash: 0,
    dailyFeeOnline: 0,
    billTotal: 0,
    billCash: 0,
    billOnline: 0,
  });
  
  const [recentPatients, setRecentPatients] = useState<Patient[]>([]);
  const [upcomingAppointments, setUpcomingAppointments] = useState<Appointment[]>([]);
  const [billingQueueItems, setBillingQueueItems] = useState<any[]>([]);
  const [pharmacyQueue, setPharmacyQueue] = useState<any[]>([]);
  const [hoveredPharmacyItem, setHoveredPharmacyItem] = useState<string | null>(null);
  const [nextPatientId, setNextPatientId] = useState<string | null>(null);
  const [currentPatientId, setCurrentPatientId] = useState<string | null>(null);
  const [showFeeAmounts, setShowFeeAmounts] = useState(false);
  const [showBillAmounts, setShowBillAmounts] = useState(false);
  const [showTotalPrescriptions, setShowTotalPrescriptions] = useState(false);
  const [isQueueOpen, setQueueOpen] = useState(false);
  
  useEffect(() => {
    const queueStatus = localStorage.getItem('queueStatus');
    if (queueStatus === 'open') {
      setQueueOpen(true);
    }

    // Load real data
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayEnd = new Date(today);
    todayEnd.setHours(23, 59, 59, 999);
    
    const loadData = () => {
      // Get today's appointments
      const allAppointments = appointmentDb.getAll() as Appointment[];
      const todayAppointments = allAppointments.filter((apt: any) => {
        const aptDate = new Date(apt.appointmentDate);
        return aptDate >= today && aptDate <= todayEnd;
      });
      
      // Get today's visits
      const allVisits = doctorVisitDb.getAll() as any[];
      const todayVisits = allVisits.filter((visit: any) => {
        const visitDate = new Date(visit.visitDate);
        return visitDate >= today && visitDate <= todayEnd;
      });
      
      // Get billing queue items - only today's items with pending or partial payment status
      // Exclude completed items (status === 'completed')
      const allBillingQueue = billingQueueDb.getAll() as any[];
      
      // Deduplicate billing queue by ID - keep only the latest item per ID
      const billingQueueMap = new Map<string, any>();
      allBillingQueue.forEach((item: any) => {
        const existing = billingQueueMap.get(item.id);
        if (!existing || new Date(item.createdAt) > new Date(existing.createdAt)) {
          billingQueueMap.set(item.id, item);
        }
      });
      const deduplicatedBillingQueue = Array.from(billingQueueMap.values());
      
      const todayBillingQueue = deduplicatedBillingQueue.filter((item: any) => {
        const itemDate = new Date(item.createdAt);
        const patient = patientDb.getById(item.patientId);
        return itemDate >= today && itemDate <= todayEnd && 
               item.status !== 'completed' &&
               (item.status === 'pending' || item.paymentStatus === 'pending' || item.paymentStatus === 'partial') &&
               item.netAmount > 0 &&
               patient !== undefined && patient !== null;
      });
      
      // Get all prescriptions
      const allPrescriptions = doctorPrescriptionDb.getAll() as any[];
      
      // Get today's prescriptions - count unique visits, not individual medicines
      const todayPrescriptionVisits = new Set<string>();
      allPrescriptions.forEach((rx: any) => {
        const rxDate = new Date(rx.createdAt);
        if (rxDate >= today && rxDate <= todayEnd) {
          todayPrescriptionVisits.add(rx.visitId);
        }
      });
      
      // Get total prescription visits (all time) - count unique visits
      const allPrescriptionVisits = new Set<string>();
      allPrescriptions.forEach((rx: any) => {
        allPrescriptionVisits.add(rx.visitId);
      });
      
      // Calculate daily fee total (from today's fee history with deduplication by visitId)
      const allFeeHistory = feeHistoryDb.getAll() as any[];
      const todayFeeHistory = allFeeHistory.filter((fee: any) => {
        const feeDate = new Date(fee.paidDate);
        // Filter out fees from deleted patients
        const patient = patientDb.getById(fee.patientId);
        return feeDate >= today && feeDate <= todayEnd && patient !== undefined && patient !== null;
      });
      
      // Deduplicate by visitId - keep only the latest fee per visit
      const visitMap = new Map<string, any>();
      todayFeeHistory.forEach((fee: any) => {
        if (fee.visitId) {
          const existing = visitMap.get(fee.visitId);
          if (!existing || new Date(fee.paidDate) > new Date(existing.paidDate)) {
            visitMap.set(fee.visitId, fee);
          }
        } else {
          // No visitId - keep as is (shouldn't happen but handle gracefully)
          visitMap.set(fee.id, fee);
        }
      });
      const deduplicatedFees = Array.from(visitMap.values());
      
      // Calculate totals from deduplicated fees
      const dailyFeeTotal = deduplicatedFees.reduce((sum: number, fee: any) => sum + (fee.amount || 0), 0);
      const dailyFeeCash = deduplicatedFees
        .filter((fee: any) => (fee.paymentMethod || 'cash') === 'cash')
        .reduce((sum: number, fee: any) => sum + (fee.amount || 0), 0);
      const dailyFeeOnline = deduplicatedFees
        .filter((fee: any) => {
          const method = fee.paymentMethod || 'cash';
          return method !== 'cash' && method !== 'exempt';
        })
        .reduce((sum: number, fee: any) => sum + (fee.amount || 0), 0);
      
      // Calculate bill total (from today's medicine bills - actual amounts paid)
      const allMedicineBills = medicineBillDb.getAll() as any[];
      const todayBills = allMedicineBills.filter((bill: any) => {
        // Only include today's bills from active patients
        const billDate = new Date(bill.createdAt);
        const patient = patientDb.getById(bill.patientId);
        return billDate >= today && billDate <= todayEnd && patient !== undefined && patient !== null;
      });
      
      // Deduplicate bills by billingQueueId - keep only the latest bill per queue item
      const billMap = new Map<string, any>();
      todayBills.forEach((bill: any) => {
        if (bill.billingQueueId) {
          const existing = billMap.get(bill.billingQueueId);
          if (!existing || new Date(bill.createdAt) > new Date(existing.createdAt)) {
            billMap.set(bill.billingQueueId, bill);
          }
        } else {
          // No billingQueueId - keep as is
          billMap.set(bill.id, bill);
        }
      });
      const deduplicatedBills = Array.from(billMap.values());
      
      const billTotal = deduplicatedBills.reduce((sum: number, bill: any) => sum + (bill.amountPaid || 0), 0);
      const billCash = deduplicatedBills
        .filter((bill: any) => (bill.paymentMethod || 'cash') === 'cash')
        .reduce((sum: number, bill: any) => sum + (bill.amountPaid || 0), 0);
      const billOnline = deduplicatedBills
        .filter((bill: any) => {
          const method = bill.paymentMethod || 'cash';
          return method !== 'cash' && method !== 'exempt';
        })
        .reduce((sum: number, bill: any) => sum + (bill.amountPaid || 0), 0);
      
      // Get recent patients
      const allPatients = patientDb.getAll() as Patient[];
      const sortedPatients = allPatients.sort((a: any, b: any) => {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
      
      // Get upcoming appointments
      // Deduplicate appointments by ID first - keep only the latest per ID
      const appointmentMap = new Map<string, any>();
      allAppointments.forEach((apt: any) => {
        const existing = appointmentMap.get(apt.id);
        if (!existing || new Date(apt.createdAt) > new Date(existing.createdAt)) {
          appointmentMap.set(apt.id, apt);
        }
      });
      const deduplicatedAppointments = Array.from(appointmentMap.values());
      
      const upcomingApts = deduplicatedAppointments
        .filter((apt: any) => {
          const aptDate = new Date(apt.appointmentDate);
          return aptDate >= today && ['scheduled', 'confirmed'].includes(apt.status);
        })
        .sort((a: any, b: any) => {
          const dateA = new Date(`${a.appointmentDate}T${a.appointmentTime}`);
          const dateB = new Date(`${b.appointmentDate}T${b.appointmentTime}`);
          return dateA.getTime() - dateB.getTime();
        })
        .slice(0, 5);
      
      // Get pharmacy queue items - keep displaying until billing is completed
      const allPharmacyQueue = pharmacyQueueDb.getAll() as any[];
      
      // Deduplicate pharmacy queue by ID - keep only the latest item per ID
      const pharmacyQueueMap = new Map<string, any>();
      allPharmacyQueue.forEach((item: any) => {
        const existing = pharmacyQueueMap.get(item.id);
        if (!existing || new Date(item.createdAt) > new Date(existing.createdAt)) {
          pharmacyQueueMap.set(item.id, item);
        }
      });
      const deduplicatedPharmacyQueue = Array.from(pharmacyQueueMap.values());
      
      const todayPharmacyQueue = deduplicatedPharmacyQueue
        .filter((item: any) => {
          const itemDate = new Date(item.createdAt);
          const patient = patientDb.getById(item.patientId);
          
          // Check if this patient's billing is completed
          const billingItems = billingQueueDb.getAll() as any[];
          const patientBillingItem = billingItems.find((b: any) => b.patientId === item.patientId && b.visitId === item.visitId);
          const isBillingCompleted = patientBillingItem?.status === 'completed';
          
          // Include if: today's date, patient exists, and billing is NOT completed
          return itemDate >= today && itemDate <= todayEnd && 
                 patient !== undefined && patient !== null &&
                 !isBillingCompleted;
        })
        .sort((a: any, b: any) => {
          // Sort by status priority: pending/preparing first, then prepared
          const statusOrder: Record<string, number> = { 'pending': 1, 'preparing': 2, 'prepared': 3, 'delivered': 4 };
          const aOrder = statusOrder[a.status?.toLowerCase()] || 999;
          const bOrder = statusOrder[b.status?.toLowerCase()] || 999;
          if (aOrder !== bOrder) return aOrder - bOrder;
          // Then by creation time (oldest first)
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        });
      
      setStats({
        todayPatients: todayVisits.length,
        pendingAppointments: todayAppointments.filter((a: any) => ['scheduled', 'confirmed'].includes(a.status)).length,
        queueCount: todayBillingQueue.length,
        prescriptions: allPrescriptions.length,
        todayPrescriptions: todayPrescriptionVisits.size,
        totalPrescriptions: allPrescriptionVisits.size,
        dailyFeeTotal,
        dailyFeeCash,
        dailyFeeOnline,
        billTotal,
        billCash,
        billOnline,
      });
      
      setRecentPatients(sortedPatients.slice(0, 5));
      setUpcomingAppointments(upcomingApts);
      setBillingQueueItems(todayBillingQueue.slice(0, 5));
      setPharmacyQueue(todayPharmacyQueue);
    };
    
    // Initial load
    loadData();
    
    // Auto-refresh every 3 seconds for live updates
    const interval = setInterval(loadData, 3000);
    
    return () => clearInterval(interval);
  }, []);

  // Load clinic settings (global for all users)
  const [clinicSettings, setClinicSettings] = useState<{
    clinicName: string;
  } | null>(null);

  useEffect(() => {
    // Load clinic name from settings (this is global)
    const saved = localStorage.getItem('clinicDoctorSettings');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setClinicSettings({
          clinicName: parsed.clinicName || 'Clinic Name',
        });
      } catch (e) {
        console.error('Failed to load clinic settings:', e);
        setClinicSettings({
          clinicName: 'Clinic Name',
        });
      }
    } else {
      setClinicSettings({
        clinicName: 'Clinic Name',
      });
    }
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar />

      <div className="transition-all duration-300 ml-64">
        <Header 
          title="Dashboard" 
          subtitle={user && clinicSettings ? `Welcome back, ${user.name} (${user.role}) | ${clinicSettings.clinicName}` : 'Welcome back'} 
        />

        <main className="p-6">
          {/* Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-6 mb-6">
            <Card className="bg-gradient-to-br from-indigo-500 to-indigo-600 text-white border-none">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-indigo-100 text-sm">Today&apos;s Patients</p>
                  <p className="text-3xl font-bold mt-1">{stats.todayPatients}</p>
                </div>
                <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
              </div>
              <div className="mt-4 flex items-center text-sm text-indigo-100">
                <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
                {stats.todayPatients > 0 ? `${stats.todayPatients} visits today` : 'No visits yet'}
              </div>
            </Card>

            <Card className="bg-gradient-to-br from-emerald-500 to-emerald-600 text-white border-none">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-emerald-100 text-sm">Pending Appointments</p>
                  <p className="text-3xl font-bold mt-1">{stats.pendingAppointments}</p>
                </div>
                <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
              </div>
              <div className="mt-4 flex items-center text-sm text-emerald-100">
                <span>{upcomingAppointments.length > 0 ? `Next: ${(upcomingAppointments[0] as any).appointmentTime} - ${upcomingAppointments[0].patientName}` : 'No appointments'}</span>
              </div>
            </Card>

            <Card className="bg-gradient-to-br from-amber-500 to-amber-600 text-white border-none">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-amber-100 text-sm">Billing Queue</p>
                  <p className="text-3xl font-bold mt-1">{stats.queueCount}</p>
                </div>
                <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
              </div>
              <div className="mt-4 flex gap-2">
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="text-white hover:bg-white/20 flex-1"
                  onClick={() => router.push('/billing')}
                >
                  View Billing →
                </Button>
              </div>
            </Card>

            <Card className="bg-gradient-to-br from-rose-500 to-rose-600 text-white border-none">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-rose-100 text-sm">Today's Prescriptions</p>
                  <p className="text-3xl font-bold mt-1">{stats.todayPrescriptions}</p>
                </div>
                <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
              </div>
              <div 
                className="mt-4 flex items-center text-sm text-rose-100 cursor-pointer transition-all"
                onMouseEnter={() => setShowTotalPrescriptions(true)}
                onMouseLeave={() => setShowTotalPrescriptions(false)}
              >
                <span>Total till date: </span>
                <span className="font-semibold ml-1">
                  {showTotalPrescriptions ? stats.totalPrescriptions : '••'}
                </span>
              </div>
            </Card>

            <div 
              className="cursor-pointer transition-all"
              onMouseEnter={() => setShowFeeAmounts(true)}
              onMouseLeave={() => setShowFeeAmounts(false)}
            >
              <Card className="bg-gradient-to-br from-cyan-500 to-cyan-600 text-white border-none h-full">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-cyan-100 text-sm">Daily Fee Total</p>
                    <p className="text-3xl font-bold mt-1">
                      {showFeeAmounts ? `₹${stats.dailyFeeTotal.toLocaleString()}` : '••••••'}
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                </div>
                <div className="mt-4 flex flex-col gap-1 text-sm text-cyan-100">
                  <div className="flex items-center justify-between">
                    <span>💵 Cash:</span>
                    <span className="font-semibold">
                      {showFeeAmounts ? `₹${stats.dailyFeeCash.toLocaleString()}` : '••••'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>💳 Online:</span>
                    <span className="font-semibold">
                      {showFeeAmounts ? `₹${stats.dailyFeeOnline.toLocaleString()}` : '••••'}
                    </span>
                  </div>
                </div>
              </Card>
            </div>

            <div 
              className="cursor-pointer transition-all"
              onMouseEnter={() => setShowBillAmounts(true)}
              onMouseLeave={() => setShowBillAmounts(false)}
            >
              <Card className="bg-gradient-to-br from-violet-500 to-violet-600 text-white border-none h-full">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-violet-100 text-sm">Bill Total</p>
                    <p className="text-3xl font-bold mt-1">
                      {showBillAmounts ? `₹${stats.billTotal.toLocaleString()}` : '••••••'}
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                </div>
                <div className="mt-4 flex flex-col gap-1 text-sm text-violet-100">
                  <div className="flex items-center justify-between">
                    <span>💵 Cash:</span>
                    <span className="font-semibold">
                      {showBillAmounts ? `₹${stats.billCash.toLocaleString()}` : '••••'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>💳 Online:</span>
                    <span className="font-semibold">
                      {showBillAmounts ? `₹${stats.billOnline.toLocaleString()}` : '••••'}
                    </span>
                  </div>
                </div>
              </Card>
            </div>
          </div>

          {/* Main Content Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Billing Queue Section */}
            <Card className="lg:col-span-1 max-h-80 overflow-y-auto">
              <CardHeader
                title="Billing Queue"
                subtitle="Active patient billing status"
                action={
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => router.push('/billing')}
                  >
                    View All
                  </Button>
                }
              />
              <div className="space-y-2">
                {billingQueueItems.length > 0 ? (
                  billingQueueItems.map((item) => {
                    const patient = patientDb.getById(item.patientId) as any;
                    return (
                      <div
                        key={item.id}
                        className="p-2.5 rounded-lg bg-gray-50 border border-gray-200 hover:bg-gray-100 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-gray-900 truncate">
                              {patient?.firstName} {patient?.lastName}
                            </p>
                            <p className="text-xs text-gray-500 mt-0.5">
                              Regd: {patient?.registrationNumber}
                            </p>
                            <div className="flex items-center gap-1 mt-1 text-xs">
                              <span className="text-gray-600">₹{item.netAmount || 0}</span>
                              <span className="text-gray-400">•</span>
                              <span className="text-gray-600">{item.feeType}</span>
                            </div>
                          </div>
                          <div className="flex flex-col gap-1 items-end flex-shrink-0">
                            <Badge 
                              variant={
                                item.paymentStatus === 'paid' ? 'success' :
                                item.paymentStatus === 'partial' ? 'warning' :
                                item.paymentStatus === 'exempt' ? 'purple' :
                                'warning'
                              }
                              size="sm"
                            >
                              {item.paymentStatus}
                            </Badge>
                            <Button
                              variant="secondary"
                              size="sm"
                              className="mt-1 text-xs"
                              onClick={() => {
                                // Create new queue item with appointment's token number
                                const appointment = appointmentDb.getById(item.appointmentId) as any;
                                const tokenNumber = appointment?.tokenNumber || Math.floor(Math.random() * 1000);
                                
                                // Create new queue item using queueItemDb.create
                                const newQueueItem = queueItemDb.create({
                                  patientId: item.patientId,
                                  tokenNumber,
                                  status: 'waiting',
                                  checkInTime: new Date(),
                                  queueConfigId: 'default',
                                  priority: 'normal',
                                });
                                
                                // Set localStorage keys for patient view
                                localStorage.setItem('doctorPanelCurrentPatient', item.patientId);
                                localStorage.setItem('doctorPanelCalledQueueItemId', newQueueItem.id);
                                
                                // Dispatch custom event
                                window.dispatchEvent(new CustomEvent('tokenCalled', { detail: { queueItemId: newQueueItem.id } }));
                                
                                // Open patient view in new tab
                                window.open('/queue/patient-view', '_blank');
                              }}
                            >
                              Start Queue
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="text-center py-6 text-gray-500">
                    <svg className="w-10 h-10 mx-auto text-gray-300 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="text-xs">No active billing items</p>
                  </div>
                )}
              </div>
            </Card>

            {/* Upcoming Appointments */}
            <Card className="lg:col-span-1 max-h-80 overflow-y-auto">
              <CardHeader
                title="Upcoming Appointments"
                subtitle="Today's schedule"
                action={
                  <Button 
                    variant="secondary" 
                    size="sm"
                    onClick={() => router.push('/appointments/new')}
                  >
                    + New
                  </Button>
                }
              />
              <div className="space-y-3">
                {upcomingAppointments.length > 0 ? (
                  upcomingAppointments.map((appointment) => {
                    const isNext = nextPatientId === appointment.patientId;
                    return (
                      <div
                        key={appointment.id}
                        className={`flex items-center gap-3 p-3 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer ${
                          isNext ? 'bg-yellow-50 border-2 border-yellow-400' : 'bg-gray-50'
                        }`}
                      >
                        <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center">
                          <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-gray-900 truncate">
                              {appointment.patientName}
                            </p>
                            {isNext && (
                              <Badge variant="warning" size="sm">NEXT</Badge>
                            )}
                          </div>
                          <p className="text-xs text-gray-500">
                            {new Date((appointment as { appointmentDate: Date }).appointmentDate).toLocaleDateString()} - {(appointment as { type: string }).type}
                          </p>
                        </div>
                        <StatusBadge status={appointment.status} />
                      </div>
                    );
                  })
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    <svg className="w-12 h-12 mx-auto text-gray-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <p>No upcoming appointments</p>
                  </div>
                )}
              </div>
            </Card>

            {/* Quick Actions */}
            <Card className="lg:col-span-1">
              <CardHeader
                title="Quick Actions"
                subtitle="Common tasks"
              />
              <div className="grid grid-cols-3 gap-2">
                <Button 
                  variant="secondary" 
                  className="flex-col py-2 h-auto text-xs"
                  onClick={() => router.push('/patients/new')}
                >
                  <svg className="w-5 h-5 mb-1 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                  </svg>
                  <span>Patient</span>
                </Button>
                <Button 
                  variant={isQueueOpen ? "success" : "secondary"} 
                  className="flex-col py-2 h-auto text-xs"
                  onClick={() => {
                    const newStatus = !isQueueOpen;
                    setQueueOpen(newStatus);
                    localStorage.setItem('queueStatus', newStatus ? 'open' : 'closed');
                    window.open('/queue/patient-view', '_blank');
                  }}
                >
                  <svg className="w-5 h-5 mb-1 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  <span>Queue</span>
                </Button>
                <Button 
                  variant="secondary" 
                  className="flex-col py-2 h-auto text-xs"
                  onClick={() => router.push('/appointments')}
                >
                  <svg className="w-5 h-5 mb-1 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <span>Schedule</span>
                </Button>
                <Button 
                  variant="secondary" 
                  className="flex-col py-2 h-auto text-xs"
                  onClick={() => router.push('/doctor-panel')}
                >
                  <svg className="w-5 h-5 mb-1 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                  <span>Rx</span>
                </Button>
                <Button 
                  variant="secondary" 
                  className="flex-col py-2 h-auto text-xs"
                  onClick={() => router.push('/billing')}
                >
                  <svg className="w-5 h-5 mb-1 text-rose-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>Billing</span>
                </Button>
                <Button 
                  variant="secondary" 
                  className="flex-col py-2 h-auto text-xs"
                  onClick={() => router.push('/pharmacy')}
                >
                  <svg className="w-5 h-5 mb-1 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                  <span>Pharmacy</span>
                </Button>
              </div>
            </Card>
          </div>

          {/* Mini Pharmacy - Live Display */}
          <Card className="mt-6 max-h-80 overflow-y-auto">
            <CardHeader
              title="Mini Pharmacy - Live Status"
              subtitle="Real-time prescription preparation status"
              action={
                <Button 
                  variant="secondary" 
                  size="sm"
                  onClick={() => router.push('/pharmacy')}
                >
                  Open Pharmacy
                </Button>
              }
            />
            <div className="overflow-visible">
              <table className="w-full relative">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Patient</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Prescriptions</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Status</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Time</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Priority</th>
                  </tr>
                </thead>
                <tbody>
                  {pharmacyQueue.length > 0 ? (
                    pharmacyQueue.map((item) => {
                      const patient = patientDb.getById(item.patientId) as any;
                      const patientName = patient ? `${patient.firstName} ${patient.lastName}` : 'Unknown';
                      
                      // Get prescriptions from the visit (same logic as pharmacy page)
                      const prescriptions = doctorPrescriptionDb.getByVisit(item.visitId) || [];
                      const prescriptionCount = prescriptions.length;
                      
                      const getStatusBadge = (status: string) => {
                        const statusLower = (status || 'pending').toLowerCase();
                        if (statusLower === 'pending') return <Badge variant="warning">Pending</Badge>;
                        if (statusLower === 'preparing') return <Badge variant="info">Preparing</Badge>;
                        if (statusLower === 'prepared') return <Badge variant="success">Prepared</Badge>;
                        if (statusLower === 'delivered') return <Badge variant="default">Delivered</Badge>;
                        return <Badge variant="default">{status}</Badge>;
                      };
                      
                      const getTimeDisplay = () => {
                        const createdTime = new Date(item.createdAt);
                        const now = new Date();
                        const diffMinutes = Math.floor((now.getTime() - createdTime.getTime()) / 60000);
                        
                        if (diffMinutes < 1) return 'Just now';
                        if (diffMinutes < 60) return `${diffMinutes}m ago`;
                        const diffHours = Math.floor(diffMinutes / 60);
                        return `${diffHours}h ${diffMinutes % 60}m ago`;
                      };
                      
                      return (
                        <tr key={item.id} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center">
                                <span className="text-sm font-medium text-indigo-600">
                                  {patient ? `${patient.firstName[0]}${patient.lastName[0]}` : '?'}
                                </span>
                              </div>
                              <div>
                                <p className="text-sm font-medium text-gray-900">{patientName}</p>
                                <p className="text-xs text-gray-500">{patient?.registrationNumber || 'N/A'}</p>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                              </svg>
                              <span 
                                className="text-sm text-gray-900 underline decoration-dotted cursor-pointer relative inline-block"
                                onMouseEnter={() => setHoveredPharmacyItem(item.id)}
                                onMouseLeave={() => setHoveredPharmacyItem(null)}
                              >
                                {prescriptionCount} medicine{prescriptionCount !== 1 ? 's' : ''}
                                
                                {/* Hover Tooltip */}
                                {hoveredPharmacyItem === item.id && prescriptions.length > 0 && (
                                  <div className="absolute left-full top-0 ml-2 z-[9999] bg-white border border-gray-300 rounded-lg shadow-xl p-3 min-w-[300px] max-w-[400px] whitespace-normal">
                                    <div className="text-xs font-semibold text-gray-700 mb-2 pb-2 border-b border-gray-200">
                                      Prescription Details
                                    </div>
                                    <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
                                      {prescriptions.map((rx: any, idx: number) => (
                                        <div key={rx.id} className="flex items-start gap-2 text-xs">
                                          <span className="text-gray-400 font-mono">{idx + 1}.</span>
                                          <div className="flex-1">
                                            <div className="font-medium text-gray-900">{rx.medicine}</div>
                                            <div className="text-gray-500 flex items-center gap-2 mt-0.5">
                                              <span>Qty: {rx.quantity || 1}</span>
                                              {rx.dosage && <span>• {rx.dosage}</span>}
                                            </div>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </span>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            {getStatusBadge(item.status)}
                          </td>
                          <td className="py-3 px-4 text-sm text-gray-600">
                            {getTimeDisplay()}
                          </td>
                          <td className="py-3 px-4">
                            {item.priority === 'urgent' ? (
                              <Badge variant="danger" size="sm">Urgent</Badge>
                            ) : item.priority === 'high' ? (
                              <Badge variant="warning" size="sm">High</Badge>
                            ) : (
                              <Badge variant="default" size="sm">Normal</Badge>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-gray-500">
                        <svg className="w-12 h-12 mx-auto text-gray-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <p>No prescriptions in pharmacy queue today</p>
                        <p className="text-xs text-gray-400 mt-1">Prescriptions will appear here when sent from doctor panel</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {pharmacyQueue.length > 0 && (
              <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 flex items-center justify-between text-sm text-gray-600">
                <div className="flex items-center gap-4">
                  <span>Total: {pharmacyQueue.length}</span>
                  <span className="text-yellow-600">Pending: {pharmacyQueue.filter(i => i.status?.toLowerCase() === 'pending').length}</span>
                  <span className="text-blue-600">Preparing: {pharmacyQueue.filter(i => i.status?.toLowerCase() === 'preparing').length}</span>
                  <span className="text-green-600">Prepared: {pharmacyQueue.filter(i => i.status?.toLowerCase() === 'prepared').length}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  <span>Auto-refreshing every 3 seconds</span>
                </div>
              </div>
            )}
          </Card>
        </main>
      </div>
    </div>
  );
}
