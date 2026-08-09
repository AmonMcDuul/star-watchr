import { Injectable } from '@angular/core';
import { MessierObject } from '../models/messier.model';
import dsoEnrichment from '../../assets/data/generated/dso-enrichment.json';

export type DsoEnrichmentRecord = (typeof dsoEnrichment)[keyof typeof dsoEnrichment];

export interface DsoPageContent {
  summary: string;
  blocks: string[];
  conditions: string[];
  observing: string[];
  expectation: string[];
  facts: DsoEnrichmentRecord;
}

/** Stable, catalogue-led copy for the indexable part of every DSO page. */
@Injectable({ providedIn: 'root' })
export class DsoPageContentService {
  generate(dso: MessierObject): DsoPageContent {
    const id = `${dso.code}${dso.messierNumber}`.toLowerCase() as keyof typeof dsoEnrichment;
    const facts = dsoEnrichment[id];

    return {
      blocks: [],
      conditions: [],
      summary: facts.overview,
      observing: [facts.observingGuide, this.equipmentAdvice(dso)],
      expectation: [facts.scienceContext, facts.imagingGuide],
      facts,
    };
  }

  seoDescription(dso: MessierObject): string {
    const id = `${dso.code}${dso.messierNumber}`.toLowerCase() as keyof typeof dsoEnrichment;
    const facts = dsoEnrichment[id];
    return `${dso.name} (${dso.code}${dso.messierNumber}) is a ${dso.type.toLowerCase()} in ${dso.constellation}. ` +
      `Magnitude ${dso.magnitude ?? 'not listed'}; best placed around ${facts.visibility.bestViewingMonth}, with sourced data and live altitude.`;
  }

  private distanceText(distance: number | null | undefined): string {
    return distance == null
      ? 'no catalogue distance listed'
      : `an estimated distance of ${distance.toLocaleString()} light-years`;
  }

  private observingAdvice(dso: MessierObject): string {
    const type = dso.type.toLowerCase();
    if (type.includes('galaxy')) return 'For galaxies, prioritize a moonless, transparent night and low-to-medium magnification; light pollution quickly removes faint outer structure.';
    if (type.includes('nebula')) return 'For nebulae, start at low magnification with a dark-adapted eye; an appropriate nebula filter can improve contrast for emission nebulae.';
    if (type.includes('cluster')) return 'For star clusters, begin with a wide field to frame the object, then increase magnification only if it improves separation or contrast.';
    return 'Use a dark site, allow time for dark adaptation, and start at low magnification to locate the object against its surrounding star field.';
  }

  private equipmentAdvice(dso: MessierObject): string {
    if (dso.magnitude <= 6) return 'Its brightness makes it a practical binocular or small-telescope candidate when it is well above the horizon.';
    if (dso.magnitude >= 9) return 'Because it is faint, use a larger aperture where possible, avoid bright Moon conditions, and use averted vision.';
    return 'A small telescope under reasonably dark skies is a good starting point; use the live altitude chart to choose its highest point.';
  }

  private visualExpectation(dso: MessierObject): string {
    const type = dso.type.toLowerCase();
    if (type.includes('galaxy')) return 'Visually, expect a diffuse glow first; spiral arms and other subtle features need excellent sky contrast and aperture.';
    if (type.includes('nebula')) return 'Visually, expect contrast and shape to change noticeably with sky darkness, magnification, and filter choice.';
    if (type.includes('globular')) return 'Visually, expect a concentrated glow at low power; additional aperture and magnification can begin to resolve stars around the edge.';
    return 'Visual detail depends on sky darkness, transparency, aperture, and how high the object is above the horizon.';
  }
}
