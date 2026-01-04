import { AstroDataPoint } from "./astro-data-point-model";

export interface AstroWeatherResponse {
    product: 'astro';
    init: string;
    dataseries: AstroDataPoint[];
  }