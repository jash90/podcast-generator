export interface PodcastSegment {
  type: 'host' | 'guest1' | 'guest2';
  text: string;
}

export interface PodcastScript {
  title: string;
  segments: PodcastSegment[];
  language?: string;
}

export interface Persona {
  name: string;
  role: string;
  gender: 'male' | 'female';
  background: string;
  expertise: string[];
}