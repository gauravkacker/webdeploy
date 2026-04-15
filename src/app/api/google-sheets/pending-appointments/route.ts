import { NextRequest, NextResponse } from 'next/server';

// Helper to get pending appointments from localStorage (dual-mode compatible)
function getPendingAppointmentsFromStorage(): any[] {
  try {
    if (typeof window === 'undefined') {
      // Server-side: use a simple in-memory store (will be reset on server restart)
      // For production, this should use a proper database
      return [];
    }
    const stored = localStorage.getItem('googleSheetPendingAppointments');
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

// Helper to save pending appointments to localStorage
function savePendingAppointmentsToStorage(appointments: any[]) {
  try {
    if (typeof window !== 'undefined') {
      localStorage.setItem('googleSheetPendingAppointments', JSON.stringify(appointments));
    }
  } catch (error) {
    console.error('[Google Sheets Pending API] Error saving to storage:', error);
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const all = searchParams.get('all') === 'true';

    // Get pending appointments from storage
    const appointments = getPendingAppointmentsFromStorage();
    const filtered = all ? appointments : appointments.filter(apt => !apt.processed);

    return NextResponse.json({
      success: true,
      pending: filtered,
    });
  } catch (error) {
    console.error('[Google Sheets Pending API] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch pending appointments' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, processed, rejected, rejectReason } = body;

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Missing appointment ID' },
        { status: 400 }
      );
    }

    const appointments = getPendingAppointmentsFromStorage();
    const appointmentIndex = appointments.findIndex(apt => apt.id === id);

    if (appointmentIndex === -1) {
      return NextResponse.json(
        { success: false, error: 'Appointment not found' },
        { status: 404 }
      );
    }

    // Update appointment status
    if (processed !== undefined) {
      appointments[appointmentIndex].processed = processed;
    }
    if (rejected !== undefined) {
      appointments[appointmentIndex].rejected = rejected;
    }
    if (rejectReason !== undefined) {
      appointments[appointmentIndex].rejectReason = rejectReason;
    }

    savePendingAppointmentsToStorage(appointments);

    return NextResponse.json({
      success: true,
      appointment: appointments[appointmentIndex],
    });
  } catch (error) {
    console.error('[Google Sheets Pending API] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update appointment' },
      { status: 500 }
    );
  }
}
