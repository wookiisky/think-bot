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

        azureOpenaiLogger.info('[Request] Starting Azure OpenAI API call', { 
            model, 
            deploymentName, 
            apiVersion,
            isStreaming: !!streamCallback 
        });

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

            azureOpenaiLogger.info('[Request] Sending request to Azure OpenAI', {
                apiUrl,
                model,
                deploymentName,
                apiVersion,
                maxTokens: requestBody.max_completion_tokens,
                temperature: requestBody.temperature,
                messageCount: openaiMessages.length,
                requestBodySize: JSON.stringify(requestBody).length,
                isStreaming: !!streamCallback
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
                // Custom error handler for Azure OpenAI
                const errorData = await ApiUtils.parseJsonResponse(response, 'AzureOpenAI');
                const errorMessage = `Azure OpenAI API error: ${response.status} - ${JSON.stringify(errorData)}`;
                const errorText = JSON.stringify(errorData);
                azureOpenaiLogger.error('[Request] Azure OpenAI API returned error', {
                    status: response.status,
                    statusText: response.statusText,
                    errorData
                });
                throw new EnhancedError(errorMessage, errorText, errorData, response.status);
            }

            if (streamCallback) {
                azureOpenaiLogger.info('[Request] Processing streaming response');
                await OpenAIUtils.handleStream(response, streamCallback, doneCallback, errorCallback, azureOpenaiLogger, 'Azure OpenAI', abortController, url, tabId);
            } else {
                azureOpenaiLogger.info('[Request] Processing non-streaming response');
                const data = await ApiUtils.parseJsonResponse(response, 'AzureOpenAI');
                const responseText = data.choices[0].message.content;
                azureOpenaiLogger.info('[Request] Non-streaming response received', {
                    responseLength: responseText?.length || 0
                });
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