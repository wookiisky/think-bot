/**
 * event-handler.js - Event handling and UI interaction management
 * Manages all event listeners and UI interactions
 */

import { createLogger, isRestrictedPage, showCopyToast } from './utils.js';
import * as StateManager from './state-manager.js';
import * as UIManager from './ui-manager.js';
import * as MessageHandler from './message-handler.js';
import * as ContentExtractor from './content-extractor.js';
import * as ChatManager from './chat-manager.js';
import * as ResizeHandler from './resize-handler.js';
import * as ImageHandler from './image-handler.js';


const logger = createLogger('EventHandler');

/**
 * Set up all event listeners
 * @param {Object} elements - UI elements
 * @param {Object} modelSelector - Model selector instance
 * @param {Function} onTabAction - Tab action handler
 */
const setupEventListeners = (elements, modelSelector, onTabAction) => {
  // Send message button
  elements.sendBtn.addEventListener('click', () => {
    const userText = elements.userInput.value.replace(/^[ \t]+|[ \t]+$/g, '');
    const imageBase64 = ImageHandler.getCurrentImage();
    
    ChatManager.sendUserMessage(
      userText,
      imageBase64,
      elements.chatContainer,
      elements.userInput,
      elements.sendBtn,
      modelSelector,
      async () => {
        // Save chat history for current tab
        const chatHistory = window.ChatHistory.getChatHistoryFromDOM(elements.chatContainer);
        if (window.TabManager && window.TabManager.saveCurrentTabChatHistory) {
          await window.TabManager.saveCurrentTabChatHistory(chatHistory);
        }
      }
    );
  });
  
  // Send message when Enter key is pressed in input field
  elements.userInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const userText = elements.userInput.value.replace(/^[ \t]+|[ \t]+$/g, '');
      const imageBase64 = ImageHandler.getCurrentImage();
      
      ChatManager.sendUserMessage(
        userText,
        imageBase64,
        elements.chatContainer,
        elements.userInput,
        elements.sendBtn,
        modelSelector,
        async () => {
          // Save chat history for current tab
          const chatHistory = window.ChatHistory.getChatHistoryFromDOM(elements.chatContainer);
          if (window.TabManager && window.TabManager.saveCurrentTabChatHistory) {
            await window.TabManager.saveCurrentTabChatHistory(chatHistory);
          }
        }
      );
    }
  });
  
  // Export conversation
  elements.exportBtn.addEventListener('click', async () => {
    const state = StateManager.getState();
    // Get chat history from DOM for current tab
    const chatHistory = window.ChatHistory.getChatHistoryFromDOM(elements.chatContainer);
    
    // Include tab info in URL for better identification
    let exportUrl = state.currentUrl;
    if (window.TabManager && window.TabManager.getActiveTabId) {
      const activeTabId = window.TabManager.getActiveTabId();
      if (activeTabId !== 'chat') {
        exportUrl = `${state.currentUrl}#${activeTabId}`;
      }
    }
    
    await ChatManager.exportConversation(
      exportUrl,
      state.extractedContent,
      chatHistory
    );
  });
  
  // Clear conversation and context
  elements.clearBtn.addEventListener('click', async () => {
    const currentTabId = window.TabManager ? window.TabManager.getActiveTabId() : 'chat';

    // First cancel the current request if any
    const success = await ChatManager.cancelLlmRequest(currentTabId);

    if (success) {
      logger.info('LLM request cancelled, now clearing conversation');
    } else {
      logger.warn('Failed to cancel LLM request or no active request, proceeding with clearing conversation');
    }

    // Clear conversation regardless of cancellation success
    ChatManager.clearConversationAndContext(elements.chatContainer);
  });
  
  // Extraction method buttons
  elements.jinaExtractBtn.addEventListener('click', () => switchExtractionMethod('jina'));
  elements.readabilityExtractBtn.addEventListener('click', () => switchExtractionMethod('readability'));
  
  // Include page content button
  elements.includePageContentBtn.addEventListener('click', toggleIncludePageContent);
  
  // Initialize image processing
  ImageHandler.initImageHandler(
    elements.userInput,
    elements.imagePreviewContainer,
    elements.imagePreview,
    elements.removeImageBtn
  );
  
  // Copy extracted content
  elements.copyContentBtn.addEventListener('click', copyExtractedContent);
  
  // Retry extraction
  elements.retryExtractBtn.addEventListener('click', () => {
    // Check if button is disabled
    if (elements.retryExtractBtn.disabled || elements.retryExtractBtn.classList.contains('disabled')) {
      return;
    }

    // Check if current error is content script not connected
    const errorElement = elements.extractionError;
    const isContentScriptError = errorElement &&
      errorElement.textContent.includes('Content script not connected');

    if (isContentScriptError) {
      logger.info('Content script not connected - reloading page');
      reloadCurrentPage();
    } else {
      logger.info(`Retrying extraction with method: ${StateManager.getStateItem('currentExtractionMethod')}`);
      reExtractContent(StateManager.getStateItem('currentExtractionMethod'));
    }
  });
  
  // Initialize content resize processing
  ResizeHandler.initContentResize(
    elements.contentSection,
    elements.resizeHandle,
    (height) => ResizeHandler.saveContentSectionHeight(height)
  );
  
  // Input field resize processing
  ResizeHandler.initInputResize(
    elements.userInput,
    elements.inputResizeHandle,
    (height) => UIManager.updateIconsLayout(height)
  );
  
  logger.info('Event listeners setup completed');
};

/**
 * Switch extraction method
 * @param {string} method - Extraction method
 */
const switchExtractionMethod = (method) => {
  const elements = UIManager.getAllElements();
  const state = StateManager.getState();
  
  // Check if it's a restricted page
  if (isRestrictedPage(state.currentUrl)) {
    return;
  }
  
  // Check if the same method is already selected
  if (state.currentExtractionMethod === method) {
    // Just refresh the UI without showing loading for same method clicks
    const currentContent = StateManager.getStateItem('extractedContent');
    if (currentContent) {
      UIManager.displayExtractedContent(currentContent);
    }
    return;
  }
  
  logger.info(`Switching extraction method from ${state.currentExtractionMethod} to ${method}`);
  
  // Update active button styles
  elements.jinaExtractBtn.classList.toggle('active', method === 'jina');
  elements.readabilityExtractBtn.classList.toggle('active', method === 'readability');
  
  // Show loading status
  UIManager.showLoading(`Switching to ${method === 'jina' ? 'Jina AI' : 'Readability'} extraction...`);
  
  // Call content extractor switch method
  ContentExtractor.switchMethod(
    state.currentUrl,
    method,
    state.currentExtractionMethod,
    // Success callback
    (content, extractionMethod) => {
      StateManager.updateStateItem('extractedContent', content);
      StateManager.updateStateItem('currentExtractionMethod', extractionMethod);
      UIManager.displayExtractedContent(content);
      UIManager.hideLoading();
      logger.info(`Successfully switched to ${extractionMethod} extraction method`);
    },
    // Error callback
    (error) => {
      logger.error('Error switching extraction method:', error);
      // Ensure loading state is properly hidden before showing error
      UIManager.hideLoading();
      UIManager.showExtractionError(error);
      
      // Restore the previous active button state on error
      elements.jinaExtractBtn.classList.toggle('active', state.currentExtractionMethod === 'jina');
      elements.readabilityExtractBtn.classList.toggle('active', state.currentExtractionMethod === 'readability');
      
      // Re-enable extraction buttons after error
      if (elements.jinaExtractBtn && elements.readabilityExtractBtn) {
        elements.jinaExtractBtn.disabled = false;
        elements.readabilityExtractBtn.disabled = false;
      }
    }
  );
};

/**
 * Re-extract content
 * @param {string} method - Extraction method
 */
const reExtractContent = (method) => {
  const state = StateManager.getState();
  
  // Check if it's a restricted page
  if (isRestrictedPage(state.currentUrl)) {
    return;
  }
  
  // Show loading status
  UIManager.showLoading(`Re-extracting with ${method === 'jina' ? 'Jina AI' : 'Readability'}...`);
  
  // Call content extractor re-extract method
  ContentExtractor.reExtract(
    state.currentUrl,
    method,
    // Success callback
    (content, extractionMethod) => {
      StateManager.updateStateItem('extractedContent', content);
      StateManager.updateStateItem('currentExtractionMethod', extractionMethod);
      UIManager.displayExtractedContent(content);
      UIManager.hideLoading();
      logger.info(`Successfully re-extracted content with ${extractionMethod} method`);
    },
    // Error callback
    (error) => {
      logger.error('Error re-extracting content:', error);
      // Ensure loading state is properly hidden before showing error
      UIManager.hideLoading();
      UIManager.showExtractionError(error);
      
      // Re-enable extraction buttons after error
      const elements = UIManager.getAllElements();
      if (elements.jinaExtractBtn && elements.readabilityExtractBtn) {
        elements.jinaExtractBtn.disabled = false;
        elements.readabilityExtractBtn.disabled = false;
      }
    }
  );
};

/**
 * Reload current page
 */
const reloadCurrentPage = async () => {
  try {
    // Get current active tab
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs.length > 0) {
      const tabId = tabs[0].id;
      const currentUrl = tabs[0].url;
      logger.info(`Reloading page for tab ${tabId}`);

      // Set flag to indicate we're waiting for page reload
      StateManager.updateStateItem('isWaitingForPageReload', true);
      StateManager.updateStateItem('reloadingPageUrl', currentUrl);

      // Reload the tab
      await chrome.tabs.reload(tabId);

      // Show loading indicator while page reloads
      UIManager.showLoading('Reloading page...');
    } else {
      logger.error('No active tab found for reload');
    }
  } catch (error) {
    logger.error('Error reloading page:', error);
    // Clear reload flag on error
    StateManager.updateStateItem('isWaitingForPageReload', false);
    StateManager.updateStateItem('reloadingPageUrl', null);
  }
};

/**
 * Copy extracted content
 */
const copyExtractedContent = async () => {
  const elements = UIManager.getAllElements();
  
  // Check if button is disabled
  if (elements.copyContentBtn.disabled || elements.copyContentBtn.classList.contains('disabled')) {
    return;
  }
  
  const content = StateManager.getStateItem('extractedContent');
  const success = await ContentExtractor.copyExtractedContent(content);
  
  if (success) {
    showCopyToast('Content copied to clipboard');
  } else {
    showCopyToast('Failed to copy content');
  }
};

/**
 * Switch whether to include page content
 */
const toggleIncludePageContent = () => {
  const includePageContent = StateManager.toggleIncludePageContent();
  UIManager.updateIncludePageContentUI(includePageContent);
};

/**
 * Set up message buttons scroll effect - Completely rewritten
 * @param {HTMLElement} chatContainer - Chat container element
 */
const setupMessageButtonsScroll = (chatContainer) => {
  if (!chatContainer) return;

  // Track current hovered message and its buttons
  let currentHoveredMessage = null;
  let currentFloatingButtons = null;
  
  /**
   * Clear floating button state
   */
  function clearFloatingButtons() {
    if (currentFloatingButtons) {
      currentFloatingButtons.classList.remove('floating');
      currentFloatingButtons.style.position = '';
      currentFloatingButtons.style.top = '';
      currentFloatingButtons.style.right = '';
      currentFloatingButtons.style.transform = '';
      currentFloatingButtons = null;
    }
    currentHoveredMessage = null;
  }
  
  /**
   * Update button position
   */
  function updateButtonPosition(message, buttons) {
    const messageRect = message.getBoundingClientRect();
    const containerRect = chatContainer.getBoundingClientRect();
    
    // Check if message is fully visible in viewport
    const isFullyVisible = messageRect.top >= containerRect.top && 
                           messageRect.bottom <= containerRect.bottom;
    
    if (isFullyVisible) {
      // Message is fully visible, use regular positioning
      buttons.classList.remove('floating');
      buttons.style.position = '';
      buttons.style.top = '';
      buttons.style.right = '';
      buttons.style.transform = '';
    } else {
      // Message is partially clipped, use floating positioning
      buttons.classList.add('floating');
      
      // Calculate best position for buttons in viewport
      const visibleTop = Math.max(messageRect.top, containerRect.top);
      const visibleBottom = Math.min(messageRect.bottom, containerRect.bottom);
      const visibleCenter = (visibleTop + visibleBottom) / 2;
      
      // Set floating position
      buttons.style.position = 'fixed';
      buttons.style.top = `${visibleCenter}px`;
      buttons.style.right = `${window.innerWidth - containerRect.right + 12}px`;
      buttons.style.transform = 'translateY(-50%)';
    }
  }
  
  // Use event delegation to handle mouse entering message
  chatContainer.addEventListener('mouseover', function(event) {
    const message = event.target.closest('.chat-message');
    if (!message || message === currentHoveredMessage) return;
    
    // Clear previous state
    clearFloatingButtons();
    
    const buttons = message.querySelector('.message-buttons');
    if (!buttons) return;
    
    currentHoveredMessage = message;
    currentFloatingButtons = buttons;
    
    // Immediately update button position
    updateButtonPosition(message, buttons);
  });
  
  // Use event delegation to handle mouse leaving message
  chatContainer.addEventListener('mouseout', function(event) {
    const message = event.target.closest('.chat-message');
    if (!message || message !== currentHoveredMessage) return;
    
    // Check if mouse really left message area (not moved to sub-element)
    const relatedTarget = event.relatedTarget;
    if (relatedTarget && message.contains(relatedTarget)) return;
    
    clearFloatingButtons();
  });
  
  // Update button position on scroll
  chatContainer.addEventListener('scroll', function() {
    if (currentHoveredMessage && currentFloatingButtons) {
      updateButtonPosition(currentHoveredMessage, currentFloatingButtons);
    }
  });
  
  // Update position on window size change
  window.addEventListener('resize', function() {
    if (currentHoveredMessage && currentFloatingButtons) {
      updateButtonPosition(currentHoveredMessage, currentFloatingButtons);
    }
  });
};

export {
  setupEventListeners,
  switchExtractionMethod,
  reExtractContent,
  copyExtractedContent,
  toggleIncludePageContent,
  setupMessageButtonsScroll
}; 