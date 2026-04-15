import { NextRequest, NextResponse } from 'next/server';

// AI Search API Route - Supports Groq, Hugging Face, Ollama, and Google Gemini providers
export async function POST(request: NextRequest) {
  try {
    const { 
      query, 
      books, 
      provider = 'groq',
      apiKey,
      groqModel = 'llama-3.3-70b-versatile',
      huggingfaceApiKey, 
      huggingfaceModel = 'meta-llama/Meta-Llama-3-8B-Instruct',
      ollamaUrl = 'http://localhost:11434',
      ollamaModel = 'llama3',
      geminiApiKey,
      geminiModel = 'gemini-2.5-flash-lite',
      researchMode = false
    } = await request.json();

    if (!query || query.trim().length === 0) {
      return NextResponse.json(
        { success: false, message: 'Query is required' },
        { status: 400 }
      );
    }

    if (!books || books.length === 0) {
      return NextResponse.json({
        success: true,
        results: [],
        interpretation: 'No books available to search.',
        message: 'Please upload books first.'
      });
    }

    console.log(`[AI Search] Processing query: "${query}" across ${books.length} books using ${provider}${researchMode ? ' (Research Mode)' : ''}`);

    // Use ONLY the selected provider - no automatic fallback
    console.log(`[AI Search] Using provider: ${provider}`);
    
    let result;
    if (provider === 'huggingface') {
      result = await searchWithHuggingFace(query, books, huggingfaceApiKey, huggingfaceModel, researchMode, apiKey, groqModel);
    } else if (provider === 'ollama') {
      result = await searchWithOllama(query, books, ollamaUrl, ollamaModel, researchMode);
    } else if (provider === 'gemini') {
      result = await searchWithGemini(query, books, geminiApiKey, geminiModel, researchMode);
    } else {
      result = await searchWithGroq(query, books, apiKey, groqModel, researchMode);
    }
    
    console.log(`[AI Search] Success with provider: ${provider}`);
    return result;
  } catch (error) {
    console.error('[AI Search] Error in POST handler:', error);
    console.error('[AI Search] Error details:', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : 'N/A',
      type: typeof error
    });
    
    // Try to get provider from the original request
    const body = await request.json().catch(() => ({ provider: 'unknown' }));
    
    return NextResponse.json(
      { 
        success: false, 
        message: 'AI search failed', 
        error: error instanceof Error ? error.message : String(error),
        provider: body.provider || 'unknown'
      },
      { status: 500 }
    );
  }
}

// Search with Ollama (local AI)
async function searchWithOllama(query: string, books: any[], ollamaUrl: string, model: string, researchMode: boolean = false) {
  try {
    console.log(`[AI Search] Using Ollama at ${ollamaUrl} with model: ${model}${researchMode ? ' (Research Mode)' : ''}`);
    
    // Step 1: Find relevant pages
    const { relevantPages, queryWords } = await findRelevantPages(query, books);
    console.log(`[AI Search] Found ${relevantPages.length} pages for AI analysis`);
    
    // Check if we have any pages at all
    if (relevantPages.length === 0) {
      console.log('[AI Search] No pages found in database - books may not be processed yet');
      console.log('[AI Search] Books passed to search:', books.map((b: any) => ({
        id: b.id,
        title: b.title,
        hasFullText: !!b.fullText,
        fullTextLength: b.fullText ? b.fullText.length : 0,
        hasPages: !!b.pages
      })));
      return NextResponse.json({
        success: true,
        results: [],
        interpretation: 'Books Not Processed',
        answer: 'The books in your library have not been processed yet. Please click the "Fix Search" button in the library to extract and index the book content. This will make the books searchable with AI.',
        suggestedMedicines: [],
        recommendations: 'Click "Fix Search" button to process your books',
        aiPowered: false,
        provider: 'ollama',
        message: 'Books need to be processed first'
      });
    }
    
    // Step 2: Prepare context with relevant pages - balance comprehensiveness with request size
    // Ollama has no token limits but requests have size limits, so we chunk intelligently
    // Start with top 30 pages, then add more if context is small enough
    let maxPages = Math.min(30, relevantPages.length);
    let contextPages = relevantPages.slice(0, maxPages);
    let bookContext = contextPages.map((page: any) => {
      // Use up to 2000 chars per page to keep request manageable
      const pageText = page.text.substring(0, 2000);
      return `[${page.bookTitle} - Page ${page.pageNumber}]\n${pageText}`;
    }).join('\n\n---\n\n');

    // If context is small enough, add more pages
    if (bookContext.length < 50000 && relevantPages.length > maxPages) {
      maxPages = Math.min(60, relevantPages.length);
      contextPages = relevantPages.slice(0, maxPages);
      bookContext = contextPages.map((page: any) => {
        const pageText = page.text.substring(0, 2000);
        return `[${page.bookTitle} - Page ${page.pageNumber}]\n${pageText}`;
      }).join('\n\n---\n\n');
    }

    // If still small, add even more
    if (bookContext.length < 80000 && relevantPages.length > maxPages) {
      maxPages = Math.min(100, relevantPages.length);
      contextPages = relevantPages.slice(0, maxPages);
      bookContext = contextPages.map((page: any) => {
        const pageText = page.text.substring(0, 2000);
        return `[${page.bookTitle} - Page ${page.pageNumber}]\n${pageText}`;
      }).join('\n\n---\n\n');
    }

    console.log(`[AI Search] Prepared context with ${contextPages.length} pages, total length: ${bookContext.length} chars`);

    // Step 3: Call Ollama API with simplified prompt
    const response = await fetch(`${ollamaUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model,
        prompt: `You are a homeopathy expert. Analyze these book excerpts and provide a structured analysis.

Excerpts:
${bookContext}

Query: ${query}

Format your response as:

**Morning Symptoms**
- **Medicine Name**: Specific symptoms, timing, characteristics

**Evening Symptoms**
- **Medicine Name**: Specific symptoms, timing, characteristics

**Night Symptoms**
- **Medicine Name**: Specific symptoms, timing, characteristics

**Clinical Notes**
Differentiating features between medicines.

Include 8-15 medicines. Use exact names from excerpts. Organize by symptom timing.`,
        stream: false,
        options: {
          temperature: 0.2,
          num_predict: 4000,
          top_k: 40,
          top_p: 0.9
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[AI Search] Ollama API error response:', errorText);
      console.error('[AI Search] Request size:', bookContext.length, 'chars');
      console.error('[AI Search] Pages sent:', contextPages.length);
      
      // Provide helpful error messages based on status code
      let errorMessage = `Ollama API error: ${response.status} ${response.statusText}`;
      
      if (response.status === 400) {
        errorMessage = `Request too large (${bookContext.length} chars). Try searching with fewer pages or shorter query. Error: ${errorText}`;
      } else if (response.status === 404) {
        errorMessage = `Model "${model}" not found on Ollama. Make sure:\n1. The model name is correct (e.g., "gpt-oss:20b-cloud" for cloud models)\n2. For cloud models: Sign in with "ollama signin" in the Ollama app\n3. For local models: Run "ollama pull ${model}" first`;
      } else if (response.status === 500) {
        errorMessage = `Ollama server error. The model might be loading or there's a server issue. Try again in a moment.`;
      } else if (response.status === 503) {
        errorMessage = `Ollama service unavailable. Make sure the Ollama app is running.`;
      }
      
      throw new Error(errorMessage);
    }

    const ollamaData = await response.json();
    const aiResponse = ollamaData.response;
    
    console.log('[AI Search] Ollama raw response length:', aiResponse?.length || 0);
    console.log('[AI Search] Ollama raw response (first 500 chars):', aiResponse?.substring(0, 500));
    
    // Parse the structured text response from Ollama
    let parsedResponse: any;
    
    if (!aiResponse || aiResponse.trim().length === 0) {
      console.error('[AI Search] Empty response from Ollama');
      parsedResponse = {
        interpretation: `Analysis of: ${query}`,
        answer: 'Unable to generate analysis - empty response from model',
        medicines: [],
        recommendations: 'Try again or check Ollama model status'
      };
    } else {
      // Extract medicines from the response (look for common homeopathic medicine names)
      const medicineNames = ['aconite', 'aconitum', 'arnica', 'arsenicum', 'belladonna', 'bryonia', 'calcarea', 'carbo', 'chamomilla', 'china', 'colocynthis', 'gelsemium', 'hepar', 'ignatia', 'ipecac', 'kali', 'lachesis', 'lycopodium', 'mercurius', 'natrum', 'nux', 'phosphorus', 'pulsatilla', 'rhus', 'sepia', 'silica', 'sulphur', 'thuja', 'veratrum'];
      const foundMedicines: string[] = [];
      const lowerResponse = aiResponse.toLowerCase();
      
      for (const medicine of medicineNames) {
        if (lowerResponse.includes(medicine)) {
          foundMedicines.push(medicine);
        }
      }
      
      // Extract clinical interpretation from the response
      let interpretation = `Analysis of: ${query}`;
      const lines = aiResponse.split('\n');
      for (const line of lines) {
        if (line.includes('Clinical Notes') || line.includes('clinical')) {
          interpretation = line.replace(/\*\*/g, '').substring(0, 100);
          break;
        }
      }
      
      parsedResponse = {
        interpretation: interpretation,
        answer: aiResponse,
        medicines: foundMedicines,
        recommendations: 'Based on the analysis above'
      };
    }

    // Get source citations from the context pages (not by searching keywords)
    const results = contextPages.map((page: any, idx: number) => ({
      bookId: page.bookId,
      bookTitle: page.bookTitle,
      bookAuthor: page.bookAuthor,
      pageNumber: page.pageNumber,
      snippet: page.text.substring(0, 300) + '...',
      relevanceScore: 100 - (idx * 5), // Higher score for earlier pages
      matchCount: 1
    }));

    return NextResponse.json({
      success: true,
      results: results.slice(0, 3),
      interpretation: parsedResponse.interpretation || `Searching for: ${query}`,
      answer: parsedResponse.answer,
      suggestedMedicines: parsedResponse.medicines || [],
      recommendations: parsedResponse.recommendations,
      aiPowered: true,
      provider: 'ollama',
      model: model
    });

  } catch (error) {
    console.error('[AI Search] Ollama error:', error);
    console.error('[AI Search] Error type:', error instanceof Error ? error.message : String(error));
    console.error('[AI Search] Stack:', error instanceof Error ? error.stack : 'N/A');
    throw error;
  }
}

// Search with Hugging Face (cloud AI)
async function searchWithHuggingFace(query: string, books: any[], apiKey?: string, model?: string, researchMode: boolean = false, groqApiKey?: string, groqModel: string = 'llama-3.3-70b-versatile') {
  const hfApiKey = apiKey || process.env.HUGGINGFACE_API_KEY;
  const hfModel = model || 'meta-llama/Meta-Llama-3-8B-Instruct';
    
  if (!hfApiKey) {
    console.warn('[AI Search] Hugging Face API key not configured, falling back to keyword search');
    return fallbackKeywordSearch(query, books);
  }

  try {
    console.log(`[AI Search] Using Hugging Face with model: ${hfModel}${researchMode ? ' (Research Mode)' : ''}`);
    
    // Step 1: Find relevant pages
    const { relevantPages, queryWords } = await findRelevantPages(query, books);
    console.log(`[AI Search] Found ${relevantPages.length} pages for AI analysis`);
    
    // Check if we have any pages at all
    if (relevantPages.length === 0) {
      console.log('[AI Search] No pages found in database - books may not be processed yet');
      console.log('[AI Search] Books passed to search:', books.map((b: any) => ({
        id: b.id,
        title: b.title,
        hasFullText: !!b.fullText,
        fullTextLength: b.fullText ? b.fullText.length : 0,
        hasPages: !!b.pages
      })));
      return NextResponse.json({
        success: true,
        results: [],
        interpretation: 'Books Not Processed',
        answer: 'The books in your library have not been processed yet. Please click the "Fix Search" button in the library to extract and index the book content. This will make the books searchable with AI.',
        suggestedMedicines: [],
        recommendations: 'Click "Fix Search" button to process your books',
        aiPowered: false,
        provider: 'huggingface',
        message: 'Books need to be processed first'
      });
    }
    
    // Step 2: Prepare context with more pages for comprehensive analysis
    const maxPages = researchMode ? 50 : 30; // Increased to search entire book
    const contextPages = relevantPages.slice(0, maxPages);
    const bookContext = contextPages.map((page: any) => {
      return `[${page.bookTitle} - Page ${page.pageNumber}]\n${page.text.substring(0, 2000)}...`;
    }).join('\n\n---\n\n');

    console.log(`[AI Search] Prepared context with ${contextPages.length} pages, total length: ${bookContext.length} chars`);

    // Improved prompt for detailed, structured responses like NotebookLM
    const systemPrompt = `You are a homeopathy expert assistant helping doctors find remedies in materia medica books.

You will be provided with relevant excerpts from materia medica books.

Your task is to provide a COMPREHENSIVE, WELL-STRUCTURED answer similar to a professional medical reference.

RESPONSE FORMAT:
1. Start with a brief introduction sentence
2. Organize information into CLEAR CATEGORIES (use headings like "Morning Fevers", "Afternoon Symptoms", "Night Aggravations", etc.)
3. For EACH medicine mentioned:
   - Medicine name in bold
   - Specific symptoms and characteristics
   - Timing/modalities (when symptoms occur or worsen)
   - Key differentiating features
4. End with clinical notes about selection criteria

STRUCTURE EXAMPLE:
"According to the homeopathic source material, several remedies are identified for [condition].

**Category 1 (e.g., Morning Symptoms)**
- **Medicine A**: Specific symptom details, timing (e.g., 9 A.M. to 11 A.M.), key characteristics.
- **Medicine B**: Specific symptom details, timing, key characteristics.

**Category 2 (e.g., Evening Symptoms)**
- **Medicine C**: Specific symptom details, timing, key characteristics.

**Clinical Notes**
The selection should consider concomitant symptoms and modalities. For instance, Medicine A is chosen when [specific condition], whereas Medicine B is selected if [different condition]."

IMPORTANT RULES:
- Base answer ONLY on the provided book excerpts
- Include specific details (times, symptoms, modalities)
- Organize by logical categories (time of day, symptom type, severity, etc.)
- Use medicine names from the excerpts
- Provide comparative analysis between similar medicines
- Include 8-15 medicines if available in the excerpts
- Make it detailed and professional like a medical textbook

Respond in JSON format:
{
  "interpretation": "Brief clinical interpretation of the query",
  "answer": "COMPREHENSIVE, WELL-STRUCTURED answer with categories, medicine details, and clinical notes (minimum 300 words)",
  "keywords": ["keyword1", "keyword2", ...],
  "medicines": ["medicine1", "medicine2", ...],
  "recommendations": "Clinical selection criteria and differential diagnosis notes"
}`;

    const prompt = `${systemPrompt}

Query: ${query}

Relevant excerpts from materia medica books:

${bookContext}`;

    const response = await fetch(`https://router.huggingface.co/models/${hfModel}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${hfApiKey}`
      },
      body: JSON.stringify({
        inputs: prompt,
        parameters: {
          max_new_tokens: researchMode ? 3000 : 1500,
          temperature: researchMode ? 0.2 : 0.3,
          return_full_text: false
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[AI Search] Hugging Face error:', errorText);
      throw new Error(`Hugging Face API error: ${response.statusText} - ${errorText}`);
    }

    const hfData = await response.json();
    const aiResponse = hfData[0]?.generated_text || hfData.generated_text || '';
    
    // Try to parse JSON from the AI response
    let parsedResponse: any;
    try {
      // Remove markdown code blocks if present
      let cleanedResponse = aiResponse.trim();
      if (cleanedResponse.startsWith('```json')) {
        cleanedResponse = cleanedResponse.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      } else if (cleanedResponse.startsWith('```')) {
        cleanedResponse = cleanedResponse.replace(/^```\s*/, '').replace(/\s*```$/, '');
      }
      
      parsedResponse = JSON.parse(cleanedResponse);
    } catch (parseError) {
      console.error('[AI Search] Failed to parse JSON response:', parseError);
      // Fallback: use raw response
      parsedResponse = {
        interpretation: `Analysis of: ${query}`,
        answer: aiResponse || 'Unable to generate analysis',
        medicines: [],
        recommendations: 'See analysis above',
        keywords: queryWords
      };
    }

    // Get source citations from the context pages (not by searching keywords)
    const results = contextPages.map((page: any, idx: number) => ({
      bookId: page.bookId,
      bookTitle: page.bookTitle,
      bookAuthor: page.bookAuthor,
      pageNumber: page.pageNumber,
      snippet: page.text.substring(0, 300) + '...',
      relevanceScore: 100 - (idx * 5), // Higher score for earlier pages
      matchCount: 1
    }));

    const responseData: any = {
      success: true,
      results: results.slice(0, researchMode ? 5 : 3),
      interpretation: parsedResponse.interpretation || `Searching for: ${query}`,
      answer: parsedResponse.answer,
      suggestedMedicines: parsedResponse.medicines || [],
      recommendations: parsedResponse.recommendations,
      aiPowered: true,
      provider: 'huggingface',
      model: hfModel
    };

    // Add research mode specific data
    if (researchMode) {
      responseData.detailedAnalysis = parsedResponse.detailedAnalysis;
      responseData.crossReferences = parsedResponse.crossReferences || [];
      responseData.comparativeAnalysis = parsedResponse.comparativeAnalysis;
    }

    return NextResponse.json(responseData);

  } catch (error) {
    console.error('[AI Search] Hugging Face error:', error);
    console.error('[AI Search] Error type:', error instanceof Error ? error.message : String(error));
    console.error('[AI Search] Stack:', error instanceof Error ? error.stack : 'N/A');
    
    // Throw error to trigger fallback
    throw error;
  }
}

// Search with Groq (cloud AI)
async function searchWithGroq(query: string, books: any[], apiKey?: string, model: string = 'llama-3.3-70b-versatile', researchMode: boolean = false) {
  const groqApiKey = apiKey || process.env.GROQ_API_KEY;
    
  if (!groqApiKey) {
    console.warn('[AI Search] Groq API key not configured, falling back to keyword search');
    return fallbackKeywordSearch(query, books);
  }

  try {
    console.log(`[AI Search] Using Groq API with model: ${model}${researchMode ? ' (Research Mode)' : ''}`);
    
    // Step 1: Find relevant pages
    const { relevantPages, queryWords } = await findRelevantPages(query, books);
    console.log(`[AI Search] Found ${relevantPages.length} pages for AI analysis`);
    
    // Check if we have any pages at all
    if (relevantPages.length === 0) {
      console.log('[AI Search] No pages found in database - books may not be processed yet');
      console.log('[AI Search] Books passed to search:', books.map((b: any) => ({
        id: b.id,
        title: b.title,
        hasFullText: !!b.fullText,
        fullTextLength: b.fullText ? b.fullText.length : 0,
        hasPages: !!b.pages
      })));
      return NextResponse.json({
        success: true,
        results: [],
        interpretation: 'Books Not Processed',
        answer: 'The books in your library have not been processed yet. Please click the "Fix Search" button in the library to extract and index the book content. This will make the books searchable with AI.',
        suggestedMedicines: [],
        recommendations: 'Click "Fix Search" button to process your books',
        aiPowered: false,
        provider: 'groq',
        message: 'Books need to be processed first'
      });
    }
    
    // Step 2: Prepare context (more pages for research mode)
    const maxPages = researchMode ? 50 : 30; // Increased to search entire book
    const contextPages = relevantPages.slice(0, maxPages);
    const bookContext = contextPages.map((page: any) => {
      const textLength = researchMode ? 2000 : 1500;
      return `[${page.bookTitle} - Page ${page.pageNumber}]\n${page.text.substring(0, textLength)}...`;
    }).join('\n\n---\n\n');

    console.log(`[AI Search] Prepared context with ${contextPages.length} pages, total length: ${bookContext.length} chars`);

    // Improved prompt for detailed, structured responses like NotebookLM
    const systemPrompt = `You are a homeopathy expert assistant helping doctors find remedies in materia medica books.

You will be provided with relevant excerpts from materia medica books.

Your task is to provide a COMPREHENSIVE, WELL-STRUCTURED answer similar to a professional medical reference.

RESPONSE FORMAT:
1. Start with a brief introduction sentence
2. Organize information into CLEAR CATEGORIES (use headings like "Morning Fevers", "Afternoon Symptoms", "Night Aggravations", etc.)
3. For EACH medicine mentioned:
   - Medicine name in bold
   - Specific symptoms and characteristics
   - Timing/modalities (when symptoms occur or worsen)
   - Key differentiating features
4. End with clinical notes about selection criteria

STRUCTURE EXAMPLE:
"According to the homeopathic source material, several remedies are identified for [condition].

**Category 1 (e.g., Morning Symptoms)**
- **Medicine A**: Specific symptom details, timing (e.g., 9 A.M. to 11 A.M.), key characteristics.
- **Medicine B**: Specific symptom details, timing, key characteristics.

**Category 2 (e.g., Evening Symptoms)**
- **Medicine C**: Specific symptom details, timing, key characteristics.

**Clinical Notes**
The selection should consider concomitant symptoms and modalities. For instance, Medicine A is chosen when [specific condition], whereas Medicine B is selected if [different condition]."

IMPORTANT RULES:
- Base answer ONLY on the provided book excerpts
- Include specific details (times, symptoms, modalities)
- Organize by logical categories (time of day, symptom type, severity, etc.)
- Use medicine names from the excerpts
- Provide comparative analysis between similar medicines
- Include 8-15 medicines if available in the excerpts
- Make it detailed and professional like a medical textbook

Respond in JSON format:
{
  "interpretation": "Brief clinical interpretation of the query",
  "answer": "COMPREHENSIVE, WELL-STRUCTURED answer with categories, medicine details, and clinical notes (minimum 300 words)",
  "keywords": ["keyword1", "keyword2", ...],
  "medicines": ["medicine1", "medicine2", ...],
  "recommendations": "Clinical selection criteria and differential diagnosis notes"
}`;

    // Call Groq API with relevant page context
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${groqApiKey}`
      },
      body: JSON.stringify({
        model: model,
        messages: [
          {
            role: 'system',
            content: systemPrompt
          },
          {
            role: 'user',
            content: `Query: ${query}\n\nRelevant excerpts from materia medica books:\n\n${bookContext}`
          }
        ],
        temperature: 0.3,
        max_tokens: 2500
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Groq API error: ${response.statusText} - ${errorText}`);
    }

    const aiData = await response.json();
    const aiResponse = aiData.choices[0].message.content;
    
    // Try to parse JSON from the AI response
    let parsedResponse: any;
    try {
      // Remove markdown code blocks if present
      let cleanedResponse = aiResponse.trim();
      if (cleanedResponse.startsWith('```json')) {
        cleanedResponse = cleanedResponse.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      } else if (cleanedResponse.startsWith('```')) {
        cleanedResponse = cleanedResponse.replace(/^```\s*/, '').replace(/\s*```$/, '');
      }
      
      parsedResponse = JSON.parse(cleanedResponse);
    } catch (parseError) {
      console.error('[AI Search] Failed to parse JSON response:', parseError);
      // Fallback: use raw response
      parsedResponse = {
        interpretation: `Analysis of: ${query}`,
        answer: aiResponse || 'Unable to generate analysis',
        medicines: [],
        recommendations: 'See analysis above',
        keywords: queryWords
      };
    }

    // Get source citations from the context pages (not by searching keywords)
    const results = contextPages.map((page: any, idx: number) => ({
      bookId: page.bookId,
      bookTitle: page.bookTitle,
      bookAuthor: page.bookAuthor,
      pageNumber: page.pageNumber,
      snippet: page.text.substring(0, 300) + '...',
      relevanceScore: 100 - (idx * 5), // Higher score for earlier pages
      matchCount: 1
    }));

    const responseData: any = {
      success: true,
      results: results.slice(0, researchMode ? 5 : 3),
      interpretation: parsedResponse.interpretation || `Searching for: ${query}`,
      answer: parsedResponse.answer,
      suggestedMedicines: parsedResponse.medicines || [],
      recommendations: parsedResponse.recommendations,
      aiPowered: true,
      provider: 'groq',
      model: model
    };

    // Add research mode specific data
    if (researchMode) {
      responseData.detailedAnalysis = parsedResponse.detailedAnalysis;
      responseData.crossReferences = parsedResponse.crossReferences || [];
      responseData.comparativeAnalysis = parsedResponse.comparativeAnalysis;
    }

    return NextResponse.json(responseData);

  } catch (error) {
    console.error('[AI Search] Groq error:', error);
    console.error('[AI Search] Error type:', error instanceof Error ? error.message : String(error));
    console.error('[AI Search] Stack:', error instanceof Error ? error.stack : 'N/A');
    throw error;
  }
}

// Search with Google Gemini (cloud AI)
async function searchWithGemini(query: string, books: any[], apiKey?: string, model: string = 'gemini-2.5-flash-lite', researchMode: boolean = false) {
  const geminiApiKey = apiKey || process.env.GEMINI_API_KEY;
    
  if (!geminiApiKey) {
    console.warn('[AI Search] Gemini API key not configured');
    throw new Error('Gemini API key not configured');
  }

  try {
    console.log(`[AI Search] Using Google Gemini with model: ${model}${researchMode ? ' (Research Mode)' : ''}`);
    
    // Step 1: Find relevant pages
    const { relevantPages, queryWords } = await findRelevantPages(query, books);
    console.log(`[AI Search] Found ${relevantPages.length} pages for AI analysis`);
    
    // Check if we have any pages at all
    if (relevantPages.length === 0) {
      console.log('[AI Search] No pages found in database - books may not be processed yet');
      console.log('[AI Search] Books passed to search:', books.map((b: any) => ({
        id: b.id,
        title: b.title,
        hasFullText: !!b.fullText,
        fullTextLength: b.fullText ? b.fullText.length : 0,
        hasPages: !!b.pages
      })));
      return NextResponse.json({
        success: true,
        results: [],
        interpretation: 'Books Not Processed',
        answer: 'The books in your library have not been processed yet. Please click the "Fix Search" button in the library to extract and index the book content. This will make the books searchable with AI.',
        suggestedMedicines: [],
        recommendations: 'Click "Fix Search" button to process your books',
        aiPowered: false,
        provider: 'gemini',
        message: 'Books need to be processed first'
      });
    }
    
    // Step 2: Prepare context (more pages for research mode)
    const maxPages = researchMode ? 50 : 30; // Increased to search entire book
    const contextPages = relevantPages.slice(0, maxPages);
    const bookContext = contextPages.map((page: any) => {
      const textLength = researchMode ? 2000 : 1500;
      return `[${page.bookTitle} - Page ${page.pageNumber}]\n${page.text.substring(0, textLength)}...`;
    }).join('\n\n---\n\n');

    console.log(`[AI Search] Prepared context with ${contextPages.length} pages, total length: ${bookContext.length} chars`);

    // Improved prompt for detailed, structured responses
    const promptText = `You are a homeopathy expert assistant helping doctors find remedies in materia medica books.

You will be provided with relevant excerpts from materia medica books.

Your task is to provide a COMPREHENSIVE, WELL-STRUCTURED answer similar to a professional medical reference.

RESPONSE FORMAT:
1. Start with a brief introduction sentence
2. Organize information into CLEAR CATEGORIES (use headings like "Morning Fevers", "Afternoon Symptoms", "Night Aggravations", etc.)
3. For EACH medicine mentioned:
   - Medicine name in bold
   - Specific symptoms and characteristics
   - Timing/modalities (when symptoms occur or worsen)
   - Key differentiating features
4. End with clinical notes about selection criteria

STRUCTURE EXAMPLE:
"According to the homeopathic source material, several remedies are identified for [condition].

**Category 1 (e.g., Morning Symptoms)**
- **Medicine A**: Specific symptom details, timing (e.g., 9 A.M. to 11 A.M.), key characteristics.
- **Medicine B**: Specific symptom details, timing, key characteristics.

**Category 2 (e.g., Evening Symptoms)**
- **Medicine C**: Specific symptom details, timing, key characteristics.

**Clinical Notes**
The selection should consider concomitant symptoms and modalities. For instance, Medicine A is chosen when [specific condition], whereas Medicine B is selected if [different condition]."

IMPORTANT RULES:
- Base answer ONLY on the provided book excerpts
- Include specific details (times, symptoms, modalities)
- Organize by logical categories (time of day, symptom type, severity, etc.)
- Use medicine names from the excerpts
- Provide comparative analysis between similar medicines
- Include 8-15 medicines if available in the excerpts
- Make it detailed and professional like a medical textbook

Respond in JSON format:
{
  "interpretation": "Brief clinical interpretation of the query",
  "answer": "COMPREHENSIVE, WELL-STRUCTURED answer with categories, medicine details, and clinical notes (minimum 300 words)",
  "keywords": ["keyword1", "keyword2", ...],
  "medicines": ["medicine1", "medicine2", ...],
  "recommendations": "Clinical selection criteria and differential diagnosis notes"
}

Query: ${query}

Relevant excerpts from materia medica books:

${bookContext}`;

    // Call Gemini API
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiApiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: promptText
          }]
        }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: researchMode ? 3000 : 2000,
          topP: 0.8,
          topK: 40
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API error: ${response.statusText} - ${errorText}`);
    }

    const geminiData = await response.json();
    const aiResponse = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    // Try to parse JSON from the AI response
    let parsedResponse: any;
    try {
      // Remove markdown code blocks if present
      let cleanedResponse = aiResponse.trim();
      if (cleanedResponse.startsWith('```json')) {
        cleanedResponse = cleanedResponse.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      } else if (cleanedResponse.startsWith('```')) {
        cleanedResponse = cleanedResponse.replace(/^```\s*/, '').replace(/\s*```$/, '');
      }
      
      parsedResponse = JSON.parse(cleanedResponse);
    } catch (parseError) {
      console.error('[AI Search] Failed to parse JSON response:', parseError);
      // Fallback: use raw response
      parsedResponse = {
        interpretation: `Analysis of: ${query}`,
        answer: aiResponse || 'Unable to generate analysis',
        medicines: [],
        recommendations: 'See analysis above',
        keywords: queryWords
      };
    }

    // Get source citations from the context pages
    const results = contextPages.map((page: any, idx: number) => ({
      bookId: page.bookId,
      bookTitle: page.bookTitle,
      bookAuthor: page.bookAuthor,
      pageNumber: page.pageNumber,
      snippet: page.text.substring(0, 300) + '...',
      relevanceScore: 100 - (idx * 5),
      matchCount: 1
    }));

    const responseData: any = {
      success: true,
      results: results.slice(0, researchMode ? 5 : 3),
      interpretation: parsedResponse.interpretation || `Searching for: ${query}`,
      answer: parsedResponse.answer,
      suggestedMedicines: parsedResponse.medicines || [],
      recommendations: parsedResponse.recommendations,
      aiPowered: true,
      provider: 'gemini',
      model: model
    };

    // Add research mode specific data
    if (researchMode) {
      responseData.detailedAnalysis = parsedResponse.detailedAnalysis;
      responseData.crossReferences = parsedResponse.crossReferences || [];
      responseData.comparativeAnalysis = parsedResponse.comparativeAnalysis;
    }

    return NextResponse.json(responseData);

  } catch (error) {
    console.error('[AI Search] Gemini error:', error);
    console.error('[AI Search] Error type:', error instanceof Error ? error.message : String(error));
    console.error('[AI Search] Stack:', error instanceof Error ? error.stack : 'N/A');
    throw error;
  }
}

// Helper: Find relevant pages using keyword search
async function findRelevantPages(query: string, books: any[]) {
  const queryWords = query.toLowerCase().split(/\s+/).filter((w: string) => w.length > 2);
  const relevantPages: any[] = [];
  
  console.log(`[AI Search] Starting findRelevantPages with query: "${query}"`);
  console.log(`[AI Search] Query words: ${queryWords.join(', ')}`);
  console.log(`[AI Search] Books to search: ${books.length}`);
  
  try {
    // Import database on server side
    let materiaMedicaBookPageDb: any;
    try {
      const dbModule = await import('@/lib/db/database');
      materiaMedicaBookPageDb = dbModule.materiaMedicaBookPageDb;
      console.log('[AI Search] Successfully imported database module');
    } catch (importError) {
      console.error('[AI Search] Failed to import database:', importError);
      return { relevantPages: [], queryWords };
    }
    
    for (const book of books) {
      const bookData = book as any;
      
      console.log(`[AI Search] Searching book: ${bookData.title} (ID: ${bookData.id})`);
      
      try {
        // Try to fetch pages from database first
        const pages = materiaMedicaBookPageDb.getByBook(bookData.id);
        
        if (pages && pages.length > 0) {
          // Book has pages in database - use them
          console.log(`[AI Search] Found ${pages.length} pages in database for: ${bookData.title}`);
          
          for (const page of pages) {
            const pageData = page as any;
            const pageText = pageData.text || '';
            const lowerPageText = pageText.toLowerCase();
            
            let matchCount = 0;
            for (const word of queryWords) {
              if (lowerPageText.includes(word)) {
                matchCount++;
              }
            }
            
            if (matchCount > 0) {
              relevantPages.push({
                bookId: bookData.id,
                bookTitle: bookData.title,
                bookAuthor: bookData.author,
                pageNumber: pageData.pageNumber,
                text: pageText
              });
            }
          }
        } else if (bookData.fullText) {
          // No pages in database, but book has fullText - split it into pages
          console.log(`[AI Search] No pages in database for ${bookData.title}, using fullText (${bookData.fullText.length} chars)`);
          
          try {
            // Split by ##PAGE_BREAK## markers (same as web import)
            const textPages = bookData.fullText.split('##PAGE_BREAK##').filter((p: string) => p.trim());
            console.log(`[AI Search] Split fullText into ${textPages.length} pages`);
            
            for (let pageNum = 1; pageNum <= textPages.length; pageNum++) {
              const pageText = textPages[pageNum - 1];
              if (!pageText) continue;
              
              const lowerPageText = pageText.toLowerCase();
              
              let matchCount = 0;
              for (const word of queryWords) {
                if (lowerPageText.includes(word)) {
                  matchCount++;
                }
              }
              
              if (matchCount > 0) {
                relevantPages.push({
                  bookId: bookData.id,
                  bookTitle: bookData.title,
                  bookAuthor: bookData.author,
                  pageNumber: pageNum,
                  text: pageText
                });
              }
            }
          } catch (splitError) {
            console.error(`[AI Search] Error splitting fullText for ${bookData.title}:`, splitError);
          }
        } else {
          console.log(`[AI Search] Book ${bookData.title} has no pages and no fullText`);
        }
      } catch (bookError) {
        console.error(`[AI Search] Error processing book ${bookData.title}:`, bookError);
        continue;
      }
    }
  } catch (error) {
    console.error('[AI Search] Error in findRelevantPages:', error);
  }
  
  console.log(`[AI Search] Found ${relevantPages.length} relevant pages total`);
  
  if (relevantPages.length === 0) {
    console.log(`[AI Search] No pages matched query words.`);
  }
  
  return { relevantPages, queryWords };
}

// Fallback to keyword search if AI is not available
function fallbackKeywordSearch(query: string, books: any[]) {
  console.log('[AI Search] Using fallback keyword search');
  
  const keywords = query.toLowerCase().split(/\s+/).filter((k: string) => k.length > 2);
  const results = searchInBooks(books, keywords);

  return NextResponse.json({
    success: true,
    results: results.slice(0, 20),
    interpretation: `Searching for: ${query}`,
    fallback: true,
    message: 'AI search not available. Using keyword search instead.'
  });
}

// Search function
function searchInBooks(books: any[], keywords: string[]) {
  const results: any[] = [];
  const charsPerPage = 2000;

  for (const book of books) {
    const bookData = book as any;
    
    if (!bookData.fullText) continue;
    
    const fullText = bookData.fullText;
    const totalPages = Math.ceil(fullText.length / charsPerPage);
    
    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      const startIdx = (pageNum - 1) * charsPerPage;
      const endIdx = Math.min(pageNum * charsPerPage, fullText.length);
      const pageText = fullText.substring(startIdx, endIdx);
      const lowerPageText = pageText.toLowerCase();
      
      let matchCount = 0;
      const matchedKeywords: string[] = [];
      
      for (const keyword of keywords) {
        if (lowerPageText.includes(keyword.toLowerCase())) {
          matchCount++;
          matchedKeywords.push(keyword);
        }
      }
      
      if (matchCount > 0) {
        // Generate snippet
        let snippet = '';
        const firstKeyword = matchedKeywords[0];
        const keywordIndex = lowerPageText.indexOf(firstKeyword.toLowerCase());
        
        if (keywordIndex !== -1) {
          const snippetStart = Math.max(0, keywordIndex - 100);
          const snippetEnd = Math.min(pageText.length, keywordIndex + 100);
          snippet = pageText.substring(snippetStart, snippetEnd);
          
          if (snippetStart > 0) snippet = '...' + snippet;
          if (snippetEnd < pageText.length) snippet = snippet + '...';
          
          // Highlight keywords
          matchedKeywords.forEach((kw: string) => {
            const regex = new RegExp(`(${kw})`, 'gi');
            snippet = snippet.replace(regex, '**$1**');
          });
        }
        
        const relevanceScore = (matchCount / keywords.length) * 100;
        
        results.push({
          bookId: bookData.id,
          bookTitle: bookData.title,
          bookAuthor: bookData.author,
          pageNumber: pageNum,
          snippet,
          relevanceScore,
          matchCount
        });
      }
    }
  }
  
  // Sort by relevance
  results.sort((a, b) => b.relevanceScore - a.relevanceScore);
  
  return results;
}
