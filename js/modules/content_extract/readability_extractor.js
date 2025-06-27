// Readability Extractor Module for Think Bot

// This script should be imported by the main content_extractor.js using importScripts.
// It assumes 'logger' is available in the global scope.

const readabilityExtractorLogger = logger.createModuleLogger('ReadabilityExtractor');
const OFFSCREEN_DOCUMENT_PATH_FOR_READABILITY = '/offscreen/offscreen.html'; // Updated path to match new location

// Helper function to manage the offscreen document for Readability
async function getOrCreateOffscreenDocumentForReadability() {
  readabilityExtractorLogger.info('Getting or creating offscreen document for Readability');
  
  try {
    const existingContexts = await chrome.runtime.getContexts({
      contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
      documentUrls: [chrome.runtime.getURL(OFFSCREEN_DOCUMENT_PATH_FOR_READABILITY)] // Match specific offscreen document
    });

    readabilityExtractorLogger.info('Existing offscreen contexts:', { count: existingContexts.length });

    if (existingContexts.length > 0) {
      readabilityExtractorLogger.info('Using existing offscreen document');
      return existingContexts[0].documentId;
    }

    readabilityExtractorLogger.info('Creating new offscreen document');
    await chrome.offscreen.createDocument({
      url: OFFSCREEN_DOCUMENT_PATH_FOR_READABILITY,
      reasons: [chrome.offscreen.Reason.DOM_PARSER],
      justification: 'Parse HTML content with Readability.js for content extraction'
    });
    
    readabilityExtractorLogger.info('Offscreen document created successfully');
    // It might be necessary to query again if documentId is needed and not directly available,
    // but createDocument resolves when the document is loaded.
  } catch (error) {
    readabilityExtractorLogger.error('Error creating offscreen document:', { 
      error: error.message, 
      stack: error.stack 
    });
    throw error;
  }
}

// Extract with Readability.js via Offscreen Document
async function extractWithReadabilityViaOffscreen(htmlString, pageUrl) {
  readabilityExtractorLogger.info('Starting Readability extraction via offscreen', {
    hasHtmlString: !!htmlString,
    htmlLength: htmlString ? htmlString.length : 0,
    pageUrl: pageUrl
  });
  
  if (!htmlString) {
    const error = new Error('HTML content is required for Readability extraction');
    readabilityExtractorLogger.error('Missing HTML content', { pageUrl });
    throw error;
  }

  try {
    await getOrCreateOffscreenDocumentForReadability();
    
    readabilityExtractorLogger.info('Sending message to offscreen document', {
      messageType: 'extract-content-readability',
      pageUrl: pageUrl,
      htmlLength: htmlString.length
    });
    
    const response = await chrome.runtime.sendMessage({
      target: 'offscreen', // Assuming offscreen.js handles routing or this is the specific target name
      type: 'extract-content-readability', // More specific type for clarity
      htmlString: htmlString,
      pageUrl: pageUrl
    });

    readabilityExtractorLogger.info('Received response from offscreen document', {
      hasResponse: !!response,
      success: response ? response.success : false,
      hasContent: response && response.content ? true : false,
      contentLength: response && response.content ? response.content.length : 0,
      error: response ? response.error : null
    });

    if (response && response.success && typeof response.content === 'string') {
      readabilityExtractorLogger.info('Readability extraction successful', {
        contentLength: response.content.length,
        pageUrl: pageUrl
      });
      return response.content;
    } else {
      const errorMessage = response && response.error ? response.error : 'Unknown error from offscreen document during Readability extraction';
      readabilityExtractorLogger.error('Readability extraction failed', {
        pageUrl: pageUrl,
        error: errorMessage,
        response: response
      });
      throw new Error(`Failed to extract content with Readability via offscreen: ${errorMessage}`);
    }
  } catch (error) {
    readabilityExtractorLogger.error('Exception during Readability extraction', {
      pageUrl: pageUrl,
      error: error.message,
      stack: error.stack,
      name: error.name
    });
    throw new Error(`Failed to extract content with Readability: ${error.message}`);
  }
} 