import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AdminAuth } from '../services/admin-auth';

export const adminGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AdminAuth);
  if (await auth.ensureChecked()) return true;
  const router = inject(Router);
  return router.createUrlTree(['/verwaltung'], { queryParams: { returnUrl: state.url } });
};
