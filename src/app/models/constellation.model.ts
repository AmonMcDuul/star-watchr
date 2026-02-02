export interface Constellation {
  name: string;
  abbreviation: string;
  lines: ConstellationLine[];
}

export interface ConstellationLine {
  from: { ra: number; dec: number };
  to: { ra: number; dec: number };
}
