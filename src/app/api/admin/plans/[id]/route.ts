import { NextResponse } from 'next/server';
import { serverDb } from '@/lib/db/server-database';

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { name, price, description, modules, isFree } = body;

    if (!name || price === undefined) {
      return NextResponse.json({ error: 'Name and price are required' }, { status: 400 });
    }

    console.log(`API: UPDATE plan ${id}`, { name, price, isFree });
    
    // Force reload from file
    const plans = serverDb.getAll('purchase_plans') as any[];
    console.log(`API: Total plans in database: ${plans.length}`);
    console.log(`API: Plans in database:`, plans.map((p: any) => ({ id: p.id, name: p.name })));
    
    const index = plans.findIndex(p => p.id === id);
    console.log(`API: Looking for plan ID: ${id}, found at index: ${index}`);
    
    if (index === -1) {
      console.error(`API: Plan ${id} not found for update. Available IDs: ${plans.map((p: any) => p.id).join(', ')}`);
      return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
    }

    const updatedPlan = {
      ...plans[index],
      name,
      price: parseFloat(price),
      description: description || '',
      modules: modules || [],
      isFree: isFree || false,
    };

    console.log(`API: Calling serverDb.update for plan ${id}`);
    const result = serverDb.update('purchase_plans', id, updatedPlan);
    console.log(`API: Update result:`, result);
    
    // Verify update by fetching the plan again
    const verifyPlans = serverDb.getAll('purchase_plans') as any[];
    const updated = verifyPlans.find(p => p.id === id);
    console.log(`API: After update, plan exists: ${!!updated}, name: ${updated?.name}`);
    
    return NextResponse.json(updated || updatedPlan);
  } catch (error) {
    console.error('Failed to update plan:', error);
    return NextResponse.json({ error: 'Failed to update plan' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    console.log(`API: DELETE plan ${id}`);
    
    // Check if plan exists before deletion
    const beforeDelete = serverDb.getAll('purchase_plans') as any[];
    const existsBefore = beforeDelete.find(p => p.id === id);
    console.log(`API: Plan exists before delete: ${!!existsBefore}, total plans: ${beforeDelete.length}`);
    
    if (!existsBefore) {
      console.error(`API: Plan ${id} not found for deletion`);
      return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
    }
    
    const deleted = serverDb.delete('purchase_plans', id);
    console.log(`API: Delete result: ${deleted}`);
    
    if (!deleted) {
      console.error(`API: Delete operation returned false for plan ${id}`);
      return NextResponse.json({ error: 'Failed to delete plan' }, { status: 500 });
    }
    
    // Verify deletion by checking if plan still exists
    const remaining = serverDb.getAll('purchase_plans') as any[];
    console.log(`API: After delete, remaining plans: ${remaining.length}`);
    const stillExists = remaining.find(p => p.id === id);
    if (stillExists) {
      console.error(`API: Plan ${id} still exists after deletion!`);
      return NextResponse.json({ error: 'Failed to delete plan - still exists' }, { status: 500 });
    }
    
    console.log(`API: Plan ${id} successfully deleted`);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete plan:', error);
    return NextResponse.json({ error: 'Failed to delete plan' }, { status: 500 });
  }
}
