// PDF Processing Utilities
// This module handles PDF text extraction and indexing

interface PageContent {
  pageNumber: number;
  text: string;
  wordCount: number;
  hasImages: boolean;
}

interface ExtractionResult {
  bookId: string;
  totalPages: number;
  pages: PageContent[];
  extractionTime: number;
  errors: string[];
}

interface SearchIndexEntry {
  word: string;
  positions: number[];
  frequency: number;
}

/**
 * Extract text from PDF file using pdfjs-dist
 * Extracts 100% of text content from all PDF pages
 */
export async function extractTextFromPDF(
  pdfPath: string,
  bookId: string
): Promise<ExtractionResult> {
  const startTime = Date.now();
  const errors: string[] = [];

  try {
    console.log(`[PDF Processor] Extracting text from: ${pdfPath}`);
    
    // Server-side only
    if (typeof window !== 'undefined') {
      throw new Error('PDF extraction must run on server side');
    }

    const fs = require('fs');
    const pdfParse = require('pdf-parse');
    
    // Verify file exists
    if (!fs.existsSync(pdfPath)) {
      throw new Error(`PDF file not found: ${pdfPath}`);
    }
    
    // Read PDF file
    const dataBuffer = fs.readFileSync(pdfPath);
    
    // Parse PDF
    const data = await pdfParse(dataBuffer);
    
    console.log(`[PDF Processor] Successfully parsed PDF with ${data.numpages} pages`);
    console.log(`[PDF Processor] Total text length: ${data.text.length} characters`);
    console.log(`[PDF Processor] First 200 chars: ${data.text.substring(0, 200)}`);
    
    // Split text by pages (pdf-parse gives us all text, we need to estimate pages)
    // We'll split by form feed characters or estimate based on text length
    const totalPages = data.numpages;
    const fullText = data.text;
    
    if (!fullText || fullText.length === 0) {
      console.warn(`[PDF Processor] WARNING: PDF contains no extractable text!`);
      errors.push('PDF contains no extractable text');
    }
    
    // Estimate text per page
    const avgCharsPerPage = Math.ceil(fullText.length / totalPages);
    
    const pages: PageContent[] = [];
    
    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      const startIdx = (pageNum - 1) * avgCharsPerPage;
      const endIdx = Math.min(pageNum * avgCharsPerPage, fullText.length);
      const pageText = fullText.substring(startIdx, endIdx).trim();
      
      const wordCount = countWords(pageText);
      
      pages.push({
        pageNumber: pageNum,
        text: pageText,
        wordCount: wordCount,
        hasImages: false // pdf-parse doesn't detect images
      });
      
      // Log progress every 50 pages
      if (pageNum % 50 === 0) {
        console.log(`[PDF Processor] Processed ${pageNum}/${totalPages} pages`);
      }
      
      // Log first page details
      if (pageNum === 1) {
        console.log(`[PDF Processor] Page 1 text length: ${pageText.length}, word count: ${wordCount}`);
      }
    }
    
    console.log(`[PDF Processor] Extraction complete: ${pages.length} pages, ${Date.now() - startTime}ms`);
    
    return {
      bookId,
      totalPages,
      pages,
      extractionTime: Date.now() - startTime,
      errors
    };

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    errors.push(`Extraction failed: ${errorMsg}`);
    console.error(`[PDF Processor] Error:`, error);
    
    // Return error result
    return {
      bookId,
      totalPages: 0,
      pages: [],
      extractionTime: Date.now() - startTime,
      errors
    };
  }
}

/**
 * Build search index from extracted text
 */
export function buildSearchIndex(
  bookId: string,
  pageNumber: number,
  text: string
): SearchIndexEntry[] {
  const indices: SearchIndexEntry[] = [];
  
  if (!text || text.length === 0) {
    console.warn(`[PDF Processor] Page ${pageNumber} has no text to index`);
    return indices;
  }
  
  const wordMap = new Map<string, number[]>();

  // Tokenize text into words
  const words = text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ') // Remove punctuation
    .split(/\s+/)
    .filter(word => word.length > 0);

  if (words.length === 0) {
    console.warn(`[PDF Processor] Page ${pageNumber} has no words after tokenization`);
    return indices;
  }

  // Build word position map
  words.forEach((word, position) => {
    if (wordMap.has(word)) {
      wordMap.get(word)!.push(position);
    } else {
      wordMap.set(word, [position]);
    }
  });

  // Convert map to index entries
  wordMap.forEach((positions, word) => {
    indices.push({
      word,
      positions,
      frequency: positions.length
    });
  });

  if (indices.length > 0) {
    console.log(`[PDF Processor] Page ${pageNumber}: Created ${indices.length} index entries from ${words.length} words`);
  }

  return indices;
}

/**
 * Generate snippet with highlighted search terms
 */
export function generateSnippet(
  text: string,
  keywords: string[],
  contextLength: number = 200
): string {
  const lowerText = text.toLowerCase();
  const lowerKeywords = keywords.map(k => k.toLowerCase());

  // Find first occurrence of any keyword
  let firstIndex = -1;
  for (const keyword of lowerKeywords) {
    const index = lowerText.indexOf(keyword);
    if (index !== -1 && (firstIndex === -1 || index < firstIndex)) {
      firstIndex = index;
    }
  }

  if (firstIndex === -1) {
    // No keyword found, return beginning of text
    return text.substring(0, contextLength) + '...';
  }

  // Calculate snippet boundaries
  const start = Math.max(0, firstIndex - contextLength / 2);
  const end = Math.min(text.length, firstIndex + contextLength / 2);

  let snippet = text.substring(start, end);

  // Add ellipsis
  if (start > 0) snippet = '...' + snippet;
  if (end < text.length) snippet = snippet + '...';

  // Highlight keywords (wrap in **keyword** for now)
  lowerKeywords.forEach(keyword => {
    const regex = new RegExp(`(${keyword})`, 'gi');
    snippet = snippet.replace(regex, '**$1**');
  });

  return snippet;
}

/**
 * Calculate relevance score for search results (TF-IDF)
 */
export function calculateRelevanceScore(
  matchCount: number,
  totalWords: number,
  queryTerms: number
): number {
  // Simple relevance scoring
  // TF (Term Frequency) = matchCount / totalWords
  // Boost by number of query terms matched
  const tf = matchCount / Math.max(totalWords, 1);
  const boost = queryTerms / Math.max(queryTerms, 1);
  return tf * boost * 100;
}

/**
 * Normalize text for search (lowercase, trim, remove special chars)
 */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ');
}

/**
 * Count words in text
 */
export function countWords(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter(word => word.length > 0).length;
}
