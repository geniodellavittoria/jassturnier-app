import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree } from '@angular/router';
import { createFakeApi, FakeApi, provideFakeApi } from '../../testing/fake-api';
import { adminGuard } from './admin.guard';

describe('adminGuard', () => {
  let api: FakeApi;

  beforeEach(() => {
    api = createFakeApi();
    TestBed.configureTestingModule({ providers: [provideFakeApi(api)] });
  });

  function run(url: string) {
    return TestBed.runInInjectionContext(() =>
      adminGuard({} as ActivatedRouteSnapshot, { url } as RouterStateSnapshot),
    ) as Promise<boolean | UrlTree>;
  }

  it('lets admins through', async () => {
    expect(await run('/gruppen')).toBeTrue();
  });

  it('sends everyone else to the login, remembering where they wanted to go', async () => {
    api.checkSession.and.resolveTo(false);
    const result = await run('/gruppen');
    expect(TestBed.inject(Router).serializeUrl(result as UrlTree)).toBe('/verwaltung?returnUrl=%2Fgruppen');
  });
});
