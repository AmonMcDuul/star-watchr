import { CommonModule } from '@angular/common';
import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { Observer, Horizon } from 'astronomy-engine';

@Component({
  selector: 'app-altitude-graph',
  standalone: true,
  imports: [CommonModule],
  template: `
  <div class="chart-wrap"
       (mousemove)="onPointer($event)"
       (mouseleave)="clearHover()"
       (touchstart)="onTouch($event)"
       (touchmove)="onTouch($event)"
       (touchend)="onTouchEnd()">

    <div class="fixed-label">
      {{ displayTime | date:'HH:mm' }} ·
      {{ displayAlt | number:'1.0-0' }}°
    </div>

    <svg [attr.viewBox]="viewBox" preserveAspectRatio="none">
      <defs>
        <linearGradient id="g" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stop-color="#6f8cff" stop-opacity="0.45"/>
          <stop offset="100%" stop-color="#6f8cff" stop-opacity="0.05"/>
        </linearGradient>
      </defs>

      <polygon [attr.points]="areaPoints" class="area"/>

      <polyline [attr.points]="polyPoints" class="line"/>

      <line x1="0"
            [attr.y1]="horizonY"
            x2="1000"
            [attr.y2]="horizonY"
            class="horizon"/>

      <circle *ngIf="hover"
              [attr.cx]="hover.x"
              [attr.cy]="hover.y"
              r="5"
              class="hover-dot"/>
    </svg>

    <div *ngIf="hover"
         class="tooltip"
         [style.left.px]="hover.clientX"
         [style.top.px]="hover.clientY">
      {{ hover.time | date:'HH:mm' }}<br/>
      Alt {{ hover.alt | number:'1.0-0' }}°
    </div>
  </div>
  `,
  styles: [`
    .chart-wrap {
      width: 100%;
      height: 200px;
      position: relative;
      touch-action: none;
    }

    svg {
      width: 100%;
      height: 100%;
      display: block;
    }

    .line {
      fill: none;
      stroke: #6f8cff;
      stroke-width: 2.5;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    .area {
      fill: url(#g);
    }

    .horizon {
      stroke: rgba(255,255,255,0.08);
      stroke-dasharray: 4 4;
    }

    .hover-dot {
      fill: #ffd166;
      stroke: #fff2b2;
      stroke-width: 1;
    }

    .fixed-label {
      position: absolute;
      top: 8px;
      right: 12px;
      z-index: 5;
      background: rgba(10,12,24,0.65);
      backdrop-filter: blur(6px);
      border: 1px solid rgba(120,150,255,0.2);
      color: #e6ebff;
      font-size: 13px;
      font-weight: 600;
      padding: 6px 10px;
      border-radius: 999px;
      pointer-events: none;
      box-shadow: 0 0 12px rgba(120,150,255,0.25);
    }

    .tooltip {
      position: absolute;
      pointer-events: none;
      background: rgba(0,0,0,0.75);
      color: #e6ebff;
      font-size: 12px;
      padding: 6px 8px;
      border-radius: 6px;
      transform: translate(18px, -12px);
      white-space: nowrap;
    }

    @media (pointer: coarse) {
      .tooltip {
        font-size: 14px;
        padding: 8px 10px;
      }

      .fixed-label {
        font-size: 14px;
        padding: 8px 12px;
      }
    }
  `]
})
export class AltitudeGraphComponent implements OnChanges {

  @Input() raDeg = 0;
  @Input() decDeg = 0;
  @Input() lat = 0;
  @Input() lon = 0;
  @Input() date = new Date();

  viewBox = '0 0 1000 200';
  polyPoints = '';
  areaPoints = '';
  horizonY = 160;

  private samples: {
    t: Date;
    alt: number;
    x: number;
    y: number;
  }[] = [];

  hover: {
    x: number;
    y: number;
    alt: number;
    time: Date;
    clientX: number;
    clientY: number;
  } | null = null;

  displayTime: Date = new Date();
  displayAlt = 0;


  ngOnChanges(_: SimpleChanges): void {
    this.render();
  }


  private render() {
    const observer = new Observer(+this.lat, +this.lon, 0);

    const start = new Date(this.date.getTime() - 12 * 3600_000);
    const samplesCount = 96; // 24 hours

    const yForAlt = (alt: number) => {
      const minY = 180;
      const maxY = 20;
      const clamped = Math.max(-10, Math.min(90, alt));
      return minY + (maxY - minY) * ((clamped + 10) / 100);
    };

    this.samples = [];

    for (let i = 0; i < samplesCount; i++) {
      const t = new Date(
        start.getTime() + i * (24 * 3600_000) / (samplesCount - 1)
      );

      const h = Horizon(t, observer, this.raDeg, this.decDeg);
      const x = (i / (samplesCount - 1)) * 1000;
      const y = yForAlt(h.altitude);

      this.samples.push({ t, alt: h.altitude, x, y });
    }

    this.polyPoints = this.samples.map(p => `${p.x},${p.y}`).join(' ');
    this.areaPoints = `0,180 ${this.polyPoints} 1000,180`;
    this.horizonY = yForAlt(0);

    const now = new Date();
    const closest = this.samples.reduce((a, b) =>
      Math.abs(b.t.getTime() - now.getTime()) <
      Math.abs(a.t.getTime() - now.getTime()) ? b : a
    );

    this.displayTime = closest.t;
    this.displayAlt = closest.alt;
  }

  clearHover() {
    this.hover = null;
  }

  onPointer(evt: MouseEvent) {
    this.updateHover(
      evt.clientX,
      evt.clientY,
      evt.currentTarget as HTMLElement
    );
  }

  onTouch(evt: TouchEvent) {
    if (!evt.touches.length) return;
    const t = evt.touches[0];

    this.updateHover(
      t.clientX,
      t.clientY,
      evt.currentTarget as HTMLElement
    );
  }

  onTouchEnd() {
  }

  private updateHover(
    clientX: number,
    clientY: number,
    container: HTMLElement
  ) {
    const rect = container.getBoundingClientRect();
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

    this.displayTime = p.t;
    this.displayAlt = p.alt;
  }
}
