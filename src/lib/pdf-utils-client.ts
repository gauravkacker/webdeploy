// Client-safe PDF utility functions
// These functions can be used on both client and server

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
