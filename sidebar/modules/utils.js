/**
 * utils.js - Common utility functions for sidebar modules
 */

// Create logger instance using the unified logger system
const createLogger = (moduleName) => {
  // Check if the unified logger is available
  if (typeof window !== 'undefined' && window.logger && typeof window.logger.createModuleLogger === 'function') {
    return window.logger.createModuleLogger(moduleName);
  }
  
  // Fallback to console if logger is not available
  console.warn(`Logger not available for module: ${moduleName}, falling back to console`);
  return {
    error: (...args) => console.error(`[${moduleName}]`, ...args),
    warn: (...args) => console.warn(`[${moduleName}]`, ...args),
    info: (...args) => console.info(`[${moduleName}]`, ...args),
    debug: (...args) => console.debug(`[${moduleName}]`, ...args),
    trace: (...args) => console.debug(`[${moduleName}] TRACE:`, ...args),
    group: (label) => console.group(`[${moduleName}] ${label}`),
    groupEnd: () => console.groupEnd(),
    time: (label) => console.time(`[${moduleName}] ${label}`),
    timeEnd: (label) => console.timeEnd(`[${moduleName}] ${label}`)
  };
};

// Check if URL is a restricted page
const isRestrictedPage = (url) => {
  if (!url) return true;
  
  const restrictedPrefixes = [
    'chrome://',
    'chrome-extension://',
    'edge://',
    'about:',
    'moz-extension://',
    'chrome-search://',
    'chrome-devtools://',
    'devtools://'
  ];
  
  return restrictedPrefixes.some(prefix => url.startsWith(prefix));
};

// Escape HTML special characters
const escapeHtml = (text) => {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
};

// Show copy success toast notification
const showCopyToast = (message) => {
  // Create toast element
  const toast = document.createElement('div');
  toast.className = 'copy-toast';
  toast.textContent = message;
  
  // Add to document
  document.body.appendChild(toast);
  
  // Remove after 2 seconds
  setTimeout(() => {
    toast.classList.add('fadeout');
    setTimeout(() => document.body.removeChild(toast), 300);
  }, 2000);
};

// Check if content contains markdown elements
const hasMarkdownElements = (content) => {
  if (!content || typeof content !== 'string') return false;
  
  // Check for common markdown patterns
  const markdownPatterns = [
    // Headers (# ## ###)
    /^#{1,6}\s+.*/m,
    // Bold (**text** or __text__)
    /(\*\*|__).+?\1/,
    // Italic (*text* or _text_)
    /(\*|_)[^*_\s].+?\1/,
    // Code blocks (```code```)
    /```[\s\S]*?```/,
    // Inline code (`code`)
    /`[^`]+`/,
    // Links ([text](url) or [text][ref])
    /\[.+?\]\(.+?\)|\[.+?\]\[.+?\]/,
    // Images (![alt](url))
    /!\[.*?\]\(.+?\)/,
    // Unordered lists (- item or * item or + item)
    /^[\s]*[-*+]\s+.*/m,
    // Ordered lists (1. item)
    /^[\s]*\d+\.\s+.*/m,
    // Blockquotes (> text)
    /^[\s]*>\s+.*/m,
    // Horizontal rules (--- or ***)
    /^[\s]*(-{3,}|\*{3,}|_{3,})[\s]*$/m,
    // Tables (| col | col |)
    /\|.+\|/,
    // Strikethrough (~~text~~)
    /~~.+?~~/
  ];
  
  return markdownPatterns.some(pattern => pattern.test(content));
};

export {
  createLogger,
  isRestrictedPage,
  escapeHtml,
  showCopyToast,
  hasMarkdownElements
}; 