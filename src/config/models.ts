// AI Model Configuration
// Models are now fetched dynamically from OpenAI API with fallback to hardcoded models
//
// Model Flags:
// - usesCompletionTokens: Use 'max_completion_tokens' instead of 'max_tokens' (for o1/o3 models)
// - noSystemRole: Model doesn't support 'system' role messages (for o1/o3 models)
// - noTemperature: Model doesn't support temperature customization, uses default 1 (for o1/o3 models)

import { createOpenAIClient } from './api';

export interface ModelConfig {
  id: string;
  name: string;
  provider: 'openai';
  category: 'chat' | 'tts';
  description: string;
  maxTokens?: number;
  usesCompletionTokens?: boolean; // For o1/o3 models that use max_completion_tokens instead of max_tokens
  noSystemRole?: boolean; // For o1/o3 models that don't support system messages
  noTemperature?: boolean; // For o1/o3 models that don't support temperature customization
}

// Allowed chat models for Persona Generation, Script Generation, and Language Detection
const ALLOWED_CHAT_MODELS = [
  'gpt-3.5-turbo',   // GPT 3.5
  'gpt-4',           // GPT 4
  'gpt-4.1-nano',    // GPT 4.1 nano
  'gpt-4.1-mini',    // GPT 4.1 mini
  'gpt-4o-mini',     // GPT 4.1 mini (mapped to GPT-4o Mini)
  'gpt-4.1',         // GPT 4.1
  'gpt-4o',          // GPT 4o
  'o1',              // o1
  'o1-mini',         // o1 mini
  'o3-mini',         // o3 mini
  'o3'               // o3
];

// Check if a chat model is in the allowed list
function isAllowedChatModel(modelId: string): boolean {
  return ALLOWED_CHAT_MODELS.includes(modelId);
}

// Model configuration rules based on model ID patterns
const MODEL_RULES = {
  // o1/o3 reasoning models have special limitations
  isReasoningModel: (id: string) => id.startsWith('o1') || id.startsWith('o3'),
  // TTS models
  isTTSModel: (id: string) => id.startsWith('tts-') || id === 'gpt-4o-mini-tts',
  // Chat models (now filtered to allowed models only)
  isChatModel: (id: string) => !id.startsWith('tts-') && !id.startsWith('whisper-') && !id.startsWith('dall-e') && !id.startsWith('text-embedding') && id !== 'gpt-4o-mini-tts' && isAllowedChatModel(id),
};

// Apply model configuration rules
function applyModelRules(model: { id: string }): ModelConfig | null {
  const id = model.id;
  
  if (MODEL_RULES.isChatModel(id)) {
    const isReasoning = MODEL_RULES.isReasoningModel(id);
    
    return {
      id,
      name: formatModelName(id),
      provider: 'openai',
      category: 'chat',
      description: generateModelDescription(id),
      maxTokens: getModelMaxTokens(id),
      usesCompletionTokens: isReasoning,
      noSystemRole: isReasoning,
      noTemperature: isReasoning,
    };
  }
  
  if (MODEL_RULES.isTTSModel(id)) {
    return {
      id,
      name: formatModelName(id),
      provider: 'openai',
      category: 'tts',
      description: generateTTSModelDescription(id),
    };
  }
  
  return null;
}

function formatModelName(id: string): string {
  // Convert model IDs to friendly names
  const nameMap: Record<string, string> = {
    'o3': 'o3',
    'o3-preview': 'o3 Preview', 
    'o3-mini': 'o3 Mini',
    'o1': 'o1',
    'o1-preview': 'o1 Preview',
    'o1-mini': 'o1 Mini',
    'gpt-4': 'GPT-4',
    'gpt-4.1': 'GPT-4.1',
    'gpt-4.1-mini': 'GPT-4.1 Mini',
    'gpt-4.1-nano': 'GPT-4.1 Nano',
    'gpt-4-turbo': 'GPT-4 Turbo',
    'gpt-4o': 'GPT-4o',
    'gpt-4o-mini': 'GPT-4o Mini',
    'gpt-3.5-turbo': 'GPT-3.5 Turbo',
    'tts-1': 'TTS-1',
    'tts-1-hd': 'TTS-1 HD',
    'gpt-4o-mini-tts': 'GPT-4o Mini TTS',
  };
  
  return nameMap[id] || id.split('-').map(part => 
    part.charAt(0).toUpperCase() + part.slice(1)
  ).join(' ');
}

function generateModelDescription(id: string): string {
  if (id.startsWith('o3')) {
    return 'Latest reasoning model with exceptional problem-solving capabilities';
  }
  
  if (id.startsWith('o1')) {
    return 'Advanced reasoning model for complex problems';
  }
  
  if (id === 'gpt-4.1') {
    return 'Enhanced GPT-4 with improved capabilities and performance';
  }
  if (id === 'gpt-4.1-mini') {
    return 'Faster and more affordable GPT-4.1 optimized for speed';
  }
  
  if (id === 'gpt-4.1-nano') {
    return 'Ultra-efficient nano version of GPT-4.1 optimized for speed';
  }
  
  if (id.startsWith('gpt-4')) {
    return 'Most capable model, best for complex reasoning';
  }
  
  if (id.startsWith('gpt-3.5')) {
    return 'Fast and cost-effective for most tasks';
  }
  
  return 'OpenAI language model';
}

function generateTTSModelDescription(id: string): string {
  if (id === 'gpt-4o-mini-tts') {
    return 'Advanced text-to-speech model with improved voice quality';
  }
  if (id.includes('-hd')) {
    return 'Higher quality text-to-speech model';
  }
  return 'Standard text-to-speech model';
}

function getModelMaxTokens(id: string): number {
  // Token limits based on model type
  if (id.startsWith('o3') || id.startsWith('o1')) {
    return id.includes('preview') ? 128000 : 200000;
  }
  
  if (id.startsWith('gpt-4')) {
    if (id === 'gpt-4.1-mini') return 64000; // Mini version has smaller context
    if (id === 'gpt-4.1-nano') return 64000; // Nano version has smaller context
    if (id.includes('turbo') || id.includes('o') || id === 'gpt-4.1') return 128000;
    return 8192;
  }
  
  if (id.startsWith('gpt-3.5')) {
    return 16385;
  }
  
  return 4096; // Default fallback
}

// Fallback models in case API fetch fails
const FALLBACK_CHAT_MODELS: ModelConfig[] = [
  {
    id: 'o3',
    name: 'o3',
    provider: 'openai',
    category: 'chat',
    description: 'Latest reasoning model with exceptional problem-solving capabilities',
    maxTokens: 200000,
    usesCompletionTokens: true,
    noSystemRole: true,
    noTemperature: true
  },
  {
    id: 'o3-mini',
    name: 'o3 Mini',
    provider: 'openai',
    category: 'chat',
    description: 'Latest reasoning model, optimized for efficiency',
    maxTokens: 200000,
    usesCompletionTokens: true,
    noSystemRole: true,
    noTemperature: true
  },
  {
    id: 'o3-preview',
    name: 'o3 Preview',
    provider: 'openai',
    category: 'chat',
    description: 'Preview version of o3 reasoning model',
    maxTokens: 200000,
    usesCompletionTokens: true,
    noSystemRole: true,
    noTemperature: true
  },
  {
    id: 'o1',
    name: 'o1',
    provider: 'openai',
    category: 'chat',
    description: 'Advanced reasoning model for complex problems',
    maxTokens: 200000,
    usesCompletionTokens: true,
    noSystemRole: true,
    noTemperature: true
  },
  {
    id: 'o1-preview',
    name: 'o1 Preview',
    provider: 'openai',
    category: 'chat',
    description: 'Preview version of o1 reasoning model',
    maxTokens: 128000,
    usesCompletionTokens: true,
    noSystemRole: true,
    noTemperature: true
  },
  {
    id: 'o1-mini',
    name: 'o1 Mini',
    provider: 'openai',
    category: 'chat',
    description: 'Faster and more affordable o1 reasoning model',
    maxTokens: 128000,
    usesCompletionTokens: true,
    noSystemRole: true,
    noTemperature: true
  },
  {
    id: 'gpt-4.1',
    name: 'GPT-4.1',
    provider: 'openai',
    category: 'chat',
    description: 'Enhanced GPT-4 with improved capabilities and performance',
    maxTokens: 128000
  },
  {
    id: 'gpt-4.1-mini',
    name: 'GPT-4.1 Mini',
    provider: 'openai',
    category: 'chat',
    description: 'Faster and more affordable GPT-4.1 optimized for speed',
    maxTokens: 64000
  },
  {
    id: 'gpt-4.1-nano',
    name: 'GPT-4.1 Nano',
    provider: 'openai',
    category: 'chat',
    description: 'Ultra-efficient nano version of GPT-4.1 optimized for speed',
    maxTokens: 64000
  },
  {
    id: 'gpt-4',
    name: 'GPT-4',
    provider: 'openai',
    category: 'chat',
    description: 'Most capable model, best for complex reasoning',
    maxTokens: 8192
  },
  {
    id: 'gpt-4o',
    name: 'GPT-4o',
    provider: 'openai',
    category: 'chat',
    description: 'GPT-4 optimized for speed and efficiency',
    maxTokens: 128000
  },
  {
    id: 'gpt-4o-mini',
    name: 'GPT-4o Mini',
    provider: 'openai',
    category: 'chat',
    description: 'Faster and more affordable version of GPT-4o',
    maxTokens: 128000
  },
  {
    id: 'gpt-3.5-turbo',
    name: 'GPT-3.5 Turbo',
    provider: 'openai',
    category: 'chat',
    description: 'Fast and cost-effective for most tasks',
    maxTokens: 16385
  }
];

const FALLBACK_TTS_MODELS: ModelConfig[] = [
  {
    id: 'tts-1',
    name: 'TTS-1',
    provider: 'openai',
    category: 'tts',
    description: 'Standard text-to-speech model'
  },
  {
    id: 'tts-1-hd',
    name: 'TTS-1 HD',
    provider: 'openai',
    category: 'tts',
    description: 'Higher quality text-to-speech model'
  },
  {
    id: 'gpt-4o-mini-tts',
    name: 'GPT-4o Mini TTS',
    provider: 'openai',
    category: 'tts',
    description: 'Advanced text-to-speech model with improved voice quality'
  }
];

// Cache for fetched models
let cachedModels: { chat: ModelConfig[], tts: ModelConfig[] } | null = null;
let lastFetchTime = 0;
const CACHE_DURATION = 30 * 60 * 1000; // 30 minutes

export async function fetchModelsFromAPI(apiKey: string): Promise<{ chat: ModelConfig[], tts: ModelConfig[] }> {
  // Return cached models if still valid
  const now = Date.now();
  if (cachedModels && (now - lastFetchTime) < CACHE_DURATION) {
    return cachedModels;
  }

  try {
    const openai = createOpenAIClient(apiKey);
    const response = await openai.models.list();

    console.log(response.data);
    
    const chatModels: ModelConfig[] = [];
    const ttsModels: ModelConfig[] = [];
    
    for (const model of response.data) {
      const configuredModel = applyModelRules(model);
      if (configuredModel) {
        if (configuredModel.category === 'chat') {
          chatModels.push(configuredModel);
        } else if (configuredModel.category === 'tts') {
          ttsModels.push(configuredModel);
        }
      }
    }
    
    // Sort models by preference (o3 > o1 > gpt-4 > gpt-3.5)
    chatModels.sort((a, b) => {
      const priority = (id: string) => {
        if (id.startsWith('o3')) return 1000;
        if (id.startsWith('o1')) return 900;
        if (id.startsWith('gpt-4')) return 800;
        if (id.startsWith('gpt-3.5')) return 700;
        return 500;
      };
      return priority(b.id) - priority(a.id);
    });
    
    cachedModels = { chat: chatModels, tts: ttsModels };
    lastFetchTime = now;
    
    return cachedModels;
  } catch (error) {
    console.warn('Failed to fetch models from OpenAI API, using fallback models:', error);
    return {
      chat: FALLBACK_CHAT_MODELS,
      tts: FALLBACK_TTS_MODELS
    };
  }
}

// Legacy exports for backward compatibility - now return fetched models or fallbacks
export let CHAT_MODELS: ModelConfig[] = FALLBACK_CHAT_MODELS;
export let TTS_MODELS: ModelConfig[] = FALLBACK_TTS_MODELS;

// Update models from API
export function updateModels(fetchedModels: { chat: ModelConfig[], tts: ModelConfig[] }) {
  CHAT_MODELS = fetchedModels.chat;
  TTS_MODELS = fetchedModels.tts;
}

export interface ProjectModels {
  personaGeneration: string;
  scriptGeneration: string;
  languageDetection: string;
  textToSpeech: string;
}

export const DEFAULT_MODELS: ProjectModels = {
  personaGeneration: 'gpt-4.1',
  scriptGeneration: 'gpt-4.1',
  languageDetection: 'gpt-4.1',
  textToSpeech: 'tts-1'
};

export function getModelById(modelId: string): ModelConfig | undefined {
  return [...CHAT_MODELS, ...TTS_MODELS].find(model => model.id === modelId);
}

export function getChatModels(): ModelConfig[] {
  return CHAT_MODELS;
}

export function getTTSModels(): ModelConfig[] {
  return TTS_MODELS;
} 