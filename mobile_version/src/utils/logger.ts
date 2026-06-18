type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3
};

let currentLevel: LogLevel = import.meta.env.PROD ? 'warn' : 'debug';

function shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[currentLevel];
}

function formatPrefix(module: string): string {
    return `[${module}]`;
}

export function setLogLevel(level: LogLevel) {
    currentLevel = level;
}

export function createLogger(module: string) {
    const prefix = formatPrefix(module);

    return {
        debug: (...args: unknown[]) => {
            if (shouldLog('debug')) console.log(prefix, ...args);
        },
        info: (...args: unknown[]) => {
            if (shouldLog('info')) console.info(prefix, ...args);
        },
        warn: (...args: unknown[]) => {
            if (shouldLog('warn')) console.warn(prefix, ...args);
        },
        error: (...args: unknown[]) => {
            if (shouldLog('error')) console.error(prefix, ...args);
        }
    };
}

export const logger = createLogger('Flourish');
