'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';

interface BackupInfo {
  backupId: string;
  machineId: string;
  timestamp: Date;
  size: number;
  licenseKey: string;
  expiresAt: Date;
  checksum: string;
}

interface RestoreInfo {
  licenseKey: string;
  machineId: string;
  expiresAt: Date;
  modules: string[];
  createdAt: Date;
}

interface RestoreFromBackupProps {
  onRestoreComplete?: () => void;
}

export function RestoreFromBackup({ onRestoreComplete }: RestoreFromBackupProps) {
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [selectedBackupId, setSelectedBackupId] = useState<string | null>(null);
  const [restoreInfo, setRestoreInfo] = useState<RestoreInfo | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);

  // Load backups on mount
  useEffect(() => {
    loadBackups();
  }, []);

  // Load restore info when backup is selected
  useEffect(() => {
    if (selectedBackupId) {
      loadRestoreInfo(selectedBackupId);
    } else {
      setRestoreInfo(null);
    }
  }, [selectedBackupId]);

  const loadBackups = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch('/api/license/backups');
      const data = await response.json();

      if (data.success) {
        setBackups(data.backups || []);
      } else {
        setError(data.error || 'Failed to load backups');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load backups');
    } finally {
      setLoading(false);
    }
  };

  const loadRestoreInfo = async (backupId: string) => {
    try {
      setError(null);
      const response = await fetch(`/api/license/restore/preview/${backupId}`);
      const data = await response.json();

      if (data.success) {
        setRestoreInfo(data.info);
      } else {
        setError(data.error || 'Failed to load restore info');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load restore info');
    }
  };

  const handleRestore = async () => {
    if (!selectedBackupId) {
      setError('Please select a backup to restore');
      return;
    }

    try {
      setRestoring(true);
      setError(null);
      setSuccess(null);

      const response = await fetch('/api/license/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ backupId: selectedBackupId }),
      });

      const data = await response.json();

      if (data.success) {
        setSuccess('License restored successfully');
        setShowConfirmation(false);
        setSelectedBackupId(null);
        onRestoreComplete?.();
        await loadBackups();
      } else {
        setError(data.error || 'Failed to restore backup');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to restore backup');
    } finally {
      setRestoring(false);
    }
  };

  const formatDate = (date: Date | string) => {
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleString();
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Restore License from Backup</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <div className="p-4 border border-red-200 bg-red-50 rounded-lg">
              <div className="flex gap-2">
                <span className="text-red-600 flex-shrink-0 mt-0.5">⚠</span>
                <div className="text-red-800 text-sm">{error}</div>
              </div>
            </div>
          )}

          {success && (
            <div className="p-4 border border-green-200 bg-green-50 rounded-lg">
              <div className="text-green-800 text-sm">{success}</div>
            </div>
          )}

          <div className="p-4 border border-blue-200 bg-blue-50 rounded-lg">
            <div className="flex gap-2">
              <span className="text-blue-600 flex-shrink-0 mt-0.5">ℹ</span>
              <div className="text-blue-800 text-sm">
                Select a backup to restore your license. This will overwrite your current license
                with the backed-up version.
              </div>
            </div>
          </div>

          {loading ? (
            <div className="text-center py-8 text-gray-500">Loading backups...</div>
          ) : backups.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No backups available. Create a backup first to restore from it.
            </div>
          ) : (
            <div className="space-y-3">
              {backups.map((backup) => (
                <div
                  key={backup.backupId}
                  className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                    selectedBackupId === backup.backupId
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:bg-gray-50'
                  }`}
                  onClick={() => setSelectedBackupId(backup.backupId)}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="radio"
                      name="backup"
                      value={backup.backupId}
                      checked={selectedBackupId === backup.backupId}
                      onChange={() => setSelectedBackupId(backup.backupId)}
                      className="mt-1"
                    />
                    <div className="flex-1">
                      <div className="font-medium text-sm">{backup.backupId}</div>
                      <div className="text-xs text-gray-500 space-y-1 mt-2">
                        <div>License Key: {backup.licenseKey}</div>
                        <div>Created: {formatDate(backup.timestamp)}</div>
                        <div>Expires: {formatDate(backup.expiresAt)}</div>
                        <div>Size: {formatSize(backup.size)}</div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {selectedBackupId && restoreInfo && (
        <Card>
          <CardHeader>
            <CardTitle>Restore Preview</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">License Key:</span>
                <span className="text-sm font-medium">{restoreInfo.licenseKey}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Machine ID:</span>
                <span className="text-sm font-medium">{restoreInfo.machineId}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Expires:</span>
                <span className="text-sm font-medium">{formatDate(restoreInfo.expiresAt)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Modules:</span>
                <span className="text-sm font-medium">{restoreInfo.modules.join(', ')}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Created:</span>
                <span className="text-sm font-medium">{formatDate(restoreInfo.createdAt)}</span>
              </div>
            </div>

            {!showConfirmation ? (
              <Button
                onClick={() => setShowConfirmation(true)}
                disabled={restoring}
                className="w-full"
              >
                Restore This License
              </Button>
            ) : (
              <div className="space-y-3">
                <div className="p-4 border border-yellow-200 bg-yellow-50 rounded-lg">
                  <div className="flex gap-2">
                    <span className="text-yellow-600 flex-shrink-0 mt-0.5">⚠</span>
                    <div className="text-yellow-800 text-sm">
                      This will overwrite your current license with the backed-up version. This
                      action cannot be undone.
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={handleRestore}
                    disabled={restoring}
                    className="flex-1"
                  >
                    {restoring ? 'Restoring...' : 'Confirm Restore'}
                  </Button>
                  <Button
                    onClick={() => setShowConfirmation(false)}
                    disabled={restoring}
                    variant="outline"
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
