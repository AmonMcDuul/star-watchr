import { Routes } from '@angular/router';
import { ForecastPageComponent } from './features/forecast/forecast-page/forecast-page.component';
import { AlertsComponent } from './features/alerts/alerts.component';
import { AboutComponent } from './features/about/about.component';

export const routes: Routes = [
    { path: '', component: ForecastPageComponent },
    { path: 'alerts', component: AlertsComponent },
    { path: 'about', component: AboutComponent },
];
