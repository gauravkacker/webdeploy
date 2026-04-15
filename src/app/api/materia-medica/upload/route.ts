import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const metadata = JSON.parse(formData.get('metadata') as string);
    const textContent = formData.get('textContent') as string | null;

    // Validate that we have either a file or text content
    if (!file && (!textContent || !textContent.trim())) {
      return NextResponse.json(
        { success: false, message: 'Please provide either a PDF/Word file or text content' },
        { status: 400 }
      );
    }

    // Generate unique book ID
    const bookId = `book-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    let filePath = '';
    let fileSize = 0;
    let fileType = '';
    
    // Handle file upload (PDF or Word)
    if (file) {
      // Validate file type
      const isPdf = file.type === 'application/pdf';
      const isWord = file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
                     file.type === 'application/msword' ||
                     file.name.endsWith('.docx') ||
                     file.name.endsWith('.doc');
      
      if (!isPdf && !isWord) {
        return NextResponse.json(
          { success: false, message: 'Only PDF and Word (.docx) files are allowed' },
          { status: 400 }
        );
      }

      // Validate file size (max 100MB)
      const maxSize = 100 * 1024 * 1024; // 100MB
      if (file.size > maxSize) {
        return NextResponse.json(
          { success: false, message: 'File size exceeds 100MB limit' },
          { status: 400 }
        );
      }
      
      // Create directory if it doesn't exist
      const uploadDir = join(process.cwd(), 'public', 'materia-medica', 'books');
      if (!existsSync(uploadDir)) {
        await mkdir(uploadDir, { recursive: true });
      }

      // Save file
      const fileExtension = isPdf ? 'pdf' : 'docx';
      const fileName = `${bookId}.${fileExtension}`;
      const fullFilePath = join(uploadDir, fileName);
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);
      await writeFile(fullFilePath, buffer);

      console.log(`[Upload] File saved: ${fileName}`);
      
      filePath = `materia-medica/books/${fileName}`;
      fileSize = file.size;
      fileType = isPdf ? 'pdf' : 'docx';
    }

    // If text content is provided, process it
    if (textContent && textContent.trim().length > 0) {
      try {
        console.log(`[Upload] Processing provided text content for ${bookId}`);
        
        const { materiaMedicaBookPageDb, materiaMedicaSearchIndexDb } = await import('@/lib/db/database');
        const { buildSearchIndex } = await import('@/lib/pdf-processor');
        const { countWords } = await import('@/lib/pdf-utils-client');
        
        // Auto-format the text content
        const formattedText = autoFormatMateriaMedica(textContent);
        
        // Split by page breaks (medicines)
        const pages = formattedText.split('##PAGE_BREAK##').filter(p => p.trim());
        const totalPages = pages.length;
        
        console.log(`[Upload] Auto-formatted into ${totalPages} medicine pages`);
        
        let totalIndices = 0;
        let fullText = '';
        
        for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
          const pageText = pages[pageNum - 1].trim();
          
          // Extract medicine name for index
          const titleMatch = pageText.match(/##TITLE##(.*?)##TITLE##/);
          const medicineName = titleMatch ? titleMatch[1].trim() : `Medicine ${pageNum}`;
          
          fullText += pageText + '\n\n##PAGE_BREAK##\n\n';
          
          // Store page
          materiaMedicaBookPageDb.create({
            bookId,
            pageNumber: pageNum,
            text: pageText,
            wordCount: countWords(pageText),
            hasImages: false,
            medicineName: medicineName
          });
          
          // Build search indices
          const pageIndices = buildSearchIndex(bookId, pageNum, pageText);
          for (const index of pageIndices) {
            materiaMedicaSearchIndexDb.create({
              bookId,
              pageNumber: pageNum,
              word: index.word,
              positions: index.positions,
              frequency: index.frequency
            });
            totalIndices++;
          }
        }
        
        console.log(`[Upload] Processing complete: ${totalPages} pages, ${totalIndices} search indices`);
        
        return NextResponse.json({
          success: true,
          bookId,
          fileName: `${bookId}.txt`,
          filePath: `materia-medica/books/${bookId}.txt`,
          fileSize: fileSize,
          totalPages,
          searchIndices: totalIndices,
          fullText: fullText.trim(),
          message: `Book processed successfully. Created ${totalPages} medicine pages with ${totalIndices} searchable terms.`,
          processingStatus: 'completed',
          indexStatus: 'indexed'
        });
        
      } catch (processingError) {
        console.error('[Upload] Processing error:', processingError);
        
        return NextResponse.json({
          success: true,
          bookId,
          fileName: `${bookId}.txt`,
          filePath: `materia-medica/books/${bookId}.txt`,
          fileSize: fileSize,
          message: 'Book uploaded but text processing failed.',
          processingStatus: 'failed',
          processingError: String(processingError)
        });
      }
    } else if (fileType === 'docx') {
      // Process Word document automatically
      try {
        console.log(`[Upload] Processing Word document for ${bookId}`);
        
        const { parseDocxBuffer } = await import('@/lib/docx-parser');
        const { materiaMedicaBookPageDb, materiaMedicaSearchIndexDb, materiaMedicaBookDb } = await import('@/lib/db/database');
        const { countWords } = await import('@/lib/pdf-utils-client');
        
        // Read the uploaded file
        const uploadDir = join(process.cwd(), 'public', 'materia-medica', 'books');
        const fileName = `${bookId}.docx`;
        const fullFilePath = join(uploadDir, fileName);
        const { readFile } = await import('fs/promises');
        
        console.log(`[Upload] Reading file from: ${fullFilePath}`);
        const fileBuffer = await readFile(fullFilePath);
        console.log(`[Upload] File read successfully, size: ${fileBuffer.length} bytes`);
        
        // Parse the Word document
        console.log(`[Upload] Starting Word document parse...`);
        const parseResult = await parseDocxBuffer(fileBuffer);
        console.log(`[Upload] Parse complete. Medicines: ${parseResult.medicines.length}, Pages: ${parseResult.totalPages}`);
        console.log(`[Upload] Full text length: ${parseResult.fullText.length} chars`);
        console.log(`[Upload] First 500 chars: ${parseResult.fullText.substring(0, 500)}`);
        
        if (parseResult.medicines.length === 0) {
          console.warn(`[Upload] WARNING: No medicines found in document. Full text length: ${parseResult.fullText.length}`);
          console.warn(`[Upload] First 500 chars of text: ${parseResult.fullText.substring(0, 500)}`);
        }
        
        if (parseResult.fullText.length === 0) {
          console.error(`[Upload] CRITICAL: No text extracted from Word document!`);
          throw new Error('No text content could be extracted from the Word document');
        }
        
        let totalIndices = 0;
        let pageNum = 1;
        let fullText = '';
        
        // Store each medicine as a page
        for (const medicine of parseResult.medicines) {
          console.log(`[Upload] Storing medicine ${pageNum}: ${medicine.name}`);
          
          // Add to fullText with PAGE_BREAK markers
          fullText += `##TITLE##${medicine.name}##TITLE##\n`;
          fullText += medicine.fullText;
          fullText += '\n\n##PAGE_BREAK##\n\n';
          
          // Store page content
          materiaMedicaBookPageDb.create({
            bookId,
            pageNumber: pageNum,
            text: medicine.fullText,
            wordCount: countWords(medicine.fullText),
            hasImages: false,
            medicineName: medicine.name
          });
          
          // Build search indices for this medicine
          const medicineWords = medicine.fullText.toLowerCase().split(/\W+/).filter(w => w.length > 2);
          const uniqueWords = [...new Set(medicineWords)];
          
          console.log(`[Upload] Building indices for ${medicine.name}: ${uniqueWords.length} unique words`);
          
          for (const word of uniqueWords) {
            materiaMedicaSearchIndexDb.create({
              bookId,
              pageNumber: pageNum,
              word,
              positions: [],
              frequency: medicineWords.filter(w => w === word).length
            });
            totalIndices++;
          }
          
          pageNum++;
        }
        
        const finalFullText = fullText.trim();
        
        console.log(`[Upload] Word document processing complete: ${parseResult.medicines.length} medicines, ${totalIndices} search indices`);
        
        // Update book record with fullText for search
        const existingBook = materiaMedicaBookDb.getById(bookId) as any;
        if (existingBook) {
          materiaMedicaBookDb.update(bookId, {
            fullText: finalFullText,
            totalPages: parseResult.medicines.length,
            processingStatus: 'completed',
            indexStatus: 'indexed'
          });
        }
        
        return NextResponse.json({
          success: true,
          bookId,
          fileName: `${bookId}.docx`,
          filePath: filePath,
          fileSize: fileSize,
          totalPages: parseResult.medicines.length,
          searchIndices: totalIndices,
          fullText: finalFullText,
          formattedHtml: parseResult.formattedHtml,
          message: `Word document processed successfully. Created ${parseResult.medicines.length} medicine pages with ${totalIndices} searchable terms.`,
          processingStatus: 'completed',
          indexStatus: 'indexed'
        });
        
      } catch (processingError) {
        console.error('[Upload] Word document processing error:', processingError);
        console.error('[Upload] Error details:', (processingError as any).message);
        console.error('[Upload] Error stack:', (processingError as any).stack);
        
        return NextResponse.json({
          success: false,
          bookId,
          fileName: `${bookId}.docx`,
          filePath: filePath,
          fileSize: fileSize,
          message: `Word document processing failed: ${String(processingError)}`,
          processingStatus: 'failed',
          processingError: String(processingError)
        }, { status: 500 });
      }
    } else {
      // No text content provided - just save the file (PDF or Word)
      if (file) {
        const message = fileType === 'docx' 
          ? 'Word document uploaded successfully. Processing...'
          : 'PDF uploaded successfully. Please add text content to make it searchable.';
        
        return NextResponse.json({
          success: true,
          bookId,
          fileName: filePath.split('/').pop(),
          filePath: filePath,
          fileSize: fileSize,
          fileType: fileType,
          message: message,
          processingStatus: 'pending',
          indexStatus: 'not_indexed'
        });
      } else {
        return NextResponse.json({
          success: false,
          message: 'No content provided'
        }, { status: 400 });
      }
    }

  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to upload file', error: String(error) },
      { status: 500 }
    );
  }
}

// Auto-format materia medica text content
function autoFormatMateriaMedica(text: string): string {
  console.log('[Auto-Format] Starting auto-formatting...');
  
  let formatted = text;
  
  // Common section keywords in materia medica
  const sectionKeywords = [
    'MIND', 'HEAD', 'EYES', 'EARS', 'NOSE', 'FACE', 'MOUTH', 'THROAT',
    'STOMACH', 'ABDOMEN', 'RECTUM', 'STOOL', 'URINARY', 'MALE', 'FEMALE',
    'RESPIRATORY', 'CHEST', 'HEART', 'BACK', 'EXTREMITIES', 'SKIN', 'SLEEP',
    'FEVER', 'GENERALITIES', 'MODALITIES', 'WORSE', 'BETTER', 'RELATIONS',
    'DOSE', 'CLINICAL', 'COMPARE', 'COMPLEMENTARY', 'ANTIDOTES'
  ];
  
  // Step 1: Detect and mark section headings
  // Pattern: Section name on its own line (all caps or with colon/dash)
  for (const section of sectionKeywords) {
    // Match section as standalone line (all caps)
    const standaloneRegex = new RegExp(`^${section}\\s*$`, 'gm');
    formatted = formatted.replace(standaloneRegex, `##HEADING##${section}##HEADING##`);
    
    // Match section with colon or dash
    const colonRegex = new RegExp(`^${section}\\s*[-:]\\s*$`, 'gm');
    formatted = formatted.replace(colonRegex, `##HEADING##${section}##HEADING##`);
  }
  
  // Step 2: Detect medicine names (usually all caps, 2+ words, at start of sections)
  // Look for patterns like "ABIES CANADENSIS" or "ACONITUM NAPELLUS - MONKSHOOD"
  const lines = formatted.split('\n');
  const processedLines: string[] = [];
  let inMedicine = false;
  let currentMedicine: string[] = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const nextLine = i < lines.length - 1 ? lines[i + 1].trim() : '';
    
    // Check if this looks like a medicine name
    const isMedicineName = (
      line.length > 3 &&
      line.length < 100 &&
      /^[A-Z][A-Z\s\-\.]+$/.test(line) && // All caps with spaces, dashes, dots
      line.split(/\s+/).length >= 2 && // At least 2 words
      !sectionKeywords.includes(line) && // Not a section keyword
      !line.match(/^##HEADING##/) // Not already marked
    );
    
    // If we found a medicine name and we're already in a medicine, save the previous one
    if (isMedicineName && inMedicine && currentMedicine.length > 0) {
      // Save previous medicine
      processedLines.push(currentMedicine.join('\n'));
      processedLines.push('##PAGE_BREAK##');
      currentMedicine = [];
    }
    
    // Start a new medicine
    if (isMedicineName) {
      inMedicine = true;
      currentMedicine.push(`##TITLE##${line}##TITLE##`);
      console.log(`[Auto-Format] Detected medicine: ${line}`);
    } else if (inMedicine) {
      // Add to current medicine
      currentMedicine.push(lines[i]); // Keep original formatting
    } else {
      // Not in a medicine yet, skip or add to first medicine
      if (line.length > 0) {
        currentMedicine.push(lines[i]);
      }
    }
  }
  
  // Add the last medicine
  if (currentMedicine.length > 0) {
    processedLines.push(currentMedicine.join('\n'));
  }
  
  formatted = processedLines.join('\n');
  
  console.log('[Auto-Format] Formatting complete');
  
  return formatted;
}
