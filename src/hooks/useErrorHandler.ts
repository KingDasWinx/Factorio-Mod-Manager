import { useState, useCallback } from 'react';

interface ErrorInfo {
  title: string;
  message: string;
  details?: string;
  stack?: string;
  timestamp: Date;
}

export function useErrorHandler() {
  const [error, setError] = useState<ErrorInfo | null>(null);
  const [isErrorModalOpen, setIsErrorModalOpen] = useState(false);

  const showError = useCallback((title: string, message: string, details?: any) => {
    let errorDetails = '';
    let stack = '';

    // Se details for um objeto Error
    if (details instanceof Error) {
      errorDetails = details.message;
      stack = details.stack || '';
    } 
    // Se details for um objeto de resposta de fetch
    else if (details && typeof details === 'object') {
      try {
        errorDetails = JSON.stringify(details, null, 2);
      } catch {
        errorDetails = String(details);
      }
    }
    // Se details for uma string
    else if (details) {
      errorDetails = String(details);
    }

    const errorInfo: ErrorInfo = {
      title,
      message,
      details: errorDetails,
      stack,
      timestamp: new Date(),
    };

    setError(errorInfo);
    setIsErrorModalOpen(true);

    // Também loggar no console para debug
    console.error('Error captured by useErrorHandler:', {
      title,
      message,
      details,
    });
  }, []);

  const hideError = useCallback(() => {
    setIsErrorModalOpen(false);
    // Limpar o erro após um delay para permitir animação de saída
    setTimeout(() => setError(null), 300);
  }, []);

  const handleAsyncError = useCallback(async <T>(
    asyncFn: () => Promise<T>,
    errorTitle: string = 'Erro na Operação'
  ): Promise<T | null> => {
    try {
      return await asyncFn();
    } catch (err) {
      showError(errorTitle, 'Ocorreu um erro durante a operação', err);
      return null;
    }
  }, [showError]);

  return {
    error,
    isErrorModalOpen,
    showError,
    hideError,
    handleAsyncError,
  };
}
