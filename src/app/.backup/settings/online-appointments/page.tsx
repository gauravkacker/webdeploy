"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/layout/SidebarComponent";
import { Header } from "@/components/layout/Header";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { getCurrentUser } from "@/lib/permissions";
import { syncAppointmentsFromGoogleSheet, startGoogleSheetPolling, stopGoogleSheetPolling } from "@/lib/google-sheets-sync";

export default function OnlineAppointmentsSettings() {
  const router = useRouter();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [googleSheetLink, setGoogleSheetLink] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(false);
  const [syncInterval, setSyncInterval] = useState(5);
  const [lastSyncTime, setLastSyncTime] = useState<string>("");
  const [appointmentSource, setAppointmentSource] = useState<"googleSheet" | "whatsappParser">("googleSheet");
  const [whatsappWebKeyword, setWhatsappWebKeyword] = useState("Book");

  const DEFAULT_TEMPLATES = {
    confirmed: `✅ Hi {{name}}, your appointment is confirmed!\n📅 Date: {{date}}\n⏰ Time: {{time}}\n🏥 Slot: {{slot}}\n🔢 Token: {{token}}\n\nPlease arrive 10 minutes early. Thank you!`,
    duplicate: `Hi {{name}}, your appointment on {{date}} at {{time}} is already booked. No action needed.`,
    closedDay: `Hi {{name}}, sorry we cannot book your appointment on {{date}} — the clinic is closed on {{dayName}}s. Please choose another date.`,
    holiday: `Hi {{name}}, sorry we cannot book your appointment on {{date}} — it is a holiday. Please choose another date.`,
    closedDate: `Hi {{name}}, sorry the clinic is closed on {{date}}. Please choose another date.`,
    noSlot: `Hi {{name}}, sorry we could not book your appointment at {{time}} on {{date}} — no available slot at that time. Please try a different time.`,
    reminder: `🔔 Reminder: Hi {{name}}, your next visit is tomorrow — {{date}}.\nPlease arrive 10 minutes early. See you soon!`,
    reminderToday: `🔔 Reminder: Hi {{name}}, your appointment is today — {{date}}.\nPlease arrive 10 minutes early. See you soon!`,
    cancelled: `❌ Hi {{name}}, your appointment on {{date}} at {{time}} has been cancelled. Please contact us to reschedule.`,
    manualBooking: `✅ Hi {{name}}, your appointment is confirmed!\n📅 Date: {{date}}\n⏰ Time: {{time}}\n🏥 Slot: {{slot}}\n🔢 Token: {{token}}\n\nPlease arrive 10 minutes early. Thank you!`,
  };
  const [msgTemplates, setMsgTemplates] = useState({ ...DEFAULT_TEMPLATES });
  const [templatesSaved, setTemplatesSaved] = useState(false);
  const [showAllEmojis, setShowAllEmojis] = useState(false);
  const [activeTemplate, setActiveTemplate] = useState<keyof typeof DEFAULT_TEMPLATES>("confirmed");

  // WhatsApp QR / whatsapp-web.js state
  const [waStatus, setWaStatus] = useState<"disconnected" | "qr" | "connecting" | "connected">("disconnected");
  const [waQrDataUrl, setWaQrDataUrl] = useState<string | null>(null);
  const [waPhone, setWaPhone] = useState<string | null>(null);
  const [waMessages, setWaMessages] = useState<any[]>([]);
  const [waServerError, setWaServerError] = useState(false);
  const [waStarting, setWaStarting] = useState(false);
  const [waAppointmentLogs, setWaAppointmentLogs] = useState<any[]>([]);
  const [waLogsLoading, setWaLogsLoading] = useState(false);
  const [waLogsExpanded, setWaLogsExpanded] = useState(false);
  const [autoRepliesEnabled, setAutoRepliesEnabled] = useState(true);
  const [autoBookingEnabled, setAutoBookingEnabled] = useState(true);
  const [notificationSoundEnabled, setNotificationSoundEnabled] = useState(true);
  const [googleSheetAutoBookingEnabled, setGoogleSheetAutoBookingEnabled] = useState(true);

  // Check authentication on mount
  useEffect(() => {
    const user = getCurrentUser();
    if (!user) {
      router.push("/login");
    }
  }, [router]);

  // Load settings from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("onlineAppointmentsSettings");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setGoogleSheetLink(parsed.googleSheetLink || "");
        setAutoSyncEnabled(parsed.autoSyncEnabled || false);
        setSyncInterval(parsed.syncInterval || 5);
        setLastSyncTime(parsed.lastSyncTime || "");
        setAppointmentSource(parsed.appointmentSource || "googleSheet");
        if (parsed.whatsappWebKeyword) setWhatsappWebKeyword(parsed.whatsappWebKeyword);
        if (parsed.autoRepliesEnabled !== undefined) setAutoRepliesEnabled(parsed.autoRepliesEnabled);
        if (parsed.autoBookingEnabled !== undefined) setAutoBookingEnabled(parsed.autoBookingEnabled);
        if (parsed.notificationSoundEnabled !== undefined) setNotificationSoundEnabled(parsed.notificationSoundEnabled);
        if (parsed.googleSheetAutoBookingEnabled !== undefined) setGoogleSheetAutoBookingEnabled(parsed.googleSheetAutoBookingEnabled);
      } catch (e) {
        console.error("Failed to load online appointments settings:", e);
      }
    }

    // Load message templates from server
    fetch('/api/whatsapp/settings')
      .then(r => r.json())
      .then(data => { if (data.templates) setMsgTemplates(t => ({ ...t, ...data.templates })); })
      .catch(() => {});

    // Load WhatsApp appointment logs
    const loadWaLogs = async () => {
      try {
        const res = await fetch('/api/whatsapp/pending-appointments?all=true');
        const data = await res.json();
        if (data.success) {
          const sorted = (data.pending || []).sort((a: any, b: any) =>
            new Date(b.receivedAt || 0).getTime() - new Date(a.receivedAt || 0).getTime()
          );
          setWaAppointmentLogs(sorted);
        }
      } catch { /* server not reachable */ }
    };
    loadWaLogs();
  }, []);

  // Handle auto-sync polling
  useEffect(() => {
    let timerId: NodeJS.Timeout | null = null;

    if (autoSyncEnabled && googleSheetLink) {
      console.log(`[Online Appointments] Starting auto-sync with interval: ${syncInterval} minutes`);
      timerId = startGoogleSheetPolling(googleSheetLink, syncInterval);
    } else if (autoSyncEnabled && !googleSheetLink) {
      console.warn('[Online Appointments] Auto-sync enabled but no Google Sheet link provided');
    }

    return () => {
      if (timerId) {
        console.log('[Online Appointments] Stopping auto-sync');
        stopGoogleSheetPolling(timerId);
      }
    };
  }, [autoSyncEnabled, googleSheetLink, syncInterval]);

  // Listen for sync completion events to update last sync time
  useEffect(() => {
    const handleSyncComplete = (event: any) => {
      const detail = event.detail || {};
      if (detail.success) {
        const timestamp = new Date().toLocaleString();
        setLastSyncTime(timestamp);
        
        // Update localStorage
        const saved = localStorage.getItem("onlineAppointmentsSettings");
        if (saved) {
          const parsed = JSON.parse(saved);
          parsed.lastSyncTime = timestamp;
          localStorage.setItem("onlineAppointmentsSettings", JSON.stringify(parsed));
        }
        
        console.log(`[Online Appointments] Updated last sync time: ${timestamp}`);
      }
    };
    
    if (typeof window !== 'undefined') {
      window.addEventListener('googleSheetSyncComplete', handleSyncComplete);
      
      // Also poll localStorage every 5 seconds to catch updates from other tabs/processes
      const pollInterval = setInterval(() => {
        const saved = localStorage.getItem("onlineAppointmentsSettings");
        if (saved) {
          try {
            const parsed = JSON.parse(saved);
            if (parsed.lastSyncTime && parsed.lastSyncTime !== lastSyncTime) {
              setLastSyncTime(parsed.lastSyncTime);
              console.log(`[Online Appointments] Detected updated last sync time: ${parsed.lastSyncTime}`);
            }
          } catch (e) {
            console.error('[Online Appointments] Error parsing settings:', e);
          }
        }
      }, 5000);
      
      return () => {
        window.removeEventListener('googleSheetSyncComplete', handleSyncComplete);
        clearInterval(pollInterval);
      };
    }
  }, [lastSyncTime]);

  // Poll WhatsApp server status + connect WebSocket
  useEffect(() => {
    if (appointmentSource !== "whatsappParser") return;

    let ws: WebSocket | null = null;
    let pollTimer: NodeJS.Timeout | null = null;

    const fetchStatus = async () => {
      try {
        const res = await fetch('/api/whatsapp/status');
        const data = await res.json();
        if (data.error) { setWaServerError(true); return; }
        setWaServerError(false);
        setWaStatus(data.status);
        if (data.qrDataUrl) setWaQrDataUrl(data.qrDataUrl);
        if (data.phoneNumber) setWaPhone(data.phoneNumber);
      } catch {
        setWaServerError(true);
      }
    };

    const connectWs = () => {
      try {
        const wsUrl = (process.env.NEXT_PUBLIC_WHATSAPP_WS_URL || 'ws://localhost:3001');
        ws = new WebSocket(wsUrl);
        ws.onmessage = (e) => {
          try {
            const msg = JSON.parse(e.data);
            if (msg.type === 'qr') { setWaQrDataUrl(msg.qrDataUrl); setWaStatus('qr'); }
            else if (msg.type === 'authenticated') { setWaStatus('connecting'); setWaQrDataUrl(null); }
            else if (msg.type === 'ready') { setWaStatus('connected'); setWaPhone(msg.phoneNumber); setWaQrDataUrl(null); }
            else if (msg.type === 'disconnected') { setWaStatus('disconnected'); setWaPhone(null); }
            else if (msg.type === 'message') {
              setWaMessages(prev => [msg.data, ...prev].slice(0, 20));
            } else if (msg.type === 'state') {
              setWaStatus(msg.status);
              if (msg.qrDataUrl) setWaQrDataUrl(msg.qrDataUrl);
              if (msg.phoneNumber) setWaPhone(msg.phoneNumber);
            }
          } catch {}
        };
        ws.onerror = () => setWaServerError(true);
        ws.onopen = () => setWaServerError(false);
      } catch {}
    };

    fetchStatus();
    connectWs();
    // Fallback poll every 5s in case WS fails
    pollTimer = setInterval(fetchStatus, 5000);

    return () => {
      ws?.close();
      if (pollTimer) clearInterval(pollTimer);
    };
  }, [appointmentSource]);

  const handleWaDisconnect = async () => {
    await fetch('/api/whatsapp/disconnect', { method: 'POST' });
    setWaStatus('disconnected');
    setWaPhone(null);
    setWaQrDataUrl(null);
  };

  const handleStartWaServer = async () => {
    setWaStarting(true);
    try {
      const res = await fetch('/api/whatsapp/start', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setWaServerError(false);
        // Trigger a status refresh
        const statusRes = await fetch('/api/whatsapp/status');
        const statusData = await statusRes.json();
        if (!statusData.error) {
          setWaStatus(statusData.status);
          if (statusData.qrDataUrl) setWaQrDataUrl(statusData.qrDataUrl);
        }
      }
    } catch {
      // still show error
    } finally {
      setWaStarting(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveMessage("");

    try {
      if (googleSheetLink.trim()) {
        try {
          new URL(googleSheetLink);
        } catch {
          setSaveMessage("Invalid URL format. Please enter a valid Google Sheet link.");
          setIsSaving(false);
          return;
        }
      }

      const settings = {
        googleSheetLink: googleSheetLink.trim(),
        autoSyncEnabled,
        syncInterval,
        lastSyncTime,
        appointmentSource,
        whatsappWebKeyword: whatsappWebKeyword.trim() || 'Book',
        autoRepliesEnabled,
        autoBookingEnabled,
        notificationSoundEnabled,
        googleSheetAutoBookingEnabled,
      };
      localStorage.setItem("onlineAppointmentsSettings", JSON.stringify(settings));

      // Persist booking keyword to server so the webhook can use it
      try {
        await fetch('/api/whatsapp/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bookingKeyword: whatsappWebKeyword.trim() || 'book' }),
        });
      } catch { /* non-critical */ }

      setSaveMessage("Settings saved successfully!");
      setTimeout(() => setSaveMessage(""), 3000);
    } catch (error) {
      console.error("Error saving settings:", error);
      setSaveMessage("Error saving settings. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleManualSync = async () => {
    if (!googleSheetLink.trim()) {
      setSyncMessage("Please enter a Google Sheet link first.");
      return;
    }

    setIsSyncing(true);
    setSyncMessage("");

    try {
      const result = await syncAppointmentsFromGoogleSheet(googleSheetLink);
      
      if (result.success) {
        const timestamp = new Date().toLocaleString();
        setLastSyncTime(timestamp);
        
        const saved = localStorage.getItem("onlineAppointmentsSettings");
        if (saved) {
          const parsed = JSON.parse(saved);
          parsed.lastSyncTime = timestamp;
          localStorage.setItem("onlineAppointmentsSettings", JSON.stringify(parsed));
        }

        setSyncMessage(
          `✓ ${result.message} (${result.appointmentsCreated} created, ${result.appointmentsSkipped} skipped)`
        );
      } else {
        setSyncMessage(`✗ ${result.message}`);
      }

      if (result.errors.length > 0) {
        console.warn("Sync errors:", result.errors);
      }
      
      // Dispatch event to notify other pages (like appointments) to refresh
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('googleSheetSyncComplete', { 
          detail: { 
            appointmentsCreated: result.appointmentsCreated, 
            appointmentsSkipped: result.appointmentsSkipped,
            success: result.success,
            message: result.message
          }
        }));
        
        // Play notification sound
        try {
          const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAAB9AAACABAAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBg==');
          audio.play().catch(() => {});
        } catch (e) {
          console.log('[Google Sheets Sync] Could not play notification sound');
        }
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      setSyncMessage(`✗ Sync failed: ${errorMsg}`);
      console.error("Sync error:", error);
    } finally {
      setIsSyncing(false);
      setTimeout(() => setSyncMessage(""), 5000);
    }
  };

  const handleClear = () => {
    setGoogleSheetLink("");
    setSaveMessage("");
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar />

      <div className={`transition-all duration-300 ${sidebarCollapsed ? "ml-16" : "ml-64"}`}>
        <Header
          title="Online Appointments"
          subtitle="Configure online appointment settings and integrations"
        />

        <main className="p-6">
          <div className={appointmentSource === "whatsappParser" ? "max-w-6xl" : "max-w-2xl"}>

            {/* WhatsApp Status — always visible at top when option 2 is selected */}
            {appointmentSource === "whatsappParser" && (
              <div className={`mb-4 flex items-center justify-between px-4 py-2.5 rounded-lg border text-sm ${
                waServerError ? 'bg-red-50 border-red-200' :
                waStatus === 'connected' ? 'bg-green-50 border-green-200' :
                waStatus === 'qr' ? 'bg-yellow-50 border-yellow-200' :
                waStatus === 'connecting' ? 'bg-blue-50 border-blue-200' :
                'bg-gray-50 border-gray-200'
              }`}>
                <span className="font-medium text-gray-700">WhatsApp:</span>
                <span className={`font-semibold ml-2 ${
                  waServerError ? 'text-red-600' :
                  waStatus === 'connected' ? 'text-green-600' :
                  waStatus === 'qr' ? 'text-yellow-600' :
                  waStatus === 'connecting' ? 'text-blue-600' :
                  'text-gray-500'
                }`}>
                  {waServerError ? '🔴 Server not running' :
                   waStatus === 'connected' ? `🟢 Connected${waPhone ? ` (+${waPhone})` : ''}` :
                   waStatus === 'qr' ? '📱 Scan QR Code' :
                   waStatus === 'connecting' ? '🔄 Connecting...' :
                   '⚫ Disconnected'}
                </span>
                {waStatus === 'connected' ? (
                  <button onClick={handleWaDisconnect} className="ml-auto text-xs text-gray-500 hover:text-red-600 underline">Disconnect</button>
                ) : (
                  <button onClick={handleWaDisconnect} className="ml-auto text-xs text-gray-500 hover:text-blue-600 underline">Reset Connection</button>
                )}
                {waServerError && (
                  <button onClick={handleStartWaServer} disabled={waStarting} className="ml-auto text-xs bg-red-600 text-white px-2 py-1 rounded hover:bg-red-700">
                    {waStarting ? 'Starting...' : '▶ Start Server'}
                  </button>
                )}
              </div>
            )}

            {/* Appointment Source Selection — compact */}
            <Card className="mb-4">
              <div className="px-4 py-3 flex items-center gap-4">
                <span className="text-sm font-medium text-gray-700 whitespace-nowrap">Appointment Source:</span>
                <label className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border cursor-pointer text-sm transition-colors ${appointmentSource === 'googleSheet' ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                  <input type="radio" name="appointmentSource" value="googleSheet" checked={appointmentSource === 'googleSheet'} onChange={() => setAppointmentSource('googleSheet')} className="w-3.5 h-3.5" />
                  Google Sheet
                </label>
                <label className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border cursor-pointer text-sm transition-colors ${appointmentSource === 'whatsappParser' ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                  <input type="radio" name="appointmentSource" value="whatsappParser" checked={appointmentSource === 'whatsappParser'} onChange={() => setAppointmentSource('whatsappParser')} className="w-3.5 h-3.5" />
                  WhatsApp Parser
                </label>
                <button onClick={handleSave} disabled={isSaving} className="ml-auto text-xs bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700 disabled:opacity-50">
                  {isSaving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </Card>

            {/* WhatsApp Parser Section */}
            {appointmentSource === "whatsappParser" && (
              <Card className="mb-6">
                <CardHeader
                  title="WhatsApp Parser Settings"
                  subtitle="Configure booking keyword, reply templates, and controls"
                />

                <div className="p-4 grid grid-cols-2 gap-4 items-start">

                  {/* ── LEFT COLUMN ── */}
                  <div className="space-y-4">

                    {/* Toggles */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <label className="block text-sm font-medium text-gray-700">Auto WhatsApp Replies</label>
                          <p className="text-xs text-gray-500">Send automatic reply messages to patients</p>
                        </div>
                        <button
                          onClick={() => setAutoRepliesEnabled(v => !v)}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${autoRepliesEnabled ? "bg-blue-600" : "bg-gray-300"}`}
                        >
                          <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${autoRepliesEnabled ? "translate-x-6" : "translate-x-1"}`} />
                        </button>
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <label className="block text-sm font-medium text-gray-700">Auto Online Booking</label>
                          <p className="text-xs text-gray-500">Auto-create appointments (requests still logged)</p>
                        </div>
                        <button
                          onClick={() => setAutoBookingEnabled(v => !v)}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${autoBookingEnabled ? "bg-blue-600" : "bg-gray-300"}`}
                        >
                          <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${autoBookingEnabled ? "translate-x-6" : "translate-x-1"}`} />
                        </button>
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <label className="block text-sm font-medium text-gray-700">Notification Sound</label>
                          <p className="text-xs text-gray-500">Play bell sound when booking notifications arrive</p>
                        </div>
                        <button
                          onClick={() => setNotificationSoundEnabled(v => !v)}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${notificationSoundEnabled ? "bg-blue-600" : "bg-gray-300"}`}
                        >
                          <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${notificationSoundEnabled ? "translate-x-6" : "translate-x-1"}`} />
                        </button>
                      </div>
                    </div>

                    {/* Keyword */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Keyword to Monitor</label>
                      <input
                        type="text"
                        value={whatsappWebKeyword}
                        onChange={(e) => setWhatsappWebKeyword(e.target.value)}
                        placeholder="e.g., Book, Appointment, Schedule"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                      />
                      <p className="text-xs text-gray-500 mt-1">Messages containing this keyword will be parsed</p>
                    </div>

                    <Button variant="primary" onClick={handleSave} disabled={isSaving}>
                      {isSaving ? "Saving..." : "Save Settings"}
                    </Button>

                    {/* placeholder — rest of left column continues below */}
                    {/* WhatsApp Connection */}
                    <div className="pt-3 border-t border-gray-200">
                      <h3 className="text-sm font-semibold text-gray-900 mb-2">WhatsApp Connection</h3>
                      {waServerError ? (
                        <div className="p-3 bg-red-50 rounded-lg border border-red-200">
                          <p className="text-xs text-red-600">Run manually: <code className="font-mono">node whatsapp-server.js</code></p>
                          <p className="text-xs text-red-500 mt-1">First time? Run: <code className="font-mono">npm install whatsapp-web.js qrcode express ws</code></p>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {waStatus === "qr" && waQrDataUrl && (
                            <div className="flex flex-col items-center p-3 bg-white rounded-lg border-2 border-yellow-300">
                              <p className="text-xs font-medium text-gray-700 mb-2 text-center">WhatsApp → Linked Devices → Link a Device</p>
                              <img src={waQrDataUrl} alt="WhatsApp QR Code" className="w-40 h-40" />
                              <p className="text-xs text-gray-500 mt-1">QR refreshes automatically</p>
                            </div>
                          )}
                          {waStatus === "connecting" && (
                            <div className="p-2 bg-blue-50 rounded-lg border border-blue-200 text-center">
                              <p className="text-xs text-blue-700">Authenticating with WhatsApp...</p>
                            </div>
                          )}
                          {waStatus === "connected" && <p className="text-xs text-green-600">🟢 Connected{waPhone ? ` (+${waPhone})` : ''}</p>}
                          {waStatus === "disconnected" && !waServerError && <p className="text-xs text-gray-500">⚫ Disconnected — start the server to connect</p>}
                        </div>
                      )}
                    </div>

                    {/* Appointment Log */}
                    <div className="pt-3 border-t border-gray-200">
                      <div className="flex items-center justify-between mb-2">
                        <button
                          onClick={() => setWaLogsExpanded(v => !v)}
                          className="flex items-center gap-1.5 text-sm font-semibold text-gray-900 hover:text-blue-700"
                        >
                          <span>{waLogsExpanded ? '▾' : '▸'}</span>
                          Appointment Log
                          {waAppointmentLogs.length > 0 && (
                            <span className="text-xs font-normal text-gray-500">({waAppointmentLogs.length})</span>
                          )}
                        </button>
                        <button
                          onClick={async () => {
                            setWaLogsLoading(true);
                            try {
                              const res = await fetch('/api/whatsapp/pending-appointments?all=true');
                              const data = await res.json();
                              if (data.success) {
                                const sorted = (data.pending || []).sort((a: any, b: any) =>
                                  new Date(b.receivedAt || 0).getTime() - new Date(a.receivedAt || 0).getTime()
                                );
                                setWaAppointmentLogs(sorted);
                              }
                            } catch { /* ignore */ }
                            setWaLogsLoading(false);
                          }}
                          className="text-xs text-blue-600 hover:text-blue-800 underline"
                        >
                          {waLogsLoading ? "Refreshing..." : "↻ Refresh"}
                        </button>
                      </div>
                      {waAppointmentLogs.length === 0 ? (
                        <p className="text-xs text-gray-500">No appointment requests yet.</p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs border-collapse">
                            <thead>
                              <tr className="bg-gray-100 text-gray-600">
                                <th className="text-left px-2 py-1.5 border border-gray-200">Name</th>
                                <th className="text-left px-2 py-1.5 border border-gray-200">Date</th>
                                <th className="text-left px-2 py-1.5 border border-gray-200">Time</th>
                                <th className="text-left px-2 py-1.5 border border-gray-200">Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(waLogsExpanded ? waAppointmentLogs : waAppointmentLogs.slice(0, 3)).map((log: any) => {
                                const isBooked = log.processed && !log.rejected;
                                const isRejected = log.rejected;
                                const isPending = !log.processed;
                                return (
                                  <tr key={log.id} className="hover:bg-gray-50">
                                    <td className="px-2 py-1.5 border border-gray-200 font-medium">{log.name || '—'}</td>
                                    <td className="px-2 py-1.5 border border-gray-200">{log.date || '—'}</td>
                                    <td className="px-2 py-1.5 border border-gray-200">{log.time || '—'}</td>
                                    <td className="px-2 py-1.5 border border-gray-200">
                                      {isBooked && <span className="px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">Booked</span>}
                                      {isRejected && <span className="px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 font-medium" title={log.rejectReason || ''}>Rejected</span>}
                                      {isPending && <span className="px-1.5 py-0.5 rounded-full bg-yellow-100 text-yellow-700 font-medium">Pending</span>}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                          {waAppointmentLogs.length > 3 && (
                            <button onClick={() => setWaLogsExpanded(v => !v)} className="mt-1.5 text-xs text-blue-600 hover:text-blue-800 underline">
                              {waLogsExpanded ? '▲ Show less' : `▼ Show all ${waAppointmentLogs.length}`}
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Recent captured messages */}
                    {waMessages.length > 0 && (
                      <div className="pt-3 border-t border-gray-200">
                        <p className="text-sm font-medium text-gray-700 mb-2">Recent Captured Messages</p>
                        <div className="space-y-1.5 max-h-36 overflow-y-auto">
                          {waMessages.map((m, i) => (
                            <div key={i} className="p-2 bg-green-50 rounded border border-green-200 text-xs">
                              <div className="flex justify-between text-gray-500 mb-0.5">
                                <span className="font-medium">{m.from}</span>
                                <span>{new Date(m.timestamp).toLocaleTimeString()}</span>
                              </div>
                              <p className="text-gray-700">{m.text}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* ── RIGHT COLUMN: reply templates ── */}
                  <div className="border-l border-gray-200 pl-4">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <p className="text-sm font-medium text-gray-700">Reply Message Templates</p>
                        <p className="text-xs text-gray-500 mt-0.5">Customize messages sent to patients</p>
                      </div>
                      <button
                        onClick={() => setMsgTemplates({ ...DEFAULT_TEMPLATES })}
                        className="text-xs text-gray-500 hover:text-gray-700 underline"
                      >
                        Reset defaults
                      </button>
                    </div>

                    {/* Variable chips */}
                    <div className="mb-3">
                      <p className="text-xs text-gray-500 mb-1.5">Click to insert at cursor:</p>
                      <div className="flex flex-wrap gap-1.5">
                        {[
                          { label: '{{name}}', desc: 'Patient name' },
                          { label: '{{date}}', desc: 'Appointment date' },
                          { label: '{{time}}', desc: 'Appointment time' },
                          { label: '{{slot}}', desc: 'Slot name' },
                          { label: '{{token}}', desc: 'Token number' },
                          { label: '{{dayName}}', desc: 'Day of week' },
                          { label: '{{mobile}}', desc: 'Patient mobile (10 digits)' },
                              { label: '{{regd}}', desc: 'Registration number' },
                        ].map(v => (
                          <button
                            key={v.label}
                            title={v.desc}
                            onClick={() => {
                              const ta = document.getElementById('tpl-' + activeTemplate) as HTMLTextAreaElement;
                              if (!ta) return;
                              const start = ta.selectionStart;
                              const end = ta.selectionEnd;
                              const current = msgTemplates[activeTemplate];
                              const updated = current.slice(0, start) + v.label + current.slice(end);
                              setMsgTemplates(t => ({ ...t, [activeTemplate]: updated }));
                              setTimeout(() => { ta.focus(); ta.setSelectionRange(start + v.label.length, start + v.label.length); }, 0);
                            }}
                            className="px-2 py-0.5 bg-blue-50 border border-blue-200 text-blue-700 rounded text-xs font-mono hover:bg-blue-100"
                          >
                            {v.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Template tabs */}
                    <div className="flex flex-wrap gap-1 mb-2">
                      {(Object.keys(DEFAULT_TEMPLATES) as Array<keyof typeof DEFAULT_TEMPLATES>).map(key => {
                        const labels: Record<string, string> = {
                          confirmed: '✅ Confirmed',
                          duplicate: '🔁 Duplicate',
                          closedDay: '🚫 Closed Day',
                          holiday: '🎉 Holiday',
                          closedDate: '📅 Closed Date',
                          noSlot: '⏰ No Slot',
                          reminder: '🔔 Reminder (Tomorrow)',
                          reminderToday: '🔔 Reminder (Today)',
                          cancelled: '❌ Cancelled',
                          manualBooking: '📋 Manual Booking',
                        };
                        return (
                          <button
                            key={key}
                            onClick={() => setActiveTemplate(key)}
                            className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors ${
                              activeTemplate === key
                                ? 'bg-blue-600 text-white border-blue-600'
                                : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'
                            }`}
                          >
                            {labels[key]}
                          </button>
                        );
                      })}
                    </div>

                    <textarea
                      id={'tpl-' + activeTemplate}
                      value={msgTemplates[activeTemplate]}
                      onChange={e => setMsgTemplates(t => ({ ...t, [activeTemplate]: e.target.value }))}
                      rows={7}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />

                    <div className="flex items-center gap-3 mt-2">
                      <button
                        onClick={async () => {
                          await fetch('/api/whatsapp/settings', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ templates: msgTemplates }),
                          });
                          setTemplatesSaved(true);
                          setTimeout(() => setTemplatesSaved(false), 2500);
                        }}
                        className="px-3 py-1.5 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700"
                      >
                        Save Templates
                      </button>
                      {templatesSaved && <span className="text-xs text-green-600">✓ Saved</span>}
                    </div>

                    {/* Formatting buttons */}
                    <div className="mt-3 pt-3 border-t border-gray-100">
                      <p className="text-xs text-gray-500 mb-1.5">WhatsApp formatting (wraps selected text):</p>
                      <div className="flex flex-wrap gap-1.5 mb-3">
                        {[
                          { label: 'B', wrap: '*', title: 'Bold — *text*', style: 'font-bold' },
                          { label: 'I', wrap: '_', title: 'Italic — _text_', style: 'italic' },
                          { label: 'S', wrap: '~', title: 'Strikethrough — ~text~', style: 'line-through' },
                          { label: 'M', wrap: '```', title: 'Monospace — ```text```', style: 'font-mono' },
                        ].map(f => (
                          <button
                            key={f.wrap}
                            title={f.title}
                            onClick={() => {
                              const ta = document.getElementById('tpl-' + activeTemplate) as HTMLTextAreaElement;
                              if (!ta) return;
                              const start = ta.selectionStart;
                              const end = ta.selectionEnd;
                              const selected = msgTemplates[activeTemplate].slice(start, end);
                              const wrapped = f.wrap + (selected || 'text') + f.wrap;
                              const updated = msgTemplates[activeTemplate].slice(0, start) + wrapped + msgTemplates[activeTemplate].slice(end);
                              setMsgTemplates(t => ({ ...t, [activeTemplate]: updated }));
                              const newPos = start + f.wrap.length + (selected || 'text').length + f.wrap.length;
                              setTimeout(() => { ta.focus(); ta.setSelectionRange(newPos, newPos); }, 0);
                            }}
                            className={`w-7 h-7 bg-gray-100 border border-gray-300 text-gray-700 rounded text-xs hover:bg-gray-200 flex items-center justify-center ${f.style}`}
                          >
                            {f.label}
                          </button>
                        ))}
                      </div>

                      <p className="text-xs text-gray-500 mb-1.5">Emojis (click to insert at cursor):</p>
                      {(() => {
                        const ALL_EMOJIS = [
                          // Row 1 & 2 — most frequent (shown always)
                          { e: '✅', t: 'Confirmed / OK' },
                          { e: '❌', t: 'Cancelled / No' },
                          { e: '🔔', t: 'Reminder / Alert' },
                          { e: '📅', t: 'Date / Calendar' },
                          { e: '⏰', t: 'Time / Clock' },
                          { e: '🏥', t: 'Hospital / Clinic' },
                          { e: '🔢', t: 'Token number' },
                          { e: '💊', t: 'Medicine' },
                          { e: '🩺', t: 'Doctor / Stethoscope' },
                          { e: '📞', t: 'Phone / Contact' },
                          { e: '🙏', t: 'Thank you / Namaste' },
                          { e: '👋', t: 'Hello / Greeting' },
                          { e: '⚠️', t: 'Warning' },
                          { e: '❗', t: 'Important' },
                          // Rest — shown in dropdown
                          { e: '👤', t: 'Patient / Person' },
                          { e: '📋', t: 'Booking / Notes' },
                          { e: '📝', t: 'Notes / Prescription' },
                          { e: '🔁', t: 'Duplicate / Repeat' },
                          { e: '🚫', t: 'Closed / Not allowed' },
                          { e: '🎉', t: 'Holiday / Celebration' },
                          { e: '💬', t: 'Message / Reply' },
                          { e: '📍', t: 'Location / Address' },
                          { e: '🕐', t: 'Time / Schedule' },
                          { e: '✍️', t: 'Register / Write' },
                          { e: '➡️', t: 'Arrow / Next' },
                          { e: '🌟', t: 'Star / Special' },
                          { e: '💙', t: 'Care / Health' },
                          { e: '🏠', t: 'Home / Visit' },
                          { e: '🚗', t: 'Travel / Come' },
                          { e: '🧾', t: 'Receipt / Bill' },
                          { e: '💰', t: 'Payment / Fee' },
                          { e: '🔖', t: 'Registration / ID' },
                          { e: '🩻', t: 'X-Ray / Scan' },
                          { e: '🧪', t: 'Lab / Test' },
                          { e: '🩸', t: 'Blood test' },
                          { e: '💉', t: 'Injection / Vaccine' },
                          { e: '🌡️', t: 'Temperature / Fever' },
                          { e: '😊', t: 'Happy / Friendly' },
                          { e: '😷', t: 'Sick / Unwell' },
                          { e: '🤒', t: 'Fever / Ill' },
                          { e: '💪', t: 'Get well / Strong' },
                          { e: '🌿', t: 'Homeopathy / Natural' },
                          { e: '🌱', t: 'Healing / Growth' },
                          { e: '☀️', t: 'Morning / Good day' },
                          { e: '🌙', t: 'Evening / Night' },
                          { e: '📲', t: 'WhatsApp / Mobile' },
                          { e: '🔗', t: 'Link / Reference' },
                          { e: '🗓️', t: 'Schedule / Diary' },
                          { e: '⏳', t: 'Waiting / Please wait' },
                          { e: '🔄', t: 'Reschedule / Update' },
                          { e: '✔️', t: 'Done / Checked' },
                          { e: '🆔', t: 'ID / Registration' },
                          { e: '🔑', t: 'Key / Access' },
                          { e: '📢', t: 'Announcement' },
                          { e: '🎗️', t: 'Health awareness' },
                          { e: '🫀', t: 'Heart / Cardio' },
                          { e: '🫁', t: 'Lungs / Breathing' },
                          { e: '🧠', t: 'Brain / Mental health' },
                          { e: '👁️', t: 'Eye / Vision' },
                          { e: '🦷', t: 'Dental' },
                          { e: '🦴', t: 'Bone / Ortho' },
                          { e: '👶', t: 'Child / Pediatric' },
                          { e: '👴', t: 'Senior / Elderly' },
                          { e: '🤰', t: 'Pregnancy / Maternity' },
                        ];
                        const VISIBLE = 14; // 2 rows of ~7
                        const visible = ALL_EMOJIS.slice(0, VISIBLE);
                        const rest = ALL_EMOJIS.slice(VISIBLE);
                        const insertEmoji = (e: string) => {
                          const ta = document.getElementById('tpl-' + activeTemplate) as HTMLTextAreaElement;
                          if (!ta) return;
                          const start = ta.selectionStart;
                          const end = ta.selectionEnd;
                          const current = msgTemplates[activeTemplate];
                          const updated = current.slice(0, start) + e + current.slice(end);
                          setMsgTemplates(t => ({ ...t, [activeTemplate]: updated }));
                          setTimeout(() => { ta.focus(); ta.setSelectionRange(start + e.length, start + e.length); }, 0);
                        };
                        const EmojiBtn = ({ e, t }: { e: string; t: string }) => (
                          <button
                            key={e}
                            title={t}
                            onClick={() => insertEmoji(e)}
                            className="w-8 h-8 bg-gray-50 border border-gray-200 rounded text-base hover:bg-gray-100 flex items-center justify-center flex-shrink-0"
                          >
                            {e}
                          </button>
                        );
                        return (
                          <div>
                            <div className="flex flex-wrap gap-1">
                              {visible.map(({ e, t }) => <EmojiBtn key={e} e={e} t={t} />)}
                              <button
                                onClick={() => setShowAllEmojis(v => !v)}
                                className="px-2 h-8 bg-gray-100 border border-gray-300 text-gray-600 rounded text-xs hover:bg-gray-200 flex items-center gap-1 flex-shrink-0"
                              >
                                {showAllEmojis ? '▲ Less' : '▼ More'}
                              </button>
                            </div>
                            {showAllEmojis && (
                              <div className="flex flex-wrap gap-1 mt-1 pt-1 border-t border-gray-100">
                                {rest.map(({ e, t }) => <EmojiBtn key={e} e={e} t={t} />)}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  </div>

                </div>
              </Card>
            )}

            {appointmentSource === "googleSheet" && (
              <>
                <Card className="mb-6">
                  <CardHeader
                    title="Google Sheet Integration"
                    subtitle="Link your Google Sheet for online appointment management"
                  />

              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Google Sheet Link
                  </label>
                  <input
                    type="url"
                    value={googleSheetLink}
                    onChange={(e) => setGoogleSheetLink(e.target.value)}
                    placeholder="https://docs.google.com/spreadsheets/d/..."
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-xs text-gray-500 mt-2">
                    Paste the full URL of your Google Sheet. Make sure it's shared and accessible.
                  </p>
                </div>

                {/* Auto Booking Toggle */}
                <div className="flex items-center justify-between pt-4 border-t border-gray-200">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Auto Online Booking</label>
                    <p className="text-xs text-gray-500">Auto-create appointments from Google Sheet (requests still logged)</p>
                  </div>
                  <button
                    onClick={() => setGoogleSheetAutoBookingEnabled(v => !v)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${googleSheetAutoBookingEnabled ? "bg-blue-600" : "bg-gray-300"}`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${googleSheetAutoBookingEnabled ? "translate-x-6" : "translate-x-1"}`} />
                  </button>
                </div>

                {saveMessage && (
                  <div
                    className={`p-3 rounded-lg text-sm ${
                      saveMessage.includes("successfully")
                        ? "bg-green-50 text-green-700 border border-green-200"
                        : "bg-red-50 text-red-700 border border-red-200"
                    }`}
                  >
                    {saveMessage}
                  </div>
                )}

                <div className="flex gap-3 pt-4">
                  <Button
                    variant="primary"
                    onClick={handleSave}
                    disabled={isSaving}
                  >
                    {isSaving ? "Saving..." : "Save Settings"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleClear}
                    disabled={isSaving || !googleSheetLink}
                  >
                    Clear
                  </Button>
                  {googleSheetLink && (
                    <Button
                      variant="outline"
                      onClick={() => window.open(googleSheetLink, "_blank")}
                    >
                      Open Sheet
                    </Button>
                  )}
                </div>
              </div>
            </Card>

            {/* Auto Sync Settings Card */}
            {googleSheetLink && (
              <Card className="mb-6">
                <CardHeader
                  title="Automatic Sync"
                  subtitle="Configure automatic appointment syncing from Google Sheet"
                />

                <div className="p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Enable Auto Sync
                      </label>
                      <p className="text-xs text-gray-500">
                        Automatically check Google Sheet for new appointments
                      </p>
                    </div>
                    <button
                      onClick={() => setAutoSyncEnabled(!autoSyncEnabled)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        autoSyncEnabled ? "bg-blue-600" : "bg-gray-300"
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          autoSyncEnabled ? "translate-x-6" : "translate-x-1"
                        }`}
                      />
                    </button>
                  </div>

                  {autoSyncEnabled && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Sync Interval (minutes)
                      </label>
                      <select
                        value={syncInterval}
                        onChange={(e) => setSyncInterval(parseInt(e.target.value))}
                        className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                      >
                        <option value={1}>Every 1 minute</option>
                        <option value={5}>Every 5 minutes</option>
                        <option value={10}>Every 10 minutes</option>
                        <option value={15}>Every 15 minutes</option>
                        <option value={30}>Every 30 minutes</option>
                        <option value={60}>Every 1 hour</option>
                      </select>
                    </div>
                  )}

                  {lastSyncTime && (
                    <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                      <p className="text-xs text-blue-600">
                        Last synced: {lastSyncTime}
                      </p>
                    </div>
                  )}

                  {syncMessage && (
                    <div
                      className={`p-3 rounded-lg text-sm ${
                        syncMessage.includes("✓")
                          ? "bg-green-50 text-green-700 border border-green-200"
                          : "bg-red-50 text-red-700 border border-red-200"
                      }`}
                    >
                      {syncMessage}
                    </div>
                  )}

                  <div className="flex gap-3 pt-4">
                    <Button
                      variant="primary"
                      onClick={handleManualSync}
                      disabled={isSyncing || !googleSheetLink}
                    >
                      {isSyncing ? "Syncing..." : "Sync Now"}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={handleSave}
                      disabled={isSaving}
                    >
                      {isSaving ? "Saving..." : "Save Auto Sync Settings"}
                    </Button>
                  </div>
                </div>
              </Card>
            )}

            {/* Information Card */}
            <Card>
              <CardHeader
                title="How to Use"
                subtitle="Setup instructions for Google Sheet integration"
              />

              <div className="p-6 space-y-4 text-sm text-gray-600">
                <div>
                  <h3 className="font-semibold text-gray-900 mb-2">
                    1. Create a Google Sheet
                  </h3>
                  <p>
                    Create a new Google Sheet with the following columns (in this exact order):
                  </p>
                  <div className="mt-2 p-3 bg-gray-50 rounded border border-gray-200 font-mono text-xs">
                    <div>Timestamp | Name | Mobile | Date | Session | Time | Status</div>
                  </div>
                </div>

                <div>
                  <h3 className="font-semibold text-gray-900 mb-2">
                    2. Fill in the Data
                  </h3>
                  <ul className="list-disc list-inside space-y-1 text-xs">
                    <li><strong>Timestamp:</strong> When the entry was created (auto-generated)</li>
                    <li><strong>Name:</strong> Patient's full name (must match exactly with your system)</li>
                    <li><strong>Mobile:</strong> Patient's mobile number (must match exactly)</li>
                    <li><strong>Date:</strong> Appointment date (DD/MM/YYYY or YYYY-MM-DD)</li>
                    <li><strong>Session:</strong> Morning or Evening (must match your slot names)</li>
                    <li><strong>Time:</strong> Appointment time (HH:MM format, e.g., 10:30)</li>
                    <li><strong>Status:</strong> Only "Confirmed" appointments will be synced</li>
                  </ul>
                </div>

                <div>
                  <h3 className="font-semibold text-gray-900 mb-2">
                    3. Share the Sheet
                  </h3>
                  <p>
                    Click "Share" and set permissions to "Anyone with the link can view"
                  </p>
                </div>

                <div>
                  <h3 className="font-semibold text-gray-900 mb-2">
                    4. Copy the Link
                  </h3>
                  <p>
                    Copy the full URL from your browser's address bar and paste it above
                  </p>
                </div>

                <div>
                  <h3 className="font-semibold text-gray-900 mb-2">
                    5. Save and Sync
                  </h3>
                  <p>
                    Click "Save Settings" to store the link, then enable "Auto Sync" to automatically check for new appointments every few minutes
                  </p>
                </div>

                <div className="p-3 bg-blue-50 rounded border border-blue-200">
                  <p className="text-xs text-blue-700">
                    <strong>Note:</strong> The system will automatically match patients by name and mobile number, find the corresponding slot and time, and create appointments for all "Confirmed" entries.
                  </p>
                </div>
              </div>
            </Card>
            </>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
