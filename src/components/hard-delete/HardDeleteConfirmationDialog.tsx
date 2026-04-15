'use client';

import React, { useState } from 'react';

export interface HardDeleteConfirmationDialogProps {
  isOpen: boolean;
  itemType: 'fee' | 'prescription' | 'bill';
  itemDetails: {
    id: string;
    name?: string;
    amount?: number;
    description?: string;
    [key: string]: unknown;
  };
  onConfirm: (reason?: string) => Promise<void>;
  onCancel: () => void;
  isLoading?: boolean;
}

/**
 * HardDeleteConfirmationDialog displays a confirmation dialog for hard delete operations
 * Shows item details and warns that the action is permanent
 */
export const HardDeleteConfirmationDialog: React.FC<HardDeleteConfirmationDialogProps> = ({
  isOpen,
  itemType,
  itemDetails,
  onConfirm,
  onCancel,
  isLoading = false,
}) => {
  const [reason, setReason] = useState('');
  const [isConfirming, setIsConfirming] = useState(false);

  if (!isOpen) {
    return null;
  }

  const handleConfirm = async () => {
    setIsConfirming(true);
    try {
      await onConfirm(reason);
    } finally {
      setIsConfirming(false);
      setReason('');
    }
  };

  const handleCancel = () => {
    setReason('');
    onCancel();
  };

  const getItemTypeLabel = () => {
    switch (itemType) {
      case 'fee':
        return 'Fee';
      case 'prescription':
        return 'Prescription';
      case 'bill':
        return 'Bill';
      default:
        return 'Item';
    }
  };

  const getItemDescription = () => {
    switch (itemType) {
      case 'fee':
        return `Amount: ${itemDetails.amount ? `₹${itemDetails.amount}` : 'N/A'}`;
      case 'prescription':
        return `Prescription: ${itemDetails.name || 'N/A'}`;
      case 'bill':
        return `Bill ID: ${itemDetails.id}`;
      default:
        return '';
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-lg max-w-md w-full mx-4">
        {/* Header */}
        <div className="bg-red-50 border-b border-red-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-red-900">
            Delete {getItemTypeLabel()}?
          </h2>
        </div>

        {/* Content */}
        <div className="px-6 py-4">
          {/* Warning */}
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded">
            <p className="text-sm text-red-800 font-medium">⚠️ Warning</p>
            <p className="text-sm text-red-700 mt-1">
              This action is permanent and cannot be undone. The {getItemTypeLabel().toLowerCase()} and all related records will be permanently deleted from the system.
            </p>
          </div>

          {/* Item Details */}
          <div className="mb-4 p-3 bg-gray-50 border border-gray-200 rounded">
            <p className="text-sm font-medium text-gray-700 mb-2">Item Details:</p>
            <div className="space-y-1">
              <p className="text-sm text-gray-600">
                <span className="font-medium">Type:</span> {getItemTypeLabel()}
              </p>
              <p className="text-sm text-gray-600">
                <span className="font-medium">ID:</span> {itemDetails.id}
              </p>
              <p className="text-sm text-gray-600">
                {getItemDescription()}
              </p>
            </div>
          </div>

          {/* Reason Input */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Reason for deletion (optional):
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Enter reason for deletion..."
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
              rows={3}
              disabled={isConfirming || isLoading}
            />
          </div>

          {/* Confirmation Checkbox */}
          <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded">
            <p className="text-sm text-yellow-800">
              ✓ I understand this action is permanent and cannot be recovered.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-gray-50 border-t border-gray-200 px-6 py-4 flex justify-end gap-3">
          <button
            onClick={handleCancel}
            disabled={isConfirming || isLoading}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={isConfirming || isLoading}
            className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isConfirming || isLoading ? 'Deleting...' : 'Delete Permanently'}
          </button>
        </div>
      </div>
    </div>
  );
};
