export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type LogContext = unknown;

class Logger {
  private level: LogLevel = 'info';

  constructor() {
    if (import.meta.env?.DEV) {
      this.level = 'debug';
    }
  }

  private log(level: LogLevel, message: unknown, context?: LogContext) {
    if (level === 'debug' && this.level !== 'debug') return;
    const args = context === undefined ? [message] : [message, context];
    console[level](...args);
  }

  debug(message: unknown, context?: LogContext) {
    this.log('debug', message, context);
  }

  info(message: unknown, context?: LogContext) {
    this.log('info', message, context);
  }

  warn(message: unknown, context?: LogContext) {
    this.log('warn', message, context);
  }

  error(message: unknown, context?: LogContext) {
    this.log('error', message, context);
  }
}

export const logger = new Logger();
