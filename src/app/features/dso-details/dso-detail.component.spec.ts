import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { DsoDetailComponent } from './dso-detail.component';

describe('DsoDetailComponent section navigation', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DsoDetailComponent],
      providers: [provideHttpClient(), provideRouter([])],
    }).compileComponents();
  });

  it('scrolls locally and consumes the click event', () => {
    const fixture = TestBed.createComponent(DsoDetailComponent);
    const target = document.createElement('section');
    target.id = 'finding-chart';
    let scrolled = false;
    target.scrollIntoView = () => { scrolled = true; };
    document.body.appendChild(target);

    let prevented = false;
    let stopped = false;
    const event = {
      preventDefault: () => { prevented = true; },
      stopPropagation: () => { stopped = true; },
    } as Event;

    fixture.componentInstance.scrollToSection(event, target.id);

    expect(prevented).toBe(true);
    expect(stopped).toBe(true);
    expect(scrolled).toBe(true);
    target.remove();
  });
});
