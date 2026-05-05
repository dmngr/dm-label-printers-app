import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { tap } from 'rxjs';

import { AuthService } from './auth.service';

/**
 * Customer-API Function URL the interceptor scopes the bearer to. Empty in
 * Phase 0 (Lambda not yet shipped) — set this once the customer-api Lambda
 * Function URL is known. Scoping prevents the bearer leaking to third-party
 * hosts via accidentally-fired requests.
 */
const CUSTOMER_API_BASE = '';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  const token = auth.token();
  let outbound = req;
  if (token && CUSTOMER_API_BASE && req.url.startsWith(CUSTOMER_API_BASE)) {
    outbound = req.clone({
      setHeaders: { Authorization: `Bearer ${token}` },
    });
  }

  return next(outbound).pipe(
    tap({
      error: (err) => {
        if (err?.status === 401 || err?.status === 403) {
          auth.clear();
          router.navigate(['/login']);
        }
      },
    }),
  );
};
