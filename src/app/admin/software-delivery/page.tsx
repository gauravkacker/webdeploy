'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/layout/SidebarComponent';
import { getCurrentUser } from '@/lib/permissions';

interface DashboardStats {
  totalCustomers: number;
  activeLicenses: number;
  expiredLicenses: number;
  totalRevenue: number;
}

export default function SoftwareDeliveryDashboard() {
  const router = useRouter();
  const [stats, setStats] = useState<DashboardStats>({
    totalCustomers: 0,
    activeLicenses: 0,
    expiredLicenses: 0,
    totalRevenue: 0,
  });
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    // Check user authorization on component mount
    const user = getCurrentUser();
    
    // Check if licensing module is enabled in this build
    const licensingEnabled = process.env.NEXT_PUBLIC_ENABLE_LICENSING === 'true';
    
    if (!user || user.role !== 'doctor' || !licensingEnabled) {
      // Redirect non-admin users or if licensing is disabled to home page
      router.push('/');
      return;
    }
    setAuthorized(true);
  }, [router]);

  useEffect(() => {
    if (!authorized) return;

    const fetchStats = async () => {
      try {
        const [customersRes, licensesRes, plansRes] = await Promise.all([
          fetch('/api/admin/customers'),
          fetch('/api/admin/licenses'),
          fetch('/api/admin/plans'),
        ]);

        const customersData = await customersRes.json();
        const licensesData = await licensesRes.json();
        const plansData = await plansRes.json();

        const activeLicenses = licensesData.licenses?.filter((l: any) => l.status === 'active').length || 0;
        const expiredLicenses = licensesData.licenses?.filter((l: any) => l.status === 'expired').length || 0;

        setStats({
          totalCustomers: customersData.total || 0,
          activeLicenses,
          expiredLicenses,
          totalRevenue: 0,
        });
      } catch (error) {
        console.error('Failed to fetch stats:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [authorized]);

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <Sidebar />
      
      <div className="flex-1 ml-64">
        {!authorized ? (
          <div className="flex items-center justify-center h-screen">
            <div className="text-center">
              <div className="text-gray-500 text-lg">Checking authorization...</div>
            </div>
          </div>
        ) : (
          <div className="p-8">
            <div className="max-w-7xl mx-auto">
            {/* Header */}
            <div className="mb-8">
              <h1 className="text-3xl font-bold text-gray-900">Software Delivery & Licensing</h1>
              <p className="text-gray-600 mt-2">Manage customers, licenses, and deployment packages</p>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
              <div className="bg-white rounded-lg shadow p-6">
                <div className="text-gray-500 text-sm font-medium">Total Customers</div>
                <div className="text-3xl font-bold text-gray-900 mt-2">{stats.totalCustomers}</div>
              </div>
              <div className="bg-white rounded-lg shadow p-6">
                <div className="text-gray-500 text-sm font-medium">Active Licenses</div>
                <div className="text-3xl font-bold text-green-600 mt-2">{stats.activeLicenses}</div>
              </div>
              <div className="bg-white rounded-lg shadow p-6">
                <div className="text-gray-500 text-sm font-medium">Expired Licenses</div>
                <div className="text-3xl font-bold text-red-600 mt-2">{stats.expiredLicenses}</div>
              </div>
              <div className="bg-white rounded-lg shadow p-6">
                <div className="text-gray-500 text-sm font-medium">Total Revenue</div>
                <div className="text-3xl font-bold text-gray-900 mt-2">₹{stats.totalRevenue}</div>
              </div>
            </div>

            {/* 📋 License Creation Workflow */}
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                <span>📋</span> License Creation Workflow
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Link href="/admin/software-delivery/customers">
                  <div className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition cursor-pointer border-l-4 border-blue-500">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-2xl">👥</span>
                      <span className="text-sm font-semibold text-blue-600">Step 1</span>
                    </div>
                    <div className="text-lg font-semibold text-gray-900">Manage Customers</div>
                    <p className="text-gray-600 text-sm mt-2">Create, edit, and manage customer accounts</p>
                    <div className="mt-4 text-blue-600 font-medium">View →</div>
                  </div>
                </Link>

                <Link href="/admin/software-delivery/generate-license">
                  <div className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition cursor-pointer border-l-4 border-green-500">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-2xl">🔑</span>
                      <span className="text-sm font-semibold text-green-600">Step 2</span>
                    </div>
                    <div className="text-lg font-semibold text-gray-900">Generate License</div>
                    <p className="text-gray-600 text-sm mt-2">Create licenses for customers with custom validity</p>
                    <div className="mt-4 text-blue-600 font-medium">View →</div>
                  </div>
                </Link>

                <Link href="/admin/software-delivery/packages">
                  <div className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition cursor-pointer border-l-4 border-purple-500">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-2xl">📦</span>
                      <span className="text-sm font-semibold text-purple-600">Step 3</span>
                    </div>
                    <div className="text-lg font-semibold text-gray-900">Generate Packages</div>
                    <p className="text-gray-600 text-sm mt-2">Create deployment packages for customers</p>
                    <div className="mt-4 text-blue-600 font-medium">View →</div>
                  </div>
                </Link>
              </div>
            </div>

            {/* 🔧 License Management */}
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                <span>🔧</span> License Management
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Link href="/admin/software-delivery/licenses">
                  <div className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition cursor-pointer">
                    <div className="text-lg font-semibold text-gray-900">View All Licenses</div>
                    <p className="text-gray-600 text-sm mt-2">Track and manage all generated licenses</p>
                  </div>
                </Link>

                <Link href="/admin/software-delivery/license-transfer">
                  <div className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition cursor-pointer">
                    <div className="text-lg font-semibold text-gray-900">License Transfer</div>
                    <p className="text-gray-600 text-sm mt-2">Transfer licenses to new machines and manage transfers</p>
                  </div>
                </Link>

                <Link href="/admin/software-delivery/license-renewal">
                  <div className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition cursor-pointer">
                    <div className="text-lg font-semibold text-gray-900">License Renewal</div>
                    <p className="text-gray-600 text-sm mt-2">Generate renewal .LIC files to extend customer licenses</p>
                  </div>
                </Link>
              </div>
            </div>

            {/* ⚙️ Advanced Operations */}
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                <span>⚙️</span> Advanced Operations
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Link href="/admin/software-delivery/machine-binding">
                  <div className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition cursor-pointer">
                    <div className="text-lg font-semibold text-gray-900">Machine Binding</div>
                    <p className="text-gray-600 text-sm mt-2">View and manage all licensed machines with binding status</p>
                  </div>
                </Link>

                <Link href="/admin/software-delivery/reuse-attempts">
                  <div className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition cursor-pointer">
                    <div className="text-lg font-semibold text-gray-900">Reuse Attempts</div>
                    <p className="text-gray-600 text-sm mt-2">Monitor and track license reuse attempts on different machines</p>
                  </div>
                </Link>

                <Link href="/admin/software-delivery/plans">
                  <div className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition cursor-pointer">
                    <div className="text-lg font-semibold text-gray-900">Purchase Plans</div>
                    <p className="text-gray-600 text-sm mt-2">Create and manage subscription plans</p>
                  </div>
                </Link>

                <Link href="/admin/software-delivery/reports">
                  <div className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition cursor-pointer">
                    <div className="text-lg font-semibold text-gray-900">Reports & Analytics</div>
                    <p className="text-gray-600 text-sm mt-2">View usage trends and revenue reports</p>
                  </div>
                </Link>
              </div>
            </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
