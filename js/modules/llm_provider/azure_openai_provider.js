// Simplified Azure OpenAI Provider Module for LLM Service

const azureOpenaiLogger = logger.createModuleLogger('AzureOpenAIProvider');

var azureOpenaiProvider = (function() {
    
    // Import simplified utilities from BaseProvider
    const { 
        RawError, 
        ParameterUtils, 
        StreamUtils, 
        ApiUtils, 
        OpenAIUtils
    } = BaseProvider;
    
    // Constants
    const DEFAULT_CONFIG = {
        temperature: 1.0,
        max_tokens: 20480,
        apiVersion: '2025-01-01-preview'
    };

    // Normalize parameters
    function normalizeParameters(llmConfig) {
        const normalized = { ...llmConfig };
        
        normalized.temperature = ParameterUtils.normalizeTemperature(normalized.temperature);
        normalized.max_tokens = ParameterUtils.normalizeTokens(normalized.max_tokens);
        normalized.maxTokens = ParameterUtils.normalizeTokens(normalized.maxTokens);
        
        return normalized;
    }

    // Build Azure OpenAI API URL
    function buildApiUrl(endpoint, deploymentName, apiVersion = DEFAULT_CONFIG.apiVersion) {
        if (!endpoint || !deploymentName) {
            throw new Error('Azure endpoint and deploymentName are required');
        }
        return `${endpoint}/openai/deployments/${deploymentName}/chat/completions?api-version=${apiVersion}`;
    }

    // Simplified main execution function
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
        const model = llmConfig.model || deploymentName;
        const maxTokens = llmConfig.maxTokens || llmConfig.max_tokens || DEFAULT_CONFIG.max_tokens;
        const temperature = llmConfig.temperature !== undefined ? llmConfig.temperature : DEFAULT_CONFIG.temperature;
        const apiVersion = llmConfig.apiVersion || DEFAULT_CONFIG.apiVersion;

        // Basic validation
        if (!apiKey) {
            const error = new Error('Azure OpenAI API key is required');
            errorCallback(error);
            return;
        }

        if (!endpoint || !deploymentName) {
            const error = new Error('Azure OpenAI endpoint and deploymentName are required');
            errorCallback(error);
            return;
        }

        try {
            const normalizedConfig = normalizeParameters(llmConfig);
            const apiUrl = buildApiUrl(endpoint, deploymentName, apiVersion);
            const openaiMessages = OpenAIUtils.buildMessages(messages, systemPrompt, imageBase64, model, azureOpenaiLogger);

            const requestBody = {
                model,
                messages: openaiMessages,
                temperature: normalizedConfig.temperature !== undefined ? normalizedConfig.temperature : temperature,
                max_completion_tokens: normalizedConfig.maxTokens || normalizedConfig.max_tokens || maxTokens,
                stream: !!streamCallback
            };

            azureOpenaiLogger.info('[Request] Azure OpenAI API call', {
                url: apiUrl,
                model: requestBody.model,
                deploymentName,
                apiVersion,
                isStreaming: requestBody.stream
            });

            const response = await ApiUtils.simpleFetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify(requestBody)
            }, 'AzureOpenAI', abortController);

            if (!response.ok) {
                await ApiUtils.handleRawError(response, 'AzureOpenAI');
                return;
            }

            if (streamCallback) {
                await OpenAIUtils.handleStream(response, streamCallback, doneCallback, errorCallback, azureOpenaiLogger, 'Azure OpenAI', abortController, url, tabId);
            } else {
                const data = await ApiUtils.getRawResponse(response);
                const responseText = data.choices[0].message.content;
                doneCallback(responseText);
            }
        } catch (error) {
            if (error.message === 'Request was cancelled by user') {
                azureOpenaiLogger.info('[Request] Request cancelled by user');
            } else {
                azureOpenaiLogger.error('[Request] Azure OpenAI API call failed', {
                    error: error.message,
                    model,
                    deploymentName,
                    apiVersion
                });
            }
            errorCallback(error);
        }
    }

    return { execute };
})();