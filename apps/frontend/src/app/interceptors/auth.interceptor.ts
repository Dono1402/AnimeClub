import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';

import { environment } from '../../environments/environment';
import { AuthService } from '../services/auth.service';

export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const token = shouldAttachAuthToken(request.method, request.url) ? authService.currentSessionToken() : null;

  const authenticatedRequest = token
    ? request.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`,
      },
    })
    : request;

  return next(authenticatedRequest).pipe(
    catchError((error: unknown) => {
      if (token && shouldClearSessionForAuthError(request.method, request.url, error)) {
        const cleared = authService.clearRejectedSession(token);
        if (cleared && router.url !== '/login') {
          void router.navigate(['/login'], { replaceUrl: true });
        }
      }

      return throwError(() => error);
    }),
  );
};

export function shouldAttachAuthToken(method: string, url: string): boolean {
  const apiPath = pathFromApiUrl(url);
  return apiPath !== null && !isPublicAuthPath(method, apiPath);
}

export function shouldClearSessionForAuthError(method: string, url: string, error: unknown): boolean {
  return error instanceof HttpErrorResponse
    && error.status === 401
    && shouldAttachAuthToken(method, url);
}

function pathFromApiUrl(url: string): string | null {
  const queryIndex = url.indexOf('?');
  const cleanUrl = queryIndex === -1 ? url : url.slice(0, queryIndex);
  const apiPath = environment.apiUrl.replace(/\/+$/, '');

  if (cleanUrl === apiPath || cleanUrl.startsWith(`${apiPath}/`)) {
    return normalizePath(cleanUrl.slice(apiPath.length));
  }

  const origin = typeof window === 'undefined' ? 'http://localhost' : window.location.origin;

  try {
    const parsedUrl = new URL(cleanUrl, origin);
    const parsedApiUrl = new URL(environment.apiUrl, origin);
    const parsedApiPath = parsedApiUrl.pathname.replace(/\/+$/, '');
    if (parsedUrl.origin !== parsedApiUrl.origin
      || (parsedUrl.pathname !== parsedApiPath && !parsedUrl.pathname.startsWith(`${parsedApiPath}/`))) {
      return null;
    }

    return normalizePath(parsedUrl.pathname.slice(parsedApiPath.length));
  } catch {
    return null;
  }
}

function normalizePath(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return normalized.replace(/\/+$/, '') || '/';
}

function isPublicAuthPath(method: string, path: string): boolean {
  const normalizedMethod = method.toUpperCase();

  if (path === '/account/login'
    || path === '/account/confirm'
    || path === '/account/email-confirmation/change-address'
    || path.startsWith('/account/oauth/discord')
    || path.startsWith('/account/password-reset')
    || path.startsWith('/account/public')) {
    return true;
  }

  return normalizedMethod === 'POST' && path === '/account';
}
