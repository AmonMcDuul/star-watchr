import { ChangeDetectionStrategy, Component } from '@angular/core';
import { LocationService } from '../../services/location.service';
import { WeatherApiService } from '../../services/weather-api.service';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-location-search',
  imports: [CommonModule, FormsModule],
  templateUrl: './location-search.component.html',
  styleUrl: './location-search.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})

export class LocationSearchComponent {
  query = '';

  constructor(
    public location: LocationService,
    private weather: WeatherApiService
  ) {}

  search() {
    this.location.search(this.query);
  }

  select(loc: any) {
    this.weather.load(+loc.lat, +loc.lon);
    this.query = loc.display_name;
  }
}