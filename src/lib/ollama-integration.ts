// Ollama Integration for NotebookLM-like functionality
// Connects to local Ollama instance for LLM processing

export interface OllamaConfig {
  baseUrl: string;
  model: string;
  temperature: number;
  topK: number;
  topP: number;
}

export const DEFAULT_OLLAMA_CONFIG: OllamaConfig = {
  baseUrl: 'http://localhost:11434',
  model: 'gpt-oss:20b-cloud',
  temperature: 0.3,
  topK: 40,
  topP: 0.9
};

// Check if Ollama is running
export async function checkOllamaHealth(baseUrl: string = DEFAULT_OLLAMA_CONFIG.baseUrl): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    
    const response = await fetch(`${baseUrl}/api/tags`, {
      method: 'GET',
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    return response.ok;
  } catch (error) {
    console.error('[Ollama] Health check failed:', error);
    return false;
  }
}

// Get available models from Ollama
export async function getOllamaModels(baseUrl: string = DEFAULT_OLLAMA_CONFIG.baseUrl): Promise<string[]> {
  try {
    const response = await fetch(`${baseUrl}/api/tags`, {
      method: 'GET'
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const data = await response.json();
    return data.models?.map((m: any) => m.name) || [];
  } catch (error) {
    console.error('[Ollama] Failed to get models:', error);
    return [];
  }
}

// Generate response using Ollama
export async function generateWithOllama(
  prompt: string,
  config: Partial<OllamaConfig> = {}
): Promise<string> {
  const finalConfig = { ...DEFAULT_OLLAMA_CONFIG, ...config };
  
  try {
    console.log(`[Ollama] Generating with model: ${finalConfig.model}`);
    
    const response = await fetch(`${finalConfig.baseUrl}/api/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: finalConfig.model,
        prompt: prompt,
        stream: false,
        options: {
          temperature: finalConfig.temperature,
          top_k: finalConfig.topK,
          top_p: finalConfig.topP,
          num_predict: 2000
        }
      })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    return data.response || '';
  } catch (error) {
    console.error('[Ollama] Generation failed:', error);
    throw error;
  }
}

// Generate NotebookLM-style response
export async function generateNotebookLMResponse(
  query: string,
  relevantChunks: Array<{ text: string; medicineName: string; sectionName: string }>,
  config: Partial<OllamaConfig> = {}
): Promise<string> {
  // Build context from relevant chunks
  const context = relevantChunks
    .map((chunk, idx) => `[${chunk.medicineName} - ${chunk.sectionName}]\n${chunk.text}`)
    .join('\n\n---\n\n');
  
  const systemPrompt = `You are a homeopathy expert assistant helping doctors find remedies in materia medica books.

Your task is to provide a COMPREHENSIVE, WELL-STRUCTURED answer similar to a professional medical reference.

RESPONSE FORMAT:
1. Start with a brief introduction sentence
2. Organize information into CLEAR CATEGORIES (use headings like "Morning Symptoms", "Evening Symptoms", etc.)
3. For EACH medicine mentioned:
   - Medicine name in bold
   - Specific symptoms and characteristics
   - Timing/modalities (when symptoms occur or worsen)
   - Key differentiating features
4. End with clinical notes about selection criteria

IMPORTANT RULES:
- Base answer ONLY on the provided book excerpts
- Include specific details (times, symptoms, modalities)
- Organize by logical categories
- Use medicine names from the excerpts
- Provide comparative analysis between similar medicines
- Make it detailed and professional like a medical textbook`;

  const userPrompt = `Query: ${query}

Relevant excerpts from materia medica books:

${context}

Please provide a comprehensive analysis based on these excerpts.`;

  const fullPrompt = `${systemPrompt}\n\nUser: ${userPrompt}\n\nAssistant:`;
  
  return generateWithOllama(fullPrompt, config);
}

// Stream response from Ollama (for real-time updates)
export async function streamOllamaResponse(
  prompt: string,
  onChunk: (chunk: string) => void,
  config: Partial<OllamaConfig> = {}
): Promise<void> {
  const finalConfig = { ...DEFAULT_OLLAMA_CONFIG, ...config };
  
  try {
    console.log(`[Ollama] Streaming with model: ${finalConfig.model}`);
    
    const response = await fetch(`${finalConfig.baseUrl}/api/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: finalConfig.model,
        prompt: prompt,
        stream: true,
        options: {
          temperature: finalConfig.temperature,
          top_k: finalConfig.topK,
          top_p: finalConfig.topP,
          num_predict: 2000
        }
      })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');
    
    const decoder = new TextDecoder();
    let buffer = '';
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      
      // Process all complete lines
      for (let i = 0; i < lines.length - 1; i++) {
        const line = lines[i].trim();
        if (line) {
          try {
            const data = JSON.parse(line);
            if (data.response) {
              onChunk(data.response);
            }
          } catch (e) {
            // Skip invalid JSON lines
          }
        }
      }
      
      // Keep the last incomplete line in buffer
      buffer = lines[lines.length - 1];
    }
    
    // Process any remaining data
    if (buffer.trim()) {
      try {
        const data = JSON.parse(buffer);
        if (data.response) {
          onChunk(data.response);
        }
      } catch (e) {
        // Skip invalid JSON
      }
    }
  } catch (error) {
    console.error('[Ollama] Streaming failed:', error);
    throw error;
  }
}
