import { ChangeDetectionStrategy, Component, ElementRef, HostListener, inject, ViewChild } from '@angular/core';
import { LocationService } from '../../services/location.service';
import { WeatherApiService } from '../../services/weather-api.service';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { LocationResult } from '../../models/location-result.model';

@Component({
  selector: 'app-location-search',
  templateUrl: './location-search.component.html',
  styleUrls: ['./location-search.component.scss'],
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LocationSearchComponent {
  // fugly temp oplossing voor search bar weer weghalen
  @ViewChild('wrapper') wrapper!: ElementRef<HTMLDivElement>;

  public location = inject(LocationService); 
  public weatherApi = inject(WeatherApiService); 

  query = '';
  searchActive = false;

  onInput() {
    this.location.setQuery(this.query);
  }

  select(loc: LocationResult) {
    this.location.selectLocation(loc);
    this.weatherApi.load(+loc.lat, +loc.lon);
    this.query = loc.display_name;
    this.location.clearResults();
    this.deactivateSearch();
  }

  activateSearch() {
    this.searchActive = true;
    setTimeout(() => {
      const input = document.querySelector<HTMLInputElement>('input');
      input?.focus();
    }, 0);
  }
  
  deactivateSearch() {
    this.query = '';
    this.searchActive = false;
  }

    // fugly temp oplossing voor search bar weer weghalen
    @HostListener('document:click', ['$event'])
    clickOutside(event: MouseEvent) {
      if (this.searchActive && this.wrapper && !this.wrapper.nativeElement.contains(event.target as Node)) {
        this.deactivateSearch()
      }
    }
}