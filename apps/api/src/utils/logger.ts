/**
 * @file utils/logger.ts
 * @description Centralized Winston logger.
 *
 * ## Format strategy
 *
 * The logger uses different formats depending on the environment:
 *
 * - **production** — `winston.format.json()` on the Console transport.
 *   Outputs structured JSON so log-aggregation tools (Render's log drain,
 *   Datadog, Logtail, etc.) can parse fields like `level`, `timestamp`, and
 *   `message` without regex hacking.
 *
 * - **development / test** — colorized simple format for human readability.
 *
 * ## Bug fixed (Claude review)
 *
 * The original implementation set `winston.format.json()` at the logger level
 * but then unconditionally overrode it at the Console transport level with
 * `colorize() + simple()`, causing production logs to be colorized plain-text
 * despite the intent.  Winston applies the transport-level format last, so the
 * logger-level format was a no-op.  This is now corrected — the transport's
 * format is conditioned on `NODE_ENV`.
 *
 * ## Usage
 *
 * ```ts
 * import logger from '../utils/logger';
 * logger.info('Server started', { port: 4000 });
 * logger.error('DB error', { stack: err.stack });
 * logger.debug('Socket joined', { socketId, userId });
 * ```
 */

import winston from 'winston';

const isProd = process.env.NODE_ENV === 'production';

/**
 * App-wide logger instance.
 *
 * Level threshold:
 * - `info`  in production (debug logs suppressed)
 * - `debug` in development (all logs shown)
 */
const logger = winston.createLogger({
  level: isProd ? 'info' : 'debug',

  // Base format applied to all transports unless a transport overrides it.
  // In production this is the effective format because the Console transport
  // below also uses json() in production.
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),

  transports: [
    new winston.transports.Console({
      /**
       * Transport-level format — this takes precedence over the logger-level format.
       *
       * Production: json() — structured output for log aggregation.
       * Development: colorize() + simple() — human-friendly colored output.
       */
      format: isProd
        ? winston.format.combine(
            winston.format.timestamp(),
            winston.format.errors({ stack: true }),
            winston.format.json()
          )
        : winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
          ),
    }),
  ],
});

export default logger;
