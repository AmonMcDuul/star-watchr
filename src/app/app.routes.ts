import { Routes } from '@angular/router';
import { ForecastPageComponent } from './features/forecast/forecast-page/forecast-page.component';
import { AlertsComponent } from './features/alerts/alerts.component';
import { AboutComponent } from './features/about/about.component';
import { ApodComponent } from './features/apod/apod.component';
import { ContactComponent } from './features/contact/contact.component';
import { DsoTonightComponent } from './features/dso-tonight/dso-tonight.component';

export const routes: Routes = [
  {
    path: '',
    component: ForecastPageComponent,
    data: {
      title: 'Stargazing Forecast Tonight – Clear Sky & Seeing Conditions | StarWatchr',
      description:
        'Check tonight’s stargazing forecast with cloud cover, seeing conditions, moon phase and twilight times to plan your astronomy observations.'
    }
  },

  {
    path: 'dso-forecast',
    component: DsoTonightComponent,
    data: {
      title: 'Deep Sky Objects Visible Tonight – Messier & Caldwell Catalog | StarWatchr',
      description:
        'Discover which Messier and Caldwell deep sky objects are visible tonight from your location, including altitude and best observing time.'
    }
  },

  {
    path: 'apod',
    component: ApodComponent,
    data: {
      title: 'NASA Astronomy Picture of the Day (APOD) – Space Photo Explained | StarWatchr',
      description:
        'Explore NASA’s Astronomy Picture of the Day with explanations and context for amateur astronomers and night sky observers.'
    }
  },

  // Alerts voorlopig uitgeschakeld
  // {
  //   path: 'alerts',
  //   component: AlertsComponent,
  //   data: {
  //     title: 'Stargazing Alerts – Clear Sky Notifications | StarWatchr',
  //     description:
  //       'Receive notifications when stargazing conditions are optimal, including clear skies, low cloud cover and good astronomical seeing.'
  //   }
  // },

  {
    path: 'about',
    component: AboutComponent,
    data: {
      title: 'About StarWatchr – Astronomy Tools for Stargazing & Night Sky Planning',
      description:
        'Learn about StarWatchr, an astronomy web application designed to help stargazers find clear skies, visible deep sky objects and observing conditions.'
    }
  },

  {
    path: 'contact',
    component: ContactComponent,
    data: {
      title: 'Contact StarWatchr – Questions, Feedback or Bug Reports',
      description:
        'Contact StarWatchr to report bugs, suggest astronomy features or share feedback about the stargazing tools.'
    }
  },

  {
    path: 'dso/:id',
    loadComponent: () =>
      import('./features/dso-details/dso-detail.component')
        .then(m => m.DsoDetailComponent),
    data: {
      title: 'Deep Sky Object – Messier & Caldwell Details | StarWatchr',
      description:
        'Detailed information about Messier and Caldwell deep sky objects including magnitude, size, constellation and observing season.'
    }
  },

  {
    path: 'sky-atlas',
    loadComponent: () =>
      import('./features/sky-atlas/sky-atlas.component')
        .then(m => m.SkyAtlasComponent),
    data: {
      title: 'Interactive Sky Atlas – Explore Stars, Constellations & Deep Sky Objects',
      description:
        'Navigate the night sky with an interactive sky atlas showing constellations, stars and deep sky objects in real time.'
    }
  },

  {
    path: 'solar-system',
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./features/solar-system/solar-system.component')
            .then(m => m.SolarSystemComponent),
        data: {
          title: 'Solar System Explorer – Planets, Moons & Orbits | StarWatchr',
          description:
            'Explore the solar system with interactive 3D orbits and detailed information about the Sun, planets, moons, asteroids and comets.'
        }
      },

      {
        path: ':type/:id',
        loadComponent: () =>
          import('./features/solar-system-detail/solar-system-detail.component')
            .then(m => m.SolarSystemDetailComponent),
        data: {
          title: 'Solar System Object – Planet, Moon or Asteroid Details | StarWatchr',
          description:
            'Detailed information about solar system objects including planets, moons, dwarf planets, asteroids and comets.'
        }
      }
    ]
  },

  { path: '**', redirectTo: '' }
];