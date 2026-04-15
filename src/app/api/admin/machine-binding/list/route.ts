import { NextRequest, NextResponse } from 'next/server';
import { serverDb } from '@/lib/db/server-database';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    
    // Get query parameters
    const search = searchParams.get('search') || '';
    const statusFilter = searchParams.get('status') || 'all';
    const sortBy = searchParams.get('sortBy') || 'expiresAt';
    const sortOrder = searchParams.get('sortOrder') || 'asc';

    // Fetch all licenses with machine bindings
    const licenses = serverDb.getAll('licenses').filter((l: any) => l.machineId != null);

    // Calculate status for each license
    const now = new Date();
    const customers = serverDb.getAll('customers');
    
    const machineBindings = licenses.map((license: any) => {
      const customer = customers.find((c: any) => c.id === license.customerId);
      const expiresAt = license.expiresAt ? new Date(license.expiresAt) : null;
      let calculatedStatus = license.status;
      
      if (expiresAt) {
        const daysUntilExpiry = Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        
        if (daysUntilExpiry < 0) {
          calculatedStatus = 'expired';
        } else if (daysUntilExpiry <= 30) {
          calculatedStatus = 'expiring-soon';
        } else {
          calculatedStatus = 'active';
        }
      }

      return {
        id: license.id,
        licenseKey: license.licenseKey,
        machineId: license.machineId,
        machineIdHash: license.machineIdHash,
        expiresAt: license.expiresAt,
        status: calculatedStatus,
        activatedAt: license.activatedAt,
        customerId: license.customerId,
        customerName: customer?.name || '',
        customerEmail: customer?.email || '',
        clinicName: customer?.clinicName || '',
      };
    });

    // Apply search filter
    let filtered = machineBindings;
    if (search) {
      const searchLower = search.toLowerCase();
      filtered = filtered.filter((binding: any) => 
        binding.machineId?.toLowerCase().includes(searchLower) ||
        binding.licenseKey?.toLowerCase().includes(searchLower) ||
        binding.customerName?.toLowerCase().includes(searchLower) ||
        binding.clinicName?.toLowerCase().includes(searchLower)
      );
    }

    // Apply status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter((binding: any) => binding.status === statusFilter);
    }

    // Apply sorting
    filtered.sort((a: any, b: any) => {
      let aVal = a[sortBy];
      let bVal = b[sortBy];

      // Handle date sorting
      if (sortBy === 'expiresAt' || sortBy === 'activatedAt') {
        aVal = aVal ? new Date(aVal).getTime() : 0;
        bVal = bVal ? new Date(bVal).getTime() : 0;
      }

      // Handle string sorting
      if (typeof aVal === 'string') {
        aVal = aVal.toLowerCase();
        bVal = bVal?.toLowerCase() || '';
      }

      if (sortOrder === 'asc') {
        return aVal > bVal ? 1 : -1;
      } else {
        return aVal < bVal ? 1 : -1;
      }
    });

    return NextResponse.json({
      success: true,
      bindings: filtered,
      total: filtered.length,
    });
  } catch (error) {
    console.error('Error fetching machine bindings:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch machine bindings' },
      { status: 500 }
    );
  }
}
