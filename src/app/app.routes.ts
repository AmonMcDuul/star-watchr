import { Routes } from '@angular/router';
import { ForecastPageComponent } from './features/forecast/forecast-page/forecast-page.component';
import { AlertsComponent } from './features/alerts/alerts.component';
import { AboutComponent } from './features/about/about.component';
import { ApodComponent } from './features/apod/apod.component';

export const routes: Routes = [
    { path: '', component: ForecastPageComponent },
    { path: 'apod', component: ApodComponent },
    { path: 'alerts', component: AlertsComponent },
    { path: 'about', component: AboutComponent },
];
