// Text splitting utilities for TTS API limits

const MAX_CHUNK_LENGTH = 4096;
const SENTENCE_ENDINGS = /[.!?]+\s+/g;
const FALLBACK_BREAKS = /[,;:\-—]+\s+/g;
const WORD_BREAKS = /\s+/g;

/**
 * Split text into chunks that respect API character limits
 * @param text The text to split
 * @param maxLength Maximum length per chunk (default: 4096)
 * @returns Array of text chunks
 */
export function splitTextForTTS(text: string, maxLength: number = MAX_CHUNK_LENGTH): string[] {
  if (text.length <= maxLength) {
    return [text];
  }

  const chunks: string[] = [];
  let remainingText = text.trim();

  while (remainingText.length > 0) {
    if (remainingText.length <= maxLength) {
      chunks.push(remainingText);
      break;
    }

    // Find the best split point within the character limit
    const chunk = remainingText.substring(0, maxLength);
    let splitPoint = findBestSplitPoint(chunk);

    // If no good split point found, force split at word boundary
    if (splitPoint === -1) {
      splitPoint = findLastWordBoundary(chunk);
    }

    // If still no split point, force split at character limit
    if (splitPoint === -1) {
      splitPoint = maxLength - 1;
    }

    // Extract the chunk and prepare remaining text
    const actualChunk = remainingText.substring(0, splitPoint + 1).trim();
    if (actualChunk.length > 0) {
      chunks.push(actualChunk);
    }

    remainingText = remainingText.substring(splitPoint + 1).trim();
  }

  return chunks.filter(chunk => chunk.length > 0);
}

/**
 * Find the best split point (prioritizing sentence endings)
 * @param text Text to analyze
 * @returns Index of best split point, or -1 if none found
 */
function findBestSplitPoint(text: string): number {
  // Look for sentence endings (highest priority)
  const sentenceMatches = [...text.matchAll(SENTENCE_ENDINGS)];
  if (sentenceMatches.length > 0) {
    const lastMatch = sentenceMatches[sentenceMatches.length - 1];
    return (lastMatch.index ?? 0) + lastMatch[0].length - 1;
  }

  // Look for clause breaks (medium priority)
  const clauseMatches = [...text.matchAll(FALLBACK_BREAKS)];
  if (clauseMatches.length > 0) {
    const lastMatch = clauseMatches[clauseMatches.length - 1];
    return (lastMatch.index ?? 0) + lastMatch[0].length - 1;
  }

  return -1;
}

/**
 * Find the last word boundary within the text
 * @param text Text to analyze
 * @returns Index of last word boundary, or -1 if none found
 */
function findLastWordBoundary(text: string): number {
  const wordMatches = [...text.matchAll(WORD_BREAKS)];
  if (wordMatches.length > 0) {
    const lastMatch = wordMatches[wordMatches.length - 1];
    return (lastMatch.index ?? 0) - 1;
  }
  return -1;
}

/**
 * Estimate the speaking duration of text in seconds
 * Based on average speaking rate of 150-160 words per minute
 * @param text Text to analyze
 * @returns Estimated duration in seconds
 */
export function estimateSpeakingDuration(text: string): number {
  const wordCount = text.trim().split(/\s+/).length;
  const wordsPerMinute = 155; // Average speaking rate
  return (wordCount / wordsPerMinute) * 60;
}

/**
 * Validate text chunk for TTS compatibility
 * @param text Text chunk to validate
 * @returns Validation result with warnings
 */
export function validateTextChunk(text: string): {
  isValid: boolean;
  warnings: string[];
  estimatedDuration: number;
} {
  const warnings: string[] = [];
  let isValid = true;

  // Check length
  if (text.length > MAX_CHUNK_LENGTH) {
    warnings.push(`Text exceeds ${MAX_CHUNK_LENGTH} characters (${text.length})`);
    isValid = false;
  }

  // Check for very short text
  if (text.length < 10) {
    warnings.push('Text is very short, may not generate good audio');
  }

  // Check for unusual characters that might cause issues
  const unusualChars = /[^\w\s.,!?;:\-—'"()[\]]/g;
  const unusualMatches = text.match(unusualChars);
  if (unusualMatches && unusualMatches.length > 0) {
    warnings.push(`Contains unusual characters: ${[...new Set(unusualMatches)].join(', ')}`);
  }

  // Check for very long sentences
  const sentences = text.split(SENTENCE_ENDINGS);
  const longSentences = sentences.filter(s => s.length > 500);
  if (longSentences.length > 0) {
    warnings.push(`Contains ${longSentences.length} very long sentence(s)`);
  }

  const estimatedDuration = estimateSpeakingDuration(text);

  return {
    isValid,
    warnings,
    estimatedDuration
  };
}

/**
 * Optimize text for TTS by cleaning and normalizing
 * @param text Raw text input
 * @returns Optimized text
 */
export function optimizeTextForTTS(text: string): string {
  return text
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    // Fix common punctuation issues
    .replace(/\.\.\./g, '…')
    .replace(/--/g, '—')
    // Ensure proper spacing after punctuation
    .replace(/([.!?])([A-Z])/g, '$1 $2')
    .replace(/([,;:])([A-Z])/g, '$1 $2')
    // Remove extra spaces
    .trim();
} 