import caldwellCatalog from '../../assets/data/caldwell.json';
import messierCatalog from '../../assets/data/messier.json';

export interface Dso {
  id: string;
  code: string;
  messierNumber: number;
  name: string;
  constellation: string;
  magnitude: number;
  image: string;
  description?: string;
  viewingSeason: string;
}

const caldwell = caldwellCatalog.data.map((d: any) => ({
  ...d,
  id: `c${d.messierNumber}`
}));

const messier = Object.entries(messierCatalog.data).map(([key, d]: any) => ({
  ...d,
  id: key.toLowerCase()
}));

export const DSO_CATALOG: Dso[] = [
  ...messier,
  ...caldwell
];