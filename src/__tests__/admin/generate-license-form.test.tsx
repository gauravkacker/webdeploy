import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import GenerateLicensePage from '@/app/admin/software-delivery/generate-license/page';

// Mock fetch
global.fetch = jest.fn();

describe('Generate License Form - Multi-PC Support', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url === '/api/admin/customers') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            customers: [
              { id: 'cust1', name: 'Test Customer', email: 'test@example.com' }
            ]
          })
        });
      }
      if (url === '/api/admin/plans') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            plans: [
              { id: 'plan1', name: 'Basic Plan', validityDays: 365 }
            ]
          })
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });
  });

  test('renders license type radio buttons', async () => {
    render(<GenerateLicensePage />);
    
    await waitFor(() => {
      expect(screen.getByText('Single-PC License (1 computer)')).toBeInTheDocument();
      expect(screen.getByText('Multi-PC License (2-100 computers)')).toBeInTheDocument();
    });
  });

  test('shows single Machine ID input for single-PC license', async () => {
    render(<GenerateLicensePage />);
    
    await waitFor(() => {
      const singlePcRadio = screen.getByLabelText('Single-PC License (1 computer)');
      fireEvent.click(singlePcRadio);
    });

    expect(screen.getByPlaceholderText(/MACHINE-XXXXXXXX/)).toBeInTheDocument();
    expect(screen.queryByText('PC Limit')).not.toBeInTheDocument();
  });

  test('shows PC limit and Machine IDs textarea for multi-PC license', async () => {
    render(<GenerateLicensePage />);
    
    await waitFor(() => {
      const multiPcRadio = screen.getByLabelText('Multi-PC License (2-100 computers)');
      fireEvent.click(multiPcRadio);
    });

    expect(screen.getByText('PC Limit')).toBeInTheDocument();
    expect(screen.getByText('Initial Machine IDs (one per line)')).toBeInTheDocument();
  });

  test('validates Machine ID format in real-time for multi-PC', async () => {
    render(<GenerateLicensePage />);
    
    await waitFor(() => {
      const multiPcRadio = screen.getByLabelText('Multi-PC License (2-100 computers)');
      fireEvent.click(multiPcRadio);
    });

    const textarea = screen.getByPlaceholderText(/MACHINE-XXXXXXXX.*MACHINE-YYYYYYYY/);
    fireEvent.change(textarea, {
      target: { value: 'INVALID-ID\nMACHINE-12345678-12345678-12345678-12345678' }
    });

    await waitFor(() => {
      expect(screen.getByText(/Line 1: Invalid Machine ID format/)).toBeInTheDocument();
    });
  });

  test('shows Machine ID count for multi-PC', async () => {
    render(<GenerateLicensePage />);
    
    await waitFor(() => {
      const multiPcRadio = screen.getByLabelText('Multi-PC License (2-100 computers)');
      fireEvent.click(multiPcRadio);
    });

    const textarea = screen.getByPlaceholderText(/MACHINE-XXXXXXXX.*MACHINE-YYYYYYYY/);
    fireEvent.change(textarea, {
      target: { value: 'MACHINE-12345678-12345678-12345678-12345678\nMACHINE-87654321-87654321-87654321-87654321' }
    });

    await waitFor(() => {
      expect(screen.getByText(/2 of 2 Machine IDs entered/)).toBeInTheDocument();
    });
  });

  test('submits single-PC license correctly', async () => {
    const mockFetch = global.fetch as jest.Mock;
    mockFetch.mockImplementation((url: string, options?: any) => {
      if (url === '/api/admin/licenses' && options?.method === 'POST') {
        const body = JSON.parse(options.body);
        expect(body.licenseType).toBe('single-pc');
        expect(body.machineId).toBe('MACHINE-12345678-12345678-12345678-12345678');
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            license: {
              licenseKey: 'TEST-KEY',
              licenseType: 'single-pc',
              licFileBase64: 'base64data'
            }
          })
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ customers: [], plans: [] })
      });
    });

    render(<GenerateLicensePage />);
    
    await waitFor(() => {
      expect(screen.getByText('Generate License')).toBeInTheDocument();
    });

    // Fill form
    const customerSelect = screen.getByLabelText('Select Customer');
    fireEvent.change(customerSelect, { target: { value: 'cust1' } });

    const planSelect = screen.getByLabelText('Select Plan');
    fireEvent.change(planSelect, { target: { value: 'plan1' } });

    const machineIdInput = screen.getByPlaceholderText(/MACHINE-XXXXXXXX/);
    fireEvent.change(machineIdInput, {
      target: { value: 'MACHINE-12345678-12345678-12345678-12345678' }
    });

    const submitButton = screen.getByText('Generate License');
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/admin/licenses',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('single-pc')
        })
      );
    });
  });

  test('submits multi-PC license correctly', async () => {
    const mockFetch = global.fetch as jest.Mock;
    mockFetch.mockImplementation((url: string, options?: any) => {
      if (url === '/api/admin/licenses' && options?.method === 'POST') {
        const body = JSON.parse(options.body);
        expect(body.licenseType).toBe('multi-pc');
        expect(body.maxMachines).toBe(3);
        expect(body.initialMachineIds).toHaveLength(2);
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            license: {
              licenseKey: 'TEST-KEY',
              licenseType: 'multi-pc',
              maxMachines: 3,
              authorizedMachines: body.initialMachineIds,
              licFileBase64: 'base64data'
            }
          })
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ customers: [], plans: [] })
      });
    });

    render(<GenerateLicensePage />);
    
    await waitFor(() => {
      const multiPcRadio = screen.getByLabelText('Multi-PC License (2-100 computers)');
      fireEvent.click(multiPcRadio);
    });

    // Fill form
    const customerSelect = screen.getByLabelText('Select Customer');
    fireEvent.change(customerSelect, { target: { value: 'cust1' } });

    const planSelect = screen.getByLabelText('Select Plan');
    fireEvent.change(planSelect, { target: { value: 'plan1' } });

    const pcLimitInput = screen.getByLabelText('PC Limit');
    fireEvent.change(pcLimitInput, { target: { value: '3' } });

    const textarea = screen.getByPlaceholderText(/MACHINE-XXXXXXXX.*MACHINE-YYYYYYYY/);
    fireEvent.change(textarea, {
      target: { value: 'MACHINE-12345678-12345678-12345678-12345678\nMACHINE-87654321-87654321-87654321-87654321' }
    });

    const submitButton = screen.getByText('Generate License');
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/admin/licenses',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('multi-pc')
        })
      );
    });
  });

  test('prevents submission when Machine IDs exceed PC limit', async () => {
    window.alert = jest.fn();
    
    render(<GenerateLicensePage />);
    
    await waitFor(() => {
      const multiPcRadio = screen.getByLabelText('Multi-PC License (2-100 computers)');
      fireEvent.click(multiPcRadio);
    });

    const pcLimitInput = screen.getByLabelText('PC Limit');
    fireEvent.change(pcLimitInput, { target: { value: '2' } });

    const textarea = screen.getByPlaceholderText(/MACHINE-XXXXXXXX.*MACHINE-YYYYYYYY/);
    fireEvent.change(textarea, {
      target: { value: 'MACHINE-11111111-11111111-11111111-11111111\nMACHINE-22222222-22222222-22222222-22222222\nMACHINE-33333333-33333333-33333333-33333333' }
    });

    const submitButton = screen.getByText('Generate License');
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(window.alert).toHaveBeenCalledWith(
        expect.stringContaining('exceeds PC limit')
      );
    });
  });

  test('displays multi-PC license details after generation', async () => {
    const mockFetch = global.fetch as jest.Mock;
    mockFetch.mockImplementation((url: string, options?: any) => {
      if (url === '/api/admin/licenses' && options?.method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            license: {
              licenseKey: 'TEST-KEY-123',
              licenseType: 'multi-pc',
              maxMachines: 3,
              authorizedMachines: [
                'MACHINE-12345678-12345678-12345678-12345678',
                'MACHINE-87654321-87654321-87654321-87654321'
              ],
              licFileBase64: 'base64data',
              activatedAt: new Date().toISOString(),
              expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
              modules: ['appointments', 'billing']
            }
          })
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ customers: [], plans: [] })
      });
    });

    render(<GenerateLicensePage />);
    
    await waitFor(() => {
      const multiPcRadio = screen.getByLabelText('Multi-PC License (2-100 computers)');
      fireEvent.click(multiPcRadio);
    });

    // Fill and submit form
    const customerSelect = screen.getByLabelText('Select Customer');
    fireEvent.change(customerSelect, { target: { value: 'cust1' } });

    const planSelect = screen.getByLabelText('Select Plan');
    fireEvent.change(planSelect, { target: { value: 'plan1' } });

    const textarea = screen.getByPlaceholderText(/MACHINE-XXXXXXXX.*MACHINE-YYYYYYYY/);
    fireEvent.change(textarea, {
      target: { value: 'MACHINE-12345678-12345678-12345678-12345678\nMACHINE-87654321-87654321-87654321-87654321' }
    });

    const submitButton = screen.getByText('Generate License');
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('Multi-PC License')).toBeInTheDocument();
      expect(screen.getByText('3 computers')).toBeInTheDocument();
      expect(screen.getByText('MACHINE-12345678-12345678-12345678-12345678')).toBeInTheDocument();
      expect(screen.getByText('MACHINE-87654321-87654321-87654321-87654321')).toBeInTheDocument();
    });
  });
});
