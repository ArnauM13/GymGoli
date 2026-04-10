import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { environment } from '../../../environments/environment';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = async () => {
  const authService = inject(AuthService);
  const router      = inject(Router);

  const user = await authService.waitForAuth();

  if (!user) return router.createUrlTree(['/login']);

  const list = environment.allowedEmails;
  if (list.length && !list.includes(user.email ?? '')) {
    await authService.logout();
    return router.createUrlTree(['/login']);
  }

  return true;
};
