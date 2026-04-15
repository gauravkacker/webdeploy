'use client';

import React from 'react';
import { LANConnectionNotification } from './LANConnectionNotification';

interface StartupWrapperProps {
  children: React.ReactNode;
}

export function StartupWrapper({ children }: StartupWrapperProps) {
  return (
    <>
      <LANConnectionNotification />
      {children}
    </>
  );
}
