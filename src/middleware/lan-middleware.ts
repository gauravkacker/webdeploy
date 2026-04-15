/**
 * LAN Middleware
 * Handles LAN server detection and routing
 */

import { NextRequest, NextResponse } from 'next/server';
import { getLANServer } from '@/lib/lan-server';

export function lanMiddleware(request: NextRequest) {
  const lanServer = getLANServer();
  
  if (!lanServer) {
    return NextResponse.next();
  }

  // Add LAN server info to response headers
  const response = NextResponse.next();
  
  const mainServer = lanServer.getMainServer();
  if (mainServer) {
    response.headers.set('X-Main-Server', mainServer.ip);
    response.headers.set('X-Main-Server-Port', mainServer.port.toString());
    response.headers.set('X-Is-Main', lanServer.isMain() ? 'true' : 'false');
  }

  return response;
}
