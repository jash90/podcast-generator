import OpenAI from 'openai';
import { createOpenAIClient } from '../config/api';
import type { PodcastScript, PodcastSegment, PersonaCollection } from '../types';
import { detectLanguage } from './languageDetector';
import type { GenerationStage } from '../components/GenerationProgress';
import type { ProjectModels } from '../config/models';
import { getModelById } from '../config/models';

const PERSONA_PROMPT = (topic: string, language: string) => `
Create three detailed personas for a podcast about "${topic}" in ${language}.

Return ONLY a JSON object with the following structure (no additional text or formatting):

{
  "host": {
    "name": "Full name",
    "gender": "male" or "female",
    "ageRange": "e.g., 30-40",
    "personality": ["trait1", "trait2", "trait3"],
    "background": "Professional background description",
    "expertise": ["area1", "area2", "area3"],
    "voiceCharacteristics": {
      "tone": "warm" | "authoritative" | "friendly" | "professional" | "energetic" | "calm",
      "style": "conversational" | "formal" | "casual" | "academic" | "journalistic",
      "pace": "slow" | "moderate" | "fast"
    }
  },
  "guest1": {
    "name": "Full name",
    "gender": "male" or "female",
    "ageRange": "e.g., 25-35",
    "personality": ["trait1", "trait2", "trait3"],
    "background": "Professional background description",
    "expertise": ["area1", "area2", "area3"],
    "voiceCharacteristics": {
      "tone": "warm" | "authoritative" | "friendly" | "professional" | "energetic" | "calm",
      "style": "conversational" | "formal" | "casual" | "academic" | "journalistic",
      "pace": "slow" | "moderate" | "fast"
    }
  },
  "guest2": {
    "name": "Full name",
    "gender": "male" or "female",
    "ageRange": "e.g., 40-50",
    "personality": ["trait1", "trait2", "trait3"],
    "background": "Professional background description",
    "expertise": ["area1", "area2", "area3"],
    "voiceCharacteristics": {
      "tone": "warm" | "authoritative" | "friendly" | "professional" | "energetic" | "calm",
      "style": "conversational" | "formal" | "casual" | "academic" | "journalistic",
      "pace": "slow" | "moderate" | "fast"
    }
  }
}

Requirements:
- Host: Should be an experienced journalist/broadcaster with balanced moderation style
- Guest 1: Supporting perspective with specific expertise
- Guest 2: Alternative perspective with different expertise
- Each persona should have distinct voice characteristics that match their personality and background
- Ensure gender diversity across the three personas
- Voice characteristics should reflect their professional role and personality
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

async function generatePersonas(topic: string, language: string, apiKey: string, model: string): Promise<PersonaCollection> {
  const openai = createOpenAIClient(apiKey);
  const modelConfig = getModelById(model);
  
  const systemInstructions = "You are an expert in creating detailed, realistic personas for podcast participants. Return ONLY valid JSON with no additional text or formatting.";
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
    ? { ...baseParams, max_completion_tokens: 2000 }
    : { ...baseParams, max_tokens: 2000 };
  
  const completion = await openai.chat.completions.create(requestParams);

  const content = completion.choices[0]?.message?.content;
  if (!content) {
    throw new Error('Failed to generate personas');
  }

  try {
    // Clean up potential markdown formatting
    const cleanContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const personas = JSON.parse(cleanContent) as PersonaCollection;
    
    // Validate the structure
    if (!personas.host || !personas.guest1 || !personas.guest2) {
      throw new Error('Invalid persona structure');
    }

    return personas;
  } catch (parseError) {
    console.error('Error parsing personas JSON:', parseError);
    console.error('Raw content:', content);
    throw new Error('Failed to parse personas JSON response');
  }
}

function parsePersonaGenders(personas: PersonaCollection): Record<string, boolean> {
  return {
    'host': personas.host.gender === 'male',
    'guest1': personas.guest1.gender === 'male',
    'guest2': personas.guest2.gender === 'male',
  };
}

// Convert personas to text format for section generation (temporary)
function personasToText(personas: PersonaCollection): string {
  return `
Host: ${personas.host.name}
- Gender: ${personas.host.gender}
- Background: ${personas.host.background}
- Expertise: ${personas.host.expertise.join(', ')}
- Personality: ${personas.host.personality.join(', ')}
- Voice: ${personas.host.voiceCharacteristics.tone}, ${personas.host.voiceCharacteristics.style}, ${personas.host.voiceCharacteristics.pace} pace

Guest 1: ${personas.guest1.name}
- Gender: ${personas.guest1.gender}
- Background: ${personas.guest1.background}
- Expertise: ${personas.guest1.expertise.join(', ')}
- Personality: ${personas.guest1.personality.join(', ')}
- Voice: ${personas.guest1.voiceCharacteristics.tone}, ${personas.guest1.voiceCharacteristics.style}, ${personas.guest1.voiceCharacteristics.pace} pace

Guest 2: ${personas.guest2.name}
- Gender: ${personas.guest2.gender}
- Background: ${personas.guest2.background}
- Expertise: ${personas.guest2.expertise.join(', ')}
- Personality: ${personas.guest2.personality.join(', ')}
- Voice: ${personas.guest2.voiceCharacteristics.tone}, ${personas.guest2.voiceCharacteristics.style}, ${personas.guest2.voiceCharacteristics.pace} pace
`.trim();
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
      generateSection('opening', topic, language, personasToText(personas), apiKey, models.scriptGeneration),
      generateSection('background', topic, language, personasToText(personas), apiKey, models.scriptGeneration),
      generateSection('discussion', topic, language, personasToText(personas), apiKey, models.scriptGeneration),
      generateSection('conclusion', topic, language, personasToText(personas), apiKey, models.scriptGeneration)
    ]);

    const segments = sections.flat();

    setGenerationStage('initializing-voices');
    return { 
      segments, 
      language, 
      personaGenders,
      personas
    };
  } catch (error: any) {
    if (error.response?.status === 401) {
      throw new Error('Invalid API key. Please check your OpenAI API key and try again.');
    }
    throw error;
  }
}