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
    // O logger é o único ponto de saída estruturada para stdout.
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(entry));
  }
}

export const logger = {
  error: (message, meta) => log('error', message, meta),
  warn: (message, meta) => log('warn', message, meta),
  info: (message, meta) => log('info', message, meta),
  debug: (message, meta) => log('debug', message, meta),
};
