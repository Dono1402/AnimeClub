import { HttpErrorResponse } from '@angular/common/http';

import { shouldClearSessionForAuthError, shouldSendCredentials } from './auth.interceptor';

describe('authInterceptor helpers', () => {
  it('sends credentials to API endpoints so HttpOnly cookies are included', () => {
    expect(shouldSendCredentials('/api/account/login')).toBe(true);
    expect(shouldSendCredentials('/api/account/12/messages')).toBe(true);
    expect(shouldSendCredentials('/api/animetheque/12')).toBe(true);
    expect(shouldSendCredentials('/assets/logo.png')).toBe(false);
  });

  it('clears the session only on protected 401 responses', () => {
    const unauthorized = new HttpErrorResponse({ status: 401 });
    const forbidden = new HttpErrorResponse({ status: 403 });

    expect(shouldClearSessionForAuthError('GET', '/api/animetheque/12', unauthorized)).toBe(true);
    expect(shouldClearSessionForAuthError('GET', '/api/animetheque/12', forbidden)).toBe(false);
    expect(shouldClearSessionForAuthError('POST', '/api/account/login', unauthorized)).toBe(false);
  });
});
