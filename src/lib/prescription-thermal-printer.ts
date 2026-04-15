/**
 * Prescription Thermal Printer Utility
 * Formats prescriptions for compact thermal printer output (80mm width)
 */

export interface PrescriptionData {
  patientName: string;
  registrationNumber: string;
  mobileNumber: string;
  prescriptions: Array<{
    medicine: string;
    potency: string;
    quantity: string;
    doseForm: string;
    dosePattern: string;
    frequency: string;
    duration: string;
    bottles?: number;
    isCombination?: boolean;
    combinationContent?: string;
  }>;
  visitDate?: Date;
  visitTime?: string;
}

export interface PrinterSettings {
  paperWidth: number;
  autocut: boolean;
  fontSize: number;
  lineHeight: number;
  topMargin: number;
  bottomMargin: number;
  leftMargin: number;
  rightMargin: number;
}

export class PrescriptionThermalPrinter {
  private width: number = 80; // Standard thermal printer width in characters

  constructor(width: number = 80) {
    this.width = width;
  }

  /**
   * Center text for thermal printer
   */
  private centerText(text: string): string {
    const padding = Math.max(0, Math.floor((this.width - text.length) / 2));
    return ' '.repeat(padding) + text;
  }

  /**
   * Right align text
   */
  private rightAlign(text: string): string {
    const padding = Math.max(0, this.width - text.length);
    return ' '.repeat(padding) + text;
  }

  /**
   * Create separator line
   */
  private separator(): string {
    return '-'.repeat(this.width);
  }

  /**
   * Format prescription for thermal printer
   */
  formatPrescription(data: PrescriptionData): string {
    let output = '';

    // Header - "Prescription For Pharmacy" centered
    output += this.centerText('Prescription For Pharmacy') + '\n';
    output += '\n';

    // Patient Details - Left and Right aligned on same line
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-IN', { 
      day: '2-digit', 
      month: '2-digit', 
      year: '2-digit' 
    });
    const timeStr = now.toLocaleTimeString('en-IN', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: true 
    });

    // Line 1: Patient Name (left) - Regd No (right)
    const patientNamePart = `${data.patientName}`;
    const regdNoPart = `Regd: ${data.registrationNumber}`;
    const line1Padding = Math.max(1, this.width - patientNamePart.length - regdNoPart.length);
    output += patientNamePart + ' '.repeat(line1Padding) + regdNoPart + '\n';

    // Line 2: Mobile (left) - Date & Time (right)
    const mobilePart = `Mobile: ${data.mobileNumber}`;
    const dateTimePart = `${dateStr} ${timeStr}`;
    const line2Padding = Math.max(1, this.width - mobilePart.length - dateTimePart.length);
    output += mobilePart + ' '.repeat(line2Padding) + dateTimePart + '\n';
    output += '\n';

    // Rx - Left aligned, after patient details
    output += 'Rx\n';
    output += '\n';

    // Separator
    output += this.separator() + '\n';

    // Prescriptions
    data.prescriptions.forEach((rx, index) => {
      // Line 1: Sr No. Medicine Name - Potency - Quantity - Dose Form
      const srNo = `${index + 1}.`;
      const medicineDetails = `${rx.medicine} ${rx.potency} ${rx.quantity} ${rx.doseForm}`;
      const line1 = `${srNo} ${medicineDetails}`;
      output += line1.substring(0, this.width) + '\n';

      // Line 1.5: Combination details if present (indented)
      if (rx.isCombination && rx.combinationContent) {
        const combinationLine = `   (${rx.combinationContent})`;
        output += combinationLine.substring(0, this.width) + '\n';
      }

      // Line 2: Pattern - Dose Form - Frequency - Duration (left) + Bottles Nos (right)
      const doseLine = `${rx.dosePattern} - ${rx.doseForm} - ${rx.frequency} - ${rx.duration}`;
      const bottlesText = `${rx.bottles || 1} Nos`;
      
      // Calculate padding to right-align bottles
      const availableWidth = this.width - bottlesText.length;
      const doseLineTrimmed = doseLine.substring(0, availableWidth);
      const paddingBetween = Math.max(1, availableWidth - doseLineTrimmed.length);
      
      output += doseLineTrimmed + ' '.repeat(paddingBetween) + bottlesText + '\n';

      // Single separator between medicines
      output += this.separator() + '\n';
    });

    // Footer
    output += this.centerText('Thank You') + '\n';

    return output;
  }

  /**
   * Generate print HTML for browser printing
   */
  generatePrintHTML(data: PrescriptionData, settings?: Partial<PrinterSettings>): string {
    const prescriptionText = this.formatPrescription(data);
    
    // Default settings
    const finalSettings: PrinterSettings = {
      paperWidth: settings?.paperWidth || 80,
      autocut: settings?.autocut !== false,
      fontSize: settings?.fontSize || 8,
      lineHeight: settings?.lineHeight || 1.0,
      topMargin: settings?.topMargin || 2,
      bottomMargin: settings?.bottomMargin || 2,
      leftMargin: settings?.leftMargin || 2,
      rightMargin: settings?.rightMargin || 2,
    };
    
    // Convert character width to mm (approximately 2.1mm per character for 80mm width)
    const mmWidth = finalSettings.paperWidth * 2.1;
    
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Prescription - ${data.patientName}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    html, body {
      margin: 0;
      padding: 0;
      width: 100%;
      height: 100%;
    }
    
    @page {
      size: ${mmWidth}mm auto;
      margin: ${finalSettings.topMargin}mm ${finalSettings.rightMargin}mm ${finalSettings.bottomMargin}mm ${finalSettings.leftMargin}mm;
      padding: 0;
    }
    
    @media print {
      html, body {
        margin: 0;
        padding: 0;
        width: ${mmWidth}mm;
        height: auto;
      }
      .thermal-print {
        width: ${mmWidth}mm;
        margin: 0;
        padding: 0;
        font-family: 'Courier New', 'Courier', monospace;
        font-size: ${finalSettings.fontSize}pt;
        line-height: ${finalSettings.lineHeight};
        white-space: pre;
        word-wrap: break-word;
        overflow-wrap: break-word;
        overflow: visible;
      }
      .page-break {
        page-break-after: always;
      }
    }
    
    body {
      margin: 0;
      padding: 5px;
      font-family: 'Courier New', 'Courier', monospace;
      font-size: ${finalSettings.fontSize}pt;
      line-height: ${finalSettings.lineHeight};
      background: #f5f5f5;
      width: ${mmWidth}mm;
    }
    
    .thermal-print {
      width: ${mmWidth}mm;
      margin: 0 auto;
      background: white;
      padding: ${finalSettings.topMargin}mm ${finalSettings.rightMargin}mm ${finalSettings.bottomMargin}mm ${finalSettings.leftMargin}mm;
      box-shadow: 0 0 10px rgba(0,0,0,0.1);
      white-space: pre;
      word-wrap: break-word;
      overflow-wrap: break-word;
      overflow: visible;
      font-family: 'Courier New', 'Courier', monospace;
      font-size: ${finalSettings.fontSize}pt;
      line-height: ${finalSettings.lineHeight};
    }
  </style>
</head>
<body>
  <div class="thermal-print">${this.escapeHtml(prescriptionText)}</div>
  ${finalSettings.autocut ? '<div class="page-break"></div>' : ''}
  <script>
    setTimeout(function() {
      window.print();
    }, 500);
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
      "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, (char) => map[char]);
  }
}

/**
 * Helper function to print prescription to thermal printer
 */
export function printPrescriptionToPharmacy(data: PrescriptionData, settings?: Partial<PrinterSettings>): void {
  const printer = new PrescriptionThermalPrinter(settings?.paperWidth || 80);
  const html = printer.generatePrintHTML(data, settings);
  
  // Open in new window and print
  const printWindow = window.open('', '', 'width=400,height=600');
  if (printWindow) {
    printWindow.document.write(html);
    printWindow.document.close();
  }
}
