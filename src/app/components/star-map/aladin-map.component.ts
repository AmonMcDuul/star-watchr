import {
  Component,
  AfterViewInit,
  ViewChild,
  ElementRef,
  Input
} from '@angular/core';

import A from 'aladin-lite';

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
export class AladinMapComponent implements AfterViewInit {

  @ViewChild('container', { static: true })
  container!: ElementRef<HTMLDivElement>;

  @Input() raDeg!: number;
  @Input() decDeg!: number;
  @Input() fov = 3;

  @Input() showConstellations = true;
  @Input() showConstellationLabels = false;

  private aladin: any;

  ngAfterViewInit(): void {
    this.aladin = A.aladin(this.container.nativeElement, {
      survey: 'https://skies.esac.esa.int/DSSColor', 
      target: `${this.raDeg} ${this.decDeg}`,
      fov: this.fov,
      showReticle: true,

      showConstellationLines: this.showConstellations,
      showConstellationLabels: this.showConstellationLabels,

      showContextMenu: false
    });

    // Target marker
    const cat = A.catalog({
      name: 'Target',
      color: '#ffd479',
      sourceSize: 16
    });

    cat.addSources([
      A.source(this.raDeg, this.decDeg, { name: 'Target' })
    ]);

    this.aladin.addCatalog(cat);
  }
}
