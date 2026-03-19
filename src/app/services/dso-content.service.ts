import { Injectable } from '@angular/core';
import { MessierObject } from '../models/messier.model';

export interface AltitudePoint {
  time: Date;
  altitude: number;
}

export interface ContentContext {
  lat: number;
  lon: number;
  date: Date;
  altitudeSeries: AltitudePoint[];
}

export interface DsoContent {
  blocks: string[];
  seoDescription: string;

  summary?: string;
  conditions?: string[];
  observing?: string[];
  expectation?: string[];
}

interface AltitudeAnalysis {
  maxAlt: number;
  bestTime: string;
  visibleHours: number;
  isVisibleNow: boolean;
  currentAlt: number;
}

@Injectable({ providedIn: 'root' })
export class DsoContentService {
  // -------------------------
  // CONFIG (variability control)
  // -------------------------

  private variability = {
    includeExperience: 0.7,
    includeSkill: 0.6,
    includeComparison: 0.5,
    mergeSentences: 0.4,
    shortVariant: 0.3,
  };

  // -------------------------
  // WEIGHTED PICK
  // -------------------------

  private weightedPick(items: { value: string; weight: number }[]): string {
    const total = items.reduce((sum, i) => sum + i.weight, 0);
    let rand = Math.random() * total;

    for (const item of items) {
      if (rand < item.weight) return item.value;
      rand -= item.weight;
    }

    return items[0].value;
  }

  private maybe(prob: number): boolean {
    return Math.random() < prob;
  }

  // -------------------------
  // PHRASES
  // -------------------------

  private openings = [
    { value: 'is a rewarding deep-sky target', weight: 3 },
    { value: 'stands out as a well-known observing object', weight: 2 },
    { value: 'is frequently observed by amateur astronomers', weight: 2 },
    { value: 'offers a subtle but interesting view', weight: 1 },
  ];

  private visuals = [
    { value: 'appears as a soft glow', weight: 3 },
    { value: 'shows up as a faint patch of light', weight: 2 },
    { value: 'presents itself as a diffuse object', weight: 2 },
    { value: 'is visible as a compact luminous region', weight: 1 },
  ];

  private experience = [
    'In small telescopes it remains mostly unresolved.',
    'With larger apertures, more structure becomes visible.',
    'At higher magnification, subtle detail can be detected.',
    'Under good conditions, the object reveals more character.',
  ];

  private skillEasy = [
    'This makes it a good target for beginners.',
    'It is often recommended as an entry-level object.',
    'It can be observed without much difficulty.',
  ];

  private skillHard = [
    'This object is better suited for experienced observers.',
    'It requires patience and good conditions.',
    'It can be challenging under typical skies.',
  ];

  private comparisons = [
    'It is more subtle than brighter Dso objects.',
    'It offers less structure than some of the brightest galaxies.',
    'It appears more compact than typical clusters.',
    'It is less prominent than the brightest objects in the catalog.',
  ];

  private contrast = [
    'fine detail requires darker skies',
    'contrast improves away from light pollution',
    'subtle features are easily lost in bright skies',
    'structure becomes clearer under good conditions',
  ];

  // -------------------------
  // MAIN GENERATOR
  // -------------------------

  generate(dso: MessierObject, ctx: ContentContext): DsoContent {
    const a = this.analyze(ctx.altitudeSeries, ctx.date);

    const blocks: string[] = [];

    // INTRO
    blocks.push(this.buildIntro(dso));

    // VISIBILITY
    blocks.push(this.buildVisibility(a));

    // TIMING
    if (this.maybe(0.8)) {
      blocks.push(this.buildTiming(a));
    }

    // CONDITIONS
    if (this.maybe(0.9)) {
      blocks.push(this.buildConditions(dso));
    }

    // EXPERIENCE (conditional)
    if (this.maybe(this.variability.includeExperience)) {
      blocks.push(this.pick(this.experience));
    }

    // SKILL (conditional + based on magnitude)
    if (this.maybe(this.variability.includeSkill)) {
      if (dso.magnitude < 6) {
        blocks.push(this.pick(this.skillEasy));
      } else {
        blocks.push(this.pick(this.skillHard));
      }
    }

    // COMPARISON (conditional)
    if (this.maybe(this.variability.includeComparison)) {
      blocks.push(this.pick(this.comparisons));
    }

    const summary = this.buildIntro(dso);

    const conditions: string[] = [];
    const observing: string[] = [];
    const expectation: string[] = [];

    // visibility → conditions
    conditions.push(this.buildVisibility(a));

    if (this.maybe(0.8)) {
      conditions.push(this.buildTiming(a));
    }

    if (this.maybe(0.9)) {
      conditions.push(this.buildConditions(dso));
    }

    // observing tips
    if (this.maybe(this.variability.includeSkill)) {
      if (dso.magnitude < 6) {
        observing.push(this.pick(this.skillEasy));
      } else {
        observing.push(this.pick(this.skillHard));
      }
    }

    // expectation / experience
    if (this.maybe(this.variability.includeExperience)) {
      expectation.push(this.pick(this.experience));
    }

    if (this.maybe(this.variability.includeComparison)) {
      expectation.push(this.pick(this.comparisons));
    }

    // fallback blocks (oude gedrag)
    const finalBlocks = this.postProcess([summary, ...conditions, ...observing, ...expectation]);

    return {
      blocks: finalBlocks,
      summary,
      conditions,
      observing,
      expectation,
      seoDescription: `${summary} ${conditions[0] ?? ''}`,
    };
  }

  // -------------------------
  // BUILDERS
  // -------------------------

  private buildIntro(dso: MessierObject): string {
    const opening = this.weightedPick(this.openings);
    const visual = this.weightedPick(this.visuals);

    const brightness =
      dso.magnitude < 6
        ? 'It is relatively bright.'
        : dso.magnitude > 9
          ? 'It is quite faint.'
          : 'It has moderate brightness.';

    return `${dso.name} ${opening} and ${visual}. ${brightness}`;
  }

  private buildVisibility(a: AltitudeAnalysis): string {
    if (!a.isVisibleNow) {
      return `It is currently below the horizon.`;
    }

    return `Right now it is at about ${Math.round(a.currentAlt)}° altitude and reaches ${Math.round(a.maxAlt)}° around ${a.bestTime}.`;
  }

  private buildTiming(a: AltitudeAnalysis): string {
    if (!a.visibleHours) {
      return `It does not reach a useful observing altitude today.`;
    }

    return `It stays above 30° for roughly ${a.visibleHours} hours.`;
  }

  private buildConditions(dso: MessierObject): string {
    const type = dso.type.toLowerCase();

    if (type.includes('galaxy')) {
      return `Galaxies are sensitive to light pollution, ${this.pick(this.contrast)}.`;
    }

    if (type.includes('nebula')) {
      return `Nebulae benefit from filters, ${this.pick(this.contrast)}.`;
    }

    return `Observing conditions matter, ${this.pick(this.contrast)}.`;
  }

  // -------------------------
  // ALTITUDE ANALYSIS
  // -------------------------

  private analyze(series: AltitudePoint[], now: Date): AltitudeAnalysis {
    let maxAlt = -Infinity;
    let bestTime = '';
    let visibleHours = 0;

    let currentAlt = 0;
    let closestDiff = Infinity;

    for (const p of series) {
      if (p.altitude > maxAlt) {
        maxAlt = p.altitude;
        bestTime = this.formatTime(p.time);
      }

      if (p.altitude > 30) visibleHours++;

      const diff = Math.abs(p.time.getTime() - now.getTime());
      if (diff < closestDiff) {
        closestDiff = diff;
        currentAlt = p.altitude;
      }
    }

    return {
      maxAlt,
      bestTime,
      visibleHours,
      isVisibleNow: currentAlt > 0,
      currentAlt,
    };
  }

  // -------------------------
  // POST PROCESS (structure variation)
  // -------------------------

  private postProcess(blocks: string[]): string[] {
    let result = [...blocks];

    // random shuffle (structure variation)
    result = result.sort(() => Math.random() - 0.5);

    // merge sentences sometimes
    if (this.maybe(this.variability.mergeSentences) && result.length > 2) {
      result[0] = `${result[0]} ${result[1]}`;
      result.splice(1, 1);
    }

    // short variant
    if (this.maybe(this.variability.shortVariant)) {
      result = result.slice(0, Math.max(2, Math.floor(result.length * 0.7)));
    }

    return result;
  }

  // -------------------------
  // UTILS
  // -------------------------

  private pick(arr: string[]) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  private formatTime(date: Date): string {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  // SEO
  generateSeoDescription(dso: MessierObject, ctx: ContentContext): string {
    const a = this.analyze(ctx.altitudeSeries, ctx.date);

    const visibleNow = a.isVisibleNow
      ? `currently visible at ${Math.round(a.currentAlt)}°`
      : `currently below the horizon`;

    const peak = a.bestTime ? `reaches ${Math.round(a.maxAlt)}° around ${a.bestTime}` : '';

    return (
      `${dso.name} (${dso.code}${dso.messierNumber}) is a ${dso.type.toLowerCase()} in ${dso.constellation}. ` +
      `From your location it is ${visibleNow} and ${peak}. ` +
      `Best observed for about ${a.visibleHours} hours above 30° altitude.`
    );
  }
}
