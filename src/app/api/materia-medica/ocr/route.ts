import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { join } from 'path';

// Store OCR progress in memory (in production, use Redis or database)
const ocrProgress = new Map<string, {
  status: 'processing' | 'completed' | 'failed';
  progress: number;
  currentPage: number;
  totalPages: number;
  message: string;
  error?: string;
}>();

export async function POST(request: NextRequest) {
  try {
    const { bookId } = await request.json();

    if (!bookId) {
      return NextResponse.json(
        { success: false, message: 'Book ID is required' },
        { status: 400 }
      );
    }

    // Initialize progress
    ocrProgress.set(bookId, {
      status: 'processing',
      progress: 0,
      currentPage: 0,
      totalPages: 0,
      message: 'Starting OCR processing...'
    });

    // Start OCR processing in background (don't await)
    processOCR(bookId).catch(error => {
      console.error(`[OCR] Error processing ${bookId}:`, error);
      ocrProgress.set(bookId, {
        status: 'failed',
        progress: 0,
        currentPage: 0,
        totalPages: 0,
        message: 'OCR processing failed',
        error: String(error)
      });
    });

    return NextResponse.json({
      success: true,
      message: 'OCR processing started',
      bookId
    });

  } catch (error) {
    console.error('[OCR] Error:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to start OCR processing', error: String(error) },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const bookId = searchParams.get('bookId');

    if (!bookId) {
      return NextResponse.json(
        { success: false, message: 'Book ID is required' },
        { status: 400 }
      );
    }

    const progress = ocrProgress.get(bookId);

    if (!progress) {
      return NextResponse.json({
        success: false,
        message: 'No OCR process found for this book'
      }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      ...progress
    });

  } catch (error) {
    console.error('[OCR] Error getting status:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to get OCR status', error: String(error) },
      { status: 500 }
    );
  }
}

async function processOCR(bookId: string) {
  try {
    // Load PDF file
    const pdfPath = join(process.cwd(), 'public', 'materia-medica', 'books', `${bookId}.pdf`);
    
    // Use existing PDF text extraction (same as process API)
    const { extractTextFromPDF } = await import('@/lib/pdf-processor');
    const extractionResult = await extractTextFromPDF(pdfPath, bookId);
    
    const totalPages = extractionResult.totalPages;
    
    ocrProgress.set(bookId, {
      status: 'processing',
      progress: 20,
      currentPage: 0,
      totalPages,
      message: `Extracted text from ${totalPages} pages`
    });

    console.log(`[OCR] Processing ${bookId}: ${totalPages} pages`);

    const { materiaMedicaBookDb, materiaMedicaBookPageDb, materiaMedicaSearchIndexDb } = await import('@/lib/db/database');
    const { buildSearchIndex } = await import('@/lib/pdf-processor');

    let fullText = '';
    let totalIndices = 0;

    // Process each page
    for (let i = 0; i < extractionResult.pages.length; i++) {
      const page = extractionResult.pages[i];
      const progress = Math.floor(((i + 1) / totalPages) * 75) + 20; // 20-95%

      ocrProgress.set(bookId, {
        status: 'processing',
        progress,
        currentPage: page.pageNumber,
        totalPages,
        message: `Processing page ${page.pageNumber} of ${totalPages}...`
      });

      console.log(`[OCR] ${bookId}: Page ${page.pageNumber}/${totalPages}`);
      
      try {
        fullText += page.text + '\n\n';

        // Store page
        materiaMedicaBookPageDb.create({
          bookId,
          pageNumber: page.pageNumber,
          text: page.text,
          wordCount: page.wordCount,
          hasImages: page.hasImages || false
        });

        // Build search indices
        const pageIndices = buildSearchIndex(bookId, page.pageNumber, page.text);
        for (const index of pageIndices) {
          materiaMedicaSearchIndexDb.create({
            bookId,
            pageNumber: page.pageNumber,
            word: index.word,
            positions: index.positions,
            frequency: index.frequency
          });
          totalIndices++;
        }

      } catch (pageError) {
        console.error(`[OCR] Error on page ${page.pageNumber}:`, pageError);
        // Continue with next page
      }
    }

    // Update book with full text
    materiaMedicaBookDb.update(bookId, {
      fullText: fullText.trim(),
      processingStatus: 'completed',
      indexStatus: 'indexed',
      totalPages: totalPages
    });

    // Complete
    ocrProgress.set(bookId, {
      status: 'completed',
      progress: 100,
      currentPage: totalPages,
      totalPages,
      message: `Text extraction completed! Processed ${totalPages} pages with ${totalIndices} searchable terms.`
    });

    console.log(`[OCR] ${bookId}: Completed - ${totalPages} pages, ${totalIndices} indices`);

  } catch (error) {
    console.error(`[OCR] Fatal error for ${bookId}:`, error);
    throw error;
  }
}
