import { Directive, HostListener, inject, input } from '@angular/core';
import { Router } from '@angular/router';

/**
 * Navigates to a route after N clicks within a short window — the only way
 * into the (intentionally unlinked) admin login.
 */
@Directive({
  selector: '[appSecretTap]',
})
export class SecretTap {
  readonly appSecretTap = input.required<string>();
  readonly taps = input(5);
  readonly windowMs = input(1500);

  private readonly router = inject(Router);
  private count = 0;
  private resetTimer: ReturnType<typeof setTimeout> | null = null;

  @HostListener('click')
  onClick(): void {
    this.count++;
    if (this.resetTimer) clearTimeout(this.resetTimer);
    this.resetTimer = setTimeout(() => (this.count = 0), this.windowMs());
    if (this.count >= this.taps()) {
      this.count = 0;
      void this.router.navigateByUrl(this.appSecretTap());
    }
  }
}
