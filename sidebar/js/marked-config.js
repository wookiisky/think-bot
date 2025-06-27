/**
 * marked-config.js - Configure marked.js options for optimal rendering
 * This file configures marked.js to prevent excessive whitespace and line breaks
 */

// Configure marked.js options to prevent excessive whitespace and line breaks
if (typeof window.marked !== 'undefined') {
  window.marked.setOptions({
    breaks: false,        // Don't convert single line breaks to <br> tags
    gfm: true,           // Enable GitHub Flavored Markdown
    pedantic: false,     // Don't be pedantic about spacing
    silent: false        // Don't silently ignore errors
  });
  
    } else {
    console.error('[Marked Config] marked.js library not found');
} 