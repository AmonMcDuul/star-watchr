import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { HeaderComponent } from "./components/header/header.component";
import { FooterComponent } from "./components/footer/footer.component";
import { filter } from 'rxjs';
import { SeoService } from './services/seo.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, HeaderComponent, FooterComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private seo = inject(SeoService);
  protected readonly title = signal('StarWatchr');

  constructor() {
    this.router.events
      .pipe(filter(e => e instanceof NavigationEnd))
      .subscribe(() => {
        let r = this.route.firstChild;
        while (r?.firstChild) r = r.firstChild;

        const data = r?.snapshot.data;
        if (data?.['title'] && data?.['description']) {
          this.seo.update(data['title'], data['description']);
        }
      });
  }
  
}
