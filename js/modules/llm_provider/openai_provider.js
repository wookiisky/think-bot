// Simplified OpenAI Provider Module for LLM Service

const openaiLogger = logger.createModuleLogger('OpenAIProvider');

var openaiProvider = (function() {
    
    // Import simplified utilities from BaseProvider
    const { 
        RawError, 
        ParameterUtils, 
        StreamUtils, 
        ApiUtils, 
        OpenAIUtils
    } = BaseProvider;
    
    // Constants
    const DEFAULT_MODEL = 'gpt-3.5-turbo';
    const DEFAULT_BASE_URL = 'https://api.openai.com';
    const DEFAULT_CONFIG = {
        temperature: 1.0,
        max_tokens: 20480
    };

    // Normalize parameters
    function normalizeParameters(llmConfig) {
        const normalized = { ...llmConfig };
        
        normalized.temperature = ParameterUtils.normalizeTemperature(normalized.temperature);
        normalized.max_tokens = ParameterUtils.normalizeTokens(normalized.max_tokens);
        normalized.maxTokens = ParameterUtils.normalizeTokens(normalized.maxTokens);
        
        return normalized;
    }

    // Build API URL
    function buildApiUrl(baseUrl) {
        const cleanBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
        return `${cleanBaseUrl}/v1/chat/completions`;
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
        const baseUrl = llmConfig.baseUrl || DEFAULT_BASE_URL;
        const model = llmConfig.model || DEFAULT_MODEL;
        const maxTokens = llmConfig.maxTokens || llmConfig.max_tokens || DEFAULT_CONFIG.max_tokens;
        const temperature = llmConfig.temperature !== undefined ? llmConfig.temperature : DEFAULT_CONFIG.temperature;

        // Basic API key validation
        if (!apiKey) {
            const error = new Error('OpenAI API key is required');
            errorCallback(error);
            return;
        }

        // Basic URL validation
        try {
            new URL(baseUrl);
        } catch (urlError) {
            const error = new Error(`Invalid OpenAI base URL: ${baseUrl}`);
            errorCallback(error);
            return;
        }

        try {
            const normalizedConfig = normalizeParameters(llmConfig);
            const apiUrl = buildApiUrl(baseUrl);
            const openaiMessages = OpenAIUtils.buildMessages(messages, systemPrompt, imageBase64, model, openaiLogger);

            const requestBody = {
                model,
                messages: openaiMessages,
                temperature: normalizedConfig.temperature !== undefined ? normalizedConfig.temperature : temperature,
                max_tokens: normalizedConfig.maxTokens || normalizedConfig.max_tokens || maxTokens,
                stream: !!streamCallback
            };

            openaiLogger.info('[Request] OpenAI API call', {
                url: apiUrl,
                model: requestBody.model,
                isStreaming: requestBody.stream
            });

            const response = await ApiUtils.simpleFetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify(requestBody)
            }, 'OpenAI', abortController);

            if (!response.ok) {
                await ApiUtils.handleRawError(response, 'OpenAI');
                return;
            }

            if (streamCallback) {
                await OpenAIUtils.handleStream(response, streamCallback, doneCallback, errorCallback, openaiLogger, 'OpenAI', abortController, url, tabId);
            } else {
                const data = await ApiUtils.getRawResponse(response);
                const responseText = data.choices[0].message.content;
                doneCallback(responseText);
            }
        } catch (error) {
            if (error.message === 'Request was cancelled by user') {
                openaiLogger.info('[Request] Request cancelled by user');
            } else {
                openaiLogger.error('[Request] OpenAI API call failed', {
                    error: error.message,
                    model,
                    baseUrl
                });
            }
            errorCallback(error);
        }
    }

    return { execute };
})(); 