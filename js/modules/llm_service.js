// Think Bot LLM Service Module
// Coordinates different LLM providers and handles provider selection logic

// Create a global llmService object
var llmService = {};

// Create module logger
const llmLogger = logger.createModuleLogger('LLMService');

// Available provider names for validation
const AVAILABLE_PROVIDERS = ['gemini', 'openai', 'azure_openai'];

/**
 * Get global object safely across different JavaScript environments
 * @param {string} name - Object name to retrieve
 * @returns {*} - Global object or null
 */
function getGlobalObject(name) {
  return (typeof global !== 'undefined' ? global[name] : null) || 
         (typeof window !== 'undefined' ? window[name] : null) ||
         (typeof self !== 'undefined' ? self[name] : null);
}

/**
 * Validate provider availability
 * @param {string} provider - Provider name
 * @returns {Object|null} - Error object if validation fails, null if success
 */
function validateProvider(provider) {
  if (!AVAILABLE_PROVIDERS.includes(provider)) {
    const error = new Error(`Unsupported LLM provider: ${provider}. Available providers: ${AVAILABLE_PROVIDERS.join(', ')}`);
    llmLogger.error('Invalid provider specified', {
      requestedProvider: provider,
      availableProviders: AVAILABLE_PROVIDERS
    });
    return error;
  }
  
  const providerMapping = {
    'gemini': { object: 'geminiProvider', file: 'gemini_provider.js' },
    'openai': { object: 'openaiProvider', file: 'openai_provider.js' },
    'azure_openai': { object: 'azureOpenaiProvider', file: 'azure_openai_provider.js' }
  };
  
  const providerInfo = providerMapping[provider];
  const providerObject = getGlobalObject(providerInfo.object);
  
  if (typeof providerObject === 'undefined' || typeof providerObject.execute !== 'function') {
    const error = new Error(`${provider.charAt(0).toUpperCase() + provider.slice(1)} provider not loaded correctly. Ensure js/modules/llm_provider/${providerInfo.file} is included.`);
    llmLogger.error('Provider not loaded correctly', { 
      provider, 
      expectedObject: providerInfo.object,
      objectExists: typeof providerObject !== 'undefined',
      executeExists: typeof providerObject?.execute === 'function'
    });
    return error;
  }
  
  return null;
}

/**
 * Get provider execution function
 * @param {string} provider - Provider name
 * @returns {Function} - Provider execute function
 */
function getProviderExecutor(provider) {
  const providerMapping = {
    'gemini': () => getGlobalObject('geminiProvider'),
    'openai': () => getGlobalObject('openaiProvider'),
    'azure_openai': () => getGlobalObject('azureOpenaiProvider')
  };
  
  return providerMapping[provider]();
}

/**
 * Call LLM API with provided messages and config
 * @param {Array} messages - Chat messages
 * @param {Object} llmConfig - LLM configuration
 * @param {string} systemPrompt - System prompt
 * @param {string} imageBase64 - Base64 image data
 * @param {Function} streamCallback - Stream callback function
 * @param {Function} doneCallback - Completion callback function
 * @param {Function} errorCallback - Error callback function
 * @param {AbortController} abortController - Optional abort controller for cancellation
 * @param {string} url - Optional URL for loading state checks
 * @param {string} tabId - Optional tab ID for loading state checks
 */
llmService.callLLM = async function(
  messages,
  llmConfig,
  systemPrompt,
  imageBase64,
  streamCallback,
  doneCallback,
  errorCallback,
  abortController = null,
  url = null,
  tabId = null
) {
  // Log the call (without sensitive data)
  llmLogger.info('Starting LLM API call', { 
    provider: llmConfig.provider, 
    model: llmConfig.model, 
    messageCount: messages?.length || 0,
    hasSystemPrompt: !!systemPrompt,
    hasImage: !!imageBase64,
    isStreaming: !!(streamCallback && doneCallback),
    configKeys: Object.keys(llmConfig || {}).filter(key => key !== 'apiKey') // Log config structure without sensitive data
  });
  
  try {
    // Validate provider availability
    const providerError = validateProvider(llmConfig.provider);
    if (providerError) {
      errorCallback(providerError);
      return;
    }
    
    // Get provider executor and delegate to it
    const providerExecutor = getProviderExecutor(llmConfig.provider);

    llmLogger.info('call llm, system prompt', { systemPrompt }, 'messages', messages);
    await providerExecutor.execute(
      messages,
      llmConfig,
      systemPrompt,
      imageBase64,
      streamCallback,
      doneCallback,
      errorCallback,
      abortController,
      url,
      tabId
    );
    
  } catch (error) {
    // Check if this is a user cancellation - log as info instead of error
    if (error.message === 'Request was cancelled by user') {
      llmLogger.info('LLM request cancelled by user', {
        provider: llmConfig.provider,
        error: error.message
      });
    } else {
      llmLogger.error('LLM service coordination failed', {
        provider: llmConfig.provider,
        error: error.message,
        errorType: error.constructor.name,
        stack: error.stack
      });
    }

    // Ensure errorCallback is a function before calling it
    if (typeof errorCallback === 'function') {
      errorCallback(error);
    } else {
      llmLogger.error('errorCallback is not a function', {
        errorCallbackType: typeof errorCallback,
        originalError: error.message
      });
    }
  }
} 