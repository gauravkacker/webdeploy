/**
 * Thermal Printer Utility
 * Formats bills and receipts for thermal printers with support for different paper widths
 */

interface InvoiceSettings {
  feeInvoicePrefix: string;
  feeInvoiceStartNumber: number;
  billInvoicePrefix: string;
  billInvoiceStartNumber: number;
  thermalPrinterWidth: number;
  autocut: boolean;
  autocut_lines: number;
}

interface BillPrintSettings {
  // Bill Settings
  billShowPatientName: boolean;
  billShowRegistrationNumber: boolean;
  billShowMobileNumber: boolean;
  billShowInvoiceNumber: boolean;
  billShowDate: boolean;
  billShowItems: boolean;
  billShowSubtotal: boolean;
  billShowDiscount: boolean;
  billShowTax: boolean;
  billShowTotal: boolean;
  billShowPaymentStatus: boolean;
  billShowPaymentMethod: boolean;
  billShowNotes: boolean;
  billHeaderText: string;
  billFooterText: string;
  
  // Fee Receipt Settings
  feeShowPatientName: boolean;
  feeShowRegistrationNumber: boolean;
  feeShowMobileNumber: boolean;
  feeShowInvoiceNumber: boolean;
  feeShowDate: boolean;
  feeShowAmount: boolean;
  feeShowPaymentStatus: boolean;
  feeShowPaymentMethod: boolean;
  feeHeaderText: string;
  feeFooterText: string;
}

interface BillData {
  invoiceNumber: string;
  patientName: string;
  registrationNumber: string;
  mobileNumber: string;
  items: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    total: number;
  }>;
  subtotal: number;
  discountPercent?: number;
  discountAmount?: number;
  taxAmount?: number;
  netAmount: number;
  paymentStatus: 'paid' | 'partial' | 'pending' | 'exempt';
  amountPaid?: number;
  amountDue?: number;
  paymentMethod?: string;
  notes?: string;
}

export class ThermalPrinter {
  private width: number;
  private autocut: boolean;
  private autocutLines: number;
  private billPrintSettings: BillPrintSettings;

  constructor(settings: InvoiceSettings, billPrintSettings?: BillPrintSettings) {
    this.width = settings.thermalPrinterWidth;
    this.autocut = settings.autocut;
    this.autocutLines = settings.autocut_lines;
    this.billPrintSettings = billPrintSettings || getDefaultBillPrintSettings();
  }

  /**
   * Get character width based on paper width
   */
  private getCharWidth(): number {
    // Approximate characters per line based on paper width
    // 58mm ≈ 32 chars, 80mm ≈ 48 chars, 100mm ≈ 60 chars
    const charWidths: { [key: number]: number } = {
      58: 32,
      80: 48,
      100: 60,
    };
    return charWidths[this.width] || 48;
  }

  /**
   * Center text for thermal printer
   */
  private centerText(text: string): string {
    const charWidth = this.getCharWidth();
    const padding = Math.max(0, Math.floor((charWidth - text.length) / 2));
    return ' '.repeat(padding) + text;
  }

  /**
   * Right align text
   */
  private rightAlign(text: string): string {
    const charWidth = this.getCharWidth();
    const padding = Math.max(0, charWidth - text.length);
    return ' '.repeat(padding) + text;
  }

  /**
   * Create separator line
   */
  private separator(): string {
    return '-'.repeat(this.getCharWidth());
  }

  /**
   * Format two columns (left and right aligned)
   */
  private twoColumn(left: string, right: string): string {
    const charWidth = this.getCharWidth();
    const maxLeftWidth = Math.floor(charWidth * 0.6);
    const maxRightWidth = Math.floor(charWidth * 0.4);

    const leftTrimmed = left.substring(0, maxLeftWidth);
    const rightTrimmed = right.substring(0, maxRightWidth);
    const padding = charWidth - leftTrimmed.length - rightTrimmed.length;

    return leftTrimmed + ' '.repeat(Math.max(1, padding)) + rightTrimmed;
  }

  /**
   * Get payment status stamp
   */
  private getPaymentStamp(status: string, amountPaid?: number, amountDue?: number): string[] {
    const lines: string[] = [];
    const charWidth = this.getCharWidth();

    lines.push('');
    lines.push(this.separator());

    switch (status) {
      case 'paid':
        lines.push(this.centerText('*** PAID ***'));
        if (amountPaid) {
          lines.push(this.centerText(`Amount Paid: ₹${amountPaid}`));
        }
        break;
      case 'partial':
        lines.push(this.centerText('*** PARTIAL PAYMENT ***'));
        if (amountPaid) {
          lines.push(this.centerText(`Amount Paid: ₹${amountPaid}`));
        }
        if (amountDue) {
          lines.push(this.centerText(`Amount Due: ₹${amountDue}`));
        }
        break;
      case 'pending':
        lines.push(this.centerText('*** PENDING ***'));
        if (amountDue) {
          lines.push(this.centerText(`Amount Due: ₹${amountDue}`));
        }
        break;
      case 'exempt':
        lines.push(this.centerText('*** EXEMPT ***'));
        break;
    }

    lines.push(this.separator());
    lines.push('');

    return lines;
  }

  /**
   * Format bill for thermal printer
   */
  formatBill(bill: BillData, invoiceType: 'fee' | 'bill'): string {
    const lines: string[] = [];
    const charWidth = this.getCharWidth();
    const settings = invoiceType === 'bill' ? this.billPrintSettings : this.billPrintSettings;
    
    // Get display settings based on invoice type
    const showPatientName = invoiceType === 'bill' ? settings.billShowPatientName : settings.feeShowPatientName;
    const showRegistrationNumber = invoiceType === 'bill' ? settings.billShowRegistrationNumber : settings.feeShowRegistrationNumber;
    const showMobileNumber = invoiceType === 'bill' ? settings.billShowMobileNumber : settings.feeShowMobileNumber;
    const showInvoiceNumber = invoiceType === 'bill' ? settings.billShowInvoiceNumber : settings.feeShowInvoiceNumber;
    const showDate = invoiceType === 'bill' ? settings.billShowDate : settings.feeShowDate;
    const showItems = invoiceType === 'bill' ? settings.billShowItems : false;
    const showSubtotal = invoiceType === 'bill' ? settings.billShowSubtotal : false;
    const showDiscount = invoiceType === 'bill' ? settings.billShowDiscount : false;
    const showTax = invoiceType === 'bill' ? settings.billShowTax : false;
    const showTotal = invoiceType === 'bill' ? settings.billShowTotal : true;
    const showPaymentStatus = invoiceType === 'bill' ? settings.billShowPaymentStatus : settings.feeShowPaymentStatus;
    const showPaymentMethod = invoiceType === 'bill' ? settings.billShowPaymentMethod : settings.feeShowPaymentMethod;
    const showNotes = invoiceType === 'bill' ? settings.billShowNotes : false;
    const headerText = invoiceType === 'bill' ? settings.billHeaderText : settings.feeHeaderText;
    const footerText = invoiceType === 'bill' ? settings.billFooterText : settings.feeFooterText;

    // Header
    lines.push(this.centerText(headerText));

    // Patient info
    if (showInvoiceNumber || showPatientName) {
      if (showInvoiceNumber && showPatientName) {
        lines.push(this.twoColumn(`INV: ${bill.invoiceNumber}`, bill.patientName));
      } else if (showInvoiceNumber) {
        lines.push(this.centerText(`INV: ${bill.invoiceNumber}`));
      } else if (showPatientName) {
        lines.push(this.centerText(bill.patientName));
      }
    }

    if (showRegistrationNumber || showMobileNumber) {
      if (showRegistrationNumber && showMobileNumber) {
        lines.push(this.twoColumn(`Regd: ${bill.registrationNumber}`, `Ph: ${bill.mobileNumber}`));
      } else if (showRegistrationNumber) {
        lines.push(this.centerText(`Regd: ${bill.registrationNumber}`));
      } else if (showMobileNumber) {
        lines.push(this.centerText(`Ph: ${bill.mobileNumber}`));
      }
    }

    if (showDate) {
      lines.push(this.centerText(new Date().toLocaleDateString('en-IN')));
    }

    if (showInvoiceNumber || showPatientName || showRegistrationNumber || showMobileNumber || showDate) {
      lines.push(this.separator());
    }

    // Items
    if (showItems && bill.items && bill.items.length > 0) {
      lines.push(this.twoColumn('Description', 'Amount'));
      lines.push(this.separator());

      bill.items.forEach(item => {
        const description = item.description.substring(0, Math.floor(charWidth * 0.6));
        const amount = `₹${item.total}`;
        lines.push(this.twoColumn(description, amount));
      });

      lines.push(this.separator());
    }

    // Totals
    if (showSubtotal) {
      lines.push(this.twoColumn('Subtotal:', `₹${bill.subtotal}`));
    }

    if (showDiscount && bill.discountAmount && bill.discountAmount > 0) {
      lines.push(this.twoColumn(`Discount (${bill.discountPercent}%):`, `-₹${bill.discountAmount}`));
    }

    if (showTax && bill.taxAmount && bill.taxAmount > 0) {
      lines.push(this.twoColumn('Tax:', `₹${bill.taxAmount}`));
    }

    if (showTotal) {
      if (showSubtotal || showDiscount || showTax) {
        lines.push(this.separator());
      }
      lines.push(this.twoColumn('Total:', `₹${bill.netAmount}`));
    }

    // Payment details
    if (showPaymentMethod && bill.paymentMethod) {
      lines.push(this.twoColumn('Payment Mode:', bill.paymentMethod));
    }

    // Payment status stamp
    if (showPaymentStatus) {
      const stampLines = this.getPaymentStamp(
        bill.paymentStatus,
        bill.amountPaid,
        bill.amountDue
      );
      lines.push(...stampLines);
    }

    // Notes
    if (showNotes && bill.notes) {
      lines.push('Notes:');
      lines.push(bill.notes);
    }

    // Footer
    if (footerText) {
      lines.push(this.centerText(footerText));
    }

    // Auto-cut
    if (this.autocut) {
      for (let i = 0; i < this.autocutLines; i++) {
        lines.push('');
      }
      lines.push('\x1D\x56\x41'); // ESC/POS command for auto-cut
    }

    return lines.join('\n');
  }

  /**
   * Generate HTML for print preview
   */
  generatePrintHTML(bill: BillData, invoiceType: 'fee' | 'bill'): string {
    const content = this.formatBill(bill, invoiceType);
    const fontFamily = 'Courier New, Courier, monospace';
    const fontSize = '13px';
    const lineHeight = '1.5';

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Invoice ${bill.invoiceNumber}</title>
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
            color: #000000 !important;
          }
          html {
            background: white;
            color: #000000;
          }
          body {
            font-family: ${fontFamily};
            font-size: ${fontSize};
            line-height: ${lineHeight};
            margin: 0;
            padding: 10mm;
            background: white !important;
            color: #000000 !important;
            font-weight: 700;
          }
          .receipt {
            width: ${this.width}mm;
            margin: 0 auto;
            white-space: pre-wrap;
            word-wrap: break-word;
            background: white !important;
            padding: 5mm;
            border: 1px solid #000;
            color: #000000 !important;
            font-weight: 700;
            font-family: ${fontFamily};
            font-size: ${fontSize};
            line-height: ${lineHeight};
          }
          @media print {
            * {
              color: #000000 !important;
            }
            html {
              background: white;
              color: #000000;
            }
            body {
              margin: 0;
              padding: 0;
              color: #000000 !important;
              background: white !important;
              font-weight: 700;
            }
            .receipt {
              width: 100%;
              border: none;
              box-shadow: none;
              color: #000000 !important;
              page-break-inside: avoid;
              font-weight: 700;
            }
          }
        </style>
      </head>
      <body>
        <div class="receipt">${this.escapeHtml(content)}</div>
        <script>
          window.print();
        </script>
      </body>
      </html>
    `;
  }

  /**
   * Escape HTML special characters
   */
  private escapeHtml(text: string): string {
    const map: { [key: string]: string } = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    };
    return text.replace(/[&<>"']/g, m => map[m]);
  }
}

/**
 * Get invoice settings from localStorage
 */
export function getInvoiceSettings(): InvoiceSettings {
  const defaults: InvoiceSettings = {
    feeInvoicePrefix: 'FEE',
    feeInvoiceStartNumber: 1,
    billInvoicePrefix: 'BILL',
    billInvoiceStartNumber: 1,
    thermalPrinterWidth: 80,
    autocut: true,
    autocut_lines: 3,
  };

  if (typeof window === 'undefined') return defaults;

  try {
    const saved = localStorage.getItem('invoiceSettings');
    return saved ? { ...defaults, ...JSON.parse(saved) } : defaults;
  } catch (e) {
    console.error('Failed to load invoice settings:', e);
    return defaults;
  }
}

/**
 * Get default bill print settings
 */
export function getDefaultBillPrintSettings(): BillPrintSettings {
  return {
    billShowPatientName: true,
    billShowRegistrationNumber: true,
    billShowMobileNumber: true,
    billShowInvoiceNumber: true,
    billShowDate: true,
    billShowItems: true,
    billShowSubtotal: true,
    billShowDiscount: true,
    billShowTax: true,
    billShowTotal: true,
    billShowPaymentStatus: true,
    billShowPaymentMethod: true,
    billShowNotes: true,
    billHeaderText: 'MEDICINE BILL',
    billFooterText: 'Thank you for your visit!\nGet well soon.',
    
    feeShowPatientName: true,
    feeShowRegistrationNumber: true,
    feeShowMobileNumber: true,
    feeShowInvoiceNumber: true,
    feeShowDate: true,
    feeShowAmount: true,
    feeShowPaymentStatus: true,
    feeShowPaymentMethod: true,
    feeHeaderText: 'FEE RECEIPT',
    feeFooterText: 'Thank you for your visit!\nGet well soon.',
  };
}

/**
 * Get bill print settings from localStorage
 */
export function getBillPrintSettings(): BillPrintSettings {
  if (typeof window === 'undefined') return getDefaultBillPrintSettings();

  try {
    const saved = localStorage.getItem('billPrintSettings');
    return saved ? { ...getDefaultBillPrintSettings(), ...JSON.parse(saved) } : getDefaultBillPrintSettings();
  } catch (e) {
    console.error('Failed to load bill print settings:', e);
    return getDefaultBillPrintSettings();
  }
}

/**
 * Generate next invoice number
 */
export function generateInvoiceNumber(type: 'fee' | 'bill'): string {
  const settings = getInvoiceSettings();
  const key = type === 'fee' ? 'feeInvoiceCounter' : 'billInvoiceCounter';
  const prefix = type === 'fee' ? settings.feeInvoicePrefix : settings.billInvoicePrefix;
  const startNumber = type === 'fee' ? settings.feeInvoiceStartNumber : settings.billInvoiceStartNumber;

  let counter = parseInt(localStorage.getItem(key) || String(startNumber));
  const invoiceNumber = `${prefix}-${String(counter).padStart(4, '0')}`;
  localStorage.setItem(key, String(counter + 1));

  return invoiceNumber;
}
