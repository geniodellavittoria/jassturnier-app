import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { clearStoredTournament, createFakeApi, FakeApi, provideFakeApi } from '../testing/fake-api';
import { App } from './app';
import { routes } from './app.routes';
import { AdminPage } from './features/admin/admin-page';
import { FinalsPage } from './features/finals/finals-page';
import { GroupsPage } from './features/groups/groups-page';
import { PresentPage } from './features/present/present-page';
import { RegisterPage } from './features/register/register-page';
import { SetupPage } from './features/setup/setup-page';

describe('App', () => {
  let api: FakeApi;

  beforeEach(() => {
    clearStoredTournament();
    api = createFakeApi();
    TestBed.configureTestingModule({ providers: [provideRouter(routes), provideFakeApi(api)] });
  });

  async function render(url: string) {
    const app = TestBed.createComponent(App);
    await TestBed.inject(Router).navigateByUrl(url);
    // Not whenStable(): the store's sync polling keeps the zone busy forever.
    await new Promise((resolve) => setTimeout(resolve));
    app.detectChanges();
    return app.nativeElement as HTMLElement;
  }

  function navLabels(el: HTMLElement): string[] {
    return [...el.querySelectorAll('nav[aria-label="Hauptnavigation"] a')].map((a) => a.textContent!.trim());
  }

  it('shows the full navigation and the conflict dialog to admins', async () => {
    const el = await render('/gruppen');
    expect(el.querySelector('.brand-name')?.textContent).toBe('Jassturnier');
    expect(navLabels(el)).toEqual(['Einrichtung', 'Gruppenphase', 'Finalrunde', 'Präsentation', 'Verwaltung']);
    expect(el.querySelector('app-conflict-dialog')).not.toBeNull();
    expect(el.querySelector('main')?.classList).not.toContain('presenting');
  });

  it('shows only the presentation link to visitors', async () => {
    api.checkSession.and.resolveTo(false);
    const el = await render('/anmelden');
    expect(navLabels(el)).toEqual(['Präsentation']);
    expect(el.querySelector('app-conflict-dialog')).toBeNull();
  });

  it('hides its own chrome on the presentation', async () => {
    const el = await render('/');
    expect(el.querySelector('header.app-header')).toBeNull();
    expect(el.querySelector('main')?.classList).toContain('presenting');
  });
});

describe('routes', () => {
  it('lazy-loads every page', async () => {
    const loaded = await Promise.all(routes.filter((r) => r.loadComponent).map((r) => r.loadComponent!()));
    expect(loaded).toEqual([SetupPage, GroupsPage, FinalsPage, PresentPage, RegisterPage, AdminPage]);
  });
});
