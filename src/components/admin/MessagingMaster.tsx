"use client";

import { useState, useEffect } from "react";
import { db } from "@/lib/db/database";
import { messagingModuleUserDb, internalMessageDb } from "@/lib/db/internal-messaging";
import type { MessagingModule, MessagingModuleUser } from "@/types";
import { Card, CardHeader, CardTitle, CardContent } from "../ui/Card";
import { Button } from "../ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Switch } from "@/components/ui/Switch";

export default function MessagingMaster() {
  const [moduleUsers, setModuleUsers] = useState<MessagingModuleUser[]>([]);
  const [readReceiptsEnabled, setReadReceiptsEnabled] = useState(true);
  const modules: MessagingModule[] = ["Appointments", "Pharmacy", "Billing"];

  const loadData = () => {
    const users = messagingModuleUserDb.getAll();
    setModuleUsers(users);
    const settings = db.getById('settings', 'messaging') as { readReceipts?: boolean } | undefined;
    setReadReceiptsEnabled(settings?.readReceipts ?? true);
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleToggleStatus = (moduleName: MessagingModule, currentStatus: string) => {
    const newStatus = currentStatus === "active" ? "disabled" : "active";
    messagingModuleUserDb.updateStatus(moduleName, newStatus);
    loadData();
  };

  const handleToggleReadReceipts = (enabled: boolean) => {
    console.log('MessagingMaster: Toggling read receipts to:', enabled);
    setReadReceiptsEnabled(enabled);
    
    // Check if settings exist, otherwise create
    const existing = db.getById('settings', 'messaging');
    if (existing) {
      db.update('settings', 'messaging', { readReceipts: enabled });
    } else {
      db.create('settings', { id: 'messaging', readReceipts: enabled });
    }
  };

  const handleClearMessages = () => {
    if (confirm("Are you sure you want to clear all internal messages?")) {
      internalMessageDb.clearAll();
    }
  };

  return (
    <Card className="w-full border-blue-400 shadow-lg">
      <CardHeader className="flex flex-row items-center justify-between bg-blue-50/50 py-4">
        <CardTitle>Internal Messaging Master Control</CardTitle>
        <div className="flex items-center gap-4">
          <div className="flex items-center space-x-2">
            <Switch id="read-receipts" checked={readReceiptsEnabled} onCheckedChange={handleToggleReadReceipts} />
            <label htmlFor="read-receipts" className="text-sm font-medium">Enable Read Receipts</label>
          </div>
          <Button variant="destructive" size="sm" onClick={handleClearMessages}>
            Clear All Messages
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {modules.map((moduleName) => {
            const user = moduleUsers.find((u) => u.module === moduleName);
            const isActive = !user || user.status === "active";
            const lastActive = user?.lastActive ? new Date(user.lastActive) : null;

            return (
              <Card key={moduleName} className={isActive ? "border-green-100 bg-green-50/30" : "border-red-100 bg-red-50/30"}>
                <CardContent className="pt-6">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="font-bold text-lg">{moduleName}</h3>
                      <p className="text-xs text-gray-500">
                        Last Active: {lastActive ? lastActive.toLocaleTimeString() : "Never"}
                      </p>
                    </div>
                    <Badge variant={isActive ? "success" : "destructive"}>
                      {isActive ? "Enabled" : "Disabled"}
                    </Badge>
                  </div>
                  
                  <div className="flex gap-2">
                    <Button 
                      variant={isActive ? "outline" : "default"} 
                      size="sm" 
                      className="flex-1"
                      onClick={() => handleToggleStatus(moduleName, isActive ? "active" : "disabled")}
                    >
                      {isActive ? "Disable Module" : "Enable Module"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
        <p className="mt-4 text-xs text-gray-400 italic">
          * As Master, the Doctor Panel is always enabled and can control other modules' messaging access.
        </p>
      </CardContent>
    </Card>
  );
}
