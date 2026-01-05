import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { AstroCardVM } from '../../../models/astro-card.model';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-forecast-table',
  imports: [CommonModule],
  templateUrl: './forecast-table.component.html',
  styleUrl: './forecast-table.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})

export class ForecastTableComponent {
  @Input({ required: true }) cards!: AstroCardVM[];
}