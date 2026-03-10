import { Injectable, inject } from '@angular/core';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';

@Injectable({ providedIn: 'root' })
export class SeoService {

  private title = inject(Title);
  private meta = inject(Meta);
  private document = inject(DOCUMENT);

  private readonly baseUrl = 'https://starwatchr.com';

  update(title: string, description: string, path?: string, image?: string) {

    this.title.setTitle(title);

    this.meta.updateTag({
      name: 'description',
      content: description
    });

    this.meta.updateTag({ name: 'twitter:title', content: title });
    this.meta.updateTag({ name: 'twitter:description', content: description });

    if (path) {

      const url = this.buildUrl(path);

      this.setCanonical(url);

      this.meta.updateTag({ property: 'og:url', content: url });
      this.meta.updateTag({ property: 'og:title', content: title });
      this.meta.updateTag({ property: 'og:description', content: description });
      this.meta.updateTag({ property: 'og:type', content: 'article' });

      this.meta.updateTag({ name: 'twitter:card', content: 'summary_large_image' });

      if (image) {

        const img = this.buildUrl(image);

        this.meta.updateTag({ property: 'og:image', content: img });
        this.meta.updateTag({ name: 'twitter:image', content: img });

      }

    }
  }

  private buildUrl(path: string): string {

    if (!path.startsWith('/')) {
      path = '/' + path;
    }

    return `${this.baseUrl}${path}`;
  }

  private setCanonical(url: string) {

    let link: HTMLLinkElement | null =
      this.document.querySelector("link[rel='canonical']");

    if (!link) {

      link = this.document.createElement('link');
      link.setAttribute('rel', 'canonical');

      this.document.head?.appendChild(link);

    }

    link.setAttribute('href', url);
  }
}