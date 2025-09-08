import { createContext, useContext, ReactNode } from 'react';
import { useErrorHandler } from '../hooks/useErrorHandler';

interface ErrorContextValue {
  showError: (title: string, message: string, details?: any) => void;
  handleAsyncError: <T>(
    asyncFn: () => Promise<T>,
    errorTitle?: string
  ) => Promise<T | null>;
}

const ErrorContext = createContext<ErrorContextValue | undefined>(undefined);

export function useError() {
  const context = useContext(ErrorContext);
  if (!context) {
    throw new Error('useError must be used within an ErrorProvider');
  }
  return context;
}

interface ErrorProviderProps {
  children: ReactNode;
  errorHandler: ReturnType<typeof useErrorHandler>;
}

export function ErrorProvider({ children, errorHandler }: ErrorProviderProps) {
  const value: ErrorContextValue = {
    showError: errorHandler.showError,
    handleAsyncError: errorHandler.handleAsyncError,
  };

  return (
    <ErrorContext.Provider value={value}>
      {children}
    </ErrorContext.Provider>
  );
}
