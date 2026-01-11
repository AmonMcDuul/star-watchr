import { Injectable, inject } from '@angular/core';
import { Title, Meta } from '@angular/platform-browser';

@Injectable({ providedIn: 'root' })
export class SeoService {
  private title = inject(Title);
  private meta = inject(Meta);

  update(title: string, description: string) {
    this.title.setTitle(title);
    this.meta.updateTag({
      name: 'description',
      content: description
    });
  }
}
