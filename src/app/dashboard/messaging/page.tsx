"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/layout/SidebarComponent";
import { getCurrentUser } from "@/lib/permissions";
import MessagingMaster from "@/components/admin/MessagingMaster";
import { Button } from "@/components/ui/Button";

export default function MessagingSettingsPage() {
  const router = useRouter();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Check authentication on mount
  useEffect(() => {
    const user = getCurrentUser();
    if (!user) {
      router.push('/login');
      return;
    }
    
    // Only allow Doctor to access this
    if (user.role !== 'doctor') {
      router.push('/dashboard');
    }
  }, [router]);

  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar collapsed={sidebarCollapsed} onCollapse={setSidebarCollapsed} />
      
      <div
        className={`transition-all duration-300 ${
          sidebarCollapsed ? "ml-16" : "ml-64"
        }`}
      >
        <div className="p-8">
          <div className="flex items-center gap-4 mb-8">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => router.push('/settings')}
            >
              ← Back to Settings
            </Button>
            <h1 className="text-2xl font-bold">Internal Messaging Master Control</h1>
          </div>
          
          <div className="max-w-4xl">
            <MessagingMaster />
          </div>
        </div>
      </div>
    </div>
  );
}
