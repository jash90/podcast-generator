import OpenAI from 'openai';
import { createOpenAIClient } from '../config/api';
import type { PodcastScript, PodcastSegment } from '../types';
import { detectLanguage } from './languageDetector';
import type { GenerationStage } from '../components/GenerationProgress';
import type { ProjectModels } from '../config/models';
import { getModelById } from '../config/models';

const PERSONA_PROMPT = (topic: string, language: string) => `
Create three detailed personas for a podcast about "${topic}" in ${language}:

1. Host:
- Full name and background
- Gender (male/female)
- Expertise in journalism/broadcasting
- Knowledge about the topic's history
- Known for their balanced moderation style

2. Guest 1 (Supporting perspective):
- Full name and professional background
- Gender (male/female)
- Specific expertise related to the topic
- Notable achievements
- Main arguments and viewpoints

3. Guest 2 (Alternative perspective):
- Full name and professional background
- Gender (male/female)
- Specific expertise related to the topic
- Notable achievements
- Main arguments and viewpoints

Format: Return the personas in a clear structure with "Host:", "Guest 1:", and "Guest 2:" sections. Make sure to clearly specify the gender for each persona.
`;

const SECTION_PROMPTS = {
  opening: (topic: string, language: string, personas: string) => `
Create the opening section of a podcast about "${topic}" in ${language} using these personas:

${personas}

The opening should include:
- Host introduces the show and topic
- Host introduces guests
- Each guest briefly introduces themselves

Return ONLY a JSON array with the following format:
[
  {"type": "host", "text": "Welcome to the show..."},
  {"type": "guest1", "text": "Thank you for having me..."},
  {"type": "guest2", "text": "Glad to be here..."}
]
`,

  background: (topic: string, language: string, personas: string) => `
Create the background section of a podcast about "${topic}" in ${language} using these personas:

${personas}

The background should include:
- Host provides historical context
- Host highlights key developments
- Host explains current relevance
- Guests add contextual insights

Return ONLY a JSON array with the following format:
[
  {"type": "host", "text": "Let's discuss the background..."},
  {"type": "guest1", "text": "From my perspective..."},
  {"type": "guest2", "text": "Adding to that..."}
]
`,

  discussion: (topic: string, language: string, personas: string) => `
Create the main discussion section of a podcast about "${topic}" in ${language} using these personas:

${personas}

The discussion should include:
- Structured debate between guests
- Each guest presents their main arguments
- Host moderates and asks follow-up questions
- Guests respond to each other's points

Return ONLY a JSON array with the following format:
[
  {"type": "host", "text": "Let's dive deeper..."},
  {"type": "guest1", "text": "My main point is..."},
  {"type": "guest2", "text": "I see it differently..."}
]
`,

  conclusion: (topic: string, language: string, personas: string) => `
Create the conclusion section of a podcast about "${topic}" in ${language} using these personas:

${personas}

The conclusion should include:
- Host summarizes key points
- Final thoughts from guests
- Host closes the show

Return ONLY a JSON array with the following format:
[
  {"type": "host", "text": "To wrap up..."},
  {"type": "guest1", "text": "Final thoughts..."},
  {"type": "guest2", "text": "In conclusion..."}
]
`
};

async function generatePersonas(topic: string, language: string, apiKey: string, model: string) {
  const openai = createOpenAIClient(apiKey);
  const modelConfig = getModelById(model);
  
  const systemInstructions = "You are an expert in creating detailed, realistic personas for podcast participants.";
  const userPrompt = PERSONA_PROMPT(topic, language);
  
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
    baseParams.temperature = 0.7;
  }

  // Use appropriate token parameter based on model type
  const requestParams = modelConfig?.usesCompletionTokens 
    ? { ...baseParams, max_completion_tokens: 1000 }
    : { ...baseParams, max_tokens: 1000 };
  
  const completion = await openai.chat.completions.create(requestParams);

  return completion.choices[0]?.message?.content || '';
}

function parsePersonaGenders(personas: string): Record<string, boolean> {
  const genderMap: Record<string, boolean> = {
    'host': true, // default to male
    'guest1': true, // default to male  
    'guest2': false, // default to female
  };

  // Parse the personas text to extract gender information
  const sections = personas.split(/(?:Host:|Guest 1:|Guest 2:)/i);
  
  // Process Host section
  if (sections[1]) {
    const hostSection = sections[1].toLowerCase();
    if (hostSection.includes('gender') && hostSection.includes('female')) {
      genderMap['host'] = false; // female
    } else if (hostSection.includes('gender') && hostSection.includes('male')) {
      genderMap['host'] = true; // male
    }
  }
  
  // Process Guest 1 section
  if (sections[2]) {
    const guest1Section = sections[2].toLowerCase();
    if (guest1Section.includes('gender') && guest1Section.includes('female')) {
      genderMap['guest1'] = false; // female
    } else if (guest1Section.includes('gender') && guest1Section.includes('male')) {
      genderMap['guest1'] = true; // male
    }
  }
  
  // Process Guest 2 section
  if (sections[3]) {
    const guest2Section = sections[3].toLowerCase();
    if (guest2Section.includes('gender') && guest2Section.includes('female')) {
      genderMap['guest2'] = false; // female
    } else if (guest2Section.includes('gender') && guest2Section.includes('male')) {
      genderMap['guest2'] = true; // male
    }
  }

  return genderMap;
}

async function generateSection(
  section: keyof typeof SECTION_PROMPTS,
  topic: string,
  language: string,
  personas: string,
  apiKey: string,
  model: string
): Promise<PodcastSegment[]> {
  const openai = createOpenAIClient(apiKey);
  const modelConfig = getModelById(model);
  
  const systemInstructions = `You are an expert podcast script writer who creates engaging, natural-flowing discussions in ${language}. Return ONLY the JSON array as specified, with no additional text or formatting.`;
  const userPrompt = SECTION_PROMPTS[section](topic, language, personas);
  
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
    baseParams.temperature = 0.7;
  }

  // Use appropriate token parameter based on model type
  const requestParams = modelConfig?.usesCompletionTokens
    ? { ...baseParams, max_completion_tokens: 16000 }
    : { ...baseParams, max_tokens: 16000 };
  
  const completion = await openai.chat.completions.create(requestParams);

  let scriptText = completion.choices[0]?.message?.content;
  if (!scriptText) {
    throw new Error(`Failed to generate ${section} section`);
  }

  try {
    // Clean up potential markdown formatting
    scriptText = scriptText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const segments = JSON.parse(scriptText);
    
    if (!Array.isArray(segments)) {
      throw new Error(`Invalid ${section} section format`);
    }

    return segments;
  } catch (parseError) {
    console.error(`Error parsing ${section} section:`, parseError);
    throw new Error(`Failed to parse ${section} section JSON`);
  }
}

export async function generatePodcastScript(
  topic: string, 
  apiKey: string,
  setGenerationStage: (stage: GenerationStage) => void,
  models: ProjectModels
): Promise<PodcastScript> {
  try {
    setGenerationStage('detecting-language');
    const language = await detectLanguage(topic, apiKey, models.languageDetection);
    
    setGenerationStage('creating-personas');
    const personas = await generatePersonas(topic, language, apiKey, models.personaGeneration);
    const personaGenders = parsePersonaGenders(personas);

    setGenerationStage('writing-script');
    const sections = await Promise.all([
      generateSection('opening', topic, language, personas, apiKey, models.scriptGeneration),
      generateSection('background', topic, language, personas, apiKey, models.scriptGeneration),
      generateSection('discussion', topic, language, personas, apiKey, models.scriptGeneration),
      generateSection('conclusion', topic, language, personas, apiKey, models.scriptGeneration)
    ]);

    const segments = sections.flat();

    setGenerationStage('initializing-voices');
    return { segments, language, personaGenders };
  } catch (error: any) {
    if (error.response?.status === 401) {
      throw new Error('Invalid API key. Please check your OpenAI API key and try again.');
    }
    throw error;
  }
}