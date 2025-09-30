/**
 * page-data-manager.js - Page data loading and management
 * Handles loading current page data and managing page state
 */

import { createLogger, isRestrictedPage } from './utils.js';
import { createBranchHeader } from './branch-preview.js';
import * as StateManager from './state-manager.js';
import * as UIManager from './ui-manager.js';
import * as MessageHandler from './message-handler.js';
import * as ChatManager from './chat-manager.js';
import { confirmationOverlay } from '../components/confirmation-overlay.js';

const logger = createLogger('PageDataManager');

// Callback for triggering auto inputs after page data is loaded
let onPageDataLoadedCallback = null;

/**
 * Load current page data and restore loading state if needed
 * @param {boolean} skipLoadingIndicator - Skip showing loading indicator (used when already shown)
 */
const loadCurrentPageData = async (skipLoadingIndicator = false) => {
  // Get current tab URL
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tabs.length > 0) {
    const tab = tabs[0];
    const url = tab.url;
    StateManager.updateStateItem('currentUrl', url);
    StateManager.updateStateItem('currentTabId', tab.id.toString());

    
    // Check if it's a restricted page
    if (isRestrictedPage(url)) {
      UIManager.hideLoading();
      UIManager.showRestrictedPageMessage();
      return;
    }
    
    // Show loading status (unless already shown)
    if (!skipLoadingIndicator) {
      UIManager.showLoading('Loading page info...');
    }

    // Load all page info from background script in a single request
    try {
      const response = await MessageHandler.getPageInfo(url);

      if (response.success) {
        // Data loaded successfully
        await handlePageDataLoaded(response.data);
      } else {
        // Load data error - check if it's a content script connection issue
        const errorMessage = response.error || '';
        if (errorMessage.includes('Could not establish connection') ||
            errorMessage.includes('Receiving end does not exist') ||
            errorMessage.includes('CONTENT_SCRIPT_NOT_CONNECTED')) {
          logger.info('Content script not connected, auto-reloading page');
          await handleAutoReloadForContentScriptError(url);
        } else {
          UIManager.showExtractionError(response.error);
        }
      }
    } catch (error) {
      logger.error('Error requesting page info:', error);

      // Check if this might be a content script connection issue
      const errorMessage = error.message || '';
      if (errorMessage.includes('Could not establish connection') ||
          errorMessage.includes('Receiving end does not exist') ||
          errorMessage.includes('content script')) {
        logger.info('Communication error might be content script related, auto-reloading page');
        await handleAutoReloadForContentScriptError(url);
      } else {
        UIManager.showExtractionError('Failed to communicate with the background script. Details: ' + errorMessage);
      }
    }
    
    // After loading page data, check and restore loading state for current active tab
    await checkAndRestoreCurrentTabLoadingState();
    
  } else {
    UIManager.showExtractionError('No active tab found');
  }
};

/**
 * Handle auto-reload when content script connection error occurs during initial load
 * @param {string} url - Current page URL
 * @returns {Promise<void>}
 */
const handleAutoReloadForContentScriptError = async (url) => {
  try {
    // Check if we're already waiting for a page reload to prevent duplicate reloads
    const isWaitingForPageReload = StateManager.getStateItem('isWaitingForPageReload');
    if (isWaitingForPageReload) {
      logger.info('Already waiting for page reload, skipping duplicate auto-reload request');
      return;
    }

    logger.info(`Auto-reloading page due to content script connection error: ${url}`);

    // Get current active tab
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs.length === 0) {
      logger.error('No active tab found for auto-reload');
      UIManager.showExtractionError('Content script not connected. Please reload the page manually.');
      return;
    }

    const tabId = tabs[0].id;
    const currentUrl = tabs[0].url;

    // Set flag to indicate we're waiting for page reload
    StateManager.updateStateItem('isWaitingForPageReload', true);
    StateManager.updateStateItem('reloadingPageUrl', currentUrl);

    // Show loading message indicating auto-reload
    UIManager.showLoading('Content script not connected. Auto-reloading page...');

    // Reload the tab
    await chrome.tabs.reload(tabId);

    logger.info(`Page auto-reloaded for tab ${tabId} due to content script error`);
  } catch (error) {
    logger.error('Error during auto-reload for content script error:', error);

    // Clear reload flags on error
    StateManager.updateStateItem('isWaitingForPageReload', false);
    StateManager.updateStateItem('reloadingPageUrl', null);

    // Show fallback error message
    UIManager.showExtractionError('Content script not connected and auto-reload failed. Please reload the page manually.');
  }
};

/**
 * Load current page data with retry mechanism for better reliability after page reload
 * @param {boolean} skipLoadingIndicator - Skip showing loading indicator (used when already shown)
 * @param {number} maxRetries - Maximum number of retry attempts
 * @returns {Promise<void>}
 */
const loadCurrentPageDataWithRetry = async (skipLoadingIndicator = false, maxRetries = 3) => {
  let lastError = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      logger.info(`Loading page data attempt ${attempt}/${maxRetries}`);
      await loadCurrentPageData(skipLoadingIndicator);
      logger.info(`Page data loaded successfully on attempt ${attempt}`);
      return; // Success, exit retry loop
    } catch (error) {
      lastError = error;
      logger.warn(`Page data loading attempt ${attempt} failed:`, error.message);

      // Check if this is a Readability extraction failure and we can try Jina as fallback
      const currentMethod = StateManager.getStateItem('currentExtractionMethod');
      const errorMessage = error.message || '';

      if (currentMethod === 'readability' &&
          (errorMessage.includes('Readability extraction failed') ||
           errorMessage.includes('Failed to extract content with Readability'))) {

        logger.info('Readability extraction failed, trying Jina as fallback');

        try {
          // Switch to Jina method and try extraction
          StateManager.updateStateItem('currentExtractionMethod', 'jina');
          UIManager.showLoading('Readability failed, trying Jina extraction...');
          await loadCurrentPageData(true); // Skip loading indicator since we already set it
          logger.info('Successfully extracted content using Jina fallback');
          return; // Success with fallback method
        } catch (jinaError) {
          logger.warn('Jina fallback also failed:', jinaError.message);
          // Restore original method and continue with retry logic
          StateManager.updateStateItem('currentExtractionMethod', currentMethod);
        }
      }

      // If this is not the last attempt, wait before retrying
      if (attempt < maxRetries) {
        const delay = attempt * 1000; // Increasing delay: 1s, 2s, 3s
        logger.info(`Waiting ${delay}ms before retry attempt ${attempt + 1}`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  // All attempts failed
  logger.error(`All ${maxRetries} attempts to load page data failed. Last error:`, lastError);

  // Show error with retry option
  UIManager.showExtractionError(
    lastError?.message || 'Failed to extract content after page reload. Please try again.'
  );
};

/**
 * Check and restore loading state for current active tab
 */
const checkAndRestoreCurrentTabLoadingState = async () => {
  try {
    const currentUrl = window.StateManager.getStateItem('currentUrl');
    const currentTabId = window.StateManager.getStateItem('currentTabId');
    
    if (!currentUrl || !currentTabId) {

      return;
    }
    
    // Get active tab ID from TabManager
    const activeTabId = window.TabManager ? window.TabManager.getActiveTabId() : 'chat';
    

    
    // Use TabManager's loading state restoration if available
    if (window.TabManager && window.TabManager.checkAndRestoreLoadingState) {
      const chatContainer = document.getElementById('chatContainer');
      if (chatContainer) {
        await window.TabManager.checkAndRestoreLoadingState(currentUrl, activeTabId, chatContainer);

      }
    } else {
      // Fallback: direct loading state check
      await directLoadingStateCheck(currentUrl, activeTabId);
    }
    
  } catch (error) {
    logger.error('Error checking and restoring loading state:', error);
  }
};

/**
 * Direct loading state check (fallback method)
 */
const directLoadingStateCheck = async (currentUrl, tabId) => {
  try {
    const chatContainer = document.getElementById('chatContainer');
    if (!chatContainer || !window.ChatManager) {

      return;
    }
    
    const response = await chrome.runtime.sendMessage({
      type: 'GET_LOADING_STATE',
      url: currentUrl,
      tabId: tabId
    });
    
    if (response && response.loadingState) {
      const loadingState = response.loadingState;
      logger.info(`Found cached loading state for ${currentUrl}#${tabId}:`, loadingState.status);
      
      if (loadingState.status === 'loading') {
        // Check if there are already error messages or completed messages in chat
        const existingMessages = chatContainer.querySelectorAll('.chat-message');
        const existingErrors = chatContainer.querySelectorAll('.error-message');
        const recentMessages = Array.from(existingMessages).filter(msg => {
          const timestamp = parseInt(msg.id.split('-')[1], 10);
          return timestamp && (Date.now() - timestamp) < 600000; // Within 10 minutes
        });
        
        // Don't show loading spinner if there are recent error messages or any messages after potential timeout
        if (existingErrors.length > 0) {
          logger.info('Skipped loading UI restoration due to existing error messages');
          return { restored: false, reason: 'existing_errors' };
        }
        
        // Show loading indicator
        const existingStreaming = chatContainer.querySelector('[data-streaming="true"]');
        if (!existingStreaming) {
          // Create proper branch structure instead of using legacy appendMessageToUI
          const branchId = `br-reconnect-${Date.now()}-${Math.random().toString(36).slice(2)}`;
          const assistantTimestamp = Date.now();
          
          // Create branch container
          const branchContainer = document.createElement('div');
          branchContainer.className = 'chat-message assistant-message branch-container';
          branchContainer.id = `message-${assistantTimestamp}`;
          
          // Create role element
          const roleDiv = document.createElement('div');
          roleDiv.className = 'message-role';
          branchContainer.appendChild(roleDiv);
          
          // Create branches container
          const branchesDiv = document.createElement('div');
          branchesDiv.className = 'message-branches';
          
          // Create branch element
          const branchDiv = document.createElement('div');
          branchDiv.className = 'message-branch';
          branchDiv.setAttribute('data-branch-id', branchId);
          branchDiv.setAttribute('data-streaming', 'true');
          branchDiv.setAttribute('data-model', 'reconnecting');
          
          // Create content div
          const contentDiv = document.createElement('div');
          contentDiv.className = 'message-content';
          contentDiv.setAttribute('data-raw-content', '');
          
          // Create loading container
          const loadingContainer = document.createElement('div');
          loadingContainer.className = 'loading-container';
          // No inner spinner; border loader is handled by CSS on the branch
          contentDiv.appendChild(loadingContainer);
          logger.debug(`Reconnection restore uses border loader (no spinner) for branch ${branchId}`);
          
          // Create model label
          const { header: branchHeader } = createBranchHeader('reconnecting');
          branchDiv.appendChild(branchHeader);
          
          // Assemble the structure
          branchDiv.appendChild(contentDiv);
          branchesDiv.appendChild(branchDiv);
          branchContainer.appendChild(branchesDiv);
          chatContainer.appendChild(branchContainer);
          
          logger.info(`Restored loading UI for current tab using branch structure (branchId: ${branchId})`);
        } else {
          logger.info('Skip restoring loader: streaming element already exists');
        }
        
        // Set up reconnection listener for ongoing LLM stream
        setupStreamReconnection(currentUrl, tabId);
        
      } else if (loadingState.status === 'timeout') {
        // Check for existing error messages to prevent duplicates
        const existingErrors = chatContainer.querySelectorAll('.error-message, .message-content span[style*="error-color"]');
        if (existingErrors.length === 0) {
          // Show timeout message using improved error handling
          const timeoutElement = window.ChatManager.appendMessageToUI(
            chatContainer,
            'assistant',
            '<div class="error-display"><span style="color: var(--error-color);">Request timed out after 10 minutes. Please try again.</span></div>'
          );
          if (timeoutElement) {
            timeoutElement.classList.add('error-message');
          }
          logger.info('Restored timeout message for current tab');
        } else {
          logger.info('Skipped duplicate timeout message restoration');
        }
        
      } else if (loadingState.status === 'error') {
        // Check for existing error messages to prevent duplicates
        const existingErrors = chatContainer.querySelectorAll('.error-message');
        if (existingErrors.length === 0) {
          logger.info('Found cached error state, but no existing error messages to restore');
          // Let the normal error handling system handle this through background messages
        } else {
          logger.info('Error state found but existing error messages already present');
        }
      }
      
      return { restored: true, status: loadingState.status };
    } else {
      logger.info(`No cached loading state found for ${currentUrl}#${tabId}`);
      return { restored: false, reason: 'no_state' };
    }
  } catch (error) {
    logger.error('Error checking loading state:', error);
    return { restored: false, reason: 'error', error };
  }
};

/**
 * Set up stream reconnection for ongoing LLM requests
 */
const setupStreamReconnection = (currentUrl, tabId) => {
  logger.info(`Setting up stream reconnection for ${currentUrl}#${tabId}`);
  
  // The stream should continue automatically via the existing message listeners
  // No additional setup needed as the background service worker continues processing
  // and will send stream chunks/completion messages when available
  
  // Optional: Set up a periodic check to verify the loading state hasn't timed out
  // Event-driven flow now updates UI via messages; disable periodic GET_LOADING_STATE polling
  // const checkInterval = setInterval(...)
  
  // Auto-cleanup after 15 minutes
  setTimeout(() => {
    clearInterval(checkInterval);
    logger.info('Stream reconnection check auto-cleanup after 15 minutes');
  }, 15 * 60 * 1000);
};

/**
 * Handle page data loaded
 * @param {Object} data - Page data
 * @returns {Promise<void>}
 */
const handlePageDataLoaded = async (pageInfo) => {
  const elements = UIManager.getAllElements();
  UIManager.hideLoading();

  // Re-enable buttons in case they were disabled on restricted page
  elements.jinaExtractBtn.disabled = false;
  elements.readabilityExtractBtn.disabled = false;
  elements.userInput.disabled = false;
  elements.sendBtn.disabled = false;

  // Apply page state first
  if (pageInfo && pageInfo.pageState) {
    StateManager.applyPageState(pageInfo.pageState);
    UIManager.updateIncludePageContentUI(StateManager.getStateItem('includePageContent'));
  }

  // Update extracted content and display
  if (pageInfo && pageInfo.content) {
    StateManager.updateStateItem('extractedContent', pageInfo.content);
    await UIManager.displayExtractedContent(pageInfo.content);
    elements.copyContentBtn.classList.add('visible');
    elements.copyContentBtn.disabled = false;
  } else {
    StateManager.updateStateItem('extractedContent', '');
    UIManager.showExtractionError('No content could be extracted.');
    elements.copyContentBtn.classList.remove('visible');
    elements.copyContentBtn.disabled = true;
  }

  // Update extraction method UI based on actual method used
  if (pageInfo && pageInfo.extractionMethod) {
    StateManager.updateStateItem('currentExtractionMethod', pageInfo.extractionMethod);
    UIManager.updateExtractionButtonUI(pageInfo.extractionMethod);
    logger.info(`Content displayed using method: ${pageInfo.extractionMethod}`);
  }

  // Load chat history for current tab
  if (window.TabManager && window.TabManager.loadTabChatHistory && window.TabManager.getActiveTabId) {
    const activeTabId = window.TabManager.getActiveTabId();
    await window.TabManager.loadTabChatHistory(activeTabId, pageInfo.chatHistory);
    logger.info(`Loaded chat history for active tab: ${activeTabId}`);

    // After loading chat history, compute has-content for all tabs and refresh UI
    try {
      if (window.TabManager.updateTabsContentStates) {
        await window.TabManager.updateTabsContentStates();
      }
      if (window.TabManager.renderCurrentTabsState) {
        await window.TabManager.renderCurrentTabsState();
      }
    } catch (stateError) {
      logger.warn('Failed to update tabs content states after initial load:', stateError);
    }

    // Fix existing message layouts
    setTimeout(() => {
      ChatManager.fixExistingMessageLayouts(elements.chatContainer);
    }, 100);
  } else {
    // Fallback to original method if TabManager not available
    if (pageInfo && pageInfo.chatHistory) {
      logger.info(`Received chat history with ${pageInfo.chatHistory.length} messages from service worker`);
      ChatManager.displayChatHistory(elements.chatContainer, pageInfo.chatHistory);

      // Fix existing message layouts
      setTimeout(() => {
        ChatManager.fixExistingMessageLayouts(elements.chatContainer);
      }, 100);
    } else {
      logger.info('No chat history received from service worker');
      elements.chatContainer.innerHTML = '';
    }
  }

  // Enable or disable retry button based on success or failure
  elements.retryExtractBtn.disabled = !pageInfo.content;
  if (pageInfo.content) {
    elements.retryExtractBtn.classList.remove('disabled');
    elements.retryExtractBtn.classList.add('visible');
  } else {
    elements.retryExtractBtn.classList.add('disabled');
    // Keep visible to allow retry
  }

  // Trigger auto inputs if callback is set and content is available
  if (onPageDataLoadedCallback && pageInfo && pageInfo.content) {
    try {
      logger.info('Triggering auto inputs after page data loaded');
      await onPageDataLoadedCallback();
    } catch (error) {
      logger.error('Error triggering auto inputs after page data loaded:', error);
    }
  }

  // After all page data is loaded and UI is updated, refresh tab states
  // This is no longer needed as the loadTabChatHistory call above now handles it correctly
  // if (window.TabManager && window.TabManager.renderCurrentTabsState) {
  //   logger.info('Refreshing all tab states after page data loaded.');
  //   await window.TabManager.renderCurrentTabsState();
  // }
};

/**
 * Set callback to be called after page data is loaded
 * @param {Function} callback - Callback function
 */
const setOnPageDataLoadedCallback = (callback) => {
  onPageDataLoadedCallback = callback;
  logger.info('Page data loaded callback set');
};

/**
 * Handle tab change with auto-loading
 * @param {string} url - New URL
 * @returns {Promise<void>}
 */
const handleTabChanged = async (url) => {
  // Tab changed, if URL is different, reload data
  if (url !== StateManager.getStateItem('currentUrl')) {
    logger.info(`Tab changed. New URL: ${url}`);

    // Clear any pending page reload flags since we're switching to a different page
    const isWaitingForPageReload = StateManager.getStateItem('isWaitingForPageReload');
    if (isWaitingForPageReload) {
      logger.info('Clearing page reload flags due to tab change');
      StateManager.updateStateItem('isWaitingForPageReload', false);
      StateManager.updateStateItem('reloadingPageUrl', null);
    }

    StateManager.updateStateItem('currentUrl', url);

    // Check blacklist before loading page data
    await checkBlacklistAndLoadData(url);
  }
};

/**
 * Handle auto-load cached content
 * @param {string} url - URL
 * @param {Object} data - Page data
 * @returns {Promise<void>}
 */
const handleAutoLoadContent = async (url, data) => {
  // Auto-load cached content for new URL
  if (url !== StateManager.getStateItem('currentUrl')) {
    logger.info(`Auto-loading cached content for URL: ${url}`);
    StateManager.updateStateItem('currentUrl', url);
    
    // The handlePageDataLoaded function now handles page state, so no need to load it separately here.
    await handlePageDataLoaded(data);
  }
};

/**
 * Handle auto-extract content
 * @param {string} url - URL
 * @param {string} extractionMethod - Extraction method
 * @returns {Promise<void>}
 */
const handleAutoExtractContent = async (url, extractionMethod) => {
  // Check if this is a page reload completion
  const isWaitingForPageReload = StateManager.getStateItem('isWaitingForPageReload');
  const reloadingPageUrl = StateManager.getStateItem('reloadingPageUrl');

  if (isWaitingForPageReload && reloadingPageUrl === url) {
    logger.info(`Page reload completed for URL: ${url}, waiting for page to stabilize before extraction`);

    // Clear reload flags
    StateManager.updateStateItem('isWaitingForPageReload', false);
    StateManager.updateStateItem('reloadingPageUrl', null);

    // Update current URL and extraction method
    StateManager.updateStateItem('currentUrl', url);
    StateManager.updateStateItem('currentExtractionMethod', extractionMethod);

    // Check if it's a restricted page
    if (isRestrictedPage(url)) {
      UIManager.hideLoading();
      UIManager.showRestrictedPageMessage();
      return;
    }


    // Wait for page to stabilize after reload before extracting content
    UIManager.showLoading('Page reloaded, waiting for content to stabilize...');

    // Add delay to allow page content and scripts to fully initialize
    await new Promise(resolve => setTimeout(resolve, 2000)); // 2 second delay

    // Update loading message and extract content
    UIManager.showLoading('Extracting content...');
    await loadCurrentPageDataWithRetry(true); // Use retry version for better reliability

    // Manually trigger auto-inputs after successful reload and extraction
    if (onPageDataLoadedCallback) {
        const currentState = StateManager.getState();
        const hasExtractedContent = currentState.extractedContent && currentState.extractedContent.trim().length > 0;
        if (hasExtractedContent) {
            logger.info('Triggering auto inputs after successful page reload and extraction.');
            await onPageDataLoadedCallback();
        }
    }
    return;
  }

  // Auto-extract content for new URL (original logic)
  if (url !== StateManager.getStateItem('currentUrl')) {
    logger.info(`Auto-extracting content for URL: ${url}`);
    StateManager.updateStateItem('currentUrl', url);
    StateManager.updateStateItem('currentExtractionMethod', extractionMethod);

    // Check if it's a restricted page
    if (isRestrictedPage(url)) {
      UIManager.hideLoading();
      UIManager.showRestrictedPageMessage();
      return;
    }


    // Show loading and extract content
    UIManager.showLoading('Extracting content...');

    // Check blacklist before loading page data
    await checkBlacklistAndLoadData(url);
  }
};

/**
 * Check blacklist and load data if allowed
 * @param {string} url - URL to check
 * @returns {Promise<void>}
 */
const checkBlacklistAndLoadData = async (url) => {
  try {
    logger.info('checkBlacklistAndLoadData called for URL:', url);

    // Check if URL is blacklisted
    const response = await chrome.runtime.sendMessage({
      type: 'CHECK_BLACKLIST_URL',
      url: url
    });

    if (response.type === 'BLACKLIST_CHECK_RESULT' && response.isBlacklisted) {
      logger.info('URL is blacklisted, showing confirmation overlay');

      // Show confirmation overlay
      confirmationOverlay.show({
        message: 'This page is in your blacklist. Do you want to continue using Think Bot?',
        matchedPattern: response.matchedPattern,
        onConfirm: () => {
          logger.info('User confirmed to continue on blacklisted page');
          // Continue with normal page data loading
          loadCurrentPageData();
        },
        onCancel: () => {
          logger.info('User cancelled on blacklisted page');
          // Close the sidebar
          window.close();
        }
      });
    } else {
      // URL is not blacklisted, proceed with normal loading
      await loadCurrentPageData();
    }
  } catch (error) {
    logger.error('Error checking blacklist:', error);
    // If there's an error, continue with normal flow
    await loadCurrentPageData();
  }
};

/**
 * Handle tab update
 * @param {string} url - New URL
 * @returns {Promise<void>}
 */
const handleTabUpdated = async (url) => {
  // Handle tab update with new URL
  if (url !== StateManager.getStateItem('currentUrl')) {
    logger.info(`Tab updated. New URL: ${url}`);
    StateManager.updateStateItem('currentUrl', url);

    // Check blacklist before loading page data
    await checkBlacklistAndLoadData(url);
  }
};

export {
  loadCurrentPageData,
  loadCurrentPageDataWithRetry,
  handleAutoReloadForContentScriptError,
  checkAndRestoreCurrentTabLoadingState,
  directLoadingStateCheck,
  setupStreamReconnection,
  handlePageDataLoaded,
  handleTabChanged,
  handleAutoLoadContent,
  handleAutoExtractContent,
  handleTabUpdated,
  checkBlacklistAndLoadData,
  setOnPageDataLoadedCallback
};
