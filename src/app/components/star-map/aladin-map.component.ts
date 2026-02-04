import {
  Component,
  AfterViewInit,
  ViewChild,
  ElementRef,
  Input,
  OnDestroy
} from '@angular/core';

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

  private aladin: any;
  private scriptLoaded = false;
  private isInitializing = false;

  ngAfterViewInit(): void {
    // Wacht een beetje zodat de view volledig is gerenderd
    setTimeout(() => {
      this.initAladin();
    }, 100);
  }

  ngOnDestroy(): void {
    // Cleanup
    if (this.aladin) {
      // Verwijder event listeners en cleanup
      this.aladin = null;
    }
  }

  private async initAladin(): Promise<void> {
    if (this.isInitializing) return;
    this.isInitializing = true;

    try {
      // Stap 1: Laad Aladin Lite script als het niet al geladen is
      await this.loadAladinScript();
      
      // Stap 2: Wacht tot A beschikbaar is
      await this.waitForAladin();
      
      // Stap 3: Initialiseer Aladin
      this.initializeAladin();
      
    } catch (error) {
      console.error('Failed to initialize Aladin Lite:', error);
      // Fallback: probeer het opnieuw na een seconde
      setTimeout(() => {
        this.isInitializing = false;
        this.initAladin();
      }, 1000);
    }
  }

  private loadAladinScript(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Als script al geladen is
      if (document.querySelector('script[src*="aladin"]')) {
        this.scriptLoaded = true;
        resolve();
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://aladin.u-strasbg.fr/AladinLite/api/v3/latest/aladin.js';
      script.type = 'text/javascript';
      script.charset = 'utf-8';
      script.async = true;
      script.defer = false;
      script.id = 'aladin-lite-script';

      script.onload = () => {
        this.scriptLoaded = true;
        resolve();
      };

      script.onerror = () => {
        reject(new Error('Failed to load Aladin Lite script'));
      };

      // Voeg script toe aan het einde van body voor betere compatibiliteit
      document.body.appendChild(script);
    });
  }

  private waitForAladin(): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = 10000; // 10 seconden timeout
      const startTime = Date.now();

      const check = () => {
        // Controleer op zowel A als Aladin (sommige versies gebruiken Aladin ipv A)
        if ((window as any).A || (window as any).Aladin) {
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
      // Gebruik A of Aladin, afhankelijk van wat beschikbaar is
      const Aladin = (window as any).A || (window as any).Aladin;
      
      if (!Aladin) {
        throw new Error('Aladin not found on window object');
      }

      // Verwijder bestaande Aladin instantie als die er is
      if (this.aladin && this.aladin.destroy) {
        this.aladin.destroy();
      }

      // Initialiseer Aladin
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

      // Target marker
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