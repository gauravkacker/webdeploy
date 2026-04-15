'use client';

import React, { useState, useEffect } from 'react';
import { Sidebar } from '@/components/layout/SidebarComponent';
import { Card, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { isElectron } from '@/lib/ipc-client';

export default function DatabaseSettings() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mode, setMode] = useState<'desktop' | 'web'>('web');
  const [dbPath, setDbPath] = useState('');
  const [fullPath, setFullPath] = useState('');
  const [buildMode, setBuildMode] = useState<'dev' | 'prod'>('prod');

  // Determine mode on client side only to avoid hydration mismatch
  useEffect(() => {
    setMode(isElectron() ? 'desktop' : 'web');
    
    // Get build mode from environment
    const isDev = process.env.NEXT_PUBLIC_BUILD_MODE === 'dev';
    setBuildMode(isDev ? 'dev' : 'prod');
    
    // Set database path based on build mode and mode
    const suffix = isDev ? '-dev' : '';
    
    if (isElectron()) {
      const path = `C:\\Users\\PC\\AppData\\Roaming\\HomeoPMS${suffix}\\.data\\database.json`;
      setDbPath(path);
      setFullPath(path);
    } else {
      // For web mode, show the full AppData path
      const fullAppDataPath = `C:\\Users\\PC\\AppData\\Roaming\\HomeoPMS${suffix}\\.data\\database.json`;
      const relativePath = `.data${suffix}/database.json`;
      setDbPath(relativePath);
      setFullPath(fullAppDataPath);
    }
  }, []);

  const handleOpenDataFolder = async () => {
    try {
      const electronAPI = (window as any).electronAPI;
      if (electronAPI && electronAPI.openDataFolder) {
        const result = await electronAPI.openDataFolder();
        if (!result.success) {
          alert(`Could not open folder. Please navigate manually to:\n\n${fullPath}`);
        }
      } else {
        // Web mode or Electron API not available
        alert(`Please navigate to:\n\n${fullPath}`);
      }
    } catch (error) {
      console.error('Error opening folder:', error);
      alert(`Please navigate to:\n\n${fullPath}`);
    }
  };

  const handleCopyPath = () => {
    navigator.clipboard.writeText(fullPath);
    alert('Full path copied to clipboard!');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar />
      <div className={`transition-all duration-300 ${sidebarCollapsed ? 'ml-16' : 'ml-64'}`}>
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-6 py-4">
          <div className="flex items-center gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Database Information</h1>
              <p className="text-sm text-gray-500">View your data storage location</p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          <div className="space-y-6 max-w-4xl">
            {/* Storage Mode Card */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold">Storage Mode</h2>
                  <Badge variant={mode === 'desktop' ? 'success' : 'default'}>
                    {mode === 'desktop' ? '🖥️ Desktop (SQLite)' : '🌐 Web (Browser)'}
                  </Badge>
                </div>
              </CardHeader>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Relative Path (Web Mode)
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={dbPath}
                      readOnly
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-md bg-gray-50 text-sm font-mono"
                    />
                    <Button
                      onClick={() => {
                        navigator.clipboard.writeText(dbPath);
                        alert('Relative path copied to clipboard!');
                      }}
                      variant="outline"
                      size="sm"
                    >
                      📋 Copy
                    </Button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Full Path (AppData)
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={fullPath}
                      readOnly
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-md bg-gray-50 text-sm font-mono"
                    />
                    <Button
                      onClick={handleCopyPath}
                      variant="outline"
                      size="sm"
                    >
                      📋 Copy
                    </Button>
                  </div>
                </div>

                <div className="pt-4 border-t border-gray-200">
                  <Button
                    onClick={handleOpenDataFolder}
                    variant="primary"
                    className="w-full"
                  >
                    📁 Open Data Folder
                  </Button>
                  <p className="text-sm text-gray-500 mt-3">
                    Click to open the folder containing your database file, backups, and logs.
                  </p>
                </div>

                {mode === 'web' && (
                  <div className="pt-4 bg-blue-50 border border-blue-200 rounded-md p-4">
                    <p className="text-sm text-blue-800">
                      <strong>ℹ️ Web Mode:</strong> Your data is stored in your browser's local storage. 
                      The full path shown above is where data would be stored in Desktop mode.
                    </p>
                  </div>
                )}
              </div>
            </Card>

            {/* About Data Storage Card */}
            <Card>
              <CardHeader>
                <h2 className="text-lg font-semibold">About Data Storage</h2>
              </CardHeader>
              <div className="p-6 space-y-4 text-sm text-gray-600">
                <div className="border-l-4 border-blue-500 pl-4">
                  <p className="font-semibold text-gray-900">Desktop Mode (SQLite)</p>
                  <p className="mt-1">
                    Data is stored in a SQLite database file on your computer at the path shown above.
                  </p>
                </div>
                
                <div className="border-l-4 border-green-500 pl-4">
                  <p className="font-semibold text-gray-900">Web Mode (Browser)</p>
                  <p className="mt-1">
                    Data is stored in your browser's local storage.
                  </p>
                </div>
              </div>
            </Card>

            {/* Quick Actions Card */}
            <Card>
              <CardHeader>
                <h2 className="text-lg font-semibold">Quick Actions</h2>
              </CardHeader>
              <div className="p-6 space-y-3">
                <Button
                  onClick={() => {
                    navigator.clipboard.writeText(dbPath);
                    alert('Relative path copied to clipboard!');
                  }}
                  variant="outline"
                  className="w-full"
                >
                  📋 Copy Relative Path
                </Button>
                <Button
                  onClick={handleCopyPath}
                  variant="outline"
                  className="w-full"
                >
                  📋 Copy Full Path
                </Button>
                <Button
                  onClick={handleOpenDataFolder}
                  variant="outline"
                  className="w-full"
                >
                  📁 Open Data Folder
                </Button>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
