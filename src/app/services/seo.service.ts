import { Injectable, inject } from '@angular/core';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT as NG_DOCUMENT } from '@angular/common';

@Injectable({ providedIn: 'root' })
export class SeoService {

  private title = inject(Title);
  private meta = inject(Meta);
  private document = inject(NG_DOCUMENT);

  update(title: string, description: string, path?: string, image?: string) {

    this.title.setTitle(title);

    this.meta.updateTag({
      name: 'description',
      content: description
    });

    if (path) {
      const url = `https://starwatchr.com${path}`;

      this.setCanonical(url);

      this.meta.updateTag({ property: 'og:url', content: url });
      this.meta.updateTag({ property: 'og:title', content: title });
      this.meta.updateTag({ property: 'og:description', content: description });

      if (image) {
        this.meta.updateTag({ property: 'og:image', content: `https://starwatchr.com${image}` });
        this.meta.updateTag({ name: 'twitter:image', content: `https://starwatchr.com${image}` });
      }
    }
  }

  private setCanonical(url: string) {
    let link: HTMLLinkElement | null = this.document.querySelector("link[rel='canonical']");

    if (!link) {
      link = this.document.createElement('link');
      link.setAttribute('rel', 'canonical');
      this.document.head.appendChild(link);
    }

    link.setAttribute('href', url);
  }
}