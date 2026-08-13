import { CommonModule, DOCUMENT } from '@angular/common';
import { Component, HostListener, inject, OnDestroy } from '@angular/core';
import { Router, RouterModule } from '@angular/router';

@Component({
  selector: 'app-header',
  imports: [CommonModule, RouterModule],
  templateUrl: './header.component.html',
  styleUrl: './header.component.scss',
})
export class HeaderComponent implements OnDestroy {
  private router = inject(Router);
  private document = inject(DOCUMENT);

  menuOpen = false;

  goHome() {
    this.closeMenu();
    this.router.navigate(['/']);
  }

  toggleMenu() {
    this.setMenuOpen(!this.menuOpen);
  }

  closeMenu() {
    this.setMenuOpen(false);
  }

  @HostListener('document:keydown.escape')
  onEscape() {
    if (this.menuOpen) this.closeMenu();
  }

  ngOnDestroy() {
    this.document.body.classList.remove('mobile-menu-open');
  }

  private setMenuOpen(open: boolean) {
    this.menuOpen = open;
    this.document.body.classList.toggle('mobile-menu-open', open);
  }
}