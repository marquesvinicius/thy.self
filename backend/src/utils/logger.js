const levels = { error: 0, warn: 1, info: 2, debug: 3 };

function formatTimestamp() {
  return new Date().toISOString();
}

function log(level, message, meta = {}) {
  const entry = {
    timestamp: formatTimestamp(),
    level,
    message,
    ...meta,
  };
  if (level === 'error') {
    console.error(JSON.stringify(entry));
  } else {
    console.log(JSON.stringify(entry));
  }
}

export const logger = {
  error: (message, meta) => log('error', message, meta),
  warn: (message, meta) => log('warn', message, meta),
  info: (message, meta) => log('info', message, meta),
  debug: (message, meta) => log('debug', message, meta),
};
