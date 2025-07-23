// AI Model Configuration
// To add new models: Add them to the appropriate array below with proper ModelConfig interface
// The system will automatically make them available in the UI selector
//
// Model Flags:
// - usesCompletionTokens: Use 'max_completion_tokens' instead of 'max_tokens' (for o1/o3 models)
// - noSystemRole: Model doesn't support 'system' role messages (for o1/o3 models)
// - noTemperature: Model doesn't support temperature customization, uses default 1 (for o1/o3 models)

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

export const CHAT_MODELS: ModelConfig[] = [
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
    id: 'gpt-4',
    name: 'GPT-4',
    provider: 'openai',
    category: 'chat',
    description: 'Most capable model, best for complex reasoning',
    maxTokens: 8192
  },
  {
    id: 'gpt-4-turbo',
    name: 'GPT-4 Turbo',
    provider: 'openai',
    category: 'chat',
    description: 'Latest GPT-4 with improved performance and larger context',
    maxTokens: 128000
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

export const TTS_MODELS: ModelConfig[] = [
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
  }
];

export interface ProjectModels {
  personaGeneration: string;
  scriptGeneration: string;
  languageDetection: string;
  textToSpeech: string;
}

export const DEFAULT_MODELS: ProjectModels = {
  personaGeneration: 'o1-mini',
  scriptGeneration: 'gpt-4o-mini',
  languageDetection: 'gpt-3.5-turbo',
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