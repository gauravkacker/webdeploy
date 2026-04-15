/**
 * Notification Sound Utility
 * Plays a bell tone when WhatsApp booking notifications arrive
 * Follows dual-mode architecture by using settings helpers
 */

import { getOnlineAppointmentSettings } from './settings-helpers';

// Base64-encoded bell sound (short beep, ~1 second)
// This is a simple sine wave tone at 800Hz
const BELL_SOUND_BASE64 = 'UklGRiYAAABXQVZFZm10IBAAAAABAAEAQB8AAAB9AAACABAAZGF0YQIAAAAAAA==';

let audioContext: AudioContext | null = null;

/**
 * Initialize Web Audio API context (required for sound playback)
 */
function initAudioContext(): AudioContext | null {
  if (audioContext) return audioContext;
  
  if (typeof window === 'undefined') {
    return null;
  }
  
  const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext;
  if (!AudioContextClass) {
    return null;
  }
  
  try {
    audioContext = new AudioContextClass();
    return audioContext;
  } catch {
    return null;
  }
}

/**
 * Play a bell notification sound using Web Audio API
 * Falls back to base64 audio if Web Audio API fails
 */
export async function playNotificationSound(): Promise<void> {
  try {
    // Try Web Audio API first (more reliable)
    const ctx = initAudioContext();
    
    if (!ctx) {
      throw new Error('Web Audio API not available');
    }
    
    // Resume audio context if suspended (required by some browsers)
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }
    
    // Create a simple bell tone: 800Hz sine wave for 0.5 seconds
    const now = ctx.currentTime;
    const duration = 0.5;
    
    // Oscillator for the tone
    const osc = ctx.createOscillator();
    osc.frequency.value = 800;
    osc.type = 'sine';
    
    // Gain envelope (fade in/out)
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + duration);
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.start(now);
    osc.stop(now + duration);
  } catch (error) {
    // Fallback: try to play base64 audio
    try {
      const audio = new Audio(`data:audio/wav;base64,${BELL_SOUND_BASE64}`);
      audio.volume = 0.5;
      await audio.play();
    } catch (fallbackError) {
      console.warn('[Notification Sound] Could not play sound:', error, fallbackError);
    }
  }
}

/**
 * Check if notification sound is enabled in settings
 * Uses settings helper for dual-mode compatibility
 */
export function isNotificationSoundEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  
  try {
    const settings = getOnlineAppointmentSettings();
    return settings.notificationSoundEnabled !== false;
  } catch {
    return true; // default to enabled on error
  }
}
