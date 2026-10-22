import { Provider } from '@angular/core';
import { RegistrationApi } from '../app/services/registration-api';

export type FakeApi = jasmine.SpyObj<RegistrationApi>;

/** RegistrationApi double: logged in, server unreachable for the tournament (store stays local). */
export function createFakeApi(): FakeApi {
  const api = jasmine.createSpyObj<RegistrationApi>('RegistrationApi', [
    'register',
    'checkSession',
    'login',
    'logout',
    'listRegistrations',
    'updateStatus',
    'editRegistration',
    'deleteRegistration',
    'getSettings',
    'saveSettings',
    'getTournament',
    'patchTournament',
  ]);
  api.register.and.resolveTo();
  api.checkSession.and.resolveTo(true);
  api.login.and.resolveTo(true);
  api.logout.and.resolveTo();
  api.listRegistrations.and.resolveTo([]);
  api.updateStatus.and.resolveTo();
  api.editRegistration.and.resolveTo();
  api.deleteRegistration.and.resolveTo();
  api.getSettings.and.resolveTo(null);
  api.saveSettings.and.resolveTo();
  api.getTournament.and.resolveTo(null);
  api.patchTournament.and.rejectWith(new Error('offline'));
  return api;
}

export function provideFakeApi(api: FakeApi = createFakeApi()): Provider {
  return { provide: RegistrationApi, useValue: api };
}

/** The store persists to localStorage — start every test from a clean slate. */
export function clearStoredTournament(): void {
  localStorage.removeItem('jassturnier-state-v1');
}
