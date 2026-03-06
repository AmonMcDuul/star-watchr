import {
  Component,
  AfterViewInit,
  ViewChild,
  ElementRef,
  Input,
  OnDestroy,
  inject,
  PLATFORM_ID
} from '@angular/core';

import { isPlatformBrowser } from '@angular/common';

@Component({
  selector: 'app-aladin-map',
  standalone: true,
  template: `<div #container class="aladin-container"></div>`,
  styles: [`
    .aladin-container {
      width: 100%;
      height: 100%;
      min-height: 360px;
      background: #05060a;
      border-radius: 12px;
    }
  `]
})
export class AladinMapComponent implements AfterViewInit, OnDestroy {

  @ViewChild('container', { static: true })
  container!: ElementRef<HTMLDivElement>;

  @Input() raDeg!: number;
  @Input() decDeg!: number;
  @Input() fov = 3;

  @Input() showConstellations = true;
  @Input() showConstellationLabels = false;

  private platformId = inject(PLATFORM_ID);
  private isBrowser = isPlatformBrowser(this.platformId);

  private aladin: any;
  private scriptLoaded = false;
  private isInitializing = false;

  ngAfterViewInit(): void {

    if (!this.isBrowser) return;

    this.initAladin();
  }

  ngOnDestroy(): void {

    if (this.aladin?.destroy) {
      this.aladin.destroy();
    }

    this.aladin = null;
  }

  private async initAladin(): Promise<void> {

    if (!this.isBrowser) return;

    if (this.isInitializing) return;
    this.isInitializing = true;

    try {

      await this.loadAladinScript();
      await this.waitForAladin();
      this.initializeAladin();

    } catch (error) {

      console.error('Failed to initialize Aladin Lite:', error);

      setTimeout(() => {
        this.isInitializing = false;
        this.initAladin();
      }, 1000);

    }
  }

  private loadAladinScript(): Promise<void> {

    return new Promise((resolve, reject) => {

      if (!this.isBrowser) {
        resolve();
        return;
      }

      if (document.querySelector('#aladin-lite-script')) {
        this.scriptLoaded = true;
        resolve();
        return;
      }

      const script = document.createElement('script');

      script.src = 'https://aladin.u-strasbg.fr/AladinLite/api/v3/latest/aladin.js';
      script.type = 'text/javascript';
      script.charset = 'utf-8';
      script.async = true;
      script.id = 'aladin-lite-script';

      script.onload = () => {
        this.scriptLoaded = true;
        resolve();
      };

      script.onerror = () => {
        reject(new Error('Failed to load Aladin Lite script'));
      };

      document.body.appendChild(script);
    });
  }

  private waitForAladin(): Promise<void> {

    return new Promise((resolve, reject) => {

      if (!this.isBrowser) {
        resolve();
        return;
      }

      const timeout = 10000;
      const startTime = Date.now();

      const check = () => {

        const globalRef: any = globalThis;

        if (globalRef.A || globalRef.Aladin) {
          resolve();
          return;
        }

        if (Date.now() - startTime > timeout) {
          reject(new Error('Aladin Lite not available after timeout'));
          return;
        }

        setTimeout(check, 100);
      };

      check();
    });
  }

  private initializeAladin(): void {

    try {

      const globalRef: any = globalThis;
      const Aladin = globalRef.A || globalRef.Aladin;

      if (!Aladin) {
        throw new Error('Aladin not found on global scope');
      }

      if (this.aladin?.destroy) {
        this.aladin.destroy();
      }

      this.aladin = Aladin.aladin(this.container.nativeElement, {
        survey: 'https://skies.esac.esa.int/DSSColor',
        target: `${this.raDeg} ${this.decDeg}`,
        fov: this.fov,
        showReticle: true,
        showConstellationLines: this.showConstellations,
        showConstellationLabels: this.showConstellationLabels,
        showContextMenu: false,
        showCooGrid: false,
        showGotoControl: false,
        showFullscreenControl: true,
        showZoomControl: true,
        showLayersControl: false,
        showCatalog: false
      });

      const cat = Aladin.catalog({
        name: 'Target',
        color: '#ffd479',
        sourceSize: 16
      });

      cat.addSources([
        Aladin.source(this.raDeg, this.decDeg, { name: 'Target' })
      ]);

      this.aladin.addCatalog(cat);

      this.isInitializing = false;

    } catch (error) {

      this.isInitializing = false;
      throw error;

    }
  }
}