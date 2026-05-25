import { HttpErrorResponse } from '@angular/common/http';

export function extractHttpErrorMessage(error: unknown, fallback: string, networkFallback = fallback): string {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 0) {
      return networkFallback;
    }

    return messageFromPayload(error.error) ?? fallback;
  }

  return messageFromPayload(error) ?? fallback;
}

function messageFromPayload(payload: unknown): string | null {
  if (typeof payload === 'string') {
    const trimmed = payload.trim();
    if (!trimmed) {
      return null;
    }

    const parsedMessage = parseJsonMessage(trimmed);
    return parsedMessage ?? trimmed;
  }

  if (typeof payload !== 'object' || payload === null) {
    return null;
  }

  if ('message' in payload && typeof payload.message === 'string') {
    return cleanMessage(payload.message);
  }

  if ('error' in payload) {
    return messageFromPayload(payload.error);
  }

  if ('detail' in payload && typeof payload.detail === 'string') {
    return cleanMessage(payload.detail);
  }

  return null;
}

function parseJsonMessage(value: string): string | null {
  try {
    return messageFromPayload(JSON.parse(value));
  } catch {
    return null;
  }
}

function cleanMessage(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}
