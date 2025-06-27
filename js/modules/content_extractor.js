// Think Bot Content Extractor Module Orchestrator
// Handles delegation to specific content extraction modules.

// Create a global contentExtractor object
var contentExtractor = {};

// Create module logger
const extractorOrchestratorLogger = logger.createModuleLogger('ContentExtractorOrchestrator');

// Import utility functions (if still needed directly by this orchestrator)
// importScripts('../js/utils.js'); // Keep if utils are used here, otherwise remove.

// Import specific extractor modules
importScripts('/js/modules/content_extract/jina_extractor.js');
importScripts('/js/modules/content_extract/readability_extractor.js');
// Add other extractors here as they are created, e.g.:
// importScripts('/js/modules/content_extract/another_extractor.js');

// Main extract function - acts as an orchestrator
contentExtractor.extract = async function(url, htmlString, method, config) {
  if (!url) {
    extractorOrchestratorLogger.error('URL is required for extraction');
    throw new Error('URL is required for extraction');
  }
  
  extractorOrchestratorLogger.info(`Starting content extraction orchestration`, { url, method, hasHtml: !!htmlString, hasApiKey: !!config?.jinaApiKey });
  
  try {
    let result;
    switch (method) {
      case 'jina':
        // The extractWithJina function is now globally available due to importScripts
        result = await extractWithJina(url, config.jinaApiKey, config.jinaResponseTemplate);
        break;

      case 'readability':
        // The extractWithReadabilityViaOffscreen function is now globally available
        result = await extractWithReadabilityViaOffscreen(htmlString, url);
        break;
      
      // Example for adding a new extractor:
      // case 'another_method':
      //   result = await extractWithAnotherMethod(url, config.anotherConfig); // Assuming extractWithAnotherMethod is in another_extractor.js
      //   break;
        
      default:
        extractorOrchestratorLogger.error(`Unknown extraction method: ${method}`, { url });
        throw new Error(`Unknown extraction method: ${method}`);
    }
    
    if (result) {
      extractorOrchestratorLogger.info(`Content extraction successful via ${method}`, { url, method, resultLength: (typeof result === 'string' ? result.length : 'N/A') });
    } else {
      extractorOrchestratorLogger.warn(`Content extraction returned empty result via ${method}`, { url, method });
    }
    
    return result;
    
  } catch (error) {
    extractorOrchestratorLogger.error(`Content extraction failed during orchestration`, { url, method, error: error.message, stack: error.stack });
    // Re-throw to be caught by the caller in service-worker.js or elsewhere
    // Ensure the error message clearly indicates the method that failed if possible, 
    // or that the error object itself contains this information.
    throw new Error(`Extraction via ${method} failed: ${error.message}`); 
  }
}

// Note: All helper functions like getOrCreateOffscreenDocument, callJinaAPI, formatJinaResponse, etc., 
// are now located within their respective extractor modules (jina_extractor.js, readability_extractor.js).
// The utils.js import can be removed if no utility functions from it are directly used in this orchestrator file.
// Ensure that logger is initialized and available globally (e.g. in service worker or a common script loaded before this). 