export interface MessierObject {
  messierNumber: number;
  name: string;
  alternateNames?: string[];
  NGC?: string;
  type: string;
  constellation: string;
  rightAscension: string;
  declination: string;
  magnitude: number;
  size: string;
  distance: number;
  viewingSeason: 'Winter' | 'Spring' | 'Summer' | 'Autumn';
  viewingDifficulty?: 'Easy' | 'Moderate' | 'Hard' | 'Very Easy' | 'Very Hard';
  image: string;
}

export interface MessierJson {
  info: any;
  data: Record<string, MessierObject>;
}
