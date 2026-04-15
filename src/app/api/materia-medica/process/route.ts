import { NextRequest, NextResponse } from 'next/server';
import { join } from 'path';
import { extractTextFromPDF, buildSearchIndex, countWords } from '@/lib/pdf-processor';

export async function POST(request: NextRequest) {
  try {
    const { bookId, filePath, metadata, includeText, buildIndices } = await request.json();

    if (!bookId || !filePath) {
      return NextResponse.json(
        { success: false, message: 'Missing required parameters' },
        { status: 400 }
      );
    }

    // Get full file path
    const fullPath = join(process.cwd(), 'public', filePath);

    // Extract text from PDF
    console.log(`[Process] Starting text extraction for book: ${bookId}`);
    const extractionResult = await extractTextFromPDF(fullPath, bookId);

    // Build search indices if requested
    let searchIndices: any[] = [];
    if (buildIndices) {
      console.log(`[Process] Building search indices for ${extractionResult.pages.length} pages`);
      
      for (const page of extractionResult.pages) {
        const pageIndices = buildSearchIndex(bookId, page.pageNumber, page.text);
        
        // Add each index entry with full details
        for (const index of pageIndices) {
          searchIndices.push({
            bookId,
            pageNumber: page.pageNumber,
            word: index.word,
            positions: index.positions,
            frequency: index.frequency
          });
        }
      }
      
      console.log(`[Process] Built ${searchIndices.length} search indices`);
    }

    // Return processing result with full text if requested
    return NextResponse.json({
      success: true,
      bookId,
      totalPages: extractionResult.totalPages,
      extractionTime: extractionResult.extractionTime,
      pages: includeText ? extractionResult.pages : extractionResult.pages.map(p => ({
        pageNumber: p.pageNumber,
        wordCount: p.wordCount,
        hasImages: p.hasImages
      })),
      searchIndices: buildIndices ? searchIndices : undefined,
      message: 'PDF processed successfully'
    });

  } catch (error) {
    console.error('Processing error:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to process PDF', error: String(error) },
      { status: 500 }
    );
  }
}
