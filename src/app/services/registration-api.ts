import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { PaymentSettings, Registration, RegistrationInput, RegistrationStatus } from '../models/registration';

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
}
