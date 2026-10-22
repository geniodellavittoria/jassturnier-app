import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AdminAuth } from '../services/admin-auth';

export const adminGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AdminAuth);
  // inject() only works before the first await.
  const router = inject(Router);
  if (await auth.ensureChecked()) return true;
  return router.createUrlTree(['/verwaltung'], { queryParams: { returnUrl: state.url } });
};
