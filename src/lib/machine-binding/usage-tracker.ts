/**
 * Usage Tracker
 * Tracks license usage for offline support and sync
 */

import fs from 'fs';
import path from 'path';

export interface UsageEvent {
  timestamp: Date;
  feature: string;
  action: string;
  duration?: number; // in milliseconds
  metadata?: Record<string, any>;
}

export interface UsageStats {
  machineId: string;
  totalEvents: number;
  lastEventAt: Date;
  firstEventAt: Date;
  features: Record<string, number>;
  totalDuration: number;
}

export interface SyncData {
  machineId: string;
  events: UsageEvent[];
  stats: UsageStats;
  syncedAt: Date;
}

// Default usage directory
const DEFAULT_USAGE_DIR = '.license-usage';

/**
 * Get usage directory path
 */
function getUsageDir(customDir?: string): string {
  return customDir || DEFAULT_USAGE_DIR;
}

/**
 * Ensure usage directory exists
 */
function ensureUsageDir(usageDir: string): boolean {
  try {
    if (!fs.existsSync(usageDir)) {
      fs.mkdirSync(usageDir, { recursive: true });
    }
    return true;
  } catch (error) {
    console.error('Error creating usage directory:', error);
    return false;
  }
}

/**
 * Get usage file path
 */
function getUsageFilePath(usageDir: string, machineId: string): string {
  return path.join(usageDir, `usage-${machineId}.json`);
}

/**
 * Track usage event
 */
export function trackUsage(
  machineId: string,
  feature: string,
  action: string,
  duration?: number,
  metadata?: Record<string, any>,
  usageDir?: string
): boolean {
  try {
    const dir = getUsageDir(usageDir);

    if (!ensureUsageDir(dir)) {
      console.warn('Failed to create usage directory');
      return false;
    }

    const usageFilePath = getUsageFilePath(dir, machineId);

    // Load existing usage data
    let usageData: { events: UsageEvent[]; stats: UsageStats } = {
      events: [],
      stats: {
        machineId,
        totalEvents: 0,
        lastEventAt: new Date(),
        firstEventAt: new Date(),
        features: {},
        totalDuration: 0,
      },
    };

    if (fs.existsSync(usageFilePath)) {
      try {
        const content = fs.readFileSync(usageFilePath, 'utf-8');
        const parsed = JSON.parse(content);
        usageData = {
          events: parsed.events.map((e: any) => ({
            ...e,
            timestamp: new Date(e.timestamp),
          })),
          stats: {
            ...parsed.stats,
            lastEventAt: new Date(parsed.stats.lastEventAt),
            firstEventAt: new Date(parsed.stats.firstEventAt),
          },
        };
      } catch (error) {
        console.warn('Error parsing existing usage data:', error);
      }
    }

    // Add new event
    const event: UsageEvent = {
      timestamp: new Date(),
      feature,
      action,
      duration,
      metadata,
    };

    usageData.events.push(event);

    // Update stats
    usageData.stats.totalEvents++;
    usageData.stats.lastEventAt = event.timestamp;
    if (usageData.stats.totalEvents === 1) {
      usageData.stats.firstEventAt = event.timestamp;
    }

    usageData.stats.features[feature] = (usageData.stats.features[feature] || 0) + 1;

    if (duration) {
      usageData.stats.totalDuration += duration;
    }

    // Keep only last 1000 events to avoid excessive storage
    if (usageData.events.length > 1000) {
      usageData.events = usageData.events.slice(-1000);
    }

    // Save usage data
    fs.writeFileSync(
      usageFilePath,
      JSON.stringify(
        {
          events: usageData.events.map((e) => ({
            ...e,
            timestamp: e.timestamp.toISOString(),
          })),
          stats: {
            ...usageData.stats,
            lastEventAt: usageData.stats.lastEventAt.toISOString(),
            firstEventAt: usageData.stats.firstEventAt.toISOString(),
          },
        },
        null,
        2
      )
    );

    return true;
  } catch (error) {
    console.error('Error tracking usage:', error);
    return false;
  }
}

/**
 * Get usage stats
 */
export function getUsageStats(
  machineId: string,
  usageDir?: string
): UsageStats | null {
  try {
    const dir = getUsageDir(usageDir);
    const usageFilePath = getUsageFilePath(dir, machineId);

    if (!fs.existsSync(usageFilePath)) {
      return null;
    }

    const content = fs.readFileSync(usageFilePath, 'utf-8');
    const data = JSON.parse(content);

    return {
      ...data.stats,
      lastEventAt: new Date(data.stats.lastEventAt),
      firstEventAt: new Date(data.stats.firstEventAt),
    };
  } catch (error) {
    console.error('Error getting usage stats:', error);
    return null;
  }
}

/**
 * Get usage events for sync
 */
export function getUsageForSync(
  machineId: string,
  usageDir?: string
): SyncData | null {
  try {
    const dir = getUsageDir(usageDir);
    const usageFilePath = getUsageFilePath(dir, machineId);

    if (!fs.existsSync(usageFilePath)) {
      return null;
    }

    const content = fs.readFileSync(usageFilePath, 'utf-8');
    const data = JSON.parse(content);

    return {
      machineId,
      events: data.events.map((e: any) => ({
        ...e,
        timestamp: new Date(e.timestamp),
      })),
      stats: {
        ...data.stats,
        lastEventAt: new Date(data.stats.lastEventAt),
        firstEventAt: new Date(data.stats.firstEventAt),
      },
      syncedAt: new Date(),
    };
  } catch (error) {
    console.error('Error getting usage for sync:', error);
    return null;
  }
}

/**
 * Clear usage data after sync
 */
export function clearUsageData(
  machineId: string,
  usageDir?: string
): boolean {
  try {
    const dir = getUsageDir(usageDir);
    const usageFilePath = getUsageFilePath(dir, machineId);

    if (fs.existsSync(usageFilePath)) {
      fs.unlinkSync(usageFilePath);
    }

    return true;
  } catch (error) {
    console.error('Error clearing usage data:', error);
    return false;
  }
}

/**
 * Get all usage data
 */
export function getAllUsageData(usageDir?: string): Record<string, UsageStats> {
  try {
    const dir = getUsageDir(usageDir);

    if (!fs.existsSync(dir)) {
      return {};
    }

    const files = fs.readdirSync(dir);
    const allUsage: Record<string, UsageStats> = {};

    for (const file of files) {
      if (file.startsWith('usage-') && file.endsWith('.json')) {
        const machineId = file.replace('usage-', '').replace('.json', '');

        try {
          const content = fs.readFileSync(path.join(dir, file), 'utf-8');
          const data = JSON.parse(content);

          allUsage[machineId] = {
            ...data.stats,
            lastEventAt: new Date(data.stats.lastEventAt),
            firstEventAt: new Date(data.stats.firstEventAt),
          };
        } catch (error) {
          console.warn(`Error reading usage file for ${machineId}:`, error);
        }
      }
    }

    return allUsage;
  } catch (error) {
    console.error('Error getting all usage data:', error);
    return {};
  }
}

/**
 * Get usage summary
 */
export function getUsageSummary(usageDir?: string): {
  totalMachines: number;
  totalEvents: number;
  totalDuration: number;
  topFeatures: Array<{ feature: string; count: number }>;
} {
  try {
    const allUsage = getAllUsageData(usageDir);

    let totalEvents = 0;
    let totalDuration = 0;
    const featureCounts: Record<string, number> = {};

    for (const stats of Object.values(allUsage)) {
      totalEvents += stats.totalEvents;
      totalDuration += stats.totalDuration;

      for (const [feature, count] of Object.entries(stats.features)) {
        featureCounts[feature] = (featureCounts[feature] || 0) + count;
      }
    }

    const topFeatures = Object.entries(featureCounts)
      .map(([feature, count]) => ({ feature, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      totalMachines: Object.keys(allUsage).length,
      totalEvents,
      totalDuration,
      topFeatures,
    };
  } catch (error) {
    console.error('Error getting usage summary:', error);
    return {
      totalMachines: 0,
      totalEvents: 0,
      totalDuration: 0,
      topFeatures: [],
    };
  }
}
