import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { UiPreferencesService } from '../../../services/ui-preferences.service';
import { ForecastContextService } from '../../../services/forecast-context.service';

@Component({
  selector: 'app-matrix-legend',
  imports: [CommonModule],
  templateUrl: './matrix-legend.component.html',
  styleUrl: './matrix-legend.component.scss',
})
export class MatrixLegendComponent {
  showCalculationInfo = false;
  public ui = inject(UiPreferencesService);
  public context = inject(ForecastContextService);

  toggleCalculationInfo(): void {
    this.showCalculationInfo = !this.showCalculationInfo;
  }
}
