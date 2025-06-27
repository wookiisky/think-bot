// Think Bot content script
// Runs in the context of web pages
// Handles content extraction and communication with the background script

// Use the logger module that was injected via manifest.json
// Create a module-specific logger for content script
const contentLogger = (() => {
  try {
    return (typeof logger !== 'undefined' && logger) ? logger.createModuleLogger('ContentScript') : console;
  } catch (e) {
    return console;
  }
})();

// Store any Readability.js script we might inject
let readabilityScript = null;

// Flag to track if the page is fully loaded
let pageLoaded = document.readyState === 'complete';

// Listen for page load complete event
window.addEventListener('load', () => {
  pageLoaded = true;
  contentLogger.info('Page fully loaded');
});

// Also listen for DOMContentLoaded as a backup
document.addEventListener('DOMContentLoaded', () => {
  if (!pageLoaded) {
    contentLogger.info('DOM content loaded');
  }
});

/**
 * Check if page is ready for content extraction
 * @returns {boolean} True if page is ready
 */
function isPageReadyForExtraction() {
  // Check multiple conditions for page readiness
  const hasBody = document.body && document.body.children.length > 0;
  const hasContent = document.documentElement.innerHTML.length > 1000; // Minimum content threshold
  const isComplete = document.readyState === 'complete';
  const isInteractive = document.readyState === 'interactive';

  return pageLoaded && hasBody && hasContent && (isComplete || isInteractive);
}

// Listen for messages from the background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  contentLogger.info('Content script received message:', message.type);
  
  if (message.type === 'GET_HTML_CONTENT') {
    // Check if the page is ready for content extraction
    if (isPageReadyForExtraction()) {
      contentLogger.info('Page ready for extraction, sending HTML content');
      sendResponse({
        htmlContent: document.documentElement.outerHTML
      });
    } else {
      // If the page is not yet ready, wait for it to be ready before returning content
      contentLogger.info('Page not ready for extraction yet, waiting...');

      // Set a timeout to prevent indefinite waiting
      const timeout = setTimeout(() => {
        contentLogger.warn('Timeout reached, sending current HTML content anyway');
        sendResponse({
          htmlContent: document.documentElement.outerHTML,
          warning: 'Page was not fully ready for extraction (timeout)'
        });
      }, 8000); // Increased timeout to 8 seconds for better reliability

      // Check readiness periodically
      const checkInterval = setInterval(() => {
        if (isPageReadyForExtraction()) {
          clearTimeout(timeout);
          clearInterval(checkInterval);
          contentLogger.info('Page became ready, sending HTML content');
          sendResponse({
            htmlContent: document.documentElement.outerHTML
          });
        }
      }, 500); // Check every 500ms

      // Also listen for the load event as a backup
      window.addEventListener('load', () => {
        if (!isPageReadyForExtraction()) {
          // Give it a bit more time after load event
          setTimeout(() => {
            clearTimeout(timeout);
            clearInterval(checkInterval);
            contentLogger.info('Page loaded (backup), sending HTML content');
            sendResponse({
              htmlContent: document.documentElement.outerHTML
            });
          }, 1000);
        }
      }, { once: true });

      return true; // Keep the message channel open for asynchronous response
    }
    return true;
  }
  
  if (message.type === 'EXTRACT_WITH_READABILITY') {
    try {
      // Load Readability.js if not already loaded
      if (!window.Readability) {
        // We would normally inject the script here, but for this extension
        // we'll be using the imported version in the background script
        contentLogger.warn('Readability.js not available in content script.');
      }
      
      // If Readability is available, use it
      if (window.Readability) {
        const documentClone = document.cloneNode(true);
        const article = new window.Readability(documentClone).parse();
        
        sendResponse({
          title: article.title,
          content: article.content,
          textContent: article.textContent,
          excerpt: article.excerpt
        });
      } else {
        // Fallback to basic extraction
        sendResponse({
          title: document.title,
          content: document.body.innerHTML,
          textContent: document.body.innerText,
          excerpt: document.body.innerText.substring(0, 200)
        });
      }
    } catch (error) {
      contentLogger.error('Error extracting content with Readability:', error);
      sendResponse({
        error: error.message || 'Error extracting content with Readability'
      });
    }
    return true;
  }
});

// Log when the content script has loaded
contentLogger.info('Think Bot content script loaded on:', document.location.href);