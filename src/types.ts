export interface PodcastSegment {
  speaker: string;
  text: string;
}

export interface PodcastScript {
  segments: PodcastSegment[];
}