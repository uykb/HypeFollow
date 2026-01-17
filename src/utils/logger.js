const config = require('config');

const getTimestamp = () => new Date().toISOString();

const logger = {
  info: (message, meta = {}) => {
    const entry = {
      level: 'INFO',
      timestamp: getTimestamp(),
      message,
      ...meta
    };
    console.log(JSON.stringify(entry));
    notifyCollector('info', message, meta);
  },
  error: (message, error = null, meta = {}) => {
    // Flatten nested objects in meta to ensure visibility in JSON logs
    // If 'error' object itself has properties like code/response, we merge them
    let errorDetails = {};
    if (typeof error === 'object' && error !== null) {
        errorDetails = {
            errorMessage: error.message,
            stack: error.stack,
            code: error.code,
            response: error.response?.data ? JSON.stringify(error.response.data) : undefined
        };
    } else {
        errorDetails = { errorMessage: String(error) };
    }

    const entry = {
      level: 'ERROR',
      timestamp: getTimestamp(),
      message,
      ...errorDetails,
      ...meta
    };
    console.error(JSON.stringify(entry));
    notifyCollector('error', message, { ...meta, error: errorDetails.errorMessage });
  },
  warn: (message, meta = {}) => {
    const entry = {
      level: 'WARN',
      timestamp: getTimestamp(),
      message,
      ...meta
    };
    console.warn(JSON.stringify(entry));
    notifyCollector('warn', message, meta);
  },
  debug: (message, meta = {}) => {
    if (process.env.LOG_LEVEL === 'debug') {
      const entry = {
        level: 'DEBUG',
        timestamp: getTimestamp(),
        message,
        ...meta
      };
      console.debug(JSON.stringify(entry));
      notifyCollector('debug', message, meta);
    }
  }
};

function notifyCollector(level, message, meta) {
  // Avoid circular dependency by requiring at runtime or using a global/event bus
  try {
    const dataCollector = require('../monitoring/data-collector');
    if (dataCollector && typeof dataCollector.addLog === 'function') {
      dataCollector.addLog(level, message, meta);
    }
  } catch (e) {
    // Collector might not be initialized yet or not used
  }
}

module.exports = logger;
