// Base Provider Module for LLM Service
// Contains common functionality shared across all LLM providers

const baseProviderLogger = logger.createModuleLogger('BaseProvider');

var BaseProvider = (function() {
    
    // Enhanced Error class to include raw response data
    class EnhancedError extends Error {
        constructor(message, rawResponse = null, errorData = null, status = null) {
            super(message);
            this.name = 'EnhancedError';
            this.rawResponse = rawResponse;
            this.errorData = errorData;
            this.status = status;
            this.timestamp = Date.now();
        }
    }
    
    // Common parameter normalization utilities
    const ParameterUtils = {
        // Convert string numbers to actual numbers for temperature
        normalizeTemperature(value) {
            if (value === undefined || value === null) return value;
            const temp = parseFloat(value);
            return !isNaN(temp) ? temp : value;
        },
        
        // Convert string numbers to actual numbers for token limits
        normalizeTokens(value) {
            if (value === undefined || value === null) return value;
            const tokens = parseInt(value, 10);
            return !isNaN(tokens) ? tokens : value;
        },
        
        // Convert string numbers to actual numbers for count parameters
        normalizeCount(value) {
            if (value === undefined || value === null) return value;
            const count = parseInt(value, 10);
            return !isNaN(count) ? count : value;
        },
        
        // Generic parameter validation
        validateNumber(value, name, min = null, max = null, mustBeInteger = false) {
            if (value === undefined || value === null) return null;
            
            if (typeof value !== 'number' || isNaN(value)) {
                return `${name} must be a number (received: ${value}, type: ${typeof value})`;
            }
            
            if (mustBeInteger && !Number.isInteger(value)) {
                return `${name} must be an integer (received: ${value})`;
            }
            
            if (min !== null && value < min) {
                return `${name} must be >= ${min} (received: ${value})`;
            }
            
            if (max !== null && value > max) {
                return `${name} must be <= ${max} (received: ${value})`;
            }
            
            return null;
        }
    };
    
    // Common stream processing utilities
    const StreamUtils = {
        // Create a simplified stream monitor for safety checks only
        createStreamMonitor() {
            return {
                startTime: Date.now(),
                consecutiveEmptyReads: 0,
                MAX_EMPTY_READS: 50
            };
        },
        
        // Update empty read counter
        updateMonitor(monitor, chunkSize = 0) {
            if (chunkSize > 0) {
                monitor.consecutiveEmptyReads = 0;
            } else {
                monitor.consecutiveEmptyReads++;
            }
            return monitor;
        },
        
        // Check if stream should be aborted due to empty reads
        shouldAbortStream(monitor) {
            return monitor.consecutiveEmptyReads >= monitor.MAX_EMPTY_READS;
        }
    };
    
    // Common API call utilities
    const ApiUtils = {
        // Generic fetch with error handling
        async safeFetch(url, options, providerName, abortController = null) {
            const startTime = Date.now();
            try {
                // Add abort signal if provided
                const fetchOptions = abortController ?
                    { ...options, signal: abortController.signal } :
                    options;

                const response = await fetch(url, fetchOptions);
                const duration = Date.now() - startTime;

                baseProviderLogger.info(`[${providerName}] API response received`, {
                    status: response.status,
                    statusText: response.statusText,
                    duration,
                    contentType: response.headers.get('content-type'),
                    contentLength: response.headers.get('content-length'),
                    hasAbortController: !!abortController
                });

                return { response, duration };
            } catch (error) {
                const duration = Date.now() - startTime;

                // Check if error is due to abort
                if (error.name === 'AbortError') {
                    baseProviderLogger.info(`[${providerName}] API request aborted`, {
                        duration,
                        url: url.substring(0, 100) + '...'
                    });
                    throw new Error('Request was cancelled by user');
                }

                baseProviderLogger.error(`[${providerName}] API request failed`, {
                    error: error.message,
                    duration,
                    url: url.substring(0, 100) + '...' // Truncate for security
                });
                throw error;
            }
        },
        
        // Parse JSON response with error handling
        async parseJsonResponse(response, providerName) {
            try {
                return await response.json();
            } catch (error) {
                baseProviderLogger.error(`[${providerName}] Failed to parse JSON response`, {
                    error: error.message,
                    status: response.status,
                    contentType: response.headers.get('content-type')
                });
                throw new Error(`Failed to parse ${providerName} API response as JSON: ${error.message}`);
            }
        },
        
        // Handle non-OK responses
        async handleErrorResponse(response, providerName, errorMessageExtractor) {
            let errorData = null;
            let errorText = '';
            
            try {
                errorText = await response.text();
                errorData = JSON.parse(errorText);
            } catch (parseError) {
                errorData = { message: errorText };
            }
            
            const userMessage = errorMessageExtractor ? 
                errorMessageExtractor(response.status, errorData) : 
                `${providerName} API error (${response.status}): ${errorData?.message || errorText}`;
            
            baseProviderLogger.error(`[${providerName}] API error response`, {
                status: response.status,
                statusText: response.statusText,
                errorText: errorText.substring(0, 500) + (errorText.length > 500 ? '...' : ''),
                userMessage
            });
            
            throw new EnhancedError(userMessage, errorText, errorData, response.status);
        }
    };
    
    // Common validation utilities
    const ValidationUtils = {
        // Validate required API key
        validateApiKey(apiKey, providerName) {
            if (!apiKey) {
                const error = new Error(`${providerName} API key is required`);
                baseProviderLogger.error(error.message);
                return error;
            }
            return null;
        },
        
        // Validate and log parameter errors
        validateParameters(errors, config, providerName) {
            if (errors.length > 0) {
                const error = new Error(`Invalid parameters: ${errors.join('; ')}`);
                baseProviderLogger.error(`[${providerName}] Parameter validation failed:`, errors.join('; '));
                return error;
            }
            return null;
        }
    };
    
    // Base Provider class that other providers can extend
    class Provider {
        constructor(name, defaultConfig = {}) {
            this.name = name;
            this.defaultConfig = defaultConfig;
            this.logger = logger.createModuleLogger(name);
        }
        
        // Template method pattern - subclasses must implement these
        buildApiUrl(config, isStreaming) {
            throw new Error(`${this.name} provider must implement buildApiUrl method`);
        }
        
        buildRequestBody(messages, config, systemPrompt, imageBase64) {
            throw new Error(`${this.name} provider must implement buildRequestBody method`);
        }
        
        handleStreamChunk(chunk, monitor, streamCallback) {
            throw new Error(`${this.name} provider must implement handleStreamChunk method`);
        }
        
        extractResponse(data) {
            throw new Error(`${this.name} provider must implement extractResponse method`);
        }
        
        // Common execution flow that subclasses can use
        async executeCommon(
            messages,
            llmConfig,
            systemPrompt,
            imageBase64,
            streamCallback,
            doneCallback,
            errorCallback,
            {
                normalizeConfig,
                validateConfig,
                getErrorMessage
            },
            abortController = null
        ) {
            try {
                // Validate API key
                const keyError = ValidationUtils.validateApiKey(llmConfig.apiKey, this.name);
                if (keyError) {
                    errorCallback(keyError);
                    return;
                }
                
                // Normalize and validate configuration
                const normalizedConfig = normalizeConfig ? normalizeConfig(llmConfig) : llmConfig;
                if (validateConfig) {
                    const paramErrors = validateConfig(normalizedConfig);
                    const validationError = ValidationUtils.validateParameters(paramErrors, normalizedConfig, this.name);
                    if (validationError) {
                        errorCallback(validationError);
                        return;
                    }
                }
                
                this.logger.info('[Request] Starting API call', { 
                    model: normalizedConfig.model || this.defaultConfig.model,
                    isStreaming: !!(streamCallback && doneCallback) 
                });
                
                const isStreaming = !!(streamCallback && doneCallback);
                const apiUrl = this.buildApiUrl(normalizedConfig, isStreaming);
                const requestBody = this.buildRequestBody(messages, normalizedConfig, systemPrompt, imageBase64);

                if (isStreaming) {
                    await this.handleStreaming(apiUrl, requestBody, streamCallback, doneCallback, errorCallback, getErrorMessage, abortController);
                } else {
                    await this.handleNonStreaming(apiUrl, requestBody, doneCallback, errorCallback, getErrorMessage, abortController);
                }
                
            } catch (error) {
                this.logger.error('[Request] API call failed', {
                    error: error.message,
                    errorType: error.constructor.name,
                    stack: error.stack
                });
                errorCallback(error);
            }
        }
        
        // Common non-streaming handler
        async handleNonStreaming(apiUrl, requestBody, doneCallback, errorCallback, getErrorMessage, abortController = null) {
            const { response } = await ApiUtils.safeFetch(apiUrl, {
                method: 'POST',
                headers: this.getHeaders(),
                body: JSON.stringify(requestBody)
            }, this.name, abortController);

            if (!response.ok) {
                await ApiUtils.handleErrorResponse(response, this.name, getErrorMessage);
                return;
            }

            const data = await ApiUtils.parseJsonResponse(response, this.name);
            const { responseText, finishReason } = this.extractResponse(data);

            this.logger.info('[Request] Non-streaming response received', {
                responseLength: responseText?.length || 0,
                finishReason
            });

            doneCallback(responseText, finishReason);
        }
        
        // Override in subclasses for custom headers
        getHeaders() {
            return { 'Content-Type': 'application/json' };
        }
    }
    
    // Common OpenAI-compatible utilities (shared between OpenAI and Azure OpenAI)
    const OpenAIUtils = {
        // Build OpenAI-compatible messages array with image support
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
                    // Validate image data format
                    if (!imageBase64.startsWith('data:image/')) {
                        logger.error('Invalid image format - must be data URL');
                        throw new Error('Invalid image format');
                    }

                    // Log image processing for debugging
                    logger.info('Processing image with model', {
                        model,
                        imageSize: imageBase64.length,
                        hasText: !!message.content
                    });

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
                    // Handle text-only messages
                    openaiMessages.push({
                        role: message.role,
                        content: message.content
                    });
                }
            }

            // Log final message structure for debugging
            logger.info('Built OpenAI-compatible messages', {
                messageCount: openaiMessages.length,
                hasImageContent: openaiMessages.some(msg => 
                    Array.isArray(msg.content) && 
                    msg.content.some(content => content.type === 'image_url')
                )
            });

            return openaiMessages;
        },

        // Handle OpenAI-compatible streaming response
        async handleStream(response, streamCallback, doneCallback, errorCallback, logger, providerName = 'OpenAI', abortController = null, url = null, tabId = null) {
            const monitor = StreamUtils.createStreamMonitor();
            let finishReason = null;
            
            logger.info('[Stream] Starting stream processing', { 
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
                        logger.info('[Stream] Request was aborted, stopping stream processing');
                        throw new Error('Request was cancelled by user');
                    }

                    // Additional check for loading state cancellation (fallback safety)
                    if (url && tabId && typeof loadingStateCache !== 'undefined') {
                        try {
                            const loadingState = await loadingStateCache.getLoadingState(url, tabId);
                            if (loadingState && loadingState.status === 'cancelled') {
                                logger.info('[Stream] Loading state is cancelled, stopping stream processing');
                                throw new Error('Request was cancelled by user');
                            }
                        } catch (stateError) {
                            // Don't fail the stream for state check errors, just log
                            logger.warn('[Stream] Error checking loading state:', stateError.message);
                        }
                    }

                    const { done, value } = await reader.read();

                    if (done) {
                        logger.info('[Stream] Stream completed normally', { finishReason });
                        break;
                    }

                    if (!value || value.length === 0) {
                        StreamUtils.updateMonitor(monitor, 0);
                        logger.warn('[Stream] Empty read from stream', {
                            consecutiveEmptyReads: monitor.consecutiveEmptyReads,
                            timeSinceLastChunk: Date.now() - monitor.startTime
                        });

                        if (StreamUtils.shouldAbortStream(monitor)) {
                            logger.error('[Stream] Too many consecutive empty reads, aborting stream', {
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
                                logger.info('[Stream] Received [DONE] signal', { finishReason });
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
                                    logger.info('[Stream] Stream finished with reason', {
                                        finishReason,
                                        finalResponseLength: fullResponse.length
                                    });
                                }
                            } catch (parseError) {
                                logger.error('[Stream] Error parsing stream data:', parseError.message);
                            }
                        }
                    }
                }
                
                // Handle case where stream ends without [DONE] signal
                if (fullResponse.length > 0) {
                    logger.warn('[Stream] Stream ended without [DONE] signal, processing accumulated response');
                    doneCallback(fullResponse, finishReason);
                } else {
                    logger.error('[Stream] Stream ended with no content received');
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
                    logger.info('[Stream] Request cancelled by user:', streamInfo);
                } else {
                    logger.error(`[Stream] Error in ${providerName} stream processing:`, streamInfo);
                }

                errorCallback(error);
            }
        }
    };

    // Export all utilities and classes
    return {
        EnhancedError,
        ParameterUtils,
        StreamUtils,
        ApiUtils,
        ValidationUtils,
        OpenAIUtils,
        Provider,
        logger: baseProviderLogger
    };
})(); 