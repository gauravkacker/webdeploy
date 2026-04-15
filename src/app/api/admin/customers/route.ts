import { NextResponse } from 'next/server';
import { serverDb } from '@/lib/db/server-database';

export async function GET() {
  try {
    const customers = serverDb.getAll('customers');
    return NextResponse.json(customers);
  } catch (error) {
    console.error('Failed to fetch customers:', error);
    return NextResponse.json({ error: 'Failed to fetch customers' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, email, phone, clinicName, clinicAddress, drRegistration, drDegree } = body;

    if (!name || !email) {
      return NextResponse.json({ error: 'Name and email are required' }, { status: 400 });
    }

    const customer = {
      name,
      email,
      phone: phone || '',
      clinicName: clinicName || '',
      clinicAddress: clinicAddress || '',
      drRegistration: drRegistration || '',
      drDegree: drDegree || '',
    };

    const createdCustomer = serverDb.create('customers', customer);
    return NextResponse.json(createdCustomer, { status: 201 });
  } catch (error) {
    console.error('Failed to create customer:', error);
    return NextResponse.json({ error: 'Failed to create customer' }, { status: 500 });
  }
}
