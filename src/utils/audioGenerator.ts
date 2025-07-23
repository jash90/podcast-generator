import OpenAI from 'openai';
import { createOpenAIClient } from '../config/api';
import type { PodcastScript, PodcastSegment, PersonaCollection, PersonaDetail } from '../types';
import { splitTextForTTS, optimizeTextForTTS, validateTextChunk } from './textSplitter';

// TTS Rate Limiting Configuration
const TTS_RATE_LIMITING = {
  ERROR_RETRY_DELAY: 3000,      // 3 seconds delay for general errors
  RATE_LIMIT_DELAY: 8000,       // 8 seconds for rate limit errors
  PRELOAD_DELAY: 1500,          // 1.5 seconds between preload requests
  MAX_RETRIES: 2,               // Reduced retries to prevent long waits
  CHUNK_PROCESSING_DELAY: 1000, // 1 second between chunks
} as const;

// Enhanced voice configuration with characteristics
const VOICE_PROFILES = {
  echo: {
    gender: 'male' as const,
    characteristics: {
      tone: ['authoritative', 'professional', 'calm'] as Array<'warm' | 'authoritative' | 'friendly' | 'professional' | 'energetic' | 'calm'>,
      style: ['formal', 'academic', 'journalistic'] as Array<'conversational' | 'formal' | 'casual' | 'academic' | 'journalistic'>,
      ageRange: ['30-40', '40-50'],
      personality: ['analytical', 'serious', 'knowledgeable']
    }
  },
  onyx: {
    gender: 'male' as const,
    characteristics: {
      tone: ['warm', 'friendly', 'calm'] as Array<'warm' | 'authoritative' | 'friendly' | 'professional' | 'energetic' | 'calm'>,
      style: ['conversational', 'casual'] as Array<'conversational' | 'formal' | 'casual' | 'academic' | 'journalistic'>,
      ageRange: ['25-35', '30-40'],
      personality: ['approachable', 'enthusiastic', 'engaging']
    }
  },
  fable: {
    gender: 'male' as const,
    characteristics: {
      tone: ['energetic', 'professional'] as Array<'warm' | 'authoritative' | 'friendly' | 'professional' | 'energetic' | 'calm'>,
      style: ['journalistic', 'conversational'] as Array<'conversational' | 'formal' | 'casual' | 'academic' | 'journalistic'>,
      ageRange: ['25-35', '30-40'],
      personality: ['dynamic', 'confident', 'articulate']
    }
  },
  alloy: {
    gender: 'female' as const,
    characteristics: {
      tone: ['professional', 'friendly', 'calm'] as Array<'warm' | 'authoritative' | 'friendly' | 'professional' | 'energetic' | 'calm'>,
      style: ['formal', 'conversational'] as Array<'conversational' | 'formal' | 'casual' | 'academic' | 'journalistic'>,
      ageRange: ['30-40', '35-45'],
      personality: ['composed', 'trustworthy', 'reliable']
    }
  },
  nova: {
    gender: 'female' as const,
    characteristics: {
      tone: ['energetic', 'warm', 'friendly'] as Array<'warm' | 'authoritative' | 'friendly' | 'professional' | 'energetic' | 'calm'>,
      style: ['conversational', 'casual'] as Array<'conversational' | 'formal' | 'casual' | 'academic' | 'journalistic'>,
      ageRange: ['25-35', '30-40'],
      personality: ['vibrant', 'passionate', 'expressive']
    }
  },
  shimmer: {
    gender: 'female' as const,
    characteristics: {
      tone: ['calm', 'professional', 'warm'] as Array<'warm' | 'authoritative' | 'friendly' | 'professional' | 'energetic' | 'calm'>,
      style: ['formal', 'academic'] as Array<'conversational' | 'formal' | 'casual' | 'academic' | 'journalistic'>,
      ageRange: ['35-45', '40-50'],
      personality: ['mature', 'balanced', 'thoughtful']
    }
  }
};

type VoiceType = keyof typeof VOICE_PROFILES;

const voiceAssignments = new Map<string, VoiceType>();
// Audio cache using Uint8Array to avoid detached ArrayBuffer issues
const audioCache = new Map<string, Uint8Array>();

// Progress callback types
export interface DownloadProgress {
  segmentIndex: number;
  totalSegments: number;
  segmentProgress: number; // 0-100 for current segment
  overallProgress: number; // 0-100 for entire download
  currentOperation: string;
  segmentInfo?: {
    type: string;
    textLength: number;
    chunks: number;
  };
}

export interface AudioSegmentResult {
  success: boolean;
  buffer?: ArrayBuffer;
  error?: string;
  retries: number;
}

// Unified Audio Download Manager
export class AudioDownloadManager {
  private apiKey: string;
  private model: string;
  private script: PodcastScript;
  private onProgress?: (progress: DownloadProgress) => void;

  constructor(
    script: PodcastScript, 
    apiKey: string, 
    model: string = 'tts-1',
    onProgress?: (progress: DownloadProgress) => void
  ) {
    this.script = script;
    this.apiKey = apiKey;
    this.model = model;
    this.onProgress = onProgress;
  }

  private reportProgress(
    segmentIndex: number,
    segmentProgress: number,
    operation: string,
    segment?: PodcastSegment
  ): void {
    if (!this.onProgress) return;

    const overallProgress = ((segmentIndex + (segmentProgress / 100)) / this.script.segments.length) * 100;
    
    this.onProgress({
      segmentIndex,
      totalSegments: this.script.segments.length,
      segmentProgress,
      overallProgress,
      currentOperation: operation,
      segmentInfo: segment ? {
        type: segment.type,
        textLength: segment.text.length,
        chunks: splitTextForTTS(segment.text).length
      } : undefined
    });
  }

  private async retryWithBackoff<T>(
    operation: () => Promise<T>,
    context: string,
    maxRetries: number = TTS_RATE_LIMITING.MAX_RETRIES
  ): Promise<{ result: T; retries: number }> {
    let retries = 0;
    
    while (retries <= maxRetries) {
      try {
        const result = await operation();
        return { result, retries };
      } catch (error: unknown) {
        retries++;
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`❌ ${context} failed (attempt ${retries}/${maxRetries + 1}):`, errorMessage);
        
        if (retries > maxRetries) {
          throw new Error(`${context} failed after ${maxRetries + 1} attempts: ${errorMessage}`);
        }
        
        // Determine delay based on error type
        const hasStatusCode = error && typeof error === 'object' && 'status' in error;
        const isRateLimit = errorMessage.includes('rate limit') || 
                           errorMessage.includes('429') ||
                           (hasStatusCode && (error as { status: number }).status === 429);
        const delayMs = isRateLimit ? TTS_RATE_LIMITING.RATE_LIMIT_DELAY : TTS_RATE_LIMITING.ERROR_RETRY_DELAY;
        
        console.log(`⏳ ${context} - waiting ${delayMs / 1000} seconds before retry...`);
        await this.delay(delayMs);
      }
    }
    
    throw new Error(`${context} failed after all retries`);
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async generateSegmentAudio(segment: PodcastSegment, segmentIndex: number): Promise<AudioSegmentResult> {
    try {
      // Input validation
      if (!segment || !segment.text || segment.text.trim().length === 0) {
        throw new Error(`Invalid segment: ${segment?.type || 'unknown'} has no text content`);
      }

      this.reportProgress(segmentIndex, 0, `Generating audio for ${segment.type}`, segment);

      const result = await this.retryWithBackoff(
        () => generateAudioForSegment(segment, this.apiKey, this.model),
        `Segment ${segmentIndex + 1} (${segment.type})`
      );

      // Validate result buffer
      if (!result.result || result.result.byteLength === 0) {
        throw new Error(`Generated buffer is empty for segment ${segmentIndex + 1}`);
      }

      this.reportProgress(segmentIndex, 100, `Completed ${segment.type}`);
      
      return {
        success: true,
        buffer: result.result,
        retries: result.retries
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`❌ Failed to generate segment ${segmentIndex + 1} (${segment?.type}):`, errorMessage);
      
      return {
        success: false,
        error: errorMessage,
        retries: TTS_RATE_LIMITING.MAX_RETRIES + 1
      };
    }
  }

  async downloadAllSegments(): Promise<{
    audioBuffers: ArrayBuffer[];
    failedSegments: number[];
    totalRetries: number;
  }> {
    console.log('🎵 Starting comprehensive audio download...');
    
    // Initialize voice assignments if not already done
    if (voiceAssignments.size === 0) {
      await initializeVoiceAssignments(this.script);
      console.log('✅ Voice assignments initialized');
    }

    if (!this.script.segments.length) {
      throw new Error('No segments available for download');
    }

    const audioBuffers: ArrayBuffer[] = [];
    const failedSegments: number[] = [];
    let totalRetries = 0;

    console.log(`📊 Processing ${this.script.segments.length} segments...`);

    // Process segments sequentially for rate limiting compliance
    for (let i = 0; i < this.script.segments.length; i++) {
      const segment = this.script.segments[i];
      console.log(`🎙️ Processing segment ${i + 1}/${this.script.segments.length}: ${segment.type} (${segment.text.length} chars)`);

      const result = await this.generateSegmentAudio(segment, i);
      totalRetries += result.retries;

      if (result.success && result.buffer) {
        // Additional validation before adding to buffers
        if (validateAudioBuffer(result.buffer, `Segment ${i + 1} final check`)) {
          audioBuffers.push(result.buffer);
          console.log(`✅ Segment ${i + 1} completed successfully`);
        } else {
          failedSegments.push(i);
          console.error(`❌ Segment ${i + 1} failed validation despite successful generation`);
          
          // Create silent buffer for failed segments to maintain sync
          const silentBuffer = new ArrayBuffer(2048); // Slightly larger silent buffer
          audioBuffers.push(silentBuffer);
        }
      } else {
        failedSegments.push(i);
        console.error(`❌ Segment ${i + 1} failed permanently: ${result.error}`);
        
        // Create silent buffer for failed segments to maintain sync
        const silentBuffer = new ArrayBuffer(2048); // Slightly larger silent buffer
        audioBuffers.push(silentBuffer);
      }
    }

    console.log(`📈 Download complete: ${audioBuffers.length - failedSegments.length}/${audioBuffers.length} successful, ${totalRetries} total retries`);

    return {
      audioBuffers,
      failedSegments,
      totalRetries
    };
  }

  async downloadAndSave(): Promise<void> {
    console.log('💾 Starting download and save process...');
    
    this.reportProgress(0, 0, 'Initializing download...');

    const { audioBuffers, failedSegments, totalRetries } = await this.downloadAllSegments();

    // Report combining progress
    this.reportProgress(this.script.segments.length, 0, 'Combining audio segments...');

    // Combine audio buffers
    const combinedBuffer = combineAudioBuffers(audioBuffers);
    console.log(`🔗 Combined buffer size: ${combinedBuffer.byteLength} bytes`);

    // Create and download file
    this.reportProgress(this.script.segments.length, 50, 'Creating download file...');
    
    const blob = new Blob([combinedBuffer], { type: 'audio/mpeg' });
    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    const filename = `podcast-${timestamp}.mp3`;
    
    this.reportProgress(this.script.segments.length, 75, 'Starting download...');
    
    // Use enhanced download function
    createDownloadLink(blob, filename);

    this.reportProgress(this.script.segments.length, 100, 'Download complete!');

    if (failedSegments.length > 0) {
      console.warn(`⚠️ Download completed with ${failedSegments.length} failed segments: ${failedSegments.map(i => i + 1).join(', ')}`);
    } else {
      console.log(`🎉 Perfect download! All ${this.script.segments.length} segments generated successfully with ${totalRetries} retries`);
    }

    console.log(`📁 Downloaded: ${filename} (${Math.round(blob.size / 1024)} KB)`);
  }

  // Method for preloading segments (used by AudioPlayer)
  async preloadSegment(segment: PodcastSegment, segmentIndex: number): Promise<AudioSegmentResult> {
    try {
      // Use shorter delay for preloading to improve UX
      const result = await this.retryWithBackoff(
        async () => {
          // Small delay for preload to be gentle on the API
          if (segmentIndex > 0) {
            await this.delay(TTS_RATE_LIMITING.PRELOAD_DELAY);
          }
          return await generateAudioForSegment(segment, this.apiKey, this.model);
        },
        `Preload segment ${segmentIndex + 1} (${segment.type})`,
        2 // Fewer retries for preload
      );

      return {
        success: true,
        buffer: result.result,
        retries: result.retries
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: errorMessage,
        retries: 2
      };
    }
  }
}

/**
 * Add delay between TTS API requests to prevent rate limiting
 */
async function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Check if an ArrayBuffer is detached
 */
function isArrayBufferDetached(buffer: ArrayBuffer): boolean {
  try {
    // Try to create a view of the buffer - this will throw if detached
    new Uint8Array(buffer);
    return false;
  } catch {
    return true;
  }
}

/**
 * Calculate compatibility score between a persona and voice profile
 */
function calculateVoiceCompatibility(persona: PersonaDetail, voiceProfile: typeof VOICE_PROFILES[VoiceType]): number {
  let score = 0;
  
  // Gender match is essential
  if (persona.gender !== voiceProfile.gender) {
    return 0;
  }
  
  // Tone compatibility (40% weight)
  if (voiceProfile.characteristics.tone.includes(persona.voiceCharacteristics.tone)) {
    score += 40;
  }
  
  // Style compatibility (30% weight)
  if (voiceProfile.characteristics.style.includes(persona.voiceCharacteristics.style)) {
    score += 30;
  }
  
  // Age range compatibility (20% weight)
  const ageRangeMatch = voiceProfile.characteristics.ageRange.some(range => 
    range === persona.ageRange || persona.ageRange === range
  );
  if (ageRangeMatch) {
    score += 20;
  }
  
  // Personality match (10% weight)
  const personalityMatch = persona.personality.some(trait => 
    voiceProfile.characteristics.personality.some(voiceTrait => 
      trait.toLowerCase().includes(voiceTrait.toLowerCase()) ||
      voiceTrait.toLowerCase().includes(trait.toLowerCase())
    )
  );
  if (personalityMatch) {
    score += 10;
  }
  
  return score;
}

/**
 * Assign the best matching voice for a persona using detailed characteristics
 */
function assignVoiceForPersona(type: string, personas: PersonaCollection | Record<string, boolean>): VoiceType {
  if (voiceAssignments.has(type)) {
    return voiceAssignments.get(type)!;
  }

  // Fallback to gender-based assignment for backward compatibility
  if (!('host' in personas) || typeof personas.host === 'boolean') {
    const genderMap = personas as Record<string, boolean>;
    const isMale = genderMap[type];
    const availableVoices = isMale 
      ? (['echo', 'onyx', 'fable'] as const)
      : (['alloy', 'nova', 'shimmer'] as const);
    const usedVoices = Array.from(voiceAssignments.values());
    const unusedVoice = availableVoices.find(voice => !usedVoices.includes(voice));
    const assignedVoice = unusedVoice || availableVoices[usedVoices.length % availableVoices.length];
    
    voiceAssignments.set(type, assignedVoice);
    return assignedVoice;
  }

  // Use detailed persona matching
  const personaCollection = personas as PersonaCollection;
  const persona = personaCollection[type as keyof PersonaCollection];
  
  if (!persona) {
    console.warn(`No persona found for type: ${type}, using default voice`);
    voiceAssignments.set(type, 'onyx');
    return 'onyx';
  }

  // Calculate compatibility scores for all voices
  const voiceScores = Object.entries(VOICE_PROFILES).map(([voiceName, profile]) => ({
    voice: voiceName as VoiceType,
    score: calculateVoiceCompatibility(persona, profile)
  }));

  // Filter out voices that don't match gender
  const compatibleVoices = voiceScores.filter(v => v.score > 0);
  
  if (compatibleVoices.length === 0) {
    console.warn(`No compatible voices found for ${type}, using gender fallback`);
    const fallbackVoices = persona.gender === 'male' 
      ? (['echo', 'onyx', 'fable'] as const)
      : (['alloy', 'nova', 'shimmer'] as const);
    const assignedVoice = fallbackVoices[0];
    voiceAssignments.set(type, assignedVoice);
    return assignedVoice;
  }

  // Sort by score and prefer unused voices
  const usedVoices = Array.from(voiceAssignments.values());
  compatibleVoices.sort((a, b) => {
    // Prioritize unused voices
    const aUsed = usedVoices.includes(a.voice);
    const bUsed = usedVoices.includes(b.voice);
    
    if (aUsed !== bUsed) {
      return aUsed ? 1 : -1;
    }
    
    // Then sort by compatibility score
    return b.score - a.score;
  });

  const bestVoice = compatibleVoices[0].voice;
  voiceAssignments.set(type, bestVoice);
  
  console.log(`Assigned voice "${bestVoice}" to ${type} (${persona.name}) with score ${compatibleVoices[0].score}`);
  console.log(`Voice characteristics: ${JSON.stringify(VOICE_PROFILES[bestVoice].characteristics)}`);
  console.log(`Persona characteristics: tone=${persona.voiceCharacteristics.tone}, style=${persona.voiceCharacteristics.style}, age=${persona.ageRange}`);
  
  return bestVoice;
}

function getCacheKey(segment: PodcastSegment, model: string): string {
  // Include text length in cache key to differentiate chunks
  return `${segment.type}-${segment.text.length}-${model}-${hashString(segment.text)}`;
}

// Simple hash function for cache keys
function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36);
}

// Enhanced buffer validation
function validateAudioBuffer(buffer: ArrayBuffer, context: string): boolean {
  try {
    if (!buffer || buffer.byteLength === 0) {
      console.error(`❌ ${context}: Empty or null buffer`);
      return false;
    }
    
    if (isArrayBufferDetached(buffer)) {
      console.error(`❌ ${context}: Detached ArrayBuffer detected`);
      return false;
    }
    
    // Check if buffer contains valid audio data (basic MP3 header check)
    const view = new Uint8Array(buffer);
    const hasMP3Header = view.length >= 3 && 
                        view[0] === 0xFF && 
                        (view[1] & 0xE0) === 0xE0;
    
    if (!hasMP3Header) {
      console.warn(`⚠️ ${context}: Buffer may not contain valid MP3 data`);
    }
    
    console.log(`✅ ${context}: Buffer validated (${buffer.byteLength} bytes, MP3: ${hasMP3Header})`);
    return true;
  } catch (error) {
    console.error(`❌ ${context}: Buffer validation failed:`, error);
    return false;
  }
}

// Enhanced audio chunk generation with better error recovery
async function generateAudioChunk(
  text: string,
  voice: VoiceType,
  model: string,
  apiKey: string,
  attemptNumber: number = 1
): Promise<ArrayBuffer> {
  const openai = createOpenAIClient(apiKey);
  const context = `Chunk generation (attempt ${attemptNumber})`;
  
  try {
    // Additional text validation
    if (!text || text.trim().length === 0) {
      throw new Error('Text is empty or contains only whitespace');
    }
    
    if (text.length > 4096) {
      throw new Error(`Text too long: ${text.length} characters (max: 4096)`);
    }
    
    console.log(`🎵 ${context}: Generating audio for ${text.length} chars with voice "${voice}"`);
    
    const response = await openai.audio.speech.create({
      model,
      voice,
      input: text.trim(),
      response_format: 'mp3',
      speed: 1.0
    });

    const arrayBuffer = await response.arrayBuffer();
    
    // Enhanced buffer validation
    if (!validateAudioBuffer(arrayBuffer, context)) {
      throw new Error(`Invalid audio buffer generated for text: "${text.substring(0, 50)}..."`);
    }
    
    console.log(`✅ ${context}: Generated ${arrayBuffer.byteLength} bytes for "${text.substring(0, 30)}..."`);
    return arrayBuffer;
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`❌ ${context} failed:`, {
      textLength: text.length,
      textPreview: text.substring(0, 50),
      voice,
      model,
      attempt: attemptNumber,
      error: errorMessage
    });
    
    // Enhanced error context
    if (errorMessage.includes('rate limit') || errorMessage.includes('429')) {
      throw new Error(`Rate limit exceeded (attempt ${attemptNumber}): ${errorMessage}`);
    }
    
    if (errorMessage.includes('quota') || errorMessage.includes('insufficient')) {
      throw new Error(`API quota exceeded: ${errorMessage}`);
    }
    
    if (errorMessage.includes('invalid') && errorMessage.includes('key')) {
      throw new Error(`Invalid API key: ${errorMessage}`);
    }
    
    throw error;
  }
}

/**
 * Combine multiple audio buffers into a single buffer
 * Always creates fresh ArrayBuffers to prevent detachment issues
 */
export function combineAudioBuffers(buffers: ArrayBuffer[]): ArrayBuffer {
  if (buffers.length === 0) {
    return new ArrayBuffer(0);
  }
  
  if (buffers.length === 1) {
    // Always create a fresh copy to prevent detachment issues
    const originalBuffer = buffers[0];
    const freshBuffer = new ArrayBuffer(originalBuffer.byteLength);
    new Uint8Array(freshBuffer).set(new Uint8Array(originalBuffer));
    return freshBuffer;
  }

  const totalLength = buffers.reduce((acc, buffer) => acc + buffer.byteLength, 0);
  const combinedBuffer = new Uint8Array(totalLength);
  
  let offset = 0;
  for (const buffer of buffers) {
    combinedBuffer.set(new Uint8Array(buffer), offset);
    offset += buffer.byteLength;
  }

  return combinedBuffer.buffer;
}

export async function generateAudioForSegment(
  segment: PodcastSegment,
  apiKey: string,
  model: string = 'tts-1'
): Promise<ArrayBuffer> {
  const cacheKey = getCacheKey(segment, model);
  const context = `Segment: ${segment.type}`;
  
  // Enhanced cache validation
  if (audioCache.has(cacheKey)) {
    const cachedData = audioCache.get(cacheKey)!;
    try {
      // Create and validate fresh ArrayBuffer from cached data
      const freshBuffer = new ArrayBuffer(cachedData.length);
      new Uint8Array(freshBuffer).set(cachedData);
      
      if (validateAudioBuffer(freshBuffer, `${context} (cached)`)) {
        console.log(`📋 Using cached audio for ${segment.type} (${cachedData.length} bytes)`);
        return freshBuffer;
      } else {
        // Remove invalid cache entry
        audioCache.delete(cacheKey);
        console.warn(`🗑️ Removed invalid cache entry for ${segment.type}`);
      }
    } catch (error) {
      console.error(`❌ Cache retrieval failed for ${segment.type}:`, error);
      audioCache.delete(cacheKey);
    }
  }

  const voice: VoiceType = voiceAssignments.get(segment.type) || 'onyx';
  
  // Enhanced text preparation
  const optimizedText = optimizeTextForTTS(segment.text);
  const validation = validateTextChunk(optimizedText);
  
  if (validation.warnings.length > 0) {
    console.warn(`⚠️ Text validation warnings for ${segment.type}:`, validation.warnings);
  }

  // Split text into chunks if needed
  const textChunks = splitTextForTTS(optimizedText);
  console.log(`🎙️ Processing ${segment.type}: ${textChunks.length} chunk(s), ${optimizedText.length} chars`);
  
  try {
    if (textChunks.length === 1) {
      // Single chunk - direct generation with retry logic
      let lastError: Error | null = null;
      
      for (let attempt = 1; attempt <= TTS_RATE_LIMITING.MAX_RETRIES + 1; attempt++) {
        try {
          const audioBuffer = await generateAudioChunk(textChunks[0], voice, model, apiKey, attempt);
          
          // Cache as Uint8Array to prevent detachment issues
          audioCache.set(cacheKey, new Uint8Array(audioBuffer));
          return audioBuffer;
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          
          if (attempt <= TTS_RATE_LIMITING.MAX_RETRIES) {
            const isRateLimit = lastError.message.includes('rate limit') || lastError.message.includes('429');
            const delayMs = isRateLimit ? TTS_RATE_LIMITING.RATE_LIMIT_DELAY : TTS_RATE_LIMITING.ERROR_RETRY_DELAY;
            
            console.log(`⏳ ${context}: Waiting ${delayMs / 1000}s before retry ${attempt + 1}...`);
            await delay(delayMs);
          }
        }
      }
      
      throw lastError || new Error('All retry attempts failed');
      
    } else {
      // Multiple chunks - sequential processing with enhanced error recovery
      console.log(`📦 ${context}: Splitting into ${textChunks.length} chunks for sequential processing`);
      
      const audioChunks: ArrayBuffer[] = [];
      
      for (let i = 0; i < textChunks.length; i++) {
        const chunk = textChunks[i];
        console.log(`📝 Chunk ${i + 1}/${textChunks.length}: ${chunk.length} characters`);
        
        let chunkBuffer: ArrayBuffer | null = null;
        let lastError: Error | null = null;
        
        // Retry logic for each chunk
        for (let attempt = 1; attempt <= TTS_RATE_LIMITING.MAX_RETRIES + 1; attempt++) {
          try {
            chunkBuffer = await generateAudioChunk(chunk, voice, model, apiKey, attempt);
            console.log(`✅ Chunk ${i + 1} completed successfully`);
            break;
          } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
            
            if (attempt <= TTS_RATE_LIMITING.MAX_RETRIES) {
              const isRateLimit = lastError.message.includes('rate limit') || lastError.message.includes('429');
              const delayMs = isRateLimit ? TTS_RATE_LIMITING.RATE_LIMIT_DELAY : TTS_RATE_LIMITING.ERROR_RETRY_DELAY;
              
              console.log(`⏳ Chunk ${i + 1} retry ${attempt}: Waiting ${delayMs / 1000}s...`);
              await delay(delayMs);
            }
          }
        }
        
        if (!chunkBuffer) {
          console.error(`❌ Chunk ${i + 1} failed permanently:`, lastError);
          // Create a small silent buffer to maintain audio continuity
          chunkBuffer = new ArrayBuffer(1024);
        }
        
        audioChunks.push(chunkBuffer);
        
        // Inter-chunk delay to prevent rate limiting
        if (i < textChunks.length - 1) {
          console.log(`⏸️ Inter-chunk delay: ${TTS_RATE_LIMITING.CHUNK_PROCESSING_DELAY / 1000}s`);
          await delay(TTS_RATE_LIMITING.CHUNK_PROCESSING_DELAY);
        }
      }

      const combinedBuffer = combineAudioBuffers(audioChunks);
      
      // Validate combined buffer
      if (validateAudioBuffer(combinedBuffer, `${context} (combined)`)) {
        // Cache as Uint8Array to prevent detachment issues
        audioCache.set(cacheKey, new Uint8Array(combinedBuffer));
        return combinedBuffer;
      } else {
        throw new Error('Combined audio buffer validation failed');
      }
    }
  } catch (error) {
    console.error(`❌ ${context}: Audio generation failed:`, error);
    throw new Error(`Failed to generate audio for ${segment.type}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function initializeVoiceAssignments(script: PodcastScript): Promise<void> {
  voiceAssignments.clear();
  
  // Use detailed personas if available, otherwise fall back to gender map
  const personas = script.personas || script.personaGenders || {
    'host': true,
    'guest1': true,        
    'guest2': false,
  };

  const uniqueTypes = new Set(script.segments.map(s => s.type));
  uniqueTypes.forEach(type => {
    assignVoiceForPersona(type, personas);
  });
  
  // Log voice assignments for debugging
  console.log('Voice assignments initialized:');
  Array.from(voiceAssignments.entries()).forEach(([type, voice]) => {
    if (script.personas && script.personas[type as keyof PersonaCollection]) {
      const persona = script.personas[type as keyof PersonaCollection];
      console.log(`  ${type} (${persona.name}): ${voice}`);
    } else {
      console.log(`  ${type}: ${voice}`);
    }
  });
}

// Legacy function for backward compatibility - now uses AudioDownloadManager
export async function downloadFullPodcast(script: PodcastScript, apiKey: string, model: string = 'tts-1'): Promise<void> {
  console.warn('🚨 downloadFullPodcast is deprecated. Use AudioDownloadManager instead.');
  
  const downloadManager = new AudioDownloadManager(script, apiKey, model);
  await downloadManager.downloadAndSave();
}

export function clearAudioCache(): void {
  audioCache.clear();
  console.log('🧹 Audio cache cleared');
}

export function getCacheStats(): { totalEntries: number; totalSizeBytes: number } {
  let totalSizeBytes = 0;
  for (const entry of audioCache.values()) {
    totalSizeBytes += entry.length;
  }
  
  return {
    totalEntries: audioCache.size,
    totalSizeBytes
  };
}

/**
 * Debug function to test download functionality
 */
export function debugDownload(script: PodcastScript): void {
  console.log('=== Download Debug Info ===');
  console.log(`Script segments: ${script.segments?.length || 0}`);
  console.log(`Voice assignments: ${voiceAssignments.size}`);
  console.log(`Cache entries: ${audioCache.size}`);
  
  // Show detailed persona information if available
  if (script.personas) {
    console.log('Detailed personas:');
    Object.entries(script.personas).forEach(([type, persona]) => {
      console.log(`  ${type}: ${persona.name} (${persona.gender}, ${persona.ageRange})`);
      console.log(`    Voice chars: ${persona.voiceCharacteristics.tone}, ${persona.voiceCharacteristics.style}, ${persona.voiceCharacteristics.pace}`);
      console.log(`    Background: ${persona.background}`);
      console.log(`    Expertise: ${persona.expertise.join(', ')}`);
    });
  } else {
    console.log(`Persona genders:`, script.personaGenders);
  }
  
  if (script.segments) {
    script.segments.forEach((segment, index) => {
      console.log(`Segment ${index + 1}: ${segment.type} - ${segment.text.length} chars`);
    });
  }
  
  console.log('Cache stats:', getCacheStats());
  console.log('Voice assignments:', Array.from(voiceAssignments.entries()));
  
  // Show voice profile matches if detailed personas available
  if (script.personas) {
    console.log('Voice compatibility scores:');
    Object.entries(script.personas).forEach(([type, persona]) => {
      const assignedVoice = voiceAssignments.get(type);
      if (assignedVoice) {
        const score = calculateVoiceCompatibility(persona, VOICE_PROFILES[assignedVoice]);
        console.log(`  ${type} (${persona.name}) -> ${assignedVoice}: ${score}% compatibility`);
      }
    });
  }
}

/**
 * Test if browser supports downloads
 */
export function testDownloadSupport(): boolean {
  try {
    const testBlob = new Blob(['test'], { type: 'text/plain' });
    const url = URL.createObjectURL(testBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'test.txt';
    
    const supportsDownload = typeof a.download !== 'undefined';
    URL.revokeObjectURL(url);
    
    console.log(`Download support: ${supportsDownload}`);
    return supportsDownload;
  } catch (error) {
    console.error('Download support test failed:', error);
    return false;
  }
}

/**
 * Enhanced diagnostic information for troubleshooting
 */
export function diagnoseDownloadIssue(script: PodcastScript): {
  canDownload: boolean;
  issues: string[];
  recommendations: string[];
} {
  const issues: string[] = [];
  const recommendations: string[] = [];

  // Check script validity
  if (!script) {
    issues.push('No script provided');
    recommendations.push('Generate a podcast script first');
  } else if (!script.segments || script.segments.length === 0) {
    issues.push('Script has no segments');
    recommendations.push('Regenerate the podcast script');
  }

  // Check browser support
  if (typeof ArrayBuffer === 'undefined') {
    issues.push('Browser does not support ArrayBuffer');
    recommendations.push('Use a modern browser');
  }

  if (typeof Blob === 'undefined') {
    issues.push('Browser does not support Blob');
    recommendations.push('Use a modern browser');
  }

  if (typeof URL.createObjectURL === 'undefined') {
    issues.push('Browser does not support URL.createObjectURL');
    recommendations.push('Use a modern browser that supports file downloads');
  }

  // Check download support
  const testElement = document.createElement('a');
  if (typeof testElement.download === 'undefined') {
    issues.push('Browser does not support download attribute');
    recommendations.push('Use a modern browser or right-click and "Save As"');
  }

  // Check cache state
  const cacheStats = getCacheStats();
  if (cacheStats.totalEntries > 0) {
    console.log(`Cache contains ${cacheStats.totalEntries} entries (${Math.round(cacheStats.totalSizeBytes / 1024)} KB)`);
  }

  // Check voice assignments
  if (voiceAssignments.size === 0) {
    issues.push('Voice assignments not initialized');
    recommendations.push('Wait for voice initialization to complete');
  }

  const canDownload = issues.length === 0;

  return {
    canDownload,
    issues,
    recommendations
  };
}

// Enhanced download function with better browser compatibility
export function createDownloadLink(blob: Blob, filename: string): void {
  try {
    // Enhanced browser compatibility check
    const testLink = document.createElement('a');
    const hasDownloadSupport = 'download' in testLink;
    
    if (!hasDownloadSupport) {
      // Fallback for older browsers
      console.warn('⚠️ Browser does not support download attribute, using fallback method');
      const reader = new FileReader();
      reader.onload = function() {
        const dataUrl = reader.result as string;
        window.open(dataUrl, '_blank');
      };
      reader.readAsDataURL(blob);
      return;
    }
    
    // Standard download method
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    
    // Enhanced error handling for download
    a.addEventListener('error', (e) => {
      console.error('❌ Download error:', e);
      URL.revokeObjectURL(url);
    });
    
    document.body.appendChild(a);
    a.click();
    
    // Enhanced cleanup with error handling
    setTimeout(() => {
      try {
        if (document.body.contains(a)) {
          document.body.removeChild(a);
        }
        URL.revokeObjectURL(url);
        console.log('🧹 Download cleanup completed successfully');
      } catch (error) {
        console.error('⚠️ Download cleanup error:', error);
      }
    }, 1000); // Longer delay for better compatibility
    
    console.log(`📁 Download initiated: ${filename} (${Math.round(blob.size / 1024)} KB)`);
    
  } catch (error) {
    console.error('❌ Download creation failed:', error);
    throw new Error(`Download failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}