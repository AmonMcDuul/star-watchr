import { Routes } from '@angular/router';
import { ForecastPageComponent } from './features/forecast/forecast-page/forecast-page.component';
import { AlertsComponent } from './features/alerts/alerts.component';
import { AboutComponent } from './features/about/about.component';
import { ApodComponent } from './features/apod/apod.component';

export const routes: Routes = [
    {
      path: '',
      component: ForecastPageComponent,
      data: {
        title: 'Forecast – StarWatchr',
        description: 'Detailed stargazing forecast including moon, twilight, clouds and seeing.'
      }
    },
    {
      path: 'apod',
      component: ApodComponent,
      data: {
        title: 'NASA Astronomy Picture of the Day – StarWatchr',
        description: 'Discover the universe with NASA’s Astronomy Picture of the Day.'
      }
    },
    {
      path: 'alerts',
      component: AlertsComponent,
      data: {
        title: 'Stargazing Alerts – StarWatchr',
        description: 'Get notified when stargazing conditions are optimal in your area.'
      }
    },
    {
      path: 'about',
      component: AboutComponent,
      data: {
        title: 'About StarWatchr',
        description: 'A passion project for astronomy lovers and stargazers.'
      }
    }
  ];
  