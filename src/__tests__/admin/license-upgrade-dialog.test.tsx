import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import LicenseUpgradeDialog from '@/components/admin/LicenseUpgradeDialog';

global.fetch = jest.fn();

describe('LicenseUpgradeDialog', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('does not render when isOpen is false', () => {
    const { container } = render(
      <LicenseUpgradeDialog
        licenseId="lic-123"
        currentMachineId="MACHINE-12345678-12345678-12345678-12345678"
        isOpen={false}
        onClose={() => {}}
      />
    );

    expect(container.firstChild).toBeNull();
  });

  test('renders upgrade dialog when isOpen is true', () => {
    render(
      <LicenseUpgradeDialog
        licenseId="lic-123"
        currentMachineId="MACHINE-12345678-12345678-12345678-12345678"
        isOpen={true}
        onClose={() => {}}
      />
    );

    expect(screen.getByText('Upgrade to Multi-PC License')).toBeInTheDocument();
    expect(screen.getByText('Type: Single-PC License')).toBeInTheDocument();
    expect(screen.getByText('MACHINE-12345678-12345678-12345678-12345678')).toBeInTheDocument();
  });

  test('displays warning about preserving Machine ID', () => {
    render(
      <LicenseUpgradeDialog
        licenseId="lic-123"
        currentMachineId="MACHINE-12345678-12345678-12345678-12345678"
        isOpen={true}
        onClose={() => {}}
      />
    );

    expect(screen.getByText('⚠️ Important')).toBeInTheDocument();
    expect(screen.getByText('Your existing Machine ID will be preserved')).toBeInTheDocument();
    expect(screen.getByText('This action cannot be undone')).toBeInTheDocument();
  });

  test('allows setting PC limit with minimum of 2', () => {
    render(
      <LicenseUpgradeDialog
        licenseId="lic-123"
        currentMachineId="MACHINE-12345678-12345678-12345678-12345678"
        isOpen={true}
        onClose={() => {}}
      />
    );

    const input = screen.getByLabelText('New PC Limit');
    expect(input).toHaveAttribute('min', '2');
    expect(input).toHaveAttribute('max', '100');
    expect(input).toHaveValue(2);

    fireEvent.change(input, { target: { value: '5' } });
    expect(input).toHaveValue(5);
  });

  test('validates minimum PC limit', async () => {
    render(
      <LicenseUpgradeDialog
        licenseId="lic-123"
        currentMachineId="MACHINE-12345678-12345678-12345678-12345678"
        isOpen={true}
        onClose={() => {}}
      />
    );

    const input = screen.getByLabelText('New PC Limit');
    fireEvent.change(input, { target: { value: '1' } });

    const upgradeButton = screen.getByText('Upgrade License');
    fireEvent.click(upgradeButton);

    await waitFor(() => {
      expect(screen.getByText('PC limit must be at least 2 for multi-PC licenses')).toBeInTheDocument();
    });
  });

  test('successfully upgrades license', async () => {
    const mockFetch = global.fetch as jest.Mock;
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        success: true,
        licFileBase64: 'base64data'
      })
    });

    render(
      <LicenseUpgradeDialog
        licenseId="lic-123"
        currentMachineId="MACHINE-12345678-12345678-12345678-12345678"
        isOpen={true}
        onClose={() => {}}
      />
    );

    const input = screen.getByLabelText('New PC Limit');
    fireEvent.change(input, { target: { value: '5' } });

    const upgradeButton = screen.getByText('Upgrade License');
    fireEvent.click(upgradeButton);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/admin/licenses/lic-123/upgrade',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ newMaxMachines: 5 })
        })
      );
    });

    await waitFor(() => {
      expect(screen.getByText('License Upgraded Successfully!')).toBeInTheDocument();
    });
  });

  test('displays success screen with next steps', async () => {
    const mockFetch = global.fetch as jest.Mock;
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        success: true,
        licFileBase64: 'base64data'
      })
    });

    render(
      <LicenseUpgradeDialog
        licenseId="lic-123"
        currentMachineId="MACHINE-12345678-12345678-12345678-12345678"
        isOpen={true}
        onClose={() => {}}
      />
    );

    const input = screen.getByLabelText('New PC Limit');
    fireEvent.change(input, { target: { value: '3' } });

    const upgradeButton = screen.getByText('Upgrade License');
    fireEvent.click(upgradeButton);

    await waitFor(() => {
      expect(screen.getByText(/Your license has been upgraded to a Multi-PC license with a limit of 3 computers/)).toBeInTheDocument();
      expect(screen.getByText('Next Steps')).toBeInTheDocument();
      expect(screen.getByText('Download New .LIC File')).toBeInTheDocument();
    });
  });

  test('downloads LIC file after successful upgrade', async () => {
    const mockFetch = global.fetch as jest.Mock;
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        success: true,
        licFileBase64: 'base64data'
      })
    });

    global.URL.createObjectURL = jest.fn(() => 'blob:mock-url');
    global.URL.revokeObjectURL = jest.fn();

    render(
      <LicenseUpgradeDialog
        licenseId="lic-123"
        currentMachineId="MACHINE-12345678-12345678-12345678-12345678"
        isOpen={true}
        onClose={() => {}}
      />
    );

    const upgradeButton = screen.getByText('Upgrade License');
    fireEvent.click(upgradeButton);

    await waitFor(() => {
      expect(screen.getByText('Download New .LIC File')).toBeInTheDocument();
    });

    const downloadButton = screen.getByText('Download New .LIC File');
    fireEvent.click(downloadButton);

    expect(global.URL.createObjectURL).toHaveBeenCalled();
  });

  test('calls onSuccess callback after upgrade', async () => {
    const mockOnSuccess = jest.fn();
    const mockFetch = global.fetch as jest.Mock;
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        success: true,
        licFileBase64: 'base64data'
      })
    });

    render(
      <LicenseUpgradeDialog
        licenseId="lic-123"
        currentMachineId="MACHINE-12345678-12345678-12345678-12345678"
        isOpen={true}
        onClose={() => {}}
        onSuccess={mockOnSuccess}
      />
    );

    const upgradeButton = screen.getByText('Upgrade License');
    fireEvent.click(upgradeButton);

    await waitFor(() => {
      expect(mockOnSuccess).toHaveBeenCalledWith('base64data');
    });
  });

  test('handles upgrade error', async () => {
    const mockFetch = global.fetch as jest.Mock;
    mockFetch.mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({
        error: 'Upgrade failed'
      })
    });

    render(
      <LicenseUpgradeDialog
        licenseId="lic-123"
        currentMachineId="MACHINE-12345678-12345678-12345678-12345678"
        isOpen={true}
        onClose={() => {}}
      />
    );

    const upgradeButton = screen.getByText('Upgrade License');
    fireEvent.click(upgradeButton);

    await waitFor(() => {
      expect(screen.getByText('Upgrade failed')).toBeInTheDocument();
    });
  });

  test('calls onClose when Cancel is clicked', () => {
    const mockOnClose = jest.fn();

    render(
      <LicenseUpgradeDialog
        licenseId="lic-123"
        currentMachineId="MACHINE-12345678-12345678-12345678-12345678"
        isOpen={true}
        onClose={mockOnClose}
      />
    );

    const cancelButton = screen.getByText('Cancel');
    fireEvent.click(cancelButton);

    expect(mockOnClose).toHaveBeenCalled();
  });

  test('resets state when closed', async () => {
    const mockOnClose = jest.fn();
    const mockFetch = global.fetch as jest.Mock;
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        success: true,
        licFileBase64: 'base64data'
      })
    });

    const { rerender } = render(
      <LicenseUpgradeDialog
        licenseId="lic-123"
        currentMachineId="MACHINE-12345678-12345678-12345678-12345678"
        isOpen={true}
        onClose={mockOnClose}
      />
    );

    const upgradeButton = screen.getByText('Upgrade License');
    fireEvent.click(upgradeButton);

    await waitFor(() => {
      expect(screen.getByText('License Upgraded Successfully!')).toBeInTheDocument();
    });

    const closeButton = screen.getByText('Close');
    fireEvent.click(closeButton);

    expect(mockOnClose).toHaveBeenCalled();

    // Reopen dialog
    rerender(
      <LicenseUpgradeDialog
        licenseId="lic-123"
        currentMachineId="MACHINE-12345678-12345678-12345678-12345678"
        isOpen={true}
        onClose={mockOnClose}
      />
    );

    // Should show initial state again
    expect(screen.getByText('Upgrade to Multi-PC License')).toBeInTheDocument();
  });
});
