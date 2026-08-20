import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { asDomainError } from '../database/pg-errors';
import {
  ConflictError,
  DomainError,
  ForbiddenError,
  NotFoundError,
  RateLimitError,
  UnauthenticatedError,
  ValidationError,
} from './errors';

/**
 * The single place that maps a failure to a status code.
 *
 * It catches everything, not just DomainError, so that an unexpected throw —
 * a pg driver error, a null dereference — comes back as a plain 500 with the
 * detail written to the log instead of the response. A leaked
 * `error: syntax error at or near "grant"` tells an attacker about the schema.
 */
@Catch()
export class DomainExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('Request');

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();

    const { status, body } = this.render(exception);

    // a 5xx is ours to explain, so the detail goes to the log, not the caller
    if (status >= 500) {
      this.logger.error(
        exception instanceof Error ? exception.message : 'Unknown error',
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    response.status(status).json(body);
  }

  private render(exception: unknown): {
    status: number;
    body: Record<string, unknown>;
  } {
    // A constraint the caller tripped is their problem, not ours: a duplicate
    // code that lost a race must read the same as one caught by the pre-check,
    // not as a 500. Translated first so the branches below handle it normally.
    const translated = asDomainError(exception);
    if (translated) return this.render(translated);

    // thrown by the guards, the validation pipe and multer — already shaped
    if (exception instanceof HttpException) {
      const payload = exception.getResponse();
      return {
        status: exception.getStatus(),
        body:
          typeof payload === 'string'
            ? { statusCode: exception.getStatus(), message: payload }
            : (payload as Record<string, unknown>),
      };
    }

    if (exception instanceof ValidationError) {
      return {
        status: HttpStatus.BAD_REQUEST,
        body: { errors: exception.errors },
      };
    }

    if (exception instanceof RateLimitError) {
      return {
        status: HttpStatus.TOO_MANY_REQUESTS,
        body: {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          error: 'Too Many Requests',
          message: exception.message,
          retryAfterSeconds: exception.retryAfterSeconds,
        },
      };
    }

    if (exception instanceof ConflictError) {
      return {
        status: HttpStatus.CONFLICT,
        body: { reason: exception.reason },
      };
    }

    if (exception instanceof NotFoundError) {
      return {
        status: HttpStatus.NOT_FOUND,
        body: {
          statusCode: HttpStatus.NOT_FOUND,
          error: 'Not Found',
          message: exception.message,
        },
      };
    }

    if (exception instanceof UnauthenticatedError) {
      return {
        status: HttpStatus.UNAUTHORIZED,
        body: {
          statusCode: HttpStatus.UNAUTHORIZED,
          error: 'Unauthorized',
          message: exception.message,
        },
      };
    }

    if (exception instanceof ForbiddenError) {
      return {
        status: HttpStatus.FORBIDDEN,
        body: {
          statusCode: HttpStatus.FORBIDDEN,
          error: 'Forbidden',
          message: exception.message,
          ...exception.details,
        },
      };
    }

    // a DomainError subclass nobody mapped yet: still better than a 500
    if (exception instanceof DomainError) {
      return {
        status: HttpStatus.BAD_REQUEST,
        body: {
          statusCode: HttpStatus.BAD_REQUEST,
          error: 'Bad Request',
          message: exception.message,
        },
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: {
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        error: 'Internal Server Error',
        message: 'Something went wrong. The details are in the server log.',
      },
    };
  }
}
