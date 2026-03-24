/**
 * Logger Utility - AI-Native DevOps Platform
 * Unified logging interface that wraps Fastify's logger (pino)
 * Falls back to console in environments where Fastify logger is not available
 */

import type { FastifyBaseLogger } from 'fastify';

// Global logger instance (will be set by the main server)
let globalLogger: FastifyBaseLogger | null = null;

/**
 * Set the global logger instance
 * Called once during server initialization
 */
export function setGlobalLogger(logger: FastifyBaseLogger): void {
  globalLogger = logger;
}

/**
 * Get the global logger instance
 * Returns null if not initialized
 */
export function getGlobalLogger(): FastifyBaseLogger | null {
  return globalLogger;
}

/**
 * Logger interface matching Fastify's logger for compatibility
 */
export interface Logger {
  info: (message: string, ...args: unknown[]) => void;
  warn: (message: string, ...args: unknown[]) => void;
  error: (message: string, ...args: unknown[]) => void;
  debug: (message: string, ...args: unknown[]) => void;
  trace: (message: string, ...args: unknown[]) => void;
}

/**
 * Create a logger instance for a specific component
 * Uses global logger if available, falls back to console
 */
export function createLogger(component: string): Logger {
  const prefix = `[${component}]`;

  return {
    info: (message: string, ...args: unknown[]) => {
      if (globalLogger) {
        globalLogger.info(`${prefix} ${message}`, ...args);
      } else if (process.env.NODE_ENV !== 'production') {
        console.log(`${prefix} ${message}`, ...args);
      }
    },
    warn: (message: string, ...args: unknown[]) => {
      if (globalLogger) {
        globalLogger.warn(`${prefix} ${message}`, ...args);
      } else {
        console.warn(`${prefix} ${message}`, ...args);
      }
    },
    error: (message: string, ...args: unknown[]) => {
      if (globalLogger) {
        globalLogger.error(`${prefix} ${message}`, ...args);
      } else {
        console.error(`${prefix} ${message}`, ...args);
      }
    },
    debug: (message: string, ...args: unknown[]) => {
      if (globalLogger) {
        globalLogger.debug(`${prefix} ${message}`, ...args);
      } else if (process.env.NODE_ENV === 'development') {
        console.log(`${prefix} ${message}`, ...args);
      }
    },
    trace: (message: string, ...args: unknown[]) => {
      if (globalLogger) {
        globalLogger.trace(`${prefix} ${message}`, ...args);
      }
    },
  };
}

/**
 * Default logger instance for use in modules
 * Falls back to console if global logger not set
 */
export const logger: Logger = {
  info: (message: string, ...args: unknown[]) => {
    if (globalLogger) {
      globalLogger.info(message, ...args);
    } else if (process.env.NODE_ENV !== 'production') {
      console.log(message, ...args);
    }
  },
  warn: (message: string, ...args: unknown[]) => {
    if (globalLogger) {
      globalLogger.warn(message, ...args);
    } else {
      console.warn(message, ...args);
    }
  },
  error: (message: string, ...args: unknown[]) => {
    if (globalLogger) {
      globalLogger.error(message, ...args);
    } else {
      console.error(message, ...args);
    }
  },
  debug: (message: string, ...args: unknown[]) => {
    if (globalLogger) {
      globalLogger.debug(message, ...args);
    } else if (process.env.NODE_ENV === 'development') {
      console.log(message, ...args);
    }
  },
  trace: (message: string, ...args: unknown[]) => {
    if (globalLogger) {
      globalLogger.trace(message, ...args);
    }
  },
};
