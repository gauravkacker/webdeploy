import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { ollamaUrl = 'http://localhost:11434' } = await request.json();

    console.log(`[Ollama Health] Checking health at ${ollamaUrl}`);

    // Check if Ollama is running
    const healthResponse = await fetch(`${ollamaUrl}/api/tags`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000)
    });

    if (!healthResponse.ok) {
      return NextResponse.json({
        success: false,
        running: false,
        error: `Ollama not responding: ${healthResponse.status} ${healthResponse.statusText}`,
        message: 'Ollama app is not running or not accessible at the configured URL'
      });
    }

    const data = await healthResponse.json();
    const models = data.models || [];

    console.log(`[Ollama Health] Found ${models.length} models`);

    return NextResponse.json({
      success: true,
      running: true,
      models: models.map((m: any) => m.name),
      message: `Ollama is running with ${models.length} models available`
    });
  } catch (error) {
    console.error('[Ollama Health] Error:', error);
    return NextResponse.json({
      success: false,
      running: false,
      error: error instanceof Error ? error.message : String(error),
      message: 'Failed to connect to Ollama. Make sure the Ollama app is running.'
    }, { status: 500 });
  }
}
