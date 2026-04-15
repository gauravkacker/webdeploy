// ============================================
// Internal Messaging Database Operations
// Using LocalDatabase API
// ============================================

import { db } from './database';
import { getDBSync } from '@/lib/db-sync';
import type {
  InternalMessage,
  MessagingModule,
  MessagingModuleUser,
} from '@/types';

// Helper to generate ID
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// ============================================
// Message Operations
// ============================================

export const internalMessageDb = {
  getAll: () => {
    try {
      const messages = db.getAll<InternalMessage>('internalMessages');
      return messages.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } catch (error) {
      console.warn('Failed to get internal messages:', error);
      return [];
    }
  },

  getByModule: (moduleName: MessagingModule) => {
    try {
      const messages = db.getAll<InternalMessage>('internalMessages');
      return messages
        .filter((m) => m.receiverModule === moduleName || m.receiverModule === 'All' || m.senderModule === moduleName)
        .filter((m) => !m.isDeleted)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } catch (error) {
      return [];
    }
  },

  getLatest: (moduleName: MessagingModule, count: number = 4) => {
    try {
      const messages = internalMessageDb.getByModule(moduleName);
      return messages.slice(0, count);
    } catch (error) {
      return [];
    }
  },

  create: (message: Omit<InternalMessage, 'id' | 'createdAt' | 'isRead'>, fromSync: boolean = false) => {
    try {
      const newMessage: InternalMessage = {
        ...message,
        id: (message as any).id || generateId(),
        isRead: false,
        createdAt: (message as any).createdAt || new Date(),
      };
      
      db.create('internalMessages', newMessage as unknown as Record<string, unknown>);
      
      // LAN Sync
      if (!fromSync) {
        getDBSync()?.queueOperation('create', 'internalMessages', newMessage);
      }
      
      return newMessage;
    } catch (error) {
      console.error('Failed to create internal message:', error);
      return null;
    }
  },

  markRead: (id: string, fromSync: boolean = false) => {
    try {
      db.update('internalMessages', id, { isRead: true } as Record<string, unknown>);
      
      // LAN Sync
      if (!fromSync) {
        getDBSync()?.queueOperation('update', 'internalMessages', { id, isRead: true });
      }
    } catch (error) {
      // Ignore
    }
  },

  markAllAsRead: (moduleName: MessagingModule, fromSync: boolean = false) => {
    try {
      const messages = internalMessageDb.getByModule(moduleName);
      messages.forEach((message) => {
        if (!message.isRead && message.senderModule !== moduleName) {
          internalMessageDb.markRead(message.id, fromSync);
        }
      });
    } catch (error) {
      console.error('Failed to mark all messages as read:', error);
    }
  },

  delete: (id: string, fromSync: boolean = false) => {
    try {
      db.update('internalMessages', id, { isDeleted: true } as Record<string, unknown>);
      
      // LAN Sync
      if (!fromSync) {
        getDBSync()?.queueOperation('delete', 'internalMessages', { id });
      }
    } catch (error) {
      // Ignore
    }
  },

  clearAll: (fromSync: boolean = false) => {
    try {
      const messages = db.getAll<InternalMessage>('internalMessages');
      messages.forEach((m) => {
        db.delete('internalMessages', m.id);
      });
      
      // LAN Sync
      if (!fromSync) {
        getDBSync()?.queueOperation('delete', 'internalMessages', { all: true });
      }
    } catch (error) {
      // Ignore
    }
  }
};

// ============================================
// Module User Operations (Master Control)
// ============================================

export const messagingModuleUserDb = {
  getAll: () => {
    try {
      return db.getAll<MessagingModuleUser>('messagingModuleUsers');
    } catch (error) {
      console.warn('Failed to get messaging users, table might not exist yet:', error);
      return [];
    }
  },

  getById: (id: string) => {
    try {
      return db.getById<MessagingModuleUser>('messagingModuleUsers', id);
    } catch (error) {
      return undefined;
    }
  },

  getByModule: (moduleName: MessagingModule) => {
    try {
      const users = messagingModuleUserDb.getAll();
      return users.find((u) => u.module === moduleName);
    } catch (error) {
      return undefined;
    }
  },

  updateStatus: (moduleName: MessagingModule, status: 'active' | 'disabled', fromSync: boolean = false) => {
    try {
      const user = messagingModuleUserDb.getByModule(moduleName);
      let updatedUser: MessagingModuleUser;
      
      if (user) {
        updatedUser = { ...user, status, lastActive: new Date() };
        db.update('messagingModuleUsers', user.id, { status, lastActive: updatedUser.lastActive } as Record<string, unknown>);
      } else {
        updatedUser = {
          id: generateId(),
          module: moduleName,
          name: moduleName,
          status,
          lastActive: new Date(),
        };
        db.create('messagingModuleUsers', updatedUser as unknown as Record<string, unknown>);
      }
      
      // LAN Sync
      if (!fromSync) {
        getDBSync()?.queueOperation('update', 'messagingModuleUsers', { module: moduleName, status });
      }
    } catch (error) {
      console.error('Failed to update messaging status:', error);
    }
  },

  updateLastActive: (moduleName: MessagingModule, fromSync: boolean = false) => {
    try {
      const user = messagingModuleUserDb.getByModule(moduleName);
      if (user) {
        db.update('messagingModuleUsers', user.id, { lastActive: new Date() } as Record<string, unknown>);
      } else {
        const newUser: MessagingModuleUser = {
          id: generateId(),
          module: moduleName,
          name: moduleName,
          status: 'active',
          lastActive: new Date(),
        };
        db.create('messagingModuleUsers', newUser as unknown as Record<string, unknown>);
      }
      
      // LAN Sync
      if (!fromSync) {
        getDBSync()?.queueOperation('create', 'messagingModuleUsers', { module: moduleName });
      }
    } catch (error) {
      // Silently fail for background updates
    }
  },

  isModuleEnabled: (moduleName: MessagingModule) => {
    try {
      const user = messagingModuleUserDb.getByModule(moduleName);
      return !user || user.status === 'active';
    } catch (error) {
      return true; // Default to enabled if DB check fails
    }
  }
};
