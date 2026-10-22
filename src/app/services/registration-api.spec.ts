import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { fakeAsync, TestBed, tick } from '@angular/core/testing';
import { TimeoutError } from 'rxjs';
import { PaymentSettings, RegistrationInput } from '../models/registration';
import { RegistrationApi, SYNC_TIMEOUT_MS } from './registration-api';

describe('RegistrationApi', () => {
  let api: RegistrationApi;
  let http: HttpTestingController;

  const input: RegistrationInput = { teamName: 'T', players: [], contactName: 'C', contactEmail: 'c@d.ch' };
  const settings: PaymentSettings = {
    recipientName: null,
    bankName: null,
    iban: 'CH00',
    referenceNote: null,
    amount: '40',
    currency: 'CHF',
    deadline: null,
    message: null,
  };
  const serverError = { status: 500, statusText: 'Server Error' };

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    api = TestBed.inject(RegistrationApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('registers a team', async () => {
    const done = api.register(input);
    const req = http.expectOne({ method: 'POST', url: '/api/register' });
    expect(req.request.body).toEqual(input);
    req.flush({ ok: true });
    await expectAsync(done).toBeResolvedTo(undefined);
  });

  it('propagates registration errors', async () => {
    const done = api.register(input);
    http.expectOne('/api/register').flush({ error: 'x' }, { status: 400, statusText: 'Bad Request' });
    await expectAsync(done).toBeRejected();
  });

  it('checks the session, treating errors as logged out', async () => {
    let result = api.checkSession();
    http.expectOne({ method: 'GET', url: '/api/admin/session' }).flush({ authenticated: true });
    expect(await result).toBeTrue();

    result = api.checkSession();
    http.expectOne('/api/admin/session').flush(null, serverError);
    expect(await result).toBeFalse();
  });

  it('logs in and reports wrong passwords as false', async () => {
    let result = api.login('pw');
    const req = http.expectOne({ method: 'POST', url: '/api/admin/login' });
    expect(req.request.body).toEqual({ password: 'pw' });
    req.flush({ ok: true });
    expect(await result).toBeTrue();

    result = api.login('wrong');
    http.expectOne('/api/admin/login').flush({ error: 'Falsches Passwort.' }, { status: 401, statusText: 'Unauthorized' });
    expect(await result).toBeFalse();
  });

  it('logs out', async () => {
    const done = api.logout();
    http.expectOne({ method: 'POST', url: '/api/admin/logout' }).flush({ ok: true });
    await expectAsync(done).toBeResolvedTo(undefined);
  });

  it('lists registrations, null on errors', async () => {
    let result = api.listRegistrations();
    http.expectOne({ method: 'GET', url: '/api/admin/registrations' }).flush({ registrations: [] });
    expect(await result).toEqual([]);

    result = api.listRegistrations();
    http.expectOne('/api/admin/registrations').flush(null, serverError);
    expect(await result).toBeNull();
  });

  it('updates, edits and deletes registrations', async () => {
    const status = api.updateStatus(3, 'paid');
    const patch = http.expectOne({ method: 'PATCH', url: '/api/admin/registrations/3' });
    expect(patch.request.body).toEqual({ status: 'paid' });
    patch.flush({ ok: true });
    await expectAsync(status).toBeResolvedTo(undefined);

    const edit = api.editRegistration(3, input);
    const put = http.expectOne({ method: 'PUT', url: '/api/admin/registrations/3' });
    expect(put.request.body).toEqual(input);
    put.flush({ ok: true });
    await expectAsync(edit).toBeResolvedTo(undefined);

    const remove = api.deleteRegistration(3);
    http.expectOne({ method: 'DELETE', url: '/api/admin/registrations/3' }).flush({ ok: true });
    await expectAsync(remove).toBeResolvedTo(undefined);
  });

  it('reads settings, null on errors', async () => {
    let result = api.getSettings();
    http.expectOne({ method: 'GET', url: '/api/admin/settings' }).flush({ settings });
    expect(await result).toEqual(settings);

    result = api.getSettings();
    http.expectOne('/api/admin/settings').flush(null, serverError);
    expect(await result).toBeNull();
  });

  it('saves settings', async () => {
    const done = api.saveSettings(settings);
    const req = http.expectOne({ method: 'PUT', url: '/api/admin/settings' });
    expect(req.request.body).toEqual(settings);
    req.flush({ ok: true });
    await expectAsync(done).toBeResolvedTo(undefined);
  });

  it('reads the tournament, null when unreachable', async () => {
    let result = api.getTournament();
    http.expectOne({ method: 'GET', url: '/api/tournament' }).flush({ tournament: null, version: 0 });
    expect(await result).toEqual({ tournament: null, version: 0 });

    result = api.getTournament();
    http.expectOne('/api/tournament').error(new ProgressEvent('offline'));
    expect(await result).toBeNull();
  });

  it('gives up on sync requests that never answer', fakeAsync(() => {
    let pulled: unknown = 'pending';
    void api.getTournament().then((r) => (pulled = r));
    let patchError: unknown;
    api.patchTournament([]).catch((e) => (patchError = e));
    http.expectOne('/api/tournament');
    http.expectOne('/api/admin/tournament');
    tick(SYNC_TIMEOUT_MS - 1);
    expect(pulled).toBe('pending');
    tick(1);
    expect(pulled).toBeNull();
    expect(patchError).toBeInstanceOf(TimeoutError);
  }));

  it('patches the tournament', async () => {
    const ops = [{ path: ['name'], prev: 'a', value: 'b' }];
    const result = api.patchTournament(ops);
    const req = http.expectOne({ method: 'PATCH', url: '/api/admin/tournament' });
    expect(req.request.body).toEqual({ ops });
    req.flush({ tournament: { name: 'b' }, version: 2, conflicts: [] });
    expect(await result).toEqual({ tournament: { name: 'b' }, version: 2, conflicts: [] });
  });
});
