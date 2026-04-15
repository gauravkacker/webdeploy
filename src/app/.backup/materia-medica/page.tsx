"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/layout/SidebarComponent';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { getCurrentUser } from '@/lib/permissions';
import { UsageTracker } from '@/components/materia-medica/UsageTracker';

export default function MateriaMedicaPage() {
  const router = useRouter();
  
  // Check authentication on mount
  useEffect(() => {
    const user = getCurrentUser();
    if (!user) {
      router.push('/login');
    }
  }, [router]);
  
  const [books, setBooks] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeView, setActiveView] = useState<'library' | 'upload' | 'reader'>('library');
  const [selectedBook, setSelectedBook] = useState<any>(null);

  useEffect(() => {
    loadBooks();
  }, []);

  const loadBooks = async () => {
    setIsLoading(true);
    try {
      const { materiaMedicaBookDb } = await import('@/lib/db/database');
      const allBooks = materiaMedicaBookDb.getAll();
      console.log('Loaded books:', allBooks.length);
      setBooks(allBooks);
    } catch (error) {
      console.error('Failed to load books:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUploadComplete = () => {
    setActiveView('library');
    loadBooks();
  };

  const handleOpenBook = (book: any) => {
    setSelectedBook(book);
    setActiveView('reader');
  };

  const handleCloseReader = () => {
    setSelectedBook(null);
    setActiveView('library');
  };

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar />
      <main className="flex-1 transition-all duration-300 ml-64">
        <div className="p-6">
          {/* Header */}
          <div className="flex justify-between items-center mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Materia Medica Library</h1>
              <p className="text-gray-600">Upload, read, and search homeopathy reference books</p>
            </div>
            <div className="flex gap-3">
              <Button
                variant={activeView === 'library' ? 'primary' : 'secondary'}
                onClick={() => setActiveView('library')}
              >
                📚 Library
              </Button>
              <Button
                variant={activeView === 'upload' ? 'primary' : 'secondary'}
                onClick={() => setActiveView('upload')}
              >
                ⬆️ Upload Book
              </Button>
            </div>
          </div>

          {/* Content */}
          {activeView === 'library' ? (
            <LibraryView books={books} isLoading={isLoading} onRefresh={loadBooks} onOpenBook={handleOpenBook} />
          ) : activeView === 'upload' ? (
            <UploadView onUploadComplete={handleUploadComplete} />
          ) : (
            <BookReaderView book={selectedBook} onClose={handleCloseReader} searchKeywords={selectedBook?.searchKeywords || []} />
          )}
        </div>
      </main>
    </div>
  );
}
// Library View Component
function LibraryView({ books, isLoading, onRefresh, onOpenBook }: any) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchMode, setSearchMode] = useState<'books' | 'content' | 'smart' | 'ai' | 'research' | 'semantic'>('books');
  const [exactMatch, setExactMatch] = useState(false);
  const [isFixingSearch, setIsFixingSearch] = useState(false);
  const [testResults, setTestResults] = useState<string>('');
  const [fixProgress, setFixProgress] = useState<{ current: number; total: number; stage: string }>({ current: 0, total: 0, stage: '' });
  const [aiSearchData, setAiSearchData] = useState<any>(null);
  const [currentProvider, setCurrentProvider] = useState('groq');
  const [currentModel, setCurrentModel] = useState('gemini-2.5-flash-lite');
  const [aggregatedResults, setAggregatedResults] = useState<any>(null);

  // Load AI settings to show current provider/model
  useEffect(() => {
    const aiSettings = localStorage.getItem('materiaMedicaAISettings');
    if (aiSettings) {
      try {
        const parsed = JSON.parse(aiSettings);
        setCurrentProvider(parsed.provider || 'groq');
        setCurrentModel(parsed.geminiModel || 'gemini-2.5-flash-lite');
      } catch (e) {
        console.error('Failed to parse AI settings:', e);
      }
    }
  }, [searchMode]);


  // Intelligent search function (client-side, FREE - no API costs!)
  const performIntelligentSearch = (query: string, allBooks: any[]) => {
    const lowerQuery = query.toLowerCase();
    
    // Common homeopathic terms
    const medicineKeywords = ['aconite', 'aconitum', 'arnica', 'arsenicum', 'belladonna', 'bryonia', 'calcarea', 'carbo', 'chamomilla', 'china', 'colocynthis', 'gelsemium', 'hepar', 'ignatia', 'ipecac', 'kali', 'lachesis', 'lycopodium', 'mercurius', 'natrum', 'nux', 'phosphorus', 'pulsatilla', 'rhus', 'sepia', 'silica', 'sulphur', 'thuja', 'veratrum'];
    const symptomKeywords = ['fever', 'headache', 'pain', 'anxiety', 'nausea', 'vomiting', 'diarrhea', 'cough', 'cold', 'insomnia', 'restless', 'weakness', 'fatigue', 'dizzy', 'burning', 'aching', 'throbbing'];
    
    const queryWords = lowerQuery.split(/\s+/).filter(w => w.length > 2);
    const foundMedicines = medicineKeywords.filter(med => lowerQuery.includes(med));
    const foundSymptoms = symptomKeywords.filter(sym => lowerQuery.includes(sym));
    const searchTerms = [...new Set([...queryWords, ...foundMedicines, ...foundSymptoms])];
    
    console.log('[AI Search] Terms:', searchTerms, 'Medicines:', foundMedicines, 'Symptoms:', foundSymptoms);
    
    const results: any[] = [];
    const charsPerPage = 2000;
    
    for (const book of allBooks) {
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
        let medicineBoost = 0;
        let symptomBoost = 0;
        const matchedTerms: string[] = [];
        
        for (const term of searchTerms) {
          if (lowerPageText.includes(term)) {
            matchCount++;
            matchedTerms.push(term);
            if (foundMedicines.includes(term)) medicineBoost += 10;
            if (foundSymptoms.includes(term)) symptomBoost += 5;
          }
        }
        
        if (matchCount > 0) {
          let snippet = '';
          const firstTerm = matchedTerms[0];
          const termIndex = lowerPageText.indexOf(firstTerm);
          
          if (termIndex !== -1) {
            const snippetStart = Math.max(0, termIndex - 100);
            const snippetEnd = Math.min(pageText.length, termIndex + 100);
            snippet = pageText.substring(snippetStart, snippetEnd);
            if (snippetStart > 0) snippet = '...' + snippet;
            if (snippetEnd < pageText.length) snippet = snippet + '...';
            matchedTerms.forEach(term => {
              const regex = new RegExp(`(${term})`, 'gi');
              snippet = snippet.replace(regex, '**$1**');
            });
          }
          
          const relevanceScore = Math.min((matchCount / searchTerms.length) * 100 + medicineBoost + symptomBoost, 100);
          
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
    
    results.sort((a, b) => b.relevanceScore - a.relevanceScore);
    return results.slice(0, 50);
  };

  // Aggregate search results by medicine and section (NotebookLM style)
  const aggregateResults = (results: any[]) => {
    const medicineMap: Record<string, any> = {};
    
    console.log('[aggregateResults] Aggregating', results.length, 'results');
    
    for (const result of results) {
      const medicineName = result.medicineName || 'Unknown Medicine';
      const sectionName = result.sectionName || 'General';
      
      if (!medicineMap[medicineName]) {
        medicineMap[medicineName] = {
          name: medicineName,
          bookTitle: result.bookTitle,
          bookId: result.bookId,
          sections: {},
          totalMatches: 0
        };
      }
      
      if (!medicineMap[medicineName].sections[sectionName]) {
        medicineMap[medicineName].sections[sectionName] = [];
      }
      
      medicineMap[medicineName].sections[sectionName].push({
        snippet: result.snippet,
        pageNumber: result.pageNumber,
        relevanceScore: result.relevanceScore
      });
      
      medicineMap[medicineName].totalMatches++;
    }
    
    // Convert to array and sort by total matches
    const medicines = Object.values(medicineMap).sort((a: any, b: any) => b.totalMatches - a.totalMatches);
    
    console.log(`[aggregateResults] Final: ${medicines.length} medicines with ${results.length} total matches`);
    
    return {
      medicines,
      totalMedicines: medicines.length,
      totalMatches: results.length
    };
  };


  const handleSearch = async (query: string) => {
    setSearchQuery(query);
    
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);

    try {
      if (searchMode === 'books') {
        const { materiaMedicaBookDb } = await import('@/lib/db/database');
        const results = materiaMedicaBookDb.search(query);
        setSearchResults(results);
      } else if (searchMode === 'ai') {
        // AI semantic search using Groq API or Ollama
        console.log('AI Search for:', query);
        
        const startTime = Date.now();
        
        // Get all books from client database
        const { materiaMedicaBookDb } = await import('@/lib/db/database');
        const allBooks = materiaMedicaBookDb.getAll();
        
        if (allBooks.length === 0) {
          console.log('[AI Search] No books found in database');
          setSearchResults([]);
          setAiSearchData(null);
          return;
        }
        
        // Get AI settings from localStorage (separate from prescription parsing)
        const aiSettings = localStorage.getItem('materiaMedicaAISettings');
        let apiKey = '';
        let provider = 'groq';
        let groqModel = 'llama-3.3-70b-versatile';
        let huggingfaceApiKey = '';
        let huggingfaceModel = 'meta-llama/Meta-Llama-3-8B-Instruct';
        let ollamaUrl = 'http://localhost:11434';
        let ollamaModel = 'gpt-oss:20b-cloud';
        let geminiApiKey = '';
        let geminiModel = 'gemini-2.5-flash-lite';
        
        if (aiSettings) {
          try {
            const parsed = JSON.parse(aiSettings);
            provider = parsed.provider || 'groq';
            apiKey = parsed.groqApiKey || '';
            groqModel = parsed.groqModel || 'llama-3.3-70b-versatile';
            huggingfaceApiKey = parsed.huggingfaceApiKey || '';
            huggingfaceModel = parsed.huggingfaceModel || 'meta-llama/Meta-Llama-3-8B-Instruct';
            ollamaUrl = parsed.ollamaUrl || 'http://localhost:11434';
            ollamaModel = parsed.ollamaModel || 'gpt-oss:20b-cloud';
            geminiApiKey = parsed.geminiApiKey || '';
            geminiModel = parsed.geminiModel || 'gemini-2.5-flash-lite';
            
            console.log('[AI Search] Loaded settings:', {
              provider,
              hasGroqKey: !!apiKey,
              hasHuggingFaceKey: !!huggingfaceApiKey,
              hasGeminiKey: !!geminiApiKey,
              groqModel,
              huggingfaceModel,
              geminiModel,
              researchMode: false
            });
          } catch (e) {
            console.error('[AI Search] Failed to parse AI settings:', e);
          }
        }
        
        // Check if API key is configured
        if (!apiKey && provider === 'groq') {
          setSearchResults([]);
          setAiSearchData({
            interpretation: 'AI Not Configured',
            answer: 'Please configure your Groq API key in Settings → Materia Medica AI to use AI Search.',
            suggestedMedicines: [],
            recommendations: 'Go to Settings → Materia Medica AI and add your FREE Groq API key from console.groq.com/keys',
            aiPowered: false,
            provider: 'groq'
          });
          setIsSearching(false);
          return;
        }
        
        if (!geminiApiKey && provider === 'gemini') {
          setSearchResults([]);
          setAiSearchData({
            interpretation: 'AI Not Configured',
            answer: 'Please configure your Google Gemini API key in Settings → Materia Medica AI to use AI Search.',
            suggestedMedicines: [],
            recommendations: 'Go to Settings → Materia Medica AI and add your FREE Gemini API key from makersuite.google.com/app/apikey',
            aiPowered: false,
            provider: 'gemini'
          });
          setIsSearching(false);
          return;
        }
        
        if (!huggingfaceApiKey && provider === 'huggingface') {
          setSearchResults([]);
          setAiSearchData({
            interpretation: 'AI Not Configured',
            answer: 'Please configure your Hugging Face API key in Settings → Materia Medica AI to use AI Search.',
            suggestedMedicines: [],
            recommendations: 'Go to Settings → Materia Medica AI and add your FREE Hugging Face token from huggingface.co/settings/tokens',
            aiPowered: false,
            provider: 'huggingface'
          });
          setIsSearching(false);
          return;
        }
        
        // Trigger usage tracking event
        window.dispatchEvent(new Event('ai-search-started'));
        
        // Call AI search endpoint
        const response = await fetch('/api/materia-medica/ai-search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            query, 
            books: allBooks, 
            provider,
            apiKey,
            groqModel,
            huggingfaceApiKey,
            huggingfaceModel,
            ollamaUrl,
            ollamaModel,
            geminiApiKey,
            geminiModel,
            researchMode: false
          })
        });

        console.log('[AI Search] API Response status:', response.status);
        console.log('[AI Search] Sending to API with provider:', provider);

        if (!response.ok) {
          const errorText = await response.text();
          console.error('[AI Search] API Error Response:', errorText);
          
          // Try to parse error as JSON
          let errorMessage = `API returned ${response.status}: ${response.statusText}`;
          try {
            const errorData = JSON.parse(errorText);
            if (errorData.message) {
              errorMessage = errorData.message;
            }
            if (errorData.error) {
              errorMessage += `\n\nDetails: ${errorData.error}`;
            }
          } catch (e) {
            // Not JSON, use raw text
            if (errorText) {
              errorMessage += `\n\n${errorText}`;
            }
          }
          
          throw new Error(errorMessage);
        }
        
        const data = await response.json();
        
        const searchTime = Date.now() - startTime;
        console.log(`[AI Search] Returned ${data.results?.length || 0} results in ${searchTime}ms`);
        console.log('[AI Search] Full response:', data);
        console.log('[AI Search] AI Data:', {
          interpretation: data.interpretation,
          answer: data.answer,
          suggestedMedicines: data.suggestedMedicines,
          recommendations: data.recommendations,
          aiPowered: data.aiPowered,
          provider: data.provider
        });
        
        if (data.success) {
          setSearchResults(data.results || []);
          setAiSearchData({
            interpretation: data.interpretation,
            answer: data.answer,
            suggestedMedicines: data.suggestedMedicines || [],
            recommendations: data.recommendations,
            aiPowered: data.aiPowered,
            provider: data.provider,
            model: data.model
          });
          console.log('[AI Search] State updated with AI data');
        } else {
          setSearchResults([]);
          setAiSearchData(null);
          console.log('[AI Search] Search failed:', data.message);
        }
      } else if (searchMode === 'research') {
        // Research Mode - Deep analysis with detailed citations
        console.log('Research Mode for:', query);
        
        const startTime = Date.now();
        
        // Get all books from client database
        const { materiaMedicaBookDb } = await import('@/lib/db/database');
        const allBooks = materiaMedicaBookDb.getAll();
        
        if (allBooks.length === 0) {
          console.log('[Research Mode] No books found in database');
          setSearchResults([]);
          setAiSearchData(null);
          return;
        }
        
        // Get AI settings from localStorage
        const aiSettings = localStorage.getItem('materiaMedicaAISettings');
        let apiKey = '';
        let provider = 'groq';
        let groqModel = 'llama-3.3-70b-versatile';
        let huggingfaceApiKey = '';
        let huggingfaceModel = 'meta-llama/Meta-Llama-3-8B-Instruct';
        let ollamaUrl = 'http://localhost:11434';
        let ollamaModel = 'gpt-oss:20b-cloud';
        let geminiApiKey = '';
        let geminiModel = 'gemini-2.5-flash-lite';
        
        if (aiSettings) {
          try {
            const parsed = JSON.parse(aiSettings);
            provider = parsed.provider || 'groq';
            apiKey = parsed.groqApiKey || '';
            groqModel = parsed.groqModel || 'llama-3.3-70b-versatile';
            huggingfaceApiKey = parsed.huggingfaceApiKey || '';
            huggingfaceModel = parsed.huggingfaceModel || 'meta-llama/Meta-Llama-3-8B-Instruct';
            ollamaUrl = parsed.ollamaUrl || 'http://localhost:11434';
            ollamaModel = parsed.ollamaModel || 'gpt-oss:20b-cloud';
            geminiApiKey = parsed.geminiApiKey || '';
            geminiModel = parsed.geminiModel || 'gemini-2.5-flash-lite';
          } catch (e) {
            console.error('[Research Mode] Failed to parse AI settings:', e);
          }
        }
        
        // Check if API key is configured
        if (!apiKey && provider === 'groq') {
          setSearchResults([]);
          setAiSearchData({
            interpretation: 'AI Not Configured',
            answer: 'Please configure your Groq API key in Settings → Materia Medica AI to use Research Mode.',
            suggestedMedicines: [],
            recommendations: 'Go to Settings → Materia Medica AI and add your FREE Groq API key from console.groq.com/keys',
            aiPowered: false,
            provider: 'groq',
            researchMode: true
          });
          setIsSearching(false);
          return;
        }
        
        if (!geminiApiKey && provider === 'gemini') {
          setSearchResults([]);
          setAiSearchData({
            interpretation: 'AI Not Configured',
            answer: 'Please configure your Google Gemini API key in Settings → Materia Medica AI to use Research Mode.',
            suggestedMedicines: [],
            recommendations: 'Go to Settings → Materia Medica AI and add your FREE Gemini API key from makersuite.google.com/app/apikey',
            aiPowered: false,
            provider: 'gemini',
            researchMode: true
          });
          setIsSearching(false);
          return;
        }
        
        if (!huggingfaceApiKey && provider === 'huggingface') {
          setSearchResults([]);
          setAiSearchData({
            interpretation: 'AI Not Configured',
            answer: 'Please configure your Hugging Face API key in Settings → Materia Medica AI to use Research Mode.',
            suggestedMedicines: [],
            recommendations: 'Go to Settings → Materia Medica AI and add your FREE Hugging Face token from huggingface.co/settings/tokens',
            aiPowered: false,
            provider: 'huggingface',
            researchMode: true
          });
          setIsSearching(false);
          return;
        }
        
        // Trigger usage tracking event
        window.dispatchEvent(new Event('ai-search-started'));
        
        // Call research mode endpoint
        const response = await fetch('/api/materia-medica/ai-search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            query, 
            books: allBooks, 
            provider,
            apiKey,
            groqModel,
            huggingfaceApiKey,
            huggingfaceModel,
            ollamaUrl,
            ollamaModel,
            geminiApiKey,
            geminiModel,
            researchMode: true // Enable research mode
          })
        });

        if (!response.ok) {
          throw new Error(`API returned ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        const searchTime = Date.now() - startTime;
        console.log(`[Research Mode] Returned ${data.results?.length || 0} results in ${searchTime}ms`);
        console.log('[Research Mode] Full API response:', data);
        console.log('[Research Mode] AI Data:', {
          interpretation: data.interpretation,
          answer: data.answer,
          suggestedMedicines: data.suggestedMedicines,
          recommendations: data.recommendations,
          aiPowered: data.aiPowered,
          provider: data.provider
        });
        
        if (data.success) {
          setSearchResults(data.results || []);
          setAiSearchData({
            interpretation: data.interpretation,
            answer: data.answer,
            suggestedMedicines: data.suggestedMedicines || [],
            recommendations: data.recommendations,
            aiPowered: data.aiPowered,
            provider: data.provider,
            model: data.model,
            researchMode: true,
            detailedAnalysis: data.detailedAnalysis,
            crossReferences: data.crossReferences,
            comparativeAnalysis: data.comparativeAnalysis
          });
        } else {
          setSearchResults([]);
          setAiSearchData(null);
          console.log('[Research Mode] Search failed:', data.message);
        }
      } else if (searchMode === 'content' || searchMode === 'smart') {
        // Client-side content search in fullText
        const { materiaMedicaBookDb } = await import('@/lib/db/database');
        const { normalizeText } = await import('@/lib/pdf-utils-client');
        
        console.log(`Searching ${searchMode} for:`, query, exactMatch ? '(EXACT MATCH)' : '(KEYWORD MATCH)');
        
        const startTime = Date.now();
        
        // Get all books
        const allBooks = materiaMedicaBookDb.getAll();
        const exactResults: any[] = [];
        const partialResults: any[] = [];
        
        if (exactMatch) {
          // EXACT PHRASE MATCHING
          const exactPhrase = query.trim().toLowerCase();
          
          console.log('[Exact Search] Looking for exact phrase:', exactPhrase);
          
          // Search in each book's fullText
          for (const book of allBooks) {
            const bookData = book as any;
            
            if (!bookData.fullText) continue;
            
            // Split by page breaks
            const pages = bookData.fullText.split('##PAGE_BREAK##').filter((p: string) => p.trim());
            
            // Search each page
            for (let pageNum = 1; pageNum <= pages.length; pageNum++) {
              const pageText = pages[pageNum - 1];
              const lowerPageText = pageText.toLowerCase();
              
              // Extract medicine name from this page
              let medicineName = 'Unknown Medicine';
              const titleMatch = pageText.match(/##TITLE##(.*?)##TITLE##/);
              if (titleMatch) {
                medicineName = titleMatch[1].trim();
              }
              
              // Check for exact phrase match
              if (lowerPageText.includes(exactPhrase)) {
                // Find the section heading before this match
                let sectionName = '';
                const phraseIndex = lowerPageText.indexOf(exactPhrase);
                
                if (phraseIndex !== -1) {
                  const textBeforePhrase = pageText.substring(0, phraseIndex);
                  const headingMatches = textBeforePhrase.match(/##HEADING##(.*?)##HEADING##/g);
                  if (headingMatches && headingMatches.length > 0) {
                    const lastHeading = headingMatches[headingMatches.length - 1];
                    const headingTextMatch = lastHeading.match(/##HEADING##(.*?)##HEADING##/);
                    if (headingTextMatch) {
                      sectionName = headingTextMatch[1].trim();
                    }
                  }
                  
                  // Get snippet around the exact phrase
                  const snippetStart = Math.max(0, phraseIndex - 100);
                  const snippetEnd = Math.min(pageText.length, phraseIndex + exactPhrase.length + 200);
                  let rawSnippet = pageText.substring(snippetStart, snippetEnd);
                  
                  // Remove markers from snippet
                  rawSnippet = rawSnippet.replace(/##TITLE##/g, '').replace(/##HEADING##/g, '').replace(/##SUBHEADING##/g, '').replace(/##MINOR##/g, '');
                  
                  if (snippetStart > 0) rawSnippet = '...' + rawSnippet;
                  if (snippetEnd < pageText.length) rawSnippet = rawSnippet + '...';
                  
                  // Highlight the exact phrase
                  const regex = new RegExp(`(${exactPhrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
                  rawSnippet = rawSnippet.replace(regex, '<mark class="bg-green-300 font-bold">$1</mark>');
                  
                  // Build final snippet
                  let snippet = '';
                  if (sectionName) {
                    snippet = `<strong class="text-blue-600">${medicineName}</strong> → <strong class="text-gray-700">${sectionName}:</strong> ${rawSnippet}`;
                  } else {
                    snippet = `<strong class="text-blue-600">${medicineName}:</strong> ${rawSnippet}`;
                  }
                  
                  exactResults.push({
                    bookId: bookData.id,
                    bookTitle: bookData.title,
                    bookAuthor: bookData.author,
                    pageNumber: pageNum,
                    medicineName: medicineName,
                    sectionName: sectionName,
                    snippet,
                    relevanceScore: 100,
                    matchCount: 1,
                    matchType: 'exact'
                  });
                }
              }
              
              // Also check for partial matches (all words present but not exact phrase)
              const keywords = query.trim().toLowerCase().split(/\s+/).filter(k => k.length > 0);
              let allWordsPresent = true;
              for (const keyword of keywords) {
                if (!lowerPageText.includes(keyword)) {
                  allWordsPresent = false;
                  break;
                }
              }
              
              // If all words present but not exact phrase, add to partial results
              if (allWordsPresent && !lowerPageText.includes(exactPhrase)) {
                let sectionName = '';
                const firstKeyword = keywords[0];
                const keywordIndex = lowerPageText.indexOf(firstKeyword);
                
                if (keywordIndex !== -1) {
                  const textBeforeKeyword = pageText.substring(0, keywordIndex);
                  const headingMatches = textBeforeKeyword.match(/##HEADING##(.*?)##HEADING##/g);
                  if (headingMatches && headingMatches.length > 0) {
                    const lastHeading = headingMatches[headingMatches.length - 1];
                    const headingTextMatch = lastHeading.match(/##HEADING##(.*?)##HEADING##/);
                    if (headingTextMatch) {
                      sectionName = headingTextMatch[1].trim();
                    }
                  }
                  
                  const snippetStart = Math.max(0, keywordIndex - 100);
                  const snippetEnd = Math.min(pageText.length, keywordIndex + 200);
                  let rawSnippet = pageText.substring(snippetStart, snippetEnd);
                  
                  rawSnippet = rawSnippet.replace(/##TITLE##/g, '').replace(/##HEADING##/g, '').replace(/##SUBHEADING##/g, '').replace(/##MINOR##/g, '');
                  
                  if (snippetStart > 0) rawSnippet = '...' + rawSnippet;
                  if (snippetEnd < pageText.length) rawSnippet = rawSnippet + '...';
                  
                  // Highlight keywords
                  keywords.forEach(kw => {
                    const regex = new RegExp(`(${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
                    rawSnippet = rawSnippet.replace(regex, '<mark class="bg-yellow-200 font-semibold">$1</mark>');
                  });
                  
                  let snippet = '';
                  if (sectionName) {
                    snippet = `<strong class="text-blue-600">${medicineName}</strong> → <strong class="text-gray-700">${sectionName}:</strong> ${rawSnippet}`;
                  } else {
                    snippet = `<strong class="text-blue-600">${medicineName}:</strong> ${rawSnippet}`;
                  }
                  
                  partialResults.push({
                    bookId: bookData.id,
                    bookTitle: bookData.title,
                    bookAuthor: bookData.author,
                    pageNumber: pageNum,
                    medicineName: medicineName,
                    sectionName: sectionName,
                    snippet,
                    relevanceScore: 70,
                    matchCount: keywords.length,
                    matchType: 'partial'
                  });
                }
              }
            }
          }
          
          console.log(`[Exact Search] Found ${exactResults.length} exact matches, ${partialResults.length} partial matches`);
          
          // Combine results: exact matches first, then partial matches
          const combinedResults = [...exactResults, ...partialResults];
          const limitedResults = combinedResults.slice(0, 50);
          
          const searchTime = Date.now() - startTime;
          console.log(`[Exact Search] Returning ${limitedResults.length} results in ${searchTime}ms`);
          
          setSearchResults(limitedResults);
          
          // Aggregate results for smart mode
          if (searchMode === 'smart') {
            const aggregated = aggregateResults(limitedResults);
            setAggregatedResults(aggregated);
            console.log(`[Smart Search] Aggregated into ${aggregated.totalMedicines} medicines`);
          } else {
            setAggregatedResults(null);
          }
          
        } else {
          // KEYWORD MATCHING (existing logic)
          const normalizedQuery = normalizeText(query);
          const keywords = normalizedQuery.split(' ').filter(k => k.length > 0);
          
          console.log('[Search] Keywords:', keywords);
          
          const results: any[] = [];
          
          // Search in each book's fullText
          for (const book of allBooks) {
            const bookData = book as any;
            
            if (!bookData.fullText) continue;
            
            // Split by page breaks (same method as book reader)
            const pages = bookData.fullText.split('##PAGE_BREAK##').filter((p: string) => p.trim());
            
            // Search each page
            for (let pageNum = 1; pageNum <= pages.length; pageNum++) {
              const pageText = pages[pageNum - 1];
              const lowerPageText = pageText.toLowerCase();
              
              // Extract medicine name from this page (from ##TITLE## marker)
              let medicineName = 'Unknown Medicine';
              const titleMatch = pageText.match(/##TITLE##(.*?)##TITLE##/);
              if (titleMatch) {
                medicineName = titleMatch[1].trim();
              }
              
              // Split page into sections
              const sectionRegex = /##HEADING##(.*?)##HEADING##([\s\S]*?)(?=##HEADING##|$)/g;
              let sectionMatch;
              
              while ((sectionMatch = sectionRegex.exec(pageText)) !== null) {
                const sectionName = sectionMatch[1].trim();
                const sectionContent = sectionMatch[2];
                const lowerSectionContent = sectionContent.toLowerCase();
                
                // Check if ALL keywords are in this section
                let matchCount = 0;
                const matchedKeywords: string[] = [];
                
                for (const keyword of keywords) {
                  if (lowerSectionContent.includes(keyword)) {
                    matchCount++;
                    matchedKeywords.push(keyword);
                  }
                }
                
                // Only include if ALL keywords are found in this section
                if (matchCount === keywords.length) {
                  // Get full section content (not just snippet)
                  let fullContent = sectionContent;
                  
                  // Remove markers from content
                  fullContent = fullContent.replace(/##TITLE##/g, '').replace(/##HEADING##/g, '').replace(/##SUBHEADING##/g, '').replace(/##MINOR##/g, '').trim();
                  
                  const relevanceScore = 100; // All keywords found in same section
                  
                  results.push({
                    bookId: bookData.id,
                    bookTitle: bookData.title,
                    bookAuthor: bookData.author,
                    pageNumber: pageNum,
                    medicineName: medicineName,
                    sectionName: sectionName,
                    snippet: fullContent, // Store full content instead of snippet
                    relevanceScore,
                    matchCount,
                    matchType: 'keyword'
                  });
                }
              }
            }
          }
          
          console.log(`[Search] Found ${results.length} results`);
          
          // Sort by match count first (descending), then by relevance score
          results.sort((a, b) => {
            if (b.matchCount !== a.matchCount) {
              return b.matchCount - a.matchCount; // More matches first
            }
            return b.relevanceScore - a.relevanceScore; // Then by relevance
          });
          
          // Limit results
          const limitedResults = results.slice(0, 50);
          
          const searchTime = Date.now() - startTime;
          
          console.log(`[Search] Returning ${limitedResults.length} results in ${searchTime}ms`);
          console.log(`[Search] Top result has ${limitedResults[0]?.matchCount || 0} matches`);
          
          setSearchResults(limitedResults);
          
          // Aggregate results for smart mode
          if (searchMode === 'smart') {
            const aggregated = aggregateResults(limitedResults);
            setAggregatedResults(aggregated);
            console.log(`[Smart Search] Aggregated into ${aggregated.totalMedicines} medicines`);
          } else {
            setAggregatedResults(null);
          }
        }
      } else if (searchMode === 'semantic') {
        // Semantic search using Ollama cloud models
        console.log('[Semantic Search] Query:', query);
        
        const aiSettings = localStorage.getItem('materiaMedicaAISettings');
        let ollamaUrl = 'http://localhost:11434';
        let ollamaModel = 'gpt-oss:20b-cloud';
        
        if (aiSettings) {
          try {
            const parsed = JSON.parse(aiSettings);
            ollamaUrl = parsed.ollamaUrl || 'http://localhost:11434';
            ollamaModel = parsed.ollamaModel || 'gpt-oss:20b-cloud';
          } catch (e) {
            console.error('[Semantic Search] Failed to parse AI settings:', e);
          }
        }
        
        // Call semantic search endpoint
        const response = await fetch('/api/materia-medica/semantic-search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query,
            ollamaUrl,
            ollamaModel
          })
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error('[Semantic Search] API Error:', errorText);
          throw new Error(`Semantic search failed: ${errorText}`);
        }
        
        const data = await response.json();
        
        if (data.success) {
          setSearchResults(data.results || []);
          setAiSearchData({
            interpretation: data.interpretation,
            answer: data.answer,
            suggestedMedicines: data.suggestedMedicines || [],
            recommendations: data.recommendations,
            aiPowered: data.aiPowered,
            provider: data.provider,
            model: data.model,
            chunksAnalyzed: data.chunksAnalyzed
          });
          console.log('[Semantic Search] Results:', data.results?.length || 0);
        } else {
          throw new Error(data.message || 'Semantic search failed');
        }
      }
    } catch (error) {
      console.error('Search error:', error);
      setSearchResults([]);
      
      // Parse error to get provider info
      let failedProvider = 'unknown';
      let errorMessage = error instanceof Error ? error.message : String(error);
      
      // Extract provider from error if available
      if (errorMessage.includes('Groq')) failedProvider = 'groq';
      else if (errorMessage.includes('Hugging Face')) failedProvider = 'huggingface';
      else if (errorMessage.includes('Ollama')) failedProvider = 'ollama';
      else if (errorMessage.includes('Semantic')) failedProvider = 'ollama';
      
      setAiSearchData({
        interpretation: 'AI Provider Error',
        answer: `The selected AI provider (${failedProvider}) failed to process your search.\n\nError: ${errorMessage}`,
        suggestedMedicines: [],
        recommendations: 'Try switching to a different AI provider or check your API configuration.',
        aiPowered: false,
        provider: failedProvider,
        error: true
      });
    } finally {
      setIsSearching(false);
    }
  };

  const handleCheckOllamaHealth = async () => {
    try {
      const aiSettings = localStorage.getItem('materiaMedicaAISettings');
      let ollamaUrl = 'http://localhost:11434';
      let ollamaModel = 'gpt-oss:20b-cloud';
      
      if (aiSettings) {
        try {
          const parsed = JSON.parse(aiSettings);
          ollamaUrl = parsed.ollamaUrl || 'http://localhost:11434';
          ollamaModel = parsed.ollamaModel || 'gpt-oss:20b-cloud';
        } catch (e) {
          console.error('Failed to parse AI settings:', e);
        }
      }

      console.log('[Ollama Diagnostic] Checking health at:', ollamaUrl, 'with model:', ollamaModel);
      
      const response = await fetch('/api/materia-medica/ollama-health', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ollamaUrl })
      });

      const data = await response.json();
      
      if (data.success && data.running) {
        const modelFound = data.models.includes(ollamaModel);
        const message = `✅ Ollama is running!\n\nAvailable models: ${data.models.join(', ')}\n\nYour configured model: ${ollamaModel}\n${modelFound ? '✅ Model found!' : '❌ Model NOT found - you may need to:\n1. For cloud models: Run "ollama signin" in the Ollama app\n2. For local models: Run "ollama pull ' + ollamaModel + '"'}`;
        alert(message);
      } else {
        alert(`❌ Ollama is not running or not accessible at ${ollamaUrl}\n\nMake sure:\n1. Ollama app is installed from ollama.com\n2. Ollama app is running\n3. For cloud models: Sign in with "ollama signin"\n\nError: ${data.message}`);
      }
    } catch (error) {
      console.error('Ollama health check error:', error);
      alert(`Error checking Ollama: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const handleFixSearch = async () => {
    if (isFixingSearch) return;
    
    setIsFixingSearch(true);
    setFixProgress({ current: 0, total: 10, stage: 'Initializing...' });
    
    try {
      const { materiaMedicaBookDb, materiaMedicaBookPageDb, materiaMedicaSearchIndexDb } = await import('@/lib/db/database');
      
      setFixProgress({ current: 1, total: 10, stage: 'Loading books...' });
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const allBooks = materiaMedicaBookDb.getAll();
      console.log('Found books:', allBooks.length);
      
      if (allBooks.length === 0) {
        alert('No books found! Please upload a book first.');
        setIsFixingSearch(false);
        return;
      }
      
      setFixProgress({ current: 2, total: 10, stage: 'Clearing old pages...' });
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Clear existing pages in batches
      const allPages = materiaMedicaBookPageDb.getAll();
      const pageBatchSize = 100;
      for (let i = 0; i < allPages.length; i += pageBatchSize) {
        const batch = allPages.slice(i, i + pageBatchSize);
        batch.forEach((page: any) => {
          materiaMedicaBookPageDb.delete(page.id);
        });
        await new Promise(resolve => setTimeout(resolve, 1));
      }
      
      setFixProgress({ current: 2.5, total: 10, stage: 'Clearing old indices...' });
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Clear existing indices in batches
      const allIndices = materiaMedicaSearchIndexDb.getAll();
      const indexBatchSize = 500;
      for (let i = 0; i < allIndices.length; i += indexBatchSize) {
        const batch = allIndices.slice(i, i + indexBatchSize);
        batch.forEach((index: any) => {
          materiaMedicaSearchIndexDb.delete(index.id);
        });
        
        const progress = Math.round((i / allIndices.length) * 100);
        setFixProgress({ 
          current: 2.5, 
          total: 10, 
          stage: `Clearing old indices... (${progress}%)` 
        });
        
        await new Promise(resolve => setTimeout(resolve, 1));
      }
      
      let totalIndices = 0;
      let processedBooks = 0;
      
      for (const book of allBooks) {
        const bookData = book as any;
        
        setFixProgress({ 
          current: 3 + Math.round((processedBooks / allBooks.length) * 4), 
          total: 10, 
          stage: `Extracting text from ${bookData.title}...` 
        });
        await new Promise(resolve => setTimeout(resolve, 10));
        
        console.log(`[Fix Search] Processing book: ${bookData.title}`);
        
        try {
          console.log(`[Fix Search] Book data:`, {
            id: bookData.id,
            title: bookData.title,
            filePath: bookData.filePath,
            fileName: bookData.fileName
          });
          
          // Validate required fields
          if (!bookData.id || !bookData.filePath) {
            console.error(`[Fix Search] Missing required fields for ${bookData.title}:`, {
              hasId: !!bookData.id,
              hasFilePath: !!bookData.filePath
            });
            alert(`Error: Book "${bookData.title}" is missing required data. Please re-upload the book.`);
            continue;
          }
          
          // Call the process API to extract real PDF text AND build indices on server
          const response = await fetch('/api/materia-medica/process', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              bookId: bookData.id,
              filePath: bookData.filePath,
              includeText: true,
              buildIndices: true
            })
          });
          
          const data = await response.json();
          
          if (!data.success) {
            console.error(`[Fix Search] Failed to process ${bookData.title}:`, data.message);
            alert(`Failed to process ${bookData.title}: ${data.message}`);
            continue;
          }
          
          console.log(`[Fix Search] Extracted ${data.pages.length} pages with ${data.searchIndices?.length || 0} indices`);
          
          // Check if any pages have text
          const pagesWithText = data.pages.filter((p: any) => p.text && p.text.length > 0);
          console.log(`[Fix Search] Pages with text: ${pagesWithText.length}/${data.pages.length}`);
          
          if (pagesWithText.length === 0) {
            console.warn(`[Fix Search] WARNING: PDF "${bookData.title}" has no extractable text. It may be a scanned image PDF. Starting OCR...`);
            
            setFixProgress({ 
              current: 7 + Math.round((processedBooks / allBooks.length) * 2), 
              total: 10, 
              stage: `Running OCR on ${bookData.title}...` 
            });
            
            // Call OCR API for scanned PDFs
            const ocrResponse = await fetch('/api/materia-medica/ocr', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                bookId: bookData.id
              })
            });
            
            const ocrData = await ocrResponse.json();
            
            if (!ocrData.success) {
              console.error(`[Fix Search] OCR failed for ${bookData.title}:`, ocrData.message);
              alert(`OCR processing failed for "${bookData.title}". Make sure Tesseract OCR is installed. See OCR_INSTALLATION.md for setup instructions.`);
              continue;
            }
            
            console.log(`[Fix Search] OCR started for ${bookData.title}`);
            
            // Wait for OCR to complete
            let ocrComplete = false;
            let ocrAttempts = 0;
            const maxAttempts = 300; // 5 minutes max
            
            while (!ocrComplete && ocrAttempts < maxAttempts) {
              await new Promise(resolve => setTimeout(resolve, 1000)); // Check every second
              
              const statusResponse = await fetch(`/api/materia-medica/ocr?bookId=${bookData.id}`);
              const statusData = await statusResponse.json();
              
              if (statusData.success) {
                const { status, progress, currentPage, totalPages, message } = statusData;
                
                setFixProgress({ 
                  current: 7 + Math.round((progress / 100) * 2), 
                  total: 10, 
                  stage: `OCR: ${message} (${currentPage}/${totalPages})` 
                });
                
                if (status === 'completed') {
                  ocrComplete = true;
                  console.log(`[Fix Search] OCR completed for ${bookData.title}`);
                } else if (status === 'failed') {
                  console.error(`[Fix Search] OCR failed: ${statusData.error}`);
                  alert(`OCR failed for "${bookData.title}": ${statusData.error}`);
                  ocrComplete = true;
                  continue;
                }
              }
              
              ocrAttempts++;
            }
            
            if (!ocrComplete) {
              console.error(`[Fix Search] OCR timeout for ${bookData.title}`);
              alert(`OCR processing timed out for "${bookData.title}". The file may be too large.`);
              continue;
            }
          }
          
          setFixProgress({ 
            current: 7 + Math.round((processedBooks / allBooks.length) * 2), 
            total: 10, 
            stage: `Storing pages for ${bookData.title}...` 
          });
          await new Promise(resolve => setTimeout(resolve, 10));
          
          // Store pages (in batches to avoid UI freeze)
          const pageBatchSize = 50;
          for (let i = 0; i < data.pages.length; i += pageBatchSize) {
            const batch = data.pages.slice(i, i + pageBatchSize);
            
            for (const page of batch) {
              materiaMedicaBookPageDb.create({
                bookId: bookData.id,
                pageNumber: page.pageNumber,
                text: page.text,
                wordCount: page.wordCount,
                hasImages: page.hasImages || false
              });
            }
            
            await new Promise(resolve => setTimeout(resolve, 1));
          }
          
          // Store search indices (in batches)
          if (data.searchIndices) {
            const indexBatchSize = 500;
            for (let i = 0; i < data.searchIndices.length; i += indexBatchSize) {
              const batch = data.searchIndices.slice(i, i + indexBatchSize);
              
              for (const index of batch) {
                materiaMedicaSearchIndexDb.create(index);
                totalIndices++;
              }
              
              // Update progress
              const progress = Math.round((i / data.searchIndices.length) * 100);
              setFixProgress({ 
                current: 9, 
                total: 10, 
                stage: `Indexing ${bookData.title}... (${progress}%)` 
              });
              
              await new Promise(resolve => setTimeout(resolve, 1));
            }
          }
          
          // Update book status
          materiaMedicaBookDb.update(bookData.id, {
            totalPages: data.totalPages,
            processingStatus: 'completed',
            indexStatus: 'indexed'
          });
          
          processedBooks++;
          
        } catch (error) {
          console.error(`[Fix Search] Error processing ${bookData.title}:`, error);
          const errorMsg = error instanceof Error ? error.message : String(error);
          alert(`Error processing ${bookData.title}: ${errorMsg}`);
        }
      }
      
      setFixProgress({ current: 10, total: 10, stage: 'Complete!' });
      
      console.log(`[Fix Search] Successfully processed ${processedBooks} books with ${totalIndices} search indices`);
      alert(`Successfully processed ${processedBooks} books! Created ${totalIndices} search entries from real PDF content. Search should now show accurate results.`);
      
    } catch (error) {
      console.error('Fix search error:', error);
      const errorMsg = error instanceof Error ? error.message : String(error);
      alert(`Failed to fix search: ${errorMsg}`);
    } finally {
      setIsFixingSearch(false);
      setTimeout(() => {
        setFixProgress({ current: 0, total: 0, stage: '' });
      }, 2000);
    }
  };

  const handleDeleteBook = async (book: any) => {
    // Show immediate feedback
    const bookTitle = book.title;
    
    try {
      const { materiaMedicaBookDb, materiaMedicaBookPageDb, materiaMedicaSearchIndexDb } = await import('@/lib/db/database');
      
      console.log(`[Delete] Deleting book: ${bookTitle}`);
      
      // Count items to delete
      const pages = materiaMedicaBookPageDb.getByBook(book.id);
      const allIndices = materiaMedicaSearchIndexDb.getAll();
      const bookIndices = allIndices.filter((index: any) => index.bookId === book.id);
      
      const totalItems = pages.length + bookIndices.length;
      console.log(`[Delete] Will delete ${pages.length} pages and ${bookIndices.length} indices`);
      
      // Show progress message for large deletions
      if (totalItems > 1000) {
        alert(`Deleting "${bookTitle}"...\n\nThis book has ${totalItems.toLocaleString()} items to delete.\nThis may take a few seconds. Please wait.`);
      }
      
      // Delete pages in batches to avoid UI freeze
      const pageBatchSize = 100;
      for (let i = 0; i < pages.length; i += pageBatchSize) {
        const batch = pages.slice(i, i + pageBatchSize);
        batch.forEach((page: any) => {
          materiaMedicaBookPageDb.delete(page.id);
        });
        // Yield to UI thread every 10 batches
        if (i % 1000 === 0) {
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      }
      
      // Delete search indices in batches to avoid UI freeze
      const indexBatchSize = 1000;
      for (let i = 0; i < bookIndices.length; i += indexBatchSize) {
        const batch = bookIndices.slice(i, i + indexBatchSize);
        batch.forEach((index: any) => {
          materiaMedicaSearchIndexDb.delete(index.id);
        });
        // Yield to UI thread every batch
        await new Promise(resolve => setTimeout(resolve, 10));
        
        // Log progress for large deletions
        if (bookIndices.length > 10000 && i % 5000 === 0) {
          console.log(`[Delete] Progress: ${i}/${bookIndices.length} indices deleted`);
        }
      }
      
      // Delete the book itself
      materiaMedicaBookDb.delete(book.id);
      
      console.log(`[Delete] Successfully deleted ${bookTitle} with ${pages.length} pages and ${bookIndices.length} indices`);
      
      // Refresh the book list
      onRefresh();
      
      alert(`Successfully deleted "${book.title}"`);
      
    } catch (error) {
      console.error('[Delete] Error:', error);
      alert(`Failed to delete book: ${error}`);
    }
  };

  const handleTestSearch = async () => {
    try {
      const { materiaMedicaSearchIndexDb, materiaMedicaBookPageDb, materiaMedicaBookDb } = await import('@/lib/db/database');
      const { generateSnippet, calculateRelevanceScore, normalizeText } = await import('@/lib/pdf-utils-client');
      
      const allIndices = materiaMedicaSearchIndexDb.getAll();
      
      if (allIndices.length === 0) {
        setTestResults('No search indices found! Run Fix Search first.');
        return;
      }
      
      // Get sample words from the index
      const uniqueWords = [...new Set(allIndices.map((index: any) => index.word))];
      const sampleWords = uniqueWords.slice(0, 20);
      
      // Check book data
      const allBooks = materiaMedicaBookDb.getAll();
      
      // Test some of these actual words
      let results = `Found ${allIndices.length} total indices\n`;
      results += `Found ${allBooks.length} books in database\n\n`;
      
      if (allBooks.length > 0) {
        const firstBook = allBooks[0] as any;
        results += `First book details:\n`;
        results += `  ID: ${firstBook.id}\n`;
        results += `  Title: ${firstBook.title}\n`;
        results += `  Author: ${firstBook.author}\n`;
        results += `  FilePath: ${firstBook.filePath || 'NOT SET'}\n`;
        results += `  Total Pages: ${firstBook.totalPages}\n\n`;
      }
      
      results += `Sample indexed words:\n${sampleWords.join(', ')}\n\n`;
      
      // Test searching for some of the actual indexed words
      const wordsToTest = sampleWords.slice(0, 5);
      results += `Testing exact word searches:\n`;
      
      for (const word of wordsToTest) {
        const searchResults = materiaMedicaSearchIndexDb.searchWord(word);
        results += `"${word}": ${searchResults.length} results\n`;
      }
      
      // Test partial matching with common search terms
      results += `\nTesting partial matching:\n`;
      const partialTests = ['aconite', 'arsen', 'bell', 'calc', 'mental'];
      
      for (const term of partialTests) {
        const searchResults = materiaMedicaSearchIndexDb.searchWord(term);
        results += `"${term}": ${searchResults.length} results\n`;
      }
      
      // Test full search with "aconite"
      results += `\nTesting full search with "aconite":\n`;
      try {
        const query = 'aconite';
        const normalizedQuery = normalizeText(query);
        const keywords = normalizedQuery.split(' ').filter(k => k.length > 0);
        
        const matchingPages = new Map<string, any>();
        
        for (const keyword of keywords) {
          const indexRecords = materiaMedicaSearchIndexDb.searchWord(keyword);
          
          for (const record of indexRecords) {
            const typedRecord = record as any;
            const pageKey = `${typedRecord.bookId}:${typedRecord.pageNumber}`;
            
            if (matchingPages.has(pageKey)) {
              const existing = matchingPages.get(pageKey);
              existing.matchCount += 1;
              existing.keywords.push(keyword);
              existing.totalFrequency += typedRecord.frequency;
            } else {
              matchingPages.set(pageKey, {
                bookId: typedRecord.bookId,
                pageNumber: typedRecord.pageNumber,
                matchCount: 1,
                keywords: [keyword],
                totalFrequency: typedRecord.frequency
              });
            }
          }
        }
        
        results += `Found ${matchingPages.size} matching pages\n`;
        
        // Build results
        const searchResults: any[] = [];
        
        for (const pageMatch of matchingPages.values()) {
          const page: any = materiaMedicaBookPageDb.getByBookAndPage(
            pageMatch.bookId,
            pageMatch.pageNumber
          );
          
          if (!page) continue;
          
          const book: any = materiaMedicaBookDb.getById(pageMatch.bookId);
          if (!book) continue;
          
          const relevanceScore = calculateRelevanceScore(
            pageMatch.matchCount,
            page.wordCount,
            keywords.length
          );
          
          const snippet = generateSnippet(page.text, pageMatch.keywords, 200);
          
          searchResults.push({
            bookId: pageMatch.bookId,
            bookTitle: book.title,
            bookAuthor: book.author,
            pageNumber: pageMatch.pageNumber,
            snippet,
            relevanceScore,
            matchCount: pageMatch.matchCount
          });
        }
        
        searchResults.sort((a, b) => b.relevanceScore - a.relevanceScore);
        
        results += `Built ${searchResults.length} results\n`;
        
        if (searchResults.length > 0) {
          results += `\nFirst result:\n`;
          results += `  Book: ${searchResults[0].bookTitle}\n`;
          results += `  Page: ${searchResults[0].pageNumber}\n`;
          results += `  Relevance: ${Math.round(searchResults[0].relevanceScore)}%\n`;
          results += `  Snippet: ${searchResults[0].snippet.substring(0, 100)}...\n`;
        }
        
      } catch (searchError) {
        results += `Search Error: ${searchError}\n`;
      }
      
      setTestResults(results);
      
    } catch (error) {
      setTestResults(`Test failed: ${error}`);
    }
  };

  const handleClearAllBooks = async () => {
    const confirmed = confirm(
      '⚠️ WARNING: This will permanently delete ALL books, pages, and search indices from the database.\n\nThis action cannot be undone.\n\nAre you sure you want to continue?'
    );
    
    if (!confirmed) return;
    
    try {
      const { materiaMedicaBookDb, materiaMedicaBookPageDb, materiaMedicaSearchIndexDb } = await import('@/lib/db/database');
      
      console.log('[Clear All] Starting cleanup...');
      
      // Get counts
      const allBooks = materiaMedicaBookDb.getAll();
      const allPages = materiaMedicaBookPageDb.getAll();
      const allIndices = materiaMedicaSearchIndexDb.getAll();
      
      console.log(`[Clear All] Found ${allBooks.length} books, ${allPages.length} pages, ${allIndices.length} indices`);
      
      // Clear all books
      allBooks.forEach((book: any) => {
        materiaMedicaBookDb.delete(book.id);
      });
      
      // Clear all pages
      allPages.forEach((page: any) => {
        materiaMedicaBookPageDb.delete(page.id);
      });
      
      // Clear all indices
      allIndices.forEach((index: any) => {
        materiaMedicaSearchIndexDb.delete(index.id);
      });
      
      console.log('[Clear All] Cleanup complete');
      
      alert(`✅ Successfully cleared all data:\n\n📚 ${allBooks.length} books deleted\n📄 ${allPages.length} pages deleted\n🔍 ${allIndices.length} search indices deleted`);
      
      // Refresh the view
      onRefresh();
      
    } catch (error) {
      console.error('[Clear All] Error:', error);
      alert(`Failed to clear data: ${error}`);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading books...</div>
      </div>
    );
  }

  const displayBooks = searchQuery ? searchResults : books;

  if (books.length === 0) {
    return (
      <Card className="p-12 text-center">
        <div className="text-6xl mb-4">📚</div>
        <h3 className="text-xl font-semibold text-gray-900 mb-2">No Books Yet</h3>
        <p className="text-gray-600 mb-6">
          Upload your first Materia Medica book to get started
        </p>
        <div className="flex gap-3 justify-center">
          <Button onClick={onRefresh}>Refresh</Button>
          <Button variant="secondary" onClick={handleTestSearch}>🧪 Test Search</Button>
        </div>
      </Card>
    );
  }

  return (
    <div>
      {/* Search Section */}
      <div className="mb-6 space-y-4">
        <div className="flex items-center gap-4">
          <div className="flex bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => {
                setSearchMode('books');
                setAiSearchData(null);
                setSearchResults([]);
              }}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                searchMode === 'books'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              📚 Search Books
            </button>
            <button
              onClick={() => {
                setSearchMode('content');
                setAiSearchData(null);
                setAggregatedResults(null);
              }}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                searchMode === 'content'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              🔍 Search Content
            </button>
            <button
              onClick={() => {
                setSearchMode('smart');
                setAiSearchData(null);
              }}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                searchMode === 'smart'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              📖 Smart Search
            </button>
            <button
              onClick={() => {
                setSearchMode('ai');
              }}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                searchMode === 'ai'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              🤖 AI Search
            </button>
            <button
              onClick={() => {
                setSearchMode('research');
              }}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                searchMode === 'research'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              🔬 Research Mode
            </button>
            <button
              onClick={() => {
                setSearchMode('semantic');
              }}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                searchMode === 'semantic'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              🧠 Semantic Search
            </button>
          </div>
          
          {/* Exact Match Toggle - Only show for Content search */}
          {searchMode === 'content' && (
            <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg">
              <input
                type="checkbox"
                id="exactMatch"
                checked={exactMatch}
                onChange={(e) => setExactMatch(e.target.checked)}
                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <label htmlFor="exactMatch" className="text-sm font-medium text-gray-700 cursor-pointer">
                🎯 Exact Phrase Match
              </label>
            </div>
          )}
          
          <Button
            variant="secondary"
            onClick={handleTestSearch}
          >
            🧪 Test Search
          </Button>
          
          <Button
            variant="secondary"
            onClick={handleFixSearch}
            disabled={isFixingSearch}
          >
            {isFixingSearch ? '🔄 Fixing...' : '🔧 Fix Search'}
          </Button>
          
          <Button
            variant="secondary"
            onClick={handleCheckOllamaHealth}
          >
            🔍 Check Ollama
          </Button>
          
          <Button
            variant="secondary"
            onClick={handleClearAllBooks}
            className="bg-red-50 text-red-700 hover:bg-red-100"
          >
            🗑️ Clear All Books
          </Button>
        </div>

        {/* Usage Tracker - Show for AI and Research modes */}
        {(searchMode === 'ai' || searchMode === 'research') && (
          <UsageTracker provider={currentProvider} model={currentModel} />
        )}

        {/* Progress Bar for Fix Search */}
        {isFixingSearch && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-blue-900">
                {fixProgress.stage}
              </span>
              <span className="text-sm text-blue-700">
                {fixProgress.current}/{fixProgress.total}
              </span>
            </div>
            <div className="w-full bg-blue-200 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${(fixProgress.current / Math.max(fixProgress.total, 1)) * 100}%` }}
              />
            </div>
            <div className="mt-2 text-xs text-blue-600">
              💡 You can navigate to other modules - this process will continue in the background
            </div>
          </div>
        )}

        {/* Test Results Display */}
        {testResults && (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-gray-900">🧪 Search Test Results</h3>
              <button
                onClick={() => setTestResults('')}
                className="text-gray-400 hover:text-gray-600 text-sm"
              >
                ✕ Close
              </button>
            </div>
            <pre className="text-xs text-gray-700 whitespace-pre-wrap font-mono bg-white p-3 rounded border max-h-64 overflow-y-auto">
              {testResults}
            </pre>
          </div>
        )}

        {/* Main Search Bar */}
        <div className="relative">
          <input
            type="text"
            placeholder={
              searchMode === 'books'
                ? "Search books by title, author, or tags..."
                : searchMode === 'ai'
                ? "Ask AI: e.g., 'remedy for fever with anxiety at night' or 'best medicine for headache with nausea'..."
                : "Search inside books for symptoms, remedies, or any text..."
            }
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            className="w-full px-4 py-3 pr-12 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
          {isSearching && (
            <div className="absolute right-4 top-1/2 transform -translate-y-1/2">
              <div className="animate-spin h-5 w-5 border-2 border-blue-500 border-t-transparent rounded-full"></div>
            </div>
          )}
        </div>

        {/* Search Results Info */}
        {searchQuery && (
          <div className="flex items-center justify-between text-sm text-gray-600">
            <span>
              {searchMode === 'smart' && aggregatedResults
                ? `Found ${aggregatedResults.totalMatches} matches in ${aggregatedResults.totalMedicines} medicines`
                : searchMode === 'content' && searchResults.length > 0
                ? `Found ${searchResults.length} matches in books`
                : `Showing ${displayBooks.length} ${searchMode === 'books' ? 'books' : 'results'}`}
            </span>
            <button
              onClick={() => {
                setSearchQuery('');
                setSearchResults([]);
                setAggregatedResults(null);
              }}
              className="text-blue-600 hover:text-blue-700"
            >
              Clear search
            </button>
          </div>
        )}
      </div>

      {/* Results */}
      {(searchMode === 'ai' || searchMode === 'research') && searchQuery ? (
        <AISearchResults 
          results={searchResults} 
          aiData={aiSearchData}
          onOpenBook={onOpenBook} 
          searchQuery={searchQuery}
          onRetrySearch={handleSearch}
        />
      ) : (searchMode === 'smart' && searchQuery && aggregatedResults) ? (
        <SmartSearchResults aggregatedResults={aggregatedResults} onOpenBook={onOpenBook} searchQuery={searchQuery} />
      ) : (searchMode === 'content' && searchQuery) ? (
        <ContentSearchResults results={searchResults} onOpenBook={onOpenBook} searchQuery={searchQuery} />
      ) : (
        <BooksGrid books={displayBooks} onOpenBook={onOpenBook} onDeleteBook={handleDeleteBook} />
      )}
    </div>
  );
}

// AI Search Results Component (NotebookLM-style)
function AISearchResults({ results, aiData, onOpenBook, searchQuery, onRetrySearch }: any) {
  console.log('[AISearchResults] Rendering with:', { 
    resultsCount: results?.length, 
    hasAiData: !!aiData,
    aiData 
  });
  
  const handleOpenResult = async (result: any) => {
    const { materiaMedicaBookDb } = await import('@/lib/db/database');
    const book = materiaMedicaBookDb.getById(result.bookId);
    
    if (book) {
      const keywords = searchQuery
        .toLowerCase()
        .split(/\s+/)
        .filter((word: string) => word.length > 2);
      
      onOpenBook({ 
        ...book, 
        initialPage: result.pageNumber,
        searchKeywords: keywords
      });
    }
  };
  
  if (!aiData && results.length === 0) {
    return (
      <Card className="p-8 text-center">
        <div className="text-4xl mb-4">🤖</div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">AI Search Not Configured</h3>
        <p className="text-gray-600 mb-4">
          To use AI-powered search, you need to configure your Groq API key
        </p>
        <div className="text-sm text-gray-700 space-y-2">
          <p>1. Go to Settings → AI Parsing</p>
          <p>2. Get a FREE API key from <a href="https://console.groq.com/keys" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">console.groq.com/keys</a></p>
          <p>3. Enable AI Parsing and save your settings</p>
          <p className="mt-4 text-xs text-gray-500">The same API key will be used for both prescription parsing and AI search</p>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* AI-Generated Answer Section */}
      {aiData && (
        <Card className={`p-6 border-2 ${aiData.researchMode ? 'bg-gradient-to-br from-purple-50 to-indigo-50 border-purple-300' : 'bg-gradient-to-br from-blue-50 to-purple-50 border-blue-200'}`}>
          <div className="flex items-start gap-3 mb-4">
            <div className="text-2xl">{aiData.researchMode ? '🔬' : '🤖'}</div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                {aiData.researchMode ? '🔬 Research Analysis' : (aiData.aiPowered ? '✨ AI-Powered Answer' : 'Search Interpretation')}
              </h3>
              
              {/* Interpretation */}
              {aiData.interpretation && (
                <div className="mb-4">
                  <p className="text-sm font-medium text-gray-700 mb-1">Understanding your query:</p>
                  <p className="text-gray-800">{aiData.interpretation}</p>
                </div>
              )}
              
              {/* AI Answer */}
              {aiData.answer && (
                <div className={`mb-4 p-4 rounded-lg border ${aiData.researchMode ? 'bg-white border-purple-200' : 'bg-white border-blue-200'}`}>
                  <p className="text-sm font-medium text-gray-700 mb-2">Answer:</p>
                  <div className="text-gray-900 leading-relaxed space-y-3">
                    {renderFormattedAnswer(aiData.answer)}
                  </div>
                </div>
              )}
              
              {/* Research Mode: Detailed Analysis */}
              {aiData.researchMode && aiData.detailedAnalysis && (
                <div className="mb-4 p-4 bg-white rounded-lg border border-purple-200">
                  <p className="text-sm font-medium text-purple-700 mb-2">📊 Detailed Analysis:</p>
                  <p className="text-gray-900 leading-relaxed whitespace-pre-line">{aiData.detailedAnalysis}</p>
                </div>
              )}
              
              {/* Research Mode: Cross References */}
              {aiData.researchMode && aiData.crossReferences && aiData.crossReferences.length > 0 && (
                <div className="mb-4 p-4 bg-white rounded-lg border border-purple-200">
                  <p className="text-sm font-medium text-purple-700 mb-2">🔗 Cross References:</p>
                  <ul className="list-disc list-inside space-y-1 text-sm text-gray-800">
                    {aiData.crossReferences.map((ref: string, idx: number) => (
                      <li key={idx}>{ref}</li>
                    ))}
                  </ul>
                </div>
              )}
              
              {/* Research Mode: Comparative Analysis */}
              {aiData.researchMode && aiData.comparativeAnalysis && (
                <div className="mb-4 p-4 bg-white rounded-lg border border-purple-200">
                  <p className="text-sm font-medium text-purple-700 mb-2">⚖️ Comparative Analysis:</p>
                  <p className="text-gray-900 leading-relaxed whitespace-pre-line">{aiData.comparativeAnalysis}</p>
                </div>
              )}
              
              {/* Suggested Medicines */}
              {aiData.suggestedMedicines && aiData.suggestedMedicines.length > 0 && (
                <div className="mb-4">
                  <p className="text-sm font-medium text-gray-700 mb-2">💊 Suggested Medicines:</p>
                  <div className="flex flex-wrap gap-2">
                    {aiData.suggestedMedicines.map((medicine: string, idx: number) => (
                      <Badge key={idx} variant="default" className={aiData.researchMode ? 'bg-purple-100 text-purple-800 border-purple-300' : 'bg-purple-100 text-purple-800 border-purple-300'}>
                        {medicine}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Recommendations */}
              {aiData.recommendations && (
                <div className={`p-4 rounded-lg border ${aiData.researchMode ? 'bg-white border-purple-200' : 'bg-white border-blue-200'}`}>
                  <p className="text-sm font-medium text-gray-700 mb-2">📋 Recommendations:</p>
                  <p className="text-gray-800 text-sm whitespace-pre-line">{aiData.recommendations}</p>
                </div>
              )}
              
              {/* Error: Provider Switching Options */}
              {aiData.error && (
                <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm font-medium text-red-800 mb-3">Try a different AI provider:</p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        const settings = localStorage.getItem('materiaMedicaAISettings');
                        const parsed = settings ? JSON.parse(settings) : {};
                        parsed.provider = 'groq';
                        localStorage.setItem('materiaMedicaAISettings', JSON.stringify(parsed));
                        onRetrySearch(searchQuery);
                      }}
                    >
                      🚀 Try Groq
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        const settings = localStorage.getItem('materiaMedicaAISettings');
                        const parsed = settings ? JSON.parse(settings) : {};
                        parsed.provider = 'gemini';
                        localStorage.setItem('materiaMedicaAISettings', JSON.stringify(parsed));
                        onRetrySearch(searchQuery);
                      }}
                    >
                      🔷 Try Gemini
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        const settings = localStorage.getItem('materiaMedicaAISettings');
                        const parsed = settings ? JSON.parse(settings) : {};
                        parsed.provider = 'huggingface';
                        localStorage.setItem('materiaMedicaAISettings', JSON.stringify(parsed));
                        onRetrySearch(searchQuery);
                      }}
                    >
                      🤗 Try Hugging Face
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        const settings = localStorage.getItem('materiaMedicaAISettings');
                        const parsed = settings ? JSON.parse(settings) : {};
                        parsed.provider = 'ollama';
                        localStorage.setItem('materiaMedicaAISettings', JSON.stringify(parsed));
                        onRetrySearch(searchQuery);
                      }}
                    >
                      🦙 Try Ollama
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => {
                        window.location.href = '/settings/materia-medica-ai';
                      }}
                    >
                      ⚙️ Configure AI Settings
                    </Button>
                  </div>
                </div>
              )}
              
              {/* Provider Info */}
              {aiData.provider && !aiData.error && (
                <div className="mt-4 text-xs text-gray-500">
                  Powered by {aiData.provider === 'groq' ? 'Groq' : aiData.provider === 'gemini' ? 'Google Gemini' : aiData.provider === 'huggingface' ? 'Hugging Face' : 'Ollama'}
                  {aiData.model && ` (${aiData.model})`}
                </div>
              )}
            </div>
          </div>
        </Card>
      )}
      
      {/* Source Citations */}
      {results.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            📚 Sources ({results.length} references found)
          </h3>
          <div className="space-y-3">
            {results.slice(0, aiData?.researchMode ? 5 : 10).map((result: any, index: number) => (
              <Card 
                key={index} 
                className={`p-4 hover:shadow-md transition-shadow cursor-pointer border-l-4 ${aiData?.researchMode ? 'border-l-purple-500' : 'border-l-blue-500'}`}
                onClick={() => handleOpenResult(result)}
              >
                <div className="flex items-start gap-3">
                  <div className={`w-10 h-12 rounded flex items-center justify-center text-white text-sm flex-shrink-0 ${aiData?.researchMode ? 'bg-gradient-to-br from-purple-500 to-indigo-600' : 'bg-gradient-to-br from-blue-500 to-purple-600'}`}>
                    📖
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-medium text-gray-900 text-sm">{result.bookTitle}</h4>
                      <Badge variant="default" className="text-xs">Page {result.pageNumber}</Badge>
                    </div>
                    <p className="text-xs text-gray-500 mb-2">by {result.bookAuthor}</p>
                    <p className="text-sm text-gray-700 line-clamp-2" dangerouslySetInnerHTML={{ __html: result.snippet }} />
                    <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
                      <span>Relevance: {Math.round(result.relevanceScore)}%</span>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Content Search Results Component
function ContentSearchResults({ results, onOpenBook, searchQuery }: any) {
  const handleOpenResult = async (result: any) => {
    // Fetch the full book object from the database
    const { materiaMedicaBookDb } = await import('@/lib/db/database');
    const book = materiaMedicaBookDb.getById(result.bookId);
    
    if (book) {
      // Extract keywords from search query
      const keywords = searchQuery
        .toLowerCase()
        .split(/\s+/)
        .filter((word: string) => word.length > 2);
      
      // Pass the full book object with the page number and search keywords
      onOpenBook({ 
        ...book, 
        initialPage: result.pageNumber,
        searchKeywords: keywords
      });
    } else {
      alert('Book not found in database');
    }
  };
  
  if (results.length === 0) {
    return (
      <Card className="p-8 text-center">
        <div className="text-4xl mb-4">🔍</div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">No matches found</h3>
        <p className="text-gray-600 mb-4">
          Try different keywords or check spelling
        </p>
        <div className="text-sm text-gray-500">
          <p>💡 <strong>Tip:</strong> Content search works with the extracted text from your PDFs.</p>
          <p>Try searching for "aconite", "anxiety", "fever", or "symptoms"</p>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {results.map((result: any, index: number) => (
        <Card key={index} className="p-4 hover:shadow-md transition-shadow cursor-pointer" onClick={() => handleOpenResult(result)}>
          <div className="flex items-start gap-4">
            <div className="w-12 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded flex items-center justify-center text-white text-xl flex-shrink-0">
              📖
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <h3 className="font-medium text-gray-900 truncate">{result.bookTitle}</h3>
                <span className="text-sm text-gray-500">by {result.bookAuthor}</span>
                <Badge variant="default">Page {result.pageNumber}</Badge>
                {result.matchType === 'exact' ? (
                  <Badge variant="success" className="bg-green-100 text-green-800 border-green-300 font-bold">
                    ✓ Exact Match
                  </Badge>
                ) : result.matchType === 'partial' ? (
                  <Badge variant="default" className="bg-orange-100 text-orange-800 border-orange-300">
                    ~ Reference ({result.matchCount} words)
                  </Badge>
                ) : (
                  <Badge variant="success" className="bg-green-100 text-green-800 border-green-300">
                    {result.matchCount} {result.matchCount === 1 ? 'match' : 'matches'}
                  </Badge>
                )}
              </div>
              <p className="text-sm text-gray-600 line-clamp-3" dangerouslySetInnerHTML={{ __html: result.snippet }} />
              <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                <span>Relevance: {Math.round(result.relevanceScore)}%</span>
              </div>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

// Smart Search Results Component (NotebookLM-style aggregation)
function SmartSearchResults({ aggregatedResults, onOpenBook, searchQuery }: any) {
  const [expandedMedicines, setExpandedMedicines] = React.useState<Set<string>>(new Set());
  const [expandedSections, setExpandedSections] = React.useState<Set<string>>(new Set());

  const handleOpenResult = async (bookId: string, pageNumber: number) => {
    const { materiaMedicaBookDb } = await import('@/lib/db/database');
    const book = materiaMedicaBookDb.getById(bookId);
    
    if (book) {
      const keywords = searchQuery.toLowerCase().split(/\s+/).filter((w: string) => w.length > 2);
      console.log('[SmartSearch] Opening book:', bookId, 'page:', pageNumber, 'keywords:', keywords);
      onOpenBook({ 
        ...book, 
        initialPage: pageNumber,
        searchKeywords: keywords
      });
    } else {
      console.error('[SmartSearch] Book not found:', bookId);
    }
  };

  const toggleMedicine = (medicineName: string) => {
    const newExpanded = new Set(expandedMedicines);
    if (newExpanded.has(medicineName)) {
      newExpanded.delete(medicineName);
    } else {
      newExpanded.add(medicineName);
    }
    setExpandedMedicines(newExpanded);
  };

  const toggleSection = (sectionKey: string) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(sectionKey)) {
      newExpanded.delete(sectionKey);
    } else {
      newExpanded.add(sectionKey);
    }
    setExpandedSections(newExpanded);
  };

  // Highlight search terms in full content
  const highlightContent = (text: string) => {
    const keywords = searchQuery.toLowerCase().split(/\s+/).filter((w: string) => w.length > 2);
    let highlighted = text;
    keywords.forEach((keyword: string) => {
      const regex = new RegExp(`(${keyword})`, 'gi');
      highlighted = highlighted.replace(regex, '<mark class="bg-yellow-300 font-semibold">$1</mark>');
    });
    return highlighted;
  };

  // Generate intro text based on search query
  const generateIntro = () => {
    const conditions = searchQuery.split(/[,;]/).map((c: string) => c.trim()).filter((c: string) => c);
    if (conditions.length > 1) {
      return `For the conditions of ${conditions.join(' and ')}, the sources identify several homoeopathic remedies and their specific indications.`;
    }
    return `For ${searchQuery}, the homoeopathic sources identify several remedies with specific indications.`;
  };

  return (
    <div className="space-y-6">
      {/* Intro Section */}
      <Card className="p-6 bg-gradient-to-r from-blue-50 to-indigo-50 border-l-4 border-l-blue-600">
        <h1 className="text-2xl font-bold text-gray-900 mb-3">{searchQuery}</h1>
        <p className="text-gray-700 leading-relaxed">{generateIntro()}</p>
      </Card>

      {/* Remedies by Category */}
      {aggregatedResults.medicines.map((medicine: any, medicineIndex: number) => {
        const isExpanded = expandedMedicines.has(medicine.name);
        const totalSnippets = Object.values(medicine.sections).reduce((sum: number, snippets: any) => sum + snippets.length, 0);

        return (
          <Card key={medicineIndex} className="overflow-hidden hover:shadow-lg transition-shadow">
            {/* Medicine Header - Clickable */}
            <div
              onClick={() => toggleMedicine(medicine.name)}
              className="p-5 bg-gradient-to-r from-blue-500 to-blue-600 text-white cursor-pointer hover:from-blue-600 hover:to-blue-700 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <h2 className="text-xl font-bold mb-1">{medicine.name}</h2>
                  <p className="text-blue-100 text-sm">{totalSnippets} matching sections • {medicine.bookTitle}</p>
                </div>
                <div className="text-2xl">
                  {isExpanded ? '▼' : '▶'}
                </div>
              </div>
            </div>

            {/* Expanded Content */}
            {isExpanded && (
              <div className="p-6 space-y-4 bg-white">
                {Object.entries(medicine.sections).map(([sectionName, snippets]: [string, any]) => {
                  const sectionKey = `${medicine.name}-${sectionName}`;
                  const isSectionExpanded = expandedSections.has(sectionKey);
                  
                  return (
                    <div key={sectionName} className="border-l-4 border-l-indigo-300 pl-4">
                      {/* Section Header - Clickable */}
                      <div
                        onClick={() => toggleSection(sectionKey)}
                        className="flex items-center justify-between cursor-pointer hover:bg-gray-50 p-2 rounded transition-colors"
                      >
                        <h3 className="font-bold text-gray-900 text-lg">{sectionName}:</h3>
                        <span className="text-sm text-gray-500">{snippets.length} match{snippets.length !== 1 ? 'es' : ''}</span>
                        <span className="text-lg text-gray-600">{isSectionExpanded ? '▼' : '▶'}</span>
                      </div>

                      {/* Full Section Content */}
                      {isSectionExpanded && (
                        <div className="mt-3 space-y-3">
                          {snippets.map((snippet: any, snippetIndex: number) => (
                            <div
                              key={snippetIndex}
                              className="bg-gray-50 p-4 rounded border border-gray-200 hover:border-blue-400 hover:bg-blue-50 transition-all cursor-pointer group"
                              onClick={() => handleOpenResult(medicine.bookId, snippet.pageNumber)}
                            >
                              {/* Full Content with Highlighting */}
                              <div 
                                className="text-sm text-gray-800 leading-relaxed mb-3 prose prose-sm max-w-none"
                                dangerouslySetInnerHTML={{ __html: highlightContent(snippet.snippet) }}
                              />

                              {/* Meta Info */}
                              <div className="flex items-center justify-between text-xs text-gray-500 group-hover:text-blue-600 pt-2 border-t border-gray-200">
                                <span className="flex items-center gap-1">
                                  📖 Page {snippet.pageNumber}
                                </span>
                                <span className="flex items-center gap-1">
                                  ⭐ {Math.round(snippet.relevanceScore)}%
                                </span>
                                <span className="text-blue-600 group-hover:font-semibold">View in Book →</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* View Full Medicine Button */}
                <button
                  onClick={() => {
                    const sections = Object.values(medicine.sections) as any[];
                    const firstSnippet = sections.length > 0 ? (sections[0] as any[])[0] : null;
                    if (firstSnippet) {
                      handleOpenResult(medicine.bookId, firstSnippet.pageNumber);
                    }
                  }}
                  className="w-full mt-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                >
                  📖 View Full Medicine Details in Book
                </button>
              </div>
            )}
          </Card>
        );
      })}

      {/* Summary Stats */}
      <Card className="p-4 bg-gray-50 text-center">
        <p className="text-sm text-gray-600">
          Found <span className="font-bold text-gray-900">{aggregatedResults.totalMatches}</span> matching sections across{' '}
          <span className="font-bold text-gray-900">{aggregatedResults.totalMedicines}</span> remedies
        </p>
      </Card>
    </div>
  );
}

// Books Grid Component
function BooksGrid({ books, onOpenBook, onDeleteBook }: any) {
  if (books.length === 0) {
    return (
      <Card className="p-8 text-center">
        <div className="text-4xl mb-4">📚</div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">No books found</h3>
        <p className="text-gray-600">Try adjusting your search or filters</p>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      {books.map((book: any) => (
        <BookCard key={book.id} book={book} onClick={() => onOpenBook(book)} onDelete={() => onDeleteBook(book)} />
      ))}
    </div>
  );
}

// Book Card Component
function BookCard({ book, onClick, onDelete }: any) {
  const [isOCRProcessing, setIsOCRProcessing] = useState(false);
  const [ocrProgress, setOcrProgress] = useState<any>(null);
  
  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent opening the book when clicking delete
    if (confirm(`Are you sure you want to delete "${book.title}"? This will remove the book and all its search data.`)) {
      onDelete();
    }
  };
  
  const handleOCR = async (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent opening the book
    
    if (isOCRProcessing) return;
    
    const confirmed = confirm(
      `Convert "${book.title}" to OCR?\n\n` +
      `This will:\n` +
      `• Extract text from all pages using OCR\n` +
      `• Make the book fully searchable\n` +
      `• Take 30 seconds to 2 minutes\n\n` +
      `Continue?`
    );
    
    if (!confirmed) return;
    
    setIsOCRProcessing(true);
    
    try {
      // Start OCR processing
      const response = await fetch('/api/materia-medica/ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookId: book.id })
      });
      
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.message || 'Failed to start OCR');
      }
      
      // Poll for progress
      const pollInterval = setInterval(async () => {
        try {
          const statusResponse = await fetch(`/api/materia-medica/ocr?bookId=${book.id}`);
          const statusData = await statusResponse.json();
          
          if (statusData.success) {
            setOcrProgress(statusData);
            
            if (statusData.status === 'completed') {
              clearInterval(pollInterval);
              setIsOCRProcessing(false);
              alert(`✅ OCR Complete!\n\n${statusData.message}`);
              setOcrProgress(null);
            } else if (statusData.status === 'failed') {
              clearInterval(pollInterval);
              setIsOCRProcessing(false);
              alert(`❌ OCR Failed\n\n${statusData.error || 'Unknown error'}`);
              setOcrProgress(null);
            }
          }
        } catch (pollError) {
          console.error('[OCR] Poll error:', pollError);
        }
      }, 1000); // Poll every second
      
      // Cleanup on unmount
      return () => clearInterval(pollInterval);
      
    } catch (error) {
      console.error('[OCR] Error:', error);
      alert(`Failed to start OCR: ${error}`);
      setIsOCRProcessing(false);
      setOcrProgress(null);
    }
  };
  
  return (
    <Card className="p-4 hover:shadow-lg transition-shadow cursor-pointer relative group" onClick={onClick}>
      {/* Delete button - shows on hover */}
      <button
        onClick={handleDelete}
        className="absolute top-2 right-2 bg-red-500 text-white p-2 rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600 z-10"
        title="Delete book"
      >
        🗑️
      </button>
      
      {/* OCR button - shows on hover */}
      <button
        onClick={handleOCR}
        disabled={isOCRProcessing}
        className="absolute top-2 right-14 bg-blue-500 text-white p-2 rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-blue-600 z-10 disabled:opacity-50 disabled:cursor-not-allowed"
        title="Convert to OCR"
      >
        🔍
      </button>
      
      <div className="aspect-[3/4] bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg mb-3 flex items-center justify-center text-white text-4xl">
        📖
      </div>
      
      {/* OCR Progress Overlay */}
      {isOCRProcessing && ocrProgress && (
        <div className="absolute inset-0 bg-white bg-opacity-95 rounded-lg flex flex-col items-center justify-center p-4 z-20">
          <div className="text-2xl mb-2">🔄</div>
          <div className="text-sm font-medium text-gray-900 mb-2 text-center">
            {ocrProgress.message}
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${ocrProgress.progress}%` }}
            />
          </div>
          <div className="text-xs text-gray-600">
            Page {ocrProgress.currentPage} of {ocrProgress.totalPages}
          </div>
        </div>
      )}
      
      <h3 className="font-semibold text-gray-900 mb-1 line-clamp-2">{book.title}</h3>
      <p className="text-sm text-gray-600 mb-2">{book.author}</p>
      <div className="flex items-center justify-between text-xs text-gray-500">
        <span>{book.totalPages} pages</span>
        <span>{book.category}</span>
      </div>
      {book.tags && book.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {book.tags.slice(0, 2).map((tag: string, index: number) => (
            <Badge key={index} variant="default" className="text-xs">
              {tag}
            </Badge>
          ))}
          {book.tags.length > 2 && (
            <Badge variant="default" className="text-xs">
              +{book.tags.length - 2}
            </Badge>
          )}
        </div>
      )}
    </Card>
  );
}

// Upload View Component with Progress Tracking
function UploadView({ onUploadComplete }: any) {
  const [uploadMode, setUploadMode] = useState<'pdf' | 'web'>('pdf');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [title, setTitle] = useState<string>('');
  const [author, setAuthor] = useState<string>('');
  const [textContent, setTextContent] = useState<string>('');
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [uploadStatus, setUploadStatus] = useState<string>('');
  
  // Web import states
  const [webUrl, setWebUrl] = useState<string>('');
  const [webTitle, setWebTitle] = useState<string>('');
  const [webAuthor, setWebAuthor] = useState<string>('');
  const [testMode, setTestMode] = useState<boolean>(false);
  const [isImporting, setIsImporting] = useState<boolean>(false);
  const [importBookId, setImportBookId] = useState<string | null>(null);
  const [importProgress, setImportProgress] = useState<any>(null);
  const [cancelImport, setCancelImport] = useState<boolean>(false);
  const [pollIntervalRef, setPollIntervalRef] = useState<NodeJS.Timeout | null>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const isPdf = file.type === 'application/pdf';
      const isWord = file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
                     file.type === 'application/msword' ||
                     file.name.endsWith('.docx') ||
                     file.name.endsWith('.doc');
      
      if (!isPdf && !isWord) {
        alert('Please select a PDF or Word (.docx) file');
        return;
      }
      setSelectedFile(file);
      // Auto-fill title from filename
      const fileName = file.name.replace(/\.(pdf|docx|doc)$/i, '').replace(/_/g, ' ');
      setTitle(fileName);
    }
  };

  const handleUpload = async () => {
    if (!title || !author) {
      alert('Please fill in title and author');
      return;
    }
    
    if (!selectedFile && !textContent.trim()) {
      alert('Please provide either a PDF file or text content');
      return;
    }

    setIsUploading(true);
    setUploadProgress(10);
    setUploadStatus('Uploading...');

    try {
      // Create FormData
      const formData = new FormData();
      
      if (selectedFile) {
        formData.append('file', selectedFile);
      }
      formData.append('metadata', JSON.stringify({ title, author }));
      
      // Only include text content if provided
      if (textContent.trim()) {
        formData.append('textContent', textContent);
      }

      setUploadProgress(30);
      setUploadStatus('Processing file...');

      // Upload file
      const response = await fetch('/api/materia-medica/upload', {
        method: 'POST',
        body: formData
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.message || 'Upload failed');
      }

      setUploadProgress(70);
      setUploadStatus('Saving to database...');

      // Save book metadata to database
      const { materiaMedicaBookDb } = await import('@/lib/db/database');
      
      materiaMedicaBookDb.create({
        id: data.bookId,
        title,
        author,
        filePath: data.filePath,
        fileName: data.fileName || data.filePath.split('/').pop() || `${data.bookId}.pdf`,
        fileSize: data.fileSize,
        totalPages: data.totalPages || 0,
        language: 'en',
        category: 'materia-medica' as const,
        tags: [],
        uploadedBy: 'user',
        uploadedAt: new Date(),
        accessCount: 0,
        processingStatus: data.processingStatus || 'completed',
        indexStatus: data.indexStatus || 'pending',
        embeddingStatus: 'pending',
        fullText: data.fullText || textContent || '' // Use formatted fullText from API if available
      });

      console.log(`[Upload Client] Saved book with ${data.totalPages || 0} pages`);

      setUploadProgress(100);
      setUploadStatus('Complete!');

      // Show success message
      if (textContent && data.totalPages && data.searchIndices) {
        alert(`✅ Success!\n\nUploaded and processed "${title}"\n\n📄 ${data.totalPages} medicine pages created\n🔍 ${data.searchIndices} searchable terms indexed\n📋 Medicine index built automatically\n\nYou can now search and read this book!`);
      } else if (data.fileType === 'docx' && data.totalPages && data.searchIndices) {
        alert(`✅ Word Document Processed!\n\n"${title}" has been successfully imported.\n\n📄 ${data.totalPages} medicines extracted\n🔍 ${data.searchIndices} searchable terms indexed\n📋 Formatting preserved\n\nYou can now search by section and read with formatting!`);
      } else if (data.fileType === 'docx') {
        alert(`✅ Word Document uploaded!\n\n"${title}" has been added to your library.\n\n💡 Processing will start automatically. Check back in a moment!`);
      } else {
        alert(`✅ PDF uploaded successfully!\n\n"${title}" has been added to your library.\n\n💡 Tip: Use the OCR button (🔍) on the book card to extract text and make it searchable.`);
      }

      // Reset form and go back to library
      setTimeout(() => {
        setSelectedFile(null);
        setTitle('');
        setAuthor('');
        setTextContent('');
        setIsUploading(false);
        setUploadProgress(0);
        setUploadStatus('');
        onUploadComplete();
      }, 1000);

    } catch (error) {
      console.error('Upload error:', error);
      alert(`Upload failed: ${error}`);
      setIsUploading(false);
      setUploadProgress(0);
      setUploadStatus('');
    }
  };

  const handleWebImport = async () => {
    if (!webUrl || !webTitle || !webAuthor) {
      alert('Please fill in URL, title, and author');
      return;
    }

    setIsImporting(true);
    setCancelImport(false);

    try {
      // Start web import
      const response = await fetch('/api/materia-medica/import-web', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: webUrl,
          bookTitle: webTitle,
          author: webAuthor,
          testMode: testMode
        })
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.message || 'Import failed');
      }

      setImportBookId(data.bookId);

      // Poll for progress
      const interval = setInterval(async () => {
        try {
          const statusResponse = await fetch(`/api/materia-medica/import-web?bookId=${data.bookId}`);
          const statusData = await statusResponse.json();

          if (statusData.success) {
            setImportProgress(statusData);

            if (statusData.status === 'completed') {
              clearInterval(interval);
              
              // Create book record on client side with fullText
              const { materiaMedicaBookDb } = await import('@/lib/db/database');
              
              materiaMedicaBookDb.create({
                id: data.bookId,
                title: webTitle,
                author: webAuthor,
                filePath: '',
                fileName: '',
                fileSize: 0,
                totalPages: statusData.totalPages,
                language: 'en',
                category: 'materia-medica' as const,
                tags: [],
                uploadedBy: 'user',
                uploadedAt: new Date(),
                accessCount: 0,
                processingStatus: 'completed',
                indexStatus: 'indexed',
                embeddingStatus: 'pending',
                fullText: statusData.fullText || ''
              });
              
              console.log(`[Web Import Client] Created book record for ${webTitle} with ${statusData.fullText?.length || 0} chars`);
              
              const successMessage = testMode 
                ? `✅ Test Import Complete!\n\nImported "${webTitle}"\n\n📄 ${statusData.totalPages} pages extracted (test mode - first 30 medicines)\n\n💡 Uncheck "Test Mode" to import the full book.`
                : `✅ Success!\n\nImported "${webTitle}"\n\n📄 ${statusData.totalPages} pages extracted\n\nYou can now search and read this book!`;
              
              alert(successMessage);

              // Reset form and go back to library
              setTimeout(() => {
                setWebUrl('');
                setWebTitle('');
                setWebAuthor('');
                setTestMode(false);
                setIsImporting(false);
                setImportBookId(null);
                setImportProgress(null);
                setPollIntervalRef(null);
                onUploadComplete();
              }, 1000);
            } else if (statusData.status === 'failed') {
              clearInterval(interval);
              throw new Error(statusData.error || 'Import failed');
            }
          }
        } catch (pollError) {
          console.error('Poll error:', pollError);
        }
      }, 1000);
      
      setPollIntervalRef(interval);

    } catch (error) {
      console.error('Web import error:', error);
      alert(`Import failed: ${error}`);
      setIsImporting(false);
      setImportBookId(null);
      setImportProgress(null);
      setPollIntervalRef(null);
      setTestMode(false);
    }
  };

  const handleStopImport = async () => {
    if (!confirm('Stop the import and save what has been imported so far?')) {
      return;
    }
    
    console.log('[Web Import] Stop button clicked');
    
    // Clear the interval immediately
    if (pollIntervalRef) {
      clearInterval(pollIntervalRef);
      setPollIntervalRef(null);
    }
    
    // Get current progress and save
    if (importBookId) {
      try {
        const statusResponse = await fetch(`/api/materia-medica/import-web?bookId=${importBookId}`);
        const statusData = await statusResponse.json();
        
        if (statusData.success && statusData.currentPage > 0) {
          // Save partial data
          const { materiaMedicaBookDb } = await import('@/lib/db/database');
          
          materiaMedicaBookDb.create({
            id: importBookId,
            title: webTitle,
            author: webAuthor,
            filePath: '',
            fileName: '',
            fileSize: 0,
            totalPages: statusData.currentPage,
            language: 'en',
            category: 'materia-medica' as const,
            tags: [],
            uploadedBy: 'user',
            uploadedAt: new Date(),
            accessCount: 0,
            processingStatus: 'partial',
            indexStatus: 'indexed',
            embeddingStatus: 'pending',
            fullText: statusData.fullText || ''
          });
          
          alert(`⚠️ Import Stopped\n\nSaved partial data:\n📄 ${statusData.currentPage} of ${statusData.totalPages} pages\n\nThe book is now in your library. The backend will continue processing in the background.`);
        } else {
          alert('Import stopped. Not enough data to save yet.');
        }
      } catch (error) {
        console.error('[Web Import] Error saving partial data:', error);
        alert('Import stopped.');
      }
    }
    
    // Reset state
    setIsImporting(false);
    setImportBookId(null);
    setImportProgress(null);
    setCancelImport(false);
    setWebUrl('');
    setWebTitle('');
    setWebAuthor('');
    onUploadComplete();
  };

  return (
    <Card className="p-8 max-w-2xl mx-auto">
      <div className="text-center mb-6">
        <div className="text-6xl mb-4">📚</div>
        <h3 className="text-xl font-semibold text-gray-900 mb-2">Add Materia Medica Book</h3>
        <p className="text-gray-600">
          Upload a PDF or import from a website
        </p>
      </div>

      {/* Mode Selector */}
      <div className="flex bg-gray-100 rounded-lg p-1 mb-6">
        <button
          onClick={() => setUploadMode('pdf')}
          className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            uploadMode === 'pdf'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          📄 Upload PDF
        </button>
        <button
          onClick={() => setUploadMode('web')}
          className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            uploadMode === 'web'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          🌐 Import from Web
        </button>
      </div>

      {uploadMode === 'pdf' ? (
        <div className="space-y-4">
          {/* File Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              PDF or Word File (Optional)
            </label>
            <input
              type="file"
              accept=".pdf,.docx,.doc,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword"
              onChange={handleFileSelect}
              disabled={isUploading}
              className="block w-full text-sm text-gray-500
                file:mr-4 file:py-2 file:px-4
                file:rounded-md file:border-0
                file:text-sm file:font-semibold
                file:bg-blue-50 file:text-blue-700
                hover:file:bg-blue-100
                disabled:opacity-50"
            />
            {selectedFile && (
              <p className="mt-2 text-sm text-gray-600">
                Selected: {selectedFile.name} ({(selectedFile.size / 1024 / 1024).toFixed(2)} MB)
              </p>
            )}
            <p className="mt-1 text-xs text-gray-500">
              Optional: Select a PDF file for reference. You can also upload text content only.
            </p>
          </div>

          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Book Title *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={isUploading}
              placeholder="e.g., Boericke Materia Medica"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            />
          </div>

          {/* Author */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Author *
            </label>
            <input
              type="text"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              disabled={isUploading}
              placeholder="e.g., William Boericke"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            />
          </div>

          {/* Text Content */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Book Text Content *
            </label>
            <textarea
              value={textContent}
              onChange={(e) => setTextContent(e.target.value)}
              disabled={isUploading}
              placeholder="Paste the complete text content of the book here. The system will automatically detect medicine names and sections..."
              rows={12}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 font-mono text-sm"
            />
            <p className="mt-1 text-xs text-gray-500">
              ✨ Auto-formatting enabled! Just paste plain text - medicine names and sections will be detected automatically.
            </p>
          </div>

          {/* Progress Bar */}
          {isUploading && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-blue-900">{uploadStatus}</span>
                <span className="text-sm text-blue-700">{uploadProgress}%</span>
              </div>
              <div className="w-full bg-blue-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}

          {/* Buttons */}
          <div className="flex gap-3 pt-4">
            <Button
              onClick={handleUpload}
              disabled={!title || !author || (!selectedFile && !textContent.trim()) || isUploading}
              className="flex-1"
            >
              {isUploading ? '⏳ Processing...' : '⬆️ Upload & Process'}
            </Button>
            <Button
              variant="secondary"
              onClick={onUploadComplete}
              disabled={isUploading}
            >
              Cancel
            </Button>
          </div>

          {/* Info */}
          <div className="mt-6 p-4 bg-gray-50 rounded-lg text-sm text-gray-600">
            <p className="font-medium mb-2">ℹ️ How to upload a book:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>Enter the book title and author (required)</li>
              <li>Paste the complete text content of the book</li>
              <li>Optionally attach a PDF file for reference</li>
              <li>Click Upload & Process - auto-formatting will detect medicine names and sections</li>
              <li>Book becomes immediately searchable with medicine index</li>
            </ul>
            <p className="mt-3 text-xs text-blue-600">
              ✨ New: Auto-formatting detects medicine names and sections automatically!
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Web URL */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Website URL *
            </label>
            <input
              type="url"
              value={webUrl}
              onChange={(e) => setWebUrl(e.target.value)}
              disabled={isImporting}
              placeholder="e.g., https://www.homeoint.org/books/boericmm/index.htm"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            />
            <p className="mt-1 text-xs text-gray-500">
              Enter the index page URL. The system will automatically crawl all linked pages.
            </p>
          </div>

          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Book Title *
            </label>
            <input
              type="text"
              value={webTitle}
              onChange={(e) => setWebTitle(e.target.value)}
              disabled={isImporting}
              placeholder="e.g., Boericke Materia Medica"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            />
          </div>

          {/* Author */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Author *
            </label>
            <input
              type="text"
              value={webAuthor}
              onChange={(e) => setWebAuthor(e.target.value)}
              disabled={isImporting}
              placeholder="e.g., William Boericke"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            />
          </div>

          {/* Test Mode Checkbox */}
          <div className="flex items-center gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
            <input
              type="checkbox"
              id="testMode"
              checked={testMode}
              onChange={(e) => setTestMode(e.target.checked)}
              disabled={isImporting}
              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <label htmlFor="testMode" className="text-sm text-gray-700 cursor-pointer">
              <span className="font-medium">Test Mode</span> - Import only first 30 medicines (recommended for testing)
            </label>
          </div>

          {/* Progress Bar */}
          {isImporting && importProgress && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-green-900">{importProgress.message}</span>
                <span className="text-sm text-green-700">
                  {importProgress.currentPage}/{importProgress.totalPages}
                </span>
              </div>
              <div className="w-full bg-green-200 rounded-full h-2">
                <div
                  className="bg-green-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${importProgress.progress}%` }}
                />
              </div>
              <div className="mt-2 text-xs text-green-600">
                💡 This may take a few minutes depending on the number of pages
              </div>
            </div>
          )}

          {/* Buttons */}
          <div className="flex gap-3 pt-4">
            {!isImporting ? (
              <>
                <Button
                  onClick={handleWebImport}
                  disabled={!webUrl || !webTitle || !webAuthor}
                  className="flex-1"
                >
                  🌐 Import from Web
                </Button>
                <Button
                  variant="secondary"
                  onClick={onUploadComplete}
                >
                  Cancel
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="secondary"
                  onClick={handleStopImport}
                  className="flex-1"
                >
                  🛑 Stop Import & Save Progress
                </Button>
              </>
            )}
          </div>

          {/* Info */}
          <div className="mt-6 p-4 bg-gray-50 rounded-lg text-sm text-gray-600">
            <p className="font-medium mb-2">ℹ️ How web import works:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>Enter the index page URL of the book</li>
              <li>System automatically finds and crawls all medicine pages</li>
              <li>Extracts only medicine names and details (skips headers/footers)</li>
              <li>Creates a searchable book in your library</li>
              <li>Process may take 1-5 minutes depending on book size</li>
            </ul>
          </div>
        </div>
      )}
    </Card>
  );
}

// Helper function to render formatted AI answer with markdown-like formatting
function renderFormattedAnswer(answer: string) {
  // Remove JSON code block wrapper if present
  let cleanAnswer = answer.trim();
  if (cleanAnswer.startsWith('```json') || cleanAnswer.startsWith('```')) {
    cleanAnswer = cleanAnswer.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '');
  }
  
  // Try to parse as JSON if it looks like JSON
  let parsedAnswer = cleanAnswer;
  try {
    if (cleanAnswer.startsWith('{') && cleanAnswer.endsWith('}')) {
      const jsonData = JSON.parse(cleanAnswer);
      if (jsonData.answer) {
        parsedAnswer = jsonData.answer;
      }
    }
  } catch (e) {
    // Not JSON, use as-is
  }
  
  // Split into lines and process
  const lines = parsedAnswer.split('\n');
  const elements: React.ReactNode[] = [];
  let key = 0;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Skip empty lines but add spacing
    if (line.trim() === '') {
      elements.push(<div key={key++} className="h-2" />);
      continue;
    }
    
    // Check if line starts with **text** (heading/section)
    const headingMatch = line.match(/^\*\*([^*]+)\*\*/);
    if (headingMatch) {
      const headingText = headingMatch[1];
      const restOfLine = line.substring(headingMatch[0].length).trim();
      
      elements.push(
        <div key={key++} className="mt-4 mb-2">
          <span className="font-bold text-gray-900">{headingText}</span>
          {restOfLine && <span className="ml-2">{processInlineFormatting(restOfLine)}</span>}
        </div>
      );
      continue;
    }
    
    // Check if line starts with "- **Medicine Name**:" (medicine entry)
    const medicineMatch = line.match(/^-\s+\*\*([^*]+)\*\*:?\s*(.*)/);
    if (medicineMatch) {
      const medicineName = medicineMatch[1];
      const description = medicineMatch[2];
      
      elements.push(
        <div key={key++} className="ml-4 mb-3">
          <span className="font-bold text-blue-700">{medicineName}</span>
          {description && <span className="ml-2 text-gray-800">{processInlineFormatting(description)}</span>}
        </div>
      );
      continue;
    }
    
    // Regular line with possible inline formatting
    elements.push(
      <div key={key++} className="mb-2 text-gray-800">
        {processInlineFormatting(line)}
      </div>
    );
  }
  
  return elements;
}

// Helper to process inline bold formatting
function processInlineFormatting(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;
  
  // Match **text** patterns
  const boldRegex = /\*\*([^*]+)\*\*/g;
  let match;
  
  while ((match = boldRegex.exec(text)) !== null) {
    // Add text before the match
    if (match.index > lastIndex) {
      parts.push(text.substring(lastIndex, match.index));
    }
    
    // Add bold text
    parts.push(
      <span key={key++} className="font-bold text-gray-900">
        {match[1]}
      </span>
    );
    
    lastIndex = match.index + match[0].length;
  }
  
  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }
  
  return parts.length > 0 ? parts : text;
}

// Book Reader View Component with Enhanced Text Display and Highlighting
function BookReaderView({ book, onClose, searchKeywords = [] }: any) {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [docUrl, setDocUrl] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageContent, setPageContent] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [totalPages, setTotalPages] = useState(0);
  const [viewMode, setViewMode] = useState<'text' | 'pdf' | 'doc'>('text');
  const [fontSize, setFontSize] = useState<'small' | 'medium' | 'large'>('medium');
  const [readingMode, setReadingMode] = useState(false);
  const [medicineIndex, setMedicineIndex] = useState<Array<{name: string, page: number}>>([]);
  const [showMedicineIndex, setShowMedicineIndex] = useState(true);
  const [medicineSearchQuery, setMedicineSearchQuery] = useState('');

  useEffect(() => {
    if (book) {
      // Set initial page if provided
      if (book.initialPage) {
        setCurrentPage(book.initialPage);
      }
      
      // For Word documents, set doc URL for viewing
      if (book.filePath && book.filePath.endsWith('.docx')) {
        const url = `/${book.filePath}`;
        setDocUrl(url);
        setViewMode('doc');
        setIsLoading(false);
        // Continue to load page content below for text search
      } else if (book.filePath) {
        // Check if PDF file exists
        const url = `/${book.filePath}`;
        fetch(url, { method: 'HEAD' })
          .then(response => {
            if (response.ok) {
              setPdfUrl(url);
            }
          })
          .catch(() => setPdfUrl(null));
      }
      
      // Build medicine index from book content
      buildMedicineIndex();
      
      // Load page content from database
      loadPageContent(book.initialPage || 1);
    }
  }, [book]);

  const buildMedicineIndex = async () => {
    try {
      const { materiaMedicaBookDb } = await import('@/lib/db/database');
      const bookData = materiaMedicaBookDb.getById(book.id) as any;
      
      if (!bookData || !bookData.fullText) {
        return;
      }
      
      const fullText = bookData.fullText;
      const medicines: Array<{name: string, page: number}> = [];
      
      // Split by page breaks
      const pages = fullText.split('##PAGE_BREAK##');
      
      pages.forEach((pageText: string, index: number) => {
        // Extract medicine name from ##TITLE## markers
        const titleMatch = pageText.match(/##TITLE##(.*?)##TITLE##/);
        if (titleMatch) {
          medicines.push({
            name: titleMatch[1].trim(),
            page: index + 1
          });
        }
      });
      
      setMedicineIndex(medicines);
      setTotalPages(pages.length);
      
      console.log(`[BookReader] Built medicine index with ${medicines.length} medicines`);
      
    } catch (error) {
      console.error('Failed to build medicine index:', error);
    }
  };

  const loadPageContent = async (pageNum: number) => {
    setIsLoading(true);
    try {
      const { materiaMedicaBookDb } = await import('@/lib/db/database');
      const bookData = materiaMedicaBookDb.getById(book.id) as any;
      
      if (!bookData || !bookData.fullText) {
        console.log(`[BookReader] No full text found for book ${book.id}`);
        setPageContent(null);
        setTotalPages(0);
        setIsLoading(false);
        return;
      }
      
      // Split by page breaks (each medicine is a page)
      const pages = bookData.fullText.split('##PAGE_BREAK##').filter((p: string) => p.trim());
      const calculatedTotalPages = pages.length;
      
      setTotalPages(calculatedTotalPages);
      
      console.log(`[BookReader] Book has ${calculatedTotalPages} medicines/pages`);
      
      if (pageNum < 1 || pageNum > calculatedTotalPages) {
        console.log(`[BookReader] Page ${pageNum} out of range`);
        setPageContent(null);
        setIsLoading(false);
        return;
      }
      
      // Get the specific page (medicine)
      const pageText = pages[pageNum - 1].trim();
      
      // Count words
      const wordCount = pageText.trim().split(/\s+/).filter((w: string) => w.length > 0).length;
      
      setPageContent({
        pageNumber: pageNum,
        text: pageText,
        wordCount: wordCount,
        hasImages: false
      });
      
      console.log(`[BookReader] Loaded page ${pageNum}: ${pageText.length} chars, ${wordCount} words`);
      
    } catch (error) {
      console.error('Failed to load page content:', error);
      setPageContent(null);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage);
      loadPageContent(newPage);
    }
  };

  const formatMedicineText = (text: string) => {
    if (!text) return '';
    
    let formatted = text;
    
    // Remove any remaining header text that slipped through
    formatted = formatted.replace(/HOM.*?OPATHIC MATERIA MEDICA/gi, '');
    formatted = formatted.replace(/by William BOERICKE.*?M\.D\./gi, '');
    formatted = formatted.replace(/Presented by M.*?di-T/gi, '');
    formatted = formatted.replace(/Presented by Médi-T/gi, '');
    
    // Convert special markers to HTML
    // Medicine title (H1) - Large, bold, centered
    formatted = formatted.replace(/##TITLE##(.*?)##TITLE##/g, 
      '<h1 class="text-4xl font-bold text-center text-blue-900 mb-8 pb-4 border-b-2 border-blue-200 uppercase tracking-wide">$1</h1>');
    
    // Section headings (H2) - Bold, larger
    formatted = formatted.replace(/##HEADING##(.*?)##HEADING##/g, 
      '<h2 class="text-2xl font-bold text-gray-900 mt-8 mb-4 border-l-4 border-blue-500 pl-4">$1</h2>');
    
    // Subsection headings (H3) - Bold, medium
    formatted = formatted.replace(/##SUBHEADING##(.*?)##SUBHEADING##/g, 
      '<h3 class="text-xl font-semibold text-gray-800 mt-6 mb-3">$1</h3>');
    
    // Minor headings (H4-H6) - Bold, small
    formatted = formatted.replace(/##MINOR##(.*?)##MINOR##/g, 
      '<h4 class="text-lg font-semibold text-gray-700 mt-4 mb-2">$1</h4>');
    
    // Auto-detect medicine name at the start (if no TITLE marker)
    // Medicine names are usually all caps or title case at the very beginning
    if (!formatted.includes('<h1')) {
      formatted = formatted.replace(/^([A-Z][A-Z\s\-\.]+)(\n|$)/m, 
        '<h1 class="text-4xl font-bold text-center text-blue-900 mb-8 pb-4 border-b-2 border-blue-200 uppercase tracking-wide">$1</h1>\n');
    }
    
    // Auto-detect section headings (common patterns in materia medica)
    // Sections like "Mind:", "Head:", "Eyes:", etc. followed by dash or colon
    formatted = formatted.replace(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s*[-:]\s*$/gm, 
      '<h2 class="text-xl font-bold text-gray-900 mt-6 mb-3 border-l-4 border-blue-500 pl-4 bg-blue-50 py-2">$1</h2>');
    
    // Also detect section headings that are just capitalized words on their own line
    formatted = formatted.replace(/^([A-Z][A-Z\s]{2,20})$/gm, (match, p1) => {
      // Common section names in materia medica
      const sections = ['MIND', 'HEAD', 'EYES', 'EARS', 'NOSE', 'FACE', 'MOUTH', 'THROAT', 
                       'STOMACH', 'ABDOMEN', 'RECTUM', 'STOOL', 'URINARY', 'MALE', 'FEMALE',
                       'RESPIRATORY', 'CHEST', 'HEART', 'BACK', 'EXTREMITIES', 'SKIN', 'SLEEP',
                       'FEVER', 'GENERALITIES', 'MODALITIES', 'WORSE', 'BETTER', 'RELATIONS',
                       'DOSE', 'CLINICAL', 'COMPARE'];
      
      if (sections.some(s => p1.includes(s))) {
        return `<h2 class="text-xl font-bold text-gray-900 mt-6 mb-3 border-l-4 border-blue-500 pl-4 bg-blue-50 py-2">${p1}</h2>`;
      }
      return match;
    });
    
    // Bold text
    formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong class="font-bold text-gray-900">$1</strong>');
    
    // Italic text
    formatted = formatted.replace(/\*(.*?)\*/g, '<em class="italic text-gray-700">$1</em>');
    
    // Underline text
    formatted = formatted.replace(/__(.*?)__/g, '<u class="underline text-gray-800">$1</u>');
    
    // Bullet points
    formatted = formatted.replace(/^• (.+)$/gm, '<li class="ml-6 mb-2 text-gray-800">$1</li>');
    
    // Wrap consecutive list items in ul
    formatted = formatted.replace(/(<li class="ml-6 mb-2 text-gray-800">.*?<\/li>\n?)+/g, '<ul class="list-disc my-4 space-y-1">$&</ul>');
    
    // Horizontal rules
    formatted = formatted.replace(/^---$/gm, '<hr class="my-6 border-gray-300" />');
    
    // Paragraphs - wrap text blocks and preserve spacing
    const lines = formatted.split('\n');
    const processedLines: string[] = [];
    let consecutiveEmpty = 0;
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      if (!trimmed) {
        // Empty line - add spacing
        consecutiveEmpty++;
        if (consecutiveEmpty <= 2) {
          // Allow up to 2 consecutive empty lines for section breaks
          processedLines.push('<div class="h-4"></div>');
        }
      } else {
        consecutiveEmpty = 0;
        if (trimmed.startsWith('<')) {
          // Already HTML (heading, etc.)
          processedLines.push(trimmed);
        } else {
          // Regular paragraph
          processedLines.push(`<p class="mb-4 text-gray-800 leading-relaxed">${trimmed}</p>`);
        }
      }
    }
    
    formatted = processedLines.join('\n');
    
    return formatted;
  };

  const highlightText = (text: string, keywords: string[]) => {
    // Only apply search keyword highlighting if any
    if (!keywords || keywords.length === 0) {
      return text;
    }

    let highlightedText = text;
    
    // Sort keywords by length (longest first) to avoid partial replacements
    const sortedKeywords = [...keywords].sort((a, b) => b.length - a.length);
    
    sortedKeywords.forEach((keyword, index) => {
      const regex = new RegExp(`(${keyword})`, 'gi');
      highlightedText = highlightedText.replace(
        regex,
        `<mark class="bg-yellow-200 px-1 rounded font-medium" data-keyword="${index}">$1</mark>`
      );
    });

    return highlightedText;
  };

  const getFontSizeClass = () => {
    switch (fontSize) {
      case 'small': return 'text-sm';
      case 'large': return 'text-lg';
      default: return 'text-base';
    }
  };

  if (!book) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p>No book selected</p>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-white z-50 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b bg-white shadow-sm">
        <div className="flex items-center gap-4">
          <Button variant="secondary" onClick={onClose}>
            ← Back to Library
          </Button>
          <div className="flex-1">
            <h2 className="font-semibold text-gray-900">{book.title}</h2>
            <p className="text-sm text-gray-600">{book.author}</p>
            {searchKeywords && searchKeywords.length > 0 && (
              <p className="text-xs text-blue-600 mt-1">
                🔍 Highlighting: {searchKeywords.join(', ')}
              </p>
            )}
          </div>
        </div>
        <div className="flex gap-2 items-center">
          {/* Medicine Index Toggle */}
          {medicineIndex.length > 0 && (
            <Button
              variant={showMedicineIndex ? 'primary' : 'secondary'}
              onClick={() => setShowMedicineIndex(!showMedicineIndex)}
              className="mr-2"
            >
              {showMedicineIndex ? '📋 Hide Index' : '📋 Show Index'}
            </Button>
          )}
          
          {/* Font Size Controls */}
          {viewMode === 'text' && (
            <div className="flex gap-1 mr-2">
              <button
                onClick={() => setFontSize('small')}
                className={`px-2 py-1 text-xs rounded ${fontSize === 'small' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}
                title="Small font"
              >
                A
              </button>
              <button
                onClick={() => setFontSize('medium')}
                className={`px-2 py-1 text-sm rounded ${fontSize === 'medium' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}
                title="Medium font"
              >
                A
              </button>
              <button
                onClick={() => setFontSize('large')}
                className={`px-2 py-1 text-base rounded ${fontSize === 'large' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}
                title="Large font"
              >
                A
              </button>
            </div>
          )}
          
          {/* Reading Mode Toggle */}
          {viewMode === 'text' && (
            <Button
              variant={readingMode ? 'primary' : 'secondary'}
              onClick={() => setReadingMode(!readingMode)}
              className="mr-2"
            >
              {readingMode ? '📖 Reading' : '📄 Normal'}
            </Button>
          )}
          
          <Button
            variant={viewMode === 'text' ? 'primary' : 'secondary'}
            onClick={() => setViewMode('text')}
          >
            📄 Text
          </Button>
          {docUrl && (
            <Button
              variant={viewMode === 'doc' ? 'primary' : 'secondary'}
              onClick={() => setViewMode('doc')}
            >
              📘 Doc
            </Button>
          )}
          {pdfUrl && (
            <Button
              variant={viewMode === 'pdf' ? 'primary' : 'secondary'}
              onClick={() => setViewMode('pdf')}
            >
              📕 PDF
            </Button>
          )}
        </div>
      </div>
      
      {/* Content with Medicine Index Sidebar */}
      <div className="flex-1 flex overflow-hidden">
        {/* Medicine Index Sidebar */}
        {showMedicineIndex && medicineIndex.length > 0 && (
          <div className="w-80 border-r bg-white overflow-hidden flex flex-col">
            <div className="p-4 border-b bg-gradient-to-r from-blue-50 to-indigo-50">
              <h3 className="font-semibold text-gray-900 mb-3">Medicine Index</h3>
              <input
                type="text"
                placeholder="Search medicines..."
                value={medicineSearchQuery}
                onChange={(e) => setMedicineSearchQuery(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <p className="text-xs text-gray-600 mt-2">
                {medicineIndex.filter(m => 
                  m.name.toLowerCase().includes(medicineSearchQuery.toLowerCase())
                ).length} of {medicineIndex.length} medicines
              </p>
            </div>
            <div className="flex-1 overflow-y-auto">
              {medicineIndex
                .filter(m => m.name.toLowerCase().includes(medicineSearchQuery.toLowerCase()))
                .map((medicine, index) => (
                  <button
                    key={index}
                    onClick={() => handlePageChange(medicine.page)}
                    className={`w-full text-left px-4 py-3 border-b hover:bg-blue-50 transition-colors ${
                      currentPage === medicine.page ? 'bg-blue-100 border-l-4 border-l-blue-600 font-semibold' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-900">{medicine.name}</span>
                      <span className="text-xs text-gray-500">p.{medicine.page}</span>
                    </div>
                  </button>
                ))}
            </div>
          </div>
        )}
        
        {/* Main Content Area */}
        <div className={`flex-1 overflow-auto ${readingMode ? 'bg-amber-50' : 'bg-gray-100'} p-8`}>
          <div className={readingMode ? 'max-w-3xl mx-auto' : 'max-w-4xl mx-auto'}>
            {viewMode === 'text' ? (
              <div className={`${readingMode ? 'bg-white' : 'bg-white'} shadow-2xl rounded-lg`}>
                {/* Page Navigation */}
                <div className="border-b px-6 py-4 flex items-center justify-between bg-gradient-to-r from-gray-50 to-gray-100">
                  <Button
                    variant="secondary"
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage <= 1}
                  >
                    ← Previous
                  </Button>
                  <div className="flex items-center gap-4">
                    <span className="text-sm font-medium text-gray-700">
                      Medicine {currentPage} of {totalPages}
                    </span>
                  <input
                    type="number"
                    min="1"
                    max={totalPages}
                    value={currentPage}
                    onChange={(e) => {
                      const page = parseInt(e.target.value);
                      if (page >= 1 && page <= totalPages) {
                        handlePageChange(page);
                      }
                    }}
                    className="w-20 px-3 py-1 border border-gray-300 rounded-md text-center focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <Button
                  variant="secondary"
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage >= totalPages}
                >
                  Next →
                </Button>
              </div>

              {/* Page Content */}
              <div className={`${readingMode ? 'p-12' : 'p-8'} min-h-[700px]`}>
                {isLoading ? (
                  <div className="text-center py-12">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                    <p className="text-gray-600">Loading page...</p>
                  </div>
                ) : pageContent ? (
                  <div className="prose prose-lg max-w-none">
                    <div
                      className={`text-gray-800 ${getFontSizeClass()} ${
                        readingMode 
                          ? 'leading-loose' 
                          : 'leading-relaxed'
                      }`}
                      style={{
                        hyphens: 'auto'
                      }}
                      dangerouslySetInnerHTML={{
                        __html: highlightText(formatMedicineText(pageContent.text), searchKeywords || [])
                      }}
                    />
                    {pageContent.text.length === 0 && (
                      <div className="text-center py-12 text-gray-500">
                        <div className="text-4xl mb-4">📄</div>
                        <p className="font-medium">This page appears to be empty or contains only images.</p>
                        <p className="text-sm mt-2">Try switching to PDF View to see the original content.</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-12 text-gray-500">
                    <div className="text-4xl mb-4">⚠️</div>
                    <p className="font-medium">Page content not available</p>
                    <p className="text-sm mt-2">This book may need to be reprocessed.</p>
                  </div>
                )}
              </div>

              {/* Page Info Footer */}
              {pageContent && (
                <div className="border-t px-6 py-3 bg-gradient-to-r from-gray-50 to-gray-100 text-xs text-gray-600 flex justify-between items-center">
                  <span className="flex items-center gap-2">
                    <span className="font-medium">{pageContent.wordCount.toLocaleString()}</span> words
                  </span>
                  <span className="text-gray-400">•</span>
                  <span className="flex-1 text-center font-medium text-gray-700">
                    {book.title} - Page {currentPage}
                  </span>
                  <span className="text-gray-400">•</span>
                  {pageContent.hasImages && (
                    <span className="flex items-center gap-1">
                      📷 Contains images
                    </span>
                  )}
                </div>
              )}
            </div>
          ) : viewMode === 'doc' ? (
            <div className="bg-white shadow-lg rounded-lg p-8 h-full flex flex-col">
              {docUrl ? (
                <>
                  <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded text-sm text-blue-700">
                    📘 Viewing Word document with Office Online Viewer
                  </div>
                  <iframe
                    src={`https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(`${window.location.origin}${docUrl}`)}`}
                    className="flex-1 border-0 rounded"
                    title={book.title}
                    allowFullScreen
                  />
                </>
              ) : (
                <div className="text-center text-gray-500 py-12">
                  <p className="mb-2">Word document not found</p>
                  <p className="text-sm">Expected path: {book.filePath || 'No path set'}</p>
                  <a 
                    href={docUrl || '#'} 
                    download
                    className="text-blue-600 hover:underline mt-4 inline-block"
                  >
                    Download Document
                  </a>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white shadow-lg rounded-lg p-8">
              {pdfUrl ? (
                <iframe
                  src={`${pdfUrl}#page=${currentPage}`}
                  className="w-full h-[800px] border-0"
                  title={book.title}
                />
              ) : (
                <div className="text-center text-gray-500 py-12">
                  <p className="mb-2">PDF file not found</p>
                  <p className="text-sm">Expected path: {book.filePath || 'No path set'}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      </div>
    </div>
  );
}