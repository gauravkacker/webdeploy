'use server';

import { serverDb } from '@/lib/db/server-database';
import type { PurchasePlan } from '@/lib/db/schema';
import PlanDetailClient from './client';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function PlanDetailPage({ params }: Props) {
  const { id } = await params;
  
  try {
    const plan = serverDb.getById<PurchasePlan>('purchase_plans', id);
    
    if (!plan) {
      return (
        <div className="min-h-screen bg-gray-50 p-8 text-center">
          <h1 className="text-2xl font-bold text-gray-900">Plan not found</h1>
        </div>
      );
    }

    return <PlanDetailClient initialPlan={plan} planId={id} />;
  } catch (error) {
    console.error('Failed to fetch plan:', error);
    return (
      <div className="min-h-screen bg-gray-50 p-8 text-center">
        <h1 className="text-2xl font-bold text-gray-900">Error loading plan</h1>
      </div>
    );
  }
}
