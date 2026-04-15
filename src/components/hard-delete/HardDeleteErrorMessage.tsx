'use client';

import React from 'react';

export interface HardDeleteErrorMessageProps {
  isVisible: boolean;
  error: string;
  details?: string[];
  suggestions?: string[];
  onDismiss: () => void;
}

/**
 * HardDeleteErrorMessage displays error messages for failed hard delete operations
 * Provides clear error descriptions and corrective action suggestions
 */
export const HardDeleteErrorMessage: React.FC<HardDeleteErrorMessageProps> = ({
  isVisible,
  error,
  details = [],
  suggestions = [],
  onDismiss,
}) => {
  if (!isVisible) {
    return null;
  }

  return (
    <div className="fixed top-4 right-4 max-w-md bg-red-50 border border-red-200 rounded-lg shadow-lg z-50">
      <div className="p-4">
        {/* Header */}
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0">
            <svg
              className="h-5 w-5 text-red-600"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                clipRule="evenodd"
              />
            </svg>
          </div>

          <div className="flex-1">
            <h3 className="text-sm font-medium text-red-900">
              Deletion Failed
            </h3>
            <p className="mt-1 text-sm text-red-700">
              {error}
            </p>

            {/* Details */}
            {details.length > 0 && (
              <div className="mt-3 text-sm text-red-700">
                <p className="font-medium mb-1">Details:</p>
                <ul className="list-disc list-inside space-y-1">
                  {details.map((detail, index) => (
                    <li key={index}>{detail}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Suggestions */}
            {suggestions.length > 0 && (
              <div className="mt-3 text-sm text-red-700">
                <p className="font-medium mb-1">What you can do:</p>
                <ul className="list-disc list-inside space-y-1">
                  {suggestions.map((suggestion, index) => (
                    <li key={index}>{suggestion}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Close Button */}
          <button
            onClick={onDismiss}
            className="flex-shrink-0 text-red-600 hover:text-red-700"
          >
            <svg
              className="h-5 w-5"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
};
