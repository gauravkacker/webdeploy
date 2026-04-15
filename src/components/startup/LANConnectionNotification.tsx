'use client';

import React from 'react';
import { useLANStatus } from '@/lib/lan-status-context';

export function LANConnectionNotification() {
  // LAN status context is used internally but notification display is disabled
  useLANStatus();
  
  // Return nothing - notification display removed
  return null;
}
