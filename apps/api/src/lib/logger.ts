export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';
type Meta = Record<string, unknown>;

export interface Logger {
  debug(message: string, meta?: Meta): void;
  info(message: string, meta?: Meta): void;
  warn(message: string, meta?: Meta): void;
  error(message: string, meta?: Meta): void;
}

const PRIORITY: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40, silent: 99 };

const COLORS: Record<Exclude<LogLevel, 'silent'>, string> = {
  debug: '\x1b[90m',
  info: '\x1b[36m',
  warn: '\x1b[33m',
  error: '\x1b[31m',
};

/** Serializa errores para que no se pierdan mensaje ni stack al loguear. */
function normalize(meta: Meta): Meta {
  const out: Meta = {};
  for (const [key, value] of Object.entries(meta)) {
    out[key] =
      value instanceof Error
        ? { name: value.name, message: value.message, stack: value.stack }
        : value;
  }
  return out;
}

/**
 * Logger mínimo: JSON por línea en producción (apto para agregadores) y
 * formato legible en desarrollo. Sin dependencias.
 */
export function createLogger(options: { level: LogLevel; format: 'json' | 'pretty' }): Logger {
  const threshold = PRIORITY[options.level];

  const write = (level: Exclude<LogLevel, 'silent'>, message: string, meta: Meta = {}) => {
    if (PRIORITY[level] < threshold) return;
    const stream = level === 'error' || level === 'warn' ? process.stderr : process.stdout;
    const data = normalize(meta);

    if (options.format === 'json') {
      stream.write(
        `${JSON.stringify({ time: new Date().toISOString(), level, message, ...data })}\n`,
      );
      return;
    }

    const time = new Date().toISOString().slice(11, 19);
    const extra = Object.keys(data).length ? ` ${JSON.stringify(data)}` : '';
    stream.write(
      `\x1b[90m${time}\x1b[0m ${COLORS[level]}${level.toUpperCase().padEnd(5)}\x1b[0m ${message}${extra}\n`,
    );
  };

  return {
    debug: (message, meta) => write('debug', message, meta),
    info: (message, meta) => write('info', message, meta),
    warn: (message, meta) => write('warn', message, meta),
    error: (message, meta) => write('error', message, meta),
  };
}
