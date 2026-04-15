// ============================================
// Doctor Panel Database Operations
// Using LocalDatabase API
// ============================================

import { db } from './database';
import { getDBSync } from '@/lib/db-sync';
import type {
  DoctorVisit,
  DoctorPrescription,
  CombinationMedicine,
  PharmacyQueueItem,
  MedicineUsageMemory,
} from './schema';

// Helper to generate ID
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// ============================================
// Visit Operations
// ============================================

export const doctorVisitDb = {
  getAll: () => db.getAll<DoctorVisit>('visits'),
  
  getById: (id: string) => db.getById<DoctorVisit>('visits', id),
  
  getByPatient: (patientId: string) => {
    const visits = db.getAll<DoctorVisit>('visits');
    return visits
      .filter((v) => v.patientId === patientId)
      .sort((a, b) => {
        const dateA = a.visitDate instanceof Date ? a.visitDate.getTime() : new Date(a.visitDate).getTime();
        const dateB = b.visitDate instanceof Date ? b.visitDate.getTime() : new Date(b.visitDate).getTime();
        return dateB - dateA;
      });
  },
  
  getActiveByPatient: (patientId: string) => {
    const visits = db.getAll<DoctorVisit>('visits');
    return visits.find(
      (v) => v.patientId === patientId && v.status === 'active'
    );
  },
  
  create: (visit: Omit<DoctorVisit, 'id' | 'createdAt' | 'updatedAt'>, fromSync: boolean = false) => {
    const newVisit: DoctorVisit = {
      ...visit,
      id: (visit as any).id || generateId(),
      createdAt: (visit as any).createdAt || new Date(),
      updatedAt: (visit as any).updatedAt || new Date(),
    };
    db.create('visits', newVisit as unknown as Record<string, unknown>);
    
    if (!fromSync) {
      getDBSync()?.queueOperation('create', 'visits', newVisit);
    }
    
    return newVisit;
  },
  
  update: (id: string, updates: Partial<Omit<DoctorVisit, 'id' | 'createdAt'>>, fromSync: boolean = false) => {
    const result = db.update<DoctorVisit>('visits', id, updates as Record<string, unknown>);
    
    if (!fromSync && result) {
      getDBSync()?.queueOperation('update', 'visits', { id, ...updates });
    }
    
    return result;
  },
  
  complete: (id: string, fromSync: boolean = false) => {
    return doctorVisitDb.update(id, {
      status: 'completed',
      updatedAt: new Date(),
    }, fromSync);
  },
  
  delete: (id: string, fromSync: boolean = false) => {
    const success = db.delete('visits', id);
    
    if (!fromSync && success) {
      getDBSync()?.queueOperation('delete', 'visits', { id });
    }
    
    return success;
  },
};

// ============================================
// Prescription Operations
// ============================================

export const doctorPrescriptionDb = {
  getAll: () => db.getAll<DoctorPrescription>('prescriptions'),
  
  getById: (id: string) => db.getById<DoctorPrescription>('prescriptions', id),
  
  getByVisit: (visitId: string) => {
    const prescriptions = db.getAll<DoctorPrescription>('prescriptions');
    return prescriptions
      .filter((p) => p.visitId === visitId)
      .sort((a, b) => (a.rowOrder || 0) - (b.rowOrder || 0));
  },
  
  getByPatient: (patientId: string) => {
    const prescriptions = db.getAll<DoctorPrescription>('prescriptions');
    return prescriptions.filter((p) => p.patientId === patientId);
  },
  
  create: (prescription: Omit<DoctorPrescription, 'id'>, fromSync: boolean = false) => {
    const newPrescription: DoctorPrescription = {
      ...prescription,
      id: (prescription as any).id || generateId(),
      createdAt: (prescription as any).createdAt || new Date(),
      updatedAt: (prescription as any).updatedAt || new Date(),
    };
    db.create('prescriptions', newPrescription as unknown as Record<string, unknown>);
    
    if (!fromSync) {
      getDBSync()?.queueOperation('create', 'prescriptions', newPrescription);
    }
    
    return newPrescription;
  },
  
  update: (id: string, updates: Partial<DoctorPrescription>, fromSync: boolean = false) => {
    const result = db.update<DoctorPrescription>('prescriptions', id, updates as Record<string, unknown>);
    
    if (!fromSync && result) {
      getDBSync()?.queueOperation('update', 'prescriptions', { id, ...updates });
    }
    
    return result;
  },
  
  delete: (id: string, fromSync: boolean = false) => {
    const success = db.delete('prescriptions', id);
    
    if (!fromSync && success) {
      getDBSync()?.queueOperation('delete', 'prescriptions', { id });
    }
    
    return success;
  },
  
  deleteByVisit: (visitId: string, fromSync: boolean = false) => {
    const prescriptions = db.getAll<DoctorPrescription>('prescriptions');
    prescriptions.forEach((p) => {
      if (p.visitId === visitId) {
        doctorPrescriptionDb.delete(p.id, fromSync);
      }
    });
  },
};

// ============================================
// Combination Medicine Operations
// ============================================

export const combinationDb = {
  getAll: () => db.getAll<CombinationMedicine>('combinations'),
  
  getById: (id: string) => db.getById<CombinationMedicine>('combinations', id),
  
  getByName: (name: string) => {
    const combinations = db.getAll<CombinationMedicine>('combinations');
    return combinations.find((c) => c.name.toLowerCase() === name.toLowerCase());
  },
  
  search: (query: string) => {
    const combinations = db.getAll<CombinationMedicine>('combinations');
    const lowerQuery = query.toLowerCase();
    return combinations.filter((c) =>
      c.name.toLowerCase().includes(lowerQuery) ||
      c.content.toLowerCase().includes(lowerQuery)
    );
  },
  
  create: (combination: Omit<CombinationMedicine, 'id'>, fromSync: boolean = false) => {
    const newCombination: CombinationMedicine = {
      ...combination,
      id: (combination as any).id || generateId(),
    };
    db.create('combinations', newCombination as unknown as Record<string, unknown>);
    
    if (!fromSync) {
      getDBSync()?.queueOperation('create', 'combinations', newCombination);
    }
    
    return newCombination;
  },
  
  update: (id: string, updates: Partial<CombinationMedicine>, fromSync: boolean = false) => {
    const result = db.update<CombinationMedicine>('combinations', id, updates as Record<string, unknown>);
    
    if (!fromSync && result) {
      getDBSync()?.queueOperation('update', 'combinations', { id, ...updates });
    }
    
    return result;
  },
  
  delete: (id: string, fromSync: boolean = false) => {
    const success = db.delete('combinations', id);
    
    if (!fromSync && success) {
      getDBSync()?.queueOperation('delete', 'combinations', { id });
    }
    
    return success;
  },
};

// ============================================
// Pharmacy Queue Operations
// ============================================

export const pharmacyQueueDb = {
  getAll: () => db.getAll<PharmacyQueueItem>('pharmacy'),
  
  getById: (id: string) => db.getById<PharmacyQueueItem>('pharmacy', id),
  
  getByVisit: (visitId: string) => {
    const queue = db.getAll<PharmacyQueueItem>('pharmacy');
    return queue.find((q) => q.visitId === visitId);
  },
  
  getPending: () => {
    const queue = db.getAll<PharmacyQueueItem>('pharmacy');
    return queue
      .filter((q) => q.status === 'pending')
      .sort((a, b) => {
        // Priority first, then by creation time
        if (a.priority && !b.priority) return -1;
        if (!a.priority && b.priority) return 1;
        const timeA = a.createdAt instanceof Date ? a.createdAt.getTime() : new Date(a.createdAt).getTime();
        const timeB = b.createdAt instanceof Date ? b.createdAt.getTime() : new Date(b.createdAt).getTime();
        return timeA - timeB;
      });
  },
  
  getByPatient: (patientId: string) => {
    const queue = db.getAll<PharmacyQueueItem>('pharmacy');
    return queue.filter((q) => q.patientId === patientId);
  },
  
  create: (item: Omit<PharmacyQueueItem, 'id' | 'createdAt' | 'updatedAt'>, fromSync: boolean = false) => {
    const newItem: PharmacyQueueItem = {
      ...item,
      id: (item as any).id || generateId(),
      createdAt: (item as any).createdAt || new Date(),
      updatedAt: (item as any).updatedAt || new Date(),
    };
    db.create('pharmacy', newItem as unknown as Record<string, unknown>);
    
    if (!fromSync) {
      getDBSync()?.queueOperation('create', 'pharmacy', newItem);
    }
    
    return newItem;
  },
  
  update: (id: string, updates: Partial<PharmacyQueueItem>, fromSync: boolean = false) => {
    const result = db.update<PharmacyQueueItem>('pharmacy', id, {
      ...updates,
      updatedAt: new Date(),
    } as Record<string, unknown>);
    
    if (!fromSync && result) {
      getDBSync()?.queueOperation('update', 'pharmacy', { id, ...updates });
    }
    
    return result;
  },
  
  markPrepared: (id: string, preparedBy: string, fromSync: boolean = false) => {
    const existing = db.getById<PharmacyQueueItem>('pharmacy', id);
    let preparedIds: string[] = [];
    if (existing) {
      const rx = db.getAll<DoctorPrescription>('prescriptions').filter((p) => p.visitId === existing.visitId);
      preparedIds = rx.map((p) => p.id);
    }
    return pharmacyQueueDb.update(id, {
      status: 'prepared',
      preparedBy,
      preparedPrescriptionIds: preparedIds,
      preparedAt: new Date(),
      updatedAt: new Date(),
    }, fromSync);
  },
  
  markDelivered: (id: string, fromSync: boolean = false) => {
    return pharmacyQueueDb.update(id, {
      status: 'delivered',
      deliveredAt: new Date(),
      updatedAt: new Date(),
    }, fromSync);
  },
  
  stop: (id: string, reason: string, fromSync: boolean = false) => {
    return pharmacyQueueDb.update(id, {
      status: 'stopped',
      stopReason: reason,
      updatedAt: new Date(),
    }, fromSync);
  },
  
  delete: (id: string, fromSync: boolean = false) => {
    const success = db.delete('pharmacy', id);
    
    if (!fromSync && success) {
      getDBSync()?.queueOperation('delete', 'pharmacy', { id });
    }
    
    return success;
  },
};

// ============================================
// Medicine Usage Memory Operations
// ============================================

export const medicineMemoryDb = {
  getAll: () => db.getAll<MedicineUsageMemory>('medicineUsageMemory'),
  
  getById: (id: string) => db.getById<MedicineUsageMemory>('medicineUsageMemory', id),
  
  findByMedicine: (medicine: string, potency?: string) => {
    const memory = db.getAll<MedicineUsageMemory>('medicineUsageMemory');
    return memory.find((m) => {
      if (m.medicine.toLowerCase() !== medicine.toLowerCase()) return false;
      if (potency && m.potency !== potency) return false;
      return true;
    });
  },
  
  getTopUsed: (limit: number = 10) => {
    const memory = db.getAll<MedicineUsageMemory>('medicineUsageMemory');
    return memory
      .sort((a, b) => b.useCount - a.useCount)
      .slice(0, limit);
  },
  
  incrementUse: (medicine: string, potency?: string, quantity?: string) => {
    const existing = medicineMemoryDb.findByMedicine(medicine, potency);
    
    if (existing) {
      const updates = {
        useCount: existing.useCount + 1,
        lastUsedAt: new Date(),
        quantity: quantity || existing.quantity,
      };
      const result = db.update<MedicineUsageMemory>('medicineUsageMemory', existing.id, updates as Record<string, unknown>);
      getDBSync()?.queueOperation('update', 'medicineUsageMemory', { id: existing.id, ...updates });
      return result;
    } else {
      const newMemory: MedicineUsageMemory = {
        id: generateId(),
        medicine,
        potency,
        quantity,
        useCount: 1,
        lastUsedAt: new Date(),
        createdAt: new Date(),
      };
      db.create('medicineUsageMemory', newMemory as unknown as Record<string, unknown>);
      getDBSync()?.queueOperation('create', 'medicineUsageMemory', newMemory);
      return newMemory;
    }
  },
  
  create: (memory: Omit<MedicineUsageMemory, 'id' | 'createdAt'>, fromSync: boolean = false) => {
    const newMemory: MedicineUsageMemory = {
      ...memory,
      id: generateId(),
      createdAt: new Date(),
    };
    db.create('medicineUsageMemory', newMemory as unknown as Record<string, unknown>);
    if (!fromSync) getDBSync()?.queueOperation('create', 'medicineUsageMemory', newMemory);
    return newMemory;
  },
  
  delete: (id: string, fromSync: boolean = false) => {
    const success = db.delete('medicineUsageMemory', id);
    if (!fromSync && success) getDBSync()?.queueOperation('delete', 'medicineUsageMemory', { id });
    return success;
  },
};

// ============================================
// Settings Operations
// ============================================

export const doctorSettingsDb = {
  get: (key: string) => {
    const settings = db.getAll('settings');
    const found = settings.find((s: unknown) => {
      const setting = s as { key: string };
      return setting.key === key;
    });
    return found ? (found as { value: string }).value : null;
  },
  
  set: (key: string, value: string, category: string = 'doctor') => {
    const existing = doctorSettingsDb.get(key);
    if (existing !== null) {
      db.update('settings', key, { value, category } as Record<string, unknown>);
    } else {
      db.create('settings', { id: key, key, value, category, createdAt: new Date(), updatedAt: new Date() } as Record<string, unknown>);
    }
  },
};
