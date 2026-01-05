import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { AstroCardVM } from '../../../models/astro-card.model';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-forecast-cards',
  imports: [CommonModule],
  templateUrl: './forecast-cards.component.html',
  styleUrl: './forecast-cards.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})

export class ForecastCardsComponent {
  @Input({ required: true }) cards!: AstroCardVM[];
}