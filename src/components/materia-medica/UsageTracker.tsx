"use client";

import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/Card';

interface UsageStats {
  rpm: number; // requests this minute
  rpd: number; // requests today
  lastReset: number; // timestamp of last minute reset
  dailyReset: number; // timestamp of last daily reset
}

interface UsageTrackerProps {
  provider: string;
  model: string;
}

// Model limits (RPM / RPD)
const MODEL_LIMITS: Record<string, { rpm: number; rpd: number; tpm: number }> = {
  'gemini-2.5-flash-lite': { rpm: 10, rpd: 20, tpm: 250000 }, // Actual free tier limits (lower than docs)
  'gemini-2.5-flash': { rpm: 10, rpd: 250, tpm: 250000 },
  'gemini-2.0-flash': { rpm: 10, rpd: 250, tpm: 250000 },
  'gemini-2.0-flash-lite': { rpm: 10, rpd: 20, tpm: 250000 },
  'gemini-1.5-flash': { rpm: 10, rpd: 250, tpm: 250000 },
  'gemini-1.5-pro': { rpm: 2, rpd: 25, tpm: 250000 },
  'groq': { rpm: 30, rpd: 14400, tpm: 6000 },
  'huggingface': { rpm: 10, rpd: 1000, tpm: 100000 },
  'ollama': { rpm: 999, rpd: 99999, tpm: 999999 }, // Local, no limits
};

export function UsageTracker({ provider, model }: UsageTrackerProps) {
  const [usage, setUsage] = useState<UsageStats>({
    rpm: 0,
    rpd: 0,
    lastReset: Date.now(),
    dailyReset: new Date().setHours(0, 0, 0, 0),
  });
  const [isExpanded, setIsExpanded] = useState(false);

  // Get limits for current model
  const modelKey = provider === 'gemini' ? model : provider;
  const limits = MODEL_LIMITS[modelKey] || { rpm: 10, rpd: 250, tpm: 250000 };

  // Load usage from localStorage
  useEffect(() => {
    const stored = localStorage.getItem('aiUsageStats');
    if (stored) {
      const parsed = JSON.parse(stored);
      
      // Reset if it's a new day
      const now = Date.now();
      const todayStart = new Date().setHours(0, 0, 0, 0);
      
      if (parsed.dailyReset < todayStart) {
        // New day, reset daily counter
        const newUsage = {
          rpm: 0,
          rpd: 0,
          lastReset: now,
          dailyReset: todayStart,
        };
        setUsage(newUsage);
        localStorage.setItem('aiUsageStats', JSON.stringify(newUsage));
      } else if (now - parsed.lastReset > 60000) {
        // More than 1 minute passed, reset RPM
        const newUsage = {
          ...parsed,
          rpm: 0,
          lastReset: now,
        };
        setUsage(newUsage);
        localStorage.setItem('aiUsageStats', JSON.stringify(newUsage));
      } else {
        setUsage(parsed);
      }
    }
  }, []);

  // Auto-reset RPM every minute
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      if (now - usage.lastReset > 60000) {
        const newUsage = {
          ...usage,
          rpm: 0,
          lastReset: now,
        };
        setUsage(newUsage);
        localStorage.setItem('aiUsageStats', JSON.stringify(newUsage));
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [usage]);

  // Listen for AI search events
  useEffect(() => {
    const handleAISearch = () => {
      const now = Date.now();
      const todayStart = new Date().setHours(0, 0, 0, 0);
      
      // Reset if new day
      if (usage.dailyReset < todayStart) {
        const newUsage = {
          rpm: 1,
          rpd: 1,
          lastReset: now,
          dailyReset: todayStart,
        };
        setUsage(newUsage);
        localStorage.setItem('aiUsageStats', JSON.stringify(newUsage));
        return;
      }
      
      // Reset RPM if more than 1 minute
      if (now - usage.lastReset > 60000) {
        const newUsage = {
          ...usage,
          rpm: 1,
          rpd: usage.rpd + 1,
          lastReset: now,
        };
        setUsage(newUsage);
        localStorage.setItem('aiUsageStats', JSON.stringify(newUsage));
        return;
      }
      
      // Increment counters
      const newUsage = {
        ...usage,
        rpm: usage.rpm + 1,
        rpd: usage.rpd + 1,
      };
      setUsage(newUsage);
      localStorage.setItem('aiUsageStats', JSON.stringify(newUsage));
    };

    window.addEventListener('ai-search-started', handleAISearch);
    return () => window.removeEventListener('ai-search-started', handleAISearch);
  }, [usage]);

  const rpmPercent = (usage.rpm / limits.rpm) * 100;
  const rpdPercent = (usage.rpd / limits.rpd) * 100;

  const getRpmColor = () => {
    if (rpmPercent >= 90) return 'text-red-600 bg-red-50';
    if (rpmPercent >= 70) return 'text-yellow-600 bg-yellow-50';
    return 'text-green-600 bg-green-50';
  };

  const getRpdColor = () => {
    if (rpdPercent >= 90) return 'text-red-600 bg-red-50';
    if (rpdPercent >= 70) return 'text-yellow-600 bg-yellow-50';
    return 'text-green-600 bg-green-50';
  };

  if (provider === 'ollama') {
    return (
      <div className="text-sm text-gray-500 flex items-center gap-2">
        <span className="inline-block w-2 h-2 bg-green-500 rounded-full"></span>
        Ollama (Local - No Limits)
      </div>
    );
  }

  return (
    <div className="mb-4">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full text-left"
      >
        <Card className="p-3 hover:shadow-md transition-shadow cursor-pointer">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className={`inline-block w-2 h-2 rounded-full ${rpmPercent >= 90 ? 'bg-red-500' : rpmPercent >= 70 ? 'bg-yellow-500' : 'bg-green-500'}`}></span>
              <div>
                <div className="text-sm font-medium text-gray-700">
                  API Usage: {provider === 'gemini' ? `Gemini ${model}` : provider.charAt(0).toUpperCase() + provider.slice(1)}
                </div>
                <div className="text-xs text-gray-500">
                  {usage.rpm}/{limits.rpm} RPM • {usage.rpd}/{limits.rpd} RPD
                </div>
              </div>
            </div>
            <svg
              className={`w-5 h-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </Card>
      </button>

      {isExpanded && (
        <Card className="mt-2 p-4 space-y-4">
          {/* RPM Progress */}
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="font-medium text-gray-700">Requests Per Minute (RPM)</span>
              <span className={`font-semibold ${getRpmColor()} px-2 py-0.5 rounded`}>
                {usage.rpm} / {limits.rpm}
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className={`h-2 rounded-full transition-all ${rpmPercent >= 90 ? 'bg-red-500' : rpmPercent >= 70 ? 'bg-yellow-500' : 'bg-green-500'}`}
                style={{ width: `${Math.min(rpmPercent, 100)}%` }}
              ></div>
            </div>
            <div className="text-xs text-gray-500 mt-1">
              Resets every minute • {Math.max(0, limits.rpm - usage.rpm)} requests remaining
            </div>
            {rpmPercent >= 80 && (
              <div className="mt-2 text-xs text-orange-600 bg-orange-50 p-2 rounded">
                ⚠️ Close to limit! Wait {Math.ceil((60 - (Date.now() - usage.lastReset) / 1000))}s before next search
              </div>
            )}
          </div>

          {/* RPD Progress */}
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="font-medium text-gray-700">Requests Per Day (RPD)</span>
              <span className={`font-semibold ${getRpdColor()} px-2 py-0.5 rounded`}>
                {usage.rpd} / {limits.rpd}
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className={`h-2 rounded-full transition-all ${rpdPercent >= 90 ? 'bg-red-500' : rpdPercent >= 70 ? 'bg-yellow-500' : 'bg-green-500'}`}
                style={{ width: `${Math.min(rpdPercent, 100)}%` }}
              ></div>
            </div>
            <div className="text-xs text-gray-500 mt-1">
              Resets at midnight • {Math.max(0, limits.rpd - usage.rpd)} requests remaining
            </div>
          </div>

          {/* TPM Info */}
          <div className="pt-3 border-t border-gray-200">
            <div className="text-xs text-gray-600">
              <div className="flex justify-between mb-1">
                <span>Tokens Per Minute (TPM):</span>
                <span className="font-medium">{limits.tpm.toLocaleString()}</span>
              </div>
              <div className="text-gray-500">
                Token usage depends on query length and response size
              </div>
            </div>
          </div>

          {/* Reset Button */}
          <button
            onClick={() => {
              const newUsage = {
                rpm: 0,
                rpd: 0,
                lastReset: Date.now(),
                dailyReset: new Date().setHours(0, 0, 0, 0),
              };
              setUsage(newUsage);
              localStorage.setItem('aiUsageStats', JSON.stringify(newUsage));
            }}
            className="w-full text-xs text-gray-600 hover:text-gray-800 py-2 border border-gray-300 rounded hover:bg-gray-50 transition-colors"
          >
            Reset Usage Counter
          </button>
        </Card>
      )}
    </div>
  );
}
