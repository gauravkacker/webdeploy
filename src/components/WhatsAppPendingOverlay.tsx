"use client";

import { useState, useEffect, useCallback } from "react";
import { patientDb, appointmentDb, slotDb } from "@/lib/db/database";
import { getOnlineAppointmentSettings, PendingAppointment } from "@/lib/settings-helpers";

// ─── Props ────────────────────────────────────────────────────────────────────

interface WhatsAppPendingOverlayProps {
  onAppointmentBooked: () => void;
}

// ─── Helper functions ─────────────────────────────────────────────────────────

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function ordinalSuffix(day: number): string {
  if (day >= 11 && day <= 13) return `${day}th`;
  switch (day % 10) {
    case 1: return `${day}st`;
    case 2: return `${day}nd`;
    case 3: return `${day}rd`;
    default: return `${day}th`;
  }
}

/** "2026-03-26" → "26th March 2026" */
const fmtDate = (dateStr: string): string => {
  try {
    const [year, month, day] = dateStr.split("-").map(Number);
    return `${ordinalSuffix(day)} ${MONTH_NAMES[month - 1]} ${year}`;
  } catch {
    return dateStr;
  }
};

/** "17:30" → "5:30 PM" */
const fmtTime = (timeStr: string): string => {
  try {
    const [hStr, mStr] = timeStr.split(":");
    let h = parseInt(hStr, 10);
    const m = parseInt(mStr, 10);
    const ampm = h >= 12 ? "PM" : "AM";
    h = h % 12 || 12;
    return `${h}:${String(m).padStart(2, "0")} ${ampm}`;
  } catch {
    return timeStr;
  }
};

/** Normalise any date string to YYYY-MM-DD */
const normalizeDateToYYYYMMDD = (date: string): string => {
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
  try {
    const d = new Date(date);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  } catch {
    return date;
  }
};

// ─── Cancel reasons ───────────────────────────────────────────────────────────

const CANCEL_REASONS = [
  "Clinic closed that day",
  "No slots available at that time",
  "Please call to reschedule",
  "Duplicate appointment",
  "Invalid date or time",
];

// ─── Component ────────────────────────────────────────────────────────────────

interface UnifiedPendingAppointment extends PendingAppointment {
  source: 'whatsapp' | 'google-sheet';
}

export default function WhatsAppPendingOverlay({ onAppointmentBooked }: WhatsAppPendingOverlayProps) {
  const [pending, setPending] = useState<UnifiedPendingAppointment[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [view, setView] = useState<"main" | "cancel-reason">("main");
  const [selectedReason, setSelectedReason] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Fetch pending list from both sources ────────────────────────────────────

  const fetchPending = useCallback(async () => {
    try {
      const items: UnifiedPendingAppointment[] = [];

      // Fetch WhatsApp pending appointments
      try {
        const res = await fetch("/api/whatsapp/pending-appointments");
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.pending) {
            const whatsappItems = (data.pending as PendingAppointment[])
              .filter((p) => !p.processed)
              .map((p) => ({ ...p, source: 'whatsapp' as const }));
            items.push(...whatsappItems);
          }
        }
      } catch {
        // silently ignore WhatsApp fetch errors
      }

      // Fetch Google Sheets pending appointments
      try {
        if (typeof window !== 'undefined') {
          const { getUnprocessedAppointments } = await import('@/lib/google-sheets-pending');
          const gsItems = getUnprocessedAppointments().map((p) => ({
            id: p.id,
            name: p.name,
            phone: p.phone,
            date: p.date,
            time: p.time,
            receivedAt: p.receivedAt,
            processed: p.processed,
            source: 'google-sheet' as const,
          }));
          items.push(...gsItems);
        }
      } catch {
        // silently ignore Google Sheets fetch errors
      }

      // Sort by received time
      const sorted = items.sort((a, b) => new Date(a.receivedAt).getTime() - new Date(b.receivedAt).getTime());
      setPending(sorted);
      setCurrentIndex(0);
    } catch {
      // silently ignore fetch errors
    }
  }, []);

  // ── Polling every 15 s ─────────────────────────────────────────────────────

  useEffect(() => {
    fetchPending();
    const id = setInterval(fetchPending, 15_000);
    return () => clearInterval(id);
  }, [fetchPending]);

  // ── Guard: auto-booking enabled → render nothing ───────────────────────────

  const settings = getOnlineAppointmentSettings();
  if (settings.autoBookingEnabled && settings.googleSheetAutoBookingEnabled) return null;

  // ── Guard: nothing pending ─────────────────────────────────────────────────

  if (pending.length === 0) return null;

  const item = pending[currentIndex];
  if (!item) return null;

  // ── Patient lookup ─────────────────────────────────────────────────────────

  const allPatients = patientDb.getAll() as Array<{
    id: string;
    registrationNumber: string;
    firstName?: string;
    lastName?: string;
    fullName?: string;
    mobileNumber?: string;
    alternateMobile?: string;
  }>;

  // Normalise a name string for fuzzy comparison (lowercase, collapse spaces)
  const normName = (n: string) => (n ?? "").toLowerCase().replace(/\s+/g, " ").trim();

  // Candidates: all patients sharing the phone number
  const phoneCandidates = allPatients.filter(
    (p) => p.mobileNumber === item.phone || p.alternateMobile === item.phone
  );

  // Among candidates, prefer the one whose name best matches the WhatsApp name
  const incomingName = normName(item.name);
  const existingPatient =
    phoneCandidates.find((p) => {
      const full = normName(p.fullName ?? `${p.firstName ?? ""} ${p.lastName ?? ""}`);
      return full === incomingName;
    }) ??
    // Partial match: incoming name starts with or contains the stored name (or vice versa)
    phoneCandidates.find((p) => {
      const full = normName(p.fullName ?? `${p.firstName ?? ""} ${p.lastName ?? ""}`);
      return full && (incomingName.includes(full) || full.includes(incomingName));
    }) ??
    null;

  const registrationDisplay = existingPatient
    ? existingPatient.registrationNumber
    : "New Patient";

  // ── Book handler ───────────────────────────────────────────────────────────

  const handleBook = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // 1. Read clinic schedule from localStorage (acceptable in handler)
      let scheduleSettings: {
        openDays?: number[];
        customHolidays?: string[];
        dateOverrides?: Array<{ date: string; slotId: string }>;
      } = {};
      try {
        scheduleSettings = JSON.parse(
          localStorage.getItem("clinicScheduleSettings") || "{}"
        );
      } catch {
        scheduleSettings = {};
      }

      // 2. Parse date
      const normalizedDate = normalizeDateToYYYYMMDD(item.date);
      const [year, month, day] = normalizedDate.split("-").map(Number);
      const appointmentDate = new Date(year, month - 1, day, 0, 0, 0, 0);
      const dayOfWeek = appointmentDate.getDay(); // 0=Sun … 6=Sat

      // 3. Holiday / closed-day validation
      const openDays: number[] = scheduleSettings.openDays ?? [1, 2, 3, 4, 5, 6];
      if (!openDays.includes(dayOfWeek)) {
        setError("Clinic is closed on this day.");
        setIsLoading(false);
        return;
      }

      const customHolidays: string[] = scheduleSettings.customHolidays ?? [];
      if (customHolidays.includes(normalizedDate)) {
        setError("This date is a clinic holiday.");
        setIsLoading(false);
        return;
      }

      const dateOverrides: Array<{ date: string; slotId: string }> =
        scheduleSettings.dateOverrides ?? [];
      const hasAllDayClosure = dateOverrides.some(
        (o) => o.date === normalizedDate && o.slotId === "all"
      );
      if (hasAllDayClosure) {
        setError("Clinic is closed on this date (override).");
        setIsLoading(false);
        return;
      }

      // 4. Slot validation
      const activeSlots = slotDb.getActive() as Array<{
        id: string;
        name: string;
        startTime: string;
        endTime: string;
      }>;

      const [reqH, reqM] = item.time.split(":").map(Number);
      const reqMinutes = reqH * 60 + reqM;

      const matchedSlot = activeSlots.find((slot) => {
        const [sH, sM] = slot.startTime.split(":").map(Number);
        const [eH, eM] = slot.endTime.split(":").map(Number);
        const startMin = sH * 60 + sM;
        const endMin = eH * 60 + eM;
        return reqMinutes >= startMin && reqMinutes <= endMin;
      });

      if (!matchedSlot) {
        setError("No active slot found for the requested time.");
        setIsLoading(false);
        return;
      }

      // 5. Find or create patient — match on phone + name (name is tiebreaker for shared numbers)
      const nameParts = item.name.trim().split(/\s+/);
      const firstName = nameParts[0] ?? item.name;
      const lastName = nameParts.slice(1).join(" ") || "";
      const fullName = item.name;

      const allPts = patientDb.getAll() as Array<{
        id: string;
        registrationNumber: string;
        firstName?: string;
        lastName?: string;
        fullName?: string;
        mobileNumber?: string;
        alternateMobile?: string;
      }>;

      const normN = (n: string) => (n ?? "").toLowerCase().replace(/\s+/g, " ").trim();
      const incomingN = normN(item.name);

      const phonePts = allPts.filter(
        (p) => p.mobileNumber === item.phone || p.alternateMobile === item.phone
      );

      // Exact name match first, then partial
      const matchedPatient =
        phonePts.find((p) => {
          const full = normN(p.fullName ?? `${p.firstName ?? ""} ${p.lastName ?? ""}`);
          return full === incomingN;
        }) ??
        phonePts.find((p) => {
          const full = normN(p.fullName ?? `${p.firstName ?? ""} ${p.lastName ?? ""}`);
          return full && (incomingN.includes(full) || full.includes(incomingN));
        }) ??
        null;

      let patient = matchedPatient as { id: string; registrationNumber: string } | null;

      if (!patient) {
        const created = patientDb.create({
          registrationNumber: "WA-" + Date.now(),
          firstName,
          lastName,
          fullName,
          mobileNumber: item.phone,
          gender: "other",
          dateOfBirth: "",
          email: "",
          address: "",
          bloodGroup: "",
          occupation: "",
          maritalStatus: "",
          tags: [],
          feeExempt: false,
          medicalHistory: "",
          allergies: "",
        }) as unknown as { id: string; registrationNumber: string };
        patient = created;
      }

      // 6. Assign token
      const slotAppointments = appointmentDb.getBySlot(
        appointmentDate,
        matchedSlot.id
      ) as Array<{ tokenNumber?: number }>;
      const maxToken = slotAppointments.reduce(
        (max, a) => Math.max(max, a.tokenNumber ?? 0),
        0
      );
      const tokenNumber = maxToken + 1;

      // 7. Create appointment
      await appointmentDb.create({
        patientId: patient.id,
        patientName: fullName,
        doctorId: "default",
        appointmentDate,
        appointmentTime: item.time,
        duration: 30,
        slotId: matchedSlot.id,
        slotName: matchedSlot.name,
        tokenNumber,
        type: "Free Follow Up",
        status: "scheduled",
        visitMode: "in-person",
        priority: "normal",
        feeAmount: 0,
        feeType: "Free Follow Up",
        feeStatus: "paid",
        isWalkIn: false,
        isOnlineAppointment: true,
        reminderSent: false,
        notes: `Booked via ${item.source === 'google-sheet' ? 'Google Sheet' : 'WhatsApp'}. Phone: ${item.phone}`,
      });

      // 8. Mark processed based on source
      if (item.source === 'whatsapp') {
        const markRes = await fetch("/api/whatsapp/pending-appointments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: item.id }),
        });
        if (!markRes.ok) {
          const d = await markRes.json().catch(() => ({}));
          throw new Error(d.error ?? "Failed to mark appointment as processed");
        }
      } else if (item.source === 'google-sheet') {
        try {
          const { markAsProcessed } = await import('@/lib/google-sheets-pending');
          markAsProcessed(item.id);
        } catch (e) {
          console.warn('[Overlay] Could not mark Google Sheet appointment as processed:', e);
        }
      }

      // 9. Send confirmation message based on source
      if (item.source === 'whatsapp') {
        const DEFAULT_CONFIRMED = `✅ Hi {{name}}, your appointment is confirmed!\n📅 Date: {{date}}\n⏰ Time: {{time}}\n🏥 Slot: {{slot}}\n🔢 Token: {{token}}\n\nPlease arrive 10 minutes early. Thank you!`;
        let confirmedTpl = DEFAULT_CONFIRMED;
        try {
          const tplRes = await fetch("/api/whatsapp/settings");
          const tplData = await tplRes.json();
          if (tplData.templates?.confirmed) confirmedTpl = tplData.templates.confirmed;
        } catch { /* use default */ }

        const fillTemplate = (tpl: string, vars: Record<string, string>) =>
          Object.entries(vars).reduce((msg, [k, v]) => msg.replaceAll(`{{${k}}}`, v), tpl);

        const confirmMsg = fillTemplate(confirmedTpl, {
          name: item.name,
          date: fmtDate(normalizedDate),
          time: fmtTime(item.time),
          slot: matchedSlot.name,
          token: String(tokenNumber),
          phone: item.phone,
          regd: (patient as any).registrationNumber || "",
        });

        fetch("/api/whatsapp/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            phone: (item as any).chatId ?? item.phone,
            message: confirmMsg,
          }),
        }).catch((e) => console.warn("[WhatsApp] Confirmation send failed:", e));
      }

      // 10. Notify parent and re-fetch
      onAppointmentBooked();
      await fetchPending();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Booking failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  // ── Cancel confirm handler ─────────────────────────────────────────────────

  const handleConfirmCancel = async () => {
    if (!selectedReason) {
      setError("Please select a reason");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const normalizedDate = normalizeDateToYYYYMMDD(item.date);

      // 1. Mark rejected based on source
      if (item.source === 'whatsapp') {
        const rejectRes = await fetch("/api/whatsapp/pending-appointments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: item.id,
            rejected: true,
            rejectReason: selectedReason,
          }),
        });
        if (!rejectRes.ok) {
          const d = await rejectRes.json().catch(() => ({}));
          throw new Error(d.error ?? "Failed to cancel appointment");
        }
      } else if (item.source === 'google-sheet') {
        try {
          const { markAsRejected } = await import('@/lib/google-sheets-pending');
          markAsRejected(item.id, selectedReason);
        } catch (e) {
          console.warn('[Overlay] Could not mark Google Sheet appointment as rejected:', e);
        }
      }

      // 2. Send cancellation message (WhatsApp only)
      if (item.source === 'whatsapp') {
        const DEFAULT_CANCEL = `❌ Hi {{name}}, we are unable to book your appointment on {{date}} at {{time}}.\nReason: {{reason}}\nPlease contact us to reschedule. Thank you.`;
        let cancelTpl = DEFAULT_CANCEL;
        try {
          const tplRes = await fetch("/api/whatsapp/settings");
          const tplData = await tplRes.json();
          if (tplData.templates?.cancelOverlay) cancelTpl = tplData.templates.cancelOverlay;
          else if (tplData.templates?.cancelled) cancelTpl = tplData.templates.cancelled;
        } catch { /* use default */ }

        const fillCancelTemplate = (tpl: string, vars: Record<string, string>) =>
          Object.entries(vars).reduce((msg, [k, v]) => msg.replaceAll(`{{${k}}}`, v), tpl);

        const cancelMsg = fillCancelTemplate(cancelTpl, {
          name: item.name,
          date: fmtDate(normalizedDate),
          time: fmtTime(item.time),
          reason: selectedReason,
          phone: item.phone,
          regd: existingPatient?.registrationNumber ?? "",
        });

        fetch("/api/whatsapp/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            phone: (item as any).chatId ?? item.phone,
            message: cancelMsg,
          }),
        }).catch((e) => console.warn("[WhatsApp] Cancellation send failed:", e));
      }

      // 3. Re-fetch and reset view
      await fetchPending();
      setView("main");
      setSelectedReason("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cancellation failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  const normalizedDate = normalizeDateToYYYYMMDD(item.date);

  return (
    <div
      className="fixed bottom-4 right-4 z-50 w-80 rounded-xl shadow-2xl border border-gray-200 bg-white overflow-hidden"
      style={{ maxWidth: 320 }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 bg-green-600 text-white">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="currentColor"
          className="w-5 h-5 flex-shrink-0"
        >
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
          <path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.554 4.118 1.528 5.852L0 24l6.335-1.652A11.954 11.954 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.818 9.818 0 01-5.006-1.374l-.36-.213-3.76.98 1.006-3.658-.234-.376A9.818 9.818 0 1112 21.818z" />
        </svg>
        <span className="font-semibold text-sm flex-1">
          {item.source === 'google-sheet' ? 'Google Sheet' : 'WhatsApp'} Appointment
        </span>
        <span className="text-xs bg-green-700 rounded-full px-2 py-0.5">
          {currentIndex + 1} of {pending.length} pending
        </span>
      </div>

      {/* Body */}
      <div className="px-4 py-3 space-y-2 text-sm">
        {view === "main" ? (
          <>
            {/* Patient info */}
            <div className="space-y-1">
              <div className="flex justify-between">
                <span className="text-gray-500">Patient</span>
                <span className="font-medium text-gray-800">{item.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Mobile</span>
                <span className="font-medium text-gray-800">{item.phone}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Regd No.</span>
                <span
                  className={`font-medium ${
                    existingPatient ? "text-gray-800" : "text-blue-600"
                  }`}
                >
                  {registrationDisplay}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Date</span>
                <span className="font-medium text-gray-800">{fmtDate(normalizedDate)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Time</span>
                <span className="font-medium text-gray-800">{fmtTime(item.time)}</span>
              </div>
            </div>

            {/* Error */}
            {error && (
              <p className="text-red-600 text-xs bg-red-50 rounded px-2 py-1">{error}</p>
            )}

            {/* Actions */}
            <div className="flex gap-2 pt-1">
              <button
                onClick={handleBook}
                disabled={isLoading}
                className="flex-1 bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-semibold py-2 rounded-lg transition-colors"
              >
                {isLoading ? "Booking..." : "Book"}
              </button>
              <button
                onClick={() => {
                  setView("cancel-reason");
                  setError(null);
                }}
                disabled={isLoading}
                className="flex-1 bg-red-50 hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed text-red-600 text-xs font-semibold py-2 rounded-lg border border-red-200 transition-colors"
              >
                Cancel
              </button>
            </div>
          </>
        ) : (
          <>
            {/* Cancel reason view */}
            <p className="text-gray-600 text-xs">
              Select a reason to send to the patient:
            </p>
            <select
              value={selectedReason}
              onChange={(e) => {
                setSelectedReason(e.target.value);
                setError(null);
              }}
              className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs text-gray-800 focus:outline-none focus:ring-2 focus:ring-red-400"
            >
              <option value="">— Select a reason —</option>
              {CANCEL_REASONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>

            {/* Error */}
            {error && (
              <p className="text-red-600 text-xs bg-red-50 rounded px-2 py-1">{error}</p>
            )}

            {/* Actions */}
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => {
                  setView("main");
                  setSelectedReason("");
                  setError(null);
                }}
                disabled={isLoading}
                className="flex-1 bg-gray-100 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed text-gray-700 text-xs font-semibold py-2 rounded-lg transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleConfirmCancel}
                disabled={isLoading}
                className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-semibold py-2 rounded-lg transition-colors"
              >
                {isLoading ? "Cancelling..." : "Confirm Cancel"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
