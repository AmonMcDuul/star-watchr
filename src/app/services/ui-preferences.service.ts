import { Injectable, signal, computed, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

export type ColorMode =
  | 'standard'
  | 'deuteranopia'
  | 'protanopia'
  | 'tritanopia';

@Injectable({ providedIn: 'root' })
export class UiPreferencesService {

  private platformId = inject(PLATFORM_ID);

  readonly colorMode = signal<ColorMode>('standard');

  toggleColorMode() {
    const modes: ColorMode[] = ['standard', 'deuteranopia', 'protanopia', 'tritanopia'];
    const currentIndex = modes.indexOf(this.colorMode());
    const nextIndex = (currentIndex + 1) % modes.length;
    this.colorMode.set(modes[nextIndex]);
  }

  setColorMode(mode: ColorMode) {
    this.colorMode.set(mode);

    if (isPlatformBrowser(this.platformId)) {
      localStorage.setItem('colorScheme', mode);
    }
  }

  isColorMode(value: string): value is ColorMode {
    return value === 'standard'
        || value === 'deuteranopia'
        || value === 'protanopia'
        || value === 'tritanopia';
  }

  loadFromStorage() {
    if (!isPlatformBrowser(this.platformId)) return;

    const stored = localStorage.getItem('colorScheme');

    if (stored && this.isColorMode(stored)) {
      this.colorMode.set(stored);
    }
  }

  readonly isStandard = computed(() => this.colorMode() === 'standard');
  readonly isDeuteranopia = computed(() => this.colorMode() === 'deuteranopia');
  readonly isProtanopia = computed(() => this.colorMode() === 'protanopia');
  readonly isTritanopia = computed(() => this.colorMode() === 'tritanopia');
}