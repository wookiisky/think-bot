// background/handlers/savePageStateHandler.js

async function handleSavePageState(data, serviceLogger, storage) {
  const { url, pageState, title } = data;
  
  if (!url) {
    serviceLogger.warn('SAVE_PAGE_STATE: No URL provided');
    return { type: 'PAGE_STATE_SAVE_ERROR', error: 'No URL provided' };
  }
  
  if (!pageState || typeof pageState !== 'object') {
    serviceLogger.warn('SAVE_PAGE_STATE: Invalid page state data');
    return { type: 'PAGE_STATE_SAVE_ERROR', error: 'Invalid page state data' };
  }
  
  try {
    serviceLogger.info(`SAVE_PAGE_STATE: Saving page state for ${url}`, { pageState });
    
    // Save page state using storage module
    const success = await storage.savePageState(url, pageState);
    
    if (!success) {
      serviceLogger.warn(`SAVE_PAGE_STATE: Failed for ${url}`);
      return { type: 'PAGE_STATE_SAVE_ERROR', error: 'Failed to save page state' };
    }
    
    // Also save page metadata if title is provided
    if (title) {
      const metadata = {
        title: title,
        timestamp: Date.now()
      };
      
      try {
        await storage.savePageMetadata(url, metadata);
        serviceLogger.info(`SAVE_PAGE_STATE: Also saved metadata for ${url}`);
      } catch (metadataError) {
        // Log but don't fail the whole operation
        serviceLogger.warn('SAVE_PAGE_STATE: Failed to save metadata:', metadataError.message);
      }
    }
    
    return { type: 'PAGE_STATE_SAVED', success: true };
  } catch (error) {
    serviceLogger.error('SAVE_PAGE_STATE error:', error.message);
    return { 
      type: 'PAGE_STATE_SAVE_ERROR', 
      error: error.message || 'Failed to save page state'
    };
  }
} 