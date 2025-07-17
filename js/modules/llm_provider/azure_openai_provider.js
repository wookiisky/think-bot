// Azure OpenAI Provider Module for LLM Service
// Uses BaseProvider utilities for common functionality

const azureOpenaiLogger = logger.createModuleLogger('AzureOpenAIProvider');

var azureOpenaiProvider = (function() {
    
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
    const DEFAULT_CONFIG = {
        temperature: 1.0,
        max_tokens: 20480,
        apiVersion: '2025-01-01-preview'
    };

    // Normalize parameters using BaseProvider utilities
    function normalizeParameters(llmConfig) {
        const normalized = { ...llmConfig };
        
        normalized.temperature = ParameterUtils.normalizeTemperature(normalized.temperature);
        normalized.max_tokens = ParameterUtils.normalizeTokens(normalized.max_tokens);
        normalized.maxTokens = ParameterUtils.normalizeTokens(normalized.maxTokens);
        
        return normalized;
    }

    // Helper function to build Azure OpenAI API URL
    function buildApiUrl(endpoint, deploymentName, apiVersion = DEFAULT_CONFIG.apiVersion) {
        if (!endpoint || !deploymentName) {
            throw new Error('Azure endpoint and deploymentName are required');
        }
        return `${endpoint}/openai/deployments/${deploymentName}/chat/completions?api-version=${apiVersion}`;
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
        const endpoint = llmConfig.endpoint;
        const deploymentName = llmConfig.deploymentName;
        const model = llmConfig.model || deploymentName; // Use deploymentName as model fallback
        const maxTokens = llmConfig.maxTokens || llmConfig.max_tokens || DEFAULT_CONFIG.max_tokens;
        const temperature = llmConfig.temperature !== undefined ? llmConfig.temperature : DEFAULT_CONFIG.temperature;
        const apiVersion = llmConfig.apiVersion || DEFAULT_CONFIG.apiVersion;

        // Validate required parameters
        const keyError = ValidationUtils.validateApiKey(apiKey, 'Azure OpenAI');
        if (keyError) {
            errorCallback(keyError);
            return;
        }

        if (!endpoint || !deploymentName) {
            const configError = new Error('Azure OpenAI endpoint and deploymentName are required');
            azureOpenaiLogger.error('Missing required configuration', { 
                hasEndpoint: !!endpoint, 
                hasDeploymentName: !!deploymentName 
            });
            errorCallback(configError);
            return;
        }

        // Normalize parameters
        const normalizedConfig = normalizeParameters(llmConfig);

        try {
            const apiUrl = buildApiUrl(endpoint, deploymentName, apiVersion);
            const openaiMessages = OpenAIUtils.buildMessages(messages, systemPrompt, imageBase64, model, azureOpenaiLogger);

            const requestBody = {
                model,
                messages: openaiMessages,
                temperature: normalizedConfig.temperature !== undefined ? normalizedConfig.temperature : temperature,
                max_completion_tokens: normalizedConfig.maxTokens || normalizedConfig.max_tokens || maxTokens,
                stream: !!streamCallback
            };

            // Log HTTP request details - URL and parameters
            azureOpenaiLogger.info('[HTTP Request] Azure OpenAI API call', {
                url: apiUrl,
                method: 'POST',
                model: requestBody.model,
                deploymentName,
                apiVersion,
                maxTokens: requestBody.max_completion_tokens,
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
            }, 'AzureOpenAI', abortController);

            if (!response.ok) {
                // Handle error responses with improved error parsing
                try {
                    const errorData = await ApiUtils.parseJsonResponse(response, 'AzureOpenAI');
                    const errorMessage = `Azure OpenAI API error: ${response.status} - ${JSON.stringify(errorData)}`;
                    const errorText = JSON.stringify(errorData);
                    azureOpenaiLogger.error('[Request] Azure OpenAI API returned error', {
                        status: response.status,
                        statusText: response.statusText,
                        errorData
                    });
                    throw new EnhancedError(errorMessage, errorText, errorData, response.status);
                } catch (parseError) {
                    // If parsing fails, this is likely a non-JSON error response (like HTML error page)
                    azureOpenaiLogger.error('[Request] Azure OpenAI API returned non-JSON error response', {
                        status: response.status,
                        statusText: response.statusText,
                        parseError: parseError.message,
                        apiUrl
                    });
                    
                    // Provide specific guidance for common HTTP errors
                    let errorMessage = `Azure OpenAI API error: ${response.status} - ${response.statusText}`;
                    let errorDetails = { status: response.status, statusText: response.statusText };
                    
                    if (response.status === 405) {
                        errorMessage = `Azure OpenAI API error: Method not allowed (405). This usually indicates an incorrect endpoint URL. Current URL: ${apiUrl}`;
                        errorDetails.troubleshooting = [
                            'Verify your Azure OpenAI endpoint URL',
                            'Ensure the URL format is correct: https://{resource}.openai.azure.com/',
                            'Check your API version parameter',
                            'Verify the deployment name is correct'
                        ];
                    } else if (response.status >= 500) {
                        errorMessage = `Azure OpenAI API server error: ${response.status} - ${response.statusText}`;
                        errorDetails.troubleshooting = ['Azure OpenAI service is experiencing issues', 'Try again later'];
                    }
                    
                    // Re-throw the enhanced error from parseJsonResponse if available
                    if (parseError instanceof EnhancedError) {
                        parseError.message = errorMessage;
                        parseError.errorData = { ...parseError.errorData, ...errorDetails };
                        throw parseError;
                    }
                    
                    // Fallback for unexpected errors
                    throw new EnhancedError(errorMessage, null, errorDetails, response.status);
                }
            }

            if (streamCallback) {
                await OpenAIUtils.handleStream(response, streamCallback, doneCallback, errorCallback, azureOpenaiLogger, 'Azure OpenAI', abortController, url, tabId);
            } else {
                const data = await ApiUtils.parseJsonResponse(response, 'AzureOpenAI');
                const responseText = data.choices[0].message.content;
                doneCallback(responseText);
            }
        } catch (error) {
            // Check if this is a user cancellation - log as info instead of error
            if (error.message === 'Request was cancelled by user') {
                azureOpenaiLogger.info('[Request] Request cancelled by user', {
                    error: error.message,
                    model,
                    deploymentName,
                    apiVersion
                });
            } else {
                azureOpenaiLogger.error('[Request] Azure OpenAI API call failed', {
                    error: error.message,
                    errorType: error.constructor.name,
                    model,
                    deploymentName,
                    apiVersion,
                    stack: error.stack
                });
            }
            errorCallback(error);
        }
    }

    return { execute };
})();