import OpenAI from 'openai';
import { createOpenAIClient } from '../config/api';
import type { PodcastScript, PodcastSegment, PersonaCollection, PersonaDetail } from '../types';
import { optimizeTextForTTS } from './textSplitter';

// Simple TTS Configuration (back to basics)
const TTS_CONFIG = {
  INTER_SEGMENT_DELAY: 1000,    // 1 second between segments to prevent rate limiting
  MAX_RETRIES: 1,               // Single retry only
  RETRY_DELAY: 2000,            // 2 seconds on retry
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

  private reportProgress(segmentIndex: number, operation: string): void {
    if (!this.onProgress) return;

    const overallProgress = ((segmentIndex + 1) / this.script.segments.length) * 100;
    
    this.onProgress({
      segmentIndex,
      totalSegments: this.script.segments.length,
      segmentProgress: 100,
      overallProgress,
      currentOperation: operation,
      segmentInfo: {
        type: this.script.segments[segmentIndex]?.type || 'unknown',
        textLength: this.script.segments[segmentIndex]?.text.length || 0,
        chunks: 1
      }
    });
  }

  // Original sequential approach - simple and reliable
  async downloadAllSegments(): Promise<ArrayBuffer[]> {
    console.log('🎵 Starting sequential audio download...');
    
    if (voiceAssignments.size === 0) {
      await initializeVoiceAssignments(this.script);
      console.log('Voice assignments initialized');
    }

    if (!this.script.segments.length) {
      throw new Error('No segments available for download');
    }

    const audioBuffers: ArrayBuffer[] = [];
    
    // Original sequential approach with minimal delay
    for (let i = 0; i < this.script.segments.length; i++) {
      const segment = this.script.segments[i];
      console.log(`Processing segment ${i + 1}/${this.script.segments.length}: ${segment.type}`);

      this.reportProgress(i, `Generating ${segment.type}`);

      try {
        const buffer = await generateAudioForSegment(segment, this.apiKey, this.model);
        audioBuffers.push(buffer);
        console.log(`✅ Segment ${i + 1} completed`);

        // Small delay to prevent rate limiting (original approach)
        if (i < this.script.segments.length - 1) {
          await new Promise(resolve => setTimeout(resolve, TTS_CONFIG.INTER_SEGMENT_DELAY));
        }

      } catch (error: unknown) {
        console.error(`❌ Segment ${i + 1} failed:`, error);
        
        // Single retry attempt (simple approach)
        try {
          console.log(`🔄 Retrying segment ${i + 1}...`);
          await new Promise(resolve => setTimeout(resolve, TTS_CONFIG.RETRY_DELAY));
          
          const buffer = await generateAudioForSegment(segment, this.apiKey, this.model);
          audioBuffers.push(buffer);
          console.log(`✅ Segment ${i + 1} completed on retry`);
          
        } catch (retryError) {
          console.error(`❌ Segment ${i + 1} failed permanently:`, retryError);
          // Create small silence buffer to maintain sync
          const silentBuffer = new ArrayBuffer(1024);
          audioBuffers.push(silentBuffer);
        }
      }
    }

    console.log(`Generated ${audioBuffers.length} audio segments`);
    return audioBuffers;
  }

  async downloadAndSave(): Promise<void> {
    console.log('📁 Starting podcast download...');
    
    const audioBuffers = await this.downloadAllSegments();

    // Original simple buffer combining approach
    const totalLength = audioBuffers.reduce((acc, buffer) => acc + buffer.byteLength, 0);
    const combinedBuffer = new Uint8Array(totalLength);
    
    let offset = 0;
    for (const buffer of audioBuffers) {
      combinedBuffer.set(new Uint8Array(buffer), offset);
      offset += buffer.byteLength;
    }

    console.log(`Combined buffer size: ${combinedBuffer.byteLength} bytes`);

    // Create download with timestamp
    const blob = new Blob([combinedBuffer], { type: 'audio/mpeg' });
    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    const filename = `podcast-${timestamp}.mp3`;
    
    // Simple download - back to original approach
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    
    document.body.appendChild(a);
    a.click();
    
    // Simple cleanup
    setTimeout(() => {
      if (document.body.contains(a)) {
        document.body.removeChild(a);
      }
      URL.revokeObjectURL(url);
      console.log('Download cleanup completed');
    }, 100);

    console.log(`✅ Download completed: ${filename} (${Math.round(blob.size / 1024)} KB)`);
  }

     // Simplified preload for AudioPlayer
   async preloadSegment(segment: PodcastSegment): Promise<AudioSegmentResult> {
    try {
      const buffer = await generateAudioForSegment(segment, this.apiKey, this.model);
      return {
        success: true,
        buffer,
        retries: 0
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: errorMessage,
        retries: 1
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



/**
 * Generate audio for a single text chunk - back to simple approach
 */
async function generateAudioChunk(
  text: string,
  voice: VoiceType,
  model: string,
  apiKey: string
): Promise<ArrayBuffer> {
  const openai = createOpenAIClient(apiKey);
  
  try {
    const response = await openai.audio.speech.create({
      model,
      voice,
      input: text.trim(),
      response_format: 'mp3',
    });

    const arrayBuffer = await response.arrayBuffer();
    
    if (arrayBuffer.byteLength === 0) {
      throw new Error('Generated audio buffer is empty');
    }

    return arrayBuffer;
    
  } catch (error) {
    console.error('Audio generation failed:', error);
    throw error;
  }
}

// Back to original simple sequential approach with minimal improvements
export async function generateAudioForSegment(
  segment: PodcastSegment,
  apiKey: string,
  model: string = 'tts-1'
): Promise<ArrayBuffer> {
  const cacheKey = getCacheKey(segment, model);
  
  // Simple cache check with validation
  if (audioCache.has(cacheKey)) {
    const cachedData = audioCache.get(cacheKey)!;
    const freshBuffer = new ArrayBuffer(cachedData.length);
    new Uint8Array(freshBuffer).set(cachedData);
    console.log(`Using cached audio for ${segment.type}`);
    return freshBuffer;
  }

  const voice: VoiceType = voiceAssignments.get(segment.type) || 'onyx';
  const optimizedText = optimizeTextForTTS(segment.text);
  
  try {
    // Simple single chunk approach - no complex chunking
    const audioBuffer = await generateAudioChunk(optimizedText, voice, model, apiKey);
    
    // Cache as Uint8Array
    audioCache.set(cacheKey, new Uint8Array(audioBuffer));
    return audioBuffer;
    
  } catch (error) {
    console.error(`Failed to generate audio for ${segment.type}:`, error);
    throw error;
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
  console.log('📁 Starting simple podcast download...');
  
  if (voiceAssignments.size === 0) {
    await initializeVoiceAssignments(script);
  }

  if (!script.segments.length) {
    throw new Error('No segments available for download');
  }

  const audioBuffers: ArrayBuffer[] = [];
  
  // Original sequential approach from first commit
  for (let i = 0; i < script.segments.length; i++) {
    const segment = script.segments[i];
    console.log(`Generating segment ${i + 1}/${script.segments.length}: ${segment.type}`);
    
    try {
      const buffer = await generateAudioForSegment(segment, apiKey, model);
      audioBuffers.push(buffer);
      
      // Small delay between segments
      if (i < script.segments.length - 1) {
        await delay(TTS_CONFIG.INTER_SEGMENT_DELAY);
      }
      
    } catch (error) {
      console.error(`Segment ${i + 1} failed:`, error);
      throw error; // Fail fast approach
    }
  }

  // Original buffer combination
  const totalLength = audioBuffers.reduce((acc, buffer) => acc + buffer.byteLength, 0);
  const combinedBuffer = new Uint8Array(totalLength);
  
  let offset = 0;
  for (const buffer of audioBuffers) {
    combinedBuffer.set(new Uint8Array(buffer), offset);
    offset += buffer.byteLength;
  }

  // Original download approach
  const blob = new Blob([combinedBuffer], { type: 'audio/mpeg' });
  const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
  const filename = `podcast-${timestamp}.mp3`;
  
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  
  document.body.appendChild(a);
  a.click();
  
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
  
  console.log(`Download completed: ${filename}`);
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

