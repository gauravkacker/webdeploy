'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Sidebar } from '@/components/layout/SidebarComponent';

interface ReportData {
  totalCustomers: number;
  activeLicenses: number;
  expiredLicenses: number;
  totalRevenue: number;
  averageLicenseValue: number;
  expiringLicenses: number;
}

export default function ReportsPage() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [data, setData] = useState<ReportData>({
    totalCustomers: 0,
    activeLicenses: 0,
    expiredLicenses: 0,
    totalRevenue: 0,
    averageLicenseValue: 0,
    expiringLicenses: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchReportData();
  }, []);

  const fetchReportData = async () => {
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
      const expiringLicenses = licensesData.licenses?.filter((l: any) => {
        const daysUntilExpiry = Math.ceil(
          (new Date(l.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
        );
        return daysUntilExpiry > 0 && daysUntilExpiry <= 30;
      }).length || 0;

      const totalRevenue = plansData.plans?.reduce((sum: number, p: any) => sum + p.price, 0) || 0;
      const averageLicenseValue = activeLicenses > 0 ? totalRevenue / activeLicenses : 0;

      setData({
        totalCustomers: customersData.total || 0,
        activeLicenses,
        expiredLicenses,
        totalRevenue,
        averageLicenseValue,
        expiringLicenses,
      });
    } catch (error) {
      console.error('Failed to fetch report data:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Sidebar collapsed={sidebarCollapsed} onToggle={setSidebarCollapsed} />
      <div className={`min-h-screen bg-gray-50 p-8 transition-all duration-300 ${sidebarCollapsed ? 'ml-16' : 'ml-64'}`}>
        <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <Link href="/admin/software-delivery">
            <button className="text-blue-600 hover:text-blue-800 mb-4 flex items-center gap-2">
              ← Back
            </button>
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">Reports & Analytics</h1>
          <p className="text-gray-600 mt-2">View usage trends and revenue reports</p>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-gray-500 text-sm font-medium">Total Customers</div>
            <div className="text-3xl font-bold text-gray-900 mt-2">{data.totalCustomers}</div>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-gray-500 text-sm font-medium">Active Licenses</div>
            <div className="text-3xl font-bold text-green-600 mt-2">{data.activeLicenses}</div>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-gray-500 text-sm font-medium">Expired Licenses</div>
            <div className="text-3xl font-bold text-red-600 mt-2">{data.expiredLicenses}</div>
          </div>
        </div>

        {/* Additional Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-gray-500 text-sm font-medium">Total Revenue</div>
            <div className="text-3xl font-bold text-gray-900 mt-2">${data.totalRevenue.toFixed(2)}</div>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-gray-500 text-sm font-medium">Average License Value</div>
            <div className="text-3xl font-bold text-gray-900 mt-2">${data.averageLicenseValue.toFixed(2)}</div>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-gray-500 text-sm font-medium">Expiring Soon (30 days)</div>
            <div className="text-3xl font-bold text-yellow-600 mt-2">{data.expiringLicenses}</div>
          </div>
        </div>

        {/* Summary */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Summary</h2>
          <div className="space-y-3 text-gray-600">
            <p>
              You have <strong>{data.totalCustomers}</strong> customers with{' '}
              <strong>{data.activeLicenses}</strong> active licenses.
            </p>
            <p>
              <strong>{data.expiredLicenses}</strong> licenses have expired and{' '}
              <strong>{data.expiringLicenses}</strong> will expire within the next 30 days.
            </p>
            <p>
              Total revenue from plans is <strong>${data.totalRevenue.toFixed(2)}</strong> with an average
              license value of <strong>${data.averageLicenseValue.toFixed(2)}</strong>.
            </p>
          </div>
        </div>
        </div>
      </div>
    </>
  );
}
