import { NextResponse } from 'next/server';
import { serverDb } from '@/lib/db/server-database';
import { getDBSync } from '@/lib/db-sync';
import type { SmartParsingRule } from '@/lib/db/schema';

// Helper to generate ID
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// GET - Fetch all smart parsing rules
export async function GET() {
  try {
    const rules = serverDb.getAll('smartParsingRules');
    const sortedRules = (rules as SmartParsingRule[]).sort((a, b) => b.priority - a.priority);
    return NextResponse.json({ 
      success: true, 
      data: sortedRules
    });
  } catch (error) {
    console.error('Error fetching smart parsing rules:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch rules' }, { status: 500 });
  }
}

// POST - Create a new smart parsing rule
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, type, pattern, replacement, isRegex, priority, isActive } = body;
    
    const newRule = {
      name,
      type,
      pattern,
      replacement,
      isRegex: isRegex || false,
      priority: priority || 0,
      isActive: isActive !== false,
    };
    
    const created = serverDb.create('smartParsingRules', newRule);
    getDBSync()?.queueOperation('create', 'smartParsingRules', created);
    return NextResponse.json({ success: true, data: created });
  } catch (error) {
    console.error('Error creating smart parsing rule:', error);
    return NextResponse.json({ success: false, error: 'Failed to create rule' }, { status: 500 });
  }
}

// PUT - Update a smart parsing rule
export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { id, ...updates } = body;
    
    if (!id) {
      return NextResponse.json({ success: false, error: 'Rule ID required' }, { status: 400 });
    }
    
    const updated = serverDb.update('smartParsingRules', id, updates);
    
    if (!updated) {
      return NextResponse.json({ success: false, error: 'Rule not found' }, { status: 404 });
    }
    
    getDBSync()?.queueOperation('update', 'smartParsingRules', { id, ...updates });
    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error('Error updating smart parsing rule:', error);
    return NextResponse.json({ success: false, error: 'Failed to update rule' }, { status: 500 });
  }
}

// DELETE - Delete a smart parsing rule
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    
    if (!id) {
      return NextResponse.json({ success: false, error: 'Rule ID required' }, { status: 400 });
    }
    
    const deleted = serverDb.delete('smartParsingRules', id);
    
    if (!deleted) {
      return NextResponse.json({ success: false, error: 'Rule not found' }, { status: 404 });
    }
    
    getDBSync()?.queueOperation('delete', 'smartParsingRules', { id });
    return NextResponse.json({ success: true, message: 'Rule deleted' });
  } catch (error) {
    console.error('Error deleting smart parsing rule:', error);
    return NextResponse.json({ success: false, error: 'Failed to delete rule' }, { status: 500 });
  }
}
