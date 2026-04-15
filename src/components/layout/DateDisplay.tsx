// ============================================
// Layout Components - DateDisplay
// Displays current date in compact format with responsive behavior
// ============================================

'use client';

import React from 'react';

interface DateDisplayProps {
  currentTime: Date;
}

export function DateDisplay({ currentTime }: DateDisplayProps) {
  const formattedDate = currentTime.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <span className="text-xs text-gray-600 font-mono w-40">
      {formattedDate}
    </span>
  );
}

