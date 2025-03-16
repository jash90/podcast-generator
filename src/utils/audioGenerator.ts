import OpenAI from 'openai';
import { createOpenAIClient } from '../config/api';
import type { PodcastScript, PodcastSegment } from '../types';

const VOICES = {
  male: ['echo', 'onyx', 'fable'],
  female: ['alloy', 'nova', 'shimmer']
} as const;

const voiceAssignments = new Map<string, string>();
const audioCache = new Map<string, Uint8Array>();

function assignVoiceForPersona(type: string, personas: Record<string, boolean>): string {
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

function getCacheKey(segment: PodcastSegment): string {
  return `${segment.type}-${segment.text}`;
}

export async function generateAudioForSegment(
  segment: PodcastSegment,
  apiKey: string
): Promise<ArrayBuffer> {
  const cacheKey = getCacheKey(segment);
  
  if (audioCache.has(cacheKey)) {
    const cachedData = audioCache.get(cacheKey)!;
    return cachedData.buffer.slice(0);
  }

  const openai = createOpenAIClient(apiKey);
  const voice = voiceAssignments.get(segment.type) || 'onyx';
  
  const response = await openai.audio.speech.create({
    model: "tts-1",
    voice,
    input: segment.text,
  });

  const arrayBuffer = await response.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);
  audioCache.set(cacheKey, uint8Array);
  
  return uint8Array.buffer.slice(0);
}

export async function initializeVoiceAssignments(script: PodcastScript): Promise<void> {
  voiceAssignments.clear();
  
  const defaultPersonas: Record<string, boolean> = {
    'host': true,
    'guest1': true,
    'guest2': false,
  };

  const uniqueTypes = new Set(script.segments.map(s => s.type));
  uniqueTypes.forEach(type => {
    assignVoiceForPersona(type, defaultPersonas);
  });
}

export function clearAudioCache(): void {
  audioCache.clear();
}

export async function downloadFullPodcast(script: PodcastScript, apiKey: string): Promise<void> {
  if (voiceAssignments.size === 0) {
    await initializeVoiceAssignments(script);
  }

  const audioBuffers: ArrayBuffer[] = [];
  
  for (const segment of script.segments) {
    const buffer = await generateAudioForSegment(segment, apiKey);
    audioBuffers.push(buffer);
  }

  const totalLength = audioBuffers.reduce((acc, buffer) => acc + buffer.byteLength, 0);
  const combinedBuffer = new Uint8Array(totalLength);
  
  let offset = 0;
  for (const buffer of audioBuffers) {
    combinedBuffer.set(new Uint8Array(buffer), offset);
    offset += buffer.byteLength;
  }

  const blob = new Blob([combinedBuffer], { type: 'audio/mp3' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'podcast.mp3';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}