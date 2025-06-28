// Think Bot utils.js
// Common utility functions

// Create a global utils object
var utils = {};

/**
 * Generate a unique ID using UUID with timestamp
 * @returns {string} A unique ID
 */
utils.generateUniqueId = function() {
  // Generate timestamp component
  const timestamp = Date.now().toString(36);

  // Generate UUID v4 format
  const uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });

  // Combine timestamp with UUID for better traceability
  return `${timestamp}_${uuid}`;
}

/**
 * Sanitize HTML to prevent XSS attacks
 * Simple implementation, consider using DOMPurify in production
 * @param {string} html HTML string to sanitize
 * @returns {string} Sanitized HTML
 */
utils.sanitizeHtml = function(html) {
  const tempDiv = document.createElement('div');
  tempDiv.textContent = html;
  return tempDiv.innerHTML;
}

/**
 * Debounce function to limit how often a function is called
 * @param {Function} func The function to debounce
 * @param {number} delay The delay in milliseconds
 * @returns {Function} Debounced function
 */
utils.debounce = function(func, delay) {
  let timeoutId;
  return function(...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      func.apply(this, args);
    }, delay);
  };
}

/**
 * Throttle function to limit how often a function is called
 * @param {Function} func The function to throttle
 * @param {number} limit The time limit in milliseconds
 * @returns {Function} Throttled function
 */
utils.throttle = function(func, limit) {
  let inThrottle;
  return function(...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

/**
 * Check if a string is a valid URL
 * @param {string} string The string to check
 * @returns {boolean} True if valid URL, false otherwise
 */
utils.isValidUrl = function(string) {
  try {
    new URL(string);
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Convert Markdown to plain text
 * @param {string} markdown Markdown string
 * @returns {string} Plain text
 */
utils.markdownToText = function(markdown) {
  if (!markdown) return '';
  
  // Replace headers
  let text = markdown.replace(/#+\s+(.*)/g, '$1');
  
  // Replace bold and italic
  text = text.replace(/\*\*(.*?)\*\*/g, '$1');
  text = text.replace(/\*(.*?)\*/g, '$1');
  text = text.replace(/__(.*?)__/g, '$1');
  text = text.replace(/_(.*?)_/g, '$1');
  
  // Replace links
  text = text.replace(/\[(.*?)\]\(.*?\)/g, '$1');
  
  // Replace code blocks
  text = text.replace(/```[\s\S]*?```/g, '');
  text = text.replace(/`(.*?)`/g, '$1');
  
  // Replace lists
  text = text.replace(/^\s*[-*+]\s+(.*)/gm, '$1');
  text = text.replace(/^\s*\d+\.\s+(.*)/gm, '$1');
  
  // Replace blockquotes
  text = text.replace(/^\s*>\s+(.*)/gm, '$1');
  
  // Remove line breaks and trim
  text = text.replace(/\n+/g, ' ').trim();
  
  return text;
} 