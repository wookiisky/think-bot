/**
 * tab-manager.js - Tab-based Quick Input management
 * Manages multiple conversation tabs with independent chat histories
 */

import { i18n } from '../../js/modules/i18n.js';
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
// Runtime state per tab to avoid repeated GETs
// { [tabId: string]: { activeBranches: Set<string>, hasAnyContent: boolean } }
const tabRuntimeState = {};

function ensureTabRuntime(tabId) {
  if (!tabRuntimeState[tabId]) {
    tabRuntimeState[tabId] = { activeBranches: new Set(), hasAnyContent: false };
  }
  return tabRuntimeState[tabId];
}

async function registerBranchStart(tabId, branchId) {
  try {
    const state = ensureTabRuntime(tabId);
    if (branchId) state.activeBranches.add(branchId);
    await updateTabLoadingState(tabId, true);
    logger.info(`Branch started for tab ${tabId}${branchId ? `, branch ${branchId}` : ''}`);
  } catch (e) {
    logger.warn('registerBranchStart failed:', e);
  }
}

async function registerBranchDone(tabId, branchId) {
  try {
    const state = ensureTabRuntime(tabId);
    if (branchId) state.activeBranches.delete(branchId);
    state.hasAnyContent = true;
    const isLoading = state.activeBranches.size > 0;
    const hasContent = !isLoading && state.hasAnyContent;
    await updateTabLoadingState(tabId, isLoading);
    await updateTabContentState(tabId, hasContent);
    logger.info(`Branch completed for tab ${tabId}${branchId ? `, branch ${branchId}` : ''}`);
  } catch (e) {
    logger.warn('registerBranchDone failed:', e);
  }
}

async function registerBranchError(tabId, branchId) {
  try {
    const state = ensureTabRuntime(tabId);
    if (branchId) state.activeBranches.delete(branchId);
    state.hasAnyContent = true; // error counts as content for badge
    const isLoading = state.activeBranches.size > 0;
    const hasContent = !isLoading && state.hasAnyContent;
    await updateTabLoadingState(tabId, isLoading);
    await updateTabContentState(tabId, hasContent);
    logger.info(`Branch errored for tab ${tabId}${branchId ? `, branch ${branchId}` : ''}`);
  } catch (e) {
    logger.warn('registerBranchError failed:', e);
  }
}

function resetTabRuntime(tabId) {
  if (tabRuntimeState[tabId]) {
    tabRuntimeState[tabId].activeBranches.clear();
    tabRuntimeState[tabId].hasAnyContent = false;
  }
}

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
    displayText: i18n.getMessage('common_chat'),
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
      displayText: i18n.getMessage('common_chat'),
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

    // Render tabs without forcing state update initially
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

    // Event-driven: avoid background polling for loading states during render
    // if (!skipLoadingStateUpdate) {
    //   await updateTabsLoadingStates();
    // }

    // Event-driven: avoid background polling for content states during render
    // if (forceFullRender) {
    //   await updateTabsContentStates();
    // }

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
 * Update loading states for all tabs - OPTIMIZED batch version
 * @returns {Promise<void>}
 */
const updateTabsLoadingStates = async () => {
  const currentUrl = window.StateManager.getStateItem('currentUrl');
  if (!currentUrl) return;
  
  if (tabs.length === 0) return;
  
  const startTime = Date.now();
  logger.info(`Starting OPTIMIZED loading state update for URL: ${currentUrl} with ${tabs.length} tabs`);
  
  try {
    // Use batch API to get all loading states in a single request
    const tabIds = tabs.map(tab => tab.id);
    const batchResponse = await chrome.runtime.sendMessage({
      type: 'GET_BATCH_LOADING_STATE',
      url: currentUrl,
      tabIds: tabIds
    });
    
    if (batchResponse && batchResponse.type === 'BATCH_LOADING_STATE_LOADED') {
      const requestTime = Date.now() - startTime;
      logger.info(`Batch loading state request for ${tabs.length} tabs completed in ${requestTime}ms`);
      
      // Update tab loading states based on batch results
      for (const result of batchResponse.results) {
        const tab = tabs.find(t => t.id === result.tabId);
        if (tab) {
          tab.isLoading = result.loadingState && 
                         result.loadingState.status === 'loading';
        }
      }
    } else {
      logger.warn('Batch loading state API failed, falling back to individual requests');
      throw new Error('Batch API failed');
    }
  } catch (error) {
    logger.warn('Batch loading state request failed, falling back to individual requests:', error.message);
    
    // Fallback to individual requests
    const fallbackStartTime = Date.now();
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
    
    const fallbackTime = Date.now() - fallbackStartTime;
    logger.info(`Fallback: Completed ${tabs.length} individual loading state requests in ${fallbackTime}ms`);
  }
  
  const totalTime = Date.now() - startTime;
  logger.info(`Total updateTabsLoadingStates completed in ${totalTime}ms`);
};

/**
 * Update content states for all tabs - OPTIMIZED version
 * @returns {Promise<void>}
 */
const updateTabsContentStates = async () => {
  const currentUrl = window.StateManager.getStateItem('currentUrl');
  if (!currentUrl) {
    logger.warn('No currentUrl available for content state update');
    return;
  }
  
  logger.info(`Starting OPTIMIZED content state update for URL: ${currentUrl} with ${tabs.length} tabs`);
  let hasStateChanges = false;
  
  // OPTIMIZATION: Create all cache keys upfront and batch them
  const tabCacheKeys = tabs.map(tab => ({
    tab,
    cacheKey: `${currentUrl}#${tab.id}`
  }));
  
  // SUPER OPTIMIZATION: Use batch API to get all chat histories in a single request
  const startTime = Date.now();
  const allUrls = tabCacheKeys.map(({ cacheKey }) => cacheKey);
  
  let allHistories = [];
  try {
    const batchResponse = await chrome.runtime.sendMessage({
      type: 'GET_BATCH_CHAT_HISTORY',
      urls: allUrls
    });
    
    if (batchResponse && batchResponse.type === 'BATCH_CHAT_HISTORY_LOADED') {
      const requestTime = Date.now() - startTime;
      logger.info(`Batch request for ${tabs.length} chat histories completed in ${requestTime}ms (vs ${Math.round(requestTime * tabs.length)}ms for individual requests)`);
      
      // Map batch results back to tab structure
      allHistories = tabCacheKeys.map(({ tab, cacheKey }) => {
        const result = batchResponse.results.find(r => r.url === cacheKey);
        return {
          tab,
          cacheKey,
          response: result ? { type: 'CHAT_HISTORY_LOADED', chatHistory: result.chatHistory } : null,
          history: result ? result.chatHistory : []
        };
      });
      
    } else {
      logger.warn('Batch API failed, falling back to individual requests');
      throw new Error('Batch API failed');
    }
  } catch (error) {
    logger.warn('Batch request failed, falling back to individual parallel requests:', error.message);
    
    // Fallback to individual parallel requests
    const historyPromises = tabCacheKeys.map(async ({ tab, cacheKey }) => {
      try {
        const response = await chrome.runtime.sendMessage({
          type: 'GET_CHAT_HISTORY',
          url: cacheKey
        });
        return {
          tab,
          cacheKey,
          response,
          history: response && Array.isArray(response.chatHistory) ? response.chatHistory : []
        };
      } catch (error) {
        logger.error(`Error getting chat history for tab ${tab.id}:`, error);
        return {
          tab,
          cacheKey,
          response: null,
          history: []
        };
      }
    });
    
    allHistories = await Promise.all(historyPromises);
    const requestTime = Date.now() - startTime;
    logger.info(`Fallback: Completed ${tabs.length} individual requests in ${requestTime}ms`);
  }
  
  // OPTIMIZATION: Process all results in a single loop
  const processStartTime = Date.now();
  for (const { tab, cacheKey, history } of allHistories) {
    try {
      let hasContent = false;
      let hasLoadingBranch = false;

      for (const msg of history) {
        if (!msg) continue;
        if (msg.role === 'assistant') {
          if (Array.isArray(msg.responses) && msg.responses.length > 0) {
            for (const r of msg.responses) {
              if (r && r.status === 'loading') {
                hasLoadingBranch = true;
                break;
              }
            }
            if (!hasLoadingBranch) {
              // No loading branches in this assistant message, consider content present if any response has content or error
              hasContent = hasContent || msg.responses.some(r => r && (r.status === 'done' || r.status === 'error') && (r.content || r.errorMessage));
            }
          } else if (typeof msg.content === 'string' && msg.content.trim().length > 0) {
            // Legacy single assistant content
            hasContent = true;
          }
        } else if (msg.role === 'user') {
          // User messages alone don't determine has-content
          continue;
        }
        if (hasLoadingBranch) break;
      }

      // Per spec: if any branch is loading, treat tab as loading (handled elsewhere), and do not mark has-content
      const newHasContent = !hasLoadingBranch && hasContent;
      
      // Track if any tab state changed
      if (tab.hasContent !== newHasContent) {
        hasStateChanges = true;
      }
      
      tab.hasContent = newHasContent;

      // Only log tabs with content for cleaner output
      if (tab.hasContent) {
        logger.debug(`Tab ${tab.id}: hasContent=true, messages=${history.length}`);
      }

    } catch (error) {
      // If we can't check content state, assume no content
      if (tab.hasContent !== false) {
        hasStateChanges = true;
      }
      tab.hasContent = false;
      logger.error(`Error processing content state for tab ${tab.id}:`, error);
    }
  }
  
  const processTime = Date.now() - processStartTime;
  logger.info(`Processed ${tabs.length} tab content states in ${processTime}ms`);
  
  // Re-render tabs if any state changed
  if (hasStateChanges) {
    const container = document.querySelector('.tab-container');
    if (container && !isRendering) {
      const renderStartTime = Date.now();
      logger.info('Content states changed, re-rendering tabs. States:', tabs.map(t => `${t.id}:${t.hasContent}`));
      await renderTabs(container, true); // Skip loading state update to prevent recursion
      const renderTime = Date.now() - renderStartTime;
      logger.info(`Tabs re-rendered after content state changes in ${renderTime}ms`);
    } else {
      logger.warn('Cannot re-render tabs:', { container: !!container, isRendering });
    }
  } else {
    logger.debug('No content state changes detected for tabs');
  }
  
  const totalTime = Date.now() - startTime;
  logger.info(`Total updateTabsContentStates completed in ${totalTime}ms`);
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

      // Do not set hasInitialized here, should be set after actually sending message

      if (!hasExtractedContent) {
        logger.info(`Skipping auto-send for tab ${tabId}: content extraction result is empty`);
        shouldSend = false;
        // Only mark as initialized when certain not to send message
        tab.hasInitialized = true;
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

    // Save current active Tab chat history before switching to avoid losing unsaved content (including branches)
    try {
      const chatContainer = document.getElementById('chatContainer');
      if (chatContainer && window.ChatHistory && window.ChatHistory.getChatHistoryFromDOM && window.TabManager && window.TabManager.saveCurrentTabChatHistory) {
        const currentHistory = window.ChatHistory.getChatHistoryFromDOM(chatContainer);
        if (Array.isArray(currentHistory)) {
          await window.TabManager.saveCurrentTabChatHistory(currentHistory);
          logger.info(`Pre-saved chat history for tab ${previousActiveTabId} before switching`);
        }
      }
    } catch (presaveError) {
      logger.warn('Failed to pre-save chat history before tab switch:', presaveError);
    }
    
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

      // Special case: if tab was initialized but has no history now, 
      // it might have been cleared by stop-delete action, so allow re-initialization
      let shouldAllowAutoSend = !hasExistingHistory && !tab.hasInitialized;
      if (!shouldAllowAutoSend && !hasExistingHistory && tab.hasInitialized) {
        logger.info(`Tab ${tabId} was initialized but has no history - checking if auto-send should be re-enabled`);
        // Reset initialization state for empty quick input tabs to allow re-triggering
        tab.hasInitialized = false;
        shouldAllowAutoSend = true;
        logger.info(`Reset initialization state for empty quick input tab ${tabId}`);
      }

      if (shouldAllowAutoSend) {
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
          // Do not set hasInitialized here, should be set after message sending is complete

          // For Quick Input auto-send, always force include page content (but don't change UI state)
          const forceIncludePageContent = true;

          // Auto-send the quick input message with forced include page content
          if (onTabClickHandler) {
            logger.info(`Auto-sending Quick Input for tab ${tabId} (no existing history) with forced page content inclusion`);
            onTabClickHandler(tab.displayText, tab.sendText, tabId, true, forceIncludePageContent);
            // Mark as initialized immediately after sending message
            tab.hasInitialized = true;
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
const loadTabChatHistory = async (tabId, preloadedHistory = null) => {
  try {
    const currentUrl = window.StateManager.getStateItem('currentUrl');
    if (!currentUrl) {
      logger.warn('No current URL, cannot load tab chat history');
      return [];
    }

    let chatHistory = preloadedHistory;
    let response = null;

    if (chatHistory) {
      logger.info(`Using preloaded chat history for tab ${tabId}: ${chatHistory.length} messages`);
    } else {
      const cacheKey = `${currentUrl}#${tabId}`;
      logger.info(`Loading chat history for tab ${tabId} from key: ${cacheKey}`);
      
      response = await chrome.runtime.sendMessage({
        type: 'GET_CHAT_HISTORY',
        url: cacheKey
      });

      if (response && response.type === 'CHAT_HISTORY_LOADED') {
        chatHistory = response.chatHistory || [];
      } else {
        chatHistory = [];
      }
    }
    
    const chatContainer = document.getElementById('chatContainer');
    
    if (chatHistory.length > 0 || (response && response.type === 'CHAT_HISTORY_LOADED')) {
      
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
      
      logger.info(`No chat history found for tab ${tabId}.`);
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
        // Restore loading using proper branch structure to avoid legacy warning
        if (chatContainer && window.ChatManager) {
          try {
            // If any streaming element already exists, do not add another loader
            const existingStreaming = chatContainer.querySelector('[data-streaming="true"]');
            if (!existingStreaming) {
              // Create proper branch structure instead of using legacy appendMessageToUI
              const branchId = `br-restore-${Date.now()}-${Math.random().toString(36).slice(2)}`;
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
              branchDiv.setAttribute('data-model', 'restored');
              
              // Create content div
              const contentDiv = document.createElement('div');
              contentDiv.className = 'message-content';
              contentDiv.setAttribute('data-raw-content', '');
              
              // Create loading container
              const loadingContainer = document.createElement('div');
              loadingContainer.className = 'loading-container';
              // No inner spinner; border loader is handled by CSS on the branch
              contentDiv.appendChild(loadingContainer);
              logger.debug(`Tab ${tabId} restore uses border loader (no spinner) for branch ${branchId}`);
              
              // Create model label
              const modelLabel = document.createElement('div');
              modelLabel.className = 'branch-model-label';
              modelLabel.textContent = 'restored';
              branchDiv.appendChild(modelLabel);
              
              // Assemble the structure
              branchDiv.appendChild(contentDiv);
              branchesDiv.appendChild(branchDiv);
              branchContainer.appendChild(branchesDiv);
              chatContainer.appendChild(branchContainer);
              
              logger.info(`Restored loading UI for tab ${tabId} using branch structure (branchId: ${branchId})`);
            } else {
              logger.debug('Skip adding loader: streaming element already exists');
            }
          } catch (e) {
            logger.warn('Failed to restore loading UI using branch structure:', e);
          }
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
    
    // Apply COT filtering to chat history before saving if enabled
    let filteredChatHistory = chatHistory;
    
    if (window.ChatManager && window.ChatManager.applyCOTFilteringToChatHistory) {
      try {
        filteredChatHistory = await window.ChatManager.applyCOTFilteringToChatHistory(chatHistory);
        logger.info(`COT filtering applied to chat history for tab ${activeTabId}`);
      } catch (error) {
        logger.warn('Failed to apply COT filtering during save, using original content:', error);
        filteredChatHistory = chatHistory; // Fallback to original
      }
    }
    
    const cacheKey = `${currentUrl}#${activeTabId}`;
    logger.info(`Attempting to save chat history for tab ${activeTabId} with ${filteredChatHistory.length} messages to key: ${cacheKey}`);
    
    const response = await chrome.runtime.sendMessage({
      type: 'SAVE_CHAT_HISTORY',
      url: cacheKey,
      chatHistory: filteredChatHistory
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
 * Mark a tab as initialized after sending a message
 * @param {string} tabId - Tab ID to mark as initialized
 */
const markTabAsInitialized = (tabId) => {
  const tab = tabs.find(t => t.id === tabId);
  if (tab && !tab.isDefault) {
    tab.hasInitialized = true;
    logger.info(`Marked tab ${tabId} as initialized`);
  } else if (tab && tab.isDefault) {
    logger.debug(`Tab ${tabId} is default chat tab, no initialization state to set`);
  } else {
    logger.warn(`Tab ${tabId} not found for marking as initialized`);
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
    logger.info('Force re-rendering current tab state with content check');
    // Force a full re-render including content states
    await renderTabs(container, false, true);
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
  markTabAsInitialized,
  resetTabsLoadingStates,
  removeQuickInputTab,
  updateTabLoadingState,
  updateTabsLoadingStates,
  updateTabContentState,
  updateTabsContentStates,
  renderCurrentTabsState,
  // Event-driven helpers
  registerBranchStart,
  registerBranchDone,
  registerBranchError,
  resetTabRuntime
};
