import { NextResponse } from 'next/server';
import { serverDb } from '@/lib/db/server-database';

export async function GET() {
  try {
    const plans = serverDb.getAll('purchase_plans');
    return NextResponse.json(plans);
  } catch (error) {
    console.error('Failed to fetch plans:', error);
    return NextResponse.json({ error: 'Failed to fetch plans' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, price, description, modules, isFree } = body;

    if (!name || price === undefined) {
      return NextResponse.json({ error: 'Name and price are required' }, { status: 400 });
    }

    console.log(`API: CREATE plan`, { name, price, isFree, modules: modules?.length || 0 });

    const plan = {
      name,
      price: parseFloat(price),
      description: description || '',
      modules: modules || [],
      isFree: isFree || false,
    };

    console.log(`API: Calling serverDb.create for plan`);
    const createdPlan = serverDb.create('purchase_plans', plan);
    console.log(`API: Plan created with id: ${createdPlan.id}`);
    
    return NextResponse.json(createdPlan, { status: 201 });
  } catch (error) {
    console.error('Failed to create plan:', error);
    return NextResponse.json({ error: 'Failed to create plan' }, { status: 500 });
  }
}
