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
}

interface AltitudeAnalysis {
  maxAlt: number;
  bestTime: string;
  visibleHours: number;
  isVisibleNow: boolean;
  currentAlt: number;
}

/**
 * Builds page content for a deep-sky object.
 *
 * The descriptive "about" text comes from MessierObject.summary — a fixed,
 * fact-checked description written per object (see messier.json / caldwell.json).
 * Everything else here is derived deterministically from real numbers
 * (altitude, magnitude, distance) for the given location/time — nothing is
 * randomised, so the same input always produces the same output and the
 * static/prerendered page content doesn't churn between builds.
 */
@Injectable({ providedIn: 'root' })
export class DsoContentService {

  generate(dso: MessierObject, ctx: ContentContext): DsoContent {
    const a = this.analyze(ctx.altitudeSeries, ctx.date);

    const summary = dso.summary?.trim() || this.fallbackSummary(dso);

    const visibility = this.buildVisibility(a);
    const timing = this.buildTiming(a);
    const conditions: string[] = [visibility, timing];

    const blocks: string[] = [summary, ...conditions];

    return {
      blocks,
      summary,
      conditions,
      seoDescription: `${summary} ${visibility}`,
    };
  }

  // -------------------------
  // FALLBACK (only used if an object is somehow missing a summary)
  // -------------------------

  private fallbackSummary(dso: MessierObject): string {
    const type = dso.type.toLowerCase();
    const distancePart = dso.distance
      ? ` roughly ${dso.distance.toLocaleString()} light-years away`
      : '';

    return (
      `${dso.name} (${dso.code}${dso.messierNumber}) is a ${type} in the constellation ` +
      `${dso.constellation},${distancePart}, with an apparent magnitude of ${dso.magnitude}.`
    );
  }

  // -------------------------
  // LIVE / LOCATION-DEPENDENT TEXT
  // -------------------------

  private buildVisibility(a: AltitudeAnalysis): string {
    if (!a.isVisibleNow) {
      return `It is currently below the horizon from your location.`;
    }

    return `Right now it is at about ${Math.round(a.currentAlt)}° altitude and reaches ${Math.round(a.maxAlt)}° around ${a.bestTime}.`;
  }

  private buildTiming(a: AltitudeAnalysis): string {
    if (!a.visibleHours) {
      return `It does not reach a useful observing altitude today from your location.`;
    }

    return `It stays above 30° for roughly ${a.visibleHours} hours.`;
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

    if (series.length < 2) {
      return {
        maxAlt: 0,
        bestTime: '',
        visibleHours: 0,
        isVisibleNow: false,
        currentAlt: 0,
      };
    }

    const intervalMs = series[1].time.getTime() - series[0].time.getTime();
    const intervalHours = intervalMs / (1000 * 60 * 60);

    for (const p of series) {
      if (p.altitude > maxAlt) {
        maxAlt = p.altitude;
        bestTime = this.formatTime(p.time);
      }

      if (p.altitude > 30) {
        visibleHours += intervalHours;
      }

      const diff = Math.abs(p.time.getTime() - now.getTime());
      if (diff < closestDiff) {
        closestDiff = diff;
        currentAlt = p.altitude;
      }
    }

    return {
      maxAlt,
      bestTime,
      visibleHours: Math.round(visibleHours),
      isVisibleNow: currentAlt > 0,
      currentAlt,
    };
  }

  private formatTime(date: Date): string {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  // -------------------------
  // SEO
  // -------------------------

  generateSeoDescription(dso: MessierObject, ctx: ContentContext): string {
    const a = this.analyze(ctx.altitudeSeries, ctx.date);
    const summary = dso.summary?.trim() || this.fallbackSummary(dso);

    const visibleNow = a.isVisibleNow
      ? `currently visible at about ${Math.round(a.currentAlt)}°`
      : `currently below the horizon`;

    // Keep the meta description within a sane length for search snippets.
    const firstSentence = summary.split(/(?<=[.!?])\s/)[0];

    return `${firstSentence} From your location it is ${visibleNow}.`;
  }
}
