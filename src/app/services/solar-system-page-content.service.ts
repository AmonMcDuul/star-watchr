import { Injectable } from '@angular/core';
import { SolarSystemBody } from '../models/solar-system/solar-system-body.model';
import solarSystemEnrichment from '../../assets/data/generated/solar-system-enrichment.json';

export type SolarSystemEnrichmentRecord =
  (typeof solarSystemEnrichment)[keyof typeof solarSystemEnrichment];

@Injectable({ providedIn: 'root' })
export class SolarSystemPageContentService {
  get(body: SolarSystemBody): SolarSystemEnrichmentRecord | null {
    const key = `${body.type}:${body.id}` as keyof typeof solarSystemEnrichment;
    return solarSystemEnrichment[key] ?? null;
  }
}
