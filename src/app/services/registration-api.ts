import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { PaymentSettings, Registration, RegistrationInput, RegistrationStatus } from '../models/registration';
import { Tournament } from '../models/tournament';

@Injectable({ providedIn: 'root' })
export class RegistrationApi {
  private readonly http = inject(HttpClient);

  register(input: RegistrationInput): Promise<void> {
    return firstValueFrom(this.http.post<{ ok: true }>('/api/register', input)).then(() => undefined);
  }

  async checkSession(): Promise<boolean> {
    try {
      const res = await firstValueFrom(this.http.get<{ authenticated: boolean }>('/api/admin/session'));
      return res.authenticated;
    } catch {
      return false;
    }
  }

  async login(password: string): Promise<boolean> {
    try {
      await firstValueFrom(this.http.post('/api/admin/login', { password }));
      return true;
    } catch {
      return false;
    }
  }

  logout(): Promise<void> {
    return firstValueFrom(this.http.post('/api/admin/logout', {})).then(() => undefined);
  }

  async listRegistrations(): Promise<Registration[] | null> {
    try {
      const res = await firstValueFrom(this.http.get<{ registrations: Registration[] }>('/api/admin/registrations'));
      return res.registrations;
    } catch {
      return null;
    }
  }

  updateStatus(id: number, status: RegistrationStatus): Promise<void> {
    return firstValueFrom(this.http.patch(`/api/admin/registrations/${id}`, { status })).then(() => undefined);
  }

  async getSettings(): Promise<PaymentSettings | null> {
    try {
      const res = await firstValueFrom(this.http.get<{ settings: PaymentSettings | null }>('/api/admin/settings'));
      return res.settings;
    } catch {
      return null;
    }
  }

  saveSettings(settings: PaymentSettings): Promise<void> {
    return firstValueFrom(this.http.put('/api/admin/settings', settings)).then(() => undefined);
  }

  /** Server-side copy of the tournament, shared across devices. `unknown` — caller validates before trusting it. */
  async getTournament(): Promise<unknown> {
    try {
      const res = await firstValueFrom(this.http.get<{ tournament: unknown }>('/api/tournament'));
      return res.tournament;
    } catch {
      return null;
    }
  }

  saveTournament(tournament: Tournament): Promise<void> {
    return firstValueFrom(this.http.put('/api/admin/tournament', tournament)).then(() => undefined);
  }
}
