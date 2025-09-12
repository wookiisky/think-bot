// Global Error Catcher
window.addEventListener('error', function(event) {
  const errorInfo = {
    message: event.message,
    source: event.filename,
    lineno: event.lineno,
    colno: event.colno,
    error: event.error ? event.error.stack : 'No stack available',
    timestamp: new Date().toISOString(),
    page: 'sidebar'
  };
  chrome.storage.local.set({ 'last_error': errorInfo });
});

/**
 * sidebar.js - Main entry point for Think Bot sidebar
 * Integrates all modules and manages application logic flow
 */

// Import all modules
import { i18n } from '../js/modules/i18n.js';
import { createLogger } from './modules/utils.js';
import * as StateManager from './modules/state-manager.js';
import * as UIManager from './modules/ui-manager.js';
import * as MessageHandler from './modules/message-handler.js';
import * as ChatManager from './modules/chat-manager.js';
import * as ResizeHandler from './modules/resize-handler.js';
import * as ImageHandler from './modules/image-handler.js';
import * as TabManager from './components/tab-manager.js';
import * as ChatHistory from './modules/chat-history.js';
import * as PageDataManager from './modules/page-data-manager.js';
import * as EventHandler from './modules/event-handler.js';
import { ModelSelector } from './modules/model-selector.js';
import { confirmationOverlay } from './components/confirmation-overlay.js';
import { confirmationDialog } from '../js/modules/ui/confirmation-dialog.js';

// Create logger
const logger = createLogger('Sidebar');

// Global variables
let modelSelector = null;
let currentRequestTabId = null; // Track current request
let currentStreamId = null; // Track current stream

// Global utility functions for other modules
window.StateManager = StateManager;
window.MessageHandler = MessageHandler;
window.ChatHistory = ChatHistory;
window.ImageHandler = ImageHandler;
window.ChatManager = ChatManager;
window.TabManager = TabManager;

// Initialize when DOM elements are loaded
document.addEventListener('DOMContentLoaded', async () => {
  logger.info('Side panel loaded');
  
  // Initialize i18n system first
  await i18n.init();

  // Initialize UI element references
  const elements = UIManager.initElements();
  
  // Apply configured panel size
  const config = await StateManager.getConfig();
  ResizeHandler.applyPanelSize(config);
  
  // Reset content section height to configured default
  await ResizeHandler.resetContentSectionHeight(elements.contentSection, config);
  
  // Initialize confirmation overlay
  confirmationOverlay.init();

  // Initialize confirmation dialog
  confirmationDialog.init();

  // Page data loading will be triggered by handleSidebarOpened message from background
  // This ensures proper blacklist checking before loading content

  // Set callback to trigger auto inputs after page data is loaded
  PageDataManager.setOnPageDataLoadedCallback(triggerAutoInputs);

  // Initialize model selector
  modelSelector = new ModelSelector();
  
  // Load tabs with handler
  await TabManager.loadTabs(
    elements.tabContainer,
    elements.chatContainer,
    (displayText, sendTextTemplate, tabId, isAutoSend, forceIncludePageContent) => handleTabAction(displayText, sendTextTemplate, tabId, isAutoSend, forceIncludePageContent)
  );
  
  // Set up event listeners
  EventHandler.setupEventListeners(
    elements,
    modelSelector,
    (displayText, sendTextTemplate) => handleTabAction(displayText, sendTextTemplate, TabManager.getActiveTabId(), true, null)
  );
  
  // Set up message listeners
  setupMessageListeners();
  
  // Set up message buttons scroll effect
  EventHandler.setupMessageButtonsScroll(elements.chatContainer);
  
  // Set initial button state
  elements.includePageContentBtn.setAttribute('data-enabled', StateManager.getStateItem('includePageContent') ? 'true' : 'false');
  
  // Initialize icon layout
  UIManager.updateIconsLayout(elements.userInput.offsetHeight);
  
  // Add default layout class
  elements.buttonGroup.classList.add('layout-row');
  
  // Apply theme
  await applyTheme(config);

  // Auto-trigger will be handled after page data is loaded via callback

  logger.info('Sidebar initialization completed');
});

/**
 * Handle tab action (switch or quick input)
 * @param {string} displayText - Display text
 * @param {string} sendTextTemplate - Send text template
 * @param {string} tabId - Tab ID
 * @param {boolean} isAutoSend - Whether this is an auto-send action
 * @param {boolean} forceIncludePageContent - Force include page content for first-time quick input
 */
const handleTabAction = async (displayText, sendTextTemplate, tabId, isAutoSend, forceIncludePageContent = null) => {
  const elements = UIManager.getAllElements();
  
  // If this is just a tab switch without auto-send, don't send message
  if (!isAutoSend || !sendTextTemplate) {
    return;
  }
  
  // For first-time quick input, temporarily override include page content setting
  let originalIncludePageContent = null;
  if (forceIncludePageContent !== null) {
    originalIncludePageContent = StateManager.getStateItem('includePageContent');
    StateManager.updateStateItem('includePageContent', forceIncludePageContent);
  }
  
  try {
    // Handle quick input auto-send
    await ChatManager.handleQuickInputClick(
      displayText,
      sendTextTemplate,
      elements.chatContainer,
      elements.sendBtn,
      modelSelector,
      async () => {
        // Save chat history for current tab
        const chatHistory = ChatHistory.getChatHistoryFromDOM(elements.chatContainer);
        await TabManager.saveCurrentTabChatHistory(chatHistory);
        
        // 不在此处设置 has-content，交由读取/分支完成后统一计算
        // 但确保 loading 状态在 UI 上被正确设置
        if (isAutoSend && tabId) {
          await TabManager.updateTabLoadingState(tabId, true);
          logger.info(`Set loading state for tab ${tabId} after auto-send initiated`);
        }
      }
    );
  } finally {
    // Restore original include page content setting if it was overridden
    if (originalIncludePageContent !== null) {
      StateManager.updateStateItem('includePageContent', originalIncludePageContent);
    }
  }
};

/**
 * Set message listeners
 */
function setupMessageListeners() {
  MessageHandler.setupMessageListeners({
    onStreamChunk: (chunk, tabId, url, branchId) => {
      // Only process stream chunks for the current active tab and URL
      const currentUrl = StateManager.getStateItem('currentUrl');
      const activeTabId = TabManager.getActiveTabId();
      
      if (url === currentUrl && tabId === activeTabId) {
        // Update stream monitor if we have an active stream
        if (currentStreamId && typeof streamMonitor !== 'undefined') {
          streamMonitor.updateStream(currentStreamId, chunk);
        }
        
        ChatManager.handleStreamChunk(UIManager.getElement('chatContainer'), chunk, tabId, url, branchId);
        logger.debug(`Stream chunk processed for tab ${tabId}${branchId ? ` branch ${branchId}` : ''}`);
      } else {
        logger.debug(`Stream chunk ignored - URL mismatch (${url} vs ${currentUrl}) or tab mismatch (${tabId} vs ${activeTabId})`);
      }
    },
    
    onStreamEnd: (fullResponse, finishReason, isAbnormalFinish, tabId, url, branchId) => {
      const currentUrl = StateManager.getStateItem('currentUrl');
      const activeTabId = TabManager.getActiveTabId();
      
      // Always update tab loading state regardless of which tab is currently active
      if (url === currentUrl) {
        // Update tab loading state to not loading
        (async () => {
          try {
            if (window.TabManager && window.TabManager.registerBranchDone) {
              await window.TabManager.registerBranchDone(tabId, branchId || null);
            } else if (window.TabManager && window.TabManager.updateTabLoadingState) {
              await window.TabManager.updateTabLoadingState(tabId, false);
            }
          } catch (e) {
            logger.warn('Error updating tab state after stream end:', e);
          }
        })();
      }
      
      // Only process stream content for the current active tab and URL
      if (url === currentUrl && tabId === activeTabId) {
        // Mark stream as completed in monitor
        if (currentStreamId && typeof streamMonitor !== 'undefined') {
          streamMonitor.completeStream(currentStreamId, fullResponse);
          currentStreamId = null; // Clear current stream
        }
        
        ChatManager.handleStreamEnd(
          UIManager.getElement('chatContainer'),
          fullResponse,
          async (response) => {
            // Get updated dialog history from DOM
            const chatHistory = ChatHistory.getChatHistoryFromDOM(UIManager.getElement('chatContainer'));
            
            // Save updated chat history for current tab
            await TabManager.saveCurrentTabChatHistory(chatHistory);
            
            // Re-enable send button
            UIManager.getElement('sendBtn').disabled = false;
          },
          finishReason,
          isAbnormalFinish,
          tabId,
          url,
          branchId
        );
        // After stream ends and UI/DOM updated, re-read current tab data from storage to ensure consistency
        (async () => {
          try {
            if (window.TabManager && window.TabManager.loadTabChatHistory) {
              await window.TabManager.loadTabChatHistory(tabId);
            }
          } catch (e) {
            logger.warn('Failed to refresh tab chat history after stream end:', e);
          }
        })();
        
        logger.info(`Stream ended for tab ${tabId}`);
      } else {
        logger.debug(`Stream content processing ignored - URL mismatch (${url} vs ${currentUrl}) or tab mismatch (${tabId} vs ${activeTabId}), but loading state updated`);
      }
    },
    
    onLlmError: (message) => {
      const error = message.error || 'Unknown error';
      const errorDetails = message.errorDetails || null;
      const tabId = message.tabId;
      const url = message.url;
      
      const currentUrl = StateManager.getStateItem('currentUrl');
      const activeTabId = TabManager.getActiveTabId();
      
      // Check if this is a user cancellation - log as info instead of error
      const isUserCancellation = error && (
        error.includes('Request was cancelled by user') ||
        (typeof error === 'object' && error.message === 'Request was cancelled by user')
      );

      const logLevel = isUserCancellation ? 'info' : 'error';
      logger[logLevel]('[Message] Received LLM_ERROR', {
        error: error,
        errorType: typeof error,
        errorLength: error?.length || 0,
        hasCurrentStream: !!currentStreamId,
        hasErrorDetails: !!errorDetails,
        errorStatus: errorDetails?.status,
        rawResponseLength: errorDetails?.rawResponse?.length || 0,
        tabId: tabId,
        activeTabId: activeTabId,
        urlMatch: url === currentUrl
      });

      // Log raw error for debugging
      console.log('[Sidebar] Raw error received:', error);
      console.log('[Sidebar] Raw errorDetails received:', errorDetails);
      
      // Always update tab loading state regardless of which tab is currently active
      if (url === currentUrl) {
        // Update tab loading state to not loading
        (async () => {
          try {
            if (window.TabManager && window.TabManager.registerBranchError) {
              await window.TabManager.registerBranchError(tabId, message.branchId || null);
            } else if (window.TabManager && window.TabManager.updateTabLoadingState) {
              await window.TabManager.updateTabLoadingState(tabId, false);
            }
          } catch (e) {
            logger.warn('Error updating tab state after error:', e);
          }
        })();
      }
      
      // Only process error content for the current active tab and URL  
      if (url === currentUrl && tabId === activeTabId) {
        // Mark stream as failed in monitor
        if (currentStreamId && typeof streamMonitor !== 'undefined') {
          const errorObj = new Error(error);
          streamMonitor.failStream(currentStreamId, errorObj);
          currentStreamId = null; // Clear current stream
        }
        
        // Use the error message directly, no JSON parsing
        let processedError = error;
        
        // Ensure we always have a meaningful error message
        if (!processedError || processedError.trim() === '' || processedError === '{}' || processedError === 'null' || processedError === 'undefined') {
          processedError = 'LLM service error - no detailed information available';
        }
        
        console.log('[Sidebar] Processing error message:', processedError);
        console.log('[Sidebar] Error message length:', processedError.length);
        console.log('[Sidebar] Error message first 200 chars:', processedError.substring(0, 200));
        
        // Always handle error - let ChatManager.handleLlmError decide on duplicates
        // This ensures send button is always re-enabled
        ChatManager.handleLlmError(
          UIManager.getElement('chatContainer'),
          processedError,
          null,
          () => {
            // Re-enable send button
            UIManager.getElement('sendBtn').disabled = false;
          },
          errorDetails,
          tabId,
          url
        );
        
        logger.info(`LLM error processed for tab ${tabId}`);
      } else {
        // For other tabs, just log and update loading state
        logger.info(`LLM error received for non-active tab ${tabId}, current active: ${activeTabId}`);
      }
    },
    
    onLoadingStateUpdate: (message) => {
      // Handle stream-related loading state updates
      if (message.status === 'error' && currentStreamId && typeof streamMonitor !== 'undefined') {
        const errorObj = new Error(message.error || 'Loading state error');
        streamMonitor.failStream(currentStreamId, errorObj);
        currentStreamId = null;
      } else if (message.status === 'completed' && currentStreamId && typeof streamMonitor !== 'undefined') {
        streamMonitor.completeStream(currentStreamId, message.result);
        currentStreamId = null;
      }
      
      handleLoadingStateUpdate(message);
    },
    
    onTabChanged: PageDataManager.handleTabChanged,
    
    onAutoLoadContent: PageDataManager.handleAutoLoadContent,
    
    onAutoExtractContent: PageDataManager.handleAutoExtractContent,

    onTabUpdated: PageDataManager.handleTabUpdated,

    onBlacklistDetected: handleBlacklistDetected,

    onSidebarOpened: handleSidebarOpened
  });
  
  // Send a ping to the service worker to confirm the sidebar is ready
  setTimeout(() => {
    try {
      chrome.runtime.sendMessage({ type: 'SIDEBAR_READY' }, (response) => {
        if (chrome.runtime.lastError) {
          logger.debug('Sidebar ready ping failed:', chrome.runtime.lastError.message);
        } else {
          logger.info('Sidebar ready ping sent successfully');
        }
      });
    } catch (error) {
      logger.debug('Error sending sidebar ready ping:', error);
    }
  }, 200);
}

/**
 * Handle loading state updates from background script
 * @param {Object} message - Loading state update message
 */
function handleLoadingStateUpdate(message) {
  try {
    const { url, tabId, status, result, error, finishReason } = message;
    const currentUrl = StateManager.getStateItem('currentUrl');
    const activeTabId = TabManager.getActiveTabId();
    
    // Always update tab loading state regardless of which tab is currently active
    if (url === currentUrl) {
      // Update tab loading state for completed, error, or cancelled status
      if (status === 'completed' || status === 'error' || status === 'cancelled') {
        if (window.TabManager && window.TabManager.updateTabLoadingState) {
          window.TabManager.updateTabLoadingState(tabId, false).catch(error => 
            logger.warn('Error updating tab loading state after loading state update:', error)
          );
        }
      }
    }
    
    // Only process content updates for current page and active tab
    if (url === currentUrl && tabId === activeTabId) {
      const chatContainer = UIManager.getElement('chatContainer');
      
      if (status === 'completed' && result) {
        // Handle completed LLM response
        
        // Check if finishReason indicates abnormal termination
        const isAbnormalFinish = finishReason && 
            finishReason !== 'stop' && 
            finishReason !== 'STOP' && 
            finishReason !== 'end_turn';
        
        ChatManager.handleStreamEnd(
          chatContainer,
          result,
          async (response) => {
            // Get updated dialog history from DOM
            const chatHistory = ChatHistory.getChatHistoryFromDOM(chatContainer);
            
                      // Save updated chat history for current tab
          await TabManager.saveCurrentTabChatHistory(chatHistory);
            
            // Re-enable send button
            UIManager.getElement('sendBtn').disabled = false;
          },
          finishReason,
          isAbnormalFinish
        );
      } else if (status === 'error' && error) {
        // Handle error response
        
        // Always handle error - let ChatManager.handleLlmError decide on duplicates
        // This ensures send button is always re-enabled
        ChatManager.handleLlmError(
          chatContainer,
          error,
          null,
          () => {
            // Re-enable send button
            UIManager.getElement('sendBtn').disabled = false;
          },
          message.errorDetails
        );
      } else if (status === 'cancelled') {
        // Handle cancelled response
        
        // Find the streaming message and update it
        const streamingMessage = chatContainer.querySelector('[data-streaming="true"]');
        if (streamingMessage) {
          const contentDiv = streamingMessage.querySelector('.message-content');
          if (contentDiv) {
            contentDiv.innerHTML = `<span style="color: var(--text-color); font-style: italic;">${i18n.getMessage('common_response_stopped_by_user')}</span>`;
          }
          streamingMessage.removeAttribute('data-streaming');
        }
        
        // Re-enable send button
        UIManager.getElement('sendBtn').disabled = false;
      }
    } else {
      logger.debug(`Loading state content processing ignored - URL mismatch (${url} vs ${currentUrl}) or tab mismatch (${tabId} vs ${activeTabId}), but tab loading state updated`);

      // For non-active tabs on current page, mark branch completion/error without GETs
      if (url === currentUrl && tabId !== activeTabId && (status === 'completed' || status === 'error')) {
        (async () => {
          try {
            if (window.TabManager) {
              if (status === 'completed' && window.TabManager.registerBranchDone) {
                await window.TabManager.registerBranchDone(tabId, message.branchId || null);
              } else if (status === 'error' && window.TabManager.registerBranchError) {
                await window.TabManager.registerBranchError(tabId, message.branchId || null);
              }
            }
          } catch (calcErr) {
            logger.warn('Failed to update non-active tab state:', calcErr);
          }
        })();
      }
    }
  } catch (error) {
    logger.error('Error handling loading state update:', error);
  }
}

/**
 * Start a new streaming session
 * @param {Object} requestInfo - Information about the request
 */
function startStreamingSession(requestInfo) {
  if (typeof streamMonitor === 'undefined') {
    logger.warn('[Stream] Stream monitor not available');
    return null;
  }
  
  // Generate unique stream ID using UUID with timestamp
  const timestamp = Date.now().toString(36);
  const uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
  currentStreamId = `stream_${timestamp}_${uuid}`;
  
  // Register stream with monitor
  streamMonitor.registerStream(currentStreamId, {
    tabId: requestInfo.tabId,
    url: requestInfo.url,
    model: requestInfo.model,
    messageCount: requestInfo.messageCount,
    hasImage: requestInfo.hasImage,
    onSilenceDetected: (streamId, silenceDuration) => {
      logger.warn('[Stream] Stream silence detected by monitor', {
        streamId,
        silenceDuration,
        tabId: requestInfo.tabId
      });
      
      // Could show a warning to user or attempt recovery
      showStreamWarning(i18n.getMessage('sidebar_js_streamSilent', { seconds: Math.round(silenceDuration / 1000) }));
    },
    onRecoveryAttempt: (streamId, attempt, originalError) => {
      // Could attempt to restart the request or show recovery UI
      showStreamRecovery(streamId, attempt);
    }
  });
  
  return currentStreamId;
}

/**
 * Show stream warning to user
 * @param {string} message - Warning message
 */
function showStreamWarning(message) {
  // Could implement user notification here
  logger.warn('[Stream] Stream warning:', message);
  
  // For now, just log the warning
  // In the future, could show a toast notification or status indicator
}

/**
 * Show stream recovery UI
 * @param {string} streamId - Stream ID
 * @param {number} attempt - Recovery attempt number
 */
function showStreamRecovery(streamId, attempt) {
  // Could implement recovery UI here
  // For now, just log the recovery attempt
}

/**
 * Get current stream statistics
 * @returns {Object|null} Stream statistics or null
 */
function getCurrentStreamStats() {
  if (!currentStreamId || typeof streamMonitor === 'undefined') {
    return null;
  }
  
  return streamMonitor.getStreamStats(currentStreamId);
}

/**
 * Trigger auto-send for quick inputs with auto-trigger enabled
 */
async function triggerAutoInputs() {
  try {
    logger.info('Checking for auto-trigger quick inputs');

    // Get current configuration
    const config = await StateManager.getConfig();
    if (!config || !config.quickInputs || config.quickInputs.length === 0) {
      logger.info('No quick inputs configured, skipping auto-trigger');
      return;
    }

    // Filter quick inputs with auto-trigger enabled
    const autoTriggerInputs = config.quickInputs.filter(input => input.autoTrigger === true);

    if (autoTriggerInputs.length === 0) {
      logger.info('No quick inputs with auto-trigger enabled');
      return;
    }

    // Check if content extraction result is empty
    const currentState = StateManager.getState();
    const hasExtractedContent = currentState.extractedContent && currentState.extractedContent.trim().length > 0;

    if (!hasExtractedContent) {
      logger.info('Content extraction result is empty, skipping auto-trigger to prevent sending empty messages');
      return;
    }

    logger.info(`Found ${autoTriggerInputs.length} quick inputs with auto-trigger enabled and content is available`);

    let lastTriggeredTabId = null;

    // Trigger each auto-trigger quick input in sequence with delay
    for (let i = 0; i < autoTriggerInputs.length; i++) {
      const input = autoTriggerInputs[i];
      const tabId = input.id;

      logger.info(`Processing auto-trigger for quick input: ${input.displayText} (ID: ${tabId})`);

      try {
        // Switch to tab and check if we should send the action
        const { shouldSend } = await TabManager.switchToTabAndCheckAction(tabId, { silent: true });

        if (shouldSend) {
          // Directly call the action handler
          logger.info(`Proceeding with auto-send for tab ${tabId}`);
          const forceIncludePageContent = true;
          await handleTabAction(input.displayText, input.sendText, tabId, true, forceIncludePageContent);
          lastTriggeredTabId = tabId;
          
          // 标记 tab 为已初始化，只有在实际发送消息后才设置
          await TabManager.markTabAsInitialized(tabId);
          logger.info(`Marked tab ${tabId} as initialized after auto-send`);
        }
      } catch (error) {
        logger.error(`Error auto-triggering quick input ${input.displayText}:`, error);
      }
    }

    // After all auto-triggers are processed, switch to the chat tab
    await TabManager.setActiveTab('chat');
    logger.info('Switched to chat tab after auto-trigger sequence');

    // After all silent updates, render the final UI state once
    await TabManager.renderCurrentTabsState();
    
    // 确保 loading 状态正确更新
    if (lastTriggeredTabId) {
      await TabManager.updateTabsLoadingStates();
      logger.info(`Updated loading states for all tabs after auto-trigger, last triggered: ${lastTriggeredTabId}`);
    }

    logger.info('Auto-trigger sequence completed');
  } catch (error) {
    logger.error('Error in triggerAutoInputs:', error);
  }
}

/**
 * Apply theme based on configuration
 * @param {Object} config - The application configuration
 */
async function applyTheme(config) {
  // Support both old and new config formats
  const basicConfig = config.basic || config;
  const theme = basicConfig.theme || 'system';
  const body = document.body;

  // Remove existing theme classes
  body.classList.remove('dark-theme');

  if (theme === 'dark') {
    body.classList.add('dark-theme');
  } else if (theme === 'light') {
    // Light theme is default, no class needed
  } else {
    // System theme - check user's system preference
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (prefersDark) {
      body.classList.add('dark-theme');
    }
  }

  logger.info(`Applied theme: ${theme}`);
}

/**
 * Handle sidebar opened message from background script
 * @param {Object} message - Sidebar opened message
 */
async function handleSidebarOpened(message) {
  try {
    const { url, tabId } = message;
    logger.info('Received SIDEBAR_OPENED message for URL:', url);

    // Reset config cache to get latest settings
    StateManager.resetConfig();

    // Use the centralized blacklist checking function
    await PageDataManager.checkBlacklistAndLoadData(url);
  } catch (error) {
    logger.error('Error handling sidebar opened:', error);
    // If there's an error, continue with normal flow
    PageDataManager.loadCurrentPageData();
  }
}

/**
 * Handle blacklist detection message from background script
 * @param {Object} message - Blacklist detection message
 */
function handleBlacklistDetected(message) {
  try {
    const { url, matchedPattern } = message;
    logger.info('Blacklist detected for URL:', url);

    // Show confirmation overlay
    confirmationOverlay.show({
      message: i18n.getMessage('sidebar_js_blacklistConfirm'),
      matchedPattern: matchedPattern,
      onConfirm: () => {
        logger.info('User confirmed to continue on blacklisted page');
        // Continue with normal page data loading
        PageDataManager.loadCurrentPageData();
      },
      onCancel: () => {
        logger.info('User cancelled on blacklisted page');
        // Close the sidebar
        window.close();
      }
    });
  } catch (error) {
    logger.error('Error handling blacklist detection:', error);
    // If there's an error, continue with normal flow
    PageDataManager.loadCurrentPageData();
  }
}