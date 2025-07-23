export interface PodcastSegment {
  speaker: string;
  text: string;
  type: 'host' | 'guest1' | 'guest2';
}

export interface PodcastScript {
  segments: PodcastSegment[];
  language?: string;
  personaGenders?: Record<string, boolean>;
}