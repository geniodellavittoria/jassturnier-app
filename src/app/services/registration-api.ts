import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { PaymentSettings, Registration, RegistrationInput, RegistrationStatus } from '../models/registration';
import { PatchConflict, PatchOp } from './patch';

export interface RemoteTournament {
  tournament: unknown;
  version: number;
}

export interface PatchResult extends RemoteTournament {
  conflicts: PatchConflict[];
}

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

  deleteRegistration(id: number): Promise<void> {
    return firstValueFrom(this.http.delete(`/api/admin/registrations/${id}`)).then(() => undefined);
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

  /**
   * Server-side copy of the tournament, shared across devices, plus its
   * version (bumped on every write). `tournament` is `unknown` — the caller
   * validates before trusting it. Null when the server is unreachable.
   */
  async getTournament(): Promise<RemoteTournament | null> {
    try {
      return await firstValueFrom(this.http.get<RemoteTournament>('/api/tournament'));
    } catch {
      return null;
    }
  }

  /** Send only this device's changes; ops another device changed meanwhile come back as conflicts. */
  patchTournament(ops: PatchOp[]): Promise<PatchResult> {
    return firstValueFrom(this.http.patch<PatchResult>('/api/admin/tournament', { ops }));
  }
}
