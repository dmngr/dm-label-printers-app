import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';

import { AuthService } from './auth.service';

/**
 * Customer-API Function URL the interceptor scopes the bearer to. Live since
 * Phase 0 step 6. Scoping prevents the bearer leaking to third-party hosts via
 * accidentally-fired requests (e.g. a future analytics SDK).
 */
const CUSTOMER_API_BASE = 'https://qqk5lvoos7ljgftlleth5ize2i0nwkxe.lambda-url.eu-west-1.on.aws';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);

  const token = auth.token();
  let outbound = req;
  if (token && new URL(req.url, globalThis.location?.origin).origin === new URL(CUSTOMER_API_BASE).origin) {
    outbound = req.clone({
      setHeaders: { Authorization: `Bearer ${token}` },
    });
  }

  // Permission denials and service failures do not prove token expiry. Keep the
  // persisted session; the page reports the error and explicit sign-out remains.
  return next(outbound);
};
