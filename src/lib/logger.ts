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
    if (level === 'error') {
      if (context) console.error(message, context);
      else console.error(message);
    } else if (level === 'warn') {
      if (context) console.warn(message, context);
      else console.warn(message);
    } else if (level === 'info') {
      if (context) console.info(message, context);
      else console.info(message);
    } else if (level === 'debug') {
      if (this.level === 'debug') {
        if (context) console.debug(message, context);
        else console.debug(message);
      }
    }
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
