import { Component } from '@angular/core';

@Component({
  selector: 'app-apod',
  imports: [],
  templateUrl: './apod.component.html',
  styleUrl: './apod.component.scss',
})
export class ApodComponent {
  apod = {
    title: 'The Pillars of Creation',
    date: '2023-10-12',
    explanation:
      'Stars are forming deep within the iconic Pillars of Creation. ' +
      'This image from the James Webb Space Telescope reveals stunning detail ' +
      'in a region of space filled with gas, dust and cosmic light.',
    url: 'https://apod.nasa.gov/apod/image/2210/stsci-pillarsofcreation.png',
    copyright: 'NASA / ESA / CSA / STScI'
  };
}
