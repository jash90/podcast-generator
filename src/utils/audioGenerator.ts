import OpenAI from 'openai';
import { createOpenAIClient } from '../config/api';
import type { PodcastScript, PodcastSegment, PersonaCollection, PersonaDetail } from '../types';
import { splitTextForTTS, optimizeTextForTTS, validateTextChunk } from './textSplitter';

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
      tone: ['professional', 'authoritative', 'calm'] as Array<'warm' | 'authoritative' | 'friendly' | 'professional' | 'energetic' | 'calm'>,
      style: ['formal', 'academic', 'journalistic'] as Array<'conversational' | 'formal' | 'casual' | 'academic' | 'journalistic'>,
      ageRange: ['30-40', '35-45'],
      personality: ['intelligent', 'composed', 'trustworthy']
    }
  },
  nova: {
    gender: 'female' as const,
    characteristics: {
      tone: ['warm', 'friendly', 'energetic'] as Array<'warm' | 'authoritative' | 'friendly' | 'professional' | 'energetic' | 'calm'>,
      style: ['conversational', 'casual'] as Array<'conversational' | 'formal' | 'casual' | 'academic' | 'journalistic'>,
      ageRange: ['25-35', '30-40'],
      personality: ['vibrant', 'passionate', 'expressive']
    }
  },
  shimmer: {
    gender: 'female' as const,
    characteristics: {
      tone: ['calm', 'professional', 'warm'] as Array<'warm' | 'authoritative' | 'friendly' | 'professional' | 'energetic' | 'calm'>,
      style: ['conversational', 'formal'] as Array<'conversational' | 'formal' | 'casual' | 'academic' | 'journalistic'>,
      ageRange: ['35-45', '40-50'],
      personality: ['thoughtful', 'mature', 'balanced']
    }
  }
} as const;

type VoiceType = keyof typeof VOICE_PROFILES;

const voiceAssignments = new Map<string, VoiceType>();
// Audio cache using Uint8Array to avoid detached ArrayBuffer issues
const audioCache = new Map<string, Uint8Array>();

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
 * Generate audio for a single text chunk with enhanced error handling
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
      input: text,
    });

    const arrayBuffer = await response.arrayBuffer();
    
    // Verify the buffer is valid
    if (isArrayBufferDetached(arrayBuffer)) {
      throw new Error('Generated ArrayBuffer is detached');
    }
    
    if (arrayBuffer.byteLength === 0) {
      throw new Error('Generated audio buffer is empty');
    }

    console.log(`Generated audio chunk: ${arrayBuffer.byteLength} bytes for ${text.length} characters`);
    return arrayBuffer;
    
  } catch (error) {
    console.error('Audio chunk generation failed:', {
      textLength: text.length,
      voice,
      model,
      error: error instanceof Error ? error.message : String(error)
    });
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
  
  // Check cache first and create fresh ArrayBuffer from cached data
  if (audioCache.has(cacheKey)) {
    const cachedData = audioCache.get(cacheKey)!;
    // Create a fresh ArrayBuffer from the cached Uint8Array
    const freshBuffer = new ArrayBuffer(cachedData.length);
    new Uint8Array(freshBuffer).set(cachedData);
    return freshBuffer;
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
      // Cache as Uint8Array to prevent detachment issues
      audioCache.set(cacheKey, new Uint8Array(audioBuffer));
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
      
      // Cache as Uint8Array to prevent detachment issues
      audioCache.set(cacheKey, new Uint8Array(combinedBuffer));
      return combinedBuffer;
    }
  } catch (error) {
    console.error('Audio generation error:', error);
    throw new Error(`Failed to generate audio: ${error}`);
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
  const totalSizeBytes = entries.reduce((acc, buffer) => acc + buffer.length, 0);
  
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