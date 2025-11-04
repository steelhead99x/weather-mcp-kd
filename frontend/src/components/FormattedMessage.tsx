import React, { useMemo } from 'react';

interface FormattedMessageProps {
  content: string;
  className?: string;
}

/**
 * Formats message content with basic markdown-like syntax
 * Supports: **bold**, *italic*, `code`, code blocks, and links
 *
 * @example
 * ```tsx
 * <FormattedMessage content="Here's the **weather** for *today*: `75°F`" />
 * ```
 */
export const FormattedMessage: React.FC<FormattedMessageProps> = ({
  content,
  className = '',
}) => {
  const formattedContent = useMemo(() => {
    if (!content) return null;

    // Split content by code blocks first (```...```)
    const codeBlockPattern = /```([\s\S]*?)```/g;
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match;
    let key = 0;

    while ((match = codeBlockPattern.exec(content)) !== null) {
      // Add text before code block
      if (match.index > lastIndex) {
        const textBefore = content.slice(lastIndex, match.index);
        parts.push(...formatInlineText(textBefore, key));
        key += 100;
      }

      // Add code block
      const codeContent = match[1].trim();
      parts.push(
        <pre key={`pre-${key++}`} className="my-3 p-3 bg-[var(--overlay)] border border-[var(--border)] rounded-lg overflow-x-auto">
          <code className="text-sm font-mono text-[var(--fg)]">
            {codeContent}
          </code>
        </pre>
      );

      lastIndex = match.index + match[0].length;
    }

    // Add remaining text after last code block
    if (lastIndex < content.length) {
      const textAfter = content.slice(lastIndex);
      parts.push(...formatInlineText(textAfter, key));
    }

    return parts;
  }, [content]);

  return (
    <div className={`chat-message ${className}`}>
      {formattedContent}
    </div>
  );
};

/**
 * Format inline text with markdown-like syntax
 * Handles: **bold**, *italic*, `code`, and [links](url)
 */
function formatInlineText(text: string, startKey: number): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const lines = text.split('\n');

  lines.forEach((line, lineIndex) => {
    if (lineIndex > 0) {
      parts.push(<br key={`br-${startKey + lineIndex}`} />);
    }

    if (!line.trim()) {
      return;
    }

    // Process inline formatting
    let remaining = line;
    let segmentKey = 0;
    const segments: React.ReactNode[] = [];

    // Combined pattern for all inline formatting
    const inlinePattern = /(\*\*.*?\*\*|\*.*?\*|`[^`]+`|\[([^\]]+)\]\(([^)]+)\))/g;
    let lastIndex = 0;
    let match;

    while ((match = inlinePattern.exec(remaining)) !== null) {
      // Add text before match
      if (match.index > lastIndex) {
        segments.push(remaining.slice(lastIndex, match.index));
      }

      const matched = match[0];
      const key = `${startKey}-${lineIndex}-${segmentKey++}`;

      if (matched.startsWith('**') && matched.endsWith('**')) {
        // Bold
        const boldText = matched.slice(2, -2);
        segments.push(
          <strong key={key} className="font-semibold text-[var(--fg)]">
            {boldText}
          </strong>
        );
      } else if (matched.startsWith('*') && matched.endsWith('*')) {
        // Italic
        const italicText = matched.slice(1, -1);
        segments.push(
          <em key={key} className="italic text-[var(--fg-muted)]">
            {italicText}
          </em>
        );
      } else if (matched.startsWith('`') && matched.endsWith('`')) {
        // Inline code
        const codeText = matched.slice(1, -1);
        segments.push(
          <code
            key={key}
            className="px-1.5 py-0.5 bg-[var(--overlay)] border border-[var(--border)] rounded text-sm font-mono"
          >
            {codeText}
          </code>
        );
      } else if (matched.startsWith('[')) {
        // Link
        const linkText = match[2];
        const linkUrl = match[3];
        segments.push(
          <a
            key={key}
            href={linkUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--accent)] hover:underline font-medium"
          >
            {linkText}
          </a>
        );
      }

      lastIndex = match.index + matched.length;
    }

    // Add remaining text
    if (lastIndex < remaining.length) {
      segments.push(remaining.slice(lastIndex));
    }

    // Wrap the line in a paragraph if it has content
    if (segments.length > 0) {
      parts.push(
        <p key={`p-${startKey + lineIndex}`} className="my-2 first:mt-0 last:mb-0">
          {segments}
        </p>
      );
    }
  });

  return parts;
}

interface MessageWithMetadataProps {
  content: string;
  timestamp?: Date | string;
  status?: 'sending' | 'sent' | 'error';
  showTimestamp?: boolean;
  className?: string;
}

/**
 * Enhanced message component with metadata like timestamp and status
 */
export const MessageWithMetadata: React.FC<MessageWithMetadataProps> = ({
  content,
  timestamp,
  status = 'sent',
  showTimestamp = false,
  className = '',
}) => {
  const formattedTime = useMemo(() => {
    if (!timestamp) return '';
    const date = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    });
  }, [timestamp]);

  const statusIcon = {
    sending: '⏳',
    sent: '✓',
    error: '⚠️',
  }[status];

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <FormattedMessage content={content} />
      {showTimestamp && (timestamp || status !== 'sent') && (
        <div className="flex items-center gap-2 mt-1 text-xs text-[var(--fg-subtle)]">
          {timestamp && <span>{formattedTime}</span>}
          {status !== 'sent' && (
            <span className="flex items-center gap-1">
              <span>{statusIcon}</span>
              <span className="capitalize">{status}</span>
            </span>
          )}
        </div>
      )}
    </div>
  );
};

/**
 * Helper function to extract and format URLs from text
 */
export function extractAndFormatUrls(text: string): React.ReactNode[] {
  const urlPattern = /(https?:\/\/[^\s]+)/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;
  let key = 0;

  while ((match = urlPattern.exec(text)) !== null) {
    // Add text before URL
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    // Add URL as link
    const url = match[0];
    parts.push(
      <a
        key={`url-${key++}`}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-[var(--accent)] hover:underline break-all"
      >
        {url}
      </a>
    );

    lastIndex = match.index + url.length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : [text];
}
