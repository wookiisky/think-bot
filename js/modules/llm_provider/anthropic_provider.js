// Anthropic Claude Provider Module for LLM Service
// Implements Claude API streaming with SSE event handling

const anthropicLogger = logger.createModuleLogger('AnthropicProvider');

var anthropicProvider = (function () {

    // Import simplified utilities from BaseProvider
    const {
        RawError,
        ParameterUtils,
        StreamUtils,
        ApiUtils
    } = BaseProvider;

    // Constants
    const DEFAULT_MODEL = 'claude-sonnet-4-20250514';
    const DEFAULT_BASE_URL = 'https://api.anthropic.com';
    const DEFAULT_CONFIG = {
        temperature: 1.0
    };
    const ANTHROPIC_VERSION = '2023-06-01';
    const CONTROL_CHAR_REGEX = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;

    // Remove invalid control characters and unmatched surrogate pairs to keep JSON encoding safe
    function sanitizeText(text) {
        if (text === undefined || text === null) {
            return '';
        }

        const value = typeof text === 'string' ? text : String(text);
        let cleaned = '';

        for (let i = 0; i < value.length; i++) {
            const code = value.charCodeAt(i);
            const isLeadSurrogate = code >= 0xD800 && code <= 0xDBFF;
            const isTrailSurrogate = code >= 0xDC00 && code <= 0xDFFF;

            if (isLeadSurrogate) {
                if (i + 1 < value.length) {
                    const nextCode = value.charCodeAt(i + 1);
                    const isValidTrail = nextCode >= 0xDC00 && nextCode <= 0xDFFF;
                    if (isValidTrail) {
                        cleaned += value[i] + value[i + 1];
                        i++;
                        continue;
                    }
                }
                continue;
            }

            if (isTrailSurrogate) {
                continue;
            }

            cleaned += value[i];
        }

        return cleaned.replace(CONTROL_CHAR_REGEX, '');
    }

    // Normalize text content into Anthropic content blocks
    function normalizeContentBlocks(content) {
        if (Array.isArray(content)) {
            const blocks = [];
            for (const item of content) {
                if (typeof item === 'string') {
                    const text = sanitizeText(item);
                    if (text) {
                        blocks.push({ type: 'text', text });
                    }
                } else if (item && typeof item === 'object') {
                    if (item.type === 'text' && typeof item.text === 'string') {
                        blocks.push({ ...item, text: sanitizeText(item.text) });
                    }
                }
            }
            return blocks;
        }

        const textContent = sanitizeText(content);
        return textContent ? [{ type: 'text', text: textContent }] : [];
    }

    // Normalize parameters
    function normalizeParameters(llmConfig) {
        const normalized = { ...llmConfig };

        normalized.temperature = ParameterUtils.normalizeTemperature(normalized.temperature);
        // Note: Anthropic does not use max_tokens parameter

        return normalized;
    }

    // Build API URL for Anthropic
    function buildApiUrl(baseUrl) {
        const cleanBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
        // If URL ends with #, use as-is (for custom proxy endpoints)
        if (cleanBaseUrl.endsWith('#')) {
            return cleanBaseUrl.slice(0, -1);
        }
        // If URL already ends with /v1/messages, use as-is
        if (cleanBaseUrl.endsWith('/v1/messages')) {
            return cleanBaseUrl;
        }
        // If URL ends with /v1, just append /messages
        if (cleanBaseUrl.endsWith('/v1')) {
            return `${cleanBaseUrl}/messages`;
        }
        // Default: append /v1/messages
        return `${cleanBaseUrl}/v1/messages`;
    }

    // Build Anthropic messages format
    function buildMessages(messages, systemPrompt, imageBase64, model, logger, mergeSystemPrompt = false) {
        const anthropicMessages = [];
        const sanitizedSystemPrompt = systemPrompt ? sanitizeText(systemPrompt) : '';
        let isFirstUserMessage = true;

        for (const message of messages) {
            if (
                message.role === 'user' &&
                imageBase64 &&
                message === messages[messages.length - 1]
            ) {
                // Handle image in the last user message
                if (!imageBase64.startsWith('data:image/')) {
                    throw new Error('Invalid image format');
                }

                // Extract media type and base64 data
                const matches = imageBase64.match(/^data:(image\/[^;]+);base64,(.+)$/);
                if (!matches) {
                    throw new Error('Invalid base64 image format');
                }
                const [, mediaType, base64Data] = matches;
                const textContent = sanitizeText(message.content || 'Please analyze this image.');

                anthropicMessages.push({
                    role: 'user',
                    content: [
                        {
                            type: 'image',
                            source: {
                                type: 'base64',
                                media_type: mediaType,
                                data: base64Data
                            }
                        },
                        {
                            type: 'text',
                            text: textContent
                        }
                    ]
                });
            } else {
                const contentBlocks = normalizeContentBlocks(message.content);

                // If mergeSystemPrompt is enabled and this is the first user message, prepend system prompt
                if (mergeSystemPrompt && sanitizedSystemPrompt && message.role === 'user' && isFirstUserMessage) {
                    isFirstUserMessage = false;

                    // Prepend system prompt to the user message content
                    const mergedContent = `${sanitizedSystemPrompt}\n\n${contentBlocks.length === 1 && contentBlocks[0].type === 'text' ? contentBlocks[0].text : (contentBlocks.length > 0 ? contentBlocks.map(b => b.text || '').join('') : '')}`;

                    anthropicMessages.push({
                        role: message.role,
                        content: mergedContent
                    });
                } else {
                    // Normal message handling
                    // Optimization: Use simple string for single text block if possible
                    // This improves compatibility with proxies and reduces JSON size
                    if (contentBlocks.length === 1 && contentBlocks[0].type === 'text') {
                        anthropicMessages.push({
                            role: message.role,
                            content: contentBlocks[0].text
                        });
                    } else if (contentBlocks.length === 0) {
                        // Claude requires non-empty content
                        anthropicMessages.push({
                            role: message.role,
                            content: " "
                        });
                    } else {
                        anthropicMessages.push({
                            role: message.role,
                            content: contentBlocks
                        });
                    }
                }
            }
        }

        return anthropicMessages;
    }

    // Handle Anthropic SSE stream
    // Claude uses a different SSE format than OpenAI:
    // - event: message_start, content_block_start, content_block_delta, content_block_stop, message_delta, message_stop
    // - data: {"type": "...", ...}
    async function handleAnthropicStream(response, streamCallback, doneCallback, errorCallback, logger, abortController = null, url = null, tabId = null) {
        const monitor = StreamUtils.createStreamMonitor();
        let stopReason = null;
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

                // Process SSE lines
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                let currentEventType = null;

                for (const line of lines) {
                    const trimmedLine = line.trim();

                    // Parse event type
                    if (trimmedLine.startsWith('event:')) {
                        currentEventType = trimmedLine.slice(6).trim();
                        continue;
                    }

                    // Parse data
                    if (trimmedLine.startsWith('data:')) {
                        const dataStr = trimmedLine.slice(5).trim();
                        if (!dataStr) continue;

                        try {
                            const data = JSON.parse(dataStr);

                            // Handle different event types
                            switch (data.type) {
                                case 'content_block_delta':
                                    // Extract text from delta
                                    if (data.delta && data.delta.type === 'text_delta' && data.delta.text) {
                                        const textChunk = data.delta.text;
                                        fullResponse += textChunk;
                                        streamCallback(textChunk);
                                    }
                                    break;

                                case 'message_delta':
                                    // Extract stop reason
                                    if (data.delta && data.delta.stop_reason) {
                                        stopReason = data.delta.stop_reason;
                                    }
                                    break;

                                case 'message_stop':
                                    // Stream completed
                                    doneCallback(fullResponse, stopReason);
                                    return;

                                case 'error':
                                    // Handle error event
                                    const errorMessage = data.error?.message || 'Unknown Anthropic API error';
                                    throw new RawError(errorMessage, data, null);

                                case 'ping':
                                case 'message_start':
                                case 'content_block_start':
                                case 'content_block_stop':
                                    // Ignore these events
                                    break;

                                default:
                                    // Ignore unknown event types
                                    break;
                            }
                        } catch (parseError) {
                            if (parseError instanceof RawError) {
                                throw parseError;
                            }
                            // Ignore parse errors but continue processing
                        }
                    }
                }
            }

            // Stream ended without message_stop
            if (fullResponse.length > 0) {
                doneCallback(fullResponse, stopReason);
            } else {
                throw new Error('Stream ended without receiving any content');
            }

        } catch (error) {
            if (error.message === 'Request was cancelled by user') {
                logger.info('[Stream] Request cancelled by user');
            } else {
                logger.error('[Stream] Anthropic stream error:', error.message);
            }

            errorCallback(error);
        }
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
        const temperature = llmConfig.temperature !== undefined ? llmConfig.temperature : DEFAULT_CONFIG.temperature;
        const sanitizedSystemPrompt = systemPrompt ? sanitizeText(systemPrompt) : '';

        // Basic API key validation
        if (!apiKey) {
            const error = new Error(chrome.i18n.getMessage('error_api_key_not_configured'));
            errorCallback(error);
            return;
        }

        // Basic URL validation
        try {
            new URL(baseUrl);
        } catch (urlError) {
            const error = new Error(`Invalid Anthropic base URL: ${baseUrl}`);
            errorCallback(error);
            return;
        }

        try {
            const normalizedConfig = normalizeParameters(llmConfig);
            const apiUrl = buildApiUrl(baseUrl);
            const mergeSystemPrompt = llmConfig.mergeSystemPrompt || false;

            const anthropicMessages = buildMessages(messages, systemPrompt, imageBase64, model, anthropicLogger, mergeSystemPrompt);

            // Build request body for Anthropic API
            // Note: max_tokens is intentionally excluded as Anthropic handles token limits automatically
            const requestBody = {
                model,
                messages: anthropicMessages,
                stream: !!streamCallback
            };

            // Add temperature if not undefined (Anthropic accepts 0-1 range)
            const normalizedTemp = normalizedConfig.temperature !== undefined ? normalizedConfig.temperature : temperature;
            if (normalizedTemp !== undefined) {
                requestBody.temperature = Math.min(Math.max(normalizedTemp, 0), 1);
            }

            // Add system prompt if provided and not merged into messages
            // (Anthropic uses top-level system field)
            if (sanitizedSystemPrompt && !mergeSystemPrompt) {
                requestBody.system = sanitizedSystemPrompt;
            }

            const requestBodyString = JSON.stringify(requestBody);

            const hh = {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': apiKey,
                    'anthropic-version': ANTHROPIC_VERSION
                },
                body: requestBodyString
            }

            const response = await ApiUtils.simpleFetch(apiUrl, hh, 'Anthropic', abortController);


            if (!response.ok) {
                await ApiUtils.handleRawError(response, 'Anthropic');
                return;
            }

            if (streamCallback) {
                await handleAnthropicStream(response, streamCallback, doneCallback, errorCallback, anthropicLogger, abortController, url, tabId);
            } else {
                const data = await ApiUtils.getRawResponse(response);
                // Non-streaming response format
                const responseText = data.content?.[0]?.text || '';
                doneCallback(responseText);
            }
        } catch (error) {
            if (error.message === 'Request was cancelled by user') {
                anthropicLogger.info('[Request] Request cancelled by user');
            } else {
                anthropicLogger.error('[Request] Anthropic API call failed', {
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
