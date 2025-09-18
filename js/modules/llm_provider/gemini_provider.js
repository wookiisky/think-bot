// Simplified Gemini Provider Module for LLM Service

const geminiLogger = logger.createModuleLogger('GeminiProvider');

var geminiProvider = (function() {
    
    // Import simplified utilities from BaseProvider
    const { 
        RawError, 
        ParameterUtils, 
        StreamUtils, 
        ApiUtils
    } = BaseProvider;
    
    // Constants
    const DEFAULT_MODEL = 'gemini-2.5-flash';
    const DEFAULT_CONFIG = {
        temperature: 1.0,
        maxOutputTokens: 8192
    };

    // Build API URL
    function buildApiUrl(model, apiKey, isStreaming, baseUrl = 'https://generativelanguage.googleapis.com') {
        const cleanBaseUrl = baseUrl.replace(/\/$/, '');
        const endpoint = isStreaming ? 'streamGenerateContent' : 'generateContent';
        const fullUrl = `${cleanBaseUrl}/v1beta/models/${model}:${endpoint}?key=${apiKey}`;
        return isStreaming ? `${fullUrl}&alt=sse` : fullUrl;
    }

    // Build tools configuration
    function buildToolsConfig(llmConfig) {
        const tools = [];
        
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

    // Build request contents with image support
    function buildContents(messages, systemPrompt, imageBase64, model) {
        const contents = [];
        
        // Add system prompt if provided
        const systemPromptText = (systemPrompt ?? '').toString();
        if (systemPromptText.trim().length > 0) {
            contents.push({
                role: 'user',
                parts: [{ text: systemPromptText }]
            });
            contents.push({
                role: 'model',
                parts: [{ text: 'I understand. I will analyze the provided content.' }]
            });
        }

        const isLastIndex = (idx, arr) => idx === arr.length - 1;

        for (let i = 0; i < messages.length; i++) {
            const message = messages[i] || {};
            const role = message.role === 'assistant' ? 'model' : 'user';
            const messageText = (message.content ?? '').toString();

            // Handle image for last user message
            if (role === 'user' && imageBase64 && isLastIndex(i, messages)) {
                if (typeof imageBase64 !== 'string' || !imageBase64.startsWith('data:image/')) {
                    throw new Error('Invalid image format');
                }

                const parts = [];
                parts.push({ text: messageText.trim().length > 0 ? messageText : 'Please analyze this image.' });

                // Extract image data
                const [header, imageData] = imageBase64.split(',');
                if (!imageData || imageData.trim().length === 0) {
                    throw new Error('Invalid image data format');
                }

                const mimeType = (header || '').split(';')[0].split(':')[1];
                if (!mimeType || !mimeType.startsWith('image/')) {
                    throw new Error('Invalid image MIME type');
                }

                parts.push({
                    inlineData: {
                        mimeType: mimeType,
                        data: imageData
                    }
                });

                contents.push({ role, parts });
            } else {
                // Skip empty messages
                if (messageText.trim().length === 0) {
                    continue;
                }
                contents.push({
                    role,
                    parts: [{ text: messageText }]
                });
            }
        }
        
        return contents;
    }

    // Simplified Gemini stream handler
    async function handleGeminiStream(apiUrl, requestBody, streamCallback, doneCallback, errorCallback, abortController = null, url = null, tabId = null) {
        const monitor = StreamUtils.createStreamMonitor();
        let finishReason = null;
        let fullResponse = '';

        try {
            const response = await ApiUtils.simpleFetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            }, 'Gemini', abortController);

            if (!response.ok) {
                await ApiUtils.handleRawError(response, 'Gemini');
                return;
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder('utf-8');
            let buffer = '';

            while (true) {
                // Check abort conditions
                if (abortController && abortController.signal.aborted) {
                    throw new Error('Request was cancelled by user');
                }

                if (url && tabId && typeof loadingStateCache !== 'undefined') {
                    try {
                        const loadingState = await loadingStateCache.getLoadingState(url, tabId);
                        if (loadingState && loadingState.status === 'cancelled') {
                            throw new Error('Request was cancelled by user');
                        }
                    } catch (stateError) {
                        // Ignore state check errors
                    }
                }

                const { done, value } = await reader.read();

                if (done) break;

                if (!value || value.length === 0) {
                    StreamUtils.updateMonitor(monitor, 0);
                    if (StreamUtils.shouldAbortStream(monitor)) {
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
                            }
                        } catch (parseError) {
                            // Ignore parsing errors
                        }
                    }
                }
            }
            
            // Stream ended
            if (fullResponse.length > 0) {
                doneCallback(fullResponse, finishReason);
            } else {
                throw new Error('Stream ended without receiving any content');
            }
            
        } catch (error) {
            if (error.message === 'Request was cancelled by user') {
                geminiLogger.info('[Stream] Request cancelled by user');
            } else {
                geminiLogger.error('[Stream] Gemini stream error:', error.message);
            }

            errorCallback(error);
        }
    }

    // Normalize parameters
    function normalizeParameters(llmConfig) {
        const normalized = { ...llmConfig };
        
        normalized.temperature = ParameterUtils.normalizeTemperature(normalized.temperature);
        normalized.maxTokens = ParameterUtils.normalizeTokens(normalized.maxTokens);
        normalized.candidateCount = ParameterUtils.normalizeCount(normalized.candidateCount);
        
        return normalized;
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
        const model = llmConfig.model || DEFAULT_MODEL;
        const maxTokens = llmConfig.maxTokens || DEFAULT_CONFIG.maxOutputTokens;
        const temperature = llmConfig.temperature !== undefined ? llmConfig.temperature : DEFAULT_CONFIG.temperature;

        // Basic API key validation
        if (!apiKey) {
            const error = new Error('Gemini API key is required');
            errorCallback(error);
            return;
        }

        try {
            const normalizedConfig = normalizeParameters(llmConfig);
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
            
            // Add tools if available
            if (tools) {
                requestBody.tools = tools;
            }
            
            // Add thinking config if available
            if (llmConfig.thinkingBudget !== undefined && llmConfig.thinkingBudget !== null) {
                requestBody.thinkingConfig = {
                    thinkingBudget: llmConfig.thinkingBudget
                };
            }

            geminiLogger.info('[Request] Gemini API call', {
                url: apiUrl,
                model,
                isStreaming
            });

            if (isStreaming) {
                await handleGeminiStream(apiUrl, requestBody, streamCallback, doneCallback, errorCallback, abortController, url, tabId);
            } else {
                const response = await ApiUtils.simpleFetch(apiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(requestBody)
                }, 'Gemini', abortController);

                if (!response.ok) {
                    await ApiUtils.handleRawError(response, 'Gemini');
                    return;
                }

                const data = await ApiUtils.getRawResponse(response);
                
                // Check for API errors in response body
                if (data.error) {
                    throw new RawError('Gemini API error', data.error, data.error.code || 'UNKNOWN');
                }
                
                // Extract response text
                const candidate = data.candidates?.[0];
                if (!candidate) {
                    throw new Error('No candidate response received from Gemini API');
                }
                
                const responseText = candidate.content?.parts?.[0]?.text;
                const finishReason = candidate.finishReason;
                
                if (!responseText) {
                    throw new Error('No text content received from Gemini API');
                }
                
                doneCallback(responseText, finishReason);
            }
        } catch (error) {
            if (error.message === 'Request was cancelled by user') {
                geminiLogger.info('[Request] Request cancelled by user');
            } else {
                geminiLogger.error('[Request] Gemini API call failed', {
                    error: error.message,
                    model
                });
            }
            errorCallback(error);
        }
    }

    return { execute };
})(); 