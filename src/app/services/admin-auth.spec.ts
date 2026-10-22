import { TestBed } from '@angular/core/testing';
import { createFakeApi, FakeApi, provideFakeApi } from '../../testing/fake-api';
import { AdminAuth } from './admin-auth';

describe('AdminAuth', () => {
  let api: FakeApi;
  let auth: AdminAuth;

  beforeEach(() => {
    api = createFakeApi();
    TestBed.configureTestingModule({ providers: [provideFakeApi(api)] });
    auth = TestBed.inject(AdminAuth);
  });

  it('is unknown until checked', () => {
    expect(auth.authenticated()).toBeNull();
  });

  it('checks the session once, sharing a pending check', async () => {
    api.checkSession.and.resolveTo(false);
    const [a, b] = await Promise.all([auth.ensureChecked(), auth.ensureChecked()]);
    expect([a, b]).toEqual([false, false]);
    expect(await auth.ensureChecked()).toBeFalse();
    expect(api.checkSession).toHaveBeenCalledTimes(1);
    expect(auth.authenticated()).toBeFalse();
  });

  it('logs in', async () => {
    expect(await auth.login('pw')).toBeTrue();
    expect(api.login).toHaveBeenCalledWith('pw');
    expect(auth.authenticated()).toBeTrue();
  });

  it('stays logged out on a wrong password', async () => {
    api.login.and.resolveTo(false);
    expect(await auth.login('nope')).toBeFalse();
    expect(auth.authenticated()).toBeNull();
  });

  it('logs out', async () => {
    await auth.login('pw');
    await auth.logout();
    expect(api.logout).toHaveBeenCalled();
    expect(auth.authenticated()).toBeFalse();
  });
});
