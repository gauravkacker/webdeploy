import { NextRequest, NextResponse } from 'next/server';

/**
 * API endpoint to append data to Google Sheets
 * This handles the actual Google Sheets API calls from the backend
 */

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { spreadsheetId, values, range = 'Sheet1!A:G' } = body;

    if (!spreadsheetId || !values || !Array.isArray(values)) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: spreadsheetId, values' },
        { status: 400 }
      );
    }

    // Get Google Sheets API credentials from environment
    const apiKey = process.env.GOOGLE_SHEETS_API_KEY;
    const serviceAccountEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const serviceAccountKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;

    // If using API key (public sheets)
    if (apiKey) {
      return await appendViaPublicAPI(spreadsheetId, values, range, apiKey);
    }

    // If using service account (private sheets)
    if (serviceAccountEmail && serviceAccountKey) {
      return await appendViaServiceAccount(spreadsheetId, values, range, serviceAccountEmail, serviceAccountKey);
    }

    // Fallback: Try to append via public CSV method
    return await appendViaCSVMethod(spreadsheetId, values);

  } catch (error) {
    console.error('[Google Sheets API] Error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

/**
 * Append via Google Sheets API with API key (public sheets)
 */
async function appendViaPublicAPI(
  spreadsheetId: string,
  values: string[],
  range: string,
  apiKey: string
): Promise<NextResponse> {
  try {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}:append?key=${apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        values: [values],
        majorDimension: 'ROWS',
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Google Sheets API error: ${response.status} - ${error}`);
    }

    const data = await response.json();

    return NextResponse.json({
      success: true,
      message: 'Row appended to Google Sheet successfully',
      data,
    });
  } catch (error) {
    throw error;
  }
}

/**
 * Append via Google Sheets API with service account
 */
async function appendViaServiceAccount(
  spreadsheetId: string,
  values: string[],
  range: string,
  serviceAccountEmail: string,
  serviceAccountKeyStr: string
): Promise<NextResponse> {
  try {
    // Parse service account key
    const serviceAccountKey = JSON.parse(serviceAccountKeyStr);

    // Get access token
    const token = await getServiceAccountToken(serviceAccountKey);

    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}:append?valueInputOption=USER_ENTERED`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        values: [values],
        majorDimension: 'ROWS',
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Google Sheets API error: ${response.status} - ${error}`);
    }

    const data = await response.json();

    return NextResponse.json({
      success: true,
      message: 'Row appended to Google Sheet successfully',
      data,
    });
  } catch (error) {
    throw error;
  }
}

/**
 * Get service account access token
 */
async function getServiceAccountToken(serviceAccountKey: any): Promise<string> {
  try {
    const now = Math.floor(Date.now() / 1000);
    const expiresIn = 3600;

    const header = {
      alg: 'RS256',
      typ: 'JWT',
    };

    const payload = {
      iss: serviceAccountKey.client_email,
      scope: 'https://www.googleapis.com/auth/spreadsheets',
      aud: 'https://oauth2.googleapis.com/token',
      exp: now + expiresIn,
      iat: now,
    };

    // Create JWT (simplified - in production use a proper JWT library)
    const headerEncoded = Buffer.from(JSON.stringify(header)).toString('base64url');
    const payloadEncoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signatureInput = `${headerEncoded}.${payloadEncoded}`;

    // Sign with private key (requires crypto module)
    const crypto = require('crypto');
    const sign = crypto.createSign('RSA-SHA256');
    sign.update(signatureInput);
    const signature = sign.sign(serviceAccountKey.private_key, 'base64url');

    const jwt = `${signatureInput}.${signature}`;

    // Exchange JWT for access token
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwt,
      }).toString(),
    });

    if (!tokenResponse.ok) {
      throw new Error('Failed to get access token');
    }

    const tokenData = await tokenResponse.json();
    return tokenData.access_token;
  } catch (error) {
    throw new Error(`Failed to get service account token: ${error}`);
  }
}

/**
 * Fallback: Append via CSV export URL (limited functionality)
 */
async function appendViaCSVMethod(
  spreadsheetId: string,
  values: string[]
): Promise<NextResponse> {
  try {
    // This is a fallback that won't actually work for appending
    // but provides a helpful error message
    return NextResponse.json(
      {
        success: false,
        error: 'Google Sheets API credentials not configured. Please set GOOGLE_SHEETS_API_KEY or service account credentials in environment variables.',
        hint: 'To enable automatic Google Sheets appending, configure one of: 1) GOOGLE_SHEETS_API_KEY (for public sheets), or 2) GOOGLE_SERVICE_ACCOUNT_EMAIL + GOOGLE_SERVICE_ACCOUNT_KEY (for private sheets)',
      },
      { status: 400 }
    );
  } catch (error) {
    throw error;
  }
}
