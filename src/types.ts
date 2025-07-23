export interface PodcastSegment {
  speaker: string;
  text: string;
  type: 'host' | 'guest1' | 'guest2';
}

export interface PersonaDetail {
  name: string;
  gender: 'male' | 'female';
  ageRange: string;
  personality: string[];
  background: string;
  expertise: string[];
  voiceCharacteristics: {
    tone: 'warm' | 'authoritative' | 'friendly' | 'professional' | 'energetic' | 'calm';
    style: 'conversational' | 'formal' | 'casual' | 'academic' | 'journalistic';
    pace: 'slow' | 'moderate' | 'fast';
  };
}

export interface PersonaCollection {
  host: PersonaDetail;
  guest1: PersonaDetail;
  guest2: PersonaDetail;
}

export interface PodcastScript {
  segments: PodcastSegment[];
  language?: string;
  personaGenders?: Record<string, boolean>; // Keep for backward compatibility
  personas?: PersonaCollection; // New detailed persona information
}