// Gemini Provider Module for LLM Service
// Uses BaseProvider utilities for common functionality

const geminiLogger = logger.createModuleLogger('GeminiProvider');

var geminiProvider = (function() {
    
    // Import utilities from BaseProvider
    const { 
        EnhancedError, 
        ParameterUtils, 
        StreamUtils, 
        ApiUtils, 
        ValidationUtils 
    } = BaseProvider;
    
    // Constants
    const DEFAULT_MODEL = 'gemini-2.5-flash';
    const DEFAULT_CONFIG = {
        temperature: 1.0,
        maxOutputTokens: 8192
    };
    
    // All models now support image input by default

    // Get user-friendly error message based on Gemini API error codes
    // Reference: https://ai.google.dev/gemini-api/docs/troubleshooting
    function getGeminiErrorMessage(status, errorData) {
        const errorCode = errorData?.error?.status || '';
        const originalMessage = errorData?.error?.message || errorData?.message || 'Unknown error';
        
        switch (status) {
            case 400:
                if (errorCode === 'INVALID_ARGUMENT') {
                    return `Request format error: ${originalMessage}. Please check your request parameters and API version compatibility.`;
                } else if (errorCode === 'FAILED_PRECONDITION') {
                    return `Gemini API free tier not available in your region: ${originalMessage}. Please enable billing in Google AI Studio.`;
                }
                return `Bad request (400): ${originalMessage}`;
                
            case 403:
                if (errorCode === 'PERMISSION_DENIED') {
                    return `API key permission denied: ${originalMessage}. Please check your API key permissions or authentication setup.`;
                }
                return `Permission denied (403): ${originalMessage}`;
                
            case 404:
                if (errorCode === 'NOT_FOUND') {
                    return `Resource not found: ${originalMessage}. Please verify all file references and API parameters.`;
                }
                return `Not found (404): ${originalMessage}`;
                
            case 429:
                if (errorCode === 'RESOURCE_EXHAUSTED') {
                    return `Rate limit exceeded: ${originalMessage}. Please reduce request frequency or request a quota increase.`;
                }
                return `Rate limit exceeded (429): ${originalMessage}`;
                
            case 500:
                if (errorCode === 'INTERNAL') {
                    return `Google internal error: ${originalMessage}. Try reducing input size, switching models, or retry later.`;
                }
                return `Internal server error (500): ${originalMessage}`;
                
            case 503:
                if (errorCode === 'UNAVAILABLE') {
                    return `Service temporarily unavailable: ${originalMessage}. Try switching to another model or retry later.`;
                }
                return `Service unavailable (503): ${originalMessage}`;
                
            case 504:
                if (errorCode === 'DEADLINE_EXCEEDED') {
                    return `Request timeout: ${originalMessage}. Try reducing your prompt size or increasing timeout settings.`;
                }
                return `Request timeout (504): ${originalMessage}`;
                
            default:
                return `Gemini API error (${status}): ${originalMessage}`;
        }
    }

    // Handle special finish reasons according to Gemini API documentation
    function getFinishReasonMessage(finishReason) {
        switch (finishReason) {
            case 'STOP':
                return 'Response completed normally';
            case 'MAX_TOKENS':
                return 'Response stopped due to maximum token limit reached';
            case 'SAFETY':
                return 'Response blocked due to safety filters. Try adjusting your prompt to avoid potentially harmful content.';
            case 'RECITATION':
                return 'Response stopped due to recitation concerns. Try making your prompt more unique and increase temperature setting.';
            case 'OTHER':
                return 'Response stopped for other reasons, possibly violating terms of service';
            default:
                return finishReason ? `Response finished with reason: ${finishReason}` : 'Response completed';
        }
    }

    // Helper function to build API URL
    function buildApiUrl(model, apiKey, isStreaming, baseUrl = 'https://generativelanguage.googleapis.com') {
        // Remove trailing slash from baseUrl if present
        const cleanBaseUrl = baseUrl.replace(/\/$/, '');
        const endpoint = isStreaming ? 'streamGenerateContent' : 'generateContent';
        const fullUrl = `${cleanBaseUrl}/v1beta/models/${model}:${endpoint}?key=${apiKey}`;
        // For streaming, add alt=sse parameter as per official documentation
        return isStreaming ? `${fullUrl}&alt=sse` : fullUrl;
    }

    // Helper function to build tools configuration
    function buildToolsConfig(llmConfig) {
        const tools = [];
        
        // Check if tools are configured and enabled
        if (llmConfig.tools && Array.isArray(llmConfig.tools)) {
            llmConfig.tools.forEach(tool => {
                if (tool === 'urlContext') {
                    tools.push({ urlContext: {} });
                } else if (tool === 'googleSearch') {
                    tools.push({ googleSearch: {} });
                }
            });
        }
        
        return tools.length > 0 ? tools : null;
    }

    // Helper function to validate tools configuration
    function validateToolsConfig(llmConfig) {
        if (!llmConfig.tools) return null;
        
        const validTools = ['urlContext', 'googleSearch'];
        const errors = [];
        
        if (!Array.isArray(llmConfig.tools)) {
            errors.push('Tools configuration must be an array');
        } else {
            llmConfig.tools.forEach(tool => {
                if (!validTools.includes(tool)) {
                    errors.push(`Invalid tool: ${tool}. Valid tools are: ${validTools.join(', ')}`);
                }
            });
        }
        
        return errors.length > 0 ? errors : null;
    }

    // Helper function to build request contents with enhanced image handling
    function buildContents(messages, systemPrompt, imageBase64, model) {
        const contents = [];
        
        if (systemPrompt) {
            contents.push({
                role: 'user',
                parts: [{ text: systemPrompt }]
            });
            contents.push({
                role: 'model',
                parts: [{ text: 'I understand. I will analyze the provided content.' }]
            });
        }

        for (const message of messages) {
            const role = message.role === 'assistant' ? 'model' : 'user';
            
            if (role === 'user' && imageBase64 && message === messages[messages.length - 1]) {
                // Validate image data format
                if (!imageBase64.startsWith('data:image/')) {
                    geminiLogger.error('Invalid image format - must be data URL');
                    throw new Error('Invalid image format');
                }

                try {
                    const parts = [];
                    
                    // Add text content or default message
                    if (message.content) {
                        parts.push({ text: message.content });
                    } else {
                        parts.push({ text: 'Please analyze this image.' });
                    }
                    
                    // Extract image data
                    const [header, imageData] = imageBase64.split(',');
                    if (!imageData) {
                        throw new Error('Invalid image data format');
                    }
                    
                    const mimeType = header.split(';')[0].split(':')[1];
                    if (!mimeType || !mimeType.startsWith('image/')) {
                        throw new Error('Invalid image MIME type');
                    }

                    // Log image processing for debugging
                    geminiLogger.info('Processing image with Gemini model', {
                        model,
                        mimeType,
                        imageDataSize: imageData.length,
                        hasText: !!message.content
                    });

                    parts.push({
                        inlineData: {
                            mimeType: mimeType,
                            data: imageData
                        }
                    });
                    
                    contents.push({ role, parts });
                } catch (error) {
                    geminiLogger.error('Error processing image data:', error);
                    throw new Error(`Failed to process image: ${error.message}`);
                }
            } else {
                // Handle text-only messages
                contents.push({
                    role,
                    parts: [{ text: message.content }]
                });
            }
        }
        
        // Log final content structure for debugging
        geminiLogger.info('Built Gemini contents', {
            contentCount: contents.length,
            hasImageContent: contents.some(content => 
                content.parts.some(part => part.inlineData)
            )
        });
        
        return contents;
    }

    // Handle Gemini streaming response using BaseProvider utilities
    async function handleGeminiStream(apiUrl, requestBody, streamCallback, doneCallback, errorCallback, abortController = null, url = null, tabId = null) {
        const monitor = StreamUtils.createStreamMonitor();
        let finishReason = null;
        let fullResponse = '';
        
        geminiLogger.info('[Stream] Starting Gemini stream processing', { 
            timestamp: monitor.startTime,
            apiUrl: apiUrl.substring(0, 100) + '...'
        });

        try {
            const { response } = await ApiUtils.safeFetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            }, 'Gemini', abortController);

            if (!response.ok) {
                await ApiUtils.handleErrorResponse(response, 'Gemini', getGeminiErrorMessage);
                return;
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder('utf-8');
            let buffer = '';

            while (true) {
                // Check if request was aborted
                if (abortController && abortController.signal.aborted) {
                    geminiLogger.info('[Stream] Request was aborted, stopping stream processing');
                    throw new Error('Request was cancelled by user');
                }

                // Additional check for loading state cancellation (fallback safety)
                if (url && tabId && typeof loadingStateCache !== 'undefined') {
                    try {
                        const loadingState = await loadingStateCache.getLoadingState(url, tabId);
                        if (loadingState && loadingState.status === 'cancelled') {
                            geminiLogger.info('[Stream] Loading state is cancelled, stopping stream processing');
                            throw new Error('Request was cancelled by user');
                        }
                    } catch (stateError) {
                        // Don't fail the stream for state check errors, just log
                        geminiLogger.warn('[Stream] Error checking loading state:', stateError.message);
                    }
                }

                const { done, value } = await reader.read();

                if (done) {
                    geminiLogger.info('[Stream] Stream completed normally', { finishReason });
                    break;
                }

                if (!value || value.length === 0) {
                    StreamUtils.updateMonitor(monitor, 0);
                    geminiLogger.warn('[Stream] Empty read from stream', {
                        consecutiveEmptyReads: monitor.consecutiveEmptyReads,
                        timeSinceLastChunk: Date.now() - monitor.startTime
                    });

                    if (StreamUtils.shouldAbortStream(monitor)) {
                        geminiLogger.error('[Stream] Too many consecutive empty reads, aborting stream', {
                            consecutiveEmptyReads: monitor.consecutiveEmptyReads,
                            duration: Date.now() - monitor.startTime
                        });
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
                            geminiLogger.info('[Stream] Received [DONE] signal', { finishReason });
                            doneCallback(fullResponse, finishReason);
                            return;
                        }

                        try {
                            const parsedData = JSON.parse(data);
                            if (parsedData.candidates?.[0]?.content?.parts?.[0]?.text) {
                                const textChunk = parsedData.candidates[0].content.parts[0].text;
                                fullResponse += textChunk;
                                streamCallback(textChunk);
                            } else if (parsedData.candidates?.[0]?.finishReason) {
                                finishReason = parsedData.candidates[0].finishReason;
                                geminiLogger.info('[Stream] Stream finished with reason', {
                                    finishReason,
                                    finishMessage: getFinishReasonMessage(finishReason)
                                });
                            }
                        } catch (parseError) {
                            geminiLogger.error('[Stream] Error parsing stream data:', parseError.message);
                        }
                    }
                }
            }
            
            // Handle case where stream ends without [DONE] signal
            if (fullResponse.length > 0) {
                geminiLogger.warn('[Stream] Stream ended without [DONE] signal, processing accumulated response');
                doneCallback(fullResponse, finishReason);
            } else {
                geminiLogger.error('[Stream] Stream ended with no content received');
                throw new Error('Stream ended without receiving any content');
            }
            
        } catch (error) {
            const streamInfo = {
                error: error.message,
                duration: Date.now() - monitor.startTime,
                finalResponseLength: fullResponse.length,
                consecutiveEmptyReads: monitor.consecutiveEmptyReads
            };

            // Check if this is a user cancellation - log as info instead of error
            if (error.message === 'Request was cancelled by user') {
                geminiLogger.info('[Stream] Request cancelled by user:', streamInfo);
            } else {
                geminiLogger.error('[Stream] Error in Gemini stream processing:', streamInfo);
            }

            errorCallback(error);
        }
    }

    // Normalize parameters using BaseProvider utilities
    function normalizeParameters(llmConfig) {
        const normalized = { ...llmConfig };
        
        normalized.temperature = ParameterUtils.normalizeTemperature(normalized.temperature);
        normalized.maxTokens = ParameterUtils.normalizeTokens(normalized.maxTokens);
        normalized.candidateCount = ParameterUtils.normalizeCount(normalized.candidateCount);
        
        return normalized;
    }

    // Validate model parameters using BaseProvider utilities
    function validateParameters(llmConfig) {
        const errors = [];
        
        // Temperature validation (0.0-1.0)
        const tempError = ParameterUtils.validateNumber(llmConfig.temperature, 'Temperature', 0.0, 1.0);
        if (tempError) errors.push(tempError);
        
        // Max tokens validation (positive integer)
        const tokensError = ParameterUtils.validateNumber(llmConfig.maxTokens, 'maxTokens', 1, null, true);
        if (tokensError) errors.push(tokensError);
        
        // Candidate count validation (1-8 integer)
        const countError = ParameterUtils.validateNumber(llmConfig.candidateCount, 'candidateCount', 1, 8, true);
        if (countError) errors.push(countError);
        
        return errors;
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
        const model = llmConfig.model || DEFAULT_MODEL;
        const maxTokens = llmConfig.maxTokens || DEFAULT_CONFIG.maxOutputTokens;
        const temperature = llmConfig.temperature !== undefined ? llmConfig.temperature : DEFAULT_CONFIG.temperature;

        // Validate API key using BaseProvider utilities
        const keyError = ValidationUtils.validateApiKey(apiKey, 'Gemini');
        if (keyError) {
            errorCallback(keyError);
            return;
        }
        
        // Validate tools configuration
        const toolsErrors = validateToolsConfig(llmConfig);
        if (toolsErrors) {
            errorCallback(new Error(`Tools configuration error: ${toolsErrors.join(', ')}`));
            return;
        }
        
        // Normalize and validate parameters
        const normalizedConfig = normalizeParameters(llmConfig);
        const parameterErrors = validateParameters(normalizedConfig);
        const validationError = ValidationUtils.validateParameters(parameterErrors, normalizedConfig, 'Gemini');
        if (validationError) {
            errorCallback(validationError);
            return;
        }

        geminiLogger.info('[Request] Starting Gemini API call', { model, isStreaming: !!(streamCallback && doneCallback) });

        try {
            const isStreaming = !!(streamCallback && doneCallback);
            const baseUrl = llmConfig.baseUrl || 'https://generativelanguage.googleapis.com';
            const apiUrl = buildApiUrl(model, apiKey, isStreaming, baseUrl);
            const contents = buildContents(messages, systemPrompt, imageBase64, model);
            const tools = buildToolsConfig(llmConfig);
            
            const requestBody = {
                contents,
                generationConfig: {
                    temperature: normalizedConfig.temperature !== undefined ? normalizedConfig.temperature : temperature,
                    maxOutputTokens: normalizedConfig.maxTokens || maxTokens
                }
            };
            
            // Add tools configuration if available
            if (tools) {
                requestBody.tools = tools;
                geminiLogger.info('[Request] Using tools:', tools);
            }

            if (isStreaming) {
                await handleGeminiStream(apiUrl, requestBody, streamCallback, doneCallback, errorCallback, abortController, url, tabId);
            } else {
                const { response } = await ApiUtils.safeFetch(apiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(requestBody)
                }, 'Gemini', abortController);

                if (!response.ok) {
                    await ApiUtils.handleErrorResponse(response, 'Gemini', getGeminiErrorMessage);
                    return;
                }

                const data = await ApiUtils.parseJsonResponse(response, 'Gemini');
                
                // Check for API errors in response body
                if (data.error) {
                    const errorMessage = getGeminiErrorMessage(
                        data.error.code || 'UNKNOWN', 
                        { error: data.error }
                    );
                    throw new EnhancedError(errorMessage, data, data.error, data.error.code || 'UNKNOWN');
                }
                
                // Extract response text and finish reason
                const candidate = data.candidates?.[0];
                if (!candidate) {
                    throw new Error('No candidate response received from Gemini API');
                }
                
                const responseText = candidate.content?.parts?.[0]?.text;
                const finishReason = candidate.finishReason;
                
                if (!responseText) {
                    // Handle case where no text was generated (possibly due to safety filters)
                    const finishMessage = getFinishReasonMessage(finishReason);
                    if (finishReason === 'SAFETY' || finishReason === 'RECITATION' || finishReason === 'OTHER') {
                        throw new Error(`Response generation failed: ${finishMessage}`);
                    }
                    throw new Error('No text content received from Gemini API');
                }
                
                geminiLogger.info('[Request] Gemini non-streaming response received', {
                    responseLength: responseText.length,
                    finishReason,
                    finishMessage: getFinishReasonMessage(finishReason)
                });
                
                // Log warning for problematic finish reasons but still return content
                if (finishReason === 'SAFETY' || finishReason === 'RECITATION' || finishReason === 'OTHER') {
                    geminiLogger.warn('[Request] Response finished with problematic reason', {
                        finishReason,
                        finishMessage: getFinishReasonMessage(finishReason),
                        responsePreview: responseText.substring(0, 200)
                    });
                }
                
                doneCallback(responseText, finishReason);
            }
        } catch (error) {
            // Check if this is a user cancellation - log as info instead of error
            if (error.message === 'Request was cancelled by user') {
                geminiLogger.info('[Request] Request cancelled by user', {
                    error: error.message,
                    model
                });
            } else {
                geminiLogger.error('[Request] Gemini API call failed', {
                    error: error.message,
                    errorType: error.constructor.name,
                    model,
                    stack: error.stack
                });
            }
            errorCallback(error);
        }
    }

    return { execute };
})(); 