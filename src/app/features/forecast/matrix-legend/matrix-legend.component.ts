import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';

@Component({
  selector: 'app-matrix-legend',
  imports: [CommonModule],
  templateUrl: './matrix-legend.component.html',
  styleUrl: './matrix-legend.component.scss',
})
export class MatrixLegendComponent {
  showCalculationInfo = false;

  toggleCalculationInfo(): void {
    this.showCalculationInfo = !this.showCalculationInfo;
  }
}
