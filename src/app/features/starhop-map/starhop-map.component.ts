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

  @Input() ra!: number;
  @Input() dec!: number;

  public starCatalog = inject(StarCatalogService);
  private catalog = inject(StarCatalogService);
  private zone = inject(NgZone);
  private messier = inject(MessierService);

  showMessier = true;

  showFov = true;
  fovArcMin = 60;
  
  showNames = false;
  showConstellations = true;
  showGrid = true;

  mirrored = true;
  rotationAngle = 0;
  lockNorthUp = false;

  private readonly radiusDeg = 30;
  private ready = false;

  private svg!: d3.Selection<SVGSVGElement, unknown, null, undefined>;
  private root!: d3.Selection<SVGGElement, unknown, null, undefined>;
  private zoomLayer!: d3.Selection<SVGGElement, unknown, null, undefined>;

  private rotateLayer!: d3.Selection<SVGGElement, unknown, null, undefined>;
  private labelLayer!: d3.Selection<SVGGElement, unknown, null, undefined>;
  private overlayLayer!: d3.Selection<SVGGElement, unknown, null, undefined>;

  private resizeObserver!: ResizeObserver;
  private raf = 0;

  ngAfterViewInit() {
    this.ready = true;
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
      .on('zoom', e => {
        this.zoomLayer.attr('transform', e.transform.toString());
        this.updateLabelOpacity(e.transform.k);
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

    this.zoomLayer.selectAll('*').remove();

    this.rotateLayer = this.zoomLayer.append('g');
    this.labelLayer = this.zoomLayer.append('g');
    this.overlayLayer = this.zoomLayer.append('g');

    const project = this.createProjector(width);

    const visibleRadius = this.radiusDeg * 1.6;

    const stars =
      this.catalog.getStarsNear(this.ra, this.dec, visibleRadius);

    const constellations =
      this.catalog.getConstellationsInView(this.ra, this.dec, visibleRadius);

    const messiers = this.messier.visible();

    if (this.showGrid) {
      this.drawGrid(width);
    }

    if (this.showConstellations) {
      this.drawConstellations(project, constellations);
    }

    this.drawStars(project, stars);

    if (this.showNames) {
      this.drawStarLabels(project, stars);
    }

    // this.drawTarget();
    // this.drawReferenceCircles(width);
    this.drawMagnitudeLegend(width, height);

    if (this.showMessier) {
      this.drawMessier(project, messiers);
    }

    if (this.showFov) {
      this.drawTelescopeFov(width);
    }

    this.applyViewTransform();

  }

  // ---------------- TRANSFORM ----------------

  private applyViewTransform() {

    let t = '';

    if (this.mirrored) t += ' scale(-1,1)';
    if (this.rotationAngle !== 0) t += ` rotate(${this.rotationAngle})`;

    this.rotateLayer.attr('transform', t);
  }

  // ---------------- PROJECTION ----------------

  private createProjector(width: number) {

    const scale = width / (2 * this.radiusDeg);
    const cosDec = Math.cos(this.dec * Math.PI / 180);

    return (ra: number, dec: number) => {

      let dra = ra - this.ra;
      if (dra > 180) dra -= 360;
      if (dra < -180) dra += 360;

      return {
        x: dra * cosDec * scale,
        y: -(dec - this.dec) * scale
      };
    };
  }

  // ---------------- STARS ----------------

  private drawStars(project: any, stars: Star[]) {

    const nodes = this.rotateLayer.selectAll('circle.star')
      .data(stars)
      .enter()
      .append('circle')
      .attr('class', 'star')
      .attr('cx', d => project(d.ra, d.dec).x)
      .attr('cy', d => project(d.ra, d.dec).y)
      .attr('r', d => Math.max(0.7, 2 * (8 - Math.min(d.mag, 7)) / 3))
      .attr('fill', d => d.mag < 1 ? '#ffffcc' : d.mag < 3 ? '#ffe8a0' : '#a0a8cc')
      .attr('opacity', d => Math.max(0.35, 1 - (d.mag - 1) * 0.1));

    // subtle twinkle
    nodes
      .transition()
      .duration(2000 + Math.random() * 3000)
      .ease(d3.easeSinInOut)
      .attr('opacity', d => Math.max(0.45, 1 - (d.mag - 1) * 0.1))
      .transition()
      .duration(2000)
      .attr('opacity', d => Math.max(0.35, 1 - (d.mag - 1) * 0.1));

    nodes
      .on('pointerenter', (e, d) => this.showStarTooltip(e, d))
      .on('pointerleave', () => this.hideTooltip());
  }

  // ---------------- LABELS (SCREEN SPACE) ----------------

  private drawStarLabels(project: any, stars: Star[]) {

    const rad = this.rotationAngle * Math.PI / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    this.labelLayer.selectAll('text.star-label')
      .data(stars.filter(s => s.mag < 3 && s.name))
      .enter()
      .append('text')
      .attr('class', 'star-label')
      .attr('x', d => {

        const p = project(d.ra, d.dec);

        // rotate position only (NOT glyph)
        const rx = p.x * cos - p.y * sin;
        const ry = p.x * sin + p.y * cos;

        const mx = this.mirrored ? -rx : rx;

        return mx + 6;
      })
      .attr('y', d => {

        const p = project(d.ra, d.dec);

        const rx = p.x * cos - p.y * sin;
        const ry = p.x * sin + p.y * cos;

        return ry - 6;
      })
      .attr('fill', '#ffcc66')
      .attr('font-size', '11px')
      .attr('dominant-baseline', 'middle')
      .attr('text-anchor', 'start')
      .style('pointer-events', 'none')
      .text(d => d.name!);
  }

  private updateLabelOpacity(scale: number) {

    this.labelLayer
      .selectAll<SVGTextElement, unknown>('text.star-label')
      .attr('opacity', Math.min(1, Math.max(0.3, scale / 2)));
  }

// ---------------- CONSTELLATIONS ----------------

private drawConstellations(project: any, list: Constellation[]) {

  // Bereken rotatie waarden eenmalig (net zoals in drawStarLabels)
  const rad = this.rotationAngle * Math.PI / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  // Lijnen gaan naar rotateLayer
  const lineLayer = this.rotateLayer
    .append('g')
    .attr('class', 'constellation-layer');

  list.forEach(c => {

    const group = lineLayer
      .append('g')
      .attr('class', 'constellation-group');

    const labelPoints: { x:number; y:number }[] = [];

    c.lines.forEach(l => {

      const a = project(l.from.ra, l.from.dec);
      const b = project(l.to.ra, l.to.dec);

      labelPoints.push(a, b);

      group.append('line')
        .attr('x1', a.x)
        .attr('y1', a.y)
        .attr('x2', b.x)
        .attr('y2', b.y)
        .attr('stroke', '#64a0ff')
        .attr('stroke-width', 1.4)
        .attr('stroke-opacity', 0.8)
        .attr('stroke-linecap', 'round');
    });

    if (labelPoints.length) {

      const center = labelPoints.reduce(
        (s, p) => ({ x: s.x + p.x, y: s.y + p.y }),
        { x: 0, y: 0 }
      );

      center.x /= labelPoints.length;
      center.y /= labelPoints.length;

      // TEXT gaat naar labelLayer met EXACT DEZELFDE logica als drawStarLabels
      this.labelLayer.append('text')
        .attr('class', 'constellation-label')
        .attr('x', () => {
          // rotate position only (NOT glyph) - ZELFDE als drawStarLabels
          const rx = center.x * cos - center.y * sin;
          const mx = this.mirrored ? -rx : rx;
          return mx;
        })
        .attr('y', () => {
          // ZELFDE als drawStarLabels
          const rx = center.x * cos - center.y * sin;
          const ry = center.x * sin + center.y * cos;
          return ry - 10; // Net iets boven het midden
        })
        .attr('text-anchor', 'middle') // Middel i.p.v. start
        .attr('dominant-baseline', 'middle')
        .attr('fill', '#64a0ff')
        .attr('font-size', '12px')
        .attr('paint-order', 'stroke')
        .attr('stroke', 'rgba(0,0,0,.7)')
        .attr('stroke-width', 3)
        .style('pointer-events', 'none')
        .text(c.name);
    }
  });
}

  // ---------------- GRID ----------------

  private drawGrid(width:number) {

    const step = width / (2 * this.radiusDeg) * 5;

    for (let i=-3;i<=3;i++) {

      this.overlayLayer.append('line')
        .attr('x1', -width)
        .attr('x2', width)
        .attr('y1', i * step)
        .attr('y2', i * step)
        .attr('stroke','rgba(255,255,255,.05)');
    }
  }

  // ---------------- HUD ----------------

  private drawTarget() {

    const g = this.rotateLayer.append('g');

    g.append('circle')
      .attr('r', 4)
      .attr('fill', 'none')
      .attr('stroke', '#ff3366');

    g.append('line')
      .attr('x1', -7).attr('x2', 7)
      .attr('stroke', '#ff336651');

    g.append('line')
      .attr('y1', -7).attr('y2', 7)
      .attr('stroke', '#ff336651');
  }

  private drawReferenceCircles(width: number) {

    [5, 10, 15].forEach(d => {

      const r = d * (width / (2 * this.radiusDeg));

      this.rotateLayer.append('circle')
        .attr('r', r)
        .attr('fill', 'none')
        .attr('stroke', 'rgba(255,255,255,.15)');
    });
  }

  private drawMagnitudeLegend(w:number,h:number) {

    const g = this.overlayLayer.append('g')
      .attr('transform', `translate(${w/2-120},${-h/2+30})`);

    [1,3,5].forEach((m,i)=>{

      g.append('circle')
        .attr('cx',0)
        .attr('cy',i*18)
        .attr('r',Math.max(1,4-m/1.5))
        .attr('fill','#ffe8a0');

      g.append('text')
        .attr('x',10)
        .attr('y',i*18+4)
        .attr('fill','#ccc')
        .attr('font-size','10px')
        .text(`Mag ${m}`);
    });
  }

  // Messiers
private drawMessier(project: any, list: any[]) {

  // Symbolen gaan naar rotateLayer
  const layer = this.rotateLayer.append('g')
    .attr('class', 'messier-layer');

  const nodes = layer.selectAll('g.messier')
    .data(list)
    .enter()
    .append('g')
    .attr('class', 'messier')
    .attr('transform', d => {
      const p = project(d.raDeg, d.decDeg);
      // Alleen de positie transformeren, GEEN spiegeling voor de iconen zelf
      // De hele laag wordt later gespiegeld via applyViewTransform()
      return `translate(${p.x},${p.y})`;
    });

  nodes.append('path')
    .attr('d', d => {
      const size = 70;
      switch (d.type.toLowerCase()) {
        case 'spiral galaxy':
        case 'elliptical galaxy':
        case 'irregular galaxy':
          return d3.symbol().type(d3.symbolDiamond2).size(size)();
        case 'globular cluster':
          return d3.symbol().type(d3.symbolCircle).size(size)();
        case 'open cluster':
          return d3.symbol().type(d3.symbolTriangle).size(size)();
        case 'planetary nebula':
          return d3.symbol().type(d3.symbolDiamond).size(size)();
        default:
          return d3.symbol().type(d3.symbolSquare).size(size)();
      }
    })
    .attr('fill', 'none')
    .attr('stroke', '#00ffaa')
    .attr('stroke-width', 1.4);

  // Labels gaan naar labelLayer (gescheiden van iconen)
  list.forEach(d => {
    const p = project(d.raDeg, d.decDeg);
    
    // Bereken positie voor label (met spiegeling)
    const rad = this.rotationAngle * Math.PI / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    
    const rx = p.x * cos - p.y * sin;
    const ry = p.x * sin + p.y * cos;
    const mx = this.mirrored ? -rx : rx;

    this.labelLayer.append('text')
      .attr('class', 'messier-label')
      .attr('x', mx)
      .attr('y', ry - 10)
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'middle')
      .attr('fill', '#00ffaa')
      .attr('font-size', '11px')
      .attr('paint-order', 'stroke')
      .attr('stroke', 'rgba(0,0,0,.7)')
      .attr('stroke-width', 3)
      .style('pointer-events', 'none')
      .text(`M${d.messierNumber}`);
  });

  nodes
    .on('pointerenter', (e, d) => {
      const el = this.tooltipRef.nativeElement;
      el.innerHTML = `
        <strong>M${d.messierNumber} — ${d.name}</strong><br>
        ${d.type}<br>
        Mag ${d.magnitude}
      `;
      el.style.display = 'block';
      el.style.left = e.clientX + 12 + 'px';
      el.style.top = e.clientY - 24 + 'px';
    })
    .on('pointerleave', () => this.hideTooltip());
}

 // Telescope
 private drawTelescopeFov(width:number) {

  const scale = width / (2 * this.radiusDeg);

  const radiusPx =
    (this.fovArcMin / 60) * scale;

  this.rotateLayer.append('circle')
    .attr('r', radiusPx)
    .attr('fill','none')
    .attr('stroke','#ffcc00')
    .attr('stroke-width',1.4)
    .attr('stroke-dasharray','6 4');
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

  // ---------------- CONTROLS ----------------

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
