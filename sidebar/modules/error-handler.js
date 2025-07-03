/**
 * Unified Error Handler Module
 * Handles all types of errors across the application with consistent formatting and display
 */

import { i18n } from '../../js/modules/i18n.js';
// Import necessary dependencies - use createLogger from utils for consistent logger access
import { createLogger } from './utils.js';

// Create logger instance for this module
const logger = createLogger('ErrorHandler');

/**
 * Error types enumeration
 */
const ERROR_TYPES = {
  LLM_ERROR: 'llm_error',
  EXTRACTION_ERROR: 'extraction_error',
  NETWORK_ERROR: 'network_error',
  PARSING_ERROR: 'parsing_error',
  VALIDATION_ERROR: 'validation_error',
  SYSTEM_ERROR: 'system_error',
  TIMEOUT_ERROR: 'timeout_error',
  LOADING_STATE_ERROR: 'loading_state_error'
};

/**
 * Error severity levels
 */
const ERROR_SEVERITY = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical'
};

/**
 * Error configuration for different error types
 */
const ERROR_CONFIG = {
  [ERROR_TYPES.LLM_ERROR]: {
    severity: ERROR_SEVERITY.HIGH,
    showInChat: true,
    showInUI: false,
    autoRetry: false,
    displayFormat: 'detailed'
  },
  [ERROR_TYPES.EXTRACTION_ERROR]: {
    severity: ERROR_SEVERITY.MEDIUM,
    showInChat: false,
    showInUI: true,
    autoRetry: true,
    displayFormat: 'user_friendly'
  },
  [ERROR_TYPES.NETWORK_ERROR]: {
    severity: ERROR_SEVERITY.HIGH,
    showInChat: true,
    showInUI: true,
    autoRetry: true,
    displayFormat: 'user_friendly'
  },
  [ERROR_TYPES.PARSING_ERROR]: {
    severity: ERROR_SEVERITY.MEDIUM,
    showInChat: false,
    showInUI: false,
    autoRetry: false,
    displayFormat: 'technical'
  },
  [ERROR_TYPES.VALIDATION_ERROR]: {
    severity: ERROR_SEVERITY.LOW,
    showInChat: false,
    showInUI: true,
    autoRetry: false,
    displayFormat: 'user_friendly'
  },
  [ERROR_TYPES.SYSTEM_ERROR]: {
    severity: ERROR_SEVERITY.CRITICAL,
    showInChat: true,
    showInUI: true,
    autoRetry: false,
    displayFormat: 'detailed'
  },
  [ERROR_TYPES.TIMEOUT_ERROR]: {
    severity: ERROR_SEVERITY.MEDIUM,
    showInChat: true,
    showInUI: false,
    autoRetry: true,
    displayFormat: 'user_friendly'
  },
  [ERROR_TYPES.LOADING_STATE_ERROR]: {
    severity: ERROR_SEVERITY.MEDIUM,
    showInChat: true,
    showInUI: false,
    autoRetry: false,
    displayFormat: 'detailed'
  }
};

/**
 * Enhanced Error class with additional metadata
 */
class ProcessedError {
  constructor(originalError, type = ERROR_TYPES.SYSTEM_ERROR, context = {}) {
    this.timestamp = Date.now();
    this.type = type;
    this.originalError = originalError;
    this.context = context;
    this.severity = ERROR_CONFIG[type]?.severity || ERROR_SEVERITY.MEDIUM;
    this.config = ERROR_CONFIG[type] || ERROR_CONFIG[ERROR_TYPES.SYSTEM_ERROR];
    
    // Extract error details
    this.extractErrorDetails();
  }
  
  extractErrorDetails() {
    if (typeof this.originalError === 'string') {
      this.message = this.originalError;
      this.userMessage = this.createUserFriendlyMessage(this.originalError);
    } else if (this.originalError instanceof Error) {
      this.message = this.originalError.message;
      this.stack = this.originalError.stack;
      this.name = this.originalError.name;
      this.userMessage = this.createUserFriendlyMessage(this.originalError.message);
      
      // Handle enhanced errors with rawResponse
      if (this.originalError.name === 'EnhancedError') {
        this.rawResponse = this.originalError.rawResponse;
        this.errorData = this.originalError.errorData;
        this.status = this.originalError.status;
      }
    } else if (typeof this.originalError === 'object' && this.originalError !== null) {
      this.message = this.originalError.message || 'Unknown error';
      this.userMessage = this.createUserFriendlyMessage(this.message);
      this.rawResponse = this.originalError.rawResponse;
      this.errorData = this.originalError.errorData;
      this.status = this.originalError.status;
      this.name = this.originalError.name;
    } else {
      this.message = 'Unknown error occurred';
      this.userMessage = i18n.getMessage('sidebar_errorHandler_error_unexpected');
    }

    // Ensure we always have valid message and userMessage
    if (!this.message || this.message.trim() === '') {
      this.message = 'Unknown error occurred';
    }

    if (!this.userMessage || this.userMessage.trim() === '') {
      this.userMessage = this.createUserFriendlyMessage(this.message);
    }

    // Handle special case where message is the generic "No detailed error information available"
    if (this.message === 'No detailed error information available') {
      this.message = i18n.getMessage('sidebar_errorHandler_error_llmService');
      this.userMessage = i18n.getMessage('sidebar_errorHandler_error_failedToGetResponse');
    }

    // Handle user cancellation case
    if (this.message === 'Request was cancelled by user') {
      this.userMessage = i18n.getMessage('sidebar_errorHandler_error_requestCancelled');
    }
  }
  
  createUserFriendlyMessage(message) {
    // Map technical error messages to user-friendly messages
    const userFriendlyMappings = {
      'CONTENT_SCRIPT_NOT_CONNECTED': i18n.getMessage('sidebar_errorHandler_error_contentScript'),
      'page_loading_or_script_issue': i18n.getMessage('sidebar_errorHandler_error_pageNotReady'),
      'page_loading': i18n.getMessage('sidebar_errorHandler_error_pageLoading'),
      'Readability library not loaded': i18n.getMessage('sidebar_errorHandler_error_readabilityLoad'),
      'Failed to extract content with Readability': i18n.getMessage('sidebar_errorHandler_error_readabilityExtract'),
      'HTML content is required': i18n.getMessage('sidebar_errorHandler_error_noHtml'),
      'Processing error': i18n.getMessage('sidebar_errorHandler_error_processing'),
      'offscreen': i18n.getMessage('sidebar_errorHandler_error_offscreen'),
      'Request was cancelled by user': i18n.getMessage('sidebar_errorHandler_error_requestCancelled')
    };
    
    // Check for direct matches
    for (const [technical, friendly] of Object.entries(userFriendlyMappings)) {
      if (message.includes(technical)) {
        return friendly;
      }
    }
    
    // For LLM errors with raw response, return original message to preserve detail
    if (this.type === ERROR_TYPES.LLM_ERROR && this.rawResponse) {
      return message || 'LLM error occurred';
    }
    
    // Default user-friendly message based on error type
    switch (this.type) {
      case ERROR_TYPES.LLM_ERROR:
        return i18n.getMessage('sidebar_errorHandler_error_failedToGetResponse');
      case ERROR_TYPES.EXTRACTION_ERROR:
        return i18n.getMessage('sidebar_errorHandler_error_extractFailed');
      case ERROR_TYPES.NETWORK_ERROR:
        return i18n.getMessage('sidebar_errorHandler_error_network');
      case ERROR_TYPES.TIMEOUT_ERROR:
        return i18n.getMessage('sidebar_errorHandler_error_timeout');
      default:
        return message || i18n.getMessage('sidebar_errorHandler_error_unexpected');
    }
  }
  
  getDisplayMessage(format = null) {
    const displayFormat = format || this.config.displayFormat;
    
    switch (displayFormat) {
      case 'user_friendly':
        return this.userMessage;
      case 'technical':
        return this.message;
      case 'detailed':
        return this.formatDetailedError();
      default:
        return this.userMessage;
    }
  }
  
  formatDetailedError() {
    // Always show raw response if available for debugging
    if (this.rawResponse) {
      try {
        const errorJsonObject = typeof this.rawResponse === 'string' 
          ? JSON.parse(this.rawResponse) 
          : this.rawResponse;
        
        // Return only the raw response, formatted as JSON
        return JSON.stringify(errorJsonObject, null, 2);
      } catch (parseError) {
        // If JSON parsing fails, show raw response as is, but inside a formatted object for context
        const formattedError = {
          userMessage: i18n.getMessage('sidebar_errorHandler_error_parseRawResponse'),
          originalError: this.message,
          rawResponse: this.rawResponse,
          parseError: parseError.message,
          timestamp: new Date(this.timestamp).toISOString()
        };
        
        return JSON.stringify(formattedError, null, 2);
      }
    }
    
    // For errors without raw response, show enhanced error details
    const errorDetails = {
      userMessage: this.userMessage,
      originalError: this.message,
      errorType: this.name || 'Unknown',
      errorCategory: this.type,
      severity: this.severity,
      ...(this.stack && { stack: this.stack }),
      ...(this.errorData && { errorData: this.errorData }),
      ...(this.status && { status: this.status }),
      ...(this.context && Object.keys(this.context).length > 0 && { context: this.context }),
      timestamp: new Date(this.timestamp).toISOString()
    };

    return JSON.stringify(errorDetails, null, 2);
  }
}

/**
 * Error display manager
 */
class ErrorDisplayManager {
  constructor() {
    this.duplicateThreshold = 2000; // 2 seconds
    this.recentErrors = new Map();
  }
  
  /**
   * Check if error is duplicate
   */
  isDuplicateError(error, container) {
    const errorKey = `${error.type}_${error.message}`;
    const now = Date.now();
    
    // Check recent errors in memory
    if (this.recentErrors.has(errorKey)) {
      const lastErrorTime = this.recentErrors.get(errorKey);
      if (now - lastErrorTime < this.duplicateThreshold) {
        return true;
      }
    }
    
    // Check existing error elements in DOM
    const existingErrors = container?.querySelectorAll('.error-message, .error-display');
    if (existingErrors) {
      for (const existingError of existingErrors) {
        const existingContent = existingError.textContent || '';
        const existingTimestamp = parseInt(existingError.id?.split('-')[1] || '0', 10);
        
        if (existingContent.includes(error.getDisplayMessage()) && 
            existingTimestamp && 
            (now - existingTimestamp) < this.duplicateThreshold) {
          return true;
        }
      }
    }
    
    // Record this error
    this.recentErrors.set(errorKey, now);
    
    // Clean up old entries
    this.cleanupOldErrors();
    
    return false;
  }
  
  cleanupOldErrors() {
    const now = Date.now();
    for (const [key, timestamp] of this.recentErrors.entries()) {
      if (now - timestamp > this.duplicateThreshold * 2) {
        this.recentErrors.delete(key);
      }
    }
  }
  
  /**
   * Clear all error messages from container
   */
  clearAllErrors(container) {
    if (!container) return;
    
    const errorSelectors = [
      '.error-message',
      '.message-content pre[style*="background-color: #f8f9fa"]',
      '.message-content .error-display',
      '.message-content span[style*="error-color"]'
    ];
    
    errorSelectors.forEach(selector => {
      const errorElements = container.querySelectorAll(selector);
      errorElements.forEach(element => {
        const messageDiv = element.closest('.chat-message');
        if (messageDiv) {
          messageDiv.remove();
        }
      });
    });
  }
  
  /**
   * Create error display element
   */
  createErrorElement(error) {
    const errorContainer = document.createElement('div');
    errorContainer.className = 'error-display';
    
    const errorContent = document.createElement('pre');
    errorContent.style.cssText = `
      color: var(--error-color);
      white-space: pre-wrap;
      font-family: monospace;
      font-size: 0.9em;
      margin: 0;
      padding: 12px;
      background-color: var(--error-bg, #fff5f5);
      border-left: 4px solid var(--error-color);
      border-radius: 4px;
    `;
    errorContent.textContent = error.getDisplayMessage();
    
    errorContainer.appendChild(errorContent);
    return errorContainer;
  }
  
  /**
   * Display error in chat container
   */
  displayInChat(error, chatContainer, streamingMessageElement = null) {
    if (!chatContainer || !error.config.showInChat) return false;
    
    // Check for duplicates
    if (this.isDuplicateError(error, chatContainer)) {
      
      return false;
    }
    
    // Clear existing errors
    this.clearAllErrors(chatContainer);
    
    const messageElement = streamingMessageElement || 
                          chatContainer.querySelector('[data-streaming="true"]');
    
    if (messageElement) {
      // Update existing streaming message
      const contentDiv = messageElement.querySelector('.message-content');
      if (contentDiv) {
        contentDiv.innerHTML = '';
        contentDiv.classList.remove('no-markdown');
        contentDiv.removeAttribute('data-raw-content');
        contentDiv.appendChild(this.createErrorElement(error));
        
        // Set the raw content for history saving
        contentDiv.setAttribute('data-raw-content', error.getDisplayMessage());
      }
      
      // Cleanup streaming state thoroughly
      this.cleanupStreamingState(messageElement);
      
      // Add error message class
      messageElement.classList.add('error-message');
      
      // Ensure no streaming attributes remain
      messageElement.removeAttribute('data-streaming');
      messageElement.removeAttribute('data-markdown-buffer');
      

    } else {
      // Create new error message
      const messageTimestamp = Date.now();
      const messageDiv = document.createElement('div');
      messageDiv.className = 'chat-message assistant-message error-message';
      messageDiv.id = `message-${messageTimestamp}`;
      
      const roleDiv = document.createElement('div');
      roleDiv.className = 'message-role';
      
      const contentDiv = document.createElement('div');
      contentDiv.className = 'message-content';
      contentDiv.appendChild(this.createErrorElement(error));
      contentDiv.setAttribute('data-raw-content', error.getDisplayMessage());
      
      messageDiv.appendChild(roleDiv);
      messageDiv.appendChild(contentDiv);
      chatContainer.appendChild(messageDiv);
      
      // Auto scroll
      chatContainer.scrollTop = chatContainer.scrollHeight;
      

    }
    
    return true;
  }
  
  /**
   * Display error in extraction UI
   */
  displayInExtractionUI(error, elements) {
    if (!error.config.showInUI || !elements) return false;
    
    // Clear all UI states
    this.clearExtractionUIStates(elements);
    
    // Show error state
    elements.loadingIndicator?.classList.add('hidden');
    elements.extractedContentElem?.classList.add('hidden');
    elements.extractionError?.classList.remove('hidden');
    
    // Update error message
    if (elements.extractionError) {
      elements.extractionError.textContent = error.getDisplayMessage('user_friendly');
    }
    
    // Enable retry button for content script connection errors since it will reload the page
    const enableRetry = error.message === 'CONTENT_SCRIPT_NOT_CONNECTED';

    // Update button states
    this.updateExtractionButtonStates(elements, enableRetry);


    return true;
  }
  
  cleanupStreamingState(messageElement) {
    if (!messageElement) return;
    
    // Remove all streaming-related attributes
    messageElement.removeAttribute('data-streaming');
    messageElement.removeAttribute('data-markdown-buffer');
    
    // Remove any streaming classes
    messageElement.classList.remove('streaming');
    
    const contentDiv = messageElement.querySelector('.message-content');
    if (contentDiv) {
      contentDiv.classList.remove('streaming');
      contentDiv.classList.remove('no-markdown');
      
      // Remove any loading containers that might still exist
      const loadingContainer = contentDiv.querySelector('.loading-container');
      if (loadingContainer) {
        loadingContainer.remove();
      }
      
      // Remove spinners
      const spinner = contentDiv.querySelector('.spinner');
      if (spinner) {
        spinner.remove();
      }
      
      // Remove stop buttons
      const stopButton = contentDiv.querySelector('.stop-request-btn');
      if (stopButton) {
        stopButton.remove();
      }
      
      // Remove stop and clear buttons
      const stopClearButton = contentDiv.querySelector('.stop-clear-btn');
      if (stopClearButton) {
        stopClearButton.remove();
      }
    }
    

  }
  
  clearExtractionUIStates(elements) {
    ['loadingIndicator', 'extractedContentElem', 'extractionError'].forEach(key => {
      if (elements[key]) {
        elements[key].classList.add('hidden');
      }
    });
  }
  
  updateExtractionButtonStates(elements, enableRetry = true) {
    // Show and configure buttons
    if (elements.copyContentBtn) {
      elements.copyContentBtn.classList.add('visible', 'disabled');
      elements.copyContentBtn.classList.remove('enabled');
      elements.copyContentBtn.disabled = true;
    }
    
    if (elements.retryExtractBtn) {
      elements.retryExtractBtn.classList.add('visible');
      if (enableRetry) {
        elements.retryExtractBtn.classList.remove('disabled');
        elements.retryExtractBtn.classList.add('enabled');
        elements.retryExtractBtn.disabled = false;
      } else {
        elements.retryExtractBtn.classList.add('disabled');
        elements.retryExtractBtn.classList.remove('enabled');
        elements.retryExtractBtn.disabled = true;
      }
    }
    
    // Re-enable extraction method buttons
    ['jinaExtractBtn', 'readabilityExtractBtn'].forEach(btnKey => {
      if (elements[btnKey]) {
        elements[btnKey].disabled = false;
      }
    });
  }
}

/**
 * Main Error Handler class
 */
class ErrorHandler {
  constructor() {
    this.displayManager = new ErrorDisplayManager();
    this.errorHistory = [];
    this.maxHistorySize = 100;
  }
  
  /**
   * Process and handle any error
   */
  handleError(originalError, type = ERROR_TYPES.SYSTEM_ERROR, context = {}) {
    const processedError = new ProcessedError(originalError, type, context);
    
    // Log error
    this.logError(processedError);
    
    // Add to history
    this.addToHistory(processedError);
    
    // Handle display based on context
    const displayResult = this.displayError(processedError, context);
    
    // Execute callback if provided
    if (context.onComplete && typeof context.onComplete === 'function') {
      context.onComplete(processedError);
    }
    
    return processedError;
  }
  
  logError(error) {
    let logLevel = error.severity === ERROR_SEVERITY.CRITICAL ? 'error' : 'warn';

    // Use INFO level for CONTENT_SCRIPT_NOT_CONNECTED errors
    if (error.message === 'CONTENT_SCRIPT_NOT_CONNECTED') {
      logLevel = 'info';
    }

    // Use INFO level for user cancellation errors
    if (error.message === 'Request was cancelled by user') {
      logLevel = 'info';
    }

    // Prepare detailed log information
    const logDetails = {
      type: error.type,
      severity: error.severity,
      timestamp: error.timestamp,
      context: error.context,
      hasRawResponse: !!error.rawResponse
    };

    // Add stack trace if available
    if (error.stack) {
      logDetails.stack = error.stack;
    }

    // Add additional error details if available
    if (error.errorData) {
      logDetails.errorData = error.errorData;
    }

    if (error.status) {
      logDetails.status = error.status;
    }

    // Add original error information if different from processed message
    if (error.originalError && error.originalError !== error.message) {
      logDetails.originalError = error.originalError;
    }

    logger[logLevel](`[ErrorHandler] ${error.type}: ${error.message}`, logDetails);
  }
  
  addToHistory(error) {
    this.errorHistory.unshift(error);
    
    // Limit history size
    if (this.errorHistory.length > this.maxHistorySize) {
      this.errorHistory = this.errorHistory.slice(0, this.maxHistorySize);
    }
  }
  
  displayError(error, context = {}) {
    const results = {
      chat: false,
      ui: false
    };
    
    // Display in chat if configured
    if (error.config.showInChat && context.chatContainer) {
      results.chat = this.displayManager.displayInChat(
        error, 
        context.chatContainer, 
        context.streamingMessageElement
      );
    }
    
    // Display in UI if configured
    if (error.config.showInUI && context.uiElements) {
      results.ui = this.displayManager.displayInExtractionUI(error, context.uiElements);
    }
    
    return results;
  }
  
  /**
   * Clear all errors from specified containers
   */
  clearAllErrors(containers = {}) {
    if (containers.chatContainer) {
      this.displayManager.clearAllErrors(containers.chatContainer);
    }
    
    if (containers.uiElements) {
      this.displayManager.clearExtractionUIStates(containers.uiElements);
    }
  }
  
  /**
   * Get error history
   */
  getErrorHistory(count = 10) {
    return this.errorHistory.slice(0, count);
  }
  
  /**
   * Clear error history
   */
  clearHistory() {
    this.errorHistory = [];
  }
}

// Create singleton instance
const errorHandler = new ErrorHandler();

// Export modules
export {
  ERROR_TYPES,
  ERROR_SEVERITY,
  ProcessedError,
  ErrorHandler,
  errorHandler as default
}; 