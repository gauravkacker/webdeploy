// PDF Utilities for getting real page count and metadata

/**
 * Get page count from PDF file (server-side)
 */
export async function getPageCount(pdfPath: string): Promise<number> {
  try {
    // Only use fs on server side
    if (typeof window === 'undefined') {
      const { readFileSync } = require('fs');
      // Read PDF file and try to extract page count
      const buffer = readFileSync(pdfPath);
      const text = buffer.toString('binary');
      
      // Look for /Count entries in PDF structure
      const countMatches = text.match(/\/Count\s+(\d+)/g);
      if (countMatches && countMatches.length > 0) {
        // Get the largest count (usually the total pages)
        const counts = countMatches.map((match: string) => {
          const num = match.match(/\d+/);
          return num ? parseInt(num[0]) : 0;
        });
        const maxCount = Math.max(...counts);
        if (maxCount > 0) {
          return maxCount;
        }
      }
      
      // Fallback: count page objects
      const pageMatches = text.match(/\/Type\s*\/Page[^s]/g);
      if (pageMatches && pageMatches.length > 0) {
        return pageMatches.length;
      }
    }
    
    // Default fallback for client side or when parsing fails
    return 1;
  } catch (error) {
    console.error('Error getting PDF page count:', error);
    return 1;
  }
}

/**
 * Get page count from PDF file using PDF.js
 * This runs in the browser and can access the actual PDF
 */
export async function getPDFPageCount(pdfUrl: string): Promise<number> {
  try {
    // Use PDF.js to get page count
    // For now, we'll use a simple approach with fetch and basic PDF parsing
    const response = await fetch(pdfUrl);
    const arrayBuffer = await response.arrayBuffer();
    
    // Simple PDF page count detection
    // Look for /Count in PDF structure
    const uint8Array = new Uint8Array(arrayBuffer);
    const text = new TextDecoder().decode(uint8Array);
    
    // Find /Count entries in PDF
    const countMatches = text.match(/\/Count\s+(\d+)/g);
    if (countMatches && countMatches.length > 0) {
      // Get the largest count (usually the total pages)
      const counts = countMatches.map(match => {
        const num = match.match(/\d+/);
        return num ? parseInt(num[0]) : 0;
      });
      return Math.max(...counts);
    }
    
    // Fallback: count page objects
    const pageMatches = text.match(/\/Type\s*\/Page[^s]/g);
    if (pageMatches) {
      return pageMatches.length;
    }
    
    // Default fallback
    return 1;
  } catch (error) {
    console.error('Error getting PDF page count:', error);
    return 1;
  }
}

/**
 * Update book with real page count
 */
export async function updateBookPageCount(bookId: string, pdfPath: string) {
  try {
    const pageCount = await getPDFPageCount(`/${pdfPath}`);
    
    // Update book in database
    const { materiaMedicaBookDb } = await import('@/lib/db/database');
    materiaMedicaBookDb.update(bookId, {
      totalPages: pageCount
    });
    
    return pageCount;
  } catch (error) {
    console.error('Error updating book page count:', error);
    return null;
  }
}