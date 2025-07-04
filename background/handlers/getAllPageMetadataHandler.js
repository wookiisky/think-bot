// background/handlers/getAllPageMetadataHandler.js

async function handleGetAllPageMetadata(data, serviceLogger, storage) {
  try {
    serviceLogger.info('GET_ALL_PAGE_METADATA: Fetching all page metadata');
    
    // Get all page metadata from storage
    const allMetadata = await storage.getAllPageMetadata();
    
    // Also update the pageMetadata object for backwards compatibility
    if (allMetadata && allMetadata.length > 0) {
      try {
        // Convert metadata array to object format for pageMetadata
        const pageMetadataObj = {};
        allMetadata.forEach(item => {
          if (item.url) {
            pageMetadataObj[item.url] = {
              title: item.title || '',
              icon: item.icon || '',
              timestamp: item.timestamp || Date.now(),
              lastUpdated: item.lastUpdated || Date.now()
            };
          }
        });
        
        // Save to pageMetadata
        await chrome.storage.local.set({ pageMetadata: pageMetadataObj });
        serviceLogger.info(`GET_ALL_PAGE_METADATA: Updated pageMetadata object with ${allMetadata.length} entries`);
      } catch (updateError) {
        serviceLogger.error('GET_ALL_PAGE_METADATA: Error updating pageMetadata object:', updateError.message);
      }
      
      serviceLogger.info(`GET_ALL_PAGE_METADATA: Found ${allMetadata.length} page metadata entries`);
      
      // Return the metadata as an array
      return {
        type: 'ALL_PAGE_METADATA_LOADED',
        pages: allMetadata
      };
    } else {
      // Try to get from legacy pageMetadata object if no unified metadata found
      try {
        const result = await chrome.storage.local.get(['pageMetadata']);
        const pageMetadata = result.pageMetadata || {};
        
        // Convert to array format
        const legacyMetadata = Object.entries(pageMetadata).map(([url, data]) => ({
          url,
          title: data.title || '',
          icon: data.icon || '',
          timestamp: data.timestamp || Date.now(),
          lastUpdated: data.lastUpdated || Date.now()
        }));
        
        if (legacyMetadata.length > 0) {
          serviceLogger.info(`GET_ALL_PAGE_METADATA: Found ${legacyMetadata.length} legacy page metadata entries`);
          return {
            type: 'ALL_PAGE_METADATA_LOADED',
            pages: legacyMetadata
          };
        }
      } catch (legacyError) {
        serviceLogger.warn('GET_ALL_PAGE_METADATA: Error getting legacy pageMetadata:', legacyError.message);
      }
      
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