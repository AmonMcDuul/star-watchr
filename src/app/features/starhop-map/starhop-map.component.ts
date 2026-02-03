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

  showNames = false;
  showConstellations = true;
  mirrored = false;
  rotationAngle = 0;

  private readonly radiusDeg = 30;
  private ready = false;

  private svg!: d3.Selection<SVGSVGElement, unknown, null, undefined>;
  private root!: d3.Selection<SVGGElement, unknown, null, undefined>;
  private zoomLayer!: d3.Selection<SVGGElement, unknown, null, undefined>;
  private rotateLayer!: d3.Selection<SVGGElement, unknown, null, undefined>;

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
    this.tryRender();
  }

  private async tryRender() {
    if (!this.ready) return;
    if (!Number.isFinite(this.ra) || !Number.isFinite(this.dec)) return;

    await this.catalog.load();
    this.render();
  }


  private initSvg() {

    const svgEl = this.svgRef.nativeElement;
    svgEl.style.touchAction = 'none';

    this.svg = d3.select(svgEl);

    this.root = this.svg.append('g');
    this.zoomLayer = this.root.append('g');
    this.rotateLayer = this.zoomLayer.append('g');

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 8])
      .on('zoom', e => {
        this.zoomLayer.attr('transform', e.transform.toString());
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


  private render() {

    const el = this.svgRef.nativeElement;
    const rect = el.getBoundingClientRect();

    const width = Math.max(300, rect.width);
    const height = Math.max(300, rect.height);

    this.svg.attr('viewBox', `0 0 ${width} ${height}`);

    this.root.attr('transform', `translate(${width / 2},${height / 2})`);

    this.zoomLayer.selectAll('*').remove();
    this.rotateLayer = this.zoomLayer.append('g');

    const project = this.createProjector(width);

    const visibleRadius = this.radiusDeg * 1.6;

    const stars =
      this.catalog.getStarsNear(this.ra, this.dec, visibleRadius);

    const constellations =
      this.catalog.getConstellationsInView(this.ra, this.dec, visibleRadius);

    console.log('Stars:', stars.length);
    console.log('Constellations:', constellations.length);

    if (this.showConstellations) {
      this.drawConstellations(project, constellations);
    }

    this.drawStars(project, stars);

    if (this.showNames) {
      this.drawStarLabels(project, stars);
    }

    this.drawTarget();
    this.drawReferenceCircles(width);

    this.applyViewTransform();
  }


  private applyViewTransform() {

    let t = '';

    if (this.mirrored) t += ' scale(-1,1)';
    if (this.rotationAngle !== 0) t += ` rotate(${this.rotationAngle})`;

    this.rotateLayer.attr('transform', t);
  }


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

    nodes
      .on('pointerenter', (e, d) => this.showStarTooltip(e, d))
      .on('pointerleave', () => this.hideTooltip());
  }

  private drawStarLabels(project: any, stars: Star[]) {

    this.rotateLayer.selectAll('text.star-label')
      .data(stars.filter(s => s.mag < 3 && s.name))
      .enter()
      .append('text')
      .attr('class', 'star-label')
      .attr('x', d => project(d.ra, d.dec).x + 6)
      .attr('y', d => project(d.ra, d.dec).y - 6)
      .attr('fill', '#ffcc66')
      .attr('font-size', '11px')
      .text(d => d.name!);
      //fix dit
    if (this.mirrored) {
        this.rotateLayer.selectAll('text.star-label').attr('transform', 'scale(-1,1)');
      }
  }


private drawConstellations(project: any, list: Constellation[]) {

  const layer = this.rotateLayer
    .append('g')
    .attr('class', 'constellation-layer');

  list.forEach(c => {

    const group = layer
      .append('g')
      .attr('class', 'constellation-group');

    const labelPoints: { x:number;y:number }[] = [];

    c.lines.forEach(l => {

      const a = project(l.from.ra, l.from.dec);
      const b = project(l.to.ra, l.to.dec);

      labelPoints.push(a,b);

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
        (s,p)=>({x:s.x+p.x,y:s.y+p.y}),
        {x:0,y:0}
      );

      center.x/=labelPoints.length;
      center.y/=labelPoints.length;

      group.append('text')
        .attr('x', center.x)
        .attr('y', center.y-10)
        .attr('text-anchor','middle')
        .attr('fill','#64a0ff')
        .attr('font-size','12px')
        .attr('paint-order','stroke')
        .attr('stroke','rgba(0,0,0,.7)')
        .attr('stroke-width',3)
        .text(c.name);
    }
  });
}



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


  private showStarTooltip(e: PointerEvent, s: Star) {

    const el = this.tooltipRef.nativeElement;

    el.innerHTML = `
      <strong>${s.name ?? 'Star'}</strong><br>
      Mag ${s.mag.toFixed(2)}
    `;

    el.style.display = 'block';
    el.style.left = e.clientX + 14 + 'px';
    el.style.top = e.clientY - 24 + 'px';
  }

  private hideTooltip() {
    this.tooltipRef.nativeElement.style.display = 'none';
  }


  toggleNames() { this.showNames = !this.showNames; this.render(); }
  toggleConstellations() { this.showConstellations = !this.showConstellations; this.render(); }
  toggleMirror() { this.mirrored = !this.mirrored; this.render(); }

  rotateLeft() { this.rotationAngle -= 15; this.render(); }
  rotateRight() { this.rotationAngle += 15; this.render(); }
  rotateTo(a: number) { this.rotationAngle = a; this.render(); }

  resetView() {
    this.rotationAngle = 0;
    this.mirrored = false;
    this.showConstellations = true;
    this.render();
  }

}
