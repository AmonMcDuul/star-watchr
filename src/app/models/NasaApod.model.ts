export interface NasaApod {
    date: string;
    title: string;
    explanation: string;
    mediaType: 'image' | 'video';
    url: string;
    hdurl?: string;
    copyright?: string;
  }
  