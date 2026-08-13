import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { computed, inject, Injectable, PLATFORM_ID, signal } from '@angular/core';

type InstallOutcome = 'accepted' | 'dismissed' | 'ios-help' | 'unavailable';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

@Injectable({ providedIn: 'root' })
export class PwaInstallService {
  private platformId = inject(PLATFORM_ID);
  private document = inject(DOCUMENT);
  private deferredPrompt: BeforeInstallPromptEvent | null = null;
  private initialized = false;

  readonly canPrompt = signal(false);
  readonly isIos = signal(false);
  readonly isInstalled = signal(false);
  readonly showInstallAction = computed(
    () => !this.isInstalled() && (this.canPrompt() || this.isIos()),
  );

  initialize(): void {
    if (this.initialized || !isPlatformBrowser(this.platformId)) return;
    this.initialized = true;

    const view = this.document.defaultView;
    if (!view) return;

    const navigatorWithStandalone = view.navigator as Navigator & { standalone?: boolean };
    const standalone = (typeof view.matchMedia === 'function'
      && view.matchMedia('(display-mode: standalone)').matches)
      || navigatorWithStandalone.standalone === true;
    const ios = /iphone|ipad|ipod/i.test(view.navigator.userAgent)
      || (view.navigator.platform === 'MacIntel' && view.navigator.maxTouchPoints > 1);

    this.isInstalled.set(standalone);
    this.isIos.set(ios && !standalone);
    view.addEventListener('beforeinstallprompt', this.onBeforeInstallPrompt as EventListener);
    view.addEventListener('appinstalled', this.onAppInstalled);
  }

  async install(): Promise<InstallOutcome> {
    if (this.isIos()) return 'ios-help';
    if (!this.deferredPrompt) return 'unavailable';

    const prompt = this.deferredPrompt;
    await prompt.prompt();
    const choice = await prompt.userChoice;
    this.deferredPrompt = null;
    this.canPrompt.set(false);

    return choice.outcome;
  }

  private onBeforeInstallPrompt = (event: Event): void => {
    event.preventDefault();
    this.deferredPrompt = event as BeforeInstallPromptEvent;
    this.canPrompt.set(true);
  };

  private onAppInstalled = (): void => {
    this.deferredPrompt = null;
    this.canPrompt.set(false);
    this.isInstalled.set(true);
  };
}