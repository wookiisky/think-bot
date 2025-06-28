/**
 * tab-manager.js - Tab-based Quick Input management
 * Manages multiple conversation tabs with independent chat histories
 */

import { createLogger } from '../modules/utils.js';

const logger = createLogger('TabManager');

// Version identifier for debugging
logger.info('TabManager v1.2 loaded - Enhanced error handling');

// Tab state management
let tabs = [];
let activeTabId = 'chat'; // Default chat tab
let onTabClickHandler = null;
let isRendering = false; // Flag to prevent concurrent rendering
let isHandlingTabClick = false; // Flag to prevent concurrent tab click handling

/**
 * Check if all required dependencies are available
 * @returns {boolean} Whether dependencies are available
 */
const checkDependencies = () => {
  const missing = [];
  
  if (!window.StateManager) missing.push('StateManager');
  if (!window.ChatHistory) missing.push('ChatHistory');
  if (!window.ChatManager) missing.push('ChatManager');
  if (!chrome || !chrome.runtime) missing.push('chrome.runtime');
  
  if (missing.length > 0) {
    logger.error('Tab Manager missing dependencies:', missing);
    return false;
  }
  
  return true;
};

/**
 * Initialize tab manager
 * @param {HTMLElement} container - Tab container element  
 * @param {HTMLElement} chatContainer - Chat container element
 * @param {Function} onTabClick - Tab click handler function
 */
const initTabManager = (container, chatContainer, onTabClick) => {
  if (!container) {
    logger.error('Tab container not found');
    return;
  }
  
  onTabClickHandler = onTabClick;
  
  // Initialize with default chat tab
  tabs = [{
    id: 'chat',
    displayText: 'Chat',
    isDefault: true,
    isActive: true,
    hasInitialized: true,
    hasContent: false,
    quickInputId: null
  }];
  
  renderTabs(container);
  logger.info('Tab manager initialized with default chat tab');
};

/**
 * Load tabs from configuration
 * @param {HTMLElement} container - Tab container element
 * @param {HTMLElement} chatContainer - Chat container element  
 * @param {Function} onTabClick - Tab click handler function
 */
const loadTabs = async (container, chatContainer, onTabClick) => {
  try {
    const config = await window.StateManager.getConfig();
    
    if (!config || !config.quickInputs || config.quickInputs.length === 0) {
      logger.info('No quick inputs configured, using default chat only');
      initTabManager(container, chatContainer, onTabClick);
      return;
    }
    
    onTabClickHandler = onTabClick;
    
    // Create tabs array starting with default chat tab
    tabs = [{
      id: 'chat',
      displayText: 'Chat', 
      isDefault: true,
      isActive: true,
      hasInitialized: true,
      hasContent: false,
      quickInputId: null
    }];
    
    // Add quick input tabs
    config.quickInputs.forEach((quickInput, index) => {
      const tabId = quickInput.id || `quick-${index}`;
      tabs.push({
        id: tabId,
        displayText: quickInput.displayText,
        sendText: quickInput.sendText,
        isDefault: false,
        isActive: false,
        hasInitialized: false,
        hasContent: false,
        quickInputId: tabId
      });
    });
    
    activeTabId = 'chat';
    renderTabs(container);
    
    logger.info(`Loaded ${tabs.length} tabs (1 default + ${config.quickInputs.length} quick inputs)`);
  } catch (error) {
    logger.error('Error loading tabs:', error);
    // Fallback to default chat only
    initTabManager(container, chatContainer, onTabClick);
  }
};

/**
 * Render tabs in the container with optimized DOM updates
 * @param {HTMLElement} container - Tab container element
 * @param {boolean} skipLoadingStateUpdate - Skip loading state update to prevent recursion
 * @param {boolean} forceFullRender - Force complete re-render instead of incremental update
 */
const renderTabs = async (container, skipLoadingStateUpdate = false, forceFullRender = false) => {
  if (!container) return;

  // Prevent concurrent rendering
  if (isRendering) {
    logger.debug('Tab rendering already in progress, skipping');
    return;
  }

  isRendering = true;

  try {
    // Add updating class to prevent flicker
    container.classList.add('updating');

    // Check loading states for all tabs before rendering (only if not skipping)
    if (!skipLoadingStateUpdate) {
      await updateTabsLoadingStates();
    }

    // Check content states for all tabs
    await updateTabsContentStates();

    // Check if we can do incremental update instead of full re-render
    const existingTabs = container.querySelectorAll('.tab');
    const canDoIncrementalUpdate = !forceFullRender &&
                                   existingTabs.length === tabs.length &&
                                   Array.from(existingTabs).every((el, index) =>
                                     el.dataset.tabId === tabs[index].id
                                   );

    if (canDoIncrementalUpdate) {
      // Incremental update: only update classes and states
      existingTabs.forEach((tabElement, index) => {
        const tab = tabs[index];
        let tabClasses = `tab ${tab.isActive ? 'active' : ''}`;

        // Add loading class if tab is in loading state
        if (tab.isLoading) {
          tabClasses += ' loading';
        }

        // Add has-content class if tab has chat history
        if (tab.hasContent) {
          tabClasses += ' has-content';
        }

        // Only update if classes changed to prevent unnecessary reflows
        if (tabElement.className !== tabClasses) {
          tabElement.className = tabClasses;
        }
      });

      logger.debug('Performed incremental tab update');
    } else {
      // Full re-render: clear and rebuild
      container.innerHTML = '';
      container.className = 'tab-container';

      // Render each tab
      tabs.forEach(tab => {
        const tabElement = document.createElement('div');
        let tabClasses = `tab ${tab.isActive ? 'active' : ''}`;

        // Add loading class if tab is in loading state
        if (tab.isLoading) {
          tabClasses += ' loading';
        }

        // Add has-content class if tab has chat history
        if (tab.hasContent) {
          tabClasses += ' has-content';
        }

        tabElement.className = tabClasses;
        tabElement.dataset.tabId = tab.id;
        tabElement.textContent = tab.displayText;

        // Add click handler (remove any existing listeners first)
        tabElement.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          handleTabClick(tab.id);
        }, { once: false });

        container.appendChild(tabElement);
      });

      logger.debug(`Performed full tab re-render with ${tabs.length} tabs`);
    }
  } catch (error) {
    logger.error('Error rendering tabs:', error);
  } finally {
    // Remove updating class and reset rendering flag
    container.classList.remove('updating');
    isRendering = false;
  }
};

/**
 * Update loading states for all tabs
 * @returns {Promise<void>}
 */
const updateTabsLoadingStates = async () => {
  const currentUrl = window.StateManager.getStateItem('currentUrl');
  if (!currentUrl) return;
  
  // Check loading state for each tab
  for (const tab of tabs) {
    try {
      const loadingStateResponse = await chrome.runtime.sendMessage({
        type: 'GET_LOADING_STATE',
        url: currentUrl,
        tabId: tab.id
      });
      
      // Update tab loading state
      tab.isLoading = loadingStateResponse && 
                     loadingStateResponse.loadingState && 
                     loadingStateResponse.loadingState.status === 'loading';
                     
    } catch (error) {
      // If we can't check loading state, assume not loading
      tab.isLoading = false;
      logger.warn(`Error checking loading state for tab ${tab.id}:`, error);
    }
  }
};

/**
 * Update content states for all tabs
 * @returns {Promise<void>}
 */
const updateTabsContentStates = async () => {
  const currentUrl = window.StateManager.getStateItem('currentUrl');
  if (!currentUrl) return;
  
  // Check content state for each tab
  for (const tab of tabs) {
    try {
      const cacheKey = `${currentUrl}#${tab.id}`;
      const response = await chrome.runtime.sendMessage({
        type: 'GET_CHAT_HISTORY',
        url: cacheKey
      });
      
      // Update tab content state based on chat history
      const hasContent = response && 
                        response.chatHistory && 
                        Array.isArray(response.chatHistory) && 
                        response.chatHistory.length > 0;
      
      tab.hasContent = hasContent;
      
      logger.debug(`Tab ${tab.id} content state: ${hasContent} (${response?.chatHistory?.length || 0} messages)`);
                     
    } catch (error) {
      // If we can't check content state, assume no content
      tab.hasContent = false;
      logger.warn(`Error checking content state for tab ${tab.id}:`, error);
    }
  }
};

/**
 * Update specific tab content state and re-render if needed
 * @param {string} tabId - Tab ID to update
 * @param {boolean} hasContent - Content state
 */
const updateTabContentState = async (tabId, hasContent) => {
  const tab = tabs.find(t => t.id === tabId);
  if (tab && tab.hasContent !== hasContent) {
    const previousContentState = tab.hasContent;
    tab.hasContent = hasContent;
    
    // Re-render tabs to update visual state
    const container = document.querySelector('.tab-container');
    if (container && !isRendering) {
      await renderTabs(container, true); // Skip loading state update to prevent recursion
    }
    
    logger.info(`Updated content state for tab ${tabId}: ${previousContentState} -> ${hasContent}`);
  } else if (tab) {
    logger.debug(`Content state for tab ${tabId} unchanged: ${hasContent}`);
  } else {
    logger.warn(`Cannot update content state for tab ${tabId}: tab not found`);
  }
};

/**
 * Update specific tab loading state and re-render if needed
 * @param {string} tabId - Tab ID to update
 * @param {boolean} isLoading - Loading state
 */
const updateTabLoadingState = async (tabId, isLoading) => {
  const tab = tabs.find(t => t.id === tabId);
  if (tab && tab.isLoading !== isLoading) {
    const previousLoadingState = tab.isLoading;
    tab.isLoading = isLoading;
    
    // Re-render tabs to update visual state, but skip loading state update to prevent recursion
    const container = document.querySelector('.tab-container');
    if (container && !isRendering) {
      await renderTabs(container, true); // Skip loading state update to prevent recursion
    }
    
    logger.info(`Updated loading state for tab ${tabId}: ${previousLoadingState} -> ${isLoading} (active tab: ${activeTabId})`);
  } else if (tab) {
    logger.debug(`Loading state for tab ${tabId} unchanged: ${isLoading} (active tab: ${activeTabId})`);
  } else {
    logger.warn(`Cannot update loading state for tab ${tabId}: tab not found (active tab: ${activeTabId})`);
  }
};

/**
 * Programmatically switch to a tab and check if an auto-send action should be triggered.
 * This function handles the UI update and returns whether the action should be fired.
 * @param {string} tabId - The ID of the tab to switch to.
 * @param {Object} [options={}] - Optional parameters.
 * @param {boolean} [options.silent=false] - If true, suppresses UI re-rendering.
 * @returns {Promise<{shouldSend: boolean}>} - An object indicating if the action should be sent.
 */
const switchToTabAndCheckAction = async (tabId, options = {}) => {
  const tab = tabs.find(t => t.id === tabId);
  if (!tab) {
    logger.error(`Tab not found for auto-trigger: ${tabId}`);
    return { shouldSend: false };
  }

  // Don't switch if already active
  if (!tab.isActive) {
    // Update active tab state
    tabs.forEach(t => t.isActive = false);
    tab.isActive = true;
    activeTabId = tabId;

    // Re-render tabs to update active state, unless in silent mode
    if (!options.silent) {
      const container = document.querySelector('.tab-container');
      if (container) {
        await renderTabs(container);
      }
    }
  }

  // Load chat history for this tab
  const chatHistory = await loadTabChatHistory(tabId);

  // Check if we should send the action
  let shouldSend = false;
  if (!tab.isDefault && tab.sendText) {
    const hasExistingHistory = chatHistory && chatHistory.length > 0;
    if (!hasExistingHistory && !tab.hasInitialized) {
      // Check if content extraction result is available
      const currentState = window.StateManager ? window.StateManager.getState() : {};
      const hasExtractedContent = currentState.extractedContent && currentState.extractedContent.trim().length > 0;

      tab.hasInitialized = true; // Mark as initialized

      if (!hasExtractedContent) {
        logger.info(`Skipping auto-send for tab ${tabId}: content extraction result is empty`);
        shouldSend = false;
      } else {
        shouldSend = true;
        logger.info(`Tab ${tabId} is ready for auto-send.`);
      }
    } else {
      logger.info(`Skipping auto-send for tab ${tabId}: has history or already initialized.`);
    }
  }

  return { shouldSend };
};

/**
 * Switch to a specific tab
 * @param {string} tabId - The ID of the tab to switch to
 * @returns {Promise<boolean>} - Whether the switch was successful
 */
const switchToTab = async (tabId) => {
  try {
    const tab = tabs.find(t => t.id === tabId);
    if (!tab) {
      logger.error(`Tab not found: ${tabId}`);
      return false;
    }

    // Use handleTabClick to switch to the tab
    await handleTabClick(tabId);
    return true;
  } catch (error) {
    logger.error(`Error switching to tab ${tabId}:`, error);
    return false;
  }
};

/**
 * Handle tab click
 * @param {string} tabId - Tab ID to activate
 */
const handleTabClick = async (tabId) => {
  // Prevent concurrent tab click handling
  if (isHandlingTabClick) {
    logger.debug(`Tab click handling already in progress, ignoring click for tab ${tabId}`);
    return;
  }
  
  isHandlingTabClick = true;
  
  try {
    const tab = tabs.find(t => t.id === tabId);
    if (!tab) {
      logger.error(`Tab not found: ${tabId}`);
      return;
    }
    
    // Check if clicking on the current active tab that is in loading state
    if (tab.isActive && activeTabId === tabId) {
      // Check loading state to prevent duplicate calls
      const currentUrl = window.StateManager.getStateItem('currentUrl');
      if (currentUrl) {
        try {
          const loadingStateResponse = await chrome.runtime.sendMessage({
            type: 'GET_LOADING_STATE',
            url: currentUrl,
            tabId: tabId
          });
          
          if (loadingStateResponse && 
              loadingStateResponse.loadingState && 
              loadingStateResponse.loadingState.status === 'loading') {
            logger.info(`Tab ${tabId} is already in loading state, ignoring click to prevent duplicate calls`);
            return;
          }
        } catch (error) {
          logger.warn('Error checking loading state for duplicate prevention:', error);
          // Continue with normal flow if we can't check loading state
        }
      }
    }
    
    // Log tab switch for debugging stream routing
    const previousActiveTabId = activeTabId;
    logger.info(`Switching from tab ${previousActiveTabId} to tab ${tabId}`);
    
    // Check if there's any ongoing streaming in the current tab
    const chatContainer = document.getElementById('chatContainer');
    if (chatContainer) {
      if (window.ChatManager && window.ChatManager.hasActiveStream && window.ChatManager.hasActiveStream(chatContainer) && previousActiveTabId !== tabId) {
        // Skip logging tab switch with ongoing stream
      }
    }

    // Update active tab
    tabs.forEach(t => t.isActive = false);
    tab.isActive = true;
    activeTabId = tabId;

    // Re-render tabs to update active state (use incremental update for better performance)
    const container = document.querySelector('.tab-container');
    if (container) {
      await renderTabs(container, true); // Skip loading state update, use incremental update
    }
    
    // Load chat history for this tab and get the result
    const chatHistory = await loadTabChatHistory(tabId);

    // After switching tab and loading its content, update the input area state
    const newActiveTab = getActiveTab();
    if (window.ChatManager && window.ChatManager.updateInputAreaState) {
      window.ChatManager.updateInputAreaState(newActiveTab.isLoading);
    }
    
    // Handle quick input auto-send logic
    if (!tab.isDefault && tab.sendText) {
      // Check if this tab has existing chat history
      const hasExistingHistory = chatHistory && chatHistory.length > 0;

      if (!hasExistingHistory && !tab.hasInitialized) {
        // Check if content extraction result is available
        const currentState = window.StateManager ? window.StateManager.getState() : {};
        const hasExtractedContent = currentState.extractedContent && currentState.extractedContent.trim().length > 0;

        if (!hasExtractedContent) {
          logger.info(`Skipping auto-send for tab ${tabId}: content extraction result is empty`);
          // Mark as initialized to prevent future auto-send attempts
          tab.hasInitialized = true;

          if (onTabClickHandler) {
            // Normal tab switch without auto-send
            onTabClickHandler(null, null, tabId, false);
          }
        } else {
          // Only auto-send if no existing history and not yet initialized and content is available
          tab.hasInitialized = true;

          // For Quick Input auto-send, always force include page content (but don't change UI state)
          const forceIncludePageContent = true;

          // Auto-send the quick input message with forced include page content
          if (onTabClickHandler) {
            logger.info(`Auto-sending Quick Input for tab ${tabId} (no existing history) with forced page content inclusion`);
            onTabClickHandler(tab.displayText, tab.sendText, tabId, true, forceIncludePageContent);
          }
        }
      } else {
        // Tab has existing history or already initialized, just switch without auto-send
        if (hasExistingHistory) {
          logger.info(`Tab ${tabId} has existing chat history (${chatHistory.length} messages), skipping auto-send`);
        } else {
          logger.info(`Tab ${tabId} already initialized, skipping auto-send`);
        }
        
        if (onTabClickHandler) {
          // Normal tab switch without auto-send
          onTabClickHandler(null, null, tabId, false);
        }
      }
    } else if (onTabClickHandler) {
      // Default chat tab or tab without sendText - normal switch
      onTabClickHandler(null, null, tabId, false);
    }
    
    logger.info(`Successfully switched to tab: ${tabId}`);
  } catch (error) {
    logger.error(`Error handling tab click for ${tabId}:`, error);
  } finally {
    isHandlingTabClick = false;
  }
};

/**
 * Load chat history for a specific tab and restore loading state
 * @param {string} tabId - Tab ID
 * @returns {Promise<Array>} Chat history array
 */
const loadTabChatHistory = async (tabId) => {
  try {
    const currentUrl = window.StateManager.getStateItem('currentUrl');
    if (!currentUrl) {
      logger.warn('No current URL, cannot load tab chat history');
      return [];
    }
    
    const cacheKey = `${currentUrl}#${tabId}`;
    logger.info(`Loading chat history for tab ${tabId} from key: ${cacheKey}`);
    
    const response = await chrome.runtime.sendMessage({
      type: 'GET_CHAT_HISTORY',
      url: cacheKey
    });
    
    const chatContainer = document.getElementById('chatContainer');
    
    if (response && response.type === 'CHAT_HISTORY_LOADED') {
      // Handle both empty and non-empty chat history
      const chatHistory = response.chatHistory || [];
      
      // Clear any existing streaming state when switching tabs
      if (chatContainer) {
        const existingStreamingMessages = chatContainer.querySelectorAll('[data-streaming="true"]');
        existingStreamingMessages.forEach(msg => {
          logger.info('Clearing streaming state from previous tab');
          msg.removeAttribute('data-streaming');
          msg.removeAttribute('data-markdown-buffer');
          
          // Remove any loading containers
          const loadingContainers = msg.querySelectorAll('.loading-container');
          loadingContainers.forEach(container => container.remove());
        });
        
        // Clear any edit mode states when switching tabs
        const editModeElements = chatContainer.querySelectorAll('.message-content.edit-mode');
        editModeElements.forEach(element => {
          logger.info('Clearing edit mode from previous tab');
          element.classList.remove('edit-mode');
          
          // If there's a textarea, restore the original content
          const textarea = element.querySelector('textarea.edit-textarea');
          if (textarea) {
            const originalContent = textarea.getAttribute('data-original-content') || element.getAttribute('data-raw-content') || '';
            // Restore content based on message type
            const messageElement = element.closest('.chat-message');
            const isUserMessage = messageElement && messageElement.classList.contains('user-message');
            
            if (isUserMessage) {
              element.textContent = originalContent;
            } else {
              // For assistant messages, check if contains markdown
              const containsMarkdown = window.hasMarkdownElements && window.hasMarkdownElements(originalContent);
              element.classList.remove('no-markdown');
              
              if (containsMarkdown) {
                try {
                  element.innerHTML = window.marked.parse(originalContent);
                } catch (error) {
                  element.textContent = originalContent;
                  element.classList.add('no-markdown');
                }
              } else {
                element.textContent = originalContent;
                element.classList.add('no-markdown');
              }
            }
          }
        });
      }
      
      // Display the history in chat container
      if (chatContainer && window.ChatHistory && window.ChatManager) {
        window.ChatHistory.displayChatHistory(
          chatContainer, 
          chatHistory,
          window.ChatManager.appendMessageToUI
        );
        logger.info(`Successfully loaded and displayed chat history for tab ${tabId}: ${chatHistory.length} messages`);
      } else {
        logger.warn(`Cannot display chat history for tab ${tabId}: missing required components`);
      }
      
      // Check for cached loading state and restore if needed
      await checkAndRestoreLoadingState(currentUrl, tabId, chatContainer);

      // After loading history and restoring state, update the input area
      const activeTab = getActiveTab();
      if (activeTab && activeTab.id === tabId && window.ChatManager && window.ChatManager.updateInputAreaState) {
        window.ChatManager.updateInputAreaState(activeTab.isLoading);
      }
      
      // Return the chat history for caller to use
      return chatHistory;
    } else {
      // Clear chat container for new tab
      if (chatContainer) {
        chatContainer.innerHTML = '';
      }
      
      // Check for cached loading state even if no chat history
      await checkAndRestoreLoadingState(currentUrl, tabId, chatContainer);
      
      // Improved response logging
      const responseInfo = response ? {
        type: response.type || 'unknown',
        hasHistory: !!response.chatHistory,
        historyLength: response.chatHistory ? response.chatHistory.length : 0
      } : 'null response';
      
      logger.info(`No chat history found for tab ${tabId}. Response:`, responseInfo);
      return [];
    }
  } catch (error) {
    // Enhanced error logging
    const errorInfo = {
      message: error.message || 'Unknown error',
      name: error.name || 'Error',
      tabId: tabId,
      currentUrl: window.StateManager ? window.StateManager.getStateItem('currentUrl') : 'unknown'
    };
    
    logger.error('Exception while loading tab chat history:', errorInfo);
    return [];
  }
};

/**
 * Check and restore loading state for a tab
 * @param {string} currentUrl - Current page URL
 * @param {string} tabId - Tab ID
 * @param {HTMLElement} chatContainer - Chat container element
 */
const checkAndRestoreLoadingState = async (currentUrl, tabId, chatContainer) => {
  try {
    // Request loading state from background script
    const loadingStateResponse = await chrome.runtime.sendMessage({
      type: 'GET_LOADING_STATE',
      url: currentUrl,
      tabId: tabId
    });
    
    if (loadingStateResponse && loadingStateResponse.loadingState) {
      const loadingState = loadingStateResponse.loadingState;
      logger.info(`Found cached loading state for tab ${tabId}:`, {
        status: loadingState.status,
        timestamp: loadingState.timestamp,
        isRetry: loadingState.isRetry
      });
      
      if (loadingState.status === 'loading') {
        // Show enhanced loading indicator with additional context
        if (chatContainer && window.ChatManager) {
          let loadingMessage = '<div class="spinner"></div>';
          
          // Add context if this was a retry operation
          if (loadingState.isRetry) {
            loadingMessage += '<div class="loading-context">Retrying message...</div>';
          } else if (loadingState.lastMessageContent) {
            const shortContent = loadingState.lastMessageContent.length > 50 
              ? loadingState.lastMessageContent.substring(0, 50) + '...'
              : loadingState.lastMessageContent;
            loadingMessage += `<div class="loading-context">Processing: ${shortContent}</div>`;
          }
          
          window.ChatManager.appendMessageToUI(
            chatContainer,
            'assistant',
            loadingMessage,
            null,
            true
          );
          
          logger.info(`Restored enhanced loading UI for tab ${tabId} with context`);
        }
        
        // Update tab visual state
        const tab = tabs.find(t => t.id === tabId);
        if (tab) {
          tab.isLoading = true;
          
          // Re-render tabs to show loading state
          const container = document.querySelector('.tab-container');
          if (container && !isRendering) {
            await renderTabs(container, true); // Skip loading state update to prevent recursion
          }
        }
      }
    } else {
      logger.debug(`No cached loading state found for tab ${tabId}`);
    }
  } catch (error) {
    logger.warn(`Error checking loading state for tab ${tabId}:`, error);
  }
};

/**
 * Save chat history for current active tab
 * @param {Array} chatHistory - Chat history array
 */
const saveCurrentTabChatHistory = async (chatHistory) => {
  
  // Check dependencies first
  if (!checkDependencies()) {
    logger.error('Cannot save tab chat history: missing dependencies');
    return false;
  }
  
  try {
    const currentUrl = window.StateManager.getStateItem('currentUrl');
    if (!currentUrl) {
      logger.warn('No current URL, cannot save tab chat history');
      return false;
    }
    
    // Validate chatHistory parameter
    if (!Array.isArray(chatHistory)) {
      logger.error('Invalid chat history provided for saving:', typeof chatHistory);
      return false;
    }
    
    const cacheKey = `${currentUrl}#${activeTabId}`;
    logger.info(`Attempting to save chat history for tab ${activeTabId} with ${chatHistory.length} messages to key: ${cacheKey}`);
    
    const response = await chrome.runtime.sendMessage({
      type: 'SAVE_CHAT_HISTORY',
      url: cacheKey,
      chatHistory: chatHistory
    });
    
    logger.info(`Received response for tab ${activeTabId} save operation:`, response);
    
    if (response && response.type === 'CHAT_HISTORY_SAVED') {
      logger.info(`Successfully saved chat history for tab ${activeTabId}: ${chatHistory.length} messages`);
      
      // Update tab content state after successful save
      await updateTabContentState(activeTabId, chatHistory.length > 0);
      
      return true;
    } else if (response && response.success === true) {
      // Handle case where backend reports success but with different response format
      logger.info(`Chat history saved successfully for tab ${activeTabId} (alternative success format): ${chatHistory.length} messages`);
      
      // Update tab content state after successful save
      await updateTabContentState(activeTabId, chatHistory.length > 0);
      
      return true;
    } else {
      // Improved error logging with detailed response information
      const responseInfo = response ? {
        type: response.type || 'unknown',
        error: response.error || 'no error message',
        success: response.success || false,
        keys: Object.keys(response),
        fullResponse: JSON.stringify(response)
      } : 'null response';
      
      logger.error(`Failed to save tab chat history for ${activeTabId}. Response details:`, responseInfo);
      return false;
    }
  } catch (error) {
    // Enhanced error logging with more context
    const errorInfo = {
      message: error.message || 'Unknown error',
      name: error.name || 'Error',
      stack: error.stack || 'No stack trace',
      activeTabId: activeTabId,
      chatHistoryLength: Array.isArray(chatHistory) ? chatHistory.length : 'invalid'
    };
    
    logger.error('Exception while saving tab chat history:', errorInfo);
    return false;
  }
};

/**
 * Get current active tab
 * @returns {Object|null} Active tab object
 */
const getActiveTab = () => {
  return tabs.find(t => t.isActive) || null;
};

/**
 * Get current active tab ID
 * @returns {string} Active tab ID
 */
const getActiveTabId = () => {
  return activeTabId;
};

/**
 * Get all tabs
 * @returns {Array} Array of all tab objects
 */
const getAllTabs = () => {
  return [...tabs]; // Return a copy to prevent external modification
};

/**
 * Clear chat history for a specific tab
 * @param {string} tabId - Tab ID (optional, defaults to active tab)
 */
const clearTabChatHistory = async (tabId = null) => {
  const targetTabId = tabId || activeTabId;
  
  try {
    const currentUrl = window.StateManager.getStateItem('currentUrl');
    if (!currentUrl) {
      logger.warn('No current URL, cannot clear tab chat history');
      return false;
    }
    
    const cacheKey = `${currentUrl}#${targetTabId}`;
    logger.info(`Clearing chat history for tab ${targetTabId} with key: ${cacheKey}`);
    
    const response = await chrome.runtime.sendMessage({
      type: 'CLEAR_URL_DATA',
      url: cacheKey,
      clearContent: false,
      clearChat: true
    });
    
    // Check response for success
    if (response && response.success !== false) {
      // If clearing active tab, also clear UI
      if (targetTabId === activeTabId) {
        const chatContainer = document.getElementById('chatContainer');
        if (chatContainer) {
          chatContainer.innerHTML = '';
        }
      }
      
      // Update tab content state after clearing
      await updateTabContentState(targetTabId, false);
      
      logger.info(`Successfully cleared chat history for tab ${targetTabId}`);
      return true;
    } else {
      // Log response details for debugging
      const responseInfo = response ? {
        type: response.type || 'unknown',
        success: response.success,
        error: response.error || 'no error message'
      } : 'null response';
      
      logger.error(`Failed to clear chat history for tab ${targetTabId}. Response:`, responseInfo);
      return false;
    }
  } catch (error) {
    // Enhanced error logging
    const errorInfo = {
      message: error.message || 'Unknown error',
      name: error.name || 'Error',
      targetTabId: targetTabId,
      activeTabId: activeTabId,
      currentUrl: window.StateManager ? window.StateManager.getStateItem('currentUrl') : 'unknown'
    };
    
    logger.error('Exception while clearing tab chat history:', errorInfo);
    return false;
  }
};

/**
 * Clear chat history for all tabs
 */
const clearAllTabsData = async () => {
  try {
    logger.info('Clearing chat history for all tabs');

    // Clear chat history for all tabs
    const clearPromises = tabs.map(tab => clearTabChatHistory(tab.id));
    await Promise.all(clearPromises);

    // Clear the main chat container
    const chatContainer = document.getElementById('chatContainer');
    if (chatContainer) {
      chatContainer.innerHTML = '';
    }

    // Reset all tab initialization states
    resetTabInitializationStates();

    logger.info('Successfully cleared chat history for all tabs');
    return true;
  } catch (error) {
    logger.error('Error clearing all tabs data:', error);
    return false;
  }
};

/**
 * Reset initialization state for a specific tab
 * This allows the tab to trigger auto-send again after clearing conversation
 * @param {string} tabId - Tab ID to reset
 */
const resetTabInitializationState = (tabId) => {
  const tab = tabs.find(t => t.id === tabId);
  if (tab && !tab.isDefault) {
    // Reset hasInitialized flag for quick input tab
    tab.hasInitialized = false;
    logger.info(`Reset initialization state for tab ${tabId}`);
  } else if (tab && tab.isDefault) {
    logger.debug(`Tab ${tabId} is default chat tab, no initialization state to reset`);
  } else {
    logger.warn(`Tab ${tabId} not found for initialization state reset`);
  }
};

/**
 * Reset initialization states for all quick input tabs
 * This allows quick input tabs to trigger auto-send again after clearing conversation
 */
const resetTabInitializationStates = () => {
  tabs.forEach(tab => {
    if (!tab.isDefault) {
      // Reset hasInitialized flag for quick input tabs
      tab.hasInitialized = false;
      logger.debug(`Reset initialization state for tab ${tab.id}`);
    }
  });
  logger.info('Reset initialization states for all quick input tabs');
};

/**
 * Reset loading states for all tabs
 * This forces all tabs to show as not loading, useful when switching pages
 */
const resetTabsLoadingStates = async () => {
  let hasChanges = false;

  tabs.forEach(tab => {
    if (tab.isLoading) {
      tab.isLoading = false;
      hasChanges = true;
      logger.debug(`Reset loading state for tab ${tab.id}`);
    }
  });

  if (hasChanges) {
    // Re-render tabs to update visual state
    const container = document.querySelector('.tab-container');
    if (container && !isRendering) {
      await renderTabs(container, true); // Skip loading state update to prevent recursion
    }
    logger.info('Reset loading states for all tabs');
  }
};

/**
 * Remove tab when quick input is deleted
 * @param {string} quickInputId - Quick input ID to remove
 */
const removeQuickInputTab = async (quickInputId) => {
  const tabIndex = tabs.findIndex(t => t.quickInputId === quickInputId);
  if (tabIndex === -1) {
    logger.warn(`Tab with quick input ID ${quickInputId} not found`);
    return;
  }
  
  const tab = tabs[tabIndex];
  
  // Clear chat history for this tab
  await clearTabChatHistory(tab.id);
  
  // Remove tab from array
  tabs.splice(tabIndex, 1);
  
  // If this was the active tab, switch to default chat tab
  if (tab.isActive) {
    await handleTabClick('chat');
  }
  
  // Re-render tabs
  const container = document.querySelector('.tab-container');
  if (container) {
    renderTabs(container);
  }
  
  logger.info(`Removed tab for quick input ${quickInputId}`);
};

/**
 * Set active tab programmatically
 * @param {string} tabId - Tab ID to set as active
 * @param {boolean} loadContent - Whether to load tab content (default: true)
 * @returns {Promise<boolean>} Success status
 */
const setActiveTab = async (tabId, loadContent = true) => {
  try {
    const tab = tabs.find(t => t.id === tabId);
    if (!tab) {
      logger.error(`Tab not found: ${tabId}`);
      return false;
    }

    // Update active tab state
    tabs.forEach(t => t.isActive = false);
    tab.isActive = true;
    activeTabId = tabId;

    // Re-render tabs to update UI (use incremental update for better performance)
    const container = document.querySelector('.tab-container');
    if (container) {
      await renderTabs(container, true); // Skip loading state update, use incremental update
    }

    // Load tab content if requested (default behavior)
    if (loadContent) {
      logger.info(`Loading content for tab: ${tabId}`);
      await loadTabChatHistory(tabId);
    }

    logger.info(`Successfully set active tab to: ${tabId}${loadContent ? ' with content loaded' : ' (UI only)'}`);
    return true;
  } catch (error) {
    logger.error(`Error setting active tab to ${tabId}:`, error);
    return false;
  }
};

/**
 * Reset to default chat tab
 * @returns {Promise<boolean>} Success status
 */
const resetToDefaultTab = async () => {
  try {
    logger.info('Resetting to default chat tab');
    return await setActiveTab('chat');
  } catch (error) {
    logger.error('Error resetting to default tab:', error);
    return false;
  }
};

/**
 * Force re-rendering of the current tab state.
 * Useful after a series of silent updates.
 */
const renderCurrentTabsState = async () => {
  const container = document.querySelector('.tab-container');
  if (container) {
    logger.info('Force re-rendering current tab state');
    await renderTabs(container);
  }
};

export {
  initTabManager,
  loadTabs,
  handleTabClick,
  switchToTab,
  switchToTabAndCheckAction,
  loadTabChatHistory,
  saveCurrentTabChatHistory,
  getActiveTab,
  getActiveTabId,
  getAllTabs,
  setActiveTab,
  resetToDefaultTab,
  clearTabChatHistory,
  clearAllTabsData,
  resetTabInitializationState,
  resetTabInitializationStates,
  resetTabsLoadingStates,
  removeQuickInputTab,
  updateTabLoadingState,
  updateTabsLoadingStates,
  updateTabContentState,
  updateTabsContentStates,
  renderCurrentTabsState
};