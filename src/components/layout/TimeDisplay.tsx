// ============================================
// Layout Components - TimeDisplay
// Container component that manages time updates and renders TimeTicker and DateDisplay
// ============================================

'use client';

import React, { useState, useEffect } from 'react';
import { TimeTicker } from './TimeTicker';
import { DateDisplay } from './DateDisplay';

export function TimeDisplay() {
  const [currentTime, setCurrentTime] = useState<Date>(new Date());
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    
    // Create interval that updates time every second
    const intervalId = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    // Cleanup function to clear interval on unmount
    return () => {
      clearInterval(intervalId);
    };
  }, [setMounted]);

  // Prevent hydration mismatch by not rendering until mounted
  if (!mounted) {
    return (
      <div className="flex items-center gap-1 px-2 py-1 bg-gray-100 rounded-full border border-gray-300 whitespace-nowrap">
        <span className="text-sm font-medium text-gray-900 font-mono w-20">--:--:-- --</span>
        <span className="text-gray-400 text-xs">•</span>
        <span className="text-sm text-gray-500 font-mono w-40">---, --- --, ----</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1 px-2 py-1 bg-gray-100 rounded-full border border-gray-300 whitespace-nowrap">
      <TimeTicker currentTime={currentTime} />
      <span className="text-gray-400 text-xs">•</span>
      <DateDisplay currentTime={currentTime} />
    </div>
  );
}
