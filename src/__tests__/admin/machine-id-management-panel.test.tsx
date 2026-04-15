import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import MachineIdManagementPanel from '@/components/admin/MachineIdManagementPanel';

global.fetch = jest.fn();

describe('MachineIdManagementPanel', () => {
  const mockMachines = [
    {
      machineId: 'MACHINE-12345678-12345678-12345678-12345678',
      addedAt: '2024-01-01T00:00:00Z',
      lastActivation: '2024-01-15T00:00:00Z',
      status: 'active' as const
    },
    {
      machineId: 'MACHINE-87654321-87654321-87654321-87654321',
      addedAt: '2024-01-02T00:00:00Z',
      status: 'inactive' as const
    }
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ machines: mockMachines })
    });
  });

  test('renders single-PC license view', async () => {
    render(
      <MachineIdManagementPanel
        licenseId="lic-123"
        licenseType="single-pc"
        maxMachines={1}
        authorizedMachines={['MACHINE-12345678-12345678-12345678-12345678']}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Machine Binding')).toBeInTheDocument();
      expect(screen.getByText('This is a Single-PC license bound to one computer.')).toBeInTheDocument();
    });
  });

  test('renders multi-PC license view with stats', async () => {
    render(
      <MachineIdManagementPanel
        licenseId="lic-123"
        licenseType="multi-pc"
        maxMachines={5}
        authorizedMachines={mockMachines.map(m => m.machineId)}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Authorized Machine IDs')).toBeInTheDocument();
      expect(screen.getByText('5')).toBeInTheDocument(); // PC Limit
      expect(screen.getByText('2')).toBeInTheDocument(); // Authorized count
      expect(screen.getByText('3')).toBeInTheDocument(); // Available slots
    });
  });

  test('displays machine table with correct data', async () => {
    render(
      <MachineIdManagementPanel
        licenseId="lic-123"
        licenseType="multi-pc"
        maxMachines={5}
        authorizedMachines={mockMachines.map(m => m.machineId)}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('MACHINE-12345678-12345678-12345678-12345678')).toBeInTheDocument();
      expect(screen.getByText('MACHINE-87654321-87654321-87654321-87654321')).toBeInTheDocument();
      expect(screen.getByText('active')).toBeInTheDocument();
      expect(screen.getByText('inactive')).toBeInTheDocument();
    });
  });

  test('disables Add button when PC limit reached', async () => {
    render(
      <MachineIdManagementPanel
        licenseId="lic-123"
        licenseType="multi-pc"
        maxMachines={2}
        authorizedMachines={mockMachines.map(m => m.machineId)}
      />
    );

    await waitFor(() => {
      const addButton = screen.getByText('Add Machine ID');
      expect(addButton).toBeDisabled();
      expect(screen.getByText('PC limit reached. Cannot add more machines.')).toBeInTheDocument();
    });
  });

  test('enables Add button when slots available', async () => {
    render(
      <MachineIdManagementPanel
        licenseId="lic-123"
        licenseType="multi-pc"
        maxMachines={5}
        authorizedMachines={mockMachines.map(m => m.machineId)}
      />
    );

    await waitFor(() => {
      const addButton = screen.getByText('Add Machine ID');
      expect(addButton).not.toBeDisabled();
    });
  });

  test('opens add machine modal', async () => {
    render(
      <MachineIdManagementPanel
        licenseId="lic-123"
        licenseType="multi-pc"
        maxMachines={5}
        authorizedMachines={mockMachines.map(m => m.machineId)}
      />
    );

    await waitFor(() => {
      const addButton = screen.getByText('Add Machine ID');
      fireEvent.click(addButton);
    });

    expect(screen.getByPlaceholderText('MACHINE-XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX')).toBeInTheDocument();
  });

  test('validates Machine ID format when adding', async () => {
    render(
      <MachineIdManagementPanel
        licenseId="lic-123"
        licenseType="multi-pc"
        maxMachines={5}
        authorizedMachines={mockMachines.map(m => m.machineId)}
      />
    );

    await waitFor(() => {
      fireEvent.click(screen.getByText('Add Machine ID'));
    });

    const input = screen.getByPlaceholderText('MACHINE-XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX');
    fireEvent.change(input, { target: { value: 'INVALID-ID' } });

    const addButton = screen.getAllByText('Add')[0];
    fireEvent.click(addButton);

    await waitFor(() => {
      expect(screen.getByText('Invalid Machine ID format')).toBeInTheDocument();
    });
  });

  test('successfully adds machine and downloads LIC file', async () => {
    const mockFetch = global.fetch as jest.Mock;
    mockFetch.mockImplementation((url: string, options?: any) => {
      if (url.includes('/machines') && options?.method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            success: true,
            licFileBase64: 'base64data'
          })
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ machines: mockMachines })
      });
    });

    // Mock URL.createObjectURL
    global.URL.createObjectURL = jest.fn(() => 'blob:mock-url');
    global.URL.revokeObjectURL = jest.fn();

    render(
      <MachineIdManagementPanel
        licenseId="lic-123"
        licenseType="multi-pc"
        maxMachines={5}
        authorizedMachines={mockMachines.map(m => m.machineId)}
      />
    );

    await waitFor(() => {
      fireEvent.click(screen.getByText('Add Machine ID'));
    });

    const input = screen.getByPlaceholderText('MACHINE-XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX');
    fireEvent.change(input, { target: { value: 'MACHINE-AAAAAAAA-AAAAAAAA-AAAAAAAA-AAAAAAAA' } });

    const addButton = screen.getAllByText('Add')[0];
    fireEvent.click(addButton);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/admin/licenses/lic-123/machines',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('MACHINE-AAAAAAAA-AAAAAAAA-AAAAAAAA-AAAAAAAA')
        })
      );
    });
  });

  test('disables Remove button when only one machine remains', async () => {
    const singleMachine = [mockMachines[0]];
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ machines: singleMachine })
    });

    render(
      <MachineIdManagementPanel
        licenseId="lic-123"
        licenseType="multi-pc"
        maxMachines={5}
        authorizedMachines={[singleMachine[0].machineId]}
      />
    );

    await waitFor(() => {
      const removeButtons = screen.getAllByText('Remove');
      removeButtons.forEach(button => {
        expect(button).toHaveClass('cursor-not-allowed');
      });
    });
  });

  test('opens remove machine modal', async () => {
    render(
      <MachineIdManagementPanel
        licenseId="lic-123"
        licenseType="multi-pc"
        maxMachines={5}
        authorizedMachines={mockMachines.map(m => m.machineId)}
      />
    );

    await waitFor(() => {
      const removeButtons = screen.getAllByText('Remove');
      fireEvent.click(removeButtons[0]);
    });

    expect(screen.getByText('Are you sure you want to remove this Machine ID?')).toBeInTheDocument();
    expect(screen.getByText('This computer will no longer be able to use this license.')).toBeInTheDocument();
  });

  test('successfully removes machine', async () => {
    const mockFetch = global.fetch as jest.Mock;
    mockFetch.mockImplementation((url: string, options?: any) => {
      if (url.includes('/machines') && options?.method === 'DELETE') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            success: true,
            licFileBase64: 'base64data'
          })
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ machines: mockMachines })
      });
    });

    render(
      <MachineIdManagementPanel
        licenseId="lic-123"
        licenseType="multi-pc"
        maxMachines={5}
        authorizedMachines={mockMachines.map(m => m.machineId)}
      />
    );

    await waitFor(() => {
      const removeButtons = screen.getAllByText('Remove');
      fireEvent.click(removeButtons[0]);
    });

    const confirmButton = screen.getAllByText('Remove')[1];
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/admin/licenses/lic-123/machines',
        expect.objectContaining({
          method: 'DELETE'
        })
      );
    });
  });

  test('downloads LIC file when button clicked', async () => {
    const mockFetch = global.fetch as jest.Mock;
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/api/admin/licenses/lic-123')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            license: { licFileBase64: 'base64data' }
          })
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ machines: mockMachines })
      });
    });

    global.URL.createObjectURL = jest.fn(() => 'blob:mock-url');
    global.URL.revokeObjectURL = jest.fn();

    render(
      <MachineIdManagementPanel
        licenseId="lic-123"
        licenseType="multi-pc"
        maxMachines={5}
        authorizedMachines={mockMachines.map(m => m.machineId)}
      />
    );

    await waitFor(() => {
      const downloadButton = screen.getByText('Download .LIC File');
      fireEvent.click(downloadButton);
    });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/admin/licenses/lic-123');
    });
  });

  test('calls onUpdate callback after successful add', async () => {
    const mockOnUpdate = jest.fn();
    const mockFetch = global.fetch as jest.Mock;
    mockFetch.mockImplementation((url: string, options?: any) => {
      if (url.includes('/machines') && options?.method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true, licFileBase64: 'base64data' })
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ machines: mockMachines })
      });
    });

    render(
      <MachineIdManagementPanel
        licenseId="lic-123"
        licenseType="multi-pc"
        maxMachines={5}
        authorizedMachines={mockMachines.map(m => m.machineId)}
        onUpdate={mockOnUpdate}
      />
    );

    await waitFor(() => {
      fireEvent.click(screen.getByText('Add Machine ID'));
    });

    const input = screen.getByPlaceholderText('MACHINE-XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX');
    fireEvent.change(input, { target: { value: 'MACHINE-AAAAAAAA-AAAAAAAA-AAAAAAAA-AAAAAAAA' } });

    const addButton = screen.getAllByText('Add')[0];
    fireEvent.click(addButton);

    await waitFor(() => {
      expect(mockOnUpdate).toHaveBeenCalled();
    });
  });
});
