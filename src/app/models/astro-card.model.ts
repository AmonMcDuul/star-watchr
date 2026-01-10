export interface AstroCard {
  timepoint: number;
  time: Date;

  score: number;

  cloudLabel: string;
  cloudcover: number;
  seeing: number;
  transparency: number;

  temperature: number;
  windDir: string;
  windSpeed: number;
}
