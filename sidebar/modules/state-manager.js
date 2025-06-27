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
  try {

    const response = await chrome.runtime.sendMessage({
      type: 'GET_CONFIG'
    });
    
    if (response && response.type === 'CONFIG_LOADED' && response.config) {
      return response.config;
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
      pageState: pageState
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
 * Load page state from cache
 * @param {string} url - Page URL
 * @returns {Promise<Object|null>} Page state object or null
 */
const loadPageState = async (url) => {
  try {
    if (!url) {

      return null;
    }
    
    const response = await chrome.runtime.sendMessage({
      type: 'GET_PAGE_STATE',
      url: url
    });
    
    if (response && response.type === 'PAGE_STATE_LOADED' && response.pageState) {
      return response.pageState;
    } else if (response && response.type === 'PAGE_STATE_LOADED') {
      return null;
    } else {
      logger.error('Failed to load page state:', response);
      return null;
    }
  } catch (error) {
    logger.error('Error loading page state:', error);
    return null;
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

export {
  getState,
  updateState,
  getStateItem,
  updateStateItem,
  getConfig,
  saveChatHistory,
  clearUrlData,
  toggleIncludePageContent,
  savePageState,
  loadPageState,
  applyPageState
}; 