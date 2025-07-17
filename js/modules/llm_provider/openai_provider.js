// OpenAI Provider Module for LLM Service
// Uses BaseProvider utilities for common functionality

const openaiLogger = logger.createModuleLogger('OpenAIProvider');

var openaiProvider = (function() {
    
    // Import utilities from BaseProvider
    const { 
        EnhancedError, 
        ParameterUtils, 
        StreamUtils, 
        ApiUtils, 
        ValidationUtils,
        OpenAIUtils
    } = BaseProvider;
    
    // Constants
    const DEFAULT_MODEL = 'gpt-3.5-turbo';
    const DEFAULT_BASE_URL = 'https://api.openai.com';
    const DEFAULT_CONFIG = {
        temperature: 1.0,
        max_tokens: 20480
    };
    // All models now support image input by default

    // Normalize parameters using BaseProvider utilities
    function normalizeParameters(llmConfig) {
        const normalized = { ...llmConfig };
        
        normalized.temperature = ParameterUtils.normalizeTemperature(normalized.temperature);
        normalized.max_tokens = ParameterUtils.normalizeTokens(normalized.max_tokens);
        normalized.maxTokens = ParameterUtils.normalizeTokens(normalized.maxTokens);
        
        return normalized;
    }

    // Helper function to build API URL
    function buildApiUrl(baseUrl) {
        // Remove trailing slash to prevent double slashes
        const cleanBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
        const apiUrl = `${cleanBaseUrl}/v1/chat/completions`;
        
        return apiUrl;
    }



    // Main execution function
    async function execute(
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
        const apiKey = llmConfig.apiKey;
        const baseUrl = llmConfig.baseUrl || DEFAULT_BASE_URL;
        const model = llmConfig.model || DEFAULT_MODEL;
        const maxTokens = llmConfig.maxTokens || llmConfig.max_tokens || DEFAULT_CONFIG.max_tokens;
        const temperature = llmConfig.temperature !== undefined ? llmConfig.temperature : DEFAULT_CONFIG.temperature;

        // Validate API key using BaseProvider utilities
        const keyError = ValidationUtils.validateApiKey(apiKey, 'OpenAI');
        if (keyError) {
            errorCallback(keyError);
            return;
        }

        // Validate base URL format
        try {
            new URL(baseUrl);
        } catch (urlError) {
            const errorMessage = `Invalid OpenAI base URL: ${baseUrl}`;
            openaiLogger.error('[Config] Invalid base URL format', {
                baseUrl,
                error: urlError.message
            });
            errorCallback(new Error(errorMessage));
            return;
        }

        // Normalize parameters
        const normalizedConfig = normalizeParameters(llmConfig);

        try {
            const apiUrl = buildApiUrl(baseUrl);
            const openaiMessages = OpenAIUtils.buildMessages(messages, systemPrompt, imageBase64, model, openaiLogger);

            const requestBody = {
                model,
                messages: openaiMessages,
                temperature: normalizedConfig.temperature !== undefined ? normalizedConfig.temperature : temperature,
                max_tokens: normalizedConfig.maxTokens || normalizedConfig.max_tokens || maxTokens,
                stream: !!streamCallback
            };

            // Log HTTP request details - URL and parameters
            openaiLogger.info('[HTTP Request] OpenAI API call', {
                url: apiUrl,
                method: 'POST',
                model: requestBody.model,
                maxTokens: requestBody.max_tokens,
                temperature: requestBody.temperature,
                messageCount: openaiMessages.length,
                isStreaming: requestBody.stream
            });

            const { response } = await ApiUtils.safeFetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify(requestBody)
            }, 'OpenAI', abortController);

            if (!response.ok) {
                // Handle error responses with improved error parsing
                try {
                    const errorData = await ApiUtils.parseJsonResponse(response, 'OpenAI');
                    const errorMessage = `OpenAI API error: ${response.status} - ${JSON.stringify(errorData)}`;
                    const errorText = JSON.stringify(errorData);
                    openaiLogger.error('[Request] OpenAI API returned error', {
                        status: response.status,
                        statusText: response.statusText,
                        errorData
                    });
                    throw new EnhancedError(errorMessage, errorText, errorData, response.status);
                } catch (parseError) {
                    // If parsing fails, this is likely a non-JSON error response (like HTML error page)
                    // The parseJsonResponse method will have already logged details and thrown an EnhancedError
                    openaiLogger.error('[Request] OpenAI API returned non-JSON error response', {
                        status: response.status,
                        statusText: response.statusText,
                        parseError: parseError.message,
                        apiUrl
                    });
                    
                    // Provide specific guidance for common HTTP errors
                    let errorMessage = `OpenAI API error: ${response.status} - ${response.statusText}`;
                    let errorDetails = { status: response.status, statusText: response.statusText };
                    
                    if (response.status === 405) {
                        errorMessage = `OpenAI API error: Method not allowed (405). This usually indicates an incorrect base URL. Current URL: ${apiUrl}`;
                        errorDetails.troubleshooting = [
                            'Verify your base URL configuration',
                            'Ensure the base URL points to a valid OpenAI-compatible API',
                            'Common valid base URLs: https://api.openai.com or your custom proxy URL',
                            'Remove any trailing slashes or extra path segments from the base URL'
                        ];
                    } else if (response.status >= 500) {
                        errorMessage = `OpenAI API server error: ${response.status} - ${response.statusText}`;
                        errorDetails.troubleshooting = ['API server is experiencing issues', 'Try again later'];
                    }
                    
                    // Re-throw the enhanced error from parseJsonResponse if available
                    if (parseError instanceof EnhancedError) {
                        // Update the message with our improved guidance
                        parseError.message = errorMessage;
                        parseError.errorData = { ...parseError.errorData, ...errorDetails };
                        throw parseError;
                    }
                    
                    // Fallback for unexpected errors
                    throw new EnhancedError(errorMessage, null, errorDetails, response.status);
                }
            }

            if (streamCallback) {
                await OpenAIUtils.handleStream(response, streamCallback, doneCallback, errorCallback, openaiLogger, 'OpenAI', abortController, url, tabId);
            } else {
                const data = await ApiUtils.parseJsonResponse(response, 'OpenAI');
                const responseText = data.choices[0].message.content;
                doneCallback(responseText);
            }
        } catch (error) {
            // Check if this is a user cancellation - log as info instead of error
            if (error.message === 'Request was cancelled by user') {
                openaiLogger.info('[Request] Request cancelled by user', {
                    error: error.message,
                    model,
                    baseUrl
                });
            } else {
                openaiLogger.error('[Request] OpenAI API call failed', {
                    error: error.message,
                    errorType: error.constructor.name,
                    model,
                    baseUrl,
                    stack: error.stack
                });
            }
            errorCallback(error);
        }
    }

    return { execute };
})(); 