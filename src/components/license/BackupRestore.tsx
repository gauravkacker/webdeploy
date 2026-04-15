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

interface BackupRestoreProps {
  machineId: string;
  onBackupCreated?: () => void;
  onBackupRestored?: () => void;
}

export function BackupRestore({
  machineId,
  onBackupCreated,
  onBackupRestored,
}: BackupRestoreProps) {
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [creatingBackup, setCreatingBackup] = useState(false);

  // Load backups on mount
  useEffect(() => {
    loadBackups();
  }, []);

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

  const handleCreateBackup = async () => {
    try {
      setCreatingBackup(true);
      setError(null);
      setSuccess(null);

      const response = await fetch('/api/license/backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ machineId }),
      });

      const data = await response.json();

      if (data.success) {
        setSuccess('Backup created successfully');
        onBackupCreated?.();
        await loadBackups();
      } else {
        setError(data.error || 'Failed to create backup');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create backup');
    } finally {
      setCreatingBackup(false);
    }
  };

  const handleDownloadBackup = async (backupId: string) => {
    try {
      setError(null);
      const response = await fetch(`/api/license/backups/${backupId}/download`);

      if (!response.ok) {
        throw new Error('Failed to download backup');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${backupId}.bin`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to download backup');
    }
  };

  const handleDeleteBackup = async (backupId: string) => {
    if (!confirm('Are you sure you want to delete this backup?')) {
      return;
    }

    try {
      setError(null);
      const response = await fetch(`/api/license/backups/${backupId}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (data.success) {
        setSuccess('Backup deleted successfully');
        await loadBackups();
      } else {
        setError(data.error || 'Failed to delete backup');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete backup');
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
          <CardTitle>License Backup & Restore</CardTitle>
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

          <div className="flex gap-2">
            <Button
              onClick={handleCreateBackup}
              disabled={creatingBackup || loading}
              className="gap-2"
            >
              +
              {creatingBackup ? 'Creating Backup...' : 'Create Backup'}
            </Button>
            <Button
              onClick={loadBackups}
              disabled={loading}
              variant="outline"
              className="gap-2"
            >
              ↻
              Refresh
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Backup History</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-gray-500">Loading backups...</div>
          ) : backups.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No backups found. Create one to protect your license.
            </div>
          ) : (
            <div className="space-y-2">
              {backups.map((backup) => (
                <div
                  key={backup.backupId}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50"
                >
                  <div className="flex-1">
                    <div className="font-medium text-sm">{backup.backupId}</div>
                    <div className="text-xs text-gray-500 space-y-1">
                      <div>Created: {formatDate(backup.timestamp)}</div>
                      <div>Size: {formatSize(backup.size)}</div>
                      <div>Expires: {formatDate(backup.expiresAt)}</div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={() => handleDownloadBackup(backup.backupId)}
                      size="sm"
                      variant="outline"
                      className="gap-2"
                    >
                      ↓
                      Download
                    </Button>
                    <Button
                      onClick={() => handleDeleteBackup(backup.backupId)}
                      size="sm"
                      variant="outline"
                      className="gap-2 text-red-600 hover:text-red-700"
                    >
                      🗑
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Restore from Backup</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="p-4 border border-blue-200 bg-blue-50 rounded-lg">
              <div className="flex gap-2">
                <span className="text-blue-600 flex-shrink-0 mt-0.5">ℹ</span>
                <div className="text-blue-800 text-sm">
                  You can restore your license from a backup. Select a backup from the list above
                  and click the restore button to recover your license.
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
