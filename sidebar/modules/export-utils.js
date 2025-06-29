/**
 * export-utils.js - Common export functionality utilities
 * Provides reusable export functions to eliminate code duplication
 */

import { createLogger } from './utils.js';

const logger = createLogger('ExportUtils');

/**
 * Handle export button click with common logic
 * @param {Object} options - Export options
 * @param {HTMLElement} options.chatContainer - Chat container element
 * @param {Function} options.getCurrentUrl - Function to get current URL
 * @param {Function} options.getExtractedContent - Function to get extracted content
 * @param {Function} options.getActiveTabId - Function to get active tab ID (optional)
 * @returns {Promise<void>}
 */
const handleExportClick = async (options) => {
  const {
    chatContainer,
    getCurrentUrl,
    getExtractedContent,
    getActiveTabId
  } = options;

  try {
    // Get chat history from DOM
    const chatHistory = window.ChatHistory.getChatHistoryFromDOM(chatContainer);

    if (!chatHistory || chatHistory.length === 0) {
      logger.warn('No chat history to export');
      return;
    }

    // Get extracted content
    const extractedContent = getExtractedContent();

    // Get current URL and include tab info if available
    let exportUrl = getCurrentUrl();
    if (getActiveTabId && typeof getActiveTabId === 'function') {
      const activeTabId = getActiveTabId();
      if (activeTabId && activeTabId !== 'chat') {
        exportUrl = `${exportUrl}#${activeTabId}`;
      }
    }

    // Use the centralized export function from ChatManager
    await window.ChatManager.exportConversation(
      exportUrl,
      extractedContent,
      chatHistory
    );

    logger.info('Conversation export initiated successfully');
  } catch (error) {
    logger.error('Error exporting conversation:', error);
  }
};

/**
 * Create export button event handler for sidebar
 * @param {HTMLElement} chatContainer - Chat container element
 * @returns {Function} Event handler function
 */
const createSidebarExportHandler = (chatContainer) => {
  return () => handleExportClick({
    chatContainer,
    getCurrentUrl: () => window.StateManager.getState().currentUrl,
    getExtractedContent: () => window.StateManager.getState().extractedContent,
    getActiveTabId: () => {
      if (window.TabManager && window.TabManager.getActiveTabId) {
        return window.TabManager.getActiveTabId();
      }
      return null;
    }
  });
};

/**
 * Create export button event handler for conversations page
 * @param {HTMLElement} chatContainer - Chat container element
 * @param {string} currentUrl - Current page URL
 * @returns {Function} Event handler function
 */
const createConversationsExportHandler = (chatContainer, currentUrl) => {
  return () => handleExportClick({
    chatContainer,
    getCurrentUrl: () => currentUrl,
    getExtractedContent: () => window.StateManager.getStateItem('extractedContent'),
    getActiveTabId: () => {
      if (window.TabManager && window.TabManager.getActiveTabId) {
        return window.TabManager.getActiveTabId();
      }
      return null;
    }
  });
};

export {
  handleExportClick,
  createSidebarExportHandler,
  createConversationsExportHandler
};
