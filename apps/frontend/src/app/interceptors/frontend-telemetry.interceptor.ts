import { HttpErrorResponse, HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { finalize, tap } from 'rxjs';

import { FrontendTelemetryService } from '../services/frontend-telemetry.service';

export const frontendTelemetryInterceptor: HttpInterceptorFn = (request, next) => {
  const telemetry = inject(FrontendTelemetryService);
  const startedAt = performance.now();
  let status = 0;

  return next(request).pipe(
    tap({
      next: (event) => {
        if (event instanceof HttpResponse) {
          status = event.status;
        }
      },
      error: (error: unknown) => {
        status = error instanceof HttpErrorResponse ? error.status : 0;
      },
    }),
    finalize(() => {
      telemetry.recordApi(request.method, request.urlWithParams, status, performance.now() - startedAt);
    }),
  );
};
