import {
  Directive,
  ElementRef,
  EventEmitter,
  Output,
  Inject,
  PLATFORM_ID,
  OnDestroy
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

@Directive({
  selector: '[clickOutside]',
  standalone: true
})
export class ClickOutsideDirective implements OnDestroy {

  @Output() clickOutside = new EventEmitter<void>();

  private isBrowser: boolean;

  constructor(
    private el: ElementRef,
    @Inject(PLATFORM_ID) platformId: Object
  ) {
    this.isBrowser = isPlatformBrowser(platformId);

    if (this.isBrowser) {
      document.addEventListener('click', this.onClick);
    }
  }

  onClick = (event: MouseEvent) => {
    if (!this.el.nativeElement.contains(event.target)) {
      this.clickOutside.emit();
    }
  };

  ngOnDestroy() {
    if (this.isBrowser) {
      document.removeEventListener('click', this.onClick);
    }
  }
}