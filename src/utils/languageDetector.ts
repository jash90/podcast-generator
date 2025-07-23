import OpenAI from 'openai';
import { createOpenAIClient } from '../config/api';
import { getModelById } from '../config/models';

export async function detectLanguage(text: string, apiKey: string, model: string = 'gpt-3.5-turbo'): Promise<string> {
  const openai = createOpenAIClient(apiKey);
  const modelConfig = getModelById(model);
  
  const systemInstructions = "You are a language detection expert. Respond only with the language name in English.";
  const userPrompt = `What language is this text written in: "${text}"`;
  
  // Build the request parameters
  let baseParams: any;
  
  if (modelConfig?.noSystemRole) {
    // For o1/o3 models that don't support system role, incorporate instructions into user message
    baseParams = {
      model,
      messages: [
        {
          role: "user" as const,
          content: `${systemInstructions}\n\n${userPrompt}`
        }
      ],
    };
  } else {
    // For regular models that support system role
    baseParams = {
      model,
      messages: [
        {
          role: "system" as const,
          content: systemInstructions
        },
        {
          role: "user" as const,
          content: userPrompt
        }
      ],
    };
  }

  // Add temperature only if model supports it
  if (!modelConfig?.noTemperature) {
    baseParams.temperature = 0;
  }

  // Use appropriate token parameter based on model type
  const requestParams = modelConfig?.usesCompletionTokens
    ? { ...baseParams, max_completion_tokens: 50 }
    : { ...baseParams, max_tokens: 50 };

  const response = await openai.chat.completions.create(requestParams);

  const language = response.choices[0]?.message?.content?.trim() || 'English';
  return language;
}