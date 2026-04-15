import { NextRequest, NextResponse } from 'next/server';
import { generateSimpleEmbedding, findSimilarChunks, generateBookEmbeddings } from '@/lib/embeddings';
import { generateNotebookLMResponse, checkOllamaHealth, DEFAULT_OLLAMA_CONFIG } from '@/lib/ollama-integration';

export async function POST(request: NextRequest) {
  try {
    const { query, ollamaUrl = DEFAULT_OLLAMA_CONFIG.baseUrl, ollamaModel = DEFAULT_OLLAMA_CONFIG.model } = await request.json();

    if (!query || query.trim().length === 0) {
      return NextResponse.json(
        { success: false, message: 'Query is required' },
        { status: 400 }
      );
    }

    console.log(`[Semantic Search] Query: "${query}"`);

    // Check if Ollama is running
    const ollamaHealthy = await checkOllamaHealth(ollamaUrl);
    if (!ollamaHealthy) {
      return NextResponse.json(
        {
          success: false,
          message: 'Ollama is not running',
          details: `Cannot connect to Ollama at ${ollamaUrl}. Please ensure Ollama is installed and running.`,
          ollamaUrl
        },
        { status: 503 }
      );
    }

    // Get all books from database
    const { materiaMedicaBookDb } = await import('@/lib/db/database');
    const allBooks = materiaMedicaBookDb.getAll();

    if (allBooks.length === 0) {
      return NextResponse.json({
        success: true,
        results: [],
        interpretation: 'No books available',
        answer: 'No books have been uploaded yet. Please upload books first.',
        suggestedMedicines: [],
        recommendations: 'Upload books to your library',
        aiPowered: false,
        provider: 'ollama'
      });
    }

    // Generate embeddings for query
    const queryEmbedding = generateSimpleEmbedding(query);
    console.log(`[Semantic Search] Generated query embedding`);

    // Collect all chunks from all books
    const allChunks: any[] = [];
    for (const book of allBooks) {
      const bookData = book as any;
      if (!bookData.fullText) continue;

      const chunks = generateBookEmbeddings(bookData.id, bookData.title, bookData.fullText);
      allChunks.push(...chunks);
    }

    console.log(`[Semantic Search] Generated ${allChunks.length} chunks from ${allBooks.length} books`);

    if (allChunks.length === 0) {
      return NextResponse.json({
        success: true,
        results: [],
        interpretation: 'No content to search',
        answer: 'Books have been uploaded but no content could be extracted. Please ensure books are properly processed.',
        suggestedMedicines: [],
        recommendations: 'Process your books first',
        aiPowered: false,
        provider: 'ollama'
      });
    }

    // Find similar chunks using embeddings
    const similarChunks = findSimilarChunks(queryEmbedding, allChunks, 15, 0.2);
    console.log(`[Semantic Search] Found ${similarChunks.length} similar chunks`);

    if (similarChunks.length === 0) {
      return NextResponse.json({
        success: true,
        results: [],
        interpretation: 'No matching content found',
        answer: 'No relevant content found in your books for this query. Try different search terms.',
        suggestedMedicines: [],
        recommendations: 'Try searching with different keywords',
        aiPowered: false,
        provider: 'ollama'
      });
    }

    // Generate response using Ollama
    console.log(`[Semantic Search] Generating response with Ollama...`);
    const answer = await generateNotebookLMResponse(query, similarChunks, {
      baseUrl: ollamaUrl,
      model: ollamaModel
    });

    // Extract medicines from answer (simple extraction)
    const medicineMatches = answer.match(/\*\*([^*]+)\*\*/g) || [];
    const suggestedMedicines = medicineMatches.map(m => m.replace(/\*\*/g, ''));

    // Build results from similar chunks
    const results = similarChunks.slice(0, 5).map((chunk, idx) => ({
      bookId: chunk.medicineId,
      bookTitle: chunk.medicineName,
      sectionName: chunk.sectionName,
      pageNumber: chunk.chunkIndex,
      snippet: chunk.text.substring(0, 300) + '...',
      relevanceScore: 100 - (idx * 10),
      matchCount: 1
    }));

    return NextResponse.json({
      success: true,
      results,
      interpretation: `Found ${similarChunks.length} relevant sections`,
      answer,
      suggestedMedicines: [...new Set(suggestedMedicines)],
      recommendations: 'Based on semantic analysis of your books',
      aiPowered: true,
      provider: 'ollama',
      model: ollamaModel,
      chunksAnalyzed: similarChunks.length
    });
  } catch (error) {
    console.error('[Semantic Search] Error:', error);
    return NextResponse.json(
      {
        success: false,
        message: 'Semantic search failed',
        error: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}
