/**
 * message-handler.js - Message handling and communication
 */

import { createLogger } from './utils.js';

const logger = createLogger('MessageHandler');

/**
 * Get current page data from background
 * @param {string} url - Page URL
 * @returns {Promise<Object>} Page data
 */
const getPageInfo = async (url) => {
  try {
    // Add small delay to allow service worker initialization
    await new Promise(resolve => setTimeout(resolve, 100));

    const response = await chrome.runtime.sendMessage({
      type: 'GET_PAGE_INFO',
      url: url
    });

    if (response.type === 'PAGE_INFO_LOADED') {
      return {
        success: true,
        data: response.data
      };
    } else if (response.type === 'PAGE_INFO_ERROR') {
      return {
        success: false,
        error: response.error
      };
    } else {
      return {
        success: false,
        error: 'Unexpected response from background script'
      };
    }
  } catch (error) {
    logger.error('Error requesting page info:', error);
    return {
      success: false,
      error: `Failed to communicate with the background script. Details: ${error.message || 'Unknown error'}`
    };
  }
};

/**
 * Switch content extraction method
 * @param {string} url - Page URL
 * @param {string} method - Extraction method (readability or jina)
 * @returns {Promise<Object>} Operation result
 */
const switchExtractionMethod = async (url, method) => {
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'SWITCH_EXTRACTION_METHOD',
      url: url,
      method: method
    });
    
    if (response.type === 'CONTENT_UPDATED') {
      return {
        success: true,
        content: response.content,
        extractionMethod: response.extractionMethod || method
      };
    } else if (response.type === 'CONTENT_UPDATE_ERROR') {
      return {
        success: false,
        error: response.error
      };
    } else {
      return {
        success: false,
        error: 'Unexpected response from background script'
      };
    }
  } catch (error) {
    logger.error('Error switching extraction method:', error);
    return {
      success: false,
      error: 'Failed to communicate with the background script'
    };
  }
};

/**
 * Re-extract content
 * @param {string} url - Page URL
 * @param {string} method - Extraction method
 * @returns {Promise<Object>} Operation result
 */
const reExtractContent = async (url, method) => {
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'RE_EXTRACT_CONTENT',
      url: url,
      method: method
    });
    
    if (response.type === 'CONTENT_UPDATED') {
      return {
        success: true,
        content: response.content,
        extractionMethod: response.extractionMethod || method
      };
    } else if (response.type === 'CONTENT_UPDATE_ERROR') {
      return {
        success: false,
        error: response.error
      };
    } else {
      return {
        success: false,
        error: 'Unexpected response from background script'
      };
    }
  } catch (error) {
    logger.error('Error re-extracting content:', error);
    return {
      success: false,
      error: 'Failed to communicate with the background script'
    };
  }
};

/**
 * Send message to LLM
 * @param {Object} payload - Message payload
 * @returns {Promise<Object>} Operation result
 */
const sendLlmMessage = async (payload) => {
  try {
    await chrome.runtime.sendMessage({
      type: 'SEND_LLM_MESSAGE',
      payload
    });
    
    // Since LLM response is sent via streaming, no specific response is returned here
    // Streaming response will be received via message listener
    return { success: true };
  } catch (error) {
    logger.error('Error sending message to LLM via service worker:', error);
    return {
      success: false,
      error: 'Failed to send message to the AI. Check service worker logs.'
    };
  }
};

/**
 * Message event listener setup
 * @param {Object} handlers - Message handler functions object
 */
const setupMessageListeners = (handlers, options = {}) => {
  const { respondToSidebarPing = true } = options;
  // Remove any existing listeners first to prevent duplicates
  if (chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.removeListener(handleMessage);
  }
  
  // Define the message handler function
  function handleMessage(message, sender, sendResponse) {
    try {
      // Log streaming messages at debug level to reduce noise
      if (message.type === 'LLM_STREAM_CHUNK' || message.type === 'LLM_STREAM_END') {
        logger.debug(`Received ${message.type} message`);
      } else {
        logger.info(`Received ${message.type} message`);
      }
      
      switch (message.type) {
        case 'LLM_STREAM_CHUNK':
          if (handlers.onStreamChunk) {
            handlers.onStreamChunk(message.chunk, message.tabId, message.url, message.branchId);
          }
          break;
          
        case 'LLM_STREAM_END':
          if (handlers.onStreamEnd) {
            handlers.onStreamEnd(
              message.fullResponse, 
              message.finishReason, 
              message.isAbnormalFinish,
              message.tabId,
              message.url,
              message.branchId
            );
          }
          break;
          
        case 'LLM_ERROR':
          if (handlers.onLlmError) {
            handlers.onLlmError(message);
          }
          break;
          
        case 'LOADING_STATE_UPDATE':
          if (handlers.onLoadingStateUpdate) {
            handlers.onLoadingStateUpdate(message);
          }
          break;
          
        case 'TAB_CHANGED':
          if (handlers.onTabChanged) {
            handlers.onTabChanged(message.url);
          }
          break;
          
        case 'AUTO_LOAD_CONTENT':
          if (handlers.onAutoLoadContent) {
            handlers.onAutoLoadContent(message.url, message.data);
          }
          break;
          
        case 'AUTO_EXTRACT_CONTENT':
          if (handlers.onAutoExtractContent) {
            handlers.onAutoExtractContent(message.url, message.extractionMethod);
          }
          break;
          
        case 'TAB_UPDATED':
          if (handlers.onTabUpdated) {
            handlers.onTabUpdated(message.url);
          }
          break;

        case 'BLACKLIST_DETECTED':
          if (handlers.onBlacklistDetected) {
            handlers.onBlacklistDetected(message);
          }
          break;

        case 'SIDEBAR_OPENED':
          if (handlers.onSidebarOpened) {
            handlers.onSidebarOpened(message);
          }
          break;

        case 'CLOSE_SIDEBAR':
          // Close the side panel programmatically on tab switch
          try {
            logger.info('Received CLOSE_SIDEBAR message, closing side panel');
            // window.close() will close the side panel page
            window.close();
          } catch (e) {
            logger.warn('Failed to close side panel via window.close():', e?.message || e);
          }
          break;

        case 'PING_SIDEBAR':
          // Respond to pings from the service worker only when this context should be treated as the sidebar
          if (respondToSidebarPing) {
            sendResponse({ type: 'PONG_SIDEBAR' });
          } else {
            logger.debug('Ignoring PING_SIDEBAR because respondToSidebarPing is disabled for this context');
          }
          break;
      }
    } catch (error) {
      logger.error('Error handling message:', error);
    }
  }
  
  // Add the message listener
  chrome.runtime.onMessage.addListener(handleMessage);
  
  // Log successful setup
  logger.info('Message listeners set up successfully');
};

export {
  getPageInfo,
  switchExtractionMethod,
  reExtractContent,
  sendLlmMessage,
  setupMessageListeners
};
