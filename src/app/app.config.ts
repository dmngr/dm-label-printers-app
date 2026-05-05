import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideRouter, withHashLocation } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';

import { routes } from './app.routes';
import { authInterceptor } from './services/auth.interceptor';

/**
 * Hash-location routing keeps the SPA self-contained on S3 + CloudFront
 * without needing custom 404→index.html rewrites. Saves a CloudFront
 * function or origin-side rewrite rule (= zero ongoing AWS spend for
 * SPA routing).
 */
export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes, withHashLocation()),
    provideHttpClient(withInterceptors([authInterceptor])),
  ],
};
