import { HttpErrorResponse } from '@angular/common/http';

import { shouldAttachAuthToken, shouldClearSessionForAuthError } from './auth.interceptor';

describe('authInterceptor helpers', () => {
  it('does not attach the session token to public auth endpoints', () => {
    expect(shouldAttachAuthToken('POST', '/api/account/login')).toBe(false);
    expect(shouldAttachAuthToken('POST', '/api/account')).toBe(false);
    expect(shouldAttachAuthToken('GET', '/api/account/confirm?token=abc')).toBe(false);
    expect(shouldAttachAuthToken('POST', '/api/account/email-confirmation/change-address')).toBe(false);
    expect(shouldAttachAuthToken('POST', '/api/account/password-reset/request')).toBe(false);
    expect(shouldAttachAuthToken('GET', '/api/account/public/demo')).toBe(false);
  });

  it('attaches the session token to protected account and library endpoints', () => {
    expect(shouldAttachAuthToken('GET', '/api/account/12/messages')).toBe(true);
    expect(shouldAttachAuthToken('PUT', '/api/account/12/profile')).toBe(true);
    expect(shouldAttachAuthToken('GET', '/api/animetheque/12')).toBe(true);
    expect(shouldAttachAuthToken('POST', '/api/mangatheque/12')).toBe(true);
  });

  it('clears the session only on protected 401 responses', () => {
    const unauthorized = new HttpErrorResponse({ status: 401 });
    const forbidden = new HttpErrorResponse({ status: 403 });

    expect(shouldClearSessionForAuthError('GET', '/api/animetheque/12', unauthorized)).toBe(true);
    expect(shouldClearSessionForAuthError('GET', '/api/animetheque/12', forbidden)).toBe(false);
    expect(shouldClearSessionForAuthError('POST', '/api/account/login', unauthorized)).toBe(false);
  });
});
