import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable, from, of } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { PrismaService } from '../../prisma/prisma.service';
import { DomainErrors } from '../errors/domain-error';

/**
 * Idempotency-Key support for mutating endpoints (specification.md §5.5,
 * agents.md §7 rule 3): a retried key returns the *original* response
 * (same status, same body) without re-executing the handler.
 *
 * Missing header on a route that requires one -> 400 IDEMPOTENCY_KEY_REQUIRED.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const userId = request.user?.id;
    const key = request.headers['idempotency-key'] as string | undefined;

    if (!key) {
      throw DomainErrors.idempotencyKeyRequired();
    }
    if (!userId) {
      // Should be unreachable: JwtAuthGuard runs before this interceptor.
      throw DomainErrors.unauthorized();
    }

    return from(
      this.prisma.idempotencyKey.findUnique({ where: { userId_key: { userId, key } } }),
    ).pipe(
      switchMap((existing) => {
        if (existing) {
          response.status(existing.responseStatus);
          return of(JSON.parse(existing.responseBody));
        }
        return next.handle().pipe(
          switchMap((body: unknown) =>
            from(
              this.prisma.idempotencyKey.create({
                data: {
                  userId,
                  key,
                  method: request.method,
                  path: request.originalUrl ?? request.url,
                  responseStatus: response.statusCode ?? 200,
                  responseBody: JSON.stringify(body ?? null),
                },
              }),
            ).pipe(switchMap(() => of(body))),
          ),
        );
      }),
    );
  }
}
