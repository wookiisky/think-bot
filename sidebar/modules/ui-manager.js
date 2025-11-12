/**
 * ui-manager.js - UI state management and DOM operations
 */

import { i18n } from '../../js/modules/i18n.js';
import { createLogger, escapeHtml } from './utils.js';

const logger = createLogger('UIManager');

// DOM elements cache
let elements = {};

/**
 * Initialize DOM element references
 */
const initElements = () => {
  elements = {
    extractedContentElem: document.getElementById('extractedContent'),
    loadingIndicator: document.getElementById('loadingIndicator'),
    extractionError: document.getElementById('extractionError'),
    chatContainer: document.getElementById('chatContainer'),
    userInput: document.getElementById('userInput'),
    sendBtn: document.getElementById('sendBtn'),
    exportBtn: document.getElementById('exportBtn'),
    clearBtn: document.getElementById('clearBtn'),
    jinaExtractBtn: document.getElementById('jinaExtractBtn'),
    readabilityExtractBtn: document.getElementById('readabilityExtractBtn'),
    tabContainer: document.getElementById('tabContainer'),
    imagePreviewContainer: document.getElementById('imagePreviewContainer'),
    imagePreview: document.getElementById('imagePreview'),
    removeImageBtn: document.getElementById('removeImageBtn'),
    copyContentBtn: document.getElementById('copyContentBtn'),
    retryExtractBtn: document.getElementById('retryExtractBtn'),
    contentSection: document.getElementById('contentSection'),
    resizeHandle: document.getElementById('resizeHandle'),
    includePageContentBtn: document.getElementById('includePageContentBtn'),
    inputResizeHandle: document.getElementById('inputResizeHandle'),
    buttonGroup: document.getElementById('inputActions'),
    clearPageDataBtn: document.getElementById('clearPageDataBtn'),
    openOptionsBtn: document.getElementById('openOptionsBtn'),
    openChatBtn: document.getElementById('openChatBtn'),
    openGithubBtn: document.getElementById('openGithubBtn')
  };
  
  // Check for critical missing elements and log detailed information
  const missingElements = [];
  const criticalElements = ['userInput', 'chatContainer', 'sendBtn'];
  const optionalElements = ['removeImageBtn', 'imagePreviewContainer', 'imagePreview'];
  
  Object.keys(elements).forEach(key => {
    if (!elements[key]) {
      missingElements.push(key);
    }
  });
  
  if (missingElements.length > 0) {
    // Separate critical and optional missing elements
    const missingCritical = missingElements.filter(elem => criticalElements.includes(elem));
    const missingOptional = missingElements.filter(elem => optionalElements.includes(elem));
    const missingOther = missingElements.filter(elem => !criticalElements.includes(elem) && !optionalElements.includes(elem));
    
    // Only warn about non-critical missing elements
    if (missingOther.length > 0) {
      logger.warn('Missing UI elements detected:', missingOther);
    }
    
    // Log optional elements as info level
    if (missingOptional.length > 0) {
      logger.info('Optional UI elements not found (will be initialized when needed):', missingOptional);
    }
    
    // Error for critical elements
    if (missingCritical.length > 0) {
      logger.error('Critical UI elements missing:', missingCritical);
    }
    
    // For debugging, check if elements exist in DOM using querySelector
    const elementExistenceCheck = {};
    missingElements.forEach(elementKey => {
      const elementId = elementKey === 'extractedContentElem' ? 'extractedContent' : 
                       elementKey === 'buttonGroup' ? 'inputActions' : elementKey;
      elementExistenceCheck[elementKey] = !!document.querySelector(`#${elementId}`);
    });
    
    logger.debug('Element existence check in DOM:', elementExistenceCheck);
  } else {
    logger.info('All UI elements successfully initialized');
  }

  return elements;
};

/**
 * Get DOM element with lazy initialization for optional elements
 * @param {string} elementId - Element ID
 * @returns {HTMLElement} DOM element
 */
const getElement = (elementId) => {
  // If element doesn't exist, try to get it again for optional elements
  if (!elements[elementId]) {
    const optionalElements = ['removeImageBtn', 'imagePreviewContainer', 'imagePreview'];
    if (optionalElements.includes(elementId)) {
      logger.debug(`Attempting lazy initialization for optional element: ${elementId}`);
      elements[elementId] = document.getElementById(elementId);
      if (elements[elementId]) {
        logger.info(`Successfully initialized optional element: ${elementId}`);
      } else {
        logger.warn(`Failed to initialize optional element: ${elementId}`);
        
        // Additional debugging for removeImageBtn
        if (elementId === 'removeImageBtn') {
          const container = document.getElementById('imagePreviewContainer');
          const header = container ? container.querySelector('.image-preview-header') : null;
          const removeBtn = header ? header.querySelector('button') : null;
          const removeBtnByClass = document.querySelector('.remove-image-btn');
          
          logger.debug('RemoveImageBtn detailed debug:', {
            containerId: container ? container.id : 'not found',
            containerExists: !!container,
            containerHidden: container ? container.classList.contains('hidden') : 'N/A',
            headerExists: !!header,
            buttonInHeader: !!removeBtn,
            removeBtnByClass: !!removeBtnByClass,
            documentReady: document.readyState,
            allButtons: Array.from(document.querySelectorAll('button')).map(btn => btn.id || btn.className)
          });
        }
      }
    }
  }
  return elements[elementId];
};

/**
 * Ensure image-related elements are available (lazy initialization)
 * @returns {Object} Object containing image-related elements
 */
const ensureImageElements = () => {
  const imageElements = {
    imagePreviewContainer: getElement('imagePreviewContainer'),
    imagePreview: getElement('imagePreview'), 
    removeImageBtn: getElement('removeImageBtn')
  };
  
  // Update the main elements object with any newly found elements
  Object.assign(elements, imageElements);
  
  return imageElements;
};

/**
 * Get all DOM elements
 * @returns {Object} All DOM elements
 */
const getAllElements = () => {
  return { ...elements };
};

/**
 * Clear all display states completely
 */
const clearAllStates = () => {
  // Hide all main display elements
  elements.loadingIndicator.classList.add('hidden');
  elements.extractedContentElem.classList.add('hidden');
  elements.extractionError.classList.add('hidden');
  
  // Clear any content/text
  elements.extractionError.textContent = '';
  elements.extractionError.innerHTML = '';
  
  // Clear loading text
  const loadingText = elements.loadingIndicator.querySelector('.loading-text');
  if (loadingText) {
    loadingText.textContent = '';
  }
  
  
};

/**
 * Show loading state
 * @param {string} message - Loading message
 */
const showLoading = (message = i18n.getMessage('sidebar_text_extractingContent')) => {
  // First, completely clear all states to prevent overlapping
  clearAllStates();
  
  // Force a DOM reflow to ensure changes are applied immediately
  void elements.loadingIndicator.offsetHeight;
  
  // Now show loading state
  elements.loadingIndicator.classList.remove('hidden');
  elements.extractedContentElem.classList.add('hidden');
  elements.extractionError.classList.add('hidden');
  
  // Update loading text
  const loadingText = elements.loadingIndicator.querySelector('.loading-text');
  if (loadingText) {
    loadingText.textContent = message;
  }
  
  // Show buttons but in disabled state
  elements.copyContentBtn.classList.add('visible');
  elements.retryExtractBtn.classList.add('visible');
  elements.copyContentBtn.classList.add('disabled');
  elements.retryExtractBtn.classList.add('disabled');
  elements.copyContentBtn.classList.remove('enabled');
  elements.retryExtractBtn.classList.remove('enabled');
  elements.copyContentBtn.disabled = true;
  elements.retryExtractBtn.disabled = true;
  
  // Disable extraction method switching during extraction
  elements.jinaExtractBtn.disabled = true;
  elements.readabilityExtractBtn.disabled = true;
  
  
};

/**
 * Hide loading state
 */
const hideLoading = () => {
  elements.loadingIndicator.classList.add('hidden');
  elements.extractedContentElem.classList.remove('hidden');
  
  // Re-enable extraction method switching after extraction
  elements.jinaExtractBtn.disabled = false;
  elements.readabilityExtractBtn.disabled = false;
  
  
};

/**
 * Show extraction error
 * @param {string|Error} error - Error message
 */
const showExtractionError = (error) => {
  // Try to use unified error handler
  import('./error-handler.js').then(({ default: errorHandler, ERROR_TYPES }) => {
    errorHandler.handleError(error, ERROR_TYPES.EXTRACTION_ERROR, {
      uiElements: elements
    });
  }).catch(importError => {
    logger.error('Failed to import error handler, using fallback:', importError);
    // Fallback to original implementation
    showExtractionErrorFallback(error);
  });
};

/**
 * Fallback extraction error display
 * @param {*} error - Error information
 */
const showExtractionErrorFallback = (error) => {
  // First, completely clear all states to prevent overlapping
  clearAllStates();
  
  // Force a DOM reflow to ensure changes are applied immediately
  void elements.extractionError.offsetHeight;
  
  // Now show error state
  elements.loadingIndicator.classList.add('hidden');
  elements.extractedContentElem.classList.add('hidden');
  elements.extractionError.classList.remove('hidden');
  
  // Show both buttons, but only enable retry button
  elements.copyContentBtn.classList.add('visible');
  elements.retryExtractBtn.classList.add('visible');
  
  // Copy button disabled (gray)
  elements.copyContentBtn.classList.add('disabled');
  elements.copyContentBtn.classList.remove('enabled');
  elements.copyContentBtn.disabled = true;
  
  // Retry button enabled (primary color)
  elements.retryExtractBtn.classList.remove('disabled');
  elements.retryExtractBtn.classList.add('enabled');
  elements.retryExtractBtn.disabled = false;
  
  // Re-enable extraction method buttons so users can try different methods after error
  if (elements.jinaExtractBtn && elements.readabilityExtractBtn) {
    elements.jinaExtractBtn.disabled = false;
    elements.readabilityExtractBtn.disabled = false;
  }
  
  let errorMessage = i18n.getMessage('sidebar_text_failedToExtractContent'); // Default message
  if (error) {
    if (error === 'CONTENT_SCRIPT_NOT_CONNECTED') {
      errorMessage = i18n.getMessage('sidebar_errorHandler_error_contentScript');
    } else if (error === 'page_loading_or_script_issue') {
      errorMessage = i18n.getMessage('sidebar_errorHandler_error_pageNotReady');
    } else if (error === 'page_loading') {
      errorMessage = i18n.getMessage('sidebar_errorHandler_error_pageLoading');
    } else if (typeof error === 'string') {
      // Handle specific readability errors
      if (error.includes('Readability library not loaded')) {
        errorMessage = i18n.getMessage('sidebar_errorHandler_error_readabilityLoad');
      } else if (error.includes('Failed to extract content with Readability')) {
        errorMessage = i18n.getMessage('sidebar_errorHandler_error_readabilityExtract');
      } else if (error.includes('HTML content is required')) {
        errorMessage = i18n.getMessage('sidebar_errorHandler_error_noHtml');
      } else if (error.includes('Processing error')) {
        errorMessage = i18n.getMessage('sidebar_errorHandler_error_processing');
      } else if (error.includes('offscreen')) {
        errorMessage = i18n.getMessage('sidebar_errorHandler_error_offscreen');
      } else {
        errorMessage = error;
      }
    } else if (error.message) {
      errorMessage = error.message;
    } else {
      try {
        errorMessage = JSON.stringify(error);
      } catch (e) {
        // If stringify fails, use default message
      }
    }
  }
  elements.extractionError.textContent = errorMessage;
  
};

/**
 * Show restricted page message
 */
const showRestrictedPageMessage = () => {
  elements.loadingIndicator.classList.add('hidden');
  elements.extractedContentElem.classList.add('hidden');
  elements.extractionError.classList.remove('hidden');
  
  // Show buttons but keep them disabled
  elements.copyContentBtn.classList.add('visible');
  elements.retryExtractBtn.classList.add('visible');
  elements.copyContentBtn.classList.add('disabled');
  elements.retryExtractBtn.classList.add('disabled');
  elements.copyContentBtn.classList.remove('enabled');
  elements.retryExtractBtn.classList.remove('enabled');
  elements.copyContentBtn.disabled = true;
  elements.retryExtractBtn.disabled = true;
  
  // Clear existing content
  elements.extractionError.innerHTML = '';
  
  // Create restricted page message
  const messageDiv = document.createElement('div');
  messageDiv.style.cssText = 'padding: 20px; text-align: center; color: #666;';
  
  messageDiv.innerHTML = `
    <div style="font-size: 18px; margin-bottom: 10px;">🚫</div>
    <div style="font-weight: bold; margin-bottom: 10px;" data-i18n="sidebar_uiManager_text_restrictedPage">Restricted Page</div>
    <div style="font-size: 14px; line-height: 1.4; margin-bottom: 15px;" data-i18n="sidebar_uiManager_text_restrictedPageMessage">
      Think Bot cannot work on Chrome internal pages (chrome://, chrome-extension://, etc.).
    </div>
    <div style="font-size: 14px; line-height: 1.4; color: #888;" data-i18n="sidebar_uiManager_text_restrictedPageGuidance">
      Please navigate to a regular webpage to use the extension.
    </div>
  `;
  
  elements.extractionError.appendChild(messageDiv);
  
  // Disable extraction buttons and input
  elements.jinaExtractBtn.disabled = true;
  elements.readabilityExtractBtn.disabled = true;
  elements.userInput.disabled = true;
  elements.sendBtn.disabled = true;
  
  
};

/**
 * Show extracted content
 * @param {string} content - Extracted content
 */
const displayExtractedContent = async (content) => {
  if (!content) {
    showExtractionError(i18n.getMessage('sidebar_uiManager_error_noContentExtracted'));
    return;
  }
  
  // First, completely clear all states to prevent overlapping
  clearAllStates();
  
  // Force a DOM reflow to ensure changes are applied immediately
  void elements.extractedContentElem.offsetHeight;
  
  // Now show content
  elements.loadingIndicator.classList.add('hidden');
  elements.extractionError.classList.add('hidden');
  elements.extractedContentElem.classList.remove('hidden');
  
  // Show raw markdown content instead of rendering it
  elements.extractedContentElem.innerHTML = `<pre style="white-space: pre-wrap; word-break: break-word;">${escapeHtml(content)}</pre>`;
  
  // Show operation buttons and enable them when content is available (orange state)
  elements.copyContentBtn.classList.add('visible');
  elements.retryExtractBtn.classList.add('visible');
  elements.copyContentBtn.classList.remove('disabled');
  elements.retryExtractBtn.classList.remove('disabled');
  elements.copyContentBtn.classList.add('enabled');
  elements.retryExtractBtn.classList.add('enabled');
  elements.copyContentBtn.disabled = false;
  elements.retryExtractBtn.disabled = false;
  
  
};

/**
 * Update extraction method button UI
 * @param {string} currentMethod - Current extraction method
 */
const updateExtractionButtonUI = (currentMethod) => {
  if (elements.jinaExtractBtn && elements.readabilityExtractBtn) {
    elements.jinaExtractBtn.classList.toggle('active', currentMethod === 'jina');
    elements.readabilityExtractBtn.classList.toggle('active', currentMethod === 'readability');
  }
};

/**
 * Update include page content button status
 * @param {boolean} includePageContent - Whether to include page content
 */
const updateIncludePageContentUI = (includePageContent) => {
  elements.includePageContentBtn.setAttribute('data-enabled', includePageContent ? 'true' : 'false');
  
};

/**
 * Update input area button layout
 * @param {number} height - Input box height
 */
const updateIconsLayout = (height) => {
  // Remove transition effect for immediate layout update
  elements.buttonGroup.style.transition = 'none';
  
  // Clear all layout classes
  elements.buttonGroup.classList.remove('layout-row', 'layout-grid', 'layout-column');
  
  // Set layout based on height threshold
  if (height <= 40) {
    // Default layout: Single row
    elements.buttonGroup.classList.add('layout-row');
  } else if (height > 40 && height <= 80) {
    // Grid layout: Two rows, two columns
    elements.buttonGroup.classList.add('layout-grid');
  } else {
    // Column layout: Single column multiple rows
    elements.buttonGroup.classList.add('layout-column');
  }
  
  // Ensure send button always stays primary class
  const sendBtn = document.getElementById('sendBtn');
  if (sendBtn) {
    if (!sendBtn.classList.contains('primary')) {
      sendBtn.classList.add('primary');
    }
  }
  
  // Reset all button styles
  Array.from(elements.buttonGroup.children).forEach(button => {
    // Clear any inline styles
    button.removeAttribute('style');
  });
  
  // Use setTimeout to restore transition effect
  setTimeout(() => {
    elements.buttonGroup.style.transition = '';
  }, 50);
};

export {
  initElements,
  getElement,
  getAllElements,
  ensureImageElements,
  clearAllStates,
  showLoading,
  hideLoading,
  showExtractionError,
  showRestrictedPageMessage,
  displayExtractedContent,
  updateExtractionButtonUI,
  updateIncludePageContentUI,
  updateIconsLayout
}; 