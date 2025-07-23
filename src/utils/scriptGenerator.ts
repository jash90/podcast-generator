import OpenAI from 'openai';
import { createOpenAIClient } from '../config/api';
import type { PodcastScript, PodcastSegment, PersonaCollection, PodcastTopics } from '../types';
import { detectLanguage } from './languageDetector';
import type { GenerationStage } from '../components/GenerationProgress';
import type { ProjectModels } from '../config/models';
import { getModelById } from '../config/models';

const HOST_PERSONA_PROMPT = (topic: string, language: string) => `
Create a detailed host persona for a podcast about "${topic}" in ${language}.

Return ONLY a JSON object with the following structure (no additional text or formatting):

{
  "name": "Full name",
  "gender": "male" or "female",
  "ageRange": "e.g., 35-45",
  "personality": ["trait1", "trait2", "trait3"],
  "background": "Professional background description",
  "expertise": ["area1", "area2", "area3"],
  "voiceCharacteristics": {
    "tone": "warm" | "authoritative" | "friendly" | "professional" | "energetic" | "calm",
    "style": "conversational" | "formal" | "casual" | "academic" | "journalistic",
    "pace": "slow" | "moderate" | "fast"
  }
}

Requirements:
- Should be an experienced journalist/broadcaster with balanced moderation style
- Expert in journalism with broad knowledge about various topics
- Professional, balanced personality suitable for hosting discussions
- Voice characteristics should reflect their role as a moderator and facilitator
`;

const GUEST_PERSONA_PROMPT = (topic: string, language: string, guestType: 'guest1' | 'guest2', perspective: 'supporting' | 'alternative') => `
Create a detailed ${guestType} persona for a podcast about "${topic}" in ${language}.

Return ONLY a JSON object with the following structure (no additional text or formatting):

{
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
}

Requirements:
- This guest should provide a ${perspective} perspective on the topic
- Should have specific expertise directly related to "${topic}"
- Professional background that gives them authority to speak on this subject
- Voice characteristics should match their personality and professional role
- Should be different from the other participants (different gender, age range, or personality)
- Must have distinct viewpoint and expertise that adds value to the discussion
`;

const TOPICS_GENERATION_PROMPT = (topic: string, language: string, personas: string) => `
Create a comprehensive structure of discussion topics and questions for a podcast about "${topic}" in ${language}.

Use these personas for context:
${personas}

Return ONLY a JSON object with the following structure (no additional text or formatting):

{
  "mainTopic": "${topic}",
  "subtopics": [
    {
      "title": "Topic title",
      "description": "Brief description of what this topic covers",
      "perspective": "neutral" | "controversial" | "analytical",
      "targetGuest": "guest1" | "guest2" | "both",
      "hostQuestions": [
        "Question 1 that the host will ask",
        "Question 2 that the host will ask",
        "Question 3 that the host will ask"
      ],
      "followUpQuestions": [
        "Follow-up question 1",
        "Follow-up question 2"
      ]
    }
  ],
  "openingQuestions": [
    "Opening question 1 for introduction",
    "Opening question 2 for setting context"
  ],
  "closingQuestions": [
    "Closing question 1 for final thoughts",
    "Closing question 2 for wrap-up"
  ]
}

Requirements:
- Generate 4-6 subtopics that comprehensively cover different aspects of "${topic}"
- Each subtopic should have 3-5 host questions and 2-3 follow-up questions
- Questions should be engaging, thought-provoking, and appropriate for the expertise of each guest
- Mix neutral, controversial, and analytical perspectives across subtopics
- Target specific guests based on their expertise and viewpoints
- Ensure questions flow naturally and build upon each other
- Include 2-3 opening questions and 2-3 closing questions
- All questions should be in ${language}
`;

const SECTION_PROMPTS = {
  opening: (topic: string, language: string, personas: string, topics: PodcastTopics) => `
Create the opening section of a podcast about "${topic}" in ${language} using these personas and discussion structure:

${personas}

Opening Questions to Use:
${topics.openingQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n')}

The opening should include:
- Host introduces the show and topic
- Host introduces guests with their expertise
- Each guest briefly introduces themselves
- Host asks 1-2 opening questions to set the stage

Return ONLY a JSON array with the following format:
[
  {"type": "host", "text": "Welcome to the show..."},
  {"type": "guest1", "text": "Thank you for having me..."},
  {"type": "guest2", "text": "Glad to be here..."},
  {"type": "host", "text": "Opening question..."}
]
`,

  background: (topic: string, language: string, personas: string, topics: PodcastTopics) => `
Create the background section of a podcast about "${topic}" in ${language} using these personas and discussion structure:

${personas}

Background Topics to Cover:
${topics.subtopics.filter(t => t.perspective === 'neutral').map((subtopic, i) => `
${i + 1}. ${subtopic.title}: ${subtopic.description}
Host Questions: ${subtopic.hostQuestions.slice(0, 2).join(' / ')}
`).join('\n')}

The background should include:
- Host provides historical context using the questions above
- Host asks specific questions about background and development
- Guests provide expert insights and context
- Natural flow between questions and responses

Return ONLY a JSON array with the following format:
[
  {"type": "host", "text": "Let's start with the background..."},
  {"type": "guest1", "text": "From my perspective..."},
  {"type": "guest2", "text": "Adding to that..."}
]
`,

  discussion: (topic: string, language: string, personas: string, topics: PodcastTopics) => `
Create the main discussion section of a podcast about "${topic}" in ${language} using these personas and discussion structure:

${personas}

Main Discussion Topics and Questions:
${topics.subtopics.map((subtopic, i) => `
${i + 1}. ${subtopic.title} (${subtopic.perspective})
   Description: ${subtopic.description}
   Target: ${subtopic.targetGuest || 'both'}
   Host Questions:
   ${subtopic.hostQuestions.map((q) => `   - ${q}`).join('\n')}
   Follow-ups:
   ${subtopic.followUpQuestions.map((q) => `   - ${q}`).join('\n')}
`).join('\n')}

The discussion should include:
- Host asks the prepared questions in a natural conversational flow
- Each guest responds based on their expertise and perspective
- Host uses follow-up questions to dig deeper
- Guests respond to each other's points
- Host moderates and guides the conversation between topics

Create a dynamic conversation that uses these questions naturally. Don't make it feel like a rigid Q&A.

Return ONLY a JSON array with the following format:
[
  {"type": "host", "text": "Let's dive into the first major topic..."},
  {"type": "guest1", "text": "My perspective on this is..."},
  {"type": "guest2", "text": "I see it differently..."}
]
`,

  conclusion: (topic: string, language: string, personas: string, topics: PodcastTopics) => `
Create the conclusion section of a podcast about "${topic}" in ${language} using these personas and discussion structure:

${personas}

Closing Questions to Use:
${topics.closingQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n')}

The conclusion should include:
- Host asks closing questions to get final thoughts
- Host summarizes key points from the discussion
- Each guest provides final insights and takeaways
- Host closes the show professionally

Return ONLY a JSON array with the following format:
[
  {"type": "host", "text": "As we wrap up, let me ask..."},
  {"type": "guest1", "text": "My final thought is..."},
  {"type": "guest2", "text": "In conclusion..."},
  {"type": "host", "text": "Thank you both for this fascinating discussion..."}
]
`
};

async function generateHostPersona(topic: string, language: string, apiKey: string, model: string): Promise<PersonaCollection['host']> {
  const openai = createOpenAIClient(apiKey);
  const modelConfig = getModelById(model);
  
  const systemInstructions = "You are an expert in creating detailed, realistic personas for podcast participants. Return ONLY valid JSON with no additional text or formatting.";
  const userPrompt = HOST_PERSONA_PROMPT(topic, language);
  
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
    throw new Error('Failed to generate host persona');
  }

  try {
    // Clean up potential markdown formatting
    const cleanContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const persona = JSON.parse(cleanContent) as PersonaCollection['host'];
    
    // Validate the structure
    if (!persona.name || !persona.gender || !persona.ageRange || !persona.personality || !persona.background || !persona.expertise || !persona.voiceCharacteristics) {
      throw new Error('Invalid host persona structure');
    }

    return persona;
  } catch (parseError) {
    console.error('Error parsing host persona JSON:', parseError);
    console.error('Raw content:', content);
    throw new Error('Failed to parse host persona JSON response');
  }
}

async function generateGuestPersona(topic: string, language: string, guestType: 'guest1' | 'guest2', perspective: 'supporting' | 'alternative', apiKey: string, model: string): Promise<PersonaCollection[keyof PersonaCollection]> {
  const openai = createOpenAIClient(apiKey);
  const modelConfig = getModelById(model);
  
  const systemInstructions = "You are an expert in creating detailed, realistic personas for podcast participants. Return ONLY valid JSON with no additional text or formatting.";
  const userPrompt = GUEST_PERSONA_PROMPT(topic, language, guestType, perspective);
  
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
    throw new Error(`Failed to generate ${guestType} persona`);
  }

  try {
    // Clean up potential markdown formatting
    const cleanContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const persona = JSON.parse(cleanContent) as PersonaCollection[keyof PersonaCollection];
    
    // Validate the structure
    if (!persona.name || !persona.gender || !persona.ageRange || !persona.personality || !persona.background || !persona.expertise || !persona.voiceCharacteristics) {
      throw new Error(`Invalid ${guestType} persona structure`);
    }

    return persona;
  } catch (parseError) {
    console.error(`Error parsing ${guestType} persona JSON:`, parseError);
    console.error('Raw content:', content);
    throw new Error(`Failed to parse ${guestType} persona JSON response`);
  }
}

async function generateDiscussionTopics(
  topic: string,
  language: string,
  personas: PersonaCollection,
  apiKey: string,
  model: string
): Promise<PodcastTopics> {
  const openai = createOpenAIClient(apiKey);
  const modelConfig = getModelById(model);
  
  const systemInstructions = `You are an expert podcast producer who creates engaging discussion structures. You understand how to create compelling questions that draw out expertise and create natural dialogue. Return ONLY valid JSON with no additional text or formatting.`;
  const userPrompt = TOPICS_GENERATION_PROMPT(topic, language, personasToText(personas));
  
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
    baseParams.temperature = 0.8; // Slightly higher for creative topic generation
  }

  // Use appropriate token parameter based on model type
  const requestParams = modelConfig?.usesCompletionTokens 
    ? { ...baseParams, max_completion_tokens: 4000 }
    : { ...baseParams, max_tokens: 4000 };
  
  const completion = await openai.chat.completions.create(requestParams);

  const content = completion.choices[0]?.message?.content;
  if (!content) {
    throw new Error('Failed to generate discussion topics');
  }

  try {
    // Clean the response to extract JSON
    let cleanContent = content.trim();
    if (cleanContent.startsWith('```json')) {
      cleanContent = cleanContent.replace(/```json\s*/, '').replace(/```\s*$/, '');
    } else if (cleanContent.startsWith('```')) {
      cleanContent = cleanContent.replace(/```\s*/, '').replace(/```\s*$/, '');
    }

    const topics = JSON.parse(cleanContent) as PodcastTopics;
    
    // Validate the structure
    if (!topics.mainTopic || !Array.isArray(topics.subtopics) || !Array.isArray(topics.openingQuestions) || !Array.isArray(topics.closingQuestions)) {
      throw new Error('Invalid topics structure');
    }

    console.log(`Generated ${topics.subtopics.length} discussion topics with questions`);
    return topics;
  } catch (parseError) {
    console.error('Error parsing topics JSON:', parseError);
    console.error('Raw content:', content);
    throw new Error('Failed to parse discussion topics JSON response');
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
  personas: PersonaCollection,
  topics: PodcastTopics,
  apiKey: string,
  model: string
): Promise<PodcastSegment[]> {
  const openai = createOpenAIClient(apiKey);
  const modelConfig = getModelById(model);
  
  const systemInstructions = `You are an expert podcast script writer who creates engaging, natural-flowing discussions in ${language}. Use the provided questions and topics to create realistic dialogue that doesn't sound scripted. Return ONLY the JSON array as specified, with no additional text or formatting.`;
  const userPrompt = SECTION_PROMPTS[section](topic, language, personasToText(personas), topics);
  
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

  const scriptText = completion.choices[0]?.message?.content;
  if (!scriptText) {
    throw new Error(`Failed to generate ${section} section`);
  }

  // Clean and parse the JSON response
  try {
    let cleanScriptText = scriptText.trim();
    if (cleanScriptText.startsWith('```json')) {
      cleanScriptText = cleanScriptText.replace(/```json\s*/, '').replace(/```\s*$/, '');
    } else if (cleanScriptText.startsWith('```')) {
      cleanScriptText = cleanScriptText.replace(/```\s*/, '').replace(/```\s*$/, '');
    }

    const segments = JSON.parse(cleanScriptText) as PodcastSegment[];
    return segments;
  } catch (parseError) {
    console.error(`Error parsing ${section} section JSON:`, parseError);
    console.error('Raw content:', scriptText);
    throw new Error(`Failed to parse ${section} section JSON response`);
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
    const hostPersona = await generateHostPersona(topic, language, apiKey, models.personaGeneration);
    const guest1Persona = await generateGuestPersona(topic, language, 'guest1', 'supporting', apiKey, models.personaGeneration);
    const guest2Persona = await generateGuestPersona(topic, language, 'guest2', 'alternative', apiKey, models.personaGeneration);

    const personas: PersonaCollection = {
      host: hostPersona,
      guest1: guest1Persona,
      guest2: guest2Persona,
    };
    const personaGenders = parsePersonaGenders(personas);

    setGenerationStage('generating-topics');
    const topics = await generateDiscussionTopics(topic, language, personas, apiKey, models.scriptGeneration);

    setGenerationStage('writing-script');
    const sections = await Promise.all([
      generateSection('opening', topic, language, personas, topics, apiKey, models.scriptGeneration),
      generateSection('background', topic, language, personas, topics, apiKey, models.scriptGeneration),
      generateSection('discussion', topic, language, personas, topics, apiKey, models.scriptGeneration),
      generateSection('conclusion', topic, language, personas, topics, apiKey, models.scriptGeneration)
    ]);

    const segments = sections.flat();

    setGenerationStage('initializing-voices');
    return { 
      segments, 
      language, 
      personaGenders,
      personas,
      topics
    };
  } catch (error: any) {
    if (error.response?.status === 401) {
      throw new Error('Invalid API key. Please check your OpenAI API key and try again.');
    }
    throw error;
  }
}