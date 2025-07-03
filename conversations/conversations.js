// Global Error Catcher
window.addEventListener('error', function(event) {
  const errorInfo = {
    message: event.message,
    source: event.filename,
    lineno: event.lineno,
    colno: event.colno,
    error: event.error ? event.error.stack : 'No stack available',
    timestamp: new Date().toISOString(),
    page: 'conversations'
  };
  chrome.storage.local.set({ 'last_error': errorInfo });
});

/**
 * conversations.js - Main entry point for Think Bot conversations page
 * Manages page list and chat functionality for cached pages
 */

// Import all modules (reusing sidebar modules)
import { i18n } from '../js/modules/i18n.js';
import { createLogger, isRestrictedPage } from '../sidebar/modules/utils.js';
import * as StateManager from '../sidebar/modules/state-manager.js';
import * as UIManager from '../sidebar/modules/ui-manager.js';
import * as MessageHandler from '../sidebar/modules/message-handler.js';
import * as ChatManager from '../sidebar/modules/chat-manager.js';
import * as ResizeHandler from '../sidebar/modules/resize-handler.js';
import * as ImageHandler from '../sidebar/modules/image-handler.js';
import * as TabManager from '../sidebar/components/tab-manager.js';
import * as ChatHistory from '../sidebar/modules/chat-history.js';
import * as EventHandler from '../sidebar/modules/event-handler.js';
import { ModelSelector } from '../sidebar/modules/model-selector.js';

// Import conversations-specific modules
import { PageListManager } from './modules/page-list-manager.js';
import { ConfirmationDialog } from './modules/confirmation-dialog.js';
import { createConversationsExportHandler } from '../sidebar/modules/export-utils.js';

// Create logger
const logger = createLogger('Conversations');

// Global variables
let modelSelector = null;
let pageListManager = null;
let confirmationDialog = null;
let currentRequestTabId = null;
let currentStreamId = null;
let currentUrl = null; // Track currently selected page URL

// Global utility functions for other modules
window.StateManager = StateManager;
window.MessageHandler = MessageHandler;
window.ChatHistory = ChatHistory;
window.ImageHandler = ImageHandler;
window.ChatManager = ChatManager;
window.TabManager = TabManager;

// Initialize when DOM elements are loaded
document.addEventListener('DOMContentLoaded', async () => {
  logger.info('Conversations page loaded');
  
  // Initialize i18n system
  await i18n.init();

  try {
    // Initialize UI element references
    const elements = initConversationsElements();
    
    // Initialize horizontal resizer for page list
    initHorizontalResize(document.getElementById('dragHandle'), document.getElementById('pageListSection'));
    
    // Apply configured panel size
    const config = await StateManager.getConfig();
    ResizeHandler.applyPanelSize(config);
    
    // Reset content section height to configured default
    await ResizeHandler.resetContentSectionHeight(elements.contentSection, config);
    
    // Initialize content resize handler
    ResizeHandler.initContentResize(
      elements.contentSection,
      elements.resizeHandle,
      (height) => ResizeHandler.saveContentSectionHeight(height)
    );
    
    // Initialize input resize handler
    ResizeHandler.initInputResize(
      elements.userInput,
      elements.inputResizeHandle,
      (height) => updateConversationsIconsLayout(height, elements.buttonGroup)
    );
    
    // Initialize model selector
    modelSelector = new ModelSelector();
    
    // Initialize confirmation dialog
    confirmationDialog = new ConfirmationDialog(
      'confirmationDialog', 'confirmBtn', 'cancelBtn', 
      'confirmationDialogTitle', 'confirmationDialogMessage', 'confirmationDialogDetails'
    );
    
    // Initialize page list manager
    pageListManager = new PageListManager(confirmationDialog);
    await pageListManager.init(elements.pageListContainer, elements.pageSearchInput, {
      onPageSelect: loadPageConversation,
      onPageDelete: handlePageDelete
    });
    
    // Load tabs with handler (reusing from sidebar)
    await TabManager.loadTabs(
      elements.tabContainer,
      elements.chatContainer,
      (displayText, sendTextTemplate, tabId, isAutoSend, forceIncludePageContent) => 
        handleTabAction(displayText, sendTextTemplate, tabId, isAutoSend, forceIncludePageContent)
    );
    
    // Set up event listeners (reusing from sidebar but adapted)
    setupConversationsEventListeners(
      elements,
      modelSelector,
      (displayText, sendTextTemplate) => 
        handleTabAction(displayText, sendTextTemplate, TabManager.getActiveTabId(), true, null)
    );
    
    // Set up message listeners
    setupMessageListeners();
    
    // Set up message buttons scroll effect
    EventHandler.setupMessageButtonsScroll(elements.chatContainer);
    
    // Set initial button state
    if (elements.includePageContentBtn) {
      elements.includePageContentBtn.setAttribute('data-enabled', StateManager.getStateItem('includePageContent') ? 'true' : 'false');
    }
    
    // Initialize icon layout
    try {
      if (elements.userInput && elements.buttonGroup) {
        // Use conversations-specific icon layout function instead of UIManager
        updateConversationsIconsLayout(elements.userInput.offsetHeight, elements.buttonGroup);
      }
    } catch (error) {
      logger.warn('Error initializing icon layout:', error);
    }
    
    // Add default layout class
    if (elements.buttonGroup) {
      elements.buttonGroup.classList.add('layout-row');
    }
    
    // Apply theme
    await applyTheme(config);

    // Check for URL parameters to auto-select a page
    await handleUrlParameters();

    logger.info('Conversations page initialization completed');
  } catch (error) {
    logger.error('Error initializing conversations page:', error);
  }
});

/**
 * Initialize conversations-specific UI elements
 * @returns {Object} Element references
 */
function initConversationsElements() {
  logger.info('Initializing conversations UI elements');
  
  // Define required elements for basic functionality
  const requiredElements = [
    'pageListSection', 'pageListContainer', 'welcomeScreen', 'mainContentArea', 'contentSection',
    'extractedContent', 'loadingIndicator', 'contentError', 'tabContainer',
    'chatContainer', 'userInput', 'sendBtn'
  ];
  
  // Get elements specific to conversations page
  const conversationsElements = {
    // Page list elements
    pageListSection: document.getElementById('pageListSection'),
    pageListContainer: document.getElementById('pageListContainer'),
    pageSearchInput: document.getElementById('pageSearchInput'),
    pageListEmpty: document.getElementById('pageListEmpty'),
    welcomeScreen: document.getElementById('welcomeScreen'),
    mainContentArea: document.getElementById('mainContentArea'),
    
    // Page info header
    pageInfoHeader: document.getElementById('pageInfoHeader'),
    pageTitle: document.getElementById('pageTitle'),
    pageUrl: document.getElementById('pageUrl'),
    
    // Content and chat elements (similar to sidebar)
    contentSection: document.getElementById('contentSection'),
    extractedContent: document.getElementById('extractedContent'),
    loadingIndicator: document.getElementById('loadingIndicator'),
    contentError: document.getElementById('contentError'),
    resizeHandle: document.getElementById('resizeHandle'),
    
    tabContainer: document.getElementById('tabContainer'),
    
    chatContainer: document.getElementById('chatContainer'),
    imagePreviewContainer: document.getElementById('imagePreviewContainer'),
    imagePreview: document.getElementById('imagePreview'),
    removeImageBtn: document.getElementById('removeImageBtn'),
    
    inputResizeHandle: document.getElementById('inputResizeHandle'),
    userInput: document.getElementById('userInput'),
    modelSelector: document.getElementById('modelSelector'),
    buttonGroup: document.getElementById('inputActions'),
    sendBtn: document.getElementById('sendBtn'),
    includePageContentBtn: document.getElementById('includePageContentBtn'),
    clearBtn: document.getElementById('clearBtn'),
    exportBtn: document.getElementById('exportBtn')
  };
  
  // Check for missing required elements
  const missingElements = [];
  const missingOptionalElements = [];
  
  Object.keys(conversationsElements).forEach(key => {
    if (!conversationsElements[key]) {
      if (requiredElements.includes(key)) {
        missingElements.push(key);
      } else {
        missingOptionalElements.push(key);
      }
    }
  });
  
  // Log missing elements with more details
  if (missingElements.length > 0) {
    logger.error('Missing required DOM elements:', missingElements);
  }
  if (missingOptionalElements.length > 0) {
    // Don't log missing optional elements as warnings if they're actually present in HTML
    // This prevents spurious warnings due to timing issues
    const actuallyMissingElements = missingOptionalElements.filter(elementId => {
      // For image-related elements, check if they're actually in the DOM
      if (['imagePreviewContainer', 'imagePreview', 'removeImageBtn'].includes(elementId)) {
        const element = document.querySelector(`#${elementId}`);
        return !element; // Only consider it missing if it's actually not in the DOM
      }
      return true; // For other elements, keep original behavior
    });
    
    if (actuallyMissingElements.length > 0) {
      logger.warn('Missing optional DOM elements:', actuallyMissingElements);
    }
  }
  
  // Log successful initialization
  const foundElements = Object.keys(conversationsElements).filter(key => conversationsElements[key]);
  logger.info(`Successfully found ${foundElements.length} DOM elements:`, foundElements);
  
  // Store elements globally (similar to UIManager pattern)
  window.conversationsElements = conversationsElements;
  
  return conversationsElements;
}

/**
 * Initializes horizontal resizing for the page list panel.
 * @param {HTMLElement} resizer - The resizer handle element.
 * @param {HTMLElement} leftPanel - The panel to be resized.
 */
function initHorizontalResize(resizer, leftPanel) {
  if (!resizer || !leftPanel) {
    logger.warn('Horizontal resize elements not found, skipping initialization.');
    return;
  }

  logger.info('Initializing horizontal resize handler.');

  const handleMouseDown = (e) => {
    e.preventDefault();
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const startX = e.clientX;
    const startWidth = leftPanel.offsetWidth;

    const handleMouseMove = (e) => {
      const newWidth = startWidth + e.clientX - startX;
      leftPanel.style.flexBasis = `${newWidth}px`;
    };

    const handleMouseUp = () => {
      document.body.style.cursor = 'default';
      document.body.style.userSelect = 'auto';

      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  resizer.addEventListener('mousedown', handleMouseDown);
}

/**
 * Set up event listeners specific to conversations page
 */
function setupConversationsEventListeners(elements, modelSelector, onQuickInputAction) {
  // Don't use EventHandler.setupEventListeners as it expects sidebar-specific elements
  // Instead, directly set up the event listeners we need for conversations page
  logger.info('Setting up conversations-specific event listeners directly');
  
  // Set up essential event listeners directly
  setupEssentialEventListeners(elements, modelSelector);
  
  // Initialize image processing with enhanced error handling
  if (elements.userInput && elements.imagePreviewContainer && elements.imagePreview && elements.removeImageBtn) {
    if (!ImageHandler.initImageHandler(elements)) {
      logger.warn('Image handler initialization failed in conversations page');
    }
  } else {
    logger.info('Image handler elements not all available, skipping image handler initialization');
  }
  
  // Add conversations-specific event listeners
  
  // Search input for page list
  if (elements.pageSearchInput) {
    elements.pageSearchInput.addEventListener('input', (e) => {
      if (pageListManager) {
        pageListManager.filterPages(e.target.value);
      }
    });
  }
  
  logger.info('Conversations event listeners set up');
}

/**
 * Setup essential event listeners as fallback
 */
function setupEssentialEventListeners(elements, modelSelector) {
  logger.info('Setting up essential event listeners for conversations page');
  
  // Send button
  if (elements.sendBtn) {
    elements.sendBtn.addEventListener('click', () => {
      try {
        const userText = elements.userInput ? elements.userInput.value.replace(/^[ \t]+|[ \t]+$/g, '') : '';
        const imageBase64 = (ImageHandler && ImageHandler.getCurrentImage) ? ImageHandler.getCurrentImage() : null;
        
        const currentTabId = TabManager.getActiveTabId();
        const streamId = `${currentUrl}#${currentTabId}`;

        if (ChatManager && ChatManager.sendUserMessage) {
          ChatManager.sendUserMessage(
            userText,
            imageBase64,
            elements.chatContainer,
            elements.userInput,
            elements.sendBtn,
            modelSelector,
            async () => {
              // Save chat history for current page
              const chatHistory = ChatHistory.getChatHistoryFromDOM(elements.chatContainer);
              await saveChatHistoryForCurrentPage(chatHistory);
            },
            streamId
          );
        } else {
          logger.error('ChatManager.sendUserMessage not available');
        }
      } catch (error) {
        logger.error('Error in send button click handler:', error);
      }
    });
  }
  
  // User input keypress (Enter to send)
  if (elements.userInput) {
    elements.userInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
        e.preventDefault();
        if (elements.sendBtn) {
          elements.sendBtn.click();
        }
      }
    });
    
    // Auto-resize textarea
    elements.userInput.addEventListener('input', () => {
      try {
        if (UIManager && UIManager.autoResizeTextarea) {
          UIManager.autoResizeTextarea(elements.userInput);
        }
        // Basic auto-resize fallback
        elements.userInput.style.height = 'auto';
        elements.userInput.style.height = Math.min(elements.userInput.scrollHeight, 200) + 'px';
        
        // Update icon layout if buttonGroup exists
        if (elements.buttonGroup) {
          updateConversationsIconsLayout(elements.userInput.offsetHeight, elements.buttonGroup);
        }
      } catch (error) {
        logger.warn('Error in textarea auto-resize:', error);
      }
    });
  }
  
  // Include page content toggle button
  if (elements.includePageContentBtn) {
    elements.includePageContentBtn.addEventListener('click', () => {
      try {
        const currentState = StateManager.getStateItem('includePageContent');
        const newState = !currentState;
        StateManager.updateStateItem('includePageContent', newState);
        elements.includePageContentBtn.setAttribute('data-enabled', newState ? 'true' : 'false');
        
        // Update UI if available - no need to call UIManager since we already set the attribute above
      } catch (error) {
        logger.error('Error toggling include page content:', error);
      }
    });
  }
  
  // Export conversation button - using common export handler with dynamic currentUrl
  if (elements.exportBtn) {
    elements.exportBtn.addEventListener('click', () => {
      const handler = createConversationsExportHandler(elements.chatContainer, currentUrl);
      handler();
    });
  }
  
  // Clear conversation button
  if (elements.clearBtn) {
    elements.clearBtn.addEventListener('click', async () => {
      try {
        // Get current tab ID for proper state reset
        const currentTabId = TabManager.getActiveTabId();

        // First cancel the current request if any
        const success = await ChatManager.cancelLlmRequest(currentTabId);

        if (success) {
          logger.info('LLM request cancelled, now clearing conversation');
        } else {
          logger.warn('Failed to cancel LLM request or no active request, proceeding with clearing conversation');
        }

        if (elements.chatContainer) {
          elements.chatContainer.innerHTML = '';
        }

        // Clear chat history from storage - need to clear both the base URL and tab-specific URL
        if (currentUrl) {
          // Clear the base URL chat history
          await chrome.runtime.sendMessage({
            type: 'CLEAR_URL_DATA',
            url: currentUrl,
            clearContent: false,
            clearChat: true
          });

          // Clear the tab-specific chat history (format: url#tabId)
          const tabSpecificUrl = `${currentUrl}#${currentTabId}`;
          await chrome.runtime.sendMessage({
            type: 'CLEAR_URL_DATA',
            url: tabSpecificUrl,
            clearContent: false,
            clearChat: true
          });

          logger.info('Conversation cleared successfully for both base URL and tab-specific URL');
        }

        // Reset tab initialization state to allow quick input tabs to trigger auto-send again
        if (TabManager && TabManager.resetTabInitializationState) {
          TabManager.resetTabInitializationState(currentTabId);
          logger.info(`Reset initialization state for current tab: ${currentTabId}`);
        }

        // Update tab content state to reflect that it no longer has content
        if (TabManager && TabManager.updateTabContentState) {
          await TabManager.updateTabContentState(currentTabId, false);
          logger.info(`Updated content state for tab ${currentTabId} to false`);
        }

        // Clear loading state cache for current tab
        try {
          if (currentUrl && currentTabId) {
            await chrome.runtime.sendMessage({
              type: 'CLEAR_LOADING_STATE',
              url: currentUrl,
              tabId: currentTabId
            });
            logger.info('Loading state cleared for current tab');
          }
        } catch (error) {
          logger.error('Error clearing loading state:', error);
        }

        // Force reset TabManager loading state for current tab
        try {
          if (TabManager && TabManager.updateTabLoadingState) {
            await TabManager.updateTabLoadingState(currentTabId, false);
            logger.info('TabManager loading state reset for current tab');
          }
        } catch (error) {
          logger.error('Error resetting TabManager loading state:', error);
        }

      } catch (error) {
        logger.error('Error clearing conversation:', error);
      }
    });
  }
  
  // Image removal button
  if (elements.removeImageBtn) {
    elements.removeImageBtn.addEventListener('click', () => {
      try {
        if (ImageHandler && ImageHandler.removeImage) {
          ImageHandler.removeImage(elements.imagePreviewContainer, elements.imagePreview);
        } else {
          // Basic fallback
          if (elements.imagePreviewContainer) {
            elements.imagePreviewContainer.classList.add('hidden');
          }
          if (elements.imagePreview) {
            elements.imagePreview.innerHTML = '';
          }
        }
      } catch (error) {
        logger.warn('Error removing image:', error);
      }
    });
  }
  
  // Set up resize and image handlers if available
  try {
    if (ResizeHandler && ResizeHandler.setupResizeHandlers && elements.resizeHandle && elements.contentSection) {
      ResizeHandler.setupResizeHandlers(elements.resizeHandle, elements.contentSection);
      logger.info('Resize handlers set up');
    }
    if (ResizeHandler && ResizeHandler.setupInputResizeHandler && elements.inputResizeHandle && elements.userInput) {
      ResizeHandler.setupInputResizeHandler(elements.inputResizeHandle, elements.userInput);
      logger.info('Input resize handler set up');
    }
    if (ImageHandler && ImageHandler.setupImageHandling && elements.chatContainer && elements.userInput) {
      ImageHandler.setupImageHandling(
        elements.chatContainer,
        elements.userInput,
        elements.imagePreviewContainer,
        elements.imagePreview,
        elements.removeImageBtn
      );
      logger.info('Image handling set up');
    }
  } catch (error) {
    logger.warn('Error setting up resize/image handlers:', error);
  }
  
  // Set up message buttons scroll effect if available
  try {
    if (EventHandler && EventHandler.setupMessageButtonsScroll && elements.chatContainer) {
      EventHandler.setupMessageButtonsScroll(elements.chatContainer);
      logger.info('Message buttons scroll effect set up');
    }
  } catch (error) {
    logger.warn('Error setting up message buttons scroll effect:', error);
  }
  
  logger.info('Essential event listeners set up successfully');
}

/**
 * Handle tab action (switch or quick input)
 */
const handleTabAction = async (displayText, sendTextTemplate, tabId, isAutoSend, forceIncludePageContent = null) => {
  const elements = window.conversationsElements;
  
  // If this is just a tab switch without auto-send, don't send message
  if (!isAutoSend || !sendTextTemplate) {
    // For tab switches, ensure we're on the correct URL context
    if (currentUrl) {
      logger.info(`Tab switch to ${tabId} for URL: ${currentUrl}`);
      
      // Update the URL context for the TabManager
      StateManager.updateStateItem('currentUrl', currentUrl);
      
      // Save any existing chat history before tab switch
      try {
        const existingChatHistory = ChatHistory.getChatHistoryFromDOM(elements.chatContainer);
        if (existingChatHistory && existingChatHistory.length > 0) {
          await saveChatHistoryForCurrentPage(existingChatHistory);
          logger.info('Saved existing chat history before tab switch');
        }
      } catch (saveError) {
        logger.warn('Error saving chat history before tab switch:', saveError);
      }
    }
    return;
  }
  
  // Ensure we have a current page selected
  if (!currentUrl) {
    logger.warn('No page selected for tab action');
    return;
  }
  
  // Verify we're still on the same URL to prevent cross-page contamination
  const stateUrl = StateManager.getStateItem('currentUrl');
  if (stateUrl !== currentUrl) {
    logger.warn('URL mismatch detected in tab action. Current:', currentUrl, 'State:', stateUrl);
    StateManager.updateStateItem('currentUrl', currentUrl);
  }
  
  // For first-time quick input, temporarily override include page content setting
  let originalIncludePageContent = null;
  if (forceIncludePageContent !== null) {
    originalIncludePageContent = StateManager.getStateItem('includePageContent');
    StateManager.updateStateItem('includePageContent', forceIncludePageContent);
  }
  
  try {
    // Update current URL in state
    StateManager.updateStateItem('currentUrl', currentUrl);
    
    const streamId = `${currentUrl}#${tabId}`;
    // Handle quick input auto-send
    await ChatManager.handleQuickInputClick(
      displayText,
      sendTextTemplate,
      elements.chatContainer,
      elements.sendBtn,
      modelSelector,
      async () => {
        // Save chat history for current page
        const chatHistory = ChatHistory.getChatHistoryFromDOM(elements.chatContainer);
        await saveChatHistoryForCurrentPage(chatHistory);
      },
      streamId
    );
  } finally {
    // Restore original include page content setting if it was overridden
    if (originalIncludePageContent !== null) {
      StateManager.updateStateItem('includePageContent', originalIncludePageContent);
    }
  }
};

/**
 * Load page conversation when a page is selected from the list
 * Reuses sidebar URL change handling logic for consistency
 */
async function loadPageConversation(url) {
  logger.info('Loading page conversation for URL:', url);
  
  const elements = window.conversationsElements;
  
  try {
    // Skip if already showing the same URL
    if (url === currentUrl) {
      logger.info('Page already loaded, skipping reload');
      return;
    }

    // Store previous URL before updating for loading state cleanup
    const previousUrl = currentUrl;

    // Update current URL (similar to sidebar URL change handling)
    currentUrl = url;
    StateManager.updateStateItem('currentUrl', url);
    
    // Hide welcome screen and show main content area first
    elements.welcomeScreen.classList.add('hidden');
    elements.mainContentArea.classList.remove('hidden');
    
    // Check if it's a restricted page (reusing sidebar logic)
    if (isRestrictedPage(url)) {
      elements.loadingIndicator.classList.add('hidden');
      elements.extractedContent.innerHTML = '';
      elements.contentError.classList.remove('hidden');
      elements.contentError.textContent = chrome.i18n.getMessage('conversations_js_cannot_extract');
      
      // Clear chat container for restricted pages
      elements.chatContainer.innerHTML = '';
      
      logger.info('Restricted page detected, skipping content extraction');
      return;
    }
    
    // Initialize page info header with current URL
    if (elements.pageInfoHeader && elements.pageTitle && elements.pageUrl) {
      // Show the page info header
      elements.pageInfoHeader.classList.remove('hidden');
      
      // Set URL as initial title and link
      elements.pageTitle.textContent = new URL(url).hostname || url;
      elements.pageUrl.textContent = url;
      elements.pageUrl.href = url;
    }
    
    // Show loading state
    showLoadingState();

    // Load all page info in a single request
    const pageInfo = await getPageInfo(url);

    // Handle page data loaded
    await handleConversationsPageDataLoaded(pageInfo);
    
    // Clear chat container first to prevent showing wrong conversations
    if (elements.chatContainer) {
      elements.chatContainer.innerHTML = '';
      logger.info('Chat container cleared before loading new page conversation');
    }

    // Reset TabManager loading states to prevent showing previous page's loading states
    // Note: We don't clear the actual loading state cache to preserve ongoing requests
    try {
      if (previousUrl && previousUrl !== url) {
        logger.info('Resetting TabManager loading states for page switch from:', previousUrl, 'to:', url);

        // Force reset all tab loading states in TabManager UI only
        // This prevents showing previous page's loading states without affecting actual ongoing requests
        if (TabManager && TabManager.resetTabsLoadingStates) {
          await TabManager.resetTabsLoadingStates();
          logger.info('TabManager loading states reset for page switch');
        }
      }
    } catch (error) {
      logger.warn('Error during loading state reset:', error);
    }

    // Reset TabManager to default state (chat tab) but don't load content yet
    try {
      if (TabManager && TabManager.resetToDefaultTab) {
        await TabManager.resetToDefaultTab();
        logger.info('TabManager reset to default tab');
      } else if (TabManager && TabManager.setActiveTab) {
        // Force switch to chat tab without loading content first
        await TabManager.setActiveTab('chat', false);
        logger.info('TabManager switched to chat tab (UI only)');
      }
    } catch (resetError) {
      logger.warn('Error resetting TabManager:', resetError);
    }

    // Load and display chat history - ALWAYS use chat tab for conversations page
    try {
      // Always load chat tab history for conversations page
      const chatTabId = 'chat';
      logger.info('Loading chat history for chat tab:', chatTabId);

      // First try to get chat history from TabManager
      let chatHistory = [];
      if (TabManager && TabManager.loadTabChatHistory) {
        chatHistory = await TabManager.loadTabChatHistory(chatTabId);
        logger.info('Chat tab history loaded from TabManager:', chatHistory?.length || 0, 'messages');
      }

      // If no chat history from TabManager, try page info
      if ((!chatHistory || chatHistory.length === 0) && pageInfo && pageInfo.chatHistory) {
        chatHistory = pageInfo.chatHistory;
        logger.info('Using fallback chat history from page data:', chatHistory.length, 'messages');
        // Display the fallback chat history
        ChatHistory.displayChatHistory(elements.chatContainer, chatHistory, ChatManager.appendMessageToUI);
      }

      // If still no chat history, try direct loading with tab-specific URL
      if (!chatHistory || chatHistory.length === 0) {
        logger.info('No chat history found, trying direct load with tab-specific URL');
        const tabSpecificUrl = `${url}#${chatTabId}`;
        chatHistory = await getChatHistory(tabSpecificUrl);
        logger.info('Direct load chat history:', chatHistory?.length || 0, 'messages');

        // Display the directly loaded chat history
        if (chatHistory && chatHistory.length > 0) {
          ChatHistory.displayChatHistory(elements.chatContainer, chatHistory, ChatManager.appendMessageToUI);
        }
      }

      // Final check and display
      if (chatHistory && chatHistory.length > 0) {
        logger.info('Displayed', chatHistory.length, 'chat messages for conversations page');
      } else {
        // Clear chat container
        elements.chatContainer.innerHTML = '';
        logger.info('No chat history to display for conversations page');
      }
    } catch (error) {
      logger.error('Error loading chat history:', error);
      // Clear chat container on error
      elements.chatContainer.innerHTML = '';
    }
    
    // Ensure tab system is properly configured for the new page (optimized approach)
    try {
      if (TabManager && elements.tabContainer && elements.chatContainer) {
        logger.info('Ensuring tab system is configured for conversations page');

        // Check if tabs are already loaded and just need state sync
        const existingTabs = elements.tabContainer.querySelectorAll('.tab');
        const needsFullReload = existingTabs.length === 0;

        if (needsFullReload) {
          // Only do full reload if tabs don't exist
          logger.info('Loading tab system for conversations page');
          await TabManager.loadTabs(
            elements.tabContainer,
            elements.chatContainer,
            (displayText, sendTextTemplate, tabId, isAutoSend, forceIncludePageContent) =>
              handleTabAction(displayText, sendTextTemplate, tabId, isAutoSend, forceIncludePageContent)
          );
        }

        // Ensure chat tab is active (this will use incremental update, but don't reload content)
        if (TabManager.setActiveTab) {
          await TabManager.setActiveTab('chat', false); // Don't reload content, it's already loaded
          logger.info('Chat tab ensured as active');
        } else {
          // Fallback: manually set chat tab as active in UI
          const chatTab = elements.tabContainer.querySelector('[data-tab-id="chat"]');
          if (chatTab) {
            // Remove active class from all tabs
            elements.tabContainer.querySelectorAll('.tab').forEach(tab => {
              tab.classList.remove('active');
            });
            // Add active class to chat tab
            chatTab.classList.add('active');
            logger.info('Chat tab manually set as active in UI');
          }
        }

        logger.info('Tab system configured successfully');
      }
    } catch (tabConfigError) {
      logger.warn('Error configuring tab system:', tabConfigError);
    }

    // Final step: Ensure TabManager internal state is synchronized with UI
    try {
      // Force TabManager to recognize that chat tab is active and has the correct content
      if (TabManager && TabManager.getActiveTabId && TabManager.getActiveTabId() === 'chat') {
        logger.info('TabManager state synchronized - chat tab is active');
      } else if (TabManager && TabManager.setActiveTab) {
        // Don't reload content again, just sync the state
        await TabManager.setActiveTab('chat', false);
        logger.info('TabManager state synchronized - forced chat tab active');
      }
    } catch (syncError) {
      logger.warn('Error synchronizing TabManager state:', syncError);
    }

    // Restore loading states for the current page after everything is set up
    try {
      logger.info('Checking for ongoing loading states for current page:', url);

      // Force TabManager to check and restore loading states for the current page
      if (TabManager && TabManager.updateTabsLoadingStates) {
        await TabManager.updateTabsLoadingStates();
        logger.info('Loading states restored for current page');
      }

      // Also force re-render to ensure UI reflects the correct states
      if (TabManager && TabManager.renderCurrentTabsState) {
        await TabManager.renderCurrentTabsState();
        logger.info('Tab states re-rendered for current page');
      }
    } catch (restoreError) {
      logger.warn('Error restoring loading states:', restoreError);
    }

    logger.info('Page conversation loaded successfully');
  } catch (error) {
    logger.error('Error loading page conversation:', error);
    showErrorState(chrome.i18n.getMessage('conversations_js_failed_to_load'));
  }
}

/**
 * Handle page data loaded for conversations page
 * Reuses sidebar logic with conversations-specific adaptations
 * @param {Object} data - Page data
 * @returns {Promise<void>}
 */
async function handleConversationsPageDataLoaded(pageInfo) {
  const elements = window.conversationsElements;

  // Hide loading indicator
  if (elements.loadingIndicator) {
    elements.loadingIndicator.classList.add('hidden');
  }

  // Log detailed information for debugging
  logger.info('Processing page info:', {
    hasData: !!pageInfo,
    hasContent: !!(pageInfo && pageInfo.content),
    contentLength: pageInfo?.content?.length || 0,
    hasExtractionMethod: !!(pageInfo && pageInfo.extractionMethod),
    extractionMethod: pageInfo?.extractionMethod,
    hasChatHistory: !!(pageInfo && pageInfo.chatHistory),
    chatHistoryLength: pageInfo?.chatHistory?.length || 0,
    hasPageState: !!(pageInfo && pageInfo.pageState)
  });
  
  // Try to get page metadata for title
  try {
    if (elements.pageInfoHeader && elements.pageTitle && currentUrl) {
      // Get fresh metadata from storage
      const response = await chrome.runtime.sendMessage({
        type: 'GET_ALL_PAGE_METADATA'
      });
      
      if (response && response.pages) {
        // Find the current page metadata
        const pageMetadata = response.pages.find(page => page.url === currentUrl);
        
        if (pageMetadata && pageMetadata.title) {
          // Update page title if available
          elements.pageTitle.textContent = pageMetadata.title;
          logger.info('Updated page title from metadata:', pageMetadata.title);
        }
      }
    }
  } catch (metadataError) {
    logger.warn('Error fetching page metadata:', metadataError);
  }
  
  // Apply page state first
  if (pageInfo && pageInfo.pageState) {
    StateManager.applyPageState(pageInfo.pageState);
    const includePageContent = StateManager.getStateItem('includePageContent');
    if (elements.includePageContentBtn) {
      elements.includePageContentBtn.setAttribute('data-enabled', includePageContent ? 'true' : 'false');
    }
    if (pageInfo.pageState.contentSectionHeight && elements.contentSection) {
      elements.contentSection.style.height = pageInfo.pageState.contentSectionHeight + 'px';
    }
    logger.info('Page state applied for conversations page');
  }

  // Update extracted content and display
  if (pageInfo && pageInfo.content) {
    StateManager.updateStateItem('extractedContent', pageInfo.content);
    if (elements.extractedContent) {
      elements.extractedContent.innerHTML = pageInfo.content;
    }
    if (elements.contentError) {
      elements.contentError.classList.add('hidden');
    }
    logger.info('Content displayed successfully, length:', pageInfo.content.length);
  } else {
    StateManager.updateStateItem('extractedContent', '');
    if (elements.extractedContent) {
      elements.extractedContent.innerHTML = '';
    }
    if (elements.contentError) {
      elements.contentError.classList.remove('hidden');
      elements.contentError.textContent = chrome.i18n.getMessage('conversations_js_no_cached_content');
    }
    logger.warn('No content extracted for current page. Data received:', pageInfo);
  }

  // Update extraction method state if provided
  if (pageInfo && pageInfo.extractionMethod) {
    StateManager.updateStateItem('currentExtractionMethod', pageInfo.extractionMethod);
    logger.info(`Content displayed using method: ${pageInfo.extractionMethod}`);
  } else {
    logger.info('No extraction method provided in page data');
  }
}

/**
 * Handle page deletion from the list
 */
async function handlePageDelete(url) {
  logger.info('Deleting page data for URL:', url);

  try {
    // Check if sync is enabled to determine deletion method
    let useSoftDelete = false;
    try {
      const syncConfigResponse = await chrome.runtime.sendMessage({ type: 'GET_SYNC_CONFIG' });
      useSoftDelete = syncConfigResponse?.config?.enabled === true;
      logger.info(`Sync is ${useSoftDelete ? 'enabled' : 'disabled'}, using ${useSoftDelete ? 'soft' : 'hard'} delete`);
    } catch (error) {
      logger.warn('Failed to check sync status, using hard delete:', error.message);
    }

    // Use appropriate deletion method based on sync status
    const deleteType = useSoftDelete ? 'SOFT_DELETE_URL_DATA' : 'CLEAR_URL_DATA';
    const response = await chrome.runtime.sendMessage({
      type: deleteType,
      url: url,
      clearContent: true,
      clearChat: true,
      clearMetadata: !useSoftDelete, // Don't clear metadata for soft delete
      wildcard: true // Enable wildcard matching to delete all URL-related data including tab data
    });

    if (!response || !response.success) {
      throw new Error(response?.error || 'Failed to delete page data');
    }

    logger.info(`All page data ${useSoftDelete ? 'soft ' : ''}deleted successfully:`, url);
    
    // If this was the currently selected page, switch back to welcome screen
    if (currentUrl === url) {
      // Clear current state
      currentUrl = null;
      StateManager.updateStateItem('currentUrl', null);
      StateManager.updateStateItem('extractedContent', '');
      
      // Clear UI elements
      const elements = window.conversationsElements;
      
      // Clear chat container
      if (elements.chatContainer) {
        elements.chatContainer.innerHTML = '';
      }
      
      // Clear extracted content
      if (elements.extractedContent) {
        elements.extractedContent.innerHTML = '';
      }
      
      // Switch to welcome screen
      elements.welcomeScreen.classList.remove('hidden');
      elements.mainContentArea.classList.add('hidden');
      
      // Hide page info header
      if (elements.pageInfoHeader) {
        elements.pageInfoHeader.classList.add('hidden');
      }
      
      logger.info('Cleared UI for deleted page:', url);
    }
    
    return true;
  } catch (error) {
    logger.error('Error deleting page data:', error);
    alert(chrome.i18n.getMessage('conversations_js_failed_to_delete', { error: error.message || 'Unknown error' }));
    return false;
  }
}

/**
 * Get page data from background
 * For conversations page, prioritize cached content to avoid extraction errors
 */
/**
 * Get all page info from background in a single request
 */
async function getPageInfo(url) {
  try {
    logger.info('Requesting all page info for URL:', url);
    const response = await chrome.runtime.sendMessage({
      type: 'GET_PAGE_INFO',
      url: url
    });

    logger.info('Received page info response from background:', response);

    if (response.type === 'PAGE_INFO_LOADED') {
      logger.info('Page info loaded successfully.');
      // The 'data' object now contains pageState, content, chatHistory, etc.
      return response.data;
    } else {
      logger.warn('Page info error:', response.error);
      showErrorState(response.error || 'Failed to load page information.');
      return null;
    }
  } catch (error) {
    logger.error('Error getting page info:', error);
    showErrorState(`Error getting page info: ${error.message}`);
    return null;
  }
}

/**
 * Get chat history from background
 */
async function getChatHistory(url) {
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'GET_CHAT_HISTORY',
      url: url
    });
    return response.chatHistory || [];
  } catch (error) {
    logger.error('Error getting chat history:', error);
    return [];
  }
}

/**
 * Save chat history for current page
 */
async function saveChatHistoryForCurrentPage(chatHistory) {
  if (!currentUrl) {
    logger.warn('No current URL to save chat history for');
    return;
  }

  try {
    // Get current tab ID to use tab-specific URL format (consistent with TabManager)
    const currentTabId = TabManager.getActiveTabId();
    const tabSpecificUrl = `${currentUrl}#${currentTabId}`;

    await chrome.runtime.sendMessage({
      type: 'SAVE_CHAT_HISTORY',
      url: tabSpecificUrl,
      chatHistory: chatHistory
    });
    logger.info(`Chat history saved for current page with tab-specific URL: ${tabSpecificUrl}`);
  } catch (error) {
    logger.error('Error saving chat history:', error);
  }
}

/**
 * Show loading state
 */
function showLoadingState() {
  const elements = window.conversationsElements;
  elements.extractedContent.innerHTML = '';
  elements.loadingIndicator.classList.remove('hidden');
  elements.contentError.classList.add('hidden');
}

/**
 * Show error state
 */
function showErrorState(errorMessage) {
  const elements = window.conversationsElements;
  elements.extractedContent.innerHTML = '';
  elements.loadingIndicator.classList.add('hidden');
  elements.contentError.classList.remove('hidden');
  elements.contentError.textContent = errorMessage;
}

/**
 * Set up message listeners (reusing from sidebar)
 */
function setupMessageListeners() {
  MessageHandler.setupMessageListeners({
    onStreamChunk: (chunk, tabId, url) => {
      // Only process stream chunks for the current URL and active tab
      const activeTabId = TabManager.getActiveTabId();

      if (url === currentUrl && tabId === activeTabId) {
        // Update stream monitor if we have an active stream
        if (currentStreamId && typeof streamMonitor !== 'undefined') {
          streamMonitor.updateStream(currentStreamId, chunk);
        }

        ChatManager.handleStreamChunk(window.conversationsElements.chatContainer, chunk, tabId, url);
        logger.debug(`Stream chunk processed for conversations page tab ${tabId}`);
      } else {
        logger.debug(`Stream chunk ignored - URL mismatch (${url} vs ${currentUrl}) or tab mismatch (${tabId} vs ${activeTabId})`);
      }
    },
    
    onStreamEnd: (fullResponse, finishReason, isAbnormalFinish, tabId, url) => {
      // Always update tab loading state regardless of which tab is currently active
      if (url === currentUrl) {
        // Update tab loading state to not loading
        if (window.TabManager && window.TabManager.updateTabLoadingState) {
          window.TabManager.updateTabLoadingState(tabId, false).catch(error =>
            logger.warn('Error updating tab loading state after stream end:', error)
          );
        }
      }

      // Only process stream content for current URL and active tab
      const activeTabId = TabManager.getActiveTabId();
      if (url === currentUrl && tabId === activeTabId) {
        // Mark stream as completed in monitor
        if (currentStreamId && typeof streamMonitor !== 'undefined') {
          streamMonitor.completeStream(currentStreamId, fullResponse);
          currentStreamId = null;
        }
        
        ChatManager.handleStreamEnd(
          window.conversationsElements.chatContainer,
          fullResponse,
          async (response) => {
            // Save updated chat history for current page
            const chatHistory = ChatHistory.getChatHistoryFromDOM(window.conversationsElements.chatContainer);
            await saveChatHistoryForCurrentPage(chatHistory);
            
            // Re-enable send button
            window.conversationsElements.sendBtn.disabled = false;
          },
          finishReason,
          isAbnormalFinish,
          tabId,
          url
        );
        
        logger.info(`Stream ended for conversations page tab ${tabId}`);
      } else {
        logger.debug(`Stream end content processing ignored - URL mismatch (${url} vs ${currentUrl}) or tab mismatch (${tabId} vs ${activeTabId}), but tab loading state updated`);
      }
    },
    
    onLlmError: (message) => {
      const error = message.error || 'Unknown error';
      const errorDetails = message.errorDetails || null;
      const tabId = message.tabId;
      const url = message.url;

      const activeTabId = TabManager.getActiveTabId();

      // Only process error content for current URL and active tab
      if (url === currentUrl && tabId === activeTabId) {
        // Mark stream as failed in monitor
        if (currentStreamId && typeof streamMonitor !== 'undefined') {
          const errorObj = new Error(error);
          streamMonitor.failStream(currentStreamId, errorObj);
          currentStreamId = null;
        }
        
        // Handle JSON formatted error message
        let processedError = error;
        try {
          const errorObj = JSON.parse(error);
          processedError = errorObj;
        } catch (parseError) {
          processedError = error;
        }
        
        ChatManager.handleLlmError(
          window.conversationsElements.chatContainer,
          processedError,
          null,
          () => {
            // Re-enable send button
            window.conversationsElements.sendBtn.disabled = false;
          },
          errorDetails,
          tabId,
          url
        );
        
        logger.info(`LLM error processed for conversations page tab ${tabId}`);
      } else {

      }
    },
    
    onLoadingStateUpdate: (message) => {
      const { url, status, result, error, finishReason, tabId } = message;

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

      // Only process content updates for current URL and active tab
      const activeTabId = TabManager.getActiveTabId();
      if (url === currentUrl && tabId === activeTabId) {
        const chatContainer = window.conversationsElements.chatContainer;

        if (status === 'completed' && result) {
          // Handle completed LLM response
          const isAbnormalFinish = finishReason && 
              finishReason !== 'stop' && 
              finishReason !== 'STOP' && 
              finishReason !== 'end_turn';
          
          ChatManager.handleStreamEnd(
            chatContainer,
            result,
            async (response) => {
              // Save updated chat history for current page
              const chatHistory = ChatHistory.getChatHistoryFromDOM(chatContainer);
              await saveChatHistoryForCurrentPage(chatHistory);
              
              // Re-enable send button
              window.conversationsElements.sendBtn.disabled = false;
            },
            finishReason,
            isAbnormalFinish
          );
        } else if (status === 'error' && error) {
          // Handle error response
          ChatManager.handleLlmError(
            chatContainer,
            error,
            null,
            () => {
              // Re-enable send button
              window.conversationsElements.sendBtn.disabled = false;
            },
            message.errorDetails
          );
        } else if (status === 'cancelled') {
          // Handle cancelled response
          const streamingMessage = chatContainer.querySelector('[data-streaming="true"]');
          if (streamingMessage) {
            const contentDiv = streamingMessage.querySelector('.message-content');
            if (contentDiv) {
              contentDiv.innerHTML = `<span style="color: var(--text-color); font-style: italic;">${chrome.i18n.getMessage('conversations_js_response_stopped')}</span>`;
            }
            streamingMessage.removeAttribute('data-streaming');
          }
          
          // Re-enable send button
          window.conversationsElements.sendBtn.disabled = false;
        }
      } else {
        logger.debug(`Loading state content processing ignored - URL mismatch (${url} vs ${currentUrl}) or tab mismatch (${tabId} vs ${activeTabId}), but tab loading state updated`);
      }
    }
  });
}

/**
 * Update input area button layout for conversations page
 * Simplified version of UIManager.updateIconsLayout
 * @param {number} height - Input box height
 * @param {HTMLElement} buttonGroup - Button group element
 */
function updateConversationsIconsLayout(height, buttonGroup) {
  if (!buttonGroup) {
    return;
  }
  
  try {
    // Remove transition effect for immediate layout update
    buttonGroup.style.transition = 'none';
    
    // Clear all layout classes
    buttonGroup.classList.remove('layout-row', 'layout-grid', 'layout-column');
    
    // Set layout based on height threshold
    if (height <= 40) {
      // Default layout: Single row
      buttonGroup.classList.add('layout-row');
    } else if (height > 40 && height <= 80) {
      // Grid layout: Two rows, two columns
      buttonGroup.classList.add('layout-grid');
    } else {
      // Column layout: Single column multiple rows
      buttonGroup.classList.add('layout-column');
    }
    
    // Ensure send button always stays primary class
    const sendBtn = buttonGroup.querySelector('#sendBtn');
    if (sendBtn && !sendBtn.classList.contains('primary')) {
      sendBtn.classList.add('primary');
    }
    
    // Reset all button styles
    Array.from(buttonGroup.children).forEach(button => {
      // Clear any inline styles
      button.removeAttribute('style');
    });
    
    // Use setTimeout to restore transition effect
    setTimeout(() => {
      buttonGroup.style.transition = '';
    }, 50);
    
    logger.debug(`Updated icon layout for height ${height}px`);
  } catch (error) {
    logger.warn('Error updating icon layout:', error);
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
 * Handle URL parameters to auto-select a page
 */
async function handleUrlParameters() {
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const selectPageUrl = urlParams.get('selectPage');

    if (selectPageUrl) {
      logger.info('Auto-selecting page from URL parameter:', selectPageUrl);

      // Wait a bit for page list to be fully loaded
      await new Promise(resolve => setTimeout(resolve, 500));

      // Check if the page exists in the page list
      if (pageListManager) {
        const hasPage = await pageListManager.hasPage(selectPageUrl);
        if (hasPage) {
          // Select the page in the page list and load its conversation
          await pageListManager.selectPage(selectPageUrl);
          await loadPageConversation(selectPageUrl);
          logger.info('Successfully auto-selected page:', selectPageUrl);
        } else {
          logger.warn('Page not found in page list for auto-selection:', selectPageUrl);
        }
      }
    }
  } catch (error) {
    logger.error('Error handling URL parameters:', error);
  }
}