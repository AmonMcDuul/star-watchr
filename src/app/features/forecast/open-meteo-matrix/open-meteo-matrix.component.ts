import { CommonModule, formatDate } from '@angular/common';
import {
  Component,
  computed,
  HostListener,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { OpenMeteoService } from '../../../services/open-meteo.service';
import { ForecastContextService } from '../../../services/forecast-context.service';
import { ForecastTimeService } from '../../../services/forecast-time.service';
import { LocationService } from '../../../services/location.service';
import { ColorMode, UiPreferencesService } from '../../../services/ui-preferences.service';
import { LocationSearchComponent } from "../../location-search/location-search.component";
import { ClickOutsideDirective } from '../../../directives/click-outside.directive';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-open-meteo-matrix',
  imports: [CommonModule, LocationSearchComponent, ClickOutsideDirective, RouterLink],
  templateUrl: './open-meteo-matrix.component.html',
  styleUrl: './open-meteo-matrix.component.scss',
})
export class OpenMeteoMatrixComponent implements OnInit {
  public weatherApi = inject(OpenMeteoService);
  public context = inject(ForecastContextService);
  public time = inject(ForecastTimeService);
  public location = inject(LocationService);
  public ui = inject(UiPreferencesService);

  hoverCard = signal<any | null>(null);
  tooltipX = 0;
  tooltipY = 0;
  mobileTooltipVisible = false;

  private startY = 0;
  private horizontalDrag = false;

  private startX = 0;
  private startOffset = 0;
  private dragging = false;
  isDragging = signal(false);

  colorMenuOpen = signal(false);

  private readonly PX_PER_HOUR = 60; 

  readonly cardsWithFlags = computed(() => {
    return this.weatherApi.cards().map(c => {
      const d = new Date(c.time);

      return {
        ...c,
        isMidnight: d.getHours() === 0,
        isEndOfDay: d.getHours() === 23,
      };
    });
  });

  readonly pointsCount = signal(24);

  cardsToShow = computed(() => {
    const cards = this.cardsWithFlags();
    const { stepHours, windowHours } = this.time.window();
    const offset = this.time.offsetHours();

    const startIndex = Math.floor(offset / stepHours);
    // const count = windowHours / stepHours;
    const count = this.pointsCount();

    return cards.slice(startIndex, startIndex + count);
  });
  
  constructor() {
    const MIN_WIDTH = 350;
    const MAX_WIDTH = 1600;

    const MIN_POINTS = 6;
    const MAX_POINTS = 24;

    const update = () => {
      const w = window.innerWidth;

      const clamped = Math.min(Math.max(w, MIN_WIDTH), MAX_WIDTH);

      const ratio = (clamped - MIN_WIDTH) / (MAX_WIDTH - MIN_WIDTH);

      const points =
        MIN_POINTS + ratio * (MAX_POINTS - MIN_POINTS);

      this.pointsCount.set(Math.round(points));
    };

    update();
    window.addEventListener('resize', update);
  }


  ngOnInit() {
    this.time.mode.set('hourly');
  }

  dayPlus(days: number): string {
    const d = new Date(this.context.astroDateBase());
    d.setDate(d.getDate() + days);
    return d.toLocaleDateString(undefined, { weekday: 'short' });
  }

  isActiveDay(n: number) {
    const targetDate = new Date(this.context.astroDateBase());
    targetDate.setDate(targetDate.getDate() + n);

    const targetStr = formatDate(targetDate, 'EEE', 'en-US');
    const currentStr = formatDate(this.context.astroDate(), 'EEE', 'en-US');

    return targetStr === currentStr;
  }

  get nextDisabled(): boolean {
    const cards = this.cardsToShow();
    if (!cards.length) return true;

    const lastCard = cards[cards.length - 1];
    const allCards = this.weatherApi.cards();
    const lastDataCard = allCards[allCards.length - 1];

    return lastCard.time >= lastDataCard.time;
  }



  onHover(c: any, event: MouseEvent | null) {
    this.hoverCard.set(c);
    if (event) {
      const rect = (event.target as HTMLElement)
        .closest('.matrix')
        ?.getBoundingClientRect();
      if (rect) {
        this.tooltipX = event.clientX - rect.left + 10;
        this.tooltipY = event.clientY - rect.top - 200;
      }
    }
  }

  onMobileHover(c: any, event: TouchEvent) {
    if (this.hoverCard() === c && this.mobileTooltipVisible) {
      this.hoverCard.set(null);
      this.mobileTooltipVisible = false;
      return;
    }

    this.hoverCard.set(c);
    this.mobileTooltipVisible = true;

    const rect = (event.target as HTMLElement)
      .closest('.matrix')
      ?.getBoundingClientRect();

    if (rect) {
      const t = event.touches[0];
      this.tooltipX = t.clientX - rect.left + 10;
      this.tooltipY = t.clientY - rect.top + 10;
    }
  }


  @HostListener('document:touchstart', ['$event'])
  onDocumentTouch(event: TouchEvent) {
    const matrix = document.querySelector('.matrix');
    if (!matrix?.contains(event.target as Node)) {
      this.hoverCard.set(null);
      this.mobileTooltipVisible = false;
    }
  }

  onPointerStart(x: number, y?: number) {
    this.startX = x;
    this.startY = y ?? 0;
    this.startOffset = this.time.offsetHours();
    this.dragging = true;
    this.horizontalDrag = false;
  }


  onPointerMove(x: number, y?: number) {
    if (!this.dragging) return;

    const dx = x - this.startX;
    const dy = (y ?? 0) - this.startY;

    if (!this.horizontalDrag) {
      if (Math.abs(dy) > Math.abs(dx)) {
        this.dragging = false;
        return;
      }

      if (Math.abs(dx) > 10) {
        this.horizontalDrag = true;
        this.isDragging.set(true);
      } else {
        return;
      }
    }

    const deltaHours = -dx / this.PX_PER_HOUR;
    const step = this.time.window().stepHours;

    const maxOffset =
      this.weatherApi.cards().length * step -
      this.time.window().windowHours;

    let next = this.startOffset + deltaHours;
    next = Math.max(0, Math.min(maxOffset, next));

    this.time.setOffset(next);
  }


  onPointerEnd() {
    if (!this.dragging) return;
    this.dragging = false;
    this.isDragging.set(false);

    const step = this.time.window().stepHours;
    const snapped =
      Math.round(this.time.offsetHours() / step) * step;

    this.time.setOffset(snapped);
  }

  onMouseDown(event: MouseEvent) {
    event.preventDefault();
    this.onPointerStart(event.clientX);
    this.isDragging.set(true);
    const move = (e: MouseEvent) => this.onPointerMove(e.clientX);
    const up = () => {
      this.onPointerEnd();
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };

    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  }

  
  toggleColorMenu(event: MouseEvent) {
    event.stopPropagation();
    this.colorMenuOpen.update(v => !v);
  }

  closeColorMenu() {
    this.colorMenuOpen.set(false);
  }

  setColorMode(mode: ColorMode) {
    this.ui.setColorMode(mode);
    this.colorMenuOpen.set(false);
  }

}
