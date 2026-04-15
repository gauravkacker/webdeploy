import { NextRequest, NextResponse } from 'next/server';

// Store import progress in memory
const importProgress = new Map<string, {
  status: 'processing' | 'completed' | 'failed';
  progress: number;
  currentPage: number;
  totalPages: number;
  message: string;
  error?: string;
}>();

export async function POST(request: NextRequest) {
  try {
    const { url, bookTitle, author, testMode } = await request.json();

    if (!url) {
      return NextResponse.json(
        { success: false, message: 'URL is required' },
        { status: 400 }
      );
    }

    const bookId = `book-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    // Initialize progress
    importProgress.set(bookId, {
      status: 'processing',
      progress: 0,
      currentPage: 0,
      totalPages: 0,
      message: testMode ? 'Starting test import (30 medicines)...' : 'Starting web import...'
    });

    // Start import in background
    processWebImport(bookId, url, bookTitle, author, testMode).catch(error => {
      console.error(`[Web Import] Error processing ${bookId}:`, error);
      importProgress.set(bookId, {
        status: 'failed',
        progress: 0,
        currentPage: 0,
        totalPages: 0,
        message: 'Import failed',
        error: String(error)
      });
    });

    return NextResponse.json({
      success: true,
      message: testMode ? 'Test import started (30 medicines)' : 'Web import started',
      bookId
    });

  } catch (error) {
    console.error('[Web Import] Error:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to start import', error: String(error) },
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

    const progress = importProgress.get(bookId);

    if (!progress) {
      return NextResponse.json({
        success: false,
        message: 'No import process found'
      }, { status: 404 });
    }

    // If completed, also return the fullText so client can store it
    if (progress.status === 'completed') {
      const { materiaMedicaBookDb } = await import('@/lib/db/database');
      const book = materiaMedicaBookDb.getById(bookId) as any;
      
      return NextResponse.json({
        success: true,
        ...progress,
        fullText: book?.fullText || ''
      });
    }
    
    return NextResponse.json({
      success: true,
      ...progress
    });

  } catch (error) {
    console.error('[Web Import] Error getting status:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to get status', error: String(error) },
      { status: 500 }
    );
  }
}

async function processWebImport(bookId: string, indexUrl: string, bookTitle: string, author: string, testMode: boolean = false) {
  try {
    console.log(`[Web Import] Starting import from ${indexUrl}`);
    
    // Fetch index page (use http instead of https to avoid SSL issues)
    const httpUrl = indexUrl.replace('https://', 'http://');
    console.log(`[Web Import] Fetching index from: ${httpUrl}`);
    const indexResponse = await fetch(httpUrl);
    const indexHtml = await indexResponse.text();
    
    console.log(`[Web Import] Index HTML length: ${indexHtml.length} chars`);
    
    // Step 1: Extract alphabet page links from index (a.htm, b.htm, etc.)
    const alphabetLinkRegex = /<a\s+href="([a-z]\.html?)"/gi;
    const alphabetLinks: string[] = [];
    let match;
    
    while ((match = alphabetLinkRegex.exec(indexHtml)) !== null) {
      alphabetLinks.push(match[1]);
    }
    
    console.log(`[Web Import] Found ${alphabetLinks.length} alphabet pages:`, alphabetLinks);
    
    if (alphabetLinks.length === 0) {
      throw new Error('No alphabet pages found. Website structure may have changed.');
    }
    
    importProgress.set(bookId, {
      status: 'processing',
      progress: 5,
      currentPage: 0,
      totalPages: 0,
      message: `Found ${alphabetLinks.length} alphabet pages, extracting medicine links...`
    });

    const { materiaMedicaBookDb, materiaMedicaBookPageDb, materiaMedicaSearchIndexDb } = await import('@/lib/db/database');
    const { buildSearchIndex } = await import('@/lib/pdf-processor');
    const { countWords } = await import('@/lib/pdf-utils-client');

    const baseUrl = indexUrl.substring(0, indexUrl.lastIndexOf('/') + 1);
    
    // Step 2: For each alphabet page, extract medicine links
    const allMedicineLinks: string[] = [];
    
    for (let i = 0; i < alphabetLinks.length; i++) {
      const alphabetLink = alphabetLinks[i];
      const progress = Math.floor(((i + 1) / alphabetLinks.length) * 10) + 5;
      
      importProgress.set(bookId, {
        status: 'processing',
        progress,
        currentPage: 0,
        totalPages: 0,
        message: `Scanning alphabet page ${i + 1}/${alphabetLinks.length} (${alphabetLink})...`
      });
      
      console.log(`[Web Import] Fetching alphabet page: ${alphabetLink}`);
      
      try {
        const alphabetUrl = baseUrl + alphabetLink;
        const httpAlphabetUrl = alphabetUrl.replace('https://', 'http://');
        const alphabetResponse = await fetch(httpAlphabetUrl);
        const alphabetHtml = await alphabetResponse.text();
        
        // Extract medicine links from this alphabet page
        // Pattern: href="a/abies-c.htm" or href="a/aconite.htm"
        const medicineLinkRegex = /<a\s+href="([a-z]\/[^"]+\.html?)"/gi;
        let medicineMatch;
        
        while ((medicineMatch = medicineLinkRegex.exec(alphabetHtml)) !== null) {
          const medicineLink = medicineMatch[1];
          if (!allMedicineLinks.includes(medicineLink)) {
            allMedicineLinks.push(medicineLink);
          }
        }
        
        console.log(`[Web Import] Found ${allMedicineLinks.length} total medicine links so far`);
        
      } catch (alphabetError) {
        console.error(`[Web Import] Error fetching alphabet page ${alphabetLink}:`, alphabetError);
      }
    }
    
    const totalPages = allMedicineLinks.length;
    
    console.log(`[Web Import] Total medicine pages to import: ${totalPages}`);
    console.log(`[Web Import] Sample medicine links:`, allMedicineLinks.slice(0, 10));
    
    if (totalPages === 0) {
      throw new Error('No medicine pages found. Website structure may have changed.');
    }
    
    // Limit to 30 pages in test mode
    const pagesToImport = testMode ? Math.min(30, totalPages) : totalPages;
    const medicineLinksToProcess = testMode ? allMedicineLinks.slice(0, 30) : allMedicineLinks;
    
    console.log(`[Web Import] ${testMode ? 'TEST MODE: ' : ''}Processing ${pagesToImport} of ${totalPages} pages`);
    
    importProgress.set(bookId, {
      status: 'processing',
      progress: 15,
      currentPage: 0,
      totalPages: pagesToImport,
      message: testMode 
        ? `Test mode: Found ${totalPages} medicines, importing first 30...`
        : `Found ${totalPages} medicine pages, starting extraction...`
    });

    let fullText = '';
    let totalIndices = 0;

    // Step 3: Process each medicine page
    for (let i = 0; i < medicineLinksToProcess.length; i++) {
      const medicineLink = medicineLinksToProcess[i];
      const pageNum = i + 1;
      const progress = Math.floor(((i + 1) / pagesToImport) * 80) + 15;

      importProgress.set(bookId, {
        status: 'processing',
        progress,
        currentPage: pageNum,
        totalPages: pagesToImport,
        message: testMode 
          ? `Test mode: Processing medicine ${pageNum} of ${pagesToImport}...`
          : `Processing medicine ${pageNum} of ${pagesToImport}...`
      });

      console.log(`[Web Import] Processing ${medicineLink} (${pageNum}/${pagesToImport})`);

      try {
        const medicineUrl = baseUrl + medicineLink;
        const httpMedicineUrl = medicineUrl.replace('https://', 'http://');
        const medicineResponse = await fetch(httpMedicineUrl);
        const medicineHtml = await medicineResponse.text();

        // Extract medicine name from HTML - look for the FULL name
        let medicineName = '';
        
        // Strategy 1: Look for pattern where short name is followed by full name
        // Example: <h2>ABROT</h2> followed by text containing "ABROTANUM"
        // The full name is usually in the first paragraph or right after the heading
        
        // First, extract the body content to work with
        const bodyMatch = medicineHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
        const workingHtml = bodyMatch ? bodyMatch[1] : medicineHtml;
        
        // Try to find heading followed by full name in next 500 chars
        const headingAndTextMatch = workingHtml.match(/<h[1-3][^>]*>([^<]+)<\/h[1-3]>([\s\S]{0,500})/i);
        
        if (headingAndTextMatch) {
          const shortName = headingAndTextMatch[1].replace(/<[^>]+>/g, '').trim();
          const followingText = headingAndTextMatch[2].replace(/<[^>]+>/g, '');
          
          // Look for a longer capitalized word that starts with same letter(s) as short name
          const firstLetter = shortName.charAt(0).toUpperCase();
          const fullNameRegex = new RegExp(`\\b(${firstLetter}[A-Z\\-]+)\\b`, 'i');
          const fullNameMatch = followingText.match(fullNameRegex);
          
          if (fullNameMatch && fullNameMatch[1].length > shortName.length) {
            medicineName = fullNameMatch[1].toUpperCase();
            console.log(`[Web Import] Extracted full name: ${medicineName} (from short: ${shortName})`);
          } else {
            medicineName = shortName;
          }
        }
        
        // Strategy 2: If not found, try heading tags directly
        if (!medicineName) {
          const h1Match = medicineHtml.match(/<h1[^>]*>(.*?)<\/h1>/i);
          const h2Match = medicineHtml.match(/<h2[^>]*>(.*?)<\/h2>/i);
          const h3Match = medicineHtml.match(/<h3[^>]*>(.*?)<\/h3>/i);
          
          if (h1Match) {
            medicineName = h1Match[1].replace(/<[^>]+>/g, '').trim();
          } else if (h2Match) {
            medicineName = h2Match[1].replace(/<[^>]+>/g, '').trim();
          } else if (h3Match) {
            medicineName = h3Match[1].replace(/<[^>]+>/g, '').trim();
          }
        }
        
        // Strategy 3: Fallback to URL-based name
        if (!medicineName) {
          medicineName = medicineLink
            .split('/')[1]
            .replace(/\.html?$/, '')
            .replace(/-/g, ' ')
            .toUpperCase();
        }
        
        // Clean up the medicine name
        medicineName = medicineName
          .replace(/\s+/g, ' ')
          .replace(/[^\w\s\-]/g, '')
          .trim();
        
        console.log(`[Web Import] Medicine ${pageNum}: ${medicineName}`);

        // Extract medicine content (skip headers, footers, copyright)
        const content = extractMedicineContent(medicineHtml);
        
        if (content && content.length > 50) { // Only store if meaningful content
          // Prepend medicine name as title if not already present
          let medicineContent = content;
          if (!content.match(/^##TITLE##/)) {
            medicineContent = `##TITLE##${medicineName}##TITLE##\n\n${content}`;
          }
          
          fullText += medicineContent + '\n\n##PAGE_BREAK##\n\n';

          // Store page
          materiaMedicaBookPageDb.create({
            bookId,
            pageNumber: pageNum,
            text: medicineContent,
            wordCount: countWords(medicineContent),
            hasImages: false,
            medicineName: medicineName, // Store medicine name for index
            bookTitle: bookTitle || 'Imported Book', // Add book title for AI search
            bookAuthor: author || 'Unknown' // Add author for AI search
          });

          // Build search indices
          const pageIndices = buildSearchIndex(bookId, pageNum, medicineContent);
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

      } catch (pageError) {
        console.error(`[Web Import] Error on page ${pageNum}:`, pageError);
      }
    }

    // Create book record
    materiaMedicaBookDb.create({
      id: bookId,
      title: bookTitle || 'Imported Book',
      author: author || 'Unknown',
      filePath: '',
      fileSize: 0,
      totalPages: pagesToImport,
      uploadDate: new Date().toISOString(),
      processingStatus: 'completed',
      indexStatus: 'indexed',
      fullText: fullText.trim()
    });

    importProgress.set(bookId, {
      status: 'completed',
      progress: 100,
      currentPage: pagesToImport,
      totalPages: pagesToImport,
      message: testMode 
        ? `Test import completed! ${pagesToImport} medicines with ${totalIndices} searchable terms.`
        : `Import completed! ${pagesToImport} medicines with ${totalIndices} searchable terms.`
    });

    console.log(`[Web Import] Completed - ${pagesToImport} pages, ${totalIndices} indices${testMode ? ' (TEST MODE)' : ''}`);

  } catch (error) {
    console.error(`[Web Import] Fatal error:`, error);
    throw error;
  }
}

function extractMedicineContent(html: string): string {
  // Remove HTML tags but preserve structure with markdown-like formatting
  let text = html;
  
  // Remove script and style tags
  text = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  
  // Extract body content
  const bodyMatch = text.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (bodyMatch) {
    text = bodyMatch[1];
  }
  
  // Remove navigation, headers, footers
  text = text.replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '');
  text = text.replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '');
  text = text.replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '');
  
  // Remove common page headers (book title, author, etc.)
  text = text.replace(/HOM.*?OPATHIC MATERIA MEDICA/gi, '');
  text = text.replace(/by William BOERICKE.*?M\.D\./gi, '');
  text = text.replace(/Presented by M.*?di-T/gi, '');
  text = text.replace(/Presented by Médi-T/gi, '');
  
  // Remove common footer/copyright patterns
  text = text.replace(/Copyright.*?<\/p>/gi, '');
  text = text.replace(/©.*?<\/p>/gi, '');
  
  // Remove navigation links (but keep content links)
  text = text.replace(/<a\s+href="\.\.\/[^"]*"[^>]*>.*?<\/a>/gi, ''); // Parent directory links
  text = text.replace(/<a\s+href="index\.html?"[^>]*>.*?<\/a>/gi, ''); // Index links
  
  // Convert headings to markdown-style with special markers
  text = text.replace(/<h1[^>]*>(.*?)<\/h1>/gi, '\n\n##TITLE##$1##TITLE##\n\n');
  text = text.replace(/<h2[^>]*>(.*?)<\/h2>/gi, '\n\n##HEADING##$1##HEADING##\n\n');
  text = text.replace(/<h3[^>]*>(.*?)<\/h3>/gi, '\n\n##SUBHEADING##$1##SUBHEADING##\n\n');
  text = text.replace(/<h[4-6][^>]*>(.*?)<\/h[4-6]>/gi, '\n\n##MINOR##$1##MINOR##\n\n');
  
  // Also detect bold section headings (common pattern: <b>MIND</b> or <strong>Head</strong>)
  // These are often section markers in materia medica
  const sectionKeywords = ['MIND', 'HEAD', 'EYES', 'EARS', 'NOSE', 'FACE', 'MOUTH', 'THROAT', 
                          'STOMACH', 'ABDOMEN', 'RECTUM', 'STOOL', 'URINARY', 'MALE', 'FEMALE',
                          'RESPIRATORY', 'CHEST', 'HEART', 'BACK', 'EXTREMITIES', 'SKIN', 'SLEEP',
                          'FEVER', 'GENERALITIES', 'MODALITIES', 'WORSE', 'BETTER', 'RELATIONS',
                          'DOSE', 'CLINICAL', 'COMPARE', 'COMPLEMENTARY', 'ANTIDOTES'];
  
  for (const section of sectionKeywords) {
    // Match bold/strong tags with section names (case insensitive)
    const boldRegex = new RegExp(`<(b|strong)[^>]*>\\s*${section}\\s*[:\\.]*\\s*<\\/\\1>`, 'gi');
    text = text.replace(boldRegex, `\n\n##HEADING##${section}##HEADING##\n\n`);
    
    // Also match section names that appear at start of line in bold
    const lineStartRegex = new RegExp(`^\\s*<(b|strong)[^>]*>\\s*${section}\\s*[:\\.]*\\s*<\\/\\1>`, 'gim');
    text = text.replace(lineStartRegex, `\n\n##HEADING##${section}##HEADING##\n\n`);
  }
  
  // Also detect section patterns like "Mind.--" or "Head:--" (common in Boericke)
  text = text.replace(/<(b|strong)[^>]*>\s*([A-Z][a-z]+)\s*[:\.]--/gi, '\n\n##HEADING##$2##HEADING##\n\n');
  
  // Convert bold and italic
  text = text.replace(/<(strong|b)[^>]*>(.*?)<\/\1>/gi, '**$2**');
  text = text.replace(/<(em|i)[^>]*>(.*?)<\/\1>/gi, '*$2*');
  
  // Convert lists
  text = text.replace(/<ul[^>]*>/gi, '\n');
  text = text.replace(/<\/ul>/gi, '\n');
  text = text.replace(/<ol[^>]*>/gi, '\n');
  text = text.replace(/<\/ol>/gi, '\n');
  text = text.replace(/<li[^>]*>(.*?)<\/li>/gi, '• $1\n');
  
  // Preserve line breaks and paragraphs
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<\/p>/gi, '\n\n');
  text = text.replace(/<p[^>]*>/gi, '');
  text = text.replace(/<\/div>/gi, '\n');
  text = text.replace(/<div[^>]*>/gi, '');
  
  // Remove horizontal rules
  text = text.replace(/<hr[^>]*>/gi, '\n---\n');
  
  // Remove remaining HTML tags
  text = text.replace(/<[^>]+>/g, '');
  
  // Decode HTML entities
  text = text.replace(/&nbsp;/g, ' ');
  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&apos;/g, "'");
  
  // Decode numeric entities
  text = text.replace(/&#(\d+);/g, (match, dec) => String.fromCharCode(dec));
  text = text.replace(/&#x([0-9a-f]+);/gi, (match, hex) => String.fromCharCode(parseInt(hex, 16)));
  
  // Fix common special characters that appear as � or wrong encoding
  text = text.replace(/�/g, 'œ'); // Default to œ for unknown chars
  text = text.replace(/Hyper�mia/gi, 'Hyperæmia');
  text = text.replace(/an�sthetic/gi, 'anæsthetic');
  text = text.replace(/�dematous/gi, 'œdematous');
  text = text.replace(/Hom�opathic/gi, 'Homœopathic');
  text = text.replace(/M�di-T/gi, 'Médi-T');
  
  // Common Latin/medical character replacements
  const charMap: { [key: string]: string } = {
    'Ã¦': 'æ',
    'Ã©': 'é',
    'Ã¨': 'è',
    'Ã«': 'ë',
    'Ã´': 'ô',
    'Ã¢': 'â',
    'Ã§': 'ç',
    'Ã¼': 'ü',
    'Ã¶': 'ö',
    'Ã': 'œ'
  };
  
  for (const [wrong, correct] of Object.entries(charMap)) {
    text = text.replace(new RegExp(wrong, 'g'), correct);
  }
  
  // Remove other unknown entities
  text = text.replace(/&[a-z]+;/gi, '');
  
  // Clean up whitespace
  text = text.replace(/[ \t]+/g, ' '); // Multiple spaces to single space
  text = text.replace(/\n\s+/g, '\n'); // Remove spaces at start of lines
  text = text.replace(/\n{3,}/g, '\n\n'); // Max 2 consecutive newlines
  text = text.trim();
  
  return text;
}
