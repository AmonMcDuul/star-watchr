import {
  Component,
  ElementRef,
  Input,
  ViewChild,
  AfterViewInit,
  OnChanges,
  SimpleChanges,
  inject,
  NgZone,
  OnDestroy
} from '@angular/core';

import * as d3 from 'd3';
import { StarCatalogService } from '../../services/star-catalog.service';
import { Star } from '../../models/star.model';
import { Constellation } from '../../models/constellation.model';
import { MessierService } from '../../services/messier.service';

@Component({
  selector: 'app-starhop-map',
  templateUrl: './starhop-map.component.html',
  styleUrls: ['./starhop-map.component.scss']
})
export class StarhopMapComponent
  implements AfterViewInit, OnChanges, OnDestroy {

  @ViewChild('svg') svgRef!: ElementRef<SVGSVGElement>;
  @ViewChild('tooltip') tooltipRef!: ElementRef<HTMLDivElement>;

  @Input() ra!: number;          // centrum rechte klimming (graden)
  @Input() dec!: number;          // centrum declinatie (graden)

  public starCatalog = inject(StarCatalogService);
  private catalog = inject(StarCatalogService);
  private zone = inject(NgZone);
  private messier = inject(MessierService);

  // UI-instellingen
  showMessier = true;
  showFov = true;
  fovArcMin = 60;
  showNames = false;
  showConstellations = true;
  showGrid = true;
  mirrored = true;
  rotationAngle = 0;
  lockNorthUp = false;

  // Gezichtsveldradius (graden)
  private readonly radiusDeg = 30;

  private ready = false;

  // D3‑selecties
  private svg!: d3.Selection<SVGSVGElement, unknown, null, undefined>;
  private root!: d3.Selection<SVGGElement, unknown, null, undefined>;
  private zoomLayer!: d3.Selection<SVGGElement, unknown, null, undefined>;
  private rotateLayer!: d3.Selection<SVGGElement, unknown, null, undefined>;
  private labelLayer!: d3.Selection<SVGGElement, unknown, null, undefined>;
  private overlayLayer!: d3.Selection<SVGGElement, unknown, null, undefined>;

  private resizeObserver!: ResizeObserver;
  private raf = 0;

  // Projectie (wordt opnieuw aangemaakt bij render)
  private projection: any;

  ngAfterViewInit() {
    this.ready = true;
    this.starCatalog.setStarDensity('normal');
    this.initSvg();
    this.initResizeObserver();
    this.tryRender();
  }

  ngOnDestroy() {
    this.resizeObserver?.disconnect();
    cancelAnimationFrame(this.raf);
  }

  ngOnChanges(_: SimpleChanges) {
    if (this.lockNorthUp) this.rotationAngle = 0;
    this.tryRender();
  }

  private async tryRender() {
    if (!this.ready) return;
    if (!Number.isFinite(this.ra) || !Number.isFinite(this.dec)) return;

    await this.catalog.load();
    await this.messier.load();
    this.render();
  }

  // ---------------- INIT ----------------

  private initSvg() {
    const svgEl = this.svgRef.nativeElement;
    svgEl.style.touchAction = 'none';

    this.svg = d3.select(svgEl);

    this.root = this.svg.append('g');
    this.zoomLayer = this.root.append('g');

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 8])
      .on('zoom', (e) => {
        const k = e.transform.k;
        this.zoomLayer.attr('transform', e.transform.toString());
        
        this.labelLayer.selectAll<SVGTextElement, unknown>('text')
          .attr('font-size', function(this: SVGTextElement) {
            const element = d3.select(this);
            const className = element.attr('class');
            
            if (className?.includes('star-label')) return `${11 / k}px`;
            if (className?.includes('constellation-name')) return `${12 / k}px`;
            if (className?.includes('messier-label')) return `${11 / k}px`;
            return `${11 / k}px`;
          })
          .attr('opacity', Math.min(1, Math.max(0.3, k / 2)));
      });

    this.svg.call(zoom as any);
  }

  private initResizeObserver() {
    this.resizeObserver = new ResizeObserver(() => {
      cancelAnimationFrame(this.raf);
      this.raf = requestAnimationFrame(() => {
        this.zone.run(() => this.render());
      });
    });
    this.resizeObserver.observe(this.svgRef.nativeElement.parentElement!);
  }

  // ---------------- RENDER ----------------

  private render() {
    const el = this.svgRef.nativeElement;
    const rect = el.getBoundingClientRect();

    const width = Math.max(300, rect.width);
    const height = Math.max(300, rect.height);

    this.svg.attr('viewBox', `0 0 ${width} ${height}`);
    this.root.attr('transform', `translate(${width / 2},${height / 2})`);

    // Projectie opnieuw aanmaken, gecentreerd op (ra, dec)
    this.projection = d3.geoStereographic()
      .center([this.ra, this.dec])
      .translate([0, 0])
      .scale(width / (2 * this.radiusDeg) * 180 / Math.PI);

    // Lagen leegmaken
    this.zoomLayer.selectAll('*').remove();

    this.rotateLayer = this.zoomLayer.append('g');
    this.labelLayer = this.zoomLayer.append('g');
    this.overlayLayer = this.zoomLayer.append('g');

    // Data ophalen
    const visibleRadius = this.radiusDeg * 1.6;

    const stars = this.catalog.getStarsNear(this.ra, this.dec, visibleRadius);
    const constellations = this.catalog.getConstellationsInView(this.ra, this.dec, visibleRadius);
    const messiers = this.messier.all();

    // Raster
    if (this.showGrid) {
      this.drawGrid(width, height);
    }

    // Sterren
    this.drawStars(stars);

    // Sterrennamen (alleen als showNames aan staat)
    if (this.showNames) {
      this.drawStarLabels(stars);
    }

    // Constellatielijnen en -namen
    if (this.showConstellations) {
      this.drawConstellations(constellations);
    }

    // Messier‑objecten (binnen de radius)
    if (this.showMessier) {
      this.drawMessier(messiers);
    }

    // Gezichtsveld van telescoop
    if (this.showFov) {
      this.drawTelescopeFov(width);
    }

    // Legenda
    this.drawMagnitudeLegend(width, height);

    // Transformatie voor rotatie/spiegeling (alleen voor symbolen en lijnen)
    this.applyViewTransform();
  }

  // ---------------- PROJECTIEHULP ----------------

  private project(ra: number, dec: number): [number, number] {
    return this.projection([ra, dec]) || [0, 0];
  }

  // ---------------- TRANSFORMATIE (voor symbolen) ----------------

  private applyViewTransform() {
    let transform = '';
    if (this.mirrored) transform += ' scale(-1,1)';
    if (this.rotationAngle !== 0) transform += ` rotate(${this.rotationAngle})`;
    this.rotateLayer.attr('transform', transform);
    // labelLayer blijft ongetransformeerd; we plaatsen labels handmatig via transformPoint
  }

  // ---------------- HANDMATIGE POSITIEBEREKENING (voor labels) ----------------

  private transformPoint(x: number, y: number): [number, number] {
    let xp = x;
    let yp = y;
    if (this.mirrored) {
      xp = -xp;
    }
    if (this.rotationAngle !== 0) {
      const rad = this.rotationAngle * Math.PI / 180;
      const xr = xp * Math.cos(rad) - yp * Math.sin(rad);
      const yr = xp * Math.sin(rad) + yp * Math.cos(rad);
      xp = xr;
      yp = yr;
    }
    return [xp, yp];
  }

  // ---------------- STERREN ----------------

  private drawStars(stars: Star[]) {
    const nodes = this.rotateLayer.selectAll('circle.star')
      .data(stars)
      .enter()
      .append('circle')
      .attr('class', 'star')
      .attr('cx', d => this.project(d.ra, d.dec)[0])
      .attr('cy', d => this.project(d.ra, d.dec)[1])
      .attr('r', d => this.starSize(d.mag))
      .attr('fill', d => this.starColor(d))
      .attr('opacity', d => this.starOpacity(d))
      .attr('data-name', d => d.name || '');

    nodes.transition()
      .duration(2000 + Math.random() * 3000)
      .ease(d3.easeSinInOut)
      .attr('opacity', d => this.starOpacity(d) * 1.2)
      .transition()
      .duration(2000)
      .attr('opacity', d => this.starOpacity(d));

    nodes.on('pointerenter', (e, d) => this.showStarTooltip(e, d))
         .on('pointerleave', () => this.hideTooltip());
  }

  private starSize(mag: number): number {
    const base = Math.max(0.8, 2.5 * (6.5 - Math.min(mag, 6.5)));
    const factor = this.getSizeFactor();
    return Math.min(8, base * factor);
  }

  private starColor(star: Star): string {
    if (star.mag < 1) return '#ffffcc';
    if (star.mag < 3) return '#ffe8a0';
    return '#a0a8cc';
  }

  private starOpacity(star: Star): number {
    return Math.max(0.4, 1 - (star.mag - 1) * 0.1);
  }

  // ---------------- STERLABELS (handmatige transformatie) ----------------

  private drawStarLabels(stars: Star[]) {
    const labels = stars.filter(s => s.mag < 4 && s.name);
    labels.forEach(s => {
      const [px, py] = this.project(s.ra, s.dec);
      const [tx, ty] = this.transformPoint(px + 6, py - 6); // offset in originele ruimte
      this.labelLayer.append('text')
        .attr('class', 'star-label')
        .attr('x', tx)
        .attr('y', ty)
        .attr('fill', '#ffcc66')
        .attr('font-size', '11px')
        .attr('dominant-baseline', 'middle')
        .attr('text-anchor', 'start')
        .style('pointer-events', 'none')
        .text(s.name!);
    });
  }

  // ---------------- CONSTELLATIES ----------------

  private drawConstellations(list: Constellation[]) {
    // Lijnen (in rotateLayer, worden getransformeerd)
    const lineLayer = this.rotateLayer.append('g').attr('class', 'constellation-lines');
    list.forEach(c => {
      c.lines.forEach(l => {
        const from = this.project(l.from.ra, l.from.dec);
        const to = this.project(l.to.ra, l.to.dec);
        lineLayer.append('line')
          .attr('x1', from[0])
          .attr('y1', from[1])
          .attr('x2', to[0])
          .attr('y2', to[1])
          .attr('stroke', '#64a0ff')
          .attr('stroke-width', 1.4)
          .attr('stroke-opacity', 0.8)
          .attr('stroke-linecap', 'round');
      });
    });

    // Namen (handmatige transformatie)
    list.forEach(c => {
      const points: [number, number][] = [];
      c.lines.forEach(l => {
        points.push(this.project(l.from.ra, l.from.dec));
        points.push(this.project(l.to.ra, l.to.dec));
      });
      if (points.length === 0) return;
      const sum = points.reduce((acc, p) => [acc[0] + p[0], acc[1] + p[1]], [0, 0]);
      const center: [number, number] = [sum[0] / points.length, sum[1] / points.length];
      const [tx, ty] = this.transformPoint(center[0], center[1] - 8);
      this.labelLayer.append('text')
        .attr('class', 'constellation-name')
        .attr('x', tx)
        .attr('y', ty)
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'middle')
        .attr('fill', '#64a0ff')
        .attr('font-size', '12px')
        .attr('paint-order', 'stroke')
        .attr('stroke', 'rgba(0,0,0,.7)')
        .attr('stroke-width', 3)
        .style('pointer-events', 'none')
        .text(c.name);
    });
  }

  // ---------------- MESSIER OBJECTEN ----------------

  private drawMessier(list: any[]) {
    // Filter op afstand
    const filtered = list.filter(m => {
      const ra = this.raToDeg(m.rightAscension);
      const dec = this.decToDeg(m.declination);
      const distance = this.angularDistance(this.ra, this.dec, ra, dec);
      return distance <= this.radiusDeg * 1.2;
    });

    // Symbolen (in rotateLayer, worden getransformeerd)
    const messierLayer = this.rotateLayer.append('g').attr('class', 'messier-layer');
    filtered.forEach(m => {
      const ra = this.raToDeg(m.rightAscension);
      const dec = this.decToDeg(m.declination);
      const pos = this.project(ra, dec);
      if (Math.abs(pos[0]) > 1000 || Math.abs(pos[1]) > 1000) return;

      const g = messierLayer.append('g')
        .attr('transform', `translate(${pos[0]},${pos[1]})`);
      g.append('path')
        .attr('d', this.messierSymbol(m.type))
        .attr('fill', 'none')
        .attr('stroke', '#00ffaa')
        .attr('stroke-width', 1.4);

      // Tooltip
      g.on('pointerenter', (e) => {
        const el = this.tooltipRef.nativeElement;
        el.innerHTML = `
          <strong>M${m.messierNumber} — ${m.name}</strong><br>
          ${m.type}<br>
          Mag ${m.magnitude}
        `;
        el.style.display = 'block';
        el.style.left = e.clientX + 12 + 'px';
        el.style.top = e.clientY - 24 + 'px';
      }).on('pointerleave', () => this.hideTooltip());
    });

    // Labels (handmatige transformatie)
    filtered.forEach(m => {
      const ra = this.raToDeg(m.rightAscension);
      const dec = this.decToDeg(m.declination);
      const pos = this.project(ra, dec);
      if (Math.abs(pos[0]) > 1000 || Math.abs(pos[1]) > 1000) return;
      const [tx, ty] = this.transformPoint(pos[0], pos[1] - 10);
      this.labelLayer.append('text')
        .attr('class', 'messier-label')
        .attr('x', tx)
        .attr('y', ty)
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'middle')
        .attr('fill', '#00ffaa')
        .attr('font-size', '11px')
        .attr('paint-order', 'stroke')
        .attr('stroke', 'rgba(0,0,0,.7)')
        .attr('stroke-width', 3)
        .style('pointer-events', 'none')
        .text(`M${m.messierNumber}`);
    });
  }

  private messierSymbol(type: string | null): string {
    const t = (type ?? '').toLowerCase();
    const size = 70;
    switch (t) {
      case 'spiral galaxy':
      case 'elliptical galaxy':
      case 'irregular galaxy':
        return d3.symbol().type(d3.symbolDiamond2).size(size)()!;
      case 'globular cluster':
        return d3.symbol().type(d3.symbolCircle).size(size)()!;
      case 'open cluster':
        return d3.symbol().type(d3.symbolTriangle).size(size)()!;
      case 'planetary nebula':
        return d3.symbol().type(d3.symbolDiamond).size(size)()!;
      default:
        return d3.symbol().type(d3.symbolSquare).size(size)()!;
    }
  }

  // ---------------- HULPMIDDELEN ----------------

  private raToDeg(ra: string): number {
    const parts = ra.split(':').map(Number);
    return (parts[0] + parts[1] / 60 + parts[2] / 3600) * 15;
  }

  private decToDeg(dec: string): number {
    const sign = dec.startsWith('-') ? -1 : 1;
    const parts = dec.replace(/[+-]/, '').split(':').map(Number);
    return sign * (parts[0] + parts[1] / 60 + parts[2] / 3600);
  }

  private angularDistance(ra1: number, dec1: number, ra2: number, dec2: number): number {
    const dRA = (ra1 - ra2) * Math.PI / 180;
    const dDec = (dec1 - dec2) * Math.PI / 180;
    const a = Math.sin(dDec / 2) ** 2 +
              Math.cos(dec1 * Math.PI / 180) * Math.cos(dec2 * Math.PI / 180) *
              Math.sin(dRA / 2) ** 2;
    return 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 180 / Math.PI;
  }

  // ---------------- RASTER ----------------

  private drawGrid(width: number, height: number) {
    const step = 5; // graden
    const lines: [number, number][][] = [];

    for (let ra = 0; ra < 360; ra += step) {
      const points: [number, number][] = [];
      for (let dec = -90; dec <= 90; dec += 2) {
        points.push(this.project(ra, dec));
      }
      lines.push(points);
    }

    for (let dec = -80; dec <= 80; dec += step) {
      const points: [number, number][] = [];
      for (let ra = 0; ra <= 360; ra += 2) {
        points.push(this.project(ra, dec));
      }
      lines.push(points);
    }

    const gridGroup = this.overlayLayer.append('g').attr('class', 'grid');
    lines.forEach(points => {
      const line = d3.line().x(d => d[0]).y(d => d[1]);
      gridGroup.append('path')
        .attr('d', line(points as any))
        .attr('stroke', 'rgba(255,255,255,0.05)')
        .attr('fill', 'none');
    });
  }

  // ---------------- GEZICHTSVELD ----------------

  private drawTelescopeFov(width: number) {
    const scale = width / (2 * this.radiusDeg);
    const radiusPx = (this.fovArcMin / 60) * scale;
    this.rotateLayer.append('circle')
      .attr('r', radiusPx)
      .attr('fill', 'none')
      .attr('stroke', '#ffcc00')
      .attr('stroke-width', 1.4)
      .attr('stroke-dasharray', '6 4');
  }

  // ---------------- LEGENDA ----------------

  private drawMagnitudeLegend(width: number, height: number) {
    const g = this.overlayLayer.append('g')
      .attr('transform', `translate(${width/2 - 120},${-height/2 + 30})`);

    [1, 3, 5].forEach((mag, i) => {
      g.append('circle')
        .attr('cx', 0)
        .attr('cy', i * 18)
        .attr('r', this.starSize(mag) * 0.8)
        .attr('fill', '#ffe8a0');

      g.append('text')
        .attr('x', 10)
        .attr('y', i * 18 + 4)
        .attr('fill', '#ccc')
        .attr('font-size', '10px')
        .text(`Mag ${mag}`);
    });
  }

  // ---------------- LABEL DOORZICHTIGHEID BIJ ZOOM ----------------

  private updateLabelOpacity(scale: number) {
    this.labelLayer.selectAll('text')
      .attr('opacity', Math.min(1, Math.max(0.3, scale / 2)));
  }

  // ---------------- TOOLTIP ----------------

  private showStarTooltip(e: PointerEvent, s: Star) {
    const el = this.tooltipRef.nativeElement;
    el.innerHTML = `
      <strong>${s.name ?? 'Star'}</strong><br>
      Mag ${s.mag.toFixed(2)}
    `;
    el.style.display = 'block';
    el.style.left = e.clientX + 30 + 'px';
    el.style.top = e.clientY - 24 + 'px';
  }

  private hideTooltip() {
    this.tooltipRef.nativeElement.style.display = 'none';
  }

  // helper

  private getSizeFactor(): number {
    const width = window.innerWidth;
    if (width < 600) return 0.15;  // mobiel (kleiner dan 600px)
    if (width < 1024) return 0.35; // tablet
    return 1.0;                   // desktop
  }

  // ---------------- CONTROLES ----------------

  toggleNames() { this.showNames = !this.showNames; this.render(); }
  toggleConstellations() { this.showConstellations = !this.showConstellations; this.render(); }
  toggleMirror() { this.mirrored = !this.mirrored; this.render(); }
  toggleGrid() { this.showGrid = !this.showGrid; this.render(); }
  toggleMessier() { this.showMessier = !this.showMessier; this.render(); }
  toggleFov() { this.showFov = !this.showFov; this.render(); }

  rotateLeft() { this.rotationAngle -= 15; this.render(); }
  rotateRight() { this.rotationAngle += 15; this.render(); }
  rotateTo(a: number) { this.rotationAngle = a; this.render(); }

  resetView() {
    this.rotationAngle = 0;
    this.mirrored = true;
    this.showConstellations = true;
    this.showGrid = true;
    this.render();
  }
}