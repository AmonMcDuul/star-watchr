import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { SkyAtlasComponent } from '../sky-atlas/sky-atlas.component';
import { SolarOrbitAtlasComponent } from "../../components/solar-orbit-atlas/solar-orbit-atlas.component";
import { SolarSystemService } from '../../services/solar-system.service';

@Component({
  selector: 'app-space-viewer',
  imports: [CommonModule, SkyAtlasComponent, SolarOrbitAtlasComponent],
  templateUrl: './space-viewer.component.html',
  styleUrl: './space-viewer.component.scss',
})
export class SpaceViewerComponent {
  mode = signal<'sky' | 'solar'>('sky');
  solar = inject(SolarSystemService);

  constructor(){
    this.solar.load();
  }
  setMode(newMode: 'sky' | 'solar') {
    this.mode.set(newMode);
  }
}