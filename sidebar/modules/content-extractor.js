/**
 * content-extractor.js - Content extraction functionality
 */

import { i18n } from '../../js/modules/i18n.js';
import { createLogger } from './utils.js';
import { switchExtractionMethod, reExtractContent } from './message-handler.js';

const logger = createLogger('ContentExtractor');

/**
 * Switch extraction method
 * @param {string} url - Page URL
 * @param {string} method - Extraction method (readability or jina)
 * @param {string} currentMethod - Current extraction method
 * @param {Function} onSuccess - Success callback
 * @param {Function} onError - Error callback
 */
const switchMethod = async (url, method, currentMethod, onSuccess, onError) => {
  // If already using this method, call success callback to ensure UI state is correctly updated
  if (currentMethod === method) {
    // Try to get current content and call success callback
    try {
      // Get current extracted content from state manager
      const currentContent = window.StateManager ? window.StateManager.getStateItem('extractedContent') : null;
      
      if (currentContent && typeof onSuccess === 'function') {
        onSuccess(currentContent, method);
      } else if (typeof onSuccess === 'function') {
        onSuccess('', method);
      }
    } catch (error) {
      logger.error('Error handling same method click:', error);
      if (typeof onError === 'function') {
        onError(i18n.getMessage('sidebar_contentExtractor_error_accessContent'));
      }
    }
    
    return;
  }
  
  logger.info(`Switching extraction method from ${currentMethod} to ${method}`);
  
  try {
    // Call message handler method to switch extraction method
    const result = await switchExtractionMethod(url, method);
    
    if (result.success) {
      // Call success callback
      if (typeof onSuccess === 'function') {
        onSuccess(result.content, result.extractionMethod || method);
      }
    } else {
      logger.error(`Content update error: ${result.error}`);
      
      // Call error callback
      if (typeof onError === 'function') {
        onError(result.error);
      }
    }
  } catch (error) {
    logger.error('Error switching extraction method:', error);
    
    // Call error callback
    if (typeof onError === 'function') {
      onError(i18n.getMessage('sidebar_contentExtractor_error_backgroundScript'));
    }
  }
};

/**
 * Re-extract content
 * @param {string} url - Page URL
 * @param {string} method - Extraction method
 * @param {Function} onSuccess - Success callback
 * @param {Function} onError - Error callback
 */
const reExtract = async (url, method, onSuccess, onError) => {
  logger.info(`Re-extracting content with method: ${method}`);
  
  try {
    const result = await reExtractContent(url, method);
    
    if (result.success) {
      // Call success callback
      if (typeof onSuccess === 'function') {
        onSuccess(result.content, result.extractionMethod || method);
      }
    } else {
      logger.error(`Content update error: ${result.error}`);
      
      // Call error callback
      if (typeof onError === 'function') {
        onError(result.error);
      }
    }
  } catch (error) {
    logger.error('Error re-extracting content:', error);
    
    // Call error callback
    if (typeof onError === 'function') {
      onError(i18n.getMessage('sidebar_contentExtractor_error_backgroundScript'));
    }
  }
};

/**
 * Copy extracted content to clipboard
 * @param {string} content - Extracted content
 * @returns {Promise<boolean>} Whether copy was successful
 */
const copyExtractedContent = async (content) => {
  if (!content) {
    logger.warn(i18n.getMessage('sidebar_contentExtractor_warn_noContentToCopy'));
    return false;
  }
  
  try {
    await navigator.clipboard.writeText(content);
    return true;
  } catch (err) {
    logger.error(i18n.getMessage('sidebar_contentExtractor_error_failedToCopy'), err);
    return false;
  }
};

export {
  switchMethod,
  reExtract,
  copyExtractedContent
};