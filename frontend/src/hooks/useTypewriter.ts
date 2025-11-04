import { useState, useEffect, useRef } from 'react';

interface TypewriterOptions {
  /**
   * Speed in milliseconds per character
   * Lower = faster, Higher = slower
   * Default: 20ms (50 chars/second)
   */
  speed?: number;
  /**
   * Delay before starting the typewriter effect
   * Default: 0ms
   */
  startDelay?: number;
  /**
   * Whether to skip the effect and show all text immediately
   * Default: false
   */
  skipAnimation?: boolean;
  /**
   * Callback when typing is complete
   */
  onComplete?: () => void;
}

/**
 * Custom hook for creating a typewriter effect on text
 *
 * @param text - The text to display with typewriter effect
 * @param options - Configuration options for the effect
 * @returns Object with displayedText, isTyping status, and skip function
 *
 * @example
 * ```tsx
 * const { displayedText, isTyping, skip } = useTypewriter(message, { speed: 30 });
 * return (
 *   <div onClick={skip}>
 *     {displayedText}
 *     {isTyping && <span className="cursor">|</span>}
 *   </div>
 * );
 * ```
 */
export function useTypewriter(
  text: string,
  options: TypewriterOptions = {}
) {
  const {
    speed = 20,
    startDelay = 0,
    skipAnimation = false,
    onComplete,
  } = options;

  const [displayedText, setDisplayedText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [shouldSkip, setShouldSkip] = useState(skipAnimation);

  const indexRef = useRef(0);
  const timeoutRef = useRef<NodeJS.Timeout>();

  // Reset when text changes
  useEffect(() => {
    indexRef.current = 0;
    setDisplayedText('');
    setIsTyping(true);
    setShouldSkip(skipAnimation);
  }, [text, skipAnimation]);

  // Typewriter effect
  useEffect(() => {
    if (!text) {
      setIsTyping(false);
      return;
    }

    // If skipping, show all text immediately
    if (shouldSkip) {
      setDisplayedText(text);
      setIsTyping(false);
      onComplete?.();
      return;
    }

    // Clear any existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    const startTyping = () => {
      if (indexRef.current < text.length) {
        setDisplayedText(text.slice(0, indexRef.current + 1));
        indexRef.current++;
        timeoutRef.current = setTimeout(startTyping, speed);
      } else {
        setIsTyping(false);
        onComplete?.();
      }
    };

    // Start after delay
    timeoutRef.current = setTimeout(startTyping, startDelay);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [text, speed, startDelay, shouldSkip, onComplete]);

  /**
   * Skip the animation and show all text immediately
   */
  const skip = () => {
    setShouldSkip(true);
    setDisplayedText(text);
    setIsTyping(false);
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
  };

  return {
    displayedText,
    isTyping,
    skip,
  };
}

/**
 * Hook for creating a more advanced typewriter effect with word-by-word display
 * This provides a more natural reading experience for longer texts
 *
 * @param text - The text to display
 * @param options - Configuration options
 * @returns Object with displayedText, isTyping status, and skip function
 */
export function useWordTypewriter(
  text: string,
  options: TypewriterOptions = {}
) {
  const {
    speed = 50, // Slower default for word-by-word
    startDelay = 0,
    skipAnimation = false,
    onComplete,
  } = options;

  const [displayedText, setDisplayedText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [shouldSkip, setShouldSkip] = useState(skipAnimation);

  const wordsRef = useRef<string[]>([]);
  const indexRef = useRef(0);
  const timeoutRef = useRef<NodeJS.Timeout>();

  // Split text into words
  useEffect(() => {
    wordsRef.current = text.split(/(\s+)/); // Keep whitespace
    indexRef.current = 0;
    setDisplayedText('');
    setIsTyping(true);
    setShouldSkip(skipAnimation);
  }, [text, skipAnimation]);

  // Word-by-word typing effect
  useEffect(() => {
    if (!text) {
      setIsTyping(false);
      return;
    }

    if (shouldSkip) {
      setDisplayedText(text);
      setIsTyping(false);
      onComplete?.();
      return;
    }

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    const typeNextWord = () => {
      if (indexRef.current < wordsRef.current.length) {
        const words = wordsRef.current.slice(0, indexRef.current + 1);
        setDisplayedText(words.join(''));
        indexRef.current++;

        // Longer pause after punctuation
        const currentWord = wordsRef.current[indexRef.current - 1] || '';
        const pauseMultiplier = /[.!?]/.test(currentWord) ? 3 : 1;

        timeoutRef.current = setTimeout(typeNextWord, speed * pauseMultiplier);
      } else {
        setIsTyping(false);
        onComplete?.();
      }
    };

    timeoutRef.current = setTimeout(typeNextWord, startDelay);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [text, speed, startDelay, shouldSkip, onComplete]);

  const skip = () => {
    setShouldSkip(true);
    setDisplayedText(text);
    setIsTyping(false);
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
  };

  return {
    displayedText,
    isTyping,
    skip,
  };
}
