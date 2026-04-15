/**
 * Machine ID Generator
 * Generates a unique, stable Machine ID based on hardware and OS characteristics
 * Used for binding licenses to specific machines
 */

import crypto from 'crypto';
import os from 'os';

export interface MachineIDComponents {
  cpuSignature: string;
  diskSerial: string;
  osHash: string;
}

export interface MachineIDResult {
  machineId: string;
  components: MachineIDComponents;
  timestamp: Date;
}

/**
 * Get CPU signature from system
 * Combines processor model, core count, and frequency
 */
function getCpuSignature(): string {
  try {
    const cpus = os.cpus();
    if (cpus.length === 0) {
      return 'unknown-cpu';
    }

    const firstCpu = cpus[0];
    const model = firstCpu.model || 'unknown';
    const cores = cpus.length;
    const speed = firstCpu.speed || 0;

    // Create signature from CPU info
    const signature = `${model}-${cores}cores-${speed}mhz`;
    return signature.toLowerCase().replace(/\s+/g, '-');
  } catch (error) {
    console.error('Error getting CPU signature:', error);
    return 'cpu-error';
  }
}

/**
 * Get disk serial number
 * Attempts to retrieve primary storage device serial
 * Falls back to MAC address if disk serial unavailable
 */
function getDiskSerial(): string {
  try {
    // On Windows, try to get disk serial via WMI
    if (process.platform === 'win32') {
      try {
        const { execSync } = require('child_process');
        const output = execSync(
          'wmic logicaldisk get serialnumber',
          { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
        );
        const lines = output.split('\n').filter((line: string) => line.trim());
        if (lines.length > 1) {
          const serial = lines[1].trim();
          if (serial && serial !== 'SerialNumber') {
            console.log('[Machine ID] Got disk serial from WMI:', serial);
            return serial;
          }
        }
      } catch (e) {
        console.warn('[Machine ID] WMI disk serial failed, falling back to MAC:', (e as Error).message);
      }
    }

    // On macOS, try to get disk serial
    if (process.platform === 'darwin') {
      try {
        const { execSync } = require('child_process');
        const output = execSync(
          "system_profiler SPStorageDataType | grep 'Serial Number' | head -1",
          { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
        );
        const match = output.match(/Serial Number: (.+)/);
        if (match && match[1]) {
          console.log('[Machine ID] Got disk serial from system_profiler:', match[1].trim());
          return match[1].trim();
        }
      } catch (e) {
        console.warn('[Machine ID] system_profiler failed, falling back to MAC:', (e as Error).message);
      }
    }

    // On Linux, try to get disk serial
    if (process.platform === 'linux') {
      try {
        const { execSync } = require('child_process');
        const output = execSync(
          "lsblk -d -o NAME,SERIAL | grep -v NAME | head -1",
          { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
        );
        const parts = output.trim().split(/\s+/);
        if (parts.length > 1) {
          console.log('[Machine ID] Got disk serial from lsblk:', parts[1]);
          return parts[1];
        }
      } catch (e) {
        console.warn('[Machine ID] lsblk failed, falling back to MAC:', (e as Error).message);
      }
    }

    // Fallback: use MAC address of first network interface
    console.log('[Machine ID] Using MAC address as fallback');
    const networkInterfaces = os.networkInterfaces();
    for (const [name, addrs] of Object.entries(networkInterfaces)) {
      if (addrs && addrs.length > 0) {
        const macAddr = addrs[0].mac;
        if (macAddr && macAddr !== '00:00:00:00:00:00') {
          const formatted = macAddr.replace(/:/g, '-');
          console.log('[Machine ID] Got MAC address:', formatted);
          return formatted;
        }
      }
    }

    console.warn('[Machine ID] No MAC address found, using fallback');
    return 'disk-unknown';
  } catch (error) {
    console.error('[Machine ID] Error getting disk serial:', error);
    return 'disk-error';
  }
}

/**
 * Get OS hash
 * Combines OS type, version, and installation date
 */
function getOsHash(): string {
  try {
    const platform = process.platform;
    const release = os.release();
    const arch = os.arch();

    // Try to get Windows installation date
    let installDate = '';
    if (platform === 'win32') {
      try {
        const { execSync } = require('child_process');
        const output = execSync(
          'wmic os get installdate',
          { encoding: 'utf-8' }
        );
        const lines = output.split('\n').filter((line: string) => line.trim());
        if (lines.length > 1) {
          installDate = lines[1].trim().substring(0, 8); // YYYYMMDD
        }
      } catch (e) {
        // Use current date as fallback
        installDate = new Date().toISOString().split('T')[0].replace(/-/g, '');
      }
    } else {
      // For macOS and Linux, use current date
      installDate = new Date().toISOString().split('T')[0].replace(/-/g, '');
    }

    const osSignature = `${platform}-${release}-${arch}-${installDate}`;
    return osSignature.toLowerCase().replace(/\s+/g, '-');
  } catch (error) {
    console.error('Error getting OS hash:', error);
    return 'os-error';
  }
}

/**
 * Generate Machine ID components
 */
function generateComponents(): MachineIDComponents {
  return {
    cpuSignature: getCpuSignature(),
    diskSerial: getDiskSerial(),
    osHash: getOsHash(),
  };
}

/**
 * Hash components into a stable Machine ID
 * Uses SHA256 to create a consistent, non-reversible identifier
 */
function hashComponents(components: MachineIDComponents): string {
  const combined = `${components.cpuSignature}|${components.diskSerial}|${components.osHash}`;
  const hash = crypto.createHash('sha256').update(combined).digest('hex');
  
  // Format as readable ID: MACHINE-XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX
  const formatted = `MACHINE-${hash.substring(0, 8)}-${hash.substring(8, 16)}-${hash.substring(16, 24)}-${hash.substring(24, 32)}`;
  return formatted.toUpperCase();
}

/**
 * Generate a unique, stable Machine ID
 * Returns the Machine ID and its components for verification
 */
export function generateMachineId(): MachineIDResult {
  const components = generateComponents();
  const machineId = hashComponents(components);

  return {
    machineId,
    components,
    timestamp: new Date(),
  };
}

/**
 * Verify Machine ID consistency
 * Regenerates Machine ID and compares with provided ID
 * Returns true if they match (machine hasn't changed)
 */
export function verifyMachineId(previousMachineId: string): boolean {
  try {
    const current = generateMachineId();
    return current.machineId === previousMachineId;
  } catch (error) {
    console.error('Error verifying Machine ID:', error);
    return false;
  }
}

/**
 * Detect if OS has been reinstalled
 * Compares OS hash with previous OS hash
 * Returns true if OS hash has changed
 */
export function detectOsReinstall(previousOsHash: string): boolean {
  try {
    const current = generateComponents();
    return current.osHash !== previousOsHash;
  } catch (error) {
    console.error('Error detecting OS reinstall:', error);
    return false;
  }
}

/**
 * Get Machine ID hash for reuse detection
 * Creates a hash of the Machine ID for secure comparison
 */
export function getMachineIdHash(machineId: string): string {
  return crypto.createHash('sha256').update(machineId).digest('hex');
}

/**
 * Verify Machine ID hash
 * Compares provided hash with generated hash
 */
export function verifyMachineIdHash(machineId: string, hash: string): boolean {
  const generated = getMachineIdHash(machineId);
  return generated === hash;
}
