import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { DomainError } from './domain-error';

interface ProblemJson {
  type: string;
  title: string;
  status: number;
  detail: string;
  code: string;
  [key: string]: unknown;
}

/**
 * Global RFC 7807 (application/problem+json) exception filter.
 *
 * Logging here is entity/code/timing only — never the request/response body
 * (agents.md §6, "never log request/response bodies of financial
 * endpoints"; specification.md §5.7).
 */
@Catch()
export class ProblemJsonFilter implements ExceptionFilter {
  private readonly logger = new Logger('ProblemJsonFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const requestId = (request.headers['x-request-id'] as string | undefined) ?? undefined;

    const problem = this.toProblemJson(exception);

    this.logger.log(
      JSON.stringify({
        msg: 'request_error',
        method: request.method,
        path: request.url,
        status: problem.status,
        code: problem.code,
        requestId,
      }),
    );

    response.status(problem.status).set('Content-Type', 'application/problem+json').json(problem);
  }

  private toProblemJson(exception: unknown): ProblemJson {
    if (exception instanceof DomainError) {
      return {
        type: `https://horizon.app/problems/${exception.code.toLowerCase()}`,
        title: exception.code,
        status: exception.status,
        detail: exception.detail,
        code: exception.code,
        ...(exception.extra ?? {}),
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      const detail =
        typeof body === 'string'
          ? body
          : Array.isArray((body as { message?: unknown }).message)
            ? (body as { message: string[] }).message.join('; ')
            : ((body as { message?: string }).message ?? exception.message);
      const code = this.codeForStatus(status);
      return {
        type: `https://horizon.app/problems/${code.toLowerCase()}`,
        title: code,
        status,
        detail,
        code,
      };
    }

    return this.internalError(exception);
  }

  private codeForStatus(status: number): string {
    switch (status) {
      case HttpStatus.UNAUTHORIZED:
        return 'UNAUTHORIZED';
      case HttpStatus.FORBIDDEN:
        return 'FORBIDDEN';
      case HttpStatus.NOT_FOUND:
        return 'NOT_FOUND';
      case HttpStatus.TOO_MANY_REQUESTS:
        return 'TOO_MANY_REQUESTS';
      default:
        return 'VALIDATION_ERROR';
    }
  }

  private internalError(exception: unknown): ProblemJson {
    // Unknown/unexpected: never leak internals; log server-side only (no body).
    this.logger.error(
      'Unhandled exception',
      exception instanceof Error ? exception.stack : String(exception),
    );
    return {
      type: 'https://horizon.app/problems/internal-error',
      title: 'INTERNAL_SERVER_ERROR',
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      detail: 'An unexpected error occurred.',
      code: 'INTERNAL_SERVER_ERROR',
    };
  }
}
