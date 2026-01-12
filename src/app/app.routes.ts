import { Routes } from '@angular/router';
import { ForecastPageComponent } from './features/forecast/forecast-page/forecast-page.component';
import { AlertsComponent } from './features/alerts/alerts.component';
import { AboutComponent } from './features/about/about.component';
import { ApodComponent } from './features/apod/apod.component';
import { ContactComponent } from './features/contact/contact.component';

export const routes: Routes = [
  {
    path: '',
    component: ForecastPageComponent,
    data: {
      title: 'Stargazing Forecast – StarWatchr',
      description:
        'Accurate and detailed stargazing forecast with moon phase, twilight times, cloud cover and seeing conditions.'
    }
  },
  {
    path: 'apod',
    component: ApodComponent,
    data: {
      title: 'NASA Astronomy Picture of the Day – StarWatchr',
      description:
        'Explore the universe with NASA’s Astronomy Picture of the Day, explained for stargazers.'
    }
  },
  {
    path: 'alerts',
    component: AlertsComponent,
    data: {
      title: 'Stargazing Alerts – StarWatchr',
      description:
        'Receive alerts when stargazing conditions are optimal, including clear skies and good seeing.'
    }
  },
  {
    path: 'about',
    component: AboutComponent,
    data: {
      title: 'About StarWatchr – Astronomy & Stargazing Tools',
      description:
        'Learn more about StarWatchr, a passion project built to help stargazers plan the perfect night sky experience.'
    }
  },
  {
    path: 'contact',
    component: ContactComponent,
    data: {
      title: 'Contact StarWatchr – Questions, Feedback & Bug Reports',
      description:
        'Have a question, idea, bug report or feedback about StarWatchr? Get in touch — we’d love to hear from you.'
    }
  }
];
