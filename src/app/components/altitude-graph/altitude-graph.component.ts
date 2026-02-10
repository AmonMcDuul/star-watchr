import { CommonModule } from '@angular/common';
import {
  Component,
  Input,
  OnChanges,
  SimpleChanges,
  ElementRef,
  ViewChild
} from '@angular/core';
import {
  Observer,
  AstroTime,
  RotateVector,
  Rotation_EQJ_HOR,
  SphereFromVector,
  VectorFromSphere
} from 'astronomy-engine';

@Component({
  selector: 'app-altitude-graph',
  imports: [CommonModule],
  templateUrl: './altitude-graph.component.html',
  styleUrls: ['./altitude-graph.component.scss']
})
export class AltitudeGraphComponent implements OnChanges {

  @ViewChild('svgEl', { static: true }) svgRef!: ElementRef<SVGElement>;

  @Input() raDeg = 0;
  @Input() decDeg = 0;
  @Input() lat = 0;
  @Input() lon = 0;
  @Input() date = new Date();

  viewBox = '0 0 1000 200';
  polyPoints = '';
  areaPoints = '';
  horizonY = 160;

  yAxisLabels: number[] = [];
  yAxisGridLines: Array<{ y: number }> = [];
  xAxisLabels: Array<{ x: number; time: string }> = [];

  currentTimeX: number | null = null;
  currentTimeY: number | null = null;

  isTouchDevice = false;
  showTouchTooltip = false;

  private samples: {
    t: Date;
    alt: number;
    x: number;
    y: number;
  }[] = [];

  hover:
    | {
        x: number;
        y: number;
        alt: number;
        time: Date;
        clientX: number;
        clientY: number;
      }
    | null = null;

  constructor() {
    this.checkTouchDevice();
  }

  private checkTouchDevice() {
    this.isTouchDevice =
      'ontouchstart' in window ||
      navigator.maxTouchPoints > 0 ||
      (navigator as any).msMaxTouchPoints > 0;
  }

  ngOnChanges(_: SimpleChanges): void {
    this.render();
  }

  yForAlt(alt: number): number {
    const top = 20;
    const bottom = 180;
    const clamped = Math.max(-10, Math.min(90, alt));
    const ratio = (clamped + 10) / 100;
    return bottom - ratio * (bottom - top);
  }

  private render() {
    const observer = new Observer(+this.lat, +this.lon, 0);
    const start = new Date(this.date.getTime() - 12 * 3600_000);
    const samplesCount = 96;

    const yForAlt = (alt: number) => {
      const top = 20;
      const bottom = 180;
      const clamped = Math.max(-10, Math.min(90, alt));

      const ratio = (clamped + 10) / 100; 
      return bottom - ratio * (bottom - top);
    };


    this.samples = [];
    this.yAxisLabels = [];
    this.yAxisGridLines = [];
    this.xAxisLabels = [];

    this.currentTimeX = null;
    this.currentTimeY = null;

    for (let i = 0; i < samplesCount; i++) {
      const t = new Date(start.getTime() + i * (24 * 3600_000) / (samplesCount - 1));
      const time = new AstroTime(t);

      const sphereJ2000 = { lon: this.raDeg, lat: this.decDeg, dist: 1.0 };
      const vecJ2000 = VectorFromSphere(sphereJ2000, time);
      const rot_EQJ_HOR = Rotation_EQJ_HOR(time, observer);
      const vec_hor = RotateVector(rot_EQJ_HOR, vecJ2000);
      const sphere_hor = SphereFromVector(vec_hor);

      const altitude = sphere_hor.lat;
      const x = (i / (samplesCount - 1)) * 1000;
      const y = yForAlt(altitude);

      this.samples.push({ t, alt: altitude, x, y });

      const now = new Date();
      if (this.currentTimeX === null && t.getTime() >= now.getTime()) {
        this.currentTimeX = x;
        this.currentTimeY = y;
      }
    }

    this.yAxisLabels = [90, 60, 30, 0, -10];

    const gridSteps = [90, 75, 60, 45, 30, 15, 0, -10];
    this.yAxisGridLines = gridSteps.map(alt => ({
      y: yForAlt(alt)
    }));

    const labelHours = [0, 4, 8, 12, 16, 20, 24];

    labelHours.forEach(hour => {
      const labelTime = new Date(start.getTime() + hour * 3600_000);
      const x = (hour / 24) * 1000;

      const timeStr = this.formatTime(labelTime);
      this.xAxisLabels.push({ x, time: timeStr });
    });

    this.polyPoints = this.samples.map(p => `${p.x},${p.y}`).join(' ');
    this.areaPoints = `0,180 ${this.polyPoints} 1000,180`;
    this.horizonY = yForAlt(0);
  }

  private formatTime(date: Date): string {
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  }

  clearHover() {
    this.hover = null;
    this.showTouchTooltip = false;
  }

  onPointer(evt: MouseEvent) {
    this.updateHover(evt.clientX, evt.clientY);
  }

  onTouch(evt: TouchEvent) {
    if (!evt.touches.length) return;
    const t = evt.touches[0];

    this.showTouchTooltip = true;
    this.updateHover(t.clientX, t.clientY);
    evt.preventDefault();
  }

  onTouchEnd() {
    setTimeout(() => {
      this.showTouchTooltip = false;
      this.clearHover();
    }, 1000);
  }

  private updateHover(clientX: number, clientY: number) {
    const svg = this.svgRef.nativeElement;
    const rect = svg.getBoundingClientRect();

    const xNorm = (clientX - rect.left) / rect.width;
    const index = Math.round(xNorm * (this.samples.length - 1));
    const p = this.samples[index];
    if (!p) return;

    this.hover = {
      x: p.x,
      y: p.y,
      alt: p.alt,
      time: p.t,
      clientX: clientX - rect.left,
      clientY: clientY - rect.top
    };
  }
}
