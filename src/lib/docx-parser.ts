/**
 * Word Document (.docx) Parser for Materia Medica
 * Extracts text and structure from Word documents using JSZip
 * .docx files are ZIP archives containing XML files
 */

export interface DocxSection {
  title: string;
  level: number;
  content: string;
  formattedHtml?: string;
}

export interface DocxMedicine {
  name: string;
  sections: DocxSection[];
  fullText: string;
  formattedHtml?: string;
}

export interface DocxParseResult {
  medicines: DocxMedicine[];
  fullText: string;
  formattedHtml: string;
  totalPages: number;
  structure: DocxSection[];
}

/**
 * Parse a Word document buffer and extract text content
 * Uses JSZip to read the document.xml from the .docx archive
 */
export async function parseDocxBuffer(buffer: Buffer): Promise<DocxParseResult> {
  try {
    console.log('[DocxParser] Starting to parse Word document, buffer size:', buffer.length);
    
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();
    await zip.loadAsync(buffer);
    
    const documentXml = await zip.file('word/document.xml')?.async('text');
    
    if (!documentXml) {
      throw new Error('document.xml not found in .docx file');
    }
    
    console.log('[DocxParser] document.xml extracted, length:', documentXml.length);
    
    // Extract paragraphs with formatting
    const paragraphs = extractParagraphs(documentXml);
    console.log('[DocxParser] Extracted', paragraphs.length, 'paragraphs');
    
    // Build full text
    const fullText = paragraphs.map(p => p.text).join('\n');
    console.log('[DocxParser] Full text length:', fullText.length);
    
    if (fullText.length === 0) {
      throw new Error('No text content found in document');
    }
    
    // Split into medicines
    const medicines = splitIntoMedicines(paragraphs);
    console.log('[DocxParser] Found', medicines.length, 'medicines');
    
    const totalPages = Math.ceil(fullText.length / 2000);

    return {
      medicines,
      fullText,
      formattedHtml: fullText,
      totalPages,
      structure: []
    };
  } catch (error) {
    console.error('[DocxParser] Error parsing document:', error);
    throw new Error(`Failed to parse Word document: ${String(error)}`);
  }
}

interface Paragraph {
  text: string;
  style: string;
  level: number;
  isHeading: boolean;
}

/**
 * Extract paragraphs from Word document XML
 */
function extractParagraphs(xml: string): Paragraph[] {
  const paragraphs: Paragraph[] = [];
  
  try {
    const paragraphRegex = /<w:p>[\s\S]*?<\/w:p>/g;
    const paragraphMatches = xml.match(paragraphRegex) || [];
    
    for (const paragraphXml of paragraphMatches) {
      // Get style
      const styleMatch = paragraphXml.match(/<w:pStyle\s+w:val="([^"]+)"/);
      const style = styleMatch ? styleMatch[1] : '';
      
      // Detect heading level
      let level = 0;
      let isHeading = false;
      if (style.match(/Heading1/i)) { level = 1; isHeading = true; }
      else if (style.match(/Heading2/i)) { level = 2; isHeading = true; }
      else if (style.match(/Heading3/i)) { level = 3; isHeading = true; }
      
      // Extract text with formatting
      const text = extractTextFromParagraph(paragraphXml);
      
      if (text.trim()) {
        paragraphs.push({
          text,
          style,
          level,
          isHeading
        });
      } else {
        // Preserve empty paragraphs for spacing
        paragraphs.push({
          text: '',
          style,
          level,
          isHeading
        });
      }
    }
    
    return paragraphs;
  } catch (error) {
    console.error('[DocxParser] Error extracting paragraphs:', error);
    return [];
  }
}

/**
 * Extract text from a single paragraph, preserving formatting
 */
function extractTextFromParagraph(paragraphXml: string): string {
  let result = '';
  
  const runRegex = /<w:r>[\s\S]*?<\/w:r>/g;
  const runs = paragraphXml.match(runRegex) || [];
  
  for (const run of runs) {
    const isBold = run.includes('<w:b');
    const isItalic = run.includes('<w:i');
    const isUnderline = run.includes('<w:u');
    
    const textMatches = run.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [];
    const runText = textMatches
      .map(match => {
        const contentMatch = match.match(/>([^<]*)<\/w:t>/);
        return contentMatch ? contentMatch[1] : '';
      })
      .join('');
    
    if (!runText) continue;
    
    let formatted = runText;
    if (isBold) formatted = `**${formatted}**`;
    if (isItalic) formatted = `*${formatted}*`;
    if (isUnderline) formatted = `__${formatted}__`;
    
    result += formatted;
  }
  
  return result;
}

/**
 * Split paragraphs into medicines
 * Each Heading1 or Heading2 is a medicine
 */
function splitIntoMedicines(paragraphs: Paragraph[]): DocxMedicine[] {
  const medicines: DocxMedicine[] = [];
  
  let currentMedicine: Paragraph[] = [];
  let currentMedicineName = '';
  
  for (const para of paragraphs) {
    // Check if this is a medicine heading (Heading1 or Heading2)
    if (para.isHeading && para.level <= 2 && para.text.trim()) {
      // Save previous medicine if exists
      if (currentMedicineName && currentMedicine.length > 0) {
        const medicineText = currentMedicine.map(p => p.text).join('\n');
        medicines.push({
          name: currentMedicineName,
          sections: [],
          fullText: medicineText
        });
        console.log(`[DocxParser] Created medicine: "${currentMedicineName}" (${medicineText.length} chars)`);
      }
      
      // Start new medicine
      currentMedicineName = para.text.trim();
      currentMedicine = [para];
    } else {
      // Add to current medicine
      currentMedicine.push(para);
    }
  }
  
  // Add last medicine
  if (currentMedicineName && currentMedicine.length > 0) {
    const medicineText = currentMedicine.map(p => p.text).join('\n');
    medicines.push({
      name: currentMedicineName,
      sections: [],
      fullText: medicineText
    });
    console.log(`[DocxParser] Created medicine: "${currentMedicineName}" (${medicineText.length} chars)`);
  }
  
  // If no medicines found, treat entire document as one
  if (medicines.length === 0) {
    const allText = paragraphs.map(p => p.text).join('\n');
    medicines.push({
      name: 'Document Content',
      sections: [],
      fullText: allText
    });
    console.log('[DocxParser] No medicines found, treating entire document as one');
  }
  
  console.log('[DocxParser] Total medicines:', medicines.length);
  return medicines;
}

/**
 * Build search index from parsed medicines
 */
export function buildDocxSearchIndex(medicines: DocxMedicine[]): Array<{
  word: string;
  medicineIndex: number;
  sectionIndex: number;
  frequency: number;
}> {
  const index: Record<string, { medicineIndex: number; sectionIndex: number; frequency: number }[]> = {};
  
  medicines.forEach((medicine, medicineIndex) => {
    const words = medicine.fullText.toLowerCase().split(/\W+/).filter(w => w.length > 2);
    
    words.forEach(word => {
      if (!index[word]) {
        index[word] = [];
      }
      
      const existing = index[word].find(
        item => item.medicineIndex === medicineIndex
      );
      
      if (existing) {
        existing.frequency++;
      } else {
        index[word].push({
          medicineIndex,
          sectionIndex: 0,
          frequency: 1
        });
      }
    });
  });
  
  return Object.entries(index).map(([word, locations]) => ({
    word,
    medicineIndex: locations[0].medicineIndex,
    sectionIndex: locations[0].sectionIndex,
    frequency: locations.reduce((sum, loc) => sum + loc.frequency, 0)
  }));
}
