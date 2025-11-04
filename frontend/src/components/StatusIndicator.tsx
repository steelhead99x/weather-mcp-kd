import React from 'react';

export type StatusType = 'typing' | 'loading' | 'processing' | 'thinking' | 'generating';

interface StatusIndicatorProps {
  type: StatusType;
  message?: string;
  className?: string;
}

/**
 * Professional status indicator component with animated dots
 * Shows different states like typing, loading, processing, etc.
 *
 * @example
 * ```tsx
 * <StatusIndicator type="typing" message="Weather Agent is typing" />
 * <StatusIndicator type="processing" message="Generating video" />
 * ```
 */
export const StatusIndicator: React.FC<StatusIndicatorProps> = ({
  type,
  message,
  className = '',
}) => {
  const getStatusConfig = () => {
    switch (type) {
      case 'typing':
        return {
          icon: '✍️',
          defaultMessage: 'Typing...',
          color: 'text-blue-500',
        };
      case 'loading':
        return {
          icon: '⏳',
          defaultMessage: 'Loading...',
          color: 'text-purple-500',
        };
      case 'processing':
        return {
          icon: '⚙️',
          defaultMessage: 'Processing...',
          color: 'text-orange-500',
        };
      case 'thinking':
        return {
          icon: '🤔',
          defaultMessage: 'Thinking...',
          color: 'text-teal-500',
        };
      case 'generating':
        return {
          icon: '✨',
          defaultMessage: 'Generating...',
          color: 'text-pink-500',
        };
      default:
        return {
          icon: '⏳',
          defaultMessage: 'Loading...',
          color: 'text-gray-500',
        };
    }
  };

  const config = getStatusConfig();
  const displayMessage = message || config.defaultMessage;

  return (
    <div
      className={`flex items-center gap-2 py-2 px-3 rounded-lg bg-[var(--overlay)] animate-fade-in ${className}`}
      role="status"
      aria-live="polite"
      aria-label={displayMessage}
    >
      <span className="text-lg animate-bounce-gentle" aria-hidden="true">
        {config.icon}
      </span>
      <span className={`text-sm font-medium ${config.color}`}>
        {displayMessage}
      </span>
      <span className="flex gap-1 ml-1">
        <span className="w-1.5 h-1.5 rounded-full bg-current animate-typing" style={{ animationDelay: '0ms' }}></span>
        <span className="w-1.5 h-1.5 rounded-full bg-current animate-typing" style={{ animationDelay: '150ms' }}></span>
        <span className="w-1.5 h-1.5 rounded-full bg-current animate-typing" style={{ animationDelay: '300ms' }}></span>
      </span>
    </div>
  );
};

interface TypingIndicatorProps {
  message?: string;
  className?: string;
}

/**
 * Simplified typing indicator with animated dots
 * Commonly used in chat interfaces
 */
export const TypingIndicator: React.FC<TypingIndicatorProps> = ({
  message = 'Weather Agent is typing',
  className = '',
}) => {
  return (
    <div
      className={`inline-flex items-center gap-2 py-2 px-4 rounded-2xl bg-[var(--overlay)] animate-slide-up ${className}`}
      role="status"
      aria-live="polite"
      aria-label={message}
    >
      <span className="flex gap-1.5">
        <span
          className="w-2 h-2 rounded-full bg-[var(--fg-subtle)] animate-typing"
          style={{ animationDelay: '0ms' }}
        ></span>
        <span
          className="w-2 h-2 rounded-full bg-[var(--fg-subtle)] animate-typing"
          style={{ animationDelay: '150ms' }}
        ></span>
        <span
          className="w-2 h-2 rounded-full bg-[var(--fg-subtle)] animate-typing"
          style={{ animationDelay: '300ms' }}
        ></span>
      </span>
      <span className="sr-only">{message}</span>
    </div>
  );
};

interface ProgressIndicatorProps {
  message: string;
  progress?: number; // 0-100
  className?: string;
}

/**
 * Progress indicator with optional percentage
 * Useful for showing upload/processing progress
 */
export const ProgressIndicator: React.FC<ProgressIndicatorProps> = ({
  message,
  progress,
  className = '',
}) => {
  return (
    <div
      className={`flex flex-col gap-2 py-3 px-4 rounded-lg bg-[var(--overlay)] animate-slide-up ${className}`}
      role="status"
      aria-live="polite"
      aria-label={`${message}${progress !== undefined ? ` ${progress}%` : ''}`}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-[var(--fg)]">{message}</span>
        {progress !== undefined && (
          <span className="text-xs font-semibold text-[var(--accent)] tabular-nums">
            {Math.round(progress)}%
          </span>
        )}
      </div>
      {progress !== undefined && (
        <div className="w-full h-1.5 bg-[var(--overlay-strong)] rounded-full overflow-hidden">
          <div
            className="h-full bg-[var(--accent)] rounded-full transition-all duration-300 ease-out"
            style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
          />
        </div>
      )}
    </div>
  );
};

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

/**
 * Simple spinner component
 * Useful for loading states
 */
export const Spinner: React.FC<SpinnerProps> = ({ size = 'md', className = '' }) => {
  const sizeClasses = {
    sm: 'w-4 h-4 border-2',
    md: 'w-6 h-6 border-2',
    lg: 'w-8 h-8 border-3',
  };

  return (
    <div
      className={`inline-block ${sizeClasses[size]} border-[var(--accent)] border-t-transparent rounded-full animate-spin ${className}`}
      role="status"
      aria-label="Loading"
    >
      <span className="sr-only">Loading...</span>
    </div>
  );
};
