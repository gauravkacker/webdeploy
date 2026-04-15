"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Sidebar } from "@/components/layout/SidebarComponent";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { TimeDisplay } from "@/components/layout/TimeDisplay";
import WhatsAppPendingOverlay from '@/components/WhatsAppPendingOverlay';
import { getCurrentUser } from "@/lib/permissions";
import { appointmentDb, patientDb, slotDb, billingQueueDb, queueDb, queueItemDb, db } from "@/lib/db/database";
import { doctorSettingsDb, doctorVisitDb } from "@/lib/db/doctor-panel";
import { playNotificationSound, isNotificationSoundEnabled } from "@/lib/notification-sound";
import type { Appointment, Slot } from "@/types";

// Helper function to normalize date to YYYY-MM-DD format
// Handles both Date objects and string dates in various formats
function normalizeDateToYYYYMMDD(date: Date | string): string {
  let dateObj: Date;
  
  if (typeof date === 'string') {
    // Handle DD-MM-YYYY format (e.g., "13-03-2026")
    if (date.match(/^\d{2}-\d{2}-\d{4}$/)) {
      const [day, month, year] = date.split('-').map(Number);
      dateObj = new Date(year, month - 1, day, 0, 0, 0, 0);
    }
    // Handle DD/MM/YYYY format (e.g., "13/03/2026")
    else if (date.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
      const [day, month, year] = date.split('/').map(Number);
      dateObj = new Date(year, month - 1, day, 0, 0, 0, 0);
    }
    // Handle YYYY-MM-DD format (e.g., "2026-03-13")
    else if (date.match(/^\d{4}-\d{2}-\d{2}$/)) {
      const [year, month, day] = date.split('-').map(Number);
      dateObj = new Date(year, month - 1, day, 0, 0, 0, 0);
    }
    // Try parsing as ISO string or other formats
    else {
      dateObj = new Date(date);
    }
  } else {
    dateObj = new Date(date);
  }
  
  // Return in YYYY-MM-DD format
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default function AppointmentsPage() {
  const router = useRouter();
  
  // Check authentication on mount
  useEffect(() => {
    const user = getCurrentUser();
    if (!user) {
      router.push('/login');
    }
  }, [router]);
  
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "upcoming" | "past">("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dateFilter, setDateFilter] = useState<string>(new Date().toISOString().split("T")[0]);
  const [slotFilter, setSlotFilter] = useState<string>(() => {
    // Load slot filter from localStorage on mount
    if (typeof window !== 'undefined') {
      const today = new Date().toISOString().split("T")[0];
      const saved = localStorage.getItem('appointmentSlotFilter');
      const savedData = saved ? JSON.parse(saved) : null;
      
      // If saved data is from today, use it; otherwise reset to "all"
      if (savedData && savedData.date === today) {
        return savedData.slot;
      }
    }
    return "all";
  });
  const [sortBy, setSortBy] = useState<"latest" | "oldest" | "time">("latest");
  const [lastDateFilter, setLastDateFilter] = useState<string>(new Date().toISOString().split("T")[0]);
  const [onlineAppointmentFilter, setOnlineAppointmentFilter] = useState<"all" | "online">("all");
  const [syncNotification, setSyncNotification] = useState<{ show: boolean; message: string; type: 'success' | 'error' }>({ show: false, message: '', type: 'success' });
  const [syncStatus, setSyncStatus] = useState<{ lastSyncTime: string; lastPatientName: string; isAutoSyncing: boolean }>({
    lastSyncTime: '',
    lastPatientName: '',
    isAutoSyncing: false,
  });

  // --- Reminder state (persisted to sessionStorage so navigation doesn't lose progress) ---
  const REMINDER_SESSION_KEY = 'reminderWidgetState';
  type ReminderState = 'idle' | 'ready' | 'running' | 'batch-done' | 'all-done';

  const loadReminderSession = () => {
    try {
      const raw = sessionStorage.getItem(REMINDER_SESSION_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    return null;
  };

  const saved = typeof window !== 'undefined' ? loadReminderSession() : null;

  // If we're restoring a 'running' state (send loop was interrupted by navigation),
  // treat it as 'batch-done' so the user can continue or stop.
  // If 'ready' state is restored (unstarted session), discard it and reset to 'idle'.
  const restoredState: ReminderState = 
    saved?.reminderState === 'running' ? 'batch-done' : 
    saved?.reminderState === 'ready' ? 'idle' :
    (saved?.reminderState ?? 'idle');

  const [reminderState, setReminderState] = useState<ReminderState>(restoredState);
  const [reminderQueue, setReminderQueue] = useState<any[]>(saved?.reminderQueue ?? []);
  const [reminderBatchIndex, setReminderBatchIndex] = useState<number>(saved?.reminderBatchIndex ?? 0);
  const [reminderSentCount, setReminderSentCount] = useState<number>(saved?.reminderSentCount ?? 0);
  const [reminderCurrentName, setReminderCurrentName] = useState<string>(saved?.reminderCurrentName ?? '');
  const [reminderBatchStartIndex, setReminderBatchStartIndex] = useState<number>(saved?.reminderBatchStartIndex ?? 0);
  const reminderAbortRef = useRef(false);
  const [showReminderDropdown, setShowReminderDropdown] = useState(false);
  const BATCH_SIZE = 5;

  // Persist reminder state to sessionStorage whenever it changes
  useEffect(() => {
    if (reminderState === 'idle') {
      sessionStorage.removeItem(REMINDER_SESSION_KEY);
    } else {
      sessionStorage.setItem(REMINDER_SESSION_KEY, JSON.stringify({
        reminderState,
        reminderQueue,
        reminderBatchIndex,
        reminderSentCount,
        reminderCurrentName,
        reminderBatchStartIndex,
      }));
    }
  }, [reminderState, reminderQueue, reminderBatchIndex, reminderSentCount, reminderCurrentName, reminderBatchStartIndex]);

  // Auto-resume sending if user returns to appointments while batch-done
  useEffect(() => {
    if (reminderState === 'batch-done' && reminderQueue.length > 0) {
      // Auto-start the next batch after a short delay to ensure UI is ready
      const timer = setTimeout(() => {
        handleNextBatch();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [reminderState]);

  const loadAppointments = useCallback(() => {
    setIsLoading(true);
    
    // Load slots for filter
    const allSlots = slotDb.getActive() as Slot[];
    setSlots(allSlots);
    
    const allAppointments = appointmentDb.getAll() as Appointment[];
    
    // MIGRATION: Assign token numbers to appointments that don't have them
    allAppointments.forEach((apt: any) => {
      if (!apt.tokenNumber || apt.tokenNumber === 0) {
        // Get all appointments for this slot and date
        const appointmentsForSlot = appointmentDb.getBySlot(new Date(apt.appointmentDate), apt.slotId) as any[];
        const maxTokenNumber = appointmentsForSlot.length > 0
          ? Math.max(...appointmentsForSlot.map((a: any) => a.tokenNumber || 0))
          : 0;
        const nextTokenNumber = maxTokenNumber + 1;
        
        // Update appointment with token number
        appointmentDb.update(apt.id, { tokenNumber: nextTokenNumber });
      }
    });
    
    // MIGRATION: Fix priority for online appointments (should be 'normal', not 'doctor-priority')
    allAppointments.forEach((apt: any) => {
      if ((apt as any).isOnlineAppointment && apt.priority !== 'normal') {
        appointmentDb.update(apt.id, { priority: 'normal' });
      }
    });
    
    // Re-fetch after token migration
    const allAppointmentsAfterTokenMigration = appointmentDb.getAll() as Appointment[];
    
    // Filter out appointments for deleted patients
    const validAppointments = allAppointmentsAfterTokenMigration.filter((apt) => {
      const patient = patientDb.getById(apt.patientId);
      return patient !== undefined && patient !== null;
    });
    
    console.log(`[Appointments] ${validAppointments.length} appointments have valid patients`);

    // MIGRATION: Sync old appointments with completed billing entries
    // If an appointment is 'medicines-prepared' but has a completed billing entry, mark it as completed
    validAppointments.forEach((apt) => {
      if (apt.status === 'medicines-prepared') {
        // Check if there's a completed billing entry for this appointment
        const allBillingItems = billingQueueDb.getAll() as any[];
        const completedBillingForApt = allBillingItems.find((item: any) => 
          item.appointmentId === apt.id && item.status === 'completed'
        );
        
        if (completedBillingForApt) {
          // Update appointment to completed
          appointmentDb.update(apt.id, { status: 'completed' });
        }
      }
    });
    
    // Re-fetch after billing migration
    const allAppointmentsAfterBillingMigration = appointmentDb.getAll() as Appointment[];
    const validAppointmentsAfterMigrationFiltered = allAppointmentsAfterBillingMigration.filter((apt) => {
      const patient = patientDb.getById(apt.patientId);
      return patient !== undefined && patient !== null;
    });
    
    // Filter by date if selected
    let filtered = dateFilter
      ? validAppointmentsAfterMigrationFiltered.filter((a: Appointment) => {
          const aptDateNormalized = normalizeDateToYYYYMMDD(a.appointmentDate);
          const filterDateNormalized = normalizeDateToYYYYMMDD(dateFilter);
          return aptDateNormalized === filterDateNormalized;
        })
      : validAppointmentsAfterMigrationFiltered;

    // Filter by slot if selected
    if (slotFilter !== "all") {
      filtered = filtered.filter((a: Appointment) => a.slotId === slotFilter);
    }
    
    const sortedAppointments = filtered.sort((a, b) => {
      // First, separate active and completed appointments
      const aCompleted = a.status === 'completed' ? 1 : 0;
      const bCompleted = b.status === 'completed' ? 1 : 0;
      
      // If one is completed and the other isn't, completed goes to bottom
      if (aCompleted !== bCompleted) {
        return aCompleted - bCompleted;
      }
      
      // Within same completion status, apply the selected sort order
      if (sortBy === "latest") {
        // Latest first (newest date first, then newest time)
        const dateCompare = new Date(b.appointmentDate).getTime() - new Date(a.appointmentDate).getTime();
        if (dateCompare !== 0) return dateCompare;
        return b.appointmentTime.localeCompare(a.appointmentTime);
      } else if (sortBy === "oldest") {
        // Oldest first (oldest date first, then oldest time)
        const dateCompare = new Date(a.appointmentDate).getTime() - new Date(b.appointmentDate).getTime();
        if (dateCompare !== 0) return dateCompare;
        return a.appointmentTime.localeCompare(b.appointmentTime);
      } else {
        // By time (earliest time first)
        const dateCompare = new Date(a.appointmentDate).getTime() - new Date(b.appointmentDate).getTime();
        if (dateCompare !== 0) return dateCompare;
        return a.appointmentTime.localeCompare(b.appointmentTime);
      }
    });
    
    setAppointments(sortedAppointments);
    setIsLoading(false);
  }, [dateFilter, slotFilter, sortBy]);

  useEffect(() => {
     
    loadAppointments();
  }, [loadAppointments]);

  // Listen for billing completion events to refresh appointments
  useEffect(() => {
    const handleBillingComplete = () => {
      loadAppointments();
    };
    
    const handleGoogleSheetSync = (event: any) => {
      console.log('[Appointments] Google Sheet sync completed, reloading appointments');
      const detail = event.detail || {};
      const message = `✓ Synced ${detail.appointmentsCreated} appointments (${detail.appointmentsSkipped} skipped)`;
      
      setSyncNotification({ show: true, message, type: detail.success ? 'success' : 'error' });
      setTimeout(() => setSyncNotification({ show: false, message: '', type: 'success' }), 4000);
      
      loadAppointments();
    };
    
    if (typeof window !== 'undefined') {
      window.addEventListener('billing-completed', handleBillingComplete);
      window.addEventListener('fees-updated', handleBillingComplete);
      window.addEventListener('googleSheetSyncComplete', handleGoogleSheetSync);
      return () => {
        window.removeEventListener('billing-completed', handleBillingComplete);
        window.removeEventListener('fees-updated', handleBillingComplete);
        window.removeEventListener('googleSheetSyncComplete', handleGoogleSheetSync);
      };
    }
  }, [loadAppointments]);

  // Persist slot filter to localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const today = new Date().toISOString().split("T")[0];
      localStorage.setItem('appointmentSlotFilter', JSON.stringify({
        date: today,
        slot: slotFilter
      }));
    }
  }, [slotFilter]);

  // Auto-sync appointments from Google Sheets every N minutes (based on settings)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Load sync status from localStorage on mount
    const loadSyncStatus = () => {
      try {
        const settings = localStorage.getItem('onlineAppointmentsSettings');
        if (settings) {
          const parsed = JSON.parse(settings);
          if (parsed.lastSyncTime) {
            // Extract just the time part (HH:MM:SS)
            const timeStr = parsed.lastSyncTime.split(', ')[1] || parsed.lastSyncTime;
            
            // Get the last synced patient name
            const allAppointments = appointmentDb.getAll() as any[];
            const lastAppointment = allAppointments
              .filter((apt: any) => apt.isOnlineAppointment)
              .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];

            const lastPatientName = lastAppointment 
              ? getPatientName(lastAppointment.patientId)
              : '';

            setSyncStatus({
              lastSyncTime: timeStr,
              lastPatientName: lastPatientName,
              isAutoSyncing: false,
            });
          }
        }
      } catch (error) {
        console.error('[Appointments] Error loading sync status:', error);
      }
    };

    loadSyncStatus();

    const autoSync = async () => {
      try {
        const settings = localStorage.getItem('onlineAppointmentsSettings');
        if (!settings) return;

        const parsed = JSON.parse(settings);
        if (!parsed.autoSyncEnabled || !parsed.googleSheetLink) return;

        setSyncStatus(prev => ({ ...prev, isAutoSyncing: true }));

        // Import the sync function
        const { syncAppointmentsFromGoogleSheet } = await import('@/lib/google-sheets-sync');
        const result = await syncAppointmentsFromGoogleSheet(parsed.googleSheetLink);

        if (result.success && result.appointmentsCreated > 0) {
          // Get the last synced patient name
          const allAppointments = appointmentDb.getAll() as any[];
          const lastAppointment = allAppointments
            .filter((apt: any) => apt.isOnlineAppointment)
            .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];

          const lastPatientName = lastAppointment 
            ? getPatientName(lastAppointment.patientId)
            : '';

          const now = new Date();
          const timeStr = now.toLocaleTimeString('en-IN', { 
            hour: '2-digit', 
            minute: '2-digit',
            second: '2-digit'
          });

          setSyncStatus({
            lastSyncTime: timeStr,
            lastPatientName: lastPatientName,
            isAutoSyncing: false,
          });

          // Reload appointments to show new ones
          loadAppointments();

          // Dispatch event for other components
          window.dispatchEvent(new CustomEvent('googleSheetSyncComplete', {
            detail: result
          }));
        } else {
          setSyncStatus(prev => ({ ...prev, isAutoSyncing: false }));
        }
      } catch (error) {
        // Only log errors if Google Sheets is actually configured
        const settings = localStorage.getItem('onlineAppointmentsSettings');
        if (settings) {
          try {
            const parsed = JSON.parse(settings);
            if (parsed.autoSyncEnabled && parsed.googleSheetLink) {
              console.error('[Appointments] Auto-sync error:', error);
            }
          } catch {}
        }
        setSyncStatus(prev => ({ ...prev, isAutoSyncing: false }));
      }
    };

    // Get sync interval from settings (default to 1 minute)
    let syncIntervalMinutes = 1;
    try {
      const settings = localStorage.getItem('onlineAppointmentsSettings');
      if (settings) {
        const parsed = JSON.parse(settings);
        syncIntervalMinutes = parsed.syncInterval || 1;
      }
    } catch (e) {
      console.error('[Appointments] Error reading sync interval:', e);
    }

    const intervalMs = syncIntervalMinutes * 60 * 1000;

    // Run auto-sync every N minutes
    const interval = setInterval(autoSync, intervalMs);

    // Also run once on mount
    autoSync();

    return () => clearInterval(interval);
  }, []);

  // Poll WhatsApp webhook appointments from server and merge into localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const syncWhatsAppAppointments = async () => {
      // Check if auto-booking / auto-replies are enabled
      const waSettings = (() => { try { return JSON.parse(localStorage.getItem('onlineAppointmentsSettings') || '{}'); } catch { return {}; } })();
      const autoRepliesEnabled = waSettings.autoRepliesEnabled !== false; // default true
      const autoBookingEnabled = waSettings.autoBookingEnabled !== false; // default true

      // Load custom message templates (fall back to defaults if unavailable)
      const DEFAULT_TEMPLATES = {
        confirmed: `✅ Hi {{name}}, your appointment is confirmed!\n📅 Date: {{date}}\n⏰ Time: {{time}}\n🏥 Slot: {{slot}}\n🔢 Token: {{token}}\n\nPlease arrive 10 minutes early. Thank you!`,
        duplicate: `Hi {{name}}, your appointment on {{date}} at {{time}} is already booked. No action needed.`,
        closedDay: `Hi {{name}}, sorry we cannot book your appointment on {{date}} — the clinic is closed on {{dayName}}s. Please choose another date.`,
        holiday: `Hi {{name}}, sorry we cannot book your appointment on {{date}} — it is a holiday. Please choose another date.`,
        closedDate: `Hi {{name}}, sorry the clinic is closed on {{date}}. Please choose another date.`,
        noSlot: `Hi {{name}}, sorry we could not book your appointment at {{time}} on {{date}} — no available slot at that time. Please try a different time.`,
        reminder: `🔔 Reminder: Hi {{name}}, your appointment is tomorrow — {{date}} at {{time}}.\nPlease arrive 10 minutes early. See you soon!`,
      };
      let tpl = { ...DEFAULT_TEMPLATES };
      try {
        const tplRes = await fetch('/api/whatsapp/settings');
        const tplData = await tplRes.json();
        if (tplData.templates) tpl = { ...tpl, ...tplData.templates };
      } catch { /* use defaults */ }

      const fillTemplate = (template: string, vars: Record<string, string>) =>
        Object.entries(vars).reduce((msg, [k, v]) => msg.replaceAll(`{{${k}}}`, v), template);

      // Format YYYY-MM-DD → "26th March 2026"
      const fmtDate = (dateStr: string): string => {
        const [y, m, d] = dateStr.split('-').map(Number);
        const date = new Date(y, m - 1, d);
        const day = date.getDate();
        const suffix = day === 1 || day === 21 || day === 31 ? 'st'
          : day === 2 || day === 22 ? 'nd'
          : day === 3 || day === 23 ? 'rd' : 'th';
        const month = date.toLocaleString('en-IN', { month: 'long' });
        return `${day}${suffix} ${month} ${y}`;
      };

      // Format HH:MM (24h) → "5:30 PM"
      const fmtTime = (timeStr: string): string => {
        const [h, m] = timeStr.split(':').map(Number);
        const period = h >= 12 ? 'PM' : 'AM';
        const hour = h % 12 || 12;
        return `${hour}:${String(m).padStart(2, '0')} ${period}`;
      };

      // Helper: send WhatsApp reply (fire-and-forget, never throws)
      const sendReply = async (chatIdOrPhone: string, message: string) => {
        if (!autoRepliesEnabled) return; // replies disabled
        try {
          await fetch('/api/whatsapp/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: chatIdOrPhone, message }),
          });
        } catch { /* non-critical */ }
      };
      try {
        const res = await fetch('/api/whatsapp/pending-appointments');
        if (!res.ok) return;
        const data = await res.json();
        if (!data.success || !data.pending?.length) return;

        let created = 0;

        for (const pending of data.pending) {
          try {
            // Find or create patient by phone + name (name is tiebreaker for shared numbers)
            const allPatients = patientDb.getAll() as any[];
            const normN = (n: string) => (n ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
            const incomingN = normN(pending.name);
            const phoneCandidates = allPatients.filter(
              (p: any) => p.mobileNumber === pending.phone || p.alternateMobile === pending.phone
            );
            let patient =
              phoneCandidates.find((p: any) => {
                const full = normN(p.fullName ?? `${p.firstName ?? ''} ${p.lastName ?? ''}`);
                return full === incomingN;
              }) ??
              phoneCandidates.find((p: any) => {
                const full = normN(p.fullName ?? `${p.firstName ?? ''} ${p.lastName ?? ''}`);
                return full && (incomingN.includes(full) || full.includes(incomingN));
              }) ??
              phoneCandidates[0] ??
              null;

            if (!patient) {
              const nameParts = pending.name.trim().split(/\s+/);
              patient = patientDb.create({
                registrationNumber: `WA-${Date.now()}`,
                firstName: nameParts[0] || pending.name,
                lastName: nameParts.slice(1).join(' ') || '',
                fullName: pending.name,
                mobileNumber: pending.phone,
                gender: 'other',
                dateOfBirth: '',
                age: 0,
                tags: [],
                feeExempt: false,
                createdBy: 'whatsapp',
                privacySettings: {
                  hideMentalSymptoms: false,
                  hideDiagnosis: false,
                  hidePrognosis: false,
                  hideFees: false,
                  hideCaseNotes: false,
                },
              });
              console.log(`[WhatsApp Sync] Created patient: ${pending.name}`);
            }

            // Parse date (YYYY-MM-DD from webhook)
            const [year, month, day] = pending.date.split('-').map(Number);
            const appointmentDate = new Date(year, month - 1, day, 0, 0, 0, 0);
            const appointmentTime = pending.time;
            // Build targetDateStr directly from parsed parts to avoid UTC offset issues
            const targetDateStr = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;

            // Deduplicate — only block if an active (non-cancelled) appointment exists
            const allApts = appointmentDb.getAll() as any[];
            const duplicate = allApts.find((apt: any) => {
              const aptDate = normalizeDateToYYYYMMDD(apt.appointmentDate);
              return (
                apt.patientId === patient.id &&
                aptDate === targetDateStr &&
                apt.appointmentTime === appointmentTime &&
                apt.status !== 'cancelled'
              );
            });

            if (duplicate) {
              console.log(`[WhatsApp Sync] Duplicate skipped for ${pending.name}`);
              // Still mark as processed so it doesn't keep showing up
              await fetch('/api/whatsapp/pending-appointments', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: pending.id }),
              });
              const dupMobile = (patient?.mobileNumber ?? pending.phone ?? '').replace(/^(\+?91)/, '').slice(-10);
              await sendReply(pending.chatId ?? pending.phone, fillTemplate(tpl.duplicate, { name: pending.name, date: fmtDate(pending.date), time: fmtTime(pending.time), mobile: dupMobile, regd: patient?.registrationNumber || '' }));
              continue;
            }

            // Match slot by time range
            const activeSlots = slotDb.getActive() as any[];
            const timeToMins = (t: string) => {
              const [h, m] = t.split(':').map(Number);
              return h * 60 + m;
            };
            const patientMins = timeToMins(appointmentTime);

            // --- Holiday check ---
            const scheduleRaw = typeof window !== 'undefined' ? localStorage.getItem('clinicScheduleSettings') : null;
            const scheduleSettings = scheduleRaw ? JSON.parse(scheduleRaw) : null;
            if (scheduleSettings) {
              const dayOfWeek = appointmentDate.getDay(); // 0=Sun…6=Sat
              const openDays: number[] = scheduleSettings.openDays ?? [1,2,3,4,5,6];
              const customHolidays: string[] = scheduleSettings.customHolidays ?? [];
              const dateOverrides: { date: string; slotId: string }[] = scheduleSettings.dateOverrides ?? [];

              // Check weekly holiday
              if (!openDays.includes(dayOfWeek)) {
                const dayName = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][dayOfWeek];
                console.log(`[WhatsApp Sync] Holiday (${dayName}) — rejecting ${pending.name}`);
                await fetch('/api/whatsapp/pending-appointments', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ id: pending.id, rejected: true, rejectReason: `Clinic is closed on ${dayName}s` }),
                });
                const closedDayMobile = (patient?.mobileNumber ?? pending.phone ?? '').replace(/^(\+?91)/, '').slice(-10);
                await sendReply(pending.chatId ?? pending.phone, fillTemplate(tpl.closedDay, { name: pending.name, date: fmtDate(pending.date), dayName, mobile: closedDayMobile, regd: patient?.registrationNumber || '' }));
                continue;
              }

              // Check custom holiday
              if (customHolidays.includes(targetDateStr)) {
                console.log(`[WhatsApp Sync] Custom holiday ${targetDateStr} — rejecting ${pending.name}`);
                await fetch('/api/whatsapp/pending-appointments', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ id: pending.id, rejected: true, rejectReason: `${targetDateStr} is a holiday` }),
                });
                const holidayMobile = (patient?.mobileNumber ?? pending.phone ?? '').replace(/^(\+?91)/, '').slice(-10);
                await sendReply(pending.chatId ?? pending.phone, fillTemplate(tpl.holiday, { name: pending.name, date: fmtDate(pending.date), mobile: holidayMobile, regd: patient?.registrationNumber || '' }));
                continue;
              }

              // Check date overrides — "all" means entire day is off
              const allSlotsOff = dateOverrides.some(o => o.date === targetDateStr && o.slotId === 'all');
              if (allSlotsOff) {
                console.log(`[WhatsApp Sync] Date override (all slots) ${targetDateStr} — rejecting ${pending.name}`);
                await fetch('/api/whatsapp/pending-appointments', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ id: pending.id, rejected: true, rejectReason: `Clinic is closed on ${targetDateStr}` }),
                });
                const closedDateMobile = (patient?.mobileNumber ?? pending.phone ?? '').replace(/^(\+?91)/, '').slice(-10);
                await sendReply(pending.chatId ?? pending.phone, fillTemplate(tpl.closedDate, { name: pending.name, date: fmtDate(pending.date), mobile: closedDateMobile, regd: patient?.registrationNumber || '' }));
                continue;
              }
            }
            // --- End holiday check ---

            const matchedSlot = activeSlots.find((s: any) => {
              // Skip slots that have a date override for this specific date
              if (scheduleSettings) {
                const dateOverrides: { date: string; slotId: string }[] = scheduleSettings.dateOverrides ?? [];
                if (dateOverrides.some(o => o.date === targetDateStr && o.slotId === s.id)) return false;
              }
              const start = timeToMins(s.startTime);
              const end = timeToMins(s.endTime);
              return patientMins >= start && patientMins <= end;
            });

            if (!matchedSlot) {
              console.log(`[WhatsApp Sync] No slot match for time ${appointmentTime} — rejecting ${pending.name}`);
              await fetch('/api/whatsapp/pending-appointments', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: pending.id, rejected: true, rejectReason: `Time ${appointmentTime} does not fall within any active slot` }),
              });
              const noSlotMobile = (patient?.mobileNumber ?? pending.phone ?? '').replace(/^(\+?91)/, '').slice(-10);
              await sendReply(pending.chatId ?? pending.phone, fillTemplate(tpl.noSlot, { name: pending.name, date: fmtDate(pending.date), time: fmtTime(pending.time), mobile: noSlotMobile, regd: patient?.registrationNumber || '' }));
              continue;
            }

            const activeSlot = matchedSlot;

            // Assign token number
            const aptsForDate = allApts.filter((apt: any) => {
              const aptDate = normalizeDateToYYYYMMDD(apt.appointmentDate);
              const slotMatch = activeSlot ? apt.slotId === activeSlot.id : true;
              return aptDate === targetDateStr && slotMatch;
            });
            const maxToken = aptsForDate.length > 0
              ? Math.max(...aptsForDate.map((a: any) => a.tokenNumber || 0))
              : 0;

            if (autoBookingEnabled) {
              appointmentDb.create({
                patientId: patient.id,
                patientName: patient.fullName || pending.name,
                doctorId: 'default',
                appointmentDate: appointmentDate,
                appointmentTime: appointmentTime,
                duration: 30,
                slotId: activeSlot?.id || '',
                slotName: activeSlot?.name || '',
                tokenNumber: maxToken + 1,
                type: 'follow-up',
                status: 'scheduled',
                visitMode: 'in-person',
                priority: 'normal',
                feeStatus: 'pending',
                isWalkIn: false,
                isOnlineAppointment: true,
                reminderSent: false,
                notes: `WhatsApp booking received on ${new Date(pending.receivedAt).toLocaleString()}`,
              });

              // Mark as processed on server
              await fetch('/api/whatsapp/pending-appointments', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: pending.id }),
              });

              // Send confirmation reply
              const confirmedMobile = (patient?.mobileNumber ?? pending.phone ?? '').replace(/^(\+?91)/, '').slice(-10);
              await sendReply(pending.chatId ?? pending.phone, fillTemplate(tpl.confirmed, { name: pending.name, date: fmtDate(pending.date), time: fmtTime(pending.time), slot: activeSlot.name, token: String(maxToken + 1), mobile: confirmedMobile, regd: patient?.registrationNumber || '' }));

              created++;
              console.log(`[WhatsApp Sync] ✓ Appointment created for ${pending.name} on ${pending.date} at ${pending.time}`);
            } else {
              // Booking disabled — log it but don't create appointment or send reply
              console.log(`[WhatsApp Sync] Auto-booking disabled — logged but not booked: ${pending.name}`);
            }
          } catch (itemErr) {
            console.error(`[WhatsApp Sync] Error processing pending item ${pending.id}:`, itemErr);
          }
        }

        if (created > 0) {
          loadAppointments();
          
          // Play notification sound if enabled
          if (isNotificationSoundEnabled()) {
            try {
              await playNotificationSound();
            } catch (soundErr) {
              console.warn('[Appointments] Could not play notification sound:', soundErr);
            }
          }
          
          setSyncNotification({
            show: true,
            message: `✓ ${created} new WhatsApp appointment${created > 1 ? 's' : ''} received`,
            type: 'success',
          });
          setTimeout(() => setSyncNotification({ show: false, message: '', type: 'success' }), 4000);
        }
      } catch (err) {
        // silently ignore — server may not be running
      }
    };

    // Poll every 15 seconds
    const interval = setInterval(syncWhatsAppAppointments, 15000);
    syncWhatsAppAppointments(); // run once on mount

    return () => clearInterval(interval);
  }, [loadAppointments]);

  // Poll Google Sheets pending appointments and trigger notification sound
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const checkGoogleSheetsPending = async () => {
      try {
        const { getUnprocessedAppointments } = await import('@/lib/google-sheets-pending');
        const pending = getUnprocessedAppointments();
        
        if (pending.length > 0) {
          // Play notification sound if enabled
          if (isNotificationSoundEnabled()) {
            try {
              await playNotificationSound();
            } catch (soundErr) {
              console.warn('[Appointments] Could not play notification sound for Google Sheets:', soundErr);
            }
          }
        }
      } catch (err) {
        // silently ignore — module may not be available
      }
    };

    // Poll every 15 seconds
    const interval = setInterval(checkGoogleSheetsPending, 15000);
    checkGoogleSheetsPending(); // run once on mount

    return () => clearInterval(interval);
  }, []);

  const getPatientName = (patientId: string): string => {
    const patient = patientDb.getById(patientId);
    if (patient) {
      const p = patient as { firstName: string; lastName: string };
      return `${p.firstName} ${p.lastName}`;
    }
    return "Unknown Patient";
  };

  const formatDate = (date: Date): string => {
    return new Date(date).toLocaleDateString("en-IN", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  const getStatusColor = (status: string): "success" | "warning" | "danger" | "default" | "info" => {
    switch (status) {
      case "scheduled":
        return "info";
      case "confirmed":
        return "success";
      case "checked-in":
        return "warning";
      case "in-progress":
        return "warning";
      case "sent-to-pharmacy":
        return "info";
      case "medicines-prepared":
        return "success";
      case "billed":
        return "info";
      case "completed":
        return "success";
      case "cancelled":
        return "danger";
      case "no-show":
        return "danger";
      default:
        return "default";
    }
  };

  const getStatusLabel = (status: string): string => {
    switch (status) {
      case "in-progress":
        return "Case Taking";
      case "sent-to-pharmacy":
        return "Sent to Pharmacy";
      case "medicines-prepared":
        return "Medicines Prepared";
      default:
        return status.charAt(0).toUpperCase() + status.slice(1);
    }
  };
  const getTypeColor = (type: string): string => {
    switch (type) {
      case "new":
        return "bg-blue-100 text-blue-800";
      case "follow-up":
        return "bg-green-100 text-green-800";
      case "consultation":
        return "bg-purple-100 text-purple-800";
      case "emergency":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getPriorityColor = (priority: string): string => {
    switch (priority) {
      case "emergency":
        return "bg-red-100 text-red-800 border-red-300";
      case "vip":
        return "bg-purple-100 text-purple-800 border-purple-300";
      case "doctor-priority":
        return "bg-yellow-100 text-yellow-800 border-yellow-300";
      default:
        return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };

  const filteredAppointments = appointments.filter((apt) => {
    if (statusFilter !== "all" && apt.status !== statusFilter) return false;
    if (statusFilter === "all" && apt.status === "cancelled") return false;
    if (onlineAppointmentFilter === "online" && !(apt as any).isOnlineAppointment) return false;
    return true;
  });

  const handleCheckIn = (appointmentId: string) => {
    appointmentDb.checkIn(appointmentId);
    loadAppointments();
  };

  const handleCancel = async (appointmentId: string) => {
    if (confirm("Cancel this appointment?")) {
      const appointment = appointmentDb.getById(appointmentId) as any;
      appointmentDb.cancel(appointmentId, "Cancelled by staff");
      loadAppointments();

      // Send WhatsApp cancellation message if auto-replies enabled
      try {
        const waSettings = (() => { try { return JSON.parse(localStorage.getItem('onlineAppointmentsSettings') || '{}'); } catch { return {}; } })();
        if (waSettings.autoRepliesEnabled !== false && appointment) {
          const patient = patientDb.getById(appointment.patientId) as any;
          const phone = patient?.mobileNumber ?? '';
          if (phone) {
            const DEFAULT_CANCELLED = `❌ Hi {{name}}, your appointment on {{date}} at {{time}} has been cancelled. Please contact us to reschedule.`;
            let cancelTpl = DEFAULT_CANCELLED;
            try {
              const tplRes = await fetch('/api/whatsapp/settings');
              const tplData = await tplRes.json();
              if (tplData.templates?.cancelled) cancelTpl = tplData.templates.cancelled;
            } catch { /* use default */ }

            const fmtDate = (d: string) => {
              const [y, m, day] = d.split('-').map(Number);
              const dt = new Date(y, m - 1, day);
              const suffix = day === 1 || day === 21 || day === 31 ? 'st' : day === 2 || day === 22 ? 'nd' : day === 3 || day === 23 ? 'rd' : 'th';
              return `${day}${suffix} ${dt.toLocaleString('en-IN', { month: 'long' })} ${y}`;
            };
            const fmtTime = (t: string) => {
              const [h, min] = t.split(':').map(Number);
              return `${h % 12 || 12}:${String(min).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
            };
            const mobile = phone.replace(/^(\+?91)/, '').slice(-10);
            const name = patient ? `${patient.firstName} ${patient.lastName}`.trim() : '';
            const dateStr = appointment.appointmentDate
              ? (typeof appointment.appointmentDate === 'string'
                  ? appointment.appointmentDate.slice(0, 10)
                  : new Date(appointment.appointmentDate).toISOString().slice(0, 10))
              : '';
            const msg = [['name', name], ['date', dateStr ? fmtDate(dateStr) : ''], ['time', appointment.appointmentTime ? fmtTime(appointment.appointmentTime) : ''], ['mobile', mobile], ['regd', patient?.registrationNumber || '']]
              .reduce((m, [k, v]) => m.replaceAll(`{{${k}}}`, v as string), cancelTpl);

            fetch('/api/whatsapp/send', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ phone: `91${mobile}`, message: msg }),
            }).catch(() => {});
          }
        }
      } catch { /* non-critical */ }
    }
  };
  
  const handleCallPatient = (appointmentId: string) => {
    // Get appointment details
    const appointment = appointmentDb.getById(appointmentId) as any;
    if (appointment) {
      // Check in the appointment
      appointmentDb.checkIn(appointmentId);
      
      // Get queue config and call patient
      const today = new Date();
      const activeSlots = slotDb.getActive() as any[];
      if (activeSlots.length > 0) {
        const config = queueDb.getOrCreate(today, activeSlots[0].id, activeSlots[0].name) as any;
        
        // ALWAYS create a NEW queue item for this call (don't reuse old ones)
        const patient = patientDb.getById(appointment.patientId) as any;
        const newItem = queueItemDb.create({
          queueConfigId: config.id,
          patientId: appointment.patientId,
          patientName: `${patient.firstName} ${patient.lastName}`,
          tokenNumber: appointment.tokenNumber, // Use appointment's token number, not random
          status: 'waiting',
          priority: 'normal',
          checkInTime: new Date(),
          slotName: activeSlots[0].name
        });
        
        const queueItem = newItem as any;
        
        // Call the patient in queue
        if (queueItem) {
          queueItemDb.call(queueItem.id);
          // Store the called queue item ID in localStorage so patient view knows who to display
          if (typeof window !== 'undefined') {
            localStorage.setItem('doctorPanelCalledQueueItemId', queueItem.id);
            localStorage.setItem('doctorPanelCurrentPatient', appointment.patientId);
            // Flush DB to localStorage immediately so patient view tab sees it right away
            db.flushToLocalStorage();
            // Dispatch custom event to notify patient view immediately
            window.dispatchEvent(new CustomEvent('tokenCalled', { 
              detail: { queueItemId: queueItem.id, tokenNumber: queueItem.tokenNumber } 
            }));
          }
        }
      }
      
      loadAppointments();
    }
  };
 
  // --- Reminder helpers ---
  const fmtDateReadable = (dateStr: string): string => {
    const [y, m, d] = dateStr.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    const day = date.getDate();
    const suffix = day === 1 || day === 21 || day === 31 ? 'st' : day === 2 || day === 22 ? 'nd' : day === 3 || day === 23 ? 'rd' : 'th';
    return `${day}${suffix} ${date.toLocaleString('en-IN', { month: 'long' })} ${y}`;
  };

  const fmtTimeReadable = (timeStr: string): string => {
    const [h, m] = timeStr.split(':').map(Number);
    const period = h >= 12 ? 'PM' : 'AM';
    const hour = h % 12 || 12;
    return `${hour}:${String(m).padStart(2, '0')} ${period}`;
  };

  const handleSendReminders = async (day: 'today' | 'tomorrow') => {
    setShowReminderDropdown(false);

    // Build target date string
    const targetDate = new Date();
    if (day === 'tomorrow') targetDate.setDate(targetDate.getDate() + 1);
    const targetStr = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}-${String(targetDate.getDate()).padStart(2, '0')}`;
    const dayLabel = day === 'today' ? 'Today' : 'Tomorrow';

    // Check if target date is a clinic holiday/closed day
    const scheduleRaw = localStorage.getItem('clinicScheduleSettings');
    const scheduleSettings = scheduleRaw ? JSON.parse(scheduleRaw) : null;
    if (scheduleSettings) {
      const dayOfWeek = targetDate.getDay();
      const openDays: number[] = scheduleSettings.openDays ?? [1,2,3,4,5,6];
      const customHolidays: string[] = scheduleSettings.customHolidays ?? [];
      const dateOverrides: { date: string; slotId: string }[] = scheduleSettings.dateOverrides ?? [];
      const allSlotsOff = dateOverrides.some((o: any) => o.date === targetStr && o.slotId === 'all');

      if (!openDays.includes(dayOfWeek) || customHolidays.includes(targetStr) || allSlotsOff) {
        alert(`${dayLabel} (${fmtDateReadable(targetStr)}) is a clinic holiday or closed day. No reminders to send.`);
        return;
      }
    }

    // Find patients whose next visit date matches the target date
    // Deduplicate to latest visit per patient, then filter by nextVisit date
    const allVisits = doctorVisitDb.getAll() as any[];
    const latestByPatient = new Map<string, any>();
    allVisits.forEach((v: any) => {
      const patient = patientDb.getById(v.patientId);
      if (!patient) return;
      const current = latestByPatient.get(v.patientId);
      if (!current || new Date(current.visitDate) < new Date(v.visitDate)) {
        latestByPatient.set(v.patientId, v);
      }
    });

    // Today's date string for dedup check
    const todayStr = new Date().toISOString().slice(0, 10);

    const pending = Array.from(latestByPatient.values())
      .filter((visit: any) => {
        if (!visit.nextVisit) return false;
        const nvDate = normalizeDateToYYYYMMDD(visit.nextVisit);
        if (nvDate !== targetStr) return false;
        // Skip if reminder already sent today (1 reminder per patient per day)
        if (visit.reminderSent && visit.reminderSentDate === todayStr) return false;
        return true;
      })
      .map((visit: any) => {
        const patient = patientDb.getById(visit.patientId) as any;
        return {
          _visitId: visit.id,
          patientId: visit.patientId,
          patientName: patient ? `${patient.firstName} ${patient.lastName}` : 'Patient',
          phone: patient?.mobileNumber,
          regd: patient?.registrationNumber || '',
          nextVisitDate: targetStr,
          reminderDay: day,
          appointmentTime: '',
        };
      })
      .filter((item: any) => !!item.phone);

    if (pending.length === 0) {
      alert(`No pending reminders for ${dayLabel.toLowerCase()}. All patients have already been notified.`);
      return;
    }

    // Show confirmation screen — do NOT auto-start
    setReminderQueue(pending);
    setReminderBatchIndex(0);
    setReminderSentCount(0);
    setReminderCurrentName('');
    reminderAbortRef.current = false;
    setReminderState('ready');
  };

  const runReminderBatch = async (queue: any[], batchIndex: number, alreadySent: number, batchStartIndex: number = 0) => {
    const start = batchIndex * BATCH_SIZE + batchStartIndex;
    const batchEnd = (batchIndex + 1) * BATCH_SIZE;
    const batch = queue.slice(start, batchEnd);
    let sent = alreadySent;

    // Load reminder template
    const DEFAULT_REMINDER = `🔔 Reminder: Hi {{name}}, your next visit is {{when}} — {{date}}.\nPlease arrive 10 minutes early. See you soon!`;
    let reminderTpl = DEFAULT_REMINDER;
    try {
      const res = await fetch('/api/whatsapp/settings');
      const data = await res.json();
      const tplKey = queue[0]?.reminderDay === 'today' ? 'reminderToday' : 'reminder';
      if (data.templates?.[tplKey]) reminderTpl = data.templates[tplKey];
      else if (data.templates?.reminder) reminderTpl = data.templates.reminder;
    } catch { /* use default */ }

    const fillTpl = (template: string, vars: Record<string, string>) =>
      Object.entries(vars).reduce((msg, [k, v]) => msg.replaceAll(`{{${k}}}`, v), template);

    for (let i = 0; i < batch.length; i++) {
      if (reminderAbortRef.current) {
        setReminderState('idle');
        return;
      }

      const item = batch[i];
      const name = item.patientName;
      const phone = item.phone;

      setReminderCurrentName(name);

      if (phone) {
        const message = fillTpl(reminderTpl, {
          name,
          date: fmtDateReadable(item.nextVisitDate),
          when: item.reminderDay === 'today' ? 'today' : 'tomorrow',
          time: item.appointmentTime ? fmtTimeReadable(item.appointmentTime) : '',
          mobile: (phone ?? '').replace(/^(\+?91)/, '').slice(-10),
          regd: item.regd || '',
        });
        try {
          await fetch('/api/whatsapp/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone, message }),
          });
          // Mark the visit's reminderSent flag with today's date for dedup
          const todaySentDate = new Date().toISOString().slice(0, 10);
          doctorVisitDb.update(item._visitId, { reminderSent: true, reminderSentDate: todaySentDate } as any);
        } catch { /* non-critical */ }
      }

      sent++;
      setReminderSentCount(sent);

      // Wait 40–60 seconds between messages (skip delay after last one)
      if (i < batch.length - 1 && !reminderAbortRef.current) {
        const delay = 40000 + Math.random() * 20000; // 40–60s
        await new Promise(res => setTimeout(res, delay));
      }
    }

    const nextStart = (batchIndex + 1) * BATCH_SIZE;
    if (nextStart >= queue.length || reminderAbortRef.current) {
      setReminderState('all-done');
    } else {
      setReminderBatchIndex(batchIndex + 1);
      setReminderBatchStartIndex(0); // Reset for next batch
      setReminderState('batch-done');
    }
  };

  const handleStartFirstBatch = async () => {
    setReminderState('running');
    reminderAbortRef.current = false;
    await runReminderBatch(reminderQueue, 0, 0, 0);
  };

  const handleNextBatch = async () => {
    setReminderState('running');
    reminderAbortRef.current = false;
    await runReminderBatch(reminderQueue, reminderBatchIndex, reminderSentCount, reminderBatchStartIndex);
  };

  const handleStopReminders = () => {
    reminderAbortRef.current = true;
    setReminderState('idle');
  };

  const formatTime12h = (time: string): string => {
    if (!time) return "";
    const [h, m] = time.split(":").map((v) => parseInt(v, 10));
    const hour = ((h % 12) || 12).toString().padStart(2, "0");
    const ampm = h >= 12 ? "PM" : "AM";
    return `${hour}:${`${m}`.padStart(2, "0")} ${ampm}`;
  };
  
  const handlePrintToken = (appointment: Appointment) => {
    const patient = patientDb.getById(appointment.patientId) as any;
    
    // Load print settings from the unified printSettings key
    let tokenNote = "";
    try {
      const raw = doctorSettingsDb.get("printSettings");
      if (raw) {
        const parsed = JSON.parse(raw as string);
        tokenNote = parsed.tokenNote || "";
      }
    } catch {}
    
    const token = (appointment.tokenNumber as any) || "-";
    const name = patient ? `${patient.firstName} ${patient.lastName}` : "Unknown";
    const reg = patient ? patient.registrationNumber : "";
    const mobile = patient ? patient.mobileNumber : "";
    const session = appointment.slotName || (appointment.slotId ? ((slotDb.getById(appointment.slotId) as any)?.name || "") : "");
    const time = appointment.appointmentTime ? formatTime12h(appointment.appointmentTime) : "";
    
    const html = `
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Token</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 0; padding: 0; }
            .ticket { width: 280px; padding: 12px; }
            .header { text-align: center; margin-bottom: 8px; }
            .row { display: flex; justify-content: space-between; align-items: flex-start; font-size: 12px; margin-bottom: 4px; }
            .left { text-align: left; }
            .right { text-align: right; }
            .label { font-weight: 600; }
            .patient { font-size: 12px; line-height: 1.4; margin-bottom: 8px; }
            .token { text-align: center; font-size: 48px; font-weight: bold; margin: 8px 0; }
            .time { text-align: center; font-size: 14px; margin-bottom: 8px; }
            .footer { border-top: 1px dashed #999; padding-top: 6px; font-size: 11px; text-align: center; white-space: pre-wrap; }
          </style>
        </head>
        <body onload="window.print(); setTimeout(() => window.close(), 300);">
          <div class="ticket">
            <div class="header"><strong>Appointment Token</strong></div>
            <div class="row">
              <div class="left"><span class="label">${name}</span></div>
              ${reg ? `<div class="right">Reg: ${reg}</div>` : `<div></div>`}
            </div>
            <div class="row">
              ${mobile ? `<div class="left">Mob: ${mobile}</div>` : `<div></div>`}
              ${session ? `<div class="right">${session}</div>` : `<div></div>`}
            </div>
            <div class="token">${token}</div>
            ${time ? `<div class="time">Appointment time - ${time}</div>` : ``}
            ${tokenNote ? `<div class="footer">${tokenNote}</div>` : ``}
          </div>
        </body>
      </html>
    `;
    const w = window.open("", "_blank", "width=320,height=480");
    if (w) {
      w.document.open();
      w.document.write(html);
      w.document.close();
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Sidebar />
        <div className={`transition-all duration-300 ${sidebarCollapsed ? "ml-16" : "ml-64"}`}>
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar />
      
      <div
        className={`transition-all duration-300 ${
          sidebarCollapsed ? "ml-16" : "ml-64"
        }`}
      >
        <Header 
          title="Appointments" 
          subtitle="Manage patient appointments and queue"
          syncStatus={syncStatus}
          actions={
            <Link href="/appointments/new">
              <Button variant="primary" size="sm">
                + Book Appointment
              </Button>
            </Link>
          }
        />

        {/* Sync Notification Toast */}
        {syncNotification.show && (
          <div className={`fixed top-4 right-4 px-4 py-3 rounded-lg shadow-lg text-white z-50 animate-pulse ${
            syncNotification.type === 'success' ? 'bg-green-500' : 'bg-red-500'
          }`}>
            {syncNotification.message}
          </div>
        )}

        {/* Content */}
        <div className="p-3 space-y-3">
          {/* Filters */}
          <div className="bg-white rounded-lg border border-gray-200 p-2">
            <div className="flex gap-2 flex-wrap items-end">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                <Input
                  type="date"
                  value={dateFilter}
                  onChange={(e) => {
                    const newDate = e.target.value;
                    setDateFilter(newDate);
                    
                    // Reset slot filter if date changed
                    if (newDate !== lastDateFilter) {
                      setSlotFilter("all");
                      setLastDateFilter(newDate);
                      
                      // Clear localStorage for new date
                      if (typeof window !== 'undefined') {
                        localStorage.removeItem('appointmentSlotFilter');
                      }
                    }
                  }}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Slot</label>
                <select
                  value={slotFilter}
                  onChange={(e) => setSlotFilter(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                >
                  <option value="all">All Slots</option>
                  {slots.map((slot) => {
                    const s = slot as Slot;
                    return (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    );
                  })}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Sort By</label>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as "latest" | "oldest" | "time")}
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                >
                  <option value="latest">Latest First</option>
                  <option value="oldest">Oldest First</option>
                  <option value="time">By Time</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                >
                  <option value="all">All Status</option>
                  <option value="scheduled">Scheduled</option>
                  <option value="confirmed">Confirmed</option>
                  <option value="checked-in">Checked In</option>
                  <option value="in-progress">In Progress</option>
                  <option value="medicines-prepared">Medicines Prepared</option>
                  <option value="billed">Billed</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                  <option value="no-show">No Show</option>
                </select>
              </div>
              <div className="flex gap-2">
                <Button
                  variant={filter === "all" ? "primary" : "secondary"}
                  onClick={() => {
                    setFilter("all");
                    setDateFilter("");
                  }}
                >
                  All
                </Button>
                <Button
                  variant={filter === "upcoming" ? "primary" : "secondary"}
                  onClick={() => {
                    setFilter("upcoming");
                    setDateFilter(new Date().toISOString().split("T")[0]);
                  }}
                >
                  Today
                </Button>
                <Button
                  variant={onlineAppointmentFilter === "online" ? "primary" : "secondary"}
                  onClick={() => setOnlineAppointmentFilter(onlineAppointmentFilter === "online" ? "all" : "online")}
                >
                  Online Appointments
                </Button>
                <div className="relative">
                  <Button
                    variant="secondary"
                    onClick={() => setShowReminderDropdown(v => !v)}
                    disabled={reminderState === 'running'}
                    className="text-green-700 border-green-300 hover:bg-green-50"
                  >
                    📲 Send Reminders ▾
                  </Button>
                  {showReminderDropdown && (
                    <div className="absolute right-0 mt-1 w-36 bg-white border border-gray-200 rounded-lg shadow-lg z-20">
                      <button
                        className="w-full text-left px-4 py-2 text-sm hover:bg-green-50 rounded-t-lg"
                        onClick={() => handleSendReminders('today')}
                      >
                        📅 Today
                      </button>
                      <button
                        className="w-full text-left px-4 py-2 text-sm hover:bg-green-50 rounded-b-lg border-t border-gray-100"
                        onClick={() => handleSendReminders('tomorrow')}
                      >
                        📆 Tomorrow
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Appointments List */}
          {filteredAppointments.length === 0 ? (
            <Card className="p-12 text-center">
              <div className="text-gray-400 mb-4">
                <svg
                  className="mx-auto h-12 w-12"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">No appointments found</h3>
              <p className="text-gray-500 mb-4">
                {dateFilter ? "No appointments for this date" : "Get started by booking an appointment"}
              </p>
              <Link href="/appointments/new">
                <Button variant="primary">Book Appointment</Button>
              </Link>
            </Card>
          ) : (
            <div className="space-y-1">
              {filteredAppointments.map((appointment) => (
                <Card key={appointment.id} className={`p-1.5 ${appointment.status === 'completed' ? 'bg-gray-100 opacity-50' : ''}`}>
                  <div className="flex items-center gap-2">
                    {/* Token Number - Compact */}
                    <div className="text-center bg-blue-50 rounded px-1.5 py-0.5 min-w-[45px] border border-blue-200">
                      <div className="text-[9px] text-blue-600 font-medium leading-tight">Token</div>
                      <div className="text-lg font-bold text-blue-700 leading-tight">{appointment.tokenNumber || "-"}</div>
                    </div>
                    
                    {/* Date - Compact */}
                    <div className="text-center bg-gray-100 rounded px-1.5 py-0.5 min-w-[55px]">
                      <div className="text-[9px] text-gray-500 leading-tight">
                        {formatDate(appointment.appointmentDate).split(",")[0]}
                      </div>
                      <div className="text-base font-bold text-gray-900 leading-tight">
                        {new Date(appointment.appointmentDate).getDate()}
                      </div>
                    </div>
                    
                    {/* Patient Info - Using full width efficiently */}
                    <div className="flex-1 grid grid-cols-12 gap-1 items-center">
                      {/* Column 1: Patient Name & Priority (3 cols) */}
                      <div className="col-span-3">
                        <div className="flex items-center gap-1">
                          <h3 className="font-semibold text-sm text-gray-900 truncate">
                            {getPatientName(appointment.patientId)}
                          </h3>
                          {appointment.priority !== "normal" && (
                            <span className={`px-1 py-0.5 rounded text-[8px] border whitespace-nowrap ${getPriorityColor(appointment.priority)}`}>
                              {appointment.priority === "vip" ? "VIP" : appointment.priority === "emergency" ? "EMERGENCY" : "DR PRIORITY"}
                            </span>
                          )}
                        </div>
                      </div>
                      
                      {/* Column 2: Contact Info (3 cols) */}
                      <div className="col-span-3 text-sm text-gray-700">
                        {(() => {
                          const patient = patientDb.getById(appointment.patientId) as any;
                          return patient ? (
                            <div>
                              <div>Regd: {patient.registrationNumber} | Mob: {patient.mobileNumber}</div>
                            </div>
                          ) : null;
                        })()}
                      </div>
                      
                      {/* Column 3: Appointment Details (2 cols) */}
                      <div className="col-span-2 text-sm text-gray-700">
                        <div>{appointment.appointmentTime} | {appointment.duration}m {appointment.slotName && `| ${appointment.slotName}`}</div>
                      </div>
                      
                      {/* Column 4: Badges (4 cols) */}
                      <div className="col-span-4 flex flex-wrap gap-1">
                        <span className={`px-2 py-1 rounded text-xs font-bold whitespace-nowrap ${getTypeColor(appointment.type)}`}>
                          {appointment.type.charAt(0).toUpperCase() + appointment.type.slice(1)}
                        </span>
                        <Badge variant={getStatusColor(appointment.status)} size="sm" className="text-xs px-2 py-1 font-bold whitespace-nowrap">
                          {getStatusLabel(appointment.status)}
                        </Badge>
                        {appointment.visitMode === "tele" && (
                          <span className="px-2 py-1 rounded text-xs font-bold bg-blue-100 text-blue-800 whitespace-nowrap">
                            Tele
                          </span>
                        )}
                        {/* Online Appointment Badge */}
                        {(appointment as any).isOnlineAppointment && (
                          <span className="relative group px-1.5 py-1 rounded text-xs font-bold bg-green-100 text-green-800 whitespace-nowrap cursor-help" title={appointment.notes || 'Online Appointment'}>
                            🌐
                            <span className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                              {appointment.notes || 'Online Appointment'}
                            </span>
                          </span>
                        )}
                        {/* Fee Status Badge */}
                        {((appointment as any).isFreeFollowUp) ? (
                          <span className="px-2 py-1 rounded text-xs font-bold bg-blue-100 text-blue-800 whitespace-nowrap">
                            Free FU
                          </span>
                        ) : (
                          <>
                            {appointment.feeStatus === "pending" && (
                              <span className="px-2 py-1 rounded text-xs font-bold bg-yellow-100 text-yellow-800 whitespace-nowrap">
                                Fee Pending
                              </span>
                            )}
                            {appointment.feeStatus === "paid" && (
                              <span className="px-2 py-1 rounded text-xs font-bold bg-green-100 text-green-800 whitespace-nowrap">
                                Fee Paid
                              </span>
                            )}
                            {appointment.feeStatus === "exempt" && (
                              <span className="px-2 py-1 rounded text-xs font-bold bg-purple-100 text-purple-800 whitespace-nowrap">
                                Fee Exempt
                              </span>
                            )}
                          </>
                        )}

                      </div>
                    </div>
                    
                    {/* Actions - Compact but visible */}
                    <div className="flex gap-1.5 flex-shrink-0">
                      {["scheduled", "confirmed", "checked-in"].includes(appointment.status) && (
                        <>
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() => handleCheckIn(appointment.id)}
                            className="text-xs px-2 py-1 whitespace-nowrap"
                          >
                            Check In
                          </Button>
                          <Link href={`/doctor-panel?patientId=${appointment.patientId}`}>
                            <Button variant="primary" size="sm" className="text-xs px-2 py-1 whitespace-nowrap">
                              Case Taking
                            </Button>
                          </Link>
                          <Button
                            variant="success"
                            size="sm"
                            onClick={() => handleCallPatient(appointment.id)}
                            className="text-xs px-2 py-1 whitespace-nowrap"
                          >
                            📢 Call
                          </Button>
                        </>
                      )}
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => handleCancel(appointment.id)}
                        className="text-xs px-2 py-1 whitespace-nowrap"
                      >
                        Cancel
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handlePrintToken(appointment)}
                        title="Print Token"
                        className="px-2 py-1 text-xs whitespace-nowrap flex items-center gap-1"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                        </svg>
                        Token
                      </Button>
                      <Link href={`/appointments/${appointment.id}`}>
                        <Button variant="secondary" size="sm" className="text-xs px-2 py-1 whitespace-nowrap">View</Button>
                      </Link>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Reminder Progress Widget */}
      {reminderState !== 'idle' && (
        <div className="fixed bottom-4 right-4 z-50 w-80 bg-white border border-gray-200 rounded-xl shadow-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="font-semibold text-sm text-gray-800">📲 WhatsApp Reminders</span>
            <button onClick={handleStopReminders} className="text-gray-400 hover:text-gray-600 text-lg leading-none" title="Close">×</button>
          </div>

          {/* Confirmation screen — shown before any sending starts */}
          {reminderState === 'ready' && (
            <div>
              <p className="text-xs text-gray-700 mb-1">
                Ready to send reminders to <span className="font-semibold text-gray-900">{reminderQueue.length} patient{reminderQueue.length !== 1 ? 's' : ''}</span>.
              </p>
              <p className="text-xs text-gray-500 mb-3">
                Messages are sent in batches of {BATCH_SIZE}, with 40–60 sec between each. You'll confirm each batch manually.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={handleStartFirstBatch}
                  className="flex-1 bg-green-600 text-white text-xs py-1.5 rounded-lg hover:bg-green-700 font-semibold"
                >
                  ▶ Start ({Math.min(BATCH_SIZE, reminderQueue.length)} now)
                </button>
                <button
                  onClick={handleStopReminders}
                  className="flex-1 bg-gray-100 text-gray-700 text-xs py-1.5 rounded-lg hover:bg-gray-200"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Progress bar — shown during/after sending */}
          {reminderState !== 'ready' && (
            <>
              <div className="w-full bg-gray-100 rounded-full h-2 mb-2">
                <div
                  className="bg-green-500 h-2 rounded-full transition-all duration-500"
                  style={{ width: `${reminderQueue.length > 0 ? (reminderSentCount / reminderQueue.length) * 100 : 0}%` }}
                />
              </div>

              <div className="flex items-center justify-between text-xs mb-1">
                <span className="font-medium text-gray-800">
                  {reminderSentCount} / {reminderQueue.length} sent
                </span>
                {reminderQueue.length > BATCH_SIZE && (
                  <span className="text-gray-400">
                    Batch {reminderBatchIndex + (reminderState === 'batch-done' ? 0 : 1)} of {Math.ceil(reminderQueue.length / BATCH_SIZE)}
                  </span>
                )}
              </div>

              {reminderState === 'running' && (
                <div className="space-y-2">
                  <div className="text-xs text-blue-600 animate-pulse truncate">
                    {reminderCurrentName ? `📤 Sending to ${reminderCurrentName}...` : '⏳ Preparing...'}
                  </div>
                  <button
                    onClick={handleStopReminders}
                    className="w-full bg-red-50 text-red-600 border border-red-200 text-xs py-1.5 rounded-lg hover:bg-red-100"
                  >
                    ■ Stop
                  </button>
                </div>
              )}

              {reminderState === 'batch-done' && (
                <div className="mt-2">
                  <p className="text-xs text-gray-700 mb-2">
                    Batch done ({reminderSentCount}/{reminderQueue.length}). Send next {Math.min(BATCH_SIZE, reminderQueue.length - reminderSentCount)}?
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={handleNextBatch}
                      className="flex-1 bg-green-600 text-white text-xs py-1.5 rounded-lg hover:bg-green-700"
                    >
                      ▶ Next Batch
                    </button>
                    <button
                      onClick={handleStopReminders}
                      className="flex-1 bg-gray-100 text-gray-700 text-xs py-1.5 rounded-lg hover:bg-gray-200"
                    >
                      Stop
                    </button>
                  </div>
                </div>
              )}

              {reminderState === 'all-done' && (
                <div className="mt-1 text-xs text-green-700 font-medium">
                  ✓ All {reminderSentCount} reminders sent successfully.
                </div>
              )}
            </>
          )}
        </div>
      )}
      <WhatsAppPendingOverlay onAppointmentBooked={loadAppointments} />
    </div>
  );
}
