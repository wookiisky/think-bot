// background/handlers/getAllPageMetadataHandler.js

async function handleGetAllPageMetadata(data, serviceLogger, storage) {
  try {
    serviceLogger.info('GET_ALL_PAGE_METADATA: Fetching all page metadata');
    
    // Get all page metadata from storage
    const allMetadata = await storage.getAllPageMetadata();
    
    if (allMetadata && allMetadata.length > 0) {
      serviceLogger.info(`GET_ALL_PAGE_METADATA: Found ${allMetadata.length} page metadata entries`);
      
      // Return the metadata as an array
      return {
        type: 'ALL_PAGE_METADATA_LOADED',
        pages: allMetadata
      };
    } else {
      serviceLogger.info('GET_ALL_PAGE_METADATA: No page metadata found');
      return {
        type: 'ALL_PAGE_METADATA_LOADED',
        pages: []
      };
    }
  } catch (error) {
    serviceLogger.error('GET_ALL_PAGE_METADATA error:', error.message);
    return {
      type: 'ALL_PAGE_METADATA_ERROR',
      error: error.message || 'Failed to fetch page metadata'
    };
  }
}

// Make the handler available globally
// In a service worker environment, this function can be called directly 