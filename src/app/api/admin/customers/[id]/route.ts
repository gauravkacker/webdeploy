import { NextResponse } from 'next/server';
import { serverDb } from '@/lib/db/server-database';

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  try {
    const body = await request.json();
    const { name, email, phone, clinicName, clinicAddress, drRegistration, drDegree } = body;

    if (!name || !email) {
      return NextResponse.json({ error: 'Name and email are required' }, { status: 400 });
    }

    const customers = serverDb.getAll('customers') as any[];
    const index = customers.findIndex(c => c.id === params.id);
    
    if (index === -1) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }

    customers[index] = {
      ...customers[index],
      name,
      email,
      phone: phone || '',
      clinicName: clinicName || '',
      clinicAddress: clinicAddress || '',
      drRegistration: drRegistration || '',
      drDegree: drDegree || '',
    };

    serverDb.update('customers', params.id, customers[index]);
    return NextResponse.json(customers[index]);
  } catch (error) {
    console.error('Failed to update customer:', error);
    return NextResponse.json({ error: 'Failed to update customer' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    serverDb.delete('customers', params.id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete customer:', error);
    return NextResponse.json({ error: 'Failed to delete customer' }, { status: 500 });
  }
}
