import OpenAI from 'openai';
import { createOpenAIClient } from '../config/api';
import type { PodcastScript, PodcastSegment } from '../types';
import { splitTextForTTS, optimizeTextForTTS, validateTextChunk } from './textSplitter';

const VOICES = {
  male: ['echo', 'onyx', 'fable'],
  female: ['alloy', 'nova', 'shimmer']
} as const;

type VoiceType = typeof VOICES.male[number] | typeof VOICES.female[number];

const voiceAssignments = new Map<string, VoiceType>();
const audioCache = new Map<string, ArrayBuffer>();

function assignVoiceForPersona(type: string, personas: Record<string, boolean>): VoiceType {
  if (voiceAssignments.has(type)) {
    return voiceAssignments.get(type)!;
  }

  const isMale = personas[type];
  const availableVoices = isMale ? VOICES.male : VOICES.female;
  const usedVoices = Array.from(voiceAssignments.values());
  const unusedVoice = availableVoices.find(voice => !usedVoices.includes(voice));
  const assignedVoice = unusedVoice || availableVoices[usedVoices.length % availableVoices.length];
  
  voiceAssignments.set(type, assignedVoice);
  return assignedVoice;
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

/**
 * Generate audio for a single text chunk
 */
async function generateAudioChunk(
  text: string,
  voice: VoiceType,
  model: string,
  apiKey: string
): Promise<ArrayBuffer> {
  const openai = createOpenAIClient(apiKey);
  
  const response = await openai.audio.speech.create({
    model,
    voice,
    input: text,
  });

  return await response.arrayBuffer();
}

/**
 * Combine multiple audio buffers into a single buffer
 */
function combineAudioBuffers(buffers: ArrayBuffer[]): ArrayBuffer {
  if (buffers.length === 0) {
    return new ArrayBuffer(0);
  }
  
  if (buffers.length === 1) {
    return buffers[0];
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
  
  // Check cache first
  if (audioCache.has(cacheKey)) {
    return audioCache.get(cacheKey)!;
  }

  const voice: VoiceType = voiceAssignments.get(segment.type) || 'onyx';
  
  // Optimize and validate the text
  const optimizedText = optimizeTextForTTS(segment.text);
  const validation = validateTextChunk(optimizedText);
  
  if (validation.warnings.length > 0) {
    console.warn(`Text validation warnings for segment:`, validation.warnings);
  }

  // Split text into chunks if needed
  const textChunks = splitTextForTTS(optimizedText);
  
  console.log(`Generating audio for segment with ${textChunks.length} chunk(s)`);
  
  try {
    if (textChunks.length === 1) {
      // Single chunk - direct generation
      const audioBuffer = await generateAudioChunk(textChunks[0], voice, model, apiKey);
      audioCache.set(cacheKey, audioBuffer);
      return audioBuffer;
    } else {
      // Multiple chunks - generate in parallel and combine
      console.log(`Splitting long text (${optimizedText.length} chars) into ${textChunks.length} chunks`);
      
      const chunkPromises = textChunks.map((chunk, index) => {
        console.log(`Chunk ${index + 1}: ${chunk.length} characters`);
        return generateAudioChunk(chunk, voice, model, apiKey);
      });

      const audioChunks = await Promise.all(chunkPromises);
      const combinedBuffer = combineAudioBuffers(audioChunks);
      
      audioCache.set(cacheKey, combinedBuffer);
      return combinedBuffer;
    }
  } catch (error) {
    console.error('Audio generation error:', error);
    throw new Error(`Failed to generate audio: ${error}`);
  }
}

export async function initializeVoiceAssignments(script: PodcastScript): Promise<void> {
  voiceAssignments.clear();
  
  // Use the gender information from the script, with fallback to defaults
  const personaGenders = script.personaGenders || {
    'host': true,
    'guest1': true,        
    'guest2': false,
  };

  const uniqueTypes = new Set(script.segments.map(s => s.type));
  uniqueTypes.forEach(type => {
    assignVoiceForPersona(type, personaGenders);
  });
}

export async function downloadFullPodcast(script: PodcastScript, apiKey: string, model: string = 'tts-1'): Promise<void> {
  try {
    console.log('Starting full podcast download...');
    
    // Initialize voice assignments if not already done
    if (voiceAssignments.size === 0) {
      await initializeVoiceAssignments(script);
      console.log('Voice assignments initialized');
    }

    if (!script.segments.length) {
      throw new Error('No segments available for download');
    }

    console.log(`Generating audio for ${script.segments.length} segments`);

    // Generate all audio segments in parallel for better performance
    const generatePromises = script.segments.map((segment, index) => {
      console.log(`Starting generation for segment ${index + 1}`);
      return generateAudioForSegment(segment, apiKey, model);
    });

    const audioBuffers = await Promise.all(generatePromises);
    console.log(`Generated ${audioBuffers.length} audio segments`);

    // Combine audio buffers
    const combinedBuffer = combineAudioBuffers(audioBuffers);
    console.log(`Combined buffer size: ${combinedBuffer.byteLength} bytes`);

    // Create blob with proper MIME type
    const blob = new Blob([combinedBuffer], { type: 'audio/mpeg' });
    console.log(`Created blob: ${blob.size} bytes`);

    // Create download with timestamp
    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    const filename = `podcast-${timestamp}.mp3`;
    
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    
    document.body.appendChild(a);
    a.click();
    
    // Cleanup after a short delay
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      console.log('Download cleanup completed');
    }, 100);
    
    console.log(`Download initiated: ${filename}`);
    
  } catch (error) {
    console.error('Download failed:', error);
    throw new Error(`Download failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export function clearAudioCache(): void {
  audioCache.clear();
}

/**
 * Get cache statistics for debugging
 */
export function getCacheStats(): {
  totalEntries: number;
  totalSizeBytes: number;
  averageSizeBytes: number;
} {
  const entries = Array.from(audioCache.values());
  const totalSizeBytes = entries.reduce((acc, buffer) => acc + buffer.byteLength, 0);
  
  return {
    totalEntries: audioCache.size,
    totalSizeBytes,
    averageSizeBytes: entries.length > 0 ? totalSizeBytes / entries.length : 0
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
  console.log(`Persona genders:`, script.personaGenders);
  
  if (script.segments) {
    script.segments.forEach((segment, index) => {
      console.log(`Segment ${index + 1}: ${segment.type} - ${segment.text.length} chars`);
    });
  }
  
  console.log('Cache stats:', getCacheStats());
  console.log('Voice assignments:', Array.from(voiceAssignments.entries()));
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