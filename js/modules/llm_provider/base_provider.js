// Simplified Base Provider Module for LLM Service
// Contains essential functionality shared across all LLM providers

const baseProviderLogger = logger.createModuleLogger('BaseProvider');

var BaseProvider = (function() {
    
    // Simple error class for raw response data
    class RawError extends Error {
        constructor(message, rawResponse = null, status = null) {
            super(message);
            this.name = 'RawError';
            this.rawResponse = rawResponse;
            this.errorData = null; // For compatibility with error handler
            this.status = status;
            this.timestamp = Date.now();
        }
    }
    
    // Basic parameter utilities
    const ParameterUtils = {
        normalizeTemperature(value) {
            if (value === undefined || value === null) return value;
            const temp = parseFloat(value);
            return !isNaN(temp) ? temp : value;
        },
        
        normalizeTokens(value) {
            if (value === undefined || value === null) return value;
            const tokens = parseInt(value, 10);
            return !isNaN(tokens) ? tokens : value;
        },
        
        normalizeCount(value) {
            if (value === undefined || value === null) return value;
            const count = parseInt(value, 10);
            return !isNaN(count) ? count : value;
        }
    };
    
    // Stream processing utilities
    const StreamUtils = {
        createStreamMonitor() {
            return {
                startTime: Date.now(),
                consecutiveEmptyReads: 0,
                MAX_EMPTY_READS: 50
            };
        },
        
        updateMonitor(monitor, chunkSize = 0) {
            if (chunkSize > 0) {
                monitor.consecutiveEmptyReads = 0;
            } else {
                monitor.consecutiveEmptyReads++;
            }
            return monitor;
        },
        
        shouldAbortStream(monitor) {
            return monitor.consecutiveEmptyReads >= monitor.MAX_EMPTY_READS;
        }
    };
    
    // Simplified API utilities
    const ApiUtils = {
        // Basic fetch with minimal error handling
        async simpleFetch(url, options, providerName, abortController = null, retryOptions = {}) {
            const { maxRetries = 1, retryDelayMs = 300 } = retryOptions;
            const totalAttempts = Math.max(1, maxRetries + 1);
            const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
            const urlDetails = (() => {
                try {
                    const parsed = new URL(url);
                    return {
                        host: parsed.host,
                        pathname: parsed.pathname
                    };
                } catch (error) {
                    return {
                        host: 'unknown',
                        pathname: 'unknown'
                    };
                }
            })();

            let lastError = null;

            for (let attemptIndex = 0; attemptIndex < totalAttempts; attemptIndex++) {
                const attempt = attemptIndex + 1;
                const startTime = Date.now();
                try {
                    const fetchOptions = abortController && abortController.signal ?
                        { ...options, signal: abortController.signal } :
                        options;

                    const response = await fetch(url, fetchOptions);
                    const duration = Date.now() - startTime;

                    const responseLog = {
                        status: response.status,
                        duration,
                        attempt,
                        totalAttempts,
                        url,
                        host: urlDetails.host
                    };

                    baseProviderLogger.info(`[${providerName}] API response`, responseLog);

                    const shouldRetryResponse = response.status >= 500 && attempt < totalAttempts;
                    if (shouldRetryResponse) {
                        baseProviderLogger.warn(`[${providerName}] Retrying after server response`, {
                            ...responseLog,
                            pathname: urlDetails.pathname
                        });
                        await wait(retryDelayMs);
                        continue;
                    }

                    return response;
                } catch (error) {
                    const duration = Date.now() - startTime;
                    const errorInfo = {
                        message: error.message,
                        name: error.name,
                        type: error.type || error.constructor?.name,
                        stack: error.stack ? error.stack.split('\n')[0] : undefined,
                        attempt,
                        totalAttempts,
                        url,
                        host: urlDetails.host,
                        pathname: urlDetails.pathname,
                        duration
                    };

                    if (error.name === 'AbortError') {
                        baseProviderLogger.info(`[${providerName}] Request aborted`, errorInfo);
                        throw new Error('Request was cancelled by user');
                    }

                    baseProviderLogger.error(`[${providerName}] Request failed`, errorInfo);

                    lastError = error;

                    const isNetworkError = error.name === 'TypeError' || error instanceof TypeError;
                    const shouldRetryError = attempt < totalAttempts && isNetworkError;

                    if (shouldRetryError) {
                        await wait(retryDelayMs);
                        continue;
                    }

                    break;
                }
            }

            if (lastError) {
                lastError.attempts = totalAttempts;
                throw lastError;
            }

            throw new Error(`${providerName} request failed without specific error`);
        },
        
        // Return raw response data without conversion
        async getRawResponse(response) {
            try {
                const text = await response.text();
                // Try to parse as JSON, but return raw text if it fails
                try {
                    return JSON.parse(text);
                } catch {
                    return text;
                }
            } catch (error) {
                throw new Error(`Failed to read response: ${error.message}`);
            }
        },
        
        // Handle error response with raw data
        async handleRawError(response, providerName) {
            const rawResponse = await this.getRawResponse(response);
            
            baseProviderLogger.error(`[${providerName}] API error`, {
                status: response.status,
                statusText: response.statusText,
                response: typeof rawResponse === 'string' ? 
                    rawResponse.substring(0, 500) : rawResponse
            });
            
            // Return raw response directly
            throw new RawError(
                `${providerName} API error (${response.status})`,
                rawResponse,
                response.status
            );
        }
    };
    
    // Simplified OpenAI-compatible utilities
    const OpenAIUtils = {
        // Build OpenAI messages with basic image support
        buildMessages(messages, systemPrompt, imageBase64, model, logger) {
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
                    message === messages[messages.length - 1]
                ) {
                    if (!imageBase64.startsWith('data:image/')) {
                        throw new Error('Invalid image format');
                    }

                    openaiMessages.push({
                        role: 'user',
                        content: [
                            { type: 'text', text: message.content || 'Please analyze this image.' },
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
        },

        // Simplified stream handler
        async handleStream(response, streamCallback, doneCallback, errorCallback, logger, providerName = 'OpenAI', abortController = null, url = null, tabId = null) {
            const monitor = StreamUtils.createStreamMonitor();
            let finishReason = null;
            let fullResponse = '';

            try {
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
                                if (parsedData.choices?.[0]?.delta?.content) {
                                    const textChunk = parsedData.choices[0].delta.content;
                                    fullResponse += textChunk;
                                    streamCallback(textChunk);
                                } else if (parsedData.choices?.[0]?.finish_reason) {
                                    finishReason = parsedData.choices[0].finish_reason;
                                }
                            } catch (parseError) {
                                // Try to handle concatenated JSON
                                if (data.includes('}{')) {
                                    try {
                                        const fixedData = '[' + data.replace(/}{/g, '},{') + ']';
                                        const parsedArray = JSON.parse(fixedData);
                                        
                                        for (const parsedData of parsedArray) {
                                            if (parsedData.choices?.[0]?.delta?.content) {
                                                const textChunk = parsedData.choices[0].delta.content;
                                                fullResponse += textChunk;
                                                streamCallback(textChunk);
                                            } else if (parsedData.choices?.[0]?.finish_reason) {
                                                finishReason = parsedData.choices[0].finish_reason;
                                            }
                                        }
                                    } catch (arrayParseError) {
                                        // Ignore parsing errors
                                    }
                                }
                            }
                        }
                    }
                }
                
                // Stream ended without [DONE]
                if (fullResponse.length > 0) {
                    doneCallback(fullResponse, finishReason);
                } else {
                    throw new Error('Stream ended without receiving any content');
                }
                
            } catch (error) {
                if (error.message === 'Request was cancelled by user') {
                    logger.info('[Stream] Request cancelled by user');
                } else {
                    logger.error(`[Stream] ${providerName} stream error:`, error.message);
                }

                errorCallback(error);
            }
        }
    };

    // Export simplified utilities
    return {
        RawError,
        ParameterUtils,
        StreamUtils,
        ApiUtils,
        OpenAIUtils,
        logger: baseProviderLogger
    };
})(); 