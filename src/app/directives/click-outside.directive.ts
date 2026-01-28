import { Directive, ElementRef, EventEmitter, Output } from '@angular/core';

@Directive({
  selector: '[clickOutside]',
  standalone: true
})
export class ClickOutsideDirective {
  @Output() clickOutside = new EventEmitter<void>();

  constructor(private el: ElementRef) {
    document.addEventListener('click', this.onClick);
  }

  onClick = (event: MouseEvent) => {
    if (!this.el.nativeElement.contains(event.target)) {
      this.clickOutside.emit();
    }
  };

  ngOnDestroy() {
    document.removeEventListener('click', this.onClick);
  }
}
