"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/layout/SidebarComponent";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { getCurrentUser } from "@/lib/permissions";

interface MateriaMedicaAISettings {
  enabled: boolean;
  provider: 'groq' | 'ollama' | 'huggingface' | 'gemini';
  groqApiKey: string;
  groqModel: string;
  huggingfaceApiKey: string;
  huggingfaceModel: string;
  ollamaUrl: string;
  ollamaModel: string;
  geminiApiKey: string;
  geminiModel: string;
}

export default function MateriaMedicaAISettingsPage() {
  const router = useRouter();
  
  // Check authentication on mount
  useEffect(() => {
    const user = getCurrentUser();
    if (!user) {
      router.push('/login');
    }
  }, [router]);
  
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [settings, setSettings] = useState<MateriaMedicaAISettings>({
    enabled: true,
    provider: 'groq',
    groqApiKey: "",
    groqModel: "llama-3.3-70b-versatile",
    huggingfaceApiKey: "",
    huggingfaceModel: "meta-llama/Meta-Llama-3-8B-Instruct",
    ollamaUrl: "http://localhost:11434",
    ollamaModel: "gpt-oss:20b-cloud",
    geminiApiKey: "",
    geminiModel: "gemini-2.5-flash-lite",
  });
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    // Load settings from localStorage
    const savedSettings = localStorage.getItem("materiaMedicaAISettings");
    if (savedSettings) {
      try {
        setSettings(JSON.parse(savedSettings));
      } catch (e) {
        console.error("Failed to load Materia Medica AI settings:", e);
      }
    }
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      console.log('[Materia Medica AI Settings] Saving settings:', settings);
      localStorage.setItem("materiaMedicaAISettings", JSON.stringify(settings));
      alert("Settings saved successfully!");
    } catch (error) {
      console.error("Failed to save settings:", error);
      alert("Failed to save settings");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar />
      <div className={`transition-all duration-300 ${sidebarCollapsed ? "ml-16" : "ml-64"}`}>
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-6 py-4">
          <div className="flex items-center gap-4">
            <a href="/settings" className="text-gray-500 hover:text-gray-700">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </a>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Materia Medica AI Search</h1>
              <p className="text-sm text-gray-500">
                Configure AI provider for intelligent remedy search in medical books
              </p>
            </div>
            <span className="ml-auto px-3 py-1 bg-green-100 text-green-800 text-sm font-medium rounded-full">
              100% FREE
            </span>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 max-w-4xl">
          {/* How it works */}
          <Card className="p-6 mb-6 bg-blue-50 border-blue-200">
            <h3 className="text-lg font-semibold text-blue-900 mb-2">AI-Powered Book Search</h3>
            <ul className="text-sm text-blue-800 space-y-2">
              <li>• <strong>Intelligent Search:</strong> AI analyzes your symptoms and finds relevant remedies across all books</li>
              <li>• <strong>Natural Language:</strong> Ask questions like &quot;remedy for fever with anxiety at night&quot;</li>
              <li>• <strong>Multiple Providers:</strong> Choose between Groq (cloud), Hugging Face (medical models), or Ollama (local)</li>
              <li>• <strong>Deep Analysis:</strong> AI reads entire book content, not just first few pages</li>
              <li>• <strong>Free Options:</strong> All providers offer free tiers for testing</li>
            </ul>
          </Card>

          {/* Settings Form */}
          <Card className="p-6 mb-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Configuration</h3>
            
            <div className="space-y-4">
              {/* Enable AI */}
              <div className="flex items-center justify-between">
                <div>
                  <label className="font-medium text-gray-700">Enable AI Search</label>
                  <p className="text-sm text-gray-500">Use AI for intelligent remedy finding</p>
                </div>
                <button
                  type="button"
                  onClick={() => setSettings({ ...settings, enabled: !settings.enabled })}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    settings.enabled ? "bg-green-600" : "bg-gray-200"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      settings.enabled ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>

              {/* API Provider Selection */}
              <div>
                <label className="block font-medium text-gray-700 mb-2">
                  AI Provider
                </label>
                <div className="space-y-3">
                  <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
                    <input
                      type="radio"
                      checked={settings.provider === 'groq'}
                      onChange={() => setSettings({ ...settings, provider: 'groq' })}
                      className="w-4 h-4"
                    />
                    <div className="flex-1">
                      <div className="font-medium text-gray-900">Groq (Cloud AI)</div>
                      <div className="text-sm text-gray-500">Fast, free, requires internet & API key</div>
                    </div>
                  </label>
                  
                  <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
                    <input
                      type="radio"
                      checked={settings.provider === 'gemini'}
                      onChange={() => setSettings({ ...settings, provider: 'gemini' })}
                      className="w-4 h-4"
                    />
                    <div className="flex-1">
                      <div className="font-medium text-gray-900">Google Gemini (Cloud AI)</div>
                      <div className="text-sm text-gray-500">60 req/min free, best limits, requires API key</div>
                    </div>
                  </label>
                  
                  <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
                    <input
                      type="radio"
                      checked={settings.provider === 'huggingface'}
                      onChange={() => setSettings({ ...settings, provider: 'huggingface' })}
                      className="w-4 h-4"
                    />
                    <div className="flex-1">
                      <div className="font-medium text-gray-900">Hugging Face (Cloud AI)</div>
                      <div className="text-sm text-gray-500">Free, medical models (BioGPT, Meditron), requires API key</div>
                    </div>
                  </label>
                  
                  <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
                    <input
                      type="radio"
                      checked={settings.provider === 'ollama'}
                      onChange={() => setSettings({ ...settings, provider: 'ollama' })}
                      className="w-4 h-4"
                    />
                    <div className="flex-1">
                      <div className="font-medium text-gray-900">Ollama (Cloud or Local)</div>
                      <div className="text-sm text-gray-500">Cloud: Free, no download needed | Local: 100% private, works offline</div>
                    </div>
                  </label>
                </div>
              </div>

              {/* Groq Settings */}
              {settings.provider === 'groq' && (
                <>
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <h4 className="font-medium text-green-900 mb-2">🚀 Groq Setup</h4>
                    <ol className="text-sm text-green-800 space-y-2 list-decimal list-inside">
                      <li>Create free account at <a href="https://console.groq.com" target="_blank" rel="noopener noreferrer" className="underline">console.groq.com</a></li>
                      <li>Go to <a href="https://console.groq.com/keys" target="_blank" rel="noopener noreferrer" className="underline">API Keys</a></li>
                      <li>Create a new API key</li>
                      <li>Copy and paste the key below</li>
                    </ol>
                  </div>

                  {/* API Key */}
                  <div>
                    <label className="block font-medium text-gray-700 mb-1">
                      Groq API Key (FREE)
                    </label>
                    <Input
                      type="password"
                      placeholder="gsk_..."
                      value={settings.groqApiKey}
                      onChange={(e) => setSettings({ ...settings, groqApiKey: e.target.value })}
                      className="w-full"
                    />
                  </div>

                  {/* Model Selection */}
                  <div>
                    <label className="block font-medium text-gray-700 mb-1">
                      AI Model
                    </label>
                    <select
                      value={settings.groqModel}
                      onChange={(e) => setSettings({ ...settings, groqModel: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="llama-3.3-70b-versatile">Llama 3.3 70B (Recommended - FREE)</option>
                      <option value="llama-3.1-8b-instant">Llama 3.1 8B (Faster - FREE)</option>
                      <option value="mixtral-8x7b-32768">Mixtral 8x7B (FREE)</option>
                    </select>
                  </div>
                </>
              )}

              {/* Google Gemini Settings */}
              {settings.provider === 'gemini' && (
                <>
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <h4 className="font-medium text-blue-900 mb-2">🔷 Google Gemini Setup</h4>
                    <ol className="text-sm text-blue-800 space-y-2 list-decimal list-inside">
                      <li>Go to <a href="https://makersuite.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="underline">Google AI Studio</a></li>
                      <li>Click "Get API Key" or "Create API Key"</li>
                      <li>Copy the API key</li>
                      <li>Paste it below</li>
                      <li className="font-semibold">Free tier: 60 requests/minute (much better than Groq!)</li>
                    </ol>
                  </div>

                  {/* API Key */}
                  <div>
                    <label className="block font-medium text-gray-700 mb-2">
                      Gemini API Key
                    </label>
                    <Input
                      type="password"
                      value={settings.geminiApiKey}
                      onChange={(e) => setSettings({ ...settings, geminiApiKey: e.target.value })}
                      placeholder="Enter your Gemini API key"
                      className="font-mono"
                    />
                    <p className="text-sm text-gray-500 mt-1">
                      Your API key is stored locally and never sent to our servers
                    </p>
                  </div>

                  {/* Model Selection */}
                  <div>
                    <label className="block font-medium text-gray-700 mb-2">
                      Gemini Model
                    </label>
                    <select
                      value={settings.geminiModel}
                      onChange={(e) => setSettings({ ...settings, geminiModel: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="gemini-2.5-flash-lite">Gemini 2.5 Flash Lite (30 RPM, 1000 RPD, FREE - RECOMMENDED)</option>
                      <option value="gemini-2.5-flash">Gemini 2.5 Flash (10 RPM, 250 RPD, Better Quality)</option>
                      <option value="gemini-2.0-flash">Gemini 2.0 Flash (Legacy, 10 RPM)</option>
                      <option value="gemini-2.0-flash-lite">Gemini 2.0 Flash Lite (Legacy)</option>
                    </select>
                    <p className="text-sm text-gray-500 mt-1">
                      2.0 Flash is newest and fastest. 1.5 models are stable and proven.
                    </p>
                  </div>
                </>
              )}

              {/* Hugging Face Settings */}
              {settings.provider === 'huggingface' && (
                <>
                  <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                    <h4 className="font-medium text-purple-900 mb-2">🤗 Hugging Face Setup</h4>
                    <ol className="text-sm text-purple-800 space-y-2 list-decimal list-inside">
                      <li>Create free account at <a href="https://huggingface.co" target="_blank" rel="noopener noreferrer" className="underline">huggingface.co</a></li>
                      <li>Go to <a href="https://huggingface.co/settings/tokens" target="_blank" rel="noopener noreferrer" className="underline">Settings → Access Tokens</a></li>
                      <li>Create a new token with &quot;Read&quot; access</li>
                      <li>Copy and paste the token below</li>
                    </ol>
                  </div>

                  {/* Hugging Face API Key */}
                  <div>
                    <label className="block font-medium text-gray-700 mb-1">
                      Hugging Face API Token (FREE)
                    </label>
                    <Input
                      type="password"
                      placeholder="hf_..."
                      value={settings.huggingfaceApiKey}
                      onChange={(e) => setSettings({ ...settings, huggingfaceApiKey: e.target.value })}
                      className="w-full"
                    />
                  </div>

                  {/* Hugging Face Model Selection */}
                  <div>
                    <label className="block font-medium text-gray-700 mb-1">
                      AI Model
                    </label>
                    <select
                      value={settings.huggingfaceModel}
                      onChange={(e) => setSettings({ ...settings, huggingfaceModel: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="meta-llama/Meta-Llama-3-8B-Instruct">Llama 3 8B Instruct (Recommended)</option>
                      <option value="mistralai/Mistral-7B-Instruct-v0.2">Mistral 7B Instruct</option>
                      <option value="HuggingFaceH4/zephyr-7b-beta">Zephyr 7B Beta</option>
                      <option value="google/flan-t5-xxl">FLAN-T5 XXL</option>
                    </select>
                    <p className="text-sm text-gray-500 mt-1">
                      Medical models (BioGPT, Meditron) are optimized for healthcare queries
                    </p>
                  </div>
                </>
              )}

              {/* Ollama Settings */}
              {settings.provider === 'ollama' && (
                <>
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <h4 className="font-medium text-blue-900 mb-2">📦 Ollama Setup (Choose One)</h4>
                    <div className="space-y-3 text-sm text-blue-800">
                      <div>
                        <strong>Option 1: Cloud Models (Recommended - No Download)</strong>
                        <ol className="list-decimal list-inside mt-1 space-y-1">
                          <li>Download Ollama from <a href="https://ollama.com" target="_blank" rel="noopener noreferrer" className="underline">ollama.com</a></li>
                          <li>Sign in: <code className="bg-blue-100 px-2 py-1 rounded">ollama signin</code></li>
                          <li>That's it! Cloud models run on Ollama servers (no local download needed)</li>
                          <li>No token limits, completely free, no RAM issues</li>
                        </ol>
                      </div>
                      <div className="border-t border-blue-200 pt-3">
                        <strong>Option 2: Local Models (Requires Download)</strong>
                        <ol className="list-decimal list-inside mt-1 space-y-1">
                          <li>Download Ollama from <a href="https://ollama.com" target="_blank" rel="noopener noreferrer" className="underline">ollama.com</a></li>
                          <li>Install and run Ollama on your computer</li>
                          <li>Open terminal and run: <code className="bg-blue-100 px-2 py-1 rounded">ollama pull llama3</code></li>
                          <li>Ollama will run at http://localhost:11434</li>
                        </ol>
                      </div>
                    </div>
                  </div>

                  {/* Ollama URL */}
                  <div>
                    <label className="block font-medium text-gray-700 mb-1">
                      Ollama Server URL
                    </label>
                    <Input
                      type="text"
                      placeholder="http://localhost:11434"
                      value={settings.ollamaUrl}
                      onChange={(e) => setSettings({ ...settings, ollamaUrl: e.target.value })}
                      className="w-full"
                    />
                    <p className="text-sm text-gray-500 mt-1">
                      Keep as localhost for local models, or use cloud endpoint if using Ollama Cloud
                    </p>
                  </div>

                  {/* Ollama Model Selection */}
                  <div>
                    <label className="block font-medium text-gray-700 mb-1">
                      Ollama Model
                    </label>
                    <select
                      value={settings.ollamaModel}
                      onChange={(e) => setSettings({ ...settings, ollamaModel: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <optgroup label="Cloud Models (FREE - No Download)">
                        <option value="gpt-oss:20b-cloud">GPT-OSS 20B Cloud (Recommended - Fast & Free)</option>
                        <option value="gpt-oss:120b-cloud">GPT-OSS 120B Cloud (Larger, slower)</option>
                        <option value="deepseek-v3.1:671b-cloud">DeepSeek V3.1 671B Cloud (Very large)</option>
                        <option value="qwen3-coder:480b-cloud">Qwen3 Coder 480B Cloud (Coding focused)</option>
                      </optgroup>
                      <optgroup label="Local Models (Requires Download)">
                        <option value="llama3">Llama 3 8B (Recommended)</option>
                        <option value="llama3:70b">Llama 3 70B (Better quality, slower)</option>
                        <option value="mistral">Mistral 7B</option>
                        <option value="mixtral">Mixtral 8x7B</option>
                        <option value="phi">Phi 2.7B (Lightweight)</option>
                      </optgroup>
                    </select>
                    <p className="text-sm text-gray-500 mt-1">
                      Cloud models: Just sign in with <code className="bg-gray-100 px-2 py-1 rounded">ollama signin</code> | Local models: Run <code className="bg-gray-100 px-2 py-1 rounded">ollama pull {settings.ollamaModel}</code>
                    </p>
                  </div>
                </>
              )}

              {/* Save Button */}
              <div className="pt-4">
                <Button onClick={handleSave} disabled={isSaving}>
                  {isSaving ? "Saving..." : "Save Settings"}
                </Button>
              </div>
            </div>
          </Card>

          {/* Info Card */}
          <Card className="p-6 bg-yellow-50 border-yellow-200">
            <h3 className="text-lg font-semibold text-yellow-900 mb-2">💡 Usage Tips</h3>
            <ul className="text-sm text-yellow-800 space-y-2">
              <li>• Use natural language queries: &quot;remedy for headache with nausea&quot;</li>
              <li>• AI analyzes entire book content for accurate results</li>
              <li>• Results include page numbers and context from books</li>
              <li>• Try different providers to compare results</li>
              <li>• Medical models (BioGPT, Meditron) understand homeopathy terminology better</li>
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
