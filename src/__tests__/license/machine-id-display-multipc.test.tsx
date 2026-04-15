import { render, screen, fireEvent } from '@testing-library/react';
import { MachineIdDisplay } from '@/components/license/MachineIdDisplay';

describe('MachineIdDisplay - Multi-PC Support', () => {
  const mockMachineId = 'MACHINE-12345678-12345678-12345678-12345678';

  beforeEach(() => {
    Object.assign(navigator, {
      clipboard: {
        writeText: jest.fn(() => Promise.resolve()),
      },
    });
  });

  test('renders single-PC mode by default', () => {
    render(<MachineIdDisplay machineId={mockMachineId} />);

    expect(screen.getByText('Machine ID')).toBeInTheDocument();
    expect(screen.queryByText('Multi-PC License')).not.toBeInTheDocument();
  });

  test('renders multi-PC indicator when isMultiPc is true', () => {
    render(<MachineIdDisplay machineId={mockMachineId} isMultiPc={true} />);

    expect(screen.getByText('Multi-PC License')).toBeInTheDocument();
    expect(screen.getByText(/This license can be used on multiple computers/)).toBeInTheDocument();
  });

  test('shows different label for multi-PC mode', () => {
    render(<MachineIdDisplay machineId={mockMachineId} isMultiPc={true} />);

    expect(screen.getByText("This Computer's Machine ID")).toBeInTheDocument();
  });

  test('shows multi-PC instructions', () => {
    render(<MachineIdDisplay machineId={mockMachineId} isMultiPc={true} />);

    expect(screen.getByText(/Run this software on each computer/)).toBeInTheDocument();
    expect(screen.getByText(/Collect all Machine IDs in one place/)).toBeInTheDocument();
    expect(screen.getByText(/ONE .LIC file that works on all computers/)).toBeInTheDocument();
  });

  test('shows single-PC instructions when not multi-PC', () => {
    render(<MachineIdDisplay machineId={mockMachineId} isMultiPc={false} />);

    expect(screen.getByText(/Copy your Machine ID above/)).toBeInTheDocument();
    expect(screen.getByText(/Send it to your administrator/)).toBeInTheDocument();
  });

  test('exports to file with multi-PC instructions', () => {
    global.URL.createObjectURL = jest.fn(() => 'blob:mock-url');
    global.URL.revokeObjectURL = jest.fn();

    render(<MachineIdDisplay machineId={mockMachineId} isMultiPc={true} />);

    const exportButton = screen.getByText('Export to File');
    fireEvent.click(exportButton);

    expect(global.URL.createObjectURL).toHaveBeenCalled();
  });

  test('exports to file with single-PC content', () => {
    global.URL.createObjectURL = jest.fn(() => 'blob:mock-url');
    global.URL.revokeObjectURL = jest.fn();

    render(<MachineIdDisplay machineId={mockMachineId} isMultiPc={false} />);

    const exportButton = screen.getByText('Export to File');
    fireEvent.click(exportButton);

    expect(global.URL.createObjectURL).toHaveBeenCalled();
  });

  test('shows different export button description for multi-PC', () => {
    render(<MachineIdDisplay machineId={mockMachineId} isMultiPc={true} />);

    expect(screen.getByText(/Download a file with instructions for collecting Machine IDs from all computers/)).toBeInTheDocument();
  });

  test('shows different export button description for single-PC', () => {
    render(<MachineIdDisplay machineId={mockMachineId} isMultiPc={false} />);

    expect(screen.getByText(/Download your Machine ID as a text file to send to your administrator/)).toBeInTheDocument();
  });

  test('copies Machine ID to clipboard', async () => {
    const mockOnCopy = jest.fn();
    render(<MachineIdDisplay machineId={mockMachineId} onCopy={mockOnCopy} />);

    const copyButton = screen.getByText('Copy');
    fireEvent.click(copyButton);

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(mockMachineId);
    expect(mockOnCopy).toHaveBeenCalled();
  });

  test('shows copied confirmation', async () => {
    render(<MachineIdDisplay machineId={mockMachineId} />);

    const copyButton = screen.getByText('Copy');
    fireEvent.click(copyButton);

    expect(screen.getByText('✓ Copied')).toBeInTheDocument();
  });

  test('displays Machine ID correctly', () => {
    render(<MachineIdDisplay machineId={mockMachineId} />);

    expect(screen.getByText(mockMachineId)).toBeInTheDocument();
  });

  test('shows QR code section', () => {
    render(<MachineIdDisplay machineId={mockMachineId} />);

    expect(screen.getByText('QR Code')).toBeInTheDocument();
    expect(screen.getByText('Show')).toBeInTheDocument();
  });

  test('toggles QR code visibility', () => {
    render(<MachineIdDisplay machineId={mockMachineId} />);

    const showButton = screen.getByText('Show');
    fireEvent.click(showButton);

    expect(screen.getByText('Hide')).toBeInTheDocument();
    expect(screen.getByText('Download QR Code')).toBeInTheDocument();
  });
});
