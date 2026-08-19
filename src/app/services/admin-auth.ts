import { Injectable, inject, signal } from '@angular/core';
import { RegistrationApi } from './registration-api';

/**
 * Single source of truth for the admin session, shared by the route guard,
 * the header nav, and the login page so they never disagree about state.
 */
@Injectable({ providedIn: 'root' })
export class AdminAuth {
  private readonly api = inject(RegistrationApi);

  /** null = not checked yet. */
  readonly authenticated = signal<boolean | null>(null);

  private pending: Promise<boolean> | null = null;

  async ensureChecked(): Promise<boolean> {
    const known = this.authenticated();
    if (known !== null) return known;
    if (!this.pending) {
      this.pending = this.api.checkSession().then((ok) => {
        this.authenticated.set(ok);
        this.pending = null;
        return ok;
      });
    }
    return this.pending;
  }

  async login(password: string): Promise<boolean> {
    const ok = await this.api.login(password);
    if (ok) this.authenticated.set(true);
    return ok;
  }

  async logout(): Promise<void> {
    await this.api.logout();
    this.authenticated.set(false);
  }
}
