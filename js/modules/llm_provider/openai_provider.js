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
        ValidationUtils 
    } = BaseProvider;
    
    // Constants
    const DEFAULT_MODEL = 'gpt-3.5-turbo';
    const DEFAULT_BASE_URL = 'https://api.openai.com';
    const DEFAULT_CONFIG = {
        temperature: 1.0,
        max_tokens: 20480
    };
    const VISION_MODELS = ['gpt-4-vision-preview', 'gpt-4o', 'gpt-4o-mini'];

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
        return `${baseUrl}/v1/chat/completions`;
    }

    // Helper function to build messages array
    function buildMessages(messages, systemPrompt, imageBase64, model) {
        const openaiMessages = [];

        if (systemPrompt) {
            openaiMessages.push({
                role: 'system',
                content: systemPrompt
            });
        }

        for (const message of messages) {
            if (
                message.role === 'user' &&
                imageBase64 &&
                message === messages[messages.length - 1] &&
                VISION_MODELS.includes(model)
            ) {
                openaiMessages.push({
                    role: 'user',
                    content: [
                        { type: 'text', text: message.content },
                        {
                            type: 'image_url',
                            image_url: {
                                url: imageBase64,
                                detail: 'auto'
                            }
                        }
                    ]
                });
            } else {
                openaiMessages.push({
                    role: message.role,
                    content: message.content
                });
            }
        }

        return openaiMessages;
    }

    // Handle OpenAI streaming response using BaseProvider utilities
    async function handleOpenAIStream(response, streamCallback, doneCallback, errorCallback, abortController = null, url = null, tabId = null) {
        const monitor = StreamUtils.createStreamMonitor();
        let finishReason = null;
        
        openaiLogger.info('[Stream] Starting OpenAI stream processing', { 
            timestamp: monitor.startTime,
            responseStatus: response.status,
            contentType: response.headers.get('content-type')
        });

        try {
            const reader = response.body.getReader();
            const decoder = new TextDecoder('utf-8');
            let buffer = '';
            let fullResponse = '';

            while (true) {
                // Check if request was aborted
                if (abortController && abortController.signal.aborted) {
                    openaiLogger.info('[Stream] Request was aborted, stopping stream processing');
                    throw new Error('Request was cancelled by user');
                }

                // Additional check for loading state cancellation (fallback safety)
                if (url && tabId && typeof loadingStateCache !== 'undefined') {
                    try {
                        const loadingState = await loadingStateCache.getLoadingState(url, tabId);
                        if (loadingState && loadingState.status === 'cancelled') {
                            openaiLogger.info('[Stream] Loading state is cancelled, stopping stream processing');
                            throw new Error('Request was cancelled by user');
                        }
                    } catch (stateError) {
                        // Don't fail the stream for state check errors, just log
                        openaiLogger.warn('[Stream] Error checking loading state:', stateError.message);
                    }
                }

                const { done, value } = await reader.read();

                if (done) {
                    const stats = StreamUtils.getStreamStats(monitor, fullResponse);
                    openaiLogger.info('[Stream] Stream completed normally', { ...stats, finishReason });
                    break;
                }

                if (!value || value.length === 0) {
                    StreamUtils.updateMonitor(monitor, 0);
                    openaiLogger.warn('[Stream] Empty read from stream', {
                        consecutiveEmptyReads: monitor.consecutiveEmptyReads,
                        timeSinceLastChunk: Date.now() - monitor.lastChunkTime
                    });

                    if (StreamUtils.shouldAbortStream(monitor)) {
                        openaiLogger.error('[Stream] Too many consecutive empty reads, aborting stream',
                            StreamUtils.getStreamStats(monitor, fullResponse));
                        throw new Error(`Stream interrupted: ${monitor.consecutiveEmptyReads} consecutive empty reads`);
                    }
                    continue;
                }

                StreamUtils.updateMonitor(monitor, value.length);
                const chunk = decoder.decode(value, { stream: true });
                buffer += chunk;

                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data = line.slice(6).trim();
                        if (data === '[DONE]') {
                            const stats = StreamUtils.getStreamStats(monitor, fullResponse);
                            openaiLogger.info('[Stream] Received [DONE] signal', { ...stats, finishReason });
                            doneCallback(fullResponse, finishReason);
                            return;
                        }

                        try {
                            const parsedData = JSON.parse(data);
                            if (parsedData.choices?.[0]?.delta?.content) {
                                const textChunk = parsedData.choices[0].delta.content;
                                fullResponse += textChunk;
                                streamCallback(textChunk);
                            } else if (parsedData.choices?.[0]?.finish_reason) {
                                finishReason = parsedData.choices[0].finish_reason;
                                openaiLogger.info('[Stream] Stream finished with reason', {
                                    finishReason,
                                    totalChunks: monitor.totalChunks,
                                    finalResponseLength: fullResponse.length
                                });
                            }
                        } catch (parseError) {
                            openaiLogger.error('[Stream] Error parsing stream data:', parseError.message);
                        }
                    }
                }
            }
            
            // Handle case where stream ends without [DONE] signal
            if (fullResponse.length > 0) {
                openaiLogger.warn('[Stream] Stream ended without [DONE] signal, processing accumulated response');
                doneCallback(fullResponse, finishReason);
            } else {
                openaiLogger.error('[Stream] Stream ended with no content received');
                throw new Error('Stream ended without receiving any content');
            }
            
        } catch (error) {
            const stats = StreamUtils.getStreamStats(monitor, fullResponse);

            // Check if this is a user cancellation - log as info instead of error
            if (error.message === 'Request was cancelled by user') {
                openaiLogger.info('[Stream] Request cancelled by user:', { error: error.message, ...stats });
            } else {
                openaiLogger.error('[Stream] Error in OpenAI stream processing:', { error: error.message, ...stats });
            }

            errorCallback(error);
        }
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

        // Normalize parameters
        const normalizedConfig = normalizeParameters(llmConfig);

        openaiLogger.info('[Request] Starting OpenAI API call', { model, isStreaming: !!streamCallback });

        try {
            const apiUrl = buildApiUrl(baseUrl);
            const openaiMessages = buildMessages(messages, systemPrompt, imageBase64, model);

            const requestBody = {
                model,
                messages: openaiMessages,
                temperature: normalizedConfig.temperature !== undefined ? normalizedConfig.temperature : temperature,
                max_tokens: normalizedConfig.maxTokens || normalizedConfig.max_tokens || maxTokens,
                stream: !!streamCallback
            };

            openaiLogger.info('[Request] Sending request to OpenAI', {
                apiUrl,
                model,
                maxTokens: requestBody.max_tokens,
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
            }, 'OpenAI', abortController);

            if (!response.ok) {
                // Custom error handler for OpenAI
                const errorData = await ApiUtils.parseJsonResponse(response, 'OpenAI');
                const errorMessage = `OpenAI API error: ${response.status} - ${JSON.stringify(errorData)}`;
                openaiLogger.error('[Request] OpenAI API returned error', {
                    status: response.status,
                    statusText: response.statusText,
                    errorData
                });
                throw new EnhancedError(errorMessage, response, errorData, response.status);
            }

            if (streamCallback) {
                openaiLogger.info('[Request] Processing streaming response');
                await handleOpenAIStream(response, streamCallback, doneCallback, errorCallback, abortController, url, tabId);
            } else {
                openaiLogger.info('[Request] Processing non-streaming response');
                const data = await ApiUtils.parseJsonResponse(response, 'OpenAI');
                const responseText = data.choices[0].message.content;
                openaiLogger.info('[Request] Non-streaming response received', {
                    responseLength: responseText?.length || 0
                });
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