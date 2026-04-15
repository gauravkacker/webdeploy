"use client";

import { useState, useEffect } from "react";
import { Sidebar } from "@/components/layout/SidebarComponent";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

const isElectron = () => typeof window !== "undefined" && !!(window as any).electronAPI;
const api = () => (window as any).electronAPI || {};

interface UpdateInfo {
  version: string;
  downloadUrl: string;
  releaseNotes: string;
  type: 'patch' | 'full';
  fileName: string;
}

export default function AppUpdatesPage() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [appVersion, setAppVersion] = useState("0.1.0");
  const [checkingForUpdates, setCheckingForUpdates] = useState(false);
  const [autoUpdateEnabled, setAutoUpdateEnabled] = useState(true);
  const [availableUpdate, setAvailableUpdate] = useState<UpdateInfo | null>(null);
  const [downloadingUpdate, setDownloadingUpdate] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [updateStatus, setUpdateStatus] = useState<{
    status: "idle" | "checking" | "available" | "downloading" | "ready" | "error";
    message: string;
  }>({ status: "idle", message: "" });

  useEffect(() => {
    // Load auto-update preference
    const savedPreference = localStorage.getItem("autoUpdateEnabled");
    if (savedPreference !== null) {
      setAutoUpdateEnabled(JSON.parse(savedPreference));
    }

    // Get current app version
    if (isElectron()) {
      const getVersion = async () => {
        try {
          const result = await api().getAppVersion?.();
          if (result?.success && result?.version) {
            setAppVersion(result.version);
          }
        } catch (e) {
          console.error("Error getting app version:", e);
        }
      };
      getVersion();
    }
  }, []);

  const handleToggleAutoUpdate = async (enabled: boolean) => {
    setAutoUpdateEnabled(enabled);
    localStorage.setItem("autoUpdateEnabled", JSON.stringify(enabled));
    
    if (isElectron() && api().setAutoUpdateEnabled) {
      try {
        await api().setAutoUpdateEnabled?.(enabled);
      } catch (e) {
        console.error("Error setting auto-update preference:", e);
      }
    }
  };

  const handleCheckForUpdates = async () => {
    if (!isElectron()) {
      setUpdateStatus({
        status: "error",
        message: "Updates are only available in the desktop app",
      });
      return;
    }

    setCheckingForUpdates(true);
    setUpdateStatus({ status: "checking", message: "Checking for updates..." });
    setAvailableUpdate(null);

    try {
      const result = await api().checkForUpdates?.();
      
      if (result?.success) {
        if (result?.updateAvailable && result?.updateInfo) {
          setAvailableUpdate(result.updateInfo);
          setUpdateStatus({
            status: "available",
            message: `Update available: v${result.updateInfo.version} (${result.updateInfo.type === 'patch' ? 'Patch' : 'Full Release'})`,
          });
        } else {
          setUpdateStatus({
            status: "idle",
            message: `You are running the latest version (v${appVersion})`,
          });
        }
      } else {
        setUpdateStatus({
          status: "error",
          message: `Error checking for updates: ${result?.error || "Unknown error"}`,
        });
      }
    } catch (error) {
      setUpdateStatus({
        status: "error",
        message: `Error checking for updates: ${error instanceof Error ? error.message : "Unknown error"}`,
      });
    } finally {
      setCheckingForUpdates(false);
    }
  };

  const handleDownloadAndApplyUpdate = async () => {
    if (!availableUpdate || !isElectron()) return;

    setDownloadingUpdate(true);
    setDownloadProgress(0);
    setUpdateStatus({
      status: "downloading",
      message: `Downloading ${availableUpdate.type === 'patch' ? 'patch' : 'update'}...`,
    });

    try {
      const result = await api().downloadAndApplyUpdate?.(availableUpdate);
      
      if (result?.success) {
        setUpdateStatus({
          status: "ready",
          message: `${availableUpdate.type === 'patch' ? 'Patch' : 'Update'} downloaded and ready to apply. Restart the app to complete the update.`,
        });
        setDownloadProgress(100);
      } else {
        setUpdateStatus({
          status: "error",
          message: `Error applying update: ${result?.error || "Unknown error"}`,
        });
      }
    } catch (error) {
      setUpdateStatus({
        status: "error",
        message: `Error applying update: ${error instanceof Error ? error.message : "Unknown error"}`,
      });
    } finally {
      setDownloadingUpdate(false);
    }
  };

  const getStatusColor = () => {
    switch (updateStatus.status) {
      case "available":
      case "downloading":
      case "ready":
        return "text-blue-600";
      case "error":
        return "text-red-600";
      default:
        return "text-gray-600";
    }
  };

  const getStatusIcon = () => {
    switch (updateStatus.status) {
      case "checking":
        return "⏳";
      case "available":
      case "downloading":
        return "⬇️";
      case "ready":
        return "✅";
      case "error":
        return "❌";
      default:
        return "ℹ️";
    }
  };

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar collapsed={sidebarCollapsed} onCollapse={setSidebarCollapsed} />

      <main className={`flex-1 overflow-auto transition-all duration-300 ${sidebarCollapsed ? 'ml-16' : 'ml-64'}`}>
        <div className="p-8 max-w-6xl mx-auto">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">App Updates</h1>
            <p className="text-gray-600">Check for and manage application updates</p>
          </div>

          <div className="space-y-6">
            {/* Current Version */}
            <Card className="p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Current Version</h2>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">HomeoPMS Desktop</p>
                  <p className="text-2xl font-bold text-gray-900">v{appVersion}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-gray-600">Last checked</p>
                  <p className="text-sm text-gray-900">
                    {new Date().toLocaleString()}
                  </p>
                </div>
              </div>
            </Card>

            {/* Check for Updates */}
            <Card className="p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Automatic Updates</h2>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Enable automatic updates</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {autoUpdateEnabled 
                      ? "App will check for updates every 6 hours and install automatically" 
                      : "You will need to manually check for updates"}
                  </p>
                </div>
                <button
                  onClick={() => handleToggleAutoUpdate(!autoUpdateEnabled)}
                  className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors ${
                    autoUpdateEnabled ? "bg-blue-600" : "bg-gray-300"
                  }`}
                >
                  <span
                    className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform ${
                      autoUpdateEnabled ? "translate-x-7" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>
            </Card>

            {/* Manual Check */}
            <Card className="p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Check for Updates</h2>
              <p className="text-sm text-gray-600 mb-4">
                Click the button below to manually check if a new version is available. You can choose to update now or continue using the app.
              </p>
              <Button
                onClick={handleCheckForUpdates}
                disabled={checkingForUpdates}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium"
              >
                {checkingForUpdates ? "Checking..." : "Check for Updates"}
              </Button>
            </Card>

            {/* Available Update */}
            {availableUpdate && (
              <Card className="p-6 border-green-200 bg-green-50">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Update Available</h2>
                <div className="space-y-4">
                  <div>
                    <p className="text-sm text-gray-600">Version</p>
                    <p className="text-xl font-bold text-gray-900">{availableUpdate.version}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Type</p>
                    <p className="text-sm font-medium text-gray-900">
                      {availableUpdate.type === 'patch' ? '🔧 Patch (Small & Fast)' : '📦 Full Release'}
                    </p>
                  </div>
                  {availableUpdate.releaseNotes && (
                    <div>
                      <p className="text-sm text-gray-600">Release Notes</p>
                      <p className="text-sm text-gray-900 mt-1">{availableUpdate.releaseNotes}</p>
                    </div>
                  )}
                  <div className="pt-4">
                    <Button
                      onClick={handleDownloadAndApplyUpdate}
                      disabled={downloadingUpdate}
                      className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg font-medium"
                    >
                      {downloadingUpdate ? "Downloading..." : "Download & Apply Update"}
                    </Button>
                  </div>
                  {downloadingUpdate && (
                    <div className="mt-4">
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-green-600 h-2 rounded-full transition-all duration-300"
                          style={{ width: `${downloadProgress}%` }}
                        ></div>
                      </div>
                      <p className="text-xs text-gray-600 mt-2">{downloadProgress}% downloaded</p>
                    </div>
                  )}
                </div>
              </Card>
            )}

            {/* Update Status */}
            {updateStatus.message && (
              <Card className="p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Status</h2>
                <div className={`flex items-start space-x-3 p-4 bg-gray-50 rounded-lg ${getStatusColor()}`}>
                  <span className="text-2xl">{getStatusIcon()}</span>
                  <div>
                    <p className="font-medium">{updateStatus.message}</p>
                    {updateStatus.status === "ready" && (
                      <p className="text-sm text-gray-600 mt-2">
                        Restart the app to apply the update. Your data will not be affected.
                      </p>
                    )}
                  </div>
                </div>
              </Card>
            )}

            {/* Update Information */}
            <Card className="p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">About Updates</h2>
              <div className="space-y-3 text-sm text-gray-600">
                <p>
                  <strong>Automatic Checking:</strong> When enabled, the app automatically checks for updates every 24 hours and notifies you.
                </p>
                <p>
                  <strong>Your Choice:</strong> When an update is available, you can choose to update now or continue using the app. You can always update manually later.
                </p>
                <p>
                  <strong>Patch Updates:</strong> Small updates (5-50 MB) that only include changed files. Faster to download and apply.
                </p>
                <p>
                  <strong>Full Release:</strong> Complete app update (200+ MB). Used when patches are not available.
                </p>
                <p>
                  <strong>Download Time:</strong> 1-5 minutes (depends on internet speed and update type)
                </p>
                <p>
                  <strong>Installation Time:</strong> 1-2 minutes after restart
                </p>
                <p>
                  <strong>Data Safety:</strong> Updates do not affect your patient records, settings, or backups. All data is preserved.
                </p>
              </div>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
