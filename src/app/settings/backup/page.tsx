"use client";

import { useState, useEffect } from "react";
import { Sidebar } from "@/components/layout/SidebarComponent";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

interface Backup {
  id: string;
  label: string;
  createdAt: string;
  size: number;
  filePath: string;
}

interface DropboxBackup {
  id: string;
  name: string;
  path: string;
  size: number;
  client_modified: string;
}

interface BackupStatus {
  lastLocalBackup?: {
    timestamp: string;
    filename: string;
    size: number;
  };
  lastDropboxBackup?: {
    timestamp: string;
    filename: string;
    size: number;
  };
  localInterval: number;
  dropboxInterval: number;
}

const INTERVAL_OPTIONS = [
  { label: "30 min", value: 30 },
  { label: "1 hr", value: 60 },
  { label: "6 hr", value: 360 },
  { label: "12 hr", value: 720 },
  { label: "24 hr", value: 1440 },
];

// Module-level helper — safe to call during state initialization
function formatIntervalStatic(minutes: number): string {
  if (minutes < 60) return minutes + " min";
  if (minutes % 60 === 0) return (minutes / 60) + " hr";
  return Math.floor(minutes / 60) + " hr " + (minutes % 60) + " min";
}

const isElectron = () => typeof window !== "undefined" && !!(window as any).electronAPI;
const api = () => (window as any).electronAPI;

export default function BackupPage() {
  const [mounted, setMounted] = useState(false);
  const [backups, setBackups] = useState<Backup[]>([]);
  const [dropboxBackups, setDropboxBackups] = useState<DropboxBackup[]>([]);
  const [showDropboxRestore, setShowDropboxRestore] = useState(false);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  
  // Local Auto-Backup State
  const [localAutoEnabled, setLocalAutoEnabled] = useState(false);
  const [localInterval, setLocalInterval] = useState<number>(1440);
  const [localCustomMinutes, setLocalCustomMinutes] = useState<string>("");
  const [localCustomHours, setLocalCustomHours] = useState<string>("");
  const [localUseCustom, setLocalUseCustom] = useState(false);
  const [localAppliedMessage, setLocalAppliedMessage] = useState("");

  // Dropbox Auto-Backup State
  const [dropboxAutoEnabled, setDropboxAutoEnabled] = useState(false);
  const [dropboxInterval, setDropboxInterval] = useState<number>(1440);
  const [dropboxCustomMinutes, setDropboxCustomMinutes] = useState<string>("");
  const [dropboxCustomHours, setDropboxCustomHours] = useState<string>("");
  const [dropboxUseCustom, setDropboxUseCustom] = useState(false);
  const [dropboxAppliedMessage, setDropboxAppliedMessage] = useState("");

  // Dropbox Connection State
  const [dropboxConnected, setDropboxConnected] = useState(false);
  const [dropboxEmail, setDropboxEmail] = useState("");
  const [dropboxLoading, setDropboxLoading] = useState(false);
  const [dropboxStatus, setDropboxStatus] = useState("");

  // Backup History Status
  const [backupStatus, setBackupStatus] = useState<BackupStatus | null>(null);

  // LAN State
  const [lanStatus, setLanStatus] = useState<any>(null);
  const [isMainServer, setIsMainServer] = useState(true);

  useEffect(() => {
    setMounted(true);
    // Load local storage settings
    const lEnabled = localStorage.getItem("localAutoEnabled") === "true";
    const lInterval = Number(localStorage.getItem("localInterval") || "1440");
    const lCustomMins = localStorage.getItem("localCustomMinutes") || "";
    const lCustomHrs = localStorage.getItem("localCustomHours") || "";
    const lUseCustom = localStorage.getItem("localUseCustom") === "true";

    const dEnabled = localStorage.getItem("dropboxAutoEnabled") === "true";
    const dInterval = Number(localStorage.getItem("dropboxInterval") || "1440");
    const dCustomMins = localStorage.getItem("dropboxCustomMinutes") || "";
    const dCustomHrs = localStorage.getItem("dropboxCustomHours") || "";
    const dUseCustom = localStorage.getItem("dropboxUseCustom") === "true";

    setLocalAutoEnabled(lEnabled);
    setLocalInterval(lInterval);
    setLocalCustomMinutes(lCustomMins);
    setLocalCustomHours(lCustomHrs);
    setLocalUseCustom(lUseCustom);
    // Show the currently active interval as the applied message on load
    if (lUseCustom && (lCustomHrs || lCustomMins)) {
      const h = parseInt(lCustomHrs) || 0;
      const m = parseInt(lCustomMins) || 0;
      const total = h * 60 + m;
      if (total > 0) setLocalAppliedMessage(`Active: Every ${formatIntervalStatic(total)} (custom)`);
    } else {
      setLocalAppliedMessage(`Active: Every ${formatIntervalStatic(lInterval)}`);
    }

    setDropboxAutoEnabled(dEnabled);
    setDropboxInterval(dInterval);
    setDropboxCustomMinutes(dCustomMins);
    setDropboxCustomHours(dCustomHrs);
    setDropboxUseCustom(dUseCustom);
    // Show the currently active interval as the applied message on load
    if (dUseCustom && (dCustomHrs || dCustomMins)) {
      const h = parseInt(dCustomHrs) || 0;
      const m = parseInt(dCustomMins) || 0;
      const total = h * 60 + m;
      if (total > 0) setDropboxAppliedMessage(`Active: Every ${formatIntervalStatic(total)} (custom)`);
    } else {
      setDropboxAppliedMessage(`Active: Every ${formatIntervalStatic(dInterval)}`);
    }

    checkLANStatus();

    if (isElectron()) {
      loadBackups();
      loadDropboxStatus();
      loadAutoStatus();
      
      api().onDropboxAuthResult((data: any) => {
        setDropboxLoading(false);
        if (data.success) {
          setDropboxConnected(true);
          setDropboxEmail(data.accountEmail || "");
          setDropboxStatus("Connected to Dropbox successfully.");
        } else {
          setDropboxStatus("Connection failed: " + (data.error || "Unknown error"));
        }
      });
    }
  }, []);

  async function checkLANStatus() {
    try {
      const res = await fetch('/api/lan/status');
      const data = await res.json();
      setLanStatus(data);
      if (data.enabled) {
        setIsMainServer(data.isMainServer);
        if (!data.isMainServer) {
          loadBackupsFromMain(data.mainServer);
          loadAutoStatusFromMain(data.mainServer);
        }
      }
    } catch (e) {
      console.error('Failed to check LAN status:', e);
    }
  }

  async function loadBackupsFromMain(mainServer: any) {
    if (!mainServer) return;
    try {
      const res = await fetch(`http://${mainServer.ip}:${mainServer.port}/api/backup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'list' })
      });
      const data = await res.json();
      if (data.success) setBackups(data.data.reverse());
    } catch (e) {
      setStatus("Failed to load backups from main server.");
    }
  }

  async function loadAutoStatusFromMain(mainServer: any) {
    if (!mainServer) return;
    try {
      const res = await fetch(`http://${mainServer.ip}:${mainServer.port}/api/backup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'status' })
      });
      const data = await res.json();
      if (data.success) setBackupStatus(data.data);
    } catch {}
  }

  async function loadBackups() {
    if (!isMainServer && lanStatus?.mainServer) return loadBackupsFromMain(lanStatus.mainServer);
    try {
      const res = await api().backupList();
      if (res.success) setBackups(res.data.reverse());
    } catch { setStatus("Failed to load backups."); }
  }

  async function loadDropboxStatus() {
    try {
      const res = await api().dropboxGetStatus();
      if (res.success && res.connected) { 
        setDropboxConnected(true); 
        setDropboxEmail(res.accountEmail || ""); 
      }
    } catch {}
  }

  async function loadAutoStatus() {
    if (!isMainServer && lanStatus?.mainServer) return loadAutoStatusFromMain(lanStatus.mainServer);
    try {
      const res = await api().backupGetAutoStatus();
      if (res.success) {
        setBackupStatus(res.data);
      }
    } catch {}
  }

  async function loadDropboxBackups() {
    setDropboxLoading(true);
    setDropboxStatus("Fetching Dropbox backups...");
    try {
      if (!isMainServer && lanStatus?.mainServer) {
        const res = await fetch(`http://${lanStatus.mainServer.ip}:${lanStatus.mainServer.port}/api/backup`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'list-dropbox' })
        });
        const data = await res.json();
        if (data.success) {
          setDropboxBackups(data.data);
          setShowDropboxRestore(true);
          setDropboxStatus("");
        } else {
          setDropboxStatus("Failed to load Dropbox backups: " + data.error);
        }
      } else {
        const res = await api().dropboxListBackups();
        if (res.success) {
          setDropboxBackups(res.data);
          setShowDropboxRestore(true);
          setDropboxStatus("");
        } else {
          setDropboxStatus("Failed to load Dropbox backups: " + res.error);
        }
      }
    } catch (e: any) {
      setDropboxStatus("Error: " + e.message);
    } finally {
      setDropboxLoading(false);
    }
  }

  async function handleCreateBackup(uploadToDropbox: boolean = false) {
    setLoading(true); setStatus("");
    if (uploadToDropbox) {
      setDropboxLoading(true);
      setDropboxStatus("Creating backup and uploading to Dropbox...");
    }
    
    try {
      if (!isMainServer && lanStatus?.mainServer) {
        const res = await fetch(`http://${lanStatus.mainServer.ip}:${lanStatus.mainServer.port}/api/backup`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            action: 'create', 
            label: 'Manual backup (from client)',
            uploadToDropbox: uploadToDropbox 
          })
        });
        const data = await res.json();
        if (data.success) {
          setStatus("Backup created on Main Server.");
          if (uploadToDropbox) setDropboxStatus("Backup created and uploaded to Dropbox on Main Server.");
          await loadBackupsFromMain(lanStatus.mainServer);
          await loadAutoStatusFromMain(lanStatus.mainServer);
        } else { 
          setStatus("Backup failed: " + data.error); 
          if (uploadToDropbox) setDropboxStatus("Upload failed: " + data.error);
        }
      } else if (isElectron()) {
        const res = await api().backupCreate("Manual backup", uploadToDropbox);
        if (res.success) {
          setStatus(uploadToDropbox ? "Backup created and uploaded to Dropbox." : "Backup created successfully.");
          if (uploadToDropbox) setDropboxStatus("Backup uploaded to Dropbox.");
          await loadBackups();
          await loadAutoStatus();
        } else { 
          setStatus("Backup failed: " + res.error); 
          if (uploadToDropbox) setDropboxStatus("Upload failed: " + res.error);
        }
      }
    } catch (e: any) { 
      setStatus("Error: " + e.message); 
      if (uploadToDropbox) setDropboxStatus("Error: " + e.message);
    }
    finally { 
      setLoading(false); 
      if (uploadToDropbox) setDropboxLoading(false);
    }
  }

  async function handleRestore(backupId: string) {
    if (!confirm("Are you sure? This will overwrite data on the MAIN SERVER.")) return;
    setLoading(true); setStatus("");
    try {
      if (!isMainServer && lanStatus?.mainServer) {
        const res = await fetch(`http://${lanStatus.mainServer.ip}:${lanStatus.mainServer.port}/api/backup`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'restore', backupId })
        });
        const data = await res.json();
        if (data.success) {
          setStatus("Restore initiated on Main Server. All computers should restart.");
          alert("Restore successful on Main Server! All computers must restart.");
          await loadBackups();
          await loadAutoStatus();
        } else { setStatus("Restore failed: " + data.error); }
      } else {
        const res = await api().backupRestore(backupId);
        if (res.success) {
          setStatus("Restore successful! Restart required.");
          alert("Restore successful! Please restart the application.");
          await loadBackups();
          await loadAutoStatus();
        } else { setStatus("Restore failed: " + res.error); }
      }
    } catch (e: any) { setStatus("Error: " + e.message); }
    finally { setLoading(false); }
  }

  async function handleRestoreFromDropbox(path: string) {
    if (!confirm("Are you sure? This will overwrite data on the MAIN SERVER.")) return;
    setLoading(true); setStatus("");
    try {
      if (!isMainServer && lanStatus?.mainServer) {
        const res = await fetch(`http://${lanStatus.mainServer.ip}:${lanStatus.mainServer.port}/api/backup`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'restore-dropbox', dropboxPath: path })
        });
        const data = await res.json();
        if (data.success) {
          setStatus("Restore initiated on Main Server. All computers should restart.");
          alert("Restore successful on Main Server! All computers must restart.");
          await loadBackups();
          await loadAutoStatus();
        } else { setStatus("Restore failed: " + data.error); }
      } else {
        const res = await api().dropboxRestore(path);
        if (res.success) {
          setStatus("Restore successful! Restart required.");
          alert("Restore successful! Please restart the application.");
          await loadBackups();
          await loadAutoStatus();
        } else { setStatus("Restore failed: " + res.error); }
      }
    } catch (e: any) { setStatus("Error: " + e.message); }
    finally { setLoading(false); }
  }

  async function handleRestoreFromFile() {
    if (!isMainServer) {
      alert("Restore from file can only be done on the Main Server.");
      return;
    }
    if (!confirm("Are you sure you want to restore from a file? This will overwrite your current database.")) return;
    setLoading(true); setStatus("");
    try {
      const res = await api().backupRestoreFromFile();
      if (res.success) {
        setStatus("Restore successful! Please restart the app.");
        alert("Restore successful! Please restart the application.");
      } else if (res.error !== "Cancelled") { setStatus("Restore failed: " + res.error); }
    } catch (e: any) { setStatus("Error: " + e.message); }
    finally { setLoading(false); }
  }

  async function handleDownload(backupId: string) {
    if (!isMainServer) {
      alert("Direct download is only available on the Main Server.");
      return;
    }
    setStatus("");
    try {
      const res = await api().backupDownload(backupId);
      if (res.success) { setStatus("Saved to: " + res.savedTo); }
      else if (res.error !== "Cancelled") { setStatus("Download failed: " + res.error); }
    } catch (e: any) { setStatus("Error: " + e.message); }
  }

  async function handleConnectDropbox() {
    if (!isMainServer) {
      alert("Dropbox configuration must be done on the Main Server.");
      return;
    }
    setDropboxLoading(true);
    setDropboxStatus("Opening Dropbox authorization in your browser...");
    try {
      await api().dropboxStartAuth();
    } catch (e: any) {
      setDropboxLoading(false);
      setDropboxStatus("Error: " + e.message);
    }
  }

  async function handleDisconnectDropbox() {
    if (!isMainServer) return;
    setDropboxLoading(true);
    try {
      await api().dropboxDisconnect();
      setDropboxConnected(false); setDropboxEmail(""); setDropboxStatus("Dropbox disconnected.");
    } catch (e: any) { setDropboxStatus("Error: " + e.message); }
    finally { setDropboxLoading(false); }
  }

  async function handleUploadToDropbox() {
    setDropboxLoading(true); setDropboxStatus("Uploading latest backup...");
    try {
      if (!isMainServer && lanStatus?.mainServer) {
        const res = await fetch(`http://${lanStatus.mainServer.ip}:${lanStatus.mainServer.port}/api/backup`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'upload-dropbox' })
        });
        const data = await res.json();
        if (data.success) {
          setDropboxStatus("Latest backup uploaded to Dropbox.");
          await loadAutoStatusFromMain(lanStatus.mainServer);
        } else { setDropboxStatus("Upload failed: " + data.error); }
      } else {
        const res = await api().dropboxUploadLatest();
        if (res.success) { 
          setDropboxStatus("Latest backup uploaded to Dropbox."); 
          await loadAutoStatus();
        }
        else { setDropboxStatus("Upload failed: " + res.error); }
      }
    } catch (e: any) { setDropboxStatus("Error: " + e.message); }
    finally { setDropboxLoading(false); }
  }

  async function handleCleanupDropbox() {
    if (!confirm("This will delete all Dropbox backups except the 3 most recent. Continue?")) return;
    setDropboxLoading(true); setDropboxStatus("Cleaning up Dropbox...");
    try {
      if (!isMainServer && lanStatus?.mainServer) {
        const res = await fetch(`http://${lanStatus.mainServer.ip}:${lanStatus.mainServer.port}/api/backup`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'cleanup-dropbox' })
        });
        const data = await res.json();
        if (data.success) setDropboxStatus("Dropbox cleanup completed. Only 3 latest backups kept.");
        else setDropboxStatus("Cleanup failed: " + data.error);
      } else {
        const res = await api().dropboxCleanup();
        if (res.success) setDropboxStatus("Dropbox cleanup completed. Only 3 latest backups kept.");
        else setDropboxStatus("Cleanup failed: " + res.error);
      }
    } catch (e: any) { setDropboxStatus("Error: " + e.message); }
    finally { setDropboxLoading(false); }
  }

  // --- Auto Backup Control Functions ---

  function updateLocalSchedule(enabled: boolean, minutes: number, useCustom?: boolean) {
    if (!isMainServer) return;
    const val = enabled ? minutes : 0;
    const finalUseCustom = useCustom !== undefined ? useCustom : localUseCustom;
    localStorage.setItem("localAutoEnabled", String(enabled));
    localStorage.setItem("localInterval", String(minutes));
    localStorage.setItem("localUseCustom", String(finalUseCustom));
    if (isElectron()) {
      // Only call the IPC handler - it handles both schedule start AND settings persistence
      api().backupSetLocalInterval(val);
    }
  }

  function updateDropboxSchedule(enabled: boolean, minutes: number, useCustom?: boolean) {
    if (!isMainServer) return;
    const val = enabled ? minutes : 0;
    const finalUseCustom = useCustom !== undefined ? useCustom : dropboxUseCustom;
    localStorage.setItem("dropboxAutoEnabled", String(enabled));
    localStorage.setItem("dropboxInterval", String(minutes));
    localStorage.setItem("dropboxUseCustom", String(finalUseCustom));
    if (isElectron()) {
      // Only call the IPC handler - it handles both schedule start AND settings persistence
      api().backupSetDropboxInterval(val);
    }
  }

  function toggleLocalAuto() {
    if (!isMainServer) return;
    const newVal = !localAutoEnabled;
    setLocalAutoEnabled(newVal);
    const mins = localUseCustom ? parseInt(localCustomMinutes) || 1440 : localInterval;
    updateLocalSchedule(newVal, mins);
  }

  function toggleDropboxAuto() {
    if (!isMainServer) return;
    const newVal = !dropboxAutoEnabled;
    setDropboxAutoEnabled(newVal);
    const mins = dropboxUseCustom ? parseInt(dropboxCustomMinutes) || 1440 : dropboxInterval;
    updateDropboxSchedule(newVal, mins);
  }

  function formatInterval(minutes: number): string {
    if (minutes < 60) return minutes + " min";
    if (minutes % 60 === 0) return (minutes / 60) + " hr";
    return Math.floor(minutes / 60) + " hr " + (minutes % 60) + " min";
  }

  function formatSize(bytes: number) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(2) + " MB";
  }

  function formatDate(iso: string) { 
    if (!mounted) return "";
    return new Date(iso).toLocaleString(); 
  }

  if (!mounted) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Sidebar />
        <div className="ml-64">
          <div className="bg-white border-b border-gray-200 px-6 py-4">
            <h1 className="text-2xl font-bold text-gray-900">Data Backup &amp; Recovery</h1>
            <p className="text-sm text-gray-500">Secure your clinic data with automated and cloud backups</p>
          </div>
          <div className="p-6">
            <p className="text-gray-500">Loading settings...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar />
      <div className="ml-64">
        <div className="bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Data Backup &amp; Recovery</h1>
            <p className="text-sm text-gray-500">Secure your clinic data with automated and cloud backups</p>
          </div>
          {!isMainServer && (
            <div className="px-3 py-1 bg-amber-100 text-amber-800 rounded-full text-xs font-bold border border-amber-200">
              LAN CLIENT MODE
            </div>
          )}
        </div>
        
        <div className="p-6 space-y-6 max-w-4xl">
          
          {/* LAN Information */}
          {lanStatus?.enabled && !isMainServer && (
            <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg flex items-center gap-3">
              <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm text-blue-800">
                Connected to Main Server: <strong>{lanStatus.mainServer?.hostname} ({lanStatus.mainServer?.ip})</strong>. 
                Backups are managed by the host.
              </p>
            </div>
          )}

          {/* Informative Status Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="p-5 border-l-4 border-l-blue-500 bg-white shadow-sm">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center">
                  <svg className="w-6 h-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider">Last Local Backup</h3>
                  {backupStatus?.lastLocalBackup ? (
                    <div className="mt-1">
                      <p className="text-lg font-bold text-gray-900">{formatDate(backupStatus.lastLocalBackup.timestamp)}</p>
                      <p className="text-xs text-gray-500 truncate w-64">{backupStatus.lastLocalBackup.filename} ({formatSize(backupStatus.lastLocalBackup.size)})</p>
                    </div>
                  ) : (
                    <p className="mt-1 text-lg font-medium text-gray-400">No backup yet</p>
                  )}
                </div>
              </div>
            </Card>

            <Card className="p-5 border-l-4 border-l-green-500 bg-white shadow-sm">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-green-50 flex items-center justify-center">
                  <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider">Last Dropbox Sync</h3>
                  {backupStatus?.lastDropboxBackup ? (
                    <div className="mt-1">
                      <p className="text-lg font-bold text-gray-900">{formatDate(backupStatus.lastDropboxBackup.timestamp)}</p>
                      <p className="text-xs text-gray-500 truncate w-64">{backupStatus.lastDropboxBackup.filename}</p>
                    </div>
                  ) : (
                    <p className="mt-1 text-lg font-medium text-gray-400">{dropboxConnected || !isMainServer ? "Never synced" : "Not connected"}</p>
                  )}
                </div>
              </div>
            </Card>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Local Auto-Backup Settings */}
            <Card className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900">Local Auto-Backup</h2>
                <button onClick={toggleLocalAuto} disabled={!isMainServer}
                  className={"relative inline-flex h-6 w-11 items-center rounded-full transition-colors " + (localAutoEnabled ? "bg-blue-600" : "bg-gray-300") + (!isMainServer ? " opacity-50 cursor-not-allowed" : "")}>
                  <span className={"inline-block h-4 w-4 transform rounded-full bg-white transition-transform " + (localAutoEnabled ? "translate-x-6" : "translate-x-1")} />
                </button>
              </div>
              
              {!isMainServer ? (
                <p className="text-sm text-gray-500">Auto-backup schedule can only be configured on the Main Server.</p>
              ) : (
                <div className="space-y-4">
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase mb-2">Interval</p>
                    {/* Active interval display */}
                    <p className="text-xs text-blue-700 font-semibold mb-2">
                      Currently set: Every {formatInterval(localInterval)}{localUseCustom ? " (custom)" : ""}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {INTERVAL_OPTIONS.map(opt => (
                        <button key={opt.value} 
                          onClick={() => {
                            setLocalInterval(opt.value);
                            setLocalUseCustom(false);
                            setLocalCustomHours("");
                            setLocalCustomMinutes("");
                            localStorage.setItem("localCustomHours", "");
                            localStorage.setItem("localCustomMinutes", "");
                            updateLocalSchedule(localAutoEnabled, opt.value, false);
                            setLocalAppliedMessage(`Saved: Every ${formatInterval(opt.value)}`);
                          }}
                          className={"px-3 py-1.5 rounded-lg border text-xs font-medium " + (!localUseCustom && localInterval === opt.value ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-700 hover:border-blue-400")}>
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* Custom interval — only enabled when no preset is active */}
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase mb-1">
                      Custom interval {!localUseCustom && INTERVAL_OPTIONS.some(o => o.value === localInterval) ? <span className="text-gray-400 normal-case font-normal">(select to override preset)</span> : ""}
                    </p>
                    <div className="flex items-center gap-2">
                      <input type="number" placeholder="Hours" value={localCustomHours}
                        onChange={(e) => setLocalCustomHours(e.target.value)}
                        className="w-20 px-3 py-1.5 rounded-lg border text-sm" />
                      <input type="number" placeholder="Mins" value={localCustomMinutes}
                        onChange={(e) => setLocalCustomMinutes(e.target.value)}
                        className="w-20 px-3 py-1.5 rounded-lg border text-sm" />
                      <Button size="sm" variant="outline" onClick={() => {
                        const hours = parseInt(localCustomHours) || 0;
                        const minutes = parseInt(localCustomMinutes) || 0;
                        const totalMinutes = (hours * 60) + minutes;
                        if (totalMinutes > 0) {
                          setLocalUseCustom(true);
                          setLocalInterval(totalMinutes);
                          localStorage.setItem("localCustomHours", localCustomHours);
                          localStorage.setItem("localCustomMinutes", localCustomMinutes);
                          updateLocalSchedule(localAutoEnabled, totalMinutes, true);
                          setLocalAppliedMessage(`Saved: Every ${formatInterval(totalMinutes)} (custom)`);
                        }
                      }}>Apply</Button>
                    </div>
                  </div>
                  {localAppliedMessage && <p className="text-sm text-green-600 mt-1">{localAppliedMessage}</p>}
                </div>
              )}
            </Card>

            {/* Dropbox Auto-Backup Settings */}
            <Card className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900">Dropbox Auto-Backup</h2>
                <button onClick={toggleDropboxAuto} disabled={!dropboxConnected || !isMainServer}
                  className={"relative inline-flex h-6 w-11 items-center rounded-full transition-colors " + (dropboxAutoEnabled ? "bg-green-600" : "bg-gray-300") + (!dropboxConnected || !isMainServer ? " opacity-50 cursor-not-allowed" : "")}>
                  <span className={"inline-block h-4 w-4 transform rounded-full bg-white transition-transform " + (dropboxAutoEnabled ? "translate-x-6" : "translate-x-1")} />
                </button>
              </div>
              
              {!isMainServer ? (
                <p className="text-sm text-gray-500">Dropbox schedule can only be configured on the Main Server.</p>
              ) : !dropboxConnected ? (
                <div className="py-2">
                  <p className="text-sm text-gray-500 mb-3">Connect to Dropbox to enable automated cloud backups.</p>
                  <Button size="sm" onClick={handleConnectDropbox} disabled={dropboxLoading}>
                    {dropboxLoading ? "Connecting..." : "Connect Dropbox"}
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase mb-2">Interval</p>
                    {/* Active interval display */}
                    <p className="text-xs text-green-700 font-semibold mb-2">
                      Currently set: Every {formatInterval(dropboxInterval)}{dropboxUseCustom ? " (custom)" : ""}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {INTERVAL_OPTIONS.map(opt => (
                        <button key={opt.value} 
                          onClick={() => {
                            setDropboxInterval(opt.value);
                            setDropboxUseCustom(false);
                            setDropboxCustomHours("");
                            setDropboxCustomMinutes("");
                            localStorage.setItem("dropboxCustomHours", "");
                            localStorage.setItem("dropboxCustomMinutes", "");
                            updateDropboxSchedule(dropboxAutoEnabled, opt.value, false);
                            setDropboxAppliedMessage(`Saved: Every ${formatInterval(opt.value)}`);
                          }}
                          className={"px-3 py-1.5 rounded-lg border text-xs font-medium " + (!dropboxUseCustom && dropboxInterval === opt.value ? "bg-green-600 text-white border-green-600" : "bg-white text-gray-700 hover:border-green-400")}>
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* Custom interval — only enabled when no preset is active */}
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase mb-1">
                      Custom interval {!dropboxUseCustom && INTERVAL_OPTIONS.some(o => o.value === dropboxInterval) ? <span className="text-gray-400 normal-case font-normal">(select to override preset)</span> : ""}
                    </p>
                    <div className="flex items-center gap-2">
                      <input type="number" placeholder="Hours" value={dropboxCustomHours}
                        onChange={(e) => setDropboxCustomHours(e.target.value)}
                        className="w-20 px-3 py-1.5 rounded-lg border text-sm" />
                      <input type="number" placeholder="Mins" value={dropboxCustomMinutes}
                        onChange={(e) => setDropboxCustomMinutes(e.target.value)}
                        className="w-20 px-3 py-1.5 rounded-lg border text-sm" />
                      <Button size="sm" variant="outline" onClick={() => {
                        const hours = parseInt(dropboxCustomHours) || 0;
                        const minutes = parseInt(dropboxCustomMinutes) || 0;
                        const totalMinutes = (hours * 60) + minutes;
                        if (totalMinutes > 0) {
                          setDropboxUseCustom(true);
                          setDropboxInterval(totalMinutes);
                          localStorage.setItem("dropboxCustomHours", dropboxCustomHours);
                          localStorage.setItem("dropboxCustomMinutes", dropboxCustomMinutes);
                          updateDropboxSchedule(dropboxAutoEnabled, totalMinutes, true);
                          setDropboxAppliedMessage(`Saved: Every ${formatInterval(totalMinutes)} (custom)`);
                        }
                      }}>Apply</Button>
                    </div>
                  </div>
                  {dropboxAppliedMessage && <p className="text-sm text-green-600 mt-1">{dropboxAppliedMessage}</p>}
                  <div className="pt-2 border-t border-gray-100 flex items-center justify-between">
                    <span className="text-xs text-gray-500">{dropboxEmail}</span>
                    <button onClick={handleDisconnectDropbox} className="text-xs text-red-600 hover:underline">Disconnect</button>
                  </div>
                </div>
              )}
            </Card>
          </div>

          {/* Manual Controls */}
          <Card className="p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Manual Operations</h2>
            <div className="flex flex-wrap gap-3">
              <Button onClick={() => handleCreateBackup(false)} disabled={loading}>
                {loading && !dropboxLoading ? "Creating Local..." : "Backup to Local Computer"}
              </Button>
              {(dropboxConnected || (!isMainServer && lanStatus?.enabled)) && (
                <Button variant="outline" onClick={() => handleCreateBackup(true)} disabled={dropboxLoading}>
                  {dropboxLoading ? "Uploading to Dropbox..." : "Backup to Dropbox"}
                </Button>
              )}
              {dropboxConnected || (!isMainServer && lanStatus?.enabled) ? (
                <>
                  <Button variant="outline" onClick={handleUploadToDropbox} disabled={dropboxLoading}>
                    {dropboxLoading ? "Uploading..." : "Sync Latest to Dropbox"}
                  </Button>
                  <Button variant="outline" onClick={handleCleanupDropbox} disabled={dropboxLoading}>
                    Cleanup Dropbox (Keep 3)
                  </Button>
                  <Button variant="outline" onClick={loadDropboxBackups} disabled={dropboxLoading}>
                    Restore from Dropbox
                  </Button>
                </>
              ) : null}
              {isMainServer && (
                <Button variant="outline" onClick={handleRestoreFromFile} disabled={loading}>
                  Restore from File
                </Button>
              )}
            </div>
            {status && <p className="mt-3 text-sm text-blue-600">{status}</p>}
            {dropboxStatus && <p className="mt-1 text-sm text-green-600">{dropboxStatus}</p>}
          </Card>

          {/* Dropbox Restore Modal/Dialog */}
          {showDropboxRestore && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
              <Card className="w-full max-w-lg p-6 bg-white shadow-xl max-h-[80vh] overflow-hidden flex flex-col">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-bold text-gray-900">Select Dropbox Backup</h2>
                  <button onClick={() => setShowDropboxRestore(false)} className="text-gray-500 hover:text-gray-700">
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                
                <div className="overflow-y-auto flex-1 space-y-3 pr-2">
                  {dropboxBackups.length === 0 ? (
                    <p className="text-center py-8 text-gray-500">No backups found on Dropbox.</p>
                  ) : (
                    dropboxBackups.map((b) => (
                      <div key={b.id} className="p-4 bg-gray-50 rounded-lg border border-gray-200 hover:border-blue-300 transition-colors">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium text-gray-900">{b.name}</p>
                            <p className="text-xs text-gray-500 mt-1">
                              Modified: {formatDate(b.client_modified)} • {formatSize(b.size)}
                            </p>
                          </div>
                          <Button size="sm" onClick={() => handleRestoreFromDropbox(b.path)}>
                            Restore
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
                
                <div className="mt-6 flex justify-end">
                  <Button variant="outline" onClick={() => setShowDropboxRestore(false)}>
                    Close
                  </Button>
                </div>
              </Card>
            </div>
          )}

          {/* Backup History */}
          {(isElectron() || !isMainServer) && (
            <Card className="p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Backup History (Main Server)</h2>
              {backups.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-4">No backups found.</p>
              ) : (
                <div className="space-y-2">
                  {backups.map((b) => (
                    <div key={b.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{b.label}</p>
                        <p className="text-xs text-gray-500">{formatDate(b.createdAt)} • {formatSize(b.size)}</p>
                      </div>
                      <div className="flex gap-2 ml-4">
                        {isMainServer && <Button variant="outline" size="sm" onClick={() => handleDownload(b.id)}>Download</Button>}
                        <Button variant="outline" size="sm" onClick={() => handleRestore(b.id)} className="text-blue-600 border-blue-200">Restore</Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
