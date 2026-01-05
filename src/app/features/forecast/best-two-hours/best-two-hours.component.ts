import { ChangeDetectionStrategy, Component, computed, Input } from '@angular/core';
import { AstroCardVM } from '../../../models/astro-card.model';
import { findBestTwoHours } from '../../../utils/best-hours.util';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-best-two-hours',
  imports: [CommonModule],
  templateUrl: './best-two-hours.component.html',
  styleUrl: './best-two-hours.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})

export class BestTwoHoursComponent {
  @Input({ required: true }) cards!: AstroCardVM[];

  readonly best = computed(() => findBestTwoHours(this.cards));
}