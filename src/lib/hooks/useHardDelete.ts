'use client';

import { useState, useCallback } from 'react';

export interface UseHardDeleteOptions {
  userId: string;
  patientId: string;
}

export interface HardDeleteState {
  isLoading: boolean;
  error: string | null;
  success: boolean;
  deletedRecords: {
    primary: string;
    cascaded: string[];
  } | null;
}

/**
 * useHardDelete hook manages hard delete operations
 * Handles API calls, loading states, and error handling
 */
export const useHardDelete = ({ userId, patientId }: UseHardDeleteOptions) => {
  const [state, setState] = useState<HardDeleteState>({
    isLoading: false,
    error: null,
    success: false,
    deletedRecords: null,
  });

  const deleteFee = useCallback(
    async (feeId: string, reason?: string) => {
      setState({ isLoading: true, error: null, success: false, deletedRecords: null });

      try {
        const response = await fetch(
          `/api/patients/${patientId}/fees/${feeId}/hard-delete`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, reason }),
          }
        );

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to delete fee');
        }

        const data = await response.json();
        setState({
          isLoading: false,
          error: null,
          success: true,
          deletedRecords: data.deletedRecords,
        });

        return data;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        setState({
          isLoading: false,
          error: errorMessage,
          success: false,
          deletedRecords: null,
        });
        throw error;
      }
    },
    [userId, patientId]
  );

  const deletePrescription = useCallback(
    async (prescriptionId: string, reason?: string) => {
      setState({ isLoading: true, error: null, success: false, deletedRecords: null });

      try {
        const response = await fetch(
          `/api/patients/${patientId}/prescriptions/${prescriptionId}/hard-delete`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, reason }),
          }
        );

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to delete prescription');
        }

        const data = await response.json();
        setState({
          isLoading: false,
          error: null,
          success: true,
          deletedRecords: data.deletedRecords,
        });

        return data;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        setState({
          isLoading: false,
          error: errorMessage,
          success: false,
          deletedRecords: null,
        });
        throw error;
      }
    },
    [userId, patientId]
  );

  const deleteBill = useCallback(
    async (billId: string, reason?: string) => {
      setState({ isLoading: true, error: null, success: false, deletedRecords: null });

      try {
        const response = await fetch(
          `/api/patients/${patientId}/bills/${billId}/hard-delete`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, reason }),
          }
        );

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to delete bill');
        }

        const data = await response.json();
        setState({
          isLoading: false,
          error: null,
          success: true,
          deletedRecords: data.deletedRecords,
        });

        return data;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        setState({
          isLoading: false,
          error: errorMessage,
          success: false,
          deletedRecords: null,
        });
        throw error;
      }
    },
    [userId, patientId]
  );

  const resetState = useCallback(() => {
    setState({
      isLoading: false,
      error: null,
      success: false,
      deletedRecords: null,
    });
  }, []);

  return {
    ...state,
    deleteFee,
    deletePrescription,
    deleteBill,
    resetState,
  };
};
