# Think Bot Logger Module

This document describes the unified logging system for the Think Bot Chrome extension.

## Overview

The unified logger system (`logger.js`) provides consistent logging functionality across all Chrome extension contexts:
- **Service Worker** (background script)
- **Extension Pages** (sidebar, options, popup)
- **Content Scripts**
- **Web Pages**

## Features

- ✅ **Context Detection**: Automatically detects and adapts to different execution contexts
- ✅ **Module-specific Loggers**: Create dedicated loggers for each module
- ✅ **Configurable Log Levels**: ERROR, WARN, INFO, DEBUG, TRACE
- ✅ **Chrome Storage Integration**: Optional log storage for debugging
- ✅ **Consistent Formatting**: Unified timestamp and context formatting
- ✅ **Fallback Support**: Graceful fallback to console when logger is unavailable

## Usage

### 1. Service Worker Context (Background Script)

```javascript
// Import using importScripts
importScripts('../js/modules/logger.js');

// Create module-specific logger
const serviceLogger = logger.createModuleLogger('ServiceWorker');

// Use logger
serviceLogger.info('Service worker started');
serviceLogger.error('Error occurred:', error);
```

### 2. Extension Pages (Sidebar, Options, Popup)

```html
<!-- Include logger script -->
<script src="../js/modules/logger.js"></script>
```

```javascript
// For ES modules, use the utils.js helper
import { createLogger } from './modules/utils.js';
const logger = createLogger('ModuleName');

// Or access global logger directly
const logger = window.logger.createModuleLogger('ModuleName');

// Use logger
logger.info('Module initialized');
logger.warn('Warning message');
```

### 3. Content Scripts

```javascript
// Access global logger (injected by extension)
const logger = window.logger?.createModuleLogger('ContentScript') || console;

// Use logger with fallback
logger.info('Content script loaded');
```

## Logger Methods

### Basic Logging Methods
```javascript
logger.error('Error message', 'ModuleName', additionalData);
logger.warn('Warning message', 'ModuleName');
logger.info('Info message', 'ModuleName');
logger.debug('Debug message', 'ModuleName');
logger.trace('Trace message', 'ModuleName');
```

### Grouping and Timing
```javascript
// Console grouping
logger.group('Group Label', 'ModuleName');
logger.info('Message inside group');
logger.groupEnd();

// Performance timing
logger.time('operation-timer', 'ModuleName');
// ... some operation
logger.timeEnd('operation-timer', 'ModuleName');
```

### Module-specific Logger
```javascript
const moduleLogger = logger.createModuleLogger('MyModule');
moduleLogger.info('Module message'); // Automatically includes module name
```

## Configuration

### Log Levels
```javascript
// Set global log level
logger.setLevel('DEBUG'); // or logger.setLevel(LOG_LEVELS.DEBUG);

// Available levels (higher number = more verbose)
const LOG_LEVELS = {
  ERROR: 0,   // Only errors
  WARN: 1,    // Errors and warnings
  INFO: 2,    // Errors, warnings, and info (default)
  DEBUG: 3,   // All except trace
  TRACE: 4    // All messages
};
```

### Logger Configuration
```javascript
logger.configure({
  level: LOG_LEVELS.DEBUG,
  enableConsole: true,
  enableStorage: false,        // Enable Chrome storage logging
  maxStorageEntries: 1000,
  timestampFormat: 'ISO',      // 'ISO' or 'locale'
  modulePrefix: true,
  colorOutput: false
});
```

## Context Detection

The logger automatically detects the execution context:

```javascript
const context = logger.getContext();
// Returns: 'SERVICE_WORKER', 'EXTENSION_PAGE', 'CONTENT_SCRIPT', 'WEB_PAGE', or 'UNKNOWN'
```

## Storage Integration

When storage is enabled, logs are saved to Chrome storage:

```javascript
// Enable storage
logger.configure({ enableStorage: true });

// Retrieve stored logs
const logs = await logger.getStoredLogs(100); // Get last 100 entries

// Clear stored logs
await logger.clearStoredLogs();

// Export logs as text
const logText = await logger.exportLogs(1000);
```

## Migration from Old Logger

### Before (Multiple Logger Files)
```javascript
// Old imports
import { logger } from '../../js/modules/logger-module.js'; // ❌ Removed
// or
const logger = window.logger ? window.logger.createModuleLogger(moduleName) : console;
```

### After (Unified System)
```javascript
// For ES modules in sidebar
import { createLogger } from './utils.js';
const logger = createLogger('ModuleName');

// For service worker
importScripts('../js/modules/logger.js');
const logger = logger.createModuleLogger('ModuleName');

// For extension pages
// Include script tag, then:
const logger = window.logger.createModuleLogger('ModuleName');
```

## Testing

To test the logger system, you can run manual tests in the browser console:

```javascript
// Test basic functionality
logger.info('Test message', 'TestModule');
logger.getContext(); // Check current context
logger.createModuleLogger('TestModule').info('Module test');

// Test configuration
logger.setLevel('DEBUG');
logger.debug('Debug message should appear');
```

## Best Practices

1. **Always use module-specific loggers**: `createLogger('ModuleName')`
2. **Use appropriate log levels**: ERROR for errors, INFO for important events, DEBUG for detailed info
3. **Include context in messages**: Add relevant data as additional parameters
4. **Handle fallbacks**: Use the `createLogger` helper from utils.js for automatic fallback
5. **Clean up**: Don't leave DEBUG/TRACE logs in production code

## Error Handling

The logger system includes automatic error handling:
- **Storage unavailable**: Silently skips storage operations
- **Logger unavailable**: Falls back to console
- **Context detection fails**: Uses UNKNOWN context but continues working

## File Structure

```
js/modules/
├── logger.js              # ✅ Unified logger (main file)
└── README-LOGGER.md       # ✅ This documentation

sidebar/modules/
└── utils.js               # ✅ Helper functions including createLogger
```

---

*Note: This unified system replaces the previous `logger-module.js` file, providing better compatibility across all Chrome extension contexts.* 