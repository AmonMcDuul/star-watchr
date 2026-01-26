import { ChangeDetectionStrategy, Component, ElementRef, HostListener, inject, OnInit, ViewChild } from '@angular/core';
import { LocationService } from '../../services/location.service';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { LocationResult } from '../../models/location-result.model';
import { OpenMeteoService } from '../../services/open-meteo.service';

@Component({
  selector: 'app-location-search',
  templateUrl: './location-search.component.html',
  styleUrls: ['./location-search.component.scss'],
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LocationSearchComponent implements OnInit {
  // fugly temp oplossing voor search bar weer weghalen
  @ViewChild('wrapper') wrapper!: ElementRef<HTMLDivElement>;
  public location = inject(LocationService); 
  public openMeteoApi = inject(OpenMeteoService); 

  query = '';
  searchActive = false;

  ngOnInit() {
    if(this.location.selected() == null){
      this.searchActive = true;
    }
  }

  onInput() {
    this.location.setQuery(this.query);
  }

  select(loc: LocationResult) {
    this.location.selectLocation(loc);
    this.openMeteoApi.load(+loc.lat, +loc.lon);
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
      if(this.location.selected() == null){
        return;
      }
      if (this.searchActive && this.wrapper && !this.wrapper.nativeElement.contains(event.target as Node)) {
        this.deactivateSearch()
      }
    }
}