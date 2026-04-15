// ============================================
// Layout Components - TimeTicker
// Displays current time in 12-hour format with AM/PM
// ============================================

'use client';

import React from 'react';

interface TimeTickerProps {
  currentTime: Date;
}

export function TimeTicker({ currentTime }: TimeTickerProps) {
  const formattedTime = currentTime.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });

  return (
    <span className="text-xs font-medium text-gray-900 font-mono w-20">
      {formattedTime}
    </span>
  );
}
