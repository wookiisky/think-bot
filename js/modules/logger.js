// Think Bot Unified Logger Module
// Universal logging utility for Chrome Extension - compatible with all contexts
// Supports: Service Worker, Content Scripts, Extension Pages (sidebar, options, popup)

// Store a local reference to the original console methods
const _originalConsole = {
  log: console.log,
  error: console.error,
  warn: console.warn,
  debug: console.debug,
  group: console.group,
  groupEnd: console.groupEnd,
  time: console.time,
  timeEnd: console.timeEnd
};

// Log levels (higher number = more verbose)
const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3,
  TRACE: 4
};

// Default configuration - optimized for development and debugging
let loggerConfig = {
  level: LOG_LEVELS.INFO, // Show info, warnings and errors by default
  enableConsole: true,
  enableStorage: false,
  maxStorageEntries: 500, // Reduced storage entries
  timestampFormat: 'ISO', // 'ISO' or 'locale'
  modulePrefix: true,
  colorOutput: false
};

// Storage key for log entries
const LOG_STORAGE_KEY = 'thinkBotLogs';

// Context detection for Chrome extension
const EXTENSION_CONTEXT = (function() {
  try {
    // Check if we're in a service worker
    if (typeof importScripts === 'function' && typeof chrome !== 'undefined' && chrome.runtime) {
      return 'SERVICE_WORKER';
    }
    // Check if we're in an extension page (sidebar, options, popup)
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL && 
        location.href.startsWith(chrome.runtime.getURL(''))) {
      return 'EXTENSION_PAGE';
    }
    // Check if we're in a content script
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      return 'CONTENT_SCRIPT';
    }
    // Fallback to web page
    return 'WEB_PAGE';
  } catch (e) {
    return 'UNKNOWN';
  }
})();

// Create logger object
const logger = {};

/**
 * Configure the logger
 * @param {Object} config Configuration object
 */
logger.configure = function(config) {
  loggerConfig = { ...loggerConfig, ...config };
};

/**
 * Get current logger configuration
 * @returns {Object} Current configuration
 */
logger.getConfig = function() {
  return { ...loggerConfig };
};

/**
 * Get current extension context
 * @returns {string} Current context
 */
logger.getContext = function() {
  return EXTENSION_CONTEXT;
};

/**
 * Set log level
 * @param {string|number} level Log level name or number
 */
logger.setLevel = function(level) {
  if (typeof level === 'string') {
    level = LOG_LEVELS[level.toUpperCase()];
  }
  if (typeof level === 'number' && level >= 0 && level <= 4) {
    loggerConfig.level = level;
  }
};

/**
 * Get current log level
 * @returns {number} Current log level
 */
logger.getLevel = function() {
  return loggerConfig.level;
};

/**
 * Create a module-specific logger
 * @param {string} moduleName Name of the module
 * @returns {Object} Module logger with bound methods
 */
logger.createModuleLogger = function(moduleName) {
  return {
    error: (message, ...args) => logger.error(message, moduleName, ...args),
    warn: (message, ...args) => logger.warn(message, moduleName, ...args),
    info: (message, ...args) => logger.info(message, moduleName, ...args),
    debug: (message, ...args) => logger.debug(message, moduleName, ...args),
    trace: (message, ...args) => logger.trace(message, moduleName, ...args),
    group: (label) => logger.group(label, moduleName),
    groupEnd: () => logger.groupEnd(),
    time: (label) => logger.time(label, moduleName),
    timeEnd: (label) => logger.timeEnd(label, moduleName)
  };
};

/**
 * Log an error message
 * @param {string} message Log message
 * @param {string} module Module name (optional)
 * @param {...any} args Additional arguments
 */
logger.error = function(message, module, ...args) {
  _log('ERROR', message, module, ...args);
};

/**
 * Log a warning message
 * @param {string} message Log message
 * @param {string} module Module name (optional)
 * @param {...any} args Additional arguments
 */
logger.warn = function(message, module, ...args) {
  _log('WARN', message, module, ...args);
};

/**
 * Log an info message
 * @param {string} message Log message
 * @param {string} module Module name (optional)
 * @param {...any} args Additional arguments
 */
logger.info = function(message, module, ...args) {
  _log('INFO', message, module, ...args);
};

/**
 * Log a debug message
 * @param {string} message Log message
 * @param {string} module Module name (optional)
 * @param {...any} args Additional arguments
 */
logger.debug = function(message, module, ...args) {
  _log('DEBUG', message, module, ...args);
};

/**
 * Log a trace message
 * @param {string} message Log message
 * @param {string} module Module name (optional)
 * @param {...any} args Additional arguments
 */
logger.trace = function(message, module, ...args) {
  _log('TRACE', message, module, ...args);
};

/**
 * Create a console group
 * @param {string} label Group label
 * @param {string} module Module name (optional)
 */
logger.group = function(label, module) {
  if (!loggerConfig.enableConsole) return;
  
  const formattedLabel = _formatMessage('INFO', label, module);
  _originalConsole.group(formattedLabel);
};

/**
 * End a console group
 */
logger.groupEnd = function() {
  if (!loggerConfig.enableConsole) return;
  _originalConsole.groupEnd();
};

/**
 * Start a timer
 * @param {string} label Timer label
 * @param {string} module Module name (optional)
 */
logger.time = function(label, module) {
  if (!loggerConfig.enableConsole) return;
  
  const timerLabel = module ? `${module}: ${label}` : label;
  _originalConsole.time(timerLabel);
};

/**
 * End a timer
 * @param {string} label Timer label
 * @param {string} module Module name (optional)
 */
logger.timeEnd = function(label, module) {
  if (!loggerConfig.enableConsole) return;
  
  const timerLabel = module ? `${module}: ${label}` : label;
  _originalConsole.timeEnd(timerLabel);
};

/**
 * Get stored log entries
 * @param {number} limit Maximum number of entries to return
 * @returns {Promise<Array>} Array of log entries
 */
logger.getStoredLogs = async function(limit = 100) {
  if (!loggerConfig.enableStorage) return [];
  
  try {
    // Check if chrome.storage is available
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
      console.warn('Chrome storage not available in current context');
      return [];
    }
    
    const result = await chrome.storage.local.get(LOG_STORAGE_KEY);
    const logs = result[LOG_STORAGE_KEY] || [];
    return logs.slice(-limit);
  } catch (error) {
    console.error('Error getting stored logs:', error);
    return [];
  }
};

/**
 * Clear stored log entries
 * @returns {Promise<boolean>} Success status
 */
logger.clearStoredLogs = async function() {
  if (!loggerConfig.enableStorage) return true;
  
  try {
    // Check if chrome.storage is available
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
      console.warn('Chrome storage not available in current context');
      return false;
    }
    
    await chrome.storage.local.remove(LOG_STORAGE_KEY);
    return true;
  } catch (error) {
    console.error('Error clearing stored logs:', error);
    return false;
  }
};

/**
 * Export logs as text
 * @param {number} limit Maximum number of entries to export
 * @returns {Promise<string>} Formatted log text
 */
logger.exportLogs = async function(limit = 1000) {
  const logs = await logger.getStoredLogs(limit);
  return logs.map(log => 
    `[${log.timestamp}] ${log.level} ${log.module ? `[${log.module}] ` : ''}${log.message}`
  ).join('\n');
};

// Internal logging function
function _log(level, message, module, ...args) {
  const levelNum = LOG_LEVELS[level];
  
  // Check if this log level should be output
  if (levelNum > loggerConfig.level) return;
  
  // Create log entry
  const logEntry = {
    timestamp: _getTimestamp(),
    level: level,
    module: typeof module === 'string' ? module : null,
    message: message,
    args: args.length > 0 ? args : null,
    context: EXTENSION_CONTEXT
  };
  
  // Output to console if enabled
  if (loggerConfig.enableConsole) {
    _outputToConsole(logEntry);
  }
  
  // Store log if enabled
  if (loggerConfig.enableStorage) {
    _storeLog(logEntry);
  }
}

// Safe JSON stringify that handles circular references
function _safeStringify(obj, indent = 0) {
  const seen = new WeakSet();

  return JSON.stringify(obj, function(key, val) {
    if (val != null && typeof val === 'object') {
      if (seen.has(val)) {
        return '[Circular Reference]';
      }
      seen.add(val);
    }
    return val;
  }, indent);
}

// Format message for display
function _formatMessage(level, message, module) {
  const timestamp = _getTimestamp();
  const modulePrefix = module && loggerConfig.modulePrefix ? `[${module}] ` : '';
  const contextPrefix = EXTENSION_CONTEXT !== 'UNKNOWN' ? `[${EXTENSION_CONTEXT}] ` : '';
  return `[${timestamp}] ${level} ${contextPrefix}${modulePrefix}${message}`;
}

// Output log to console with appropriate method and styling
function _outputToConsole(logEntry) {
  const { level, message, module, args } = logEntry;
  const formattedMessage = _formatMessage(level, message, module);
  
  // Choose console method based on log level
  let consoleMethod;
  switch (level) {
    case 'ERROR':
      consoleMethod = _originalConsole.error;
      break;
    case 'WARN':
      consoleMethod = _originalConsole.warn;
      break;
    case 'DEBUG':
    case 'TRACE':
      consoleMethod = _originalConsole.debug;
      break;
    default:
      consoleMethod = _originalConsole.log;
  }
  
  // Process args to handle objects better
  const processedArgs = (args || []).map(arg => {
    if (arg && typeof arg === 'object' && arg.constructor === Object) {
      // For plain objects, try to serialize them for better display
      try {
        return _safeStringify(arg, 2);
      } catch (serializeError) {
        return `[Object serialization failed: ${arg.toString()}]`;
      }
    }
    return arg;
  });

  // Output with processed arguments
  consoleMethod(formattedMessage, ...processedArgs);
}

// Store log entry to chrome storage
async function _storeLog(logEntry) {
  try {
    // Check if chrome.storage is available
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
      return; // Silently skip storage in contexts where it's not available
    }
    
    const result = await chrome.storage.local.get(LOG_STORAGE_KEY);
    let logs = result[LOG_STORAGE_KEY] || [];
    
    // Add new log entry
    logs.push({
      timestamp: logEntry.timestamp,
      level: logEntry.level,
      module: logEntry.module,
      message: logEntry.message,
      context: logEntry.context
    });
    
    // Trim logs if exceeding max entries
    if (logs.length > loggerConfig.maxStorageEntries) {
      logs = logs.slice(-loggerConfig.maxStorageEntries);
    }
    
    // Save back to storage
    await chrome.storage.local.set({ [LOG_STORAGE_KEY]: logs });
  } catch (error) {
    // Don't use logger here to avoid potential infinite loops
  }
}

// Get formatted timestamp
function _getTimestamp() {
  const now = new Date();
  
  if (loggerConfig.timestampFormat === 'locale') {
    return now.toLocaleString();
  } else {
    return now.toISOString();
  }
}

// Initialize logger with default configuration
logger.configure({});

// Make logger available globally for Chrome extension contexts
if (typeof window !== 'undefined') {
  window.logger = logger;
  window.LOG_LEVELS = LOG_LEVELS;
}

// Export for modules (if supported in context)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { logger, LOG_LEVELS };
}

// Also expose directly for importScripts context
if (typeof self !== 'undefined' && typeof importScripts === 'function') {
  self.logger = logger;
  self.LOG_LEVELS = LOG_LEVELS;
} 