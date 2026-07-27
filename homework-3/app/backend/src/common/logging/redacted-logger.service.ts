import { ConsoleLogger } from '@nestjs/common';
import { redact } from './redaction.serializer';

/**
 * Structured JSON logger: every non-string argument is passed through the
 * redaction serializer before being stringified. Application code should
 * log entity IDs / codes / durations as plain strings and pass any
 * structured context object as a second argument so it gets redacted.
 */
export class RedactedLogger extends ConsoleLogger {
  log(message: unknown, ...optionalParams: unknown[]): void {
    super.log(this.format(message), ...optionalParams.map((p) => this.format(p)));
  }

  error(message: unknown, ...optionalParams: unknown[]): void {
    super.error(this.format(message), ...optionalParams.map((p) => this.format(p)));
  }

  warn(message: unknown, ...optionalParams: unknown[]): void {
    super.warn(this.format(message), ...optionalParams.map((p) => this.format(p)));
  }

  private format(value: unknown): string {
    if (typeof value === 'string') return value;
    try {
      return JSON.stringify(redact(value));
    } catch {
      return '[UNSERIALIZABLE]';
    }
  }
}
