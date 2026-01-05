import { ChangeDetectionStrategy, Component, Input, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AstroCardVM } from '../../../models/astro-card.model';

@Component({
  selector: 'app-forecast-matrix',
  imports: [
    CommonModule,
  ],
  templateUrl: './forecast-matrix.component.html',
  styleUrl: './forecast-matrix.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})

export class ForecastMatrixComponent {
  @Input({ required: true }) cards!: AstroCardVM[];
}