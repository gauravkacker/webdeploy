// Embedding utility for semantic search
// Uses lightweight embeddings for similarity matching

export interface TextChunk {
  text: string;
  embedding: number[];
  chunkIndex: number;
  medicineId: string;
  medicineName: string;
  sectionName: string;
}

// Simple embedding function using TF-IDF-like approach
// This is lightweight and doesn't require external models
export function generateSimpleEmbedding(text: string): number[] {
  // Normalize text
  const normalized = text.toLowerCase().trim();
  
  // Create a simple hash-based embedding (384 dimensions)
  const embedding: number[] = new Array(384).fill(0);
  
  // Split into words
  const words = normalized.split(/\s+/).filter(w => w.length > 2);
  
  // Generate embedding based on word frequencies and positions
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    // Hash the word to get a consistent index
    let hash = 0;
    for (let j = 0; j < word.length; j++) {
      hash = ((hash << 5) - hash) + word.charCodeAt(j);
      hash = hash & hash; // Convert to 32bit integer
    }
    
    const index = Math.abs(hash) % 384;
    const weight = 1 / (i + 1); // Earlier words have higher weight
    embedding[index] += weight;
  }
  
  // Normalize the embedding
  const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
  if (magnitude > 0) {
    for (let i = 0; i < embedding.length; i++) {
      embedding[i] /= magnitude;
    }
  }
  
  return embedding;
}

// Calculate cosine similarity between two embeddings
export function cosineSimilarity(embedding1: number[], embedding2: number[]): number {
  if (embedding1.length !== embedding2.length) {
    return 0;
  }
  
  let dotProduct = 0;
  let magnitude1 = 0;
  let magnitude2 = 0;
  
  for (let i = 0; i < embedding1.length; i++) {
    dotProduct += embedding1[i] * embedding2[i];
    magnitude1 += embedding1[i] * embedding1[i];
    magnitude2 += embedding2[i] * embedding2[i];
  }
  
  magnitude1 = Math.sqrt(magnitude1);
  magnitude2 = Math.sqrt(magnitude2);
  
  if (magnitude1 === 0 || magnitude2 === 0) {
    return 0;
  }
  
  return dotProduct / (magnitude1 * magnitude2);
}

// Split text into chunks for embedding
export function chunkText(text: string, chunkSize: number = 500, overlap: number = 100): string[] {
  const chunks: string[] = [];
  let start = 0;
  
  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    chunks.push(text.substring(start, end));
    start = end - overlap;
    
    if (start >= text.length) break;
  }
  
  return chunks;
}

// Generate embeddings for book content
export function generateBookEmbeddings(
  bookId: string,
  medicineName: string,
  fullText: string
): TextChunk[] {
  const chunks: TextChunk[] = [];
  
  // Split by sections (##HEADING## markers)
  const sections = fullText.split(/##HEADING##/);
  
  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    if (!section.trim().length) continue;
    
    // Extract section name (first line)
    const lines = section.split('\n');
    const sectionName = lines[0]?.trim() || `Section ${i}`;
    const sectionContent = lines.slice(1).join('\n');
    
    // Split section into chunks
    const textChunks = chunkText(sectionContent, 500, 100);
    
    for (let j = 0; j < textChunks.length; j++) {
      const chunkText = textChunks[j];
      if (chunkText.trim().length < 50) continue; // Skip very small chunks
      
      const embedding = generateSimpleEmbedding(chunkText);
      
      chunks.push({
        text: chunkText,
        embedding,
        chunkIndex: j,
        medicineId: bookId,
        medicineName,
        sectionName
      });
    }
  }
  
  return chunks;
}

// Find similar chunks using embeddings
export function findSimilarChunks(
  queryEmbedding: number[],
  chunks: TextChunk[],
  topK: number = 10,
  threshold: number = 0.3
): TextChunk[] {
  const similarities = chunks.map(chunk => ({
    chunk,
    similarity: cosineSimilarity(queryEmbedding, chunk.embedding)
  }));
  
  return similarities
    .filter(item => item.similarity >= threshold)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK)
    .map(item => item.chunk);
}
