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

// Individual response generation prompts for longer, more detailed answers
const INDIVIDUAL_RESPONSE_PROMPTS = {
  hostIntroduction: (topic: string, language: string, hostPersona: PersonaCollection['host']) => `
You are ${hostPersona.name}, a ${hostPersona.background} with expertise in ${hostPersona.expertise.join(', ')}. Your speaking style is ${hostPersona.voiceCharacteristics.tone} and ${hostPersona.voiceCharacteristics.style}.

Create a detailed, engaging opening introduction for your podcast about "${topic}" in ${language}.

Your introduction should:
- Welcome listeners warmly and professionally (2-3 sentences)
- Introduce the topic with compelling context and relevance (3-4 sentences)
- Explain why this topic matters now (2-3 sentences)
- Briefly preview what listeners will learn (1-2 sentences)
- Set an engaging, professional tone that matches your personality

Speak naturally as ${hostPersona.name} would, incorporating your ${hostPersona.personality.join(', ')} personality traits.

Generate a response that is 150-250 words long for natural speech flow.

Return ONLY the speech text with no additional formatting or labels.
`,

  guestIntroduction: (guestPersona: PersonaCollection['guest1'], hostPersona: PersonaCollection['host'], language: string) => `
The host ${hostPersona.name} has just introduced you. You are ${guestPersona.name}, a ${guestPersona.background} with expertise in ${guestPersona.expertise.join(', ')}.

Your speaking style is ${guestPersona.voiceCharacteristics.tone} and ${guestPersona.voiceCharacteristics.style}, with a ${guestPersona.voiceCharacteristics.pace} pace.

Create a detailed self-introduction in ${language} that includes:
- Thank the host warmly (1 sentence)
- Introduce yourself and your background (2-3 sentences)
- Explain your specific expertise and experience (3-4 sentences)
- Share why you're passionate about this topic (2-3 sentences)
- Express excitement about the discussion (1 sentence)

Speak naturally as ${guestPersona.name} would, incorporating your ${guestPersona.personality.join(', ')} personality traits.

Generate a response that is 120-200 words long for engaging self-introduction.

Return ONLY the speech text with no additional formatting or labels.
`,

  hostQuestion: (question: string, hostPersona: PersonaCollection['host'], topic: string, language: string, targetGuest?: string) => `
You are ${hostPersona.name}, conducting a professional podcast interview about "${topic}" in ${language}.

Your speaking style is ${hostPersona.voiceCharacteristics.tone} and ${hostPersona.voiceCharacteristics.style}.

Ask this question naturally and professionally: "${question}"

Your question delivery should:
- Lead into the question with 1-2 sentences of context or transition
- Ask the main question clearly and engagingly
- ${targetGuest ? `Direct it specifically to ${targetGuest} if appropriate` : 'Allow either guest to respond'}
- Add a brief clarification or follow-up angle if helpful (1 sentence)

Speak naturally as ${hostPersona.name} would, incorporating your ${hostPersona.personality.join(', ')} personality traits.

Generate a response that is 60-120 words long for natural question delivery.

Return ONLY the speech text with no additional formatting or labels.
`,

  guestResponse: (question: string, guestPersona: PersonaCollection['guest1'], topic: string, language: string, questionContext?: string) => `
You are ${guestPersona.name}, a ${guestPersona.background} with expertise in ${guestPersona.expertise.join(', ')}.

The host has asked: "${question}"
${questionContext ? `Context: ${questionContext}` : ''}

Your speaking style is ${guestPersona.voiceCharacteristics.tone} and ${guestPersona.voiceCharacteristics.style}, with a ${guestPersona.voiceCharacteristics.pace} pace.

Provide a comprehensive, detailed response in ${language} that includes:
- Acknowledge the question (1 sentence)
- Share your expertise and insights (4-6 sentences)
- Provide specific examples, data, or experiences (3-4 sentences)
- Explain the broader implications or context (2-3 sentences)
- Connect to practical applications or real-world impact (2-3 sentences)
- Conclude with your key takeaway or perspective (1-2 sentences)

Speak naturally as ${guestPersona.name} would, incorporating your ${guestPersona.personality.join(', ')} personality traits and drawing from your background in ${guestPersona.background}.

Generate a response that is 200-350 words long for comprehensive, engaging discussion.

Return ONLY the speech text with no additional formatting or labels.
`,

  hostTransition: (fromTopic: string, toTopic: string, hostPersona: PersonaCollection['host'], language: string) => `
You are ${hostPersona.name}, conducting a professional podcast interview in ${language}.

Your speaking style is ${hostPersona.voiceCharacteristics.tone} and ${hostPersona.voiceCharacteristics.style}.

Create a smooth transition from discussing "${fromTopic}" to "${toTopic}" that includes:
- Acknowledge the previous discussion point (1 sentence)
- Bridge to the new topic naturally (1-2 sentences)
- Introduce the new topic with engaging context (1-2 sentences)

Speak naturally as ${hostPersona.name} would, incorporating your ${hostPersona.personality.join(', ')} personality traits.

Generate a response that is 40-80 words long for natural topic transition.

Return ONLY the speech text with no additional formatting or labels.
`,

  hostSummary: (topic: string, keyPoints: string[], hostPersona: PersonaCollection['host'], language: string) => `
You are ${hostPersona.name}, wrapping up a professional podcast discussion about "${topic}" in ${language}.

Your speaking style is ${hostPersona.voiceCharacteristics.tone} and ${hostPersona.voiceCharacteristics.style}.

Create a comprehensive conclusion that includes:
- Transition into the wrap-up (1 sentence)
- Summarize the key insights discussed: ${keyPoints.join(', ')} (3-4 sentences)
- Highlight the most important takeaways for listeners (2-3 sentences)
- Thank your guests professionally (1-2 sentences)
- Close the show with your signature style (1-2 sentences)

Speak naturally as ${hostPersona.name} would, incorporating your ${hostPersona.personality.join(', ')} personality traits.

Generate a response that is 150-250 words long for a comprehensive conclusion.

Return ONLY the speech text with no additional formatting or labels.
`,

  guestFinalThoughts: (topic: string, guestPersona: PersonaCollection['guest1'], mainDiscussionPoints: string[], language: string) => `
You are ${guestPersona.name}, providing final thoughts on "${topic}" in ${language}.

Your speaking style is ${guestPersona.voiceCharacteristics.tone} and ${guestPersona.voiceCharacteristics.style}.

The main points discussed were: ${mainDiscussionPoints.join(', ')}

Provide comprehensive final thoughts that include:
- Express appreciation for the discussion (1 sentence)
- Reflect on the most important aspects discussed (2-3 sentences)
- Share your key message or call-to-action for listeners (2-3 sentences)
- Provide forward-looking insights or predictions (2-3 sentences)
- End with your personal takeaway or final wisdom (1-2 sentences)

Speak naturally as ${guestPersona.name} would, incorporating your ${guestPersona.personality.join(', ')} personality traits and expertise in ${guestPersona.expertise.join(', ')}.

Generate a response that is 150-250 words long for meaningful final thoughts.

Return ONLY the speech text with no additional formatting or labels.
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

async function generateIndividualResponse(
  prompt: string,
  apiKey: string,
  model: string,
  speakerType: 'host' | 'guest1' | 'guest2'
): Promise<string> {
  const openai = createOpenAIClient(apiKey);
  const modelConfig = getModelById(model);
  
  const systemInstructions = `You are an expert at creating natural, engaging podcast dialogue. Generate responses that sound conversational and authentic, not scripted. Focus on creating longer, more detailed responses that provide comprehensive insights and maintain listener engagement.`;
  
  // Build the request parameters
  let baseParams: any;
  
  if (modelConfig?.noSystemRole) {
    baseParams = {
      model,
      messages: [
        {
          role: "user" as const,
          content: `${systemInstructions}\n\n${prompt}`
        }
      ],
    };
  } else {
    baseParams = {
      model,
      messages: [
        {
          role: "system" as const,
          content: systemInstructions
        },
        {
          role: "user" as const,
          content: prompt
        }
      ],
    };
  }

  // Add temperature only if model supports it
  if (!modelConfig?.noTemperature) {
    baseParams.temperature = 0.8; // Higher temperature for more creative, natural responses
  }

  // Use appropriate token parameter based on model type
  const requestParams = modelConfig?.usesCompletionTokens 
    ? { ...baseParams, max_completion_tokens: 4000 }
    : { ...baseParams, max_tokens: 4000 };
  
  const completion = await openai.chat.completions.create(requestParams);

  const content = completion.choices[0]?.message?.content;
  if (!content) {
    throw new Error(`Failed to generate ${speakerType} response`);
  }

  return content.trim();
}

async function generateOpeningSection(
  topic: string,
  language: string,
  personas: PersonaCollection,
  topics: PodcastTopics,
  apiKey: string,
  model: string,
  onProgress: (segment: number, total: number) => void
): Promise<PodcastSegment[]> {
  const segments: PodcastSegment[] = [];
  
  // 1. Host introduction
  onProgress(1, 4);
  const hostIntro = await generateIndividualResponse(
    INDIVIDUAL_RESPONSE_PROMPTS.hostIntroduction(topic, language, personas.host),
    apiKey,
    model,
    'host'
  );
  segments.push({ speaker: personas.host.name, text: hostIntro, type: 'host' });

  // 2. Host introduces guest 1
  onProgress(2, 4);
  const hostIntroGuest1 = await generateIndividualResponse(
    `You are ${personas.host.name}. Introduce your first guest ${personas.guest1.name}, highlighting their background as ${personas.guest1.background} and expertise in ${personas.guest1.expertise.join(', ')}. Keep it warm and professional. Speak in ${language}. (50-80 words)`,
    apiKey,
    model,
    'host'
  );
  segments.push({ speaker: personas.host.name, text: hostIntroGuest1, type: 'host' });

  // 3. Guest 1 self-introduction
  const guest1Intro = await generateIndividualResponse(
    INDIVIDUAL_RESPONSE_PROMPTS.guestIntroduction(personas.guest1, personas.host, language),
    apiKey,
    model,
    'guest1'
  );
  segments.push({ speaker: personas.guest1.name, text: guest1Intro, type: 'guest1' });

  // 4. Host introduces guest 2 and guest 2 responds
  onProgress(3, 4);
  const hostIntroGuest2 = await generateIndividualResponse(
    `You are ${personas.host.name}. Introduce your second guest ${personas.guest2.name}, highlighting their background as ${personas.guest2.background} and expertise in ${personas.guest2.expertise.join(', ')}. Keep it warm and professional. Speak in ${language}. (50-80 words)`,
    apiKey,
    model,
    'host'
  );
  segments.push({ speaker: personas.host.name, text: hostIntroGuest2, type: 'host' });

  onProgress(4, 4);
  const guest2Intro = await generateIndividualResponse(
    INDIVIDUAL_RESPONSE_PROMPTS.guestIntroduction(personas.guest2, personas.host, language),
    apiKey,
    model,
    'guest2'
  );
  segments.push({ speaker: personas.guest2.name, text: guest2Intro, type: 'guest2' });

  return segments;
}

async function generateBackgroundSection(
  topic: string,
  language: string,
  personas: PersonaCollection,
  topics: PodcastTopics,
  apiKey: string,
  model: string,
  onProgress: (segment: number, total: number) => void
): Promise<PodcastSegment[]> {
  const segments: PodcastSegment[] = [];
  const backgroundTopics = topics.subtopics.filter(t => t.perspective === 'neutral');
  
  if (backgroundTopics.length === 0) {
    // Use first 2 subtopics if no neutral ones
    backgroundTopics.push(...topics.subtopics.slice(0, 2));
  }

  let segmentCount = 0;
  const totalSegments = backgroundTopics.length * 3; // Host question + 2 guest responses per topic

  for (const subtopic of backgroundTopics.slice(0, 2)) { // Limit to 2 background topics
    // Host asks question
    segmentCount++;
    onProgress(segmentCount, totalSegments);
    
    const hostQuestion = await generateIndividualResponse(
      INDIVIDUAL_RESPONSE_PROMPTS.hostQuestion(subtopic.hostQuestions[0], personas.host, topic, language),
      apiKey,
      model,
      'host'
    );
    segments.push({ speaker: personas.host.name, text: hostQuestion, type: 'host' });

    // Guest 1 responds
    segmentCount++;
    onProgress(segmentCount, totalSegments);
    
    const guest1Response = await generateIndividualResponse(
      INDIVIDUAL_RESPONSE_PROMPTS.guestResponse(subtopic.hostQuestions[0], personas.guest1, topic, language, subtopic.description),
      apiKey,
      model,
      'guest1'
    );
    segments.push({ speaker: personas.guest1.name, text: guest1Response, type: 'guest1' });

    // Guest 2 adds perspective
    segmentCount++;
    onProgress(segmentCount, totalSegments);
    
    const guest2Response = await generateIndividualResponse(
      INDIVIDUAL_RESPONSE_PROMPTS.guestResponse(subtopic.hostQuestions[0], personas.guest2, topic, language, subtopic.description),
      apiKey,
      model,
      'guest2'
    );
    segments.push({ speaker: personas.guest2.name, text: guest2Response, type: 'guest2' });
  }

  return segments;
}

async function generateDiscussionSection(
  topic: string,
  language: string,
  personas: PersonaCollection,
  topics: PodcastTopics,
  apiKey: string,
  model: string,
  onProgress: (segment: number, total: number) => void
): Promise<PodcastSegment[]> {
  const segments: PodcastSegment[] = [];
  const discussionTopics = topics.subtopics.filter(t => t.perspective !== 'neutral');
  
  if (discussionTopics.length === 0) {
    discussionTopics.push(...topics.subtopics);
  }

  let segmentCount = 0;
  const totalSegments = discussionTopics.length * 5; // More segments for detailed discussion

  for (const subtopic of discussionTopics) {
    // Host introduces topic and asks first question
    segmentCount++;
    onProgress(segmentCount, totalSegments);
    
    const hostIntro = await generateIndividualResponse(
      INDIVIDUAL_RESPONSE_PROMPTS.hostQuestion(subtopic.hostQuestions[0], personas.host, topic, language, subtopic.targetGuest),
      apiKey,
      model,
      'host'
    );
    segments.push({ speaker: personas.host.name, text: hostIntro, type: 'host' });

    // Primary guest responds (based on target)
    segmentCount++;
    onProgress(segmentCount, totalSegments);
    
    const primaryGuest = subtopic.targetGuest === 'guest2' ? personas.guest2 : personas.guest1;
    const primaryGuestType = subtopic.targetGuest === 'guest2' ? 'guest2' : 'guest1';
    
    const primaryResponse = await generateIndividualResponse(
      INDIVIDUAL_RESPONSE_PROMPTS.guestResponse(subtopic.hostQuestions[0], primaryGuest, topic, language, subtopic.description),
      apiKey,
      model,
      primaryGuestType
    );
    segments.push({ speaker: primaryGuest.name, text: primaryResponse, type: primaryGuestType });

    // Host asks follow-up or secondary guest responds
    if (subtopic.followUpQuestions.length > 0) {
      segmentCount++;
      onProgress(segmentCount, totalSegments);
      
      const followUp = await generateIndividualResponse(
        INDIVIDUAL_RESPONSE_PROMPTS.hostQuestion(subtopic.followUpQuestions[0], personas.host, topic, language),
        apiKey,
        model,
        'host'
      );
      segments.push({ speaker: personas.host.name, text: followUp, type: 'host' });
    }

    // Other guest provides alternative perspective
    segmentCount++;
    onProgress(segmentCount, totalSegments);
    
    const secondaryGuest = subtopic.targetGuest === 'guest2' ? personas.guest1 : personas.guest2;
    const secondaryGuestType = subtopic.targetGuest === 'guest2' ? 'guest1' : 'guest2';
    
    const alternativeResponse = await generateIndividualResponse(
      INDIVIDUAL_RESPONSE_PROMPTS.guestResponse(
        subtopic.followUpQuestions[0] || `What's your perspective on ${subtopic.title}?`, 
        secondaryGuest, 
        topic, 
        language, 
        subtopic.description
      ),
      apiKey,
      model,
      secondaryGuestType
    );
    segments.push({ speaker: secondaryGuest.name, text: alternativeResponse, type: secondaryGuestType });

    // Host transition to next topic (if not last)
    if (discussionTopics.indexOf(subtopic) < discussionTopics.length - 1) {
      segmentCount++;
      onProgress(segmentCount, totalSegments);
      
      const nextTopic = discussionTopics[discussionTopics.indexOf(subtopic) + 1];
      const transition = await generateIndividualResponse(
        INDIVIDUAL_RESPONSE_PROMPTS.hostTransition(subtopic.title, nextTopic.title, personas.host, language),
        apiKey,
        model,
        'host'
      );
      segments.push({ speaker: personas.host.name, text: transition, type: 'host' });
    }
  }

  return segments;
}

async function generateConclusionSection(
  topic: string,
  language: string,
  personas: PersonaCollection,
  topics: PodcastTopics,
  apiKey: string,
  model: string,
  onProgress: (segment: number, total: number) => void
): Promise<PodcastSegment[]> {
  const segments: PodcastSegment[] = [];
  const keyPoints = topics.subtopics.map(t => t.title);

  // 1. Host asks closing question to guest 1
  onProgress(1, 4);
  const hostClosingQ1 = await generateIndividualResponse(
    INDIVIDUAL_RESPONSE_PROMPTS.hostQuestion(topics.closingQuestions[0], personas.host, topic, language, 'guest1'),
    apiKey,
    model,
    'host'
  );
  segments.push({ speaker: personas.host.name, text: hostClosingQ1, type: 'host' });

  // 2. Guest 1 final thoughts
  onProgress(2, 4);
  const guest1Final = await generateIndividualResponse(
    INDIVIDUAL_RESPONSE_PROMPTS.guestFinalThoughts(topic, personas.guest1, keyPoints, language),
    apiKey,
    model,
    'guest1'
  );
  segments.push({ speaker: personas.guest1.name, text: guest1Final, type: 'guest1' });

  // 3. Guest 2 final thoughts
  onProgress(3, 4);
  const guest2Final = await generateIndividualResponse(
    INDIVIDUAL_RESPONSE_PROMPTS.guestFinalThoughts(topic, personas.guest2, keyPoints, language),
    apiKey,
    model,
    'guest2'
  );
  segments.push({ speaker: personas.guest2.name, text: guest2Final, type: 'guest2' });

  // 4. Host conclusion
  onProgress(4, 4);
  const hostConclusion = await generateIndividualResponse(
    INDIVIDUAL_RESPONSE_PROMPTS.hostSummary(topic, keyPoints, personas.host, language),
    apiKey,
    model,
    'host'
  );
  segments.push({ speaker: personas.host.name, text: hostConclusion, type: 'host' });

  return segments;
}

export async function generatePodcastScript(
  topic: string, 
  apiKey: string,
  setGenerationStage: (stage: GenerationStage, currentSegment?: number, totalSegments?: number) => void,
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

    // Generate sections individually with progress tracking
    setGenerationStage('generating-opening-responses');
    const openingSegments = await generateOpeningSection(
      topic, language, personas, topics, apiKey, models.scriptGeneration,
      (current, total) => setGenerationStage('generating-opening-responses', current, total)
    );

    setGenerationStage('generating-background-responses');
    const backgroundSegments = await generateBackgroundSection(
      topic, language, personas, topics, apiKey, models.scriptGeneration,
      (current, total) => setGenerationStage('generating-background-responses', current, total)
    );

    setGenerationStage('generating-discussion-responses');
    const discussionSegments = await generateDiscussionSection(
      topic, language, personas, topics, apiKey, models.scriptGeneration,
      (current, total) => setGenerationStage('generating-discussion-responses', current, total)
    );

    setGenerationStage('generating-conclusion-responses');
    const conclusionSegments = await generateConclusionSection(
      topic, language, personas, topics, apiKey, models.scriptGeneration,
      (current, total) => setGenerationStage('generating-conclusion-responses', current, total)
    );

    const segments = [
      ...openingSegments,
      ...backgroundSegments,
      ...discussionSegments,  
      ...conclusionSegments
    ];

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