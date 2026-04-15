import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { LicenseActivation } from '@/components/license/LicenseActivation';

global.fetch = jest.fn();

describe('LicenseActivation - Multi-PC Support', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url === '/api/license/machine-id') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            machineId: 'MACHINE-12345678-12345678-12345678-12345678'
          })
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });
  });

  test('displays multi-PC license info after successful activation', async () => {
    const mockFetch = global.fetch as jest.Mock;
    mockFetch.mockImplementation((url: string, options?: any) => {
      if (url === '/api/license/machine-id') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            machineId: 'MACHINE-12345678-12345678-12345678-12345678'
          })
        });
      }
      if (url === '/api/license/activate' && options?.method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            success: true,
            licenseType: 'multi-pc',
            maxMachines: 5,
            authorizedCount: 3
          })
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });

    render(<LicenseActivation />);

    await waitFor(() => {
      expect(screen.getByText('Next: Upload License File')).toBeInTheDocument();
    });

    // Move to upload step
    fireEvent.click(screen.getByText('Next: Upload License File'));

    // Mock file upload (simplified)
    const activateButton = screen.getByText('Activate License');
    
    // Simulate having a file selected
    await waitFor(() => {
      fireEvent.click(activateButton);
    });

    await waitFor(() => {
      expect(screen.getByText('License Activated Successfully')).toBeInTheDocument();
      expect(screen.getByText('Multi-PC License')).toBeInTheDocument();
      expect(screen.getByText('3 of 5 PCs')).toBeInTheDocument();
    });
  });

  test('shows multi-PC info banner after activation', async () => {
    const mockFetch = global.fetch as jest.Mock;
    mockFetch.mockImplementation((url: string, options?: any) => {
      if (url === '/api/license/machine-id') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            machineId: 'MACHINE-12345678-12345678-12345678-12345678'
          })
        });
      }
      if (url === '/api/license/activate' && options?.method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            success: true,
            licenseType: 'multi-pc',
            maxMachines: 10,
            authorizedCount: 5
          })
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });

    render(<LicenseActivation />);

    await waitFor(() => {
      fireEvent.click(screen.getByText('Next: Upload License File'));
    });

    fireEvent.click(screen.getByText('Activate License'));

    await waitFor(() => {
      expect(screen.getByText('Multi-PC License Active')).toBeInTheDocument();
      expect(screen.getByText(/This license can be used on 10 computers/)).toBeInTheDocument();
    });
  });

  test('does not show multi-PC info for single-PC license', async () => {
    const mockFetch = global.fetch as jest.Mock;
    mockFetch.mockImplementation((url: string, options?: any) => {
      if (url === '/api/license/machine-id') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            machineId: 'MACHINE-12345678-12345678-12345678-12345678'
          })
        });
      }
      if (url === '/api/license/activate' && options?.method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            success: true,
            licenseType: 'single-pc'
          })
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });

    render(<LicenseActivation />);

    await waitFor(() => {
      fireEvent.click(screen.getByText('Next: Upload License File'));
    });

    fireEvent.click(screen.getByText('Activate License'));

    await waitFor(() => {
      expect(screen.getByText('License Activated Successfully')).toBeInTheDocument();
      expect(screen.queryByText('Multi-PC License')).not.toBeInTheDocument();
    });
  });

  test('shows enhanced error for MACHINE_NOT_AUTHORIZED', async () => {
    const mockFetch = global.fetch as jest.Mock;
    mockFetch.mockImplementation((url: string, options?: any) => {
      if (url === '/api/license/machine-id') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            machineId: 'MACHINE-12345678-12345678-12345678-12345678'
          })
        });
      }
      if (url === '/api/license/activate' && options?.method === 'POST') {
        return Promise.resolve({
          ok: false,
          json: () => Promise.resolve({
            message: 'MACHINE_NOT_AUTHORIZED: This Machine ID is not in the authorized list'
          })
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });

    render(<LicenseActivation />);

    await waitFor(() => {
      fireEvent.click(screen.getByText('Next: Upload License File'));
    });

    fireEvent.click(screen.getByText('Activate License'));

    await waitFor(() => {
      expect(screen.getByText('Activation Failed')).toBeInTheDocument();
      expect(screen.getByText('Machine Not Authorized')).toBeInTheDocument();
      expect(screen.getByText(/For Multi-PC licenses: This Machine ID has not been added to the authorized list/)).toBeInTheDocument();
    });
  });

  test('includes multi-PC troubleshooting in error messages', async () => {
    const mockFetch = global.fetch as jest.Mock;
    mockFetch.mockImplementation((url: string, options?: any) => {
      if (url === '/api/license/machine-id') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            machineId: 'MACHINE-12345678-12345678-12345678-12345678'
          })
        });
      }
      if (url === '/api/license/activate' && options?.method === 'POST') {
        return Promise.resolve({
          ok: false,
          json: () => Promise.resolve({
            message: 'Activation failed'
          })
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });

    render(<LicenseActivation />);

    await waitFor(() => {
      fireEvent.click(screen.getByText('Next: Upload License File'));
    });

    fireEvent.click(screen.getByText('Activate License'));

    await waitFor(() => {
      expect(screen.getByText(/For Multi-PC licenses, ensure your Machine ID is in the authorized list/)).toBeInTheDocument();
    });
  });

  test('calls onActivationComplete with license info', async () => {
    const mockOnComplete = jest.fn();
    const mockFetch = global.fetch as jest.Mock;
    mockFetch.mockImplementation((url: string, options?: any) => {
      if (url === '/api/license/machine-id') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            machineId: 'MACHINE-12345678-12345678-12345678-12345678'
          })
        });
      }
      if (url === '/api/license/activate' && options?.method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            success: true,
            licenseType: 'multi-pc',
            maxMachines: 5,
            authorizedCount: 2
          })
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });

    render(<LicenseActivation onActivationComplete={mockOnComplete} />);

    await waitFor(() => {
      fireEvent.click(screen.getByText('Next: Upload License File'));
    });

    fireEvent.click(screen.getByText('Activate License'));

    await waitFor(() => {
      expect(mockOnComplete).toHaveBeenCalledWith(
        expect.objectContaining({
          licenseType: 'multi-pc',
          maxMachines: 5,
          authorizedCount: 2
        })
      );
    });
  });
});
