// background/handlers/pageStateHandler.js

async function handleSavePageState(data, serviceLogger, storage) {
  const { url, pageState } = data;
  
  if (!url) {
    serviceLogger.error('SAVE_PAGE_STATE: URL is required');
    return { type: 'PAGE_STATE_SAVE_ERROR', error: 'URL is required' };
  }

  try {
    const success = await storage.savePageState(url, pageState);
    
    if (success) {
      serviceLogger.info('Page state saved successfully', { url, pageState });
      return { type: 'PAGE_STATE_SAVED', url };
    } else {
      serviceLogger.error('Failed to save page state', { url, pageState });
      return { type: 'PAGE_STATE_SAVE_ERROR', error: 'Failed to save page state' };
    }
  } catch (error) {
    serviceLogger.error('Error saving page state:', error);
    return { type: 'PAGE_STATE_SAVE_ERROR', error: error.message };
  }
}

async function handleGetPageState(data, serviceLogger, storage) {
  const { url } = data;
  
  if (!url) {
    serviceLogger.error('GET_PAGE_STATE: URL is required');
    return { type: 'PAGE_STATE_LOAD_ERROR', error: 'URL is required' };
  }

  try {
    const pageState = await storage.getPageState(url);
    
    serviceLogger.info('Page state retrieved', { url, pageState });
    return { 
      type: 'PAGE_STATE_LOADED', 
      url,
      pageState: pageState || {} // Return empty object if no state found
    };
  } catch (error) {
    serviceLogger.error('Error getting page state:', error);
    return { type: 'PAGE_STATE_LOAD_ERROR', error: error.message };
  }
} 