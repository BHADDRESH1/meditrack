import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from './Button';

interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  className?: string;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  title = 'Unable to load data',
  message = 'An unexpected error occurred while communicating with the inventory service. Please check your connection and try again.',
  onRetry,
  className = '',
}) => {
  return (
    <div
      role="alert"
      className={`p-6 sm:p-8 bg-rose-50/70 border border-rose-200 rounded-xl text-center flex flex-col items-center justify-center my-4 ${className}`}
    >
      <div className="w-10 h-10 rounded-full bg-rose-100 text-rose-700 flex items-center justify-center mb-3">
        <AlertCircle className="w-5 h-5" aria-hidden="true" />
      </div>
      <h3 className="text-sm sm:text-base font-bold text-rose-900">{title}</h3>
      <p className="mt-1 text-xs sm:text-sm text-rose-700 max-w-md">{message}</p>
      {onRetry && (
        <div className="mt-4">
          <Button
            variant="outline"
            size="sm"
            onClick={onRetry}
            icon={<RefreshCw className="w-3.5 h-3.5" />}
            className="border-rose-300 text-rose-800 hover:bg-rose-100"
          >
            Retry
          </Button>
        </div>
      )}
    </div>
  );
};
