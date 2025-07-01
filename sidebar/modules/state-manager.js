/**
 * state-manager.js - Application state management
 */

import { createLogger } from './utils.js';

const logger = createLogger('StateManager');

// Application state
const state = {
  currentUrl: '',
  extractedContent: '',
  currentExtractionMethod: 'readability',
  includePageContent: true,
  config: null
};

/**
 * Get current state
 * @returns {Object} Current state object
 */
const getState = () => {
  return { ...state };
};

/**
 * Update state
 * @param {Object} newState - State to update
 */
const updateState = (newState) => {
  Object.assign(state, newState);
  
};

/**
 * Get specific state item
 * @param {string} key - State key name
 * @returns {any} State value
 */
const getStateItem = (key) => {
  return state[key];
};

/**
 * Update specific state item
 * @param {string} key - State key name
 * @param {any} value - New state value
 */
const updateStateItem = (key, value) => {
  state[key] = value;
  
};

/**
 * Get config from background
 * @returns {Promise<Object>} Config object
 */
const getConfig = async () => {
  if (state.config) {
    return state.config;
  }

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'GET_CONFIG'
    });
    
    if (response && response.type === 'CONFIG_LOADED' && response.config) {
      state.config = response.config;
      return state.config;
    } else {
      logger.error('Error loading config or config missing in response. Response:', response);
      return null;
    }
  } catch (error) {
    logger.error('Error requesting config via sendMessage:', error);
    return null;
  }
};

/**
 * Save chat history
 * @deprecated Replaced by direct DOM manipulation
 * @returns {Promise<boolean>} Whether saving was successful
 */
const saveChatHistory = async () => {
  logger.warn('saveChatHistory() is deprecated, use direct DOM manipulation instead');
  return false;
};

/**
 * Clear URL data
 * @param {boolean} clearContent - Whether to clear content
 * @param {boolean} clearChat - Whether to clear chat history
 */
const clearUrlData = async (clearContent = false, clearChat = true) => {
  try {
    if (!state.currentUrl) {
  
      return false;
    }
    
    await chrome.runtime.sendMessage({
      type: 'CLEAR_URL_DATA',
      url: state.currentUrl,
      clearContent,
      clearChat
    });
    
    // Update local state
    if (clearChat) {
      state.chatHistory = [];
    }
    
    if (clearContent) {
      state.extractedContent = '';
    }
    
    
    return true;
  } catch (error) {
    logger.error('Error clearing URL data:', error);
    return false;
  }
};

/**
 * Toggle whether to include page content
 * @returns {boolean} New state
 */
const toggleIncludePageContent = () => {
  state.includePageContent = !state.includePageContent;
  
  
  // Save page state to cache
  savePageState();
  
  return state.includePageContent;
};

/**
 * Save page state to cache
 * @returns {Promise<boolean>} Whether saving was successful
 */
const savePageState = async () => {
  try {
    if (!state.currentUrl) {

      return false;
    }
    
    const pageState = {
      includePageContent: state.includePageContent,
      lastUpdated: Date.now()
    };
    
    const response = await chrome.runtime.sendMessage({
      type: 'SAVE_PAGE_STATE',
      url: state.currentUrl,
      pageState: pageState,
      title: document.title // Pass the page title
    });
    
    if (response && response.type === 'PAGE_STATE_SAVED') {
              return true;
      } else {
        logger.error('Failed to save page state:', response);
      return false;
    }
  } catch (error) {
    logger.error('Error saving page state:', error);
    return false;
  }
};

/**
 * Apply page state to current state
 * @param {Object} pageState - Page state object
 */
const applyPageState = (pageState) => {
  if (!pageState) {
    return;
  }
  
  if (typeof pageState.includePageContent === 'boolean') {
    state.includePageContent = pageState.includePageContent;
  }
};

/**
 * Set config in state
 * @param {Object} config - Config object
 */
const setConfig = (config) => {
  state.config = config;
};

/**
 * Reset config in state
 */
const resetConfig = () => {
  state.config = null;
  logger.info('Config cache reset');
};

export {
  getState,
  updateState,
  getStateItem,
  updateStateItem,
  getConfig,
  setConfig,
  resetConfig,
  saveChatHistory,
  clearUrlData,
  toggleIncludePageContent,
  savePageState,
  applyPageState
};