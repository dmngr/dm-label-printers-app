import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { tap } from 'rxjs';

import { AuthService } from './auth.service';

/**
 * Customer-API Function URL the interceptor scopes the bearer to. Live since
 * Phase 0 step 6. Scoping prevents the bearer leaking to third-party hosts via
 * accidentally-fired requests (e.g. a future analytics SDK).
 */
const CUSTOMER_API_BASE = 'https://qqk5lvoos7ljgftlleth5ize2i0nwkxe.lambda-url.eu-west-1.on.aws';

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
