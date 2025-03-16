import OpenAI from 'openai';
import { createOpenAIClient } from '../config/api';

export async function detectLanguage(text: string, apiKey: string): Promise<string> {
  const openai = createOpenAIClient(apiKey);
  
  const response = await openai.chat.completions.create({
    model: "gpt-3.5-turbo",
    messages: [
      {
        role: "system",
        content: "You are a language detection expert. Respond only with the language name in English."
      },
      {
        role: "user",
        content: `What language is this text written in: "${text}"`
      }
    ],
    temperature: 0,
    max_tokens: 50,
  });

  const language = response.choices[0]?.message?.content?.trim() || 'English';
  return language;
}