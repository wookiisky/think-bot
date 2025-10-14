// background/handlers/sendLlmMessageHandler.js

/**
 * Filter LLM response to ensure clean text output
 * @param {*} response - Response to filter
 * @param {Object} logger - Logger instance
 * @returns {string} - Cleaned text response
 */
function filterLlmResponse(response, logger) {
    let cleaned = response;
    
    // Ensure response is a string
    if (typeof response !== 'string') {
        if (logger) {
            logger.warn('Non-string response received, converting', { type: typeof response });
        }
        cleaned = String(response || '');
    }
    
    // Remove any [object Object] that might have slipped through
    if (cleaned.includes('[object Object]')) {
        if (logger) {
            logger.warn('Found [object Object] in response, filtering');
        }
        cleaned = cleaned.replace(/\[object Object\]/g, '');
    }
    
    return cleaned;
}

async function handleSendLlmMessage(data, serviceLogger, configManager, storage, llmService, loadingStateCache, safeSendMessage) {
    const { messages, systemPromptTemplate, extractedPageContent, imageBase64, currentUrl, selectedModel, tabId, branchId, model } = data.payload;

    const config = await configManager.getConfig();
    
    // Use selected model or fall back to default (support both old and new config formats)
    let llmConfig;
    const llmModelsConfig = config.llm_models || config.llm;
    let defaultModel = null;

    if (llmModelsConfig?.models && llmModelsConfig.models.length > 0) {
        let targetModel = null;
        
        // For branch requests, use the specified model
        if (branchId && model) {
            serviceLogger.debug(`SEND_LLM: Looking for branch model with ID: ${model.id || model.name}`);
            
            // First try to match by model ID directly
            targetModel = llmModelsConfig.models.find(m => 
                m.enabled && m.id === model.id
            );
            
            // If not found, try legacy format matching (provider:modelName)
            if (!targetModel && model.id && model.id.includes(':')) {
                const [provider, modelName] = model.id.split(':');
                serviceLogger.debug(`SEND_LLM: Trying legacy format matching - provider: ${provider}, model: ${modelName}`);
                
                targetModel = llmModelsConfig.models.find(m => 
                    m.enabled && 
                    m.provider === provider && 
                    (m.model === modelName || m.name === modelName)
                );
            }
            
            if (!targetModel) {
                serviceLogger.warn(`SEND_LLM: Branch model ${model.id || model.name} not found in config, using default`);
                serviceLogger.debug(`SEND_LLM: Available models: ${llmModelsConfig.models.filter(m => m.enabled).map(m => m.id).join(', ')}`);
            } else {
                serviceLogger.debug(`SEND_LLM: Found matching model: ${targetModel.id} (${targetModel.name})`);
            }
        }
        
        // Fall back to normal model selection if branch model not found
        if (!targetModel) {
            // Get defaultModelId from basic config (new location) or fallback to llm config (old location)
            const basicConfig = config.basic || config;
            const defaultModelId = basicConfig.defaultModelId || llmModelsConfig.defaultModelId;
            const modelId = selectedModel?.id || defaultModelId;
            targetModel = llmModelsConfig.models.find(m => m.id === modelId && m.enabled) ||
                         llmModelsConfig.models.find(m => m.enabled);
        }
        
        defaultModel = targetModel;
        serviceLogger.debug(`SEND_LLM: defaultModel assigned, value: ${defaultModel ? 'defined' : 'undefined'}`);

        if (defaultModel) {
            llmConfig = {
                provider: defaultModel.provider,
                apiKey: defaultModel.apiKey,
                maxTokens: defaultModel.maxTokens || 2048,
                temperature: defaultModel.temperature || 0.7
            };
            
            // Add provider-specific fields
            if (defaultModel.provider === 'azure_openai') {
                llmConfig.endpoint = defaultModel.endpoint;
                llmConfig.deploymentName = defaultModel.deploymentName;
                llmConfig.apiVersion = defaultModel.apiVersion;
            } else if (defaultModel.provider === 'openai' || defaultModel.provider === 'gemini') {
                llmConfig.baseUrl = defaultModel.baseUrl;
                llmConfig.model = defaultModel.model;
            }
            
            const branchInfo = branchId ? ` for branch ${branchId}` : '';
            serviceLogger.info(`SEND_LLM: Using model ${defaultModel.name} (${defaultModel.provider})${branchInfo}`);
        } else {
            serviceLogger.error('SEND_LLM: No suitable model found in configuration');
            throw new Error('No suitable model found in configuration');
        }
    } else {
        throw new Error('No LLM models configured');
    }

    const systemPrompt = systemPromptTemplate.replace('{CONTENT}', extractedPageContent || '');

    // Helper: normalize messages to standard format (flatten assistant branches)
    /** Normalize incoming messages into standard { role, content } pairs */
    const normalizeMessagesForLLM = (msgs) => {
        try {
            if (!Array.isArray(msgs)) return [];
            const normalized = [];
            for (const m of msgs) {
                if (!m || !m.role) continue;
                if (m.role === 'user') {
                    normalized.push({
                        role: 'user',
                        content: m.content || '',
                        imageBase64: m.imageBase64,
                        timestamp: m.timestamp
                    });
                } else if (m.role === 'assistant') {
                    if (Array.isArray(m.responses)) {
                        const completed = m.responses.find(r => r && r.status === 'done' && typeof r.content === 'string' && r.content.length > 0);
                        if (completed) {
                            normalized.push({
                                role: 'assistant',
                                content: completed.content,
                                model: completed.model || 'unknown',
                                timestamp: m.timestamp || completed.updatedAt
                            });
                        } else {
                            // Skip non-completed assistant responses in normalization
                        }
                    } else if (typeof m.content === 'string') {
                        normalized.push({
                            role: 'assistant',
                            content: m.content,
                            model: m.model,
                            timestamp: m.timestamp
                        });
                    }
                }
            }
            return normalized;
        } catch (e) {
            serviceLogger.warn('SEND_LLM: Failed to normalize messages, using original array', e?.message || 'unknown error');
            return Array.isArray(msgs) ? msgs : [];
        }
    };

    // Helper: for branch requests, trim trailing assistant messages so last is previous user
    /** Trim trailing non-user messages to ensure last is a user for branch */
    const trimTrailingForBranch = (msgs) => {
        if (!Array.isArray(msgs) || msgs.length === 0) return [];
        let end = msgs.length - 1;
        let removed = 0;
        while (end >= 0 && msgs[end] && msgs[end].role !== 'user') {
            removed++;
            end--;
        }
        if (removed > 0) {
            serviceLogger.info(`SEND_LLM: Trimmed ${removed} trailing non-user messages for branch to end on user`);
        }
        const trimmed = msgs.slice(0, end + 1);
        if (trimmed.length === 0) {
            serviceLogger.warn('SEND_LLM: Branch trimming removed all messages; proceeding with empty context');
        }
        return trimmed;
    };

    // Prepare effective messages
    const normalizedMessages = normalizeMessagesForLLM(messages || []);
    const effectiveMessages = branchId ? trimTrailingForBranch(normalizedMessages) : normalizedMessages;

    try {
        // Save loading state to cache if tabId is provided
        if (currentUrl && tabId) {
            const loadingInfo = {
                messageCount: effectiveMessages ? effectiveMessages.length : 0,
                hasImage: !!imageBase64,
                selectedModel: selectedModel?.name || (defaultModel ? defaultModel.name : 'default'),
                provider: llmConfig.provider,
                timestamp: Date.now(),
                lastMessageContent: effectiveMessages && effectiveMessages.length > 0 ? effectiveMessages[effectiveMessages.length - 1]?.content?.substring(0, 100) : null,
                isRetry: messages && messages.length > 0 && messages[messages.length - 1]?.isRetry === true,
                branchId: branchId || null
            };
            
            // For branch requests, use branchId in the cache key
            const cacheKey = branchId ? `${tabId}:${branchId}` : tabId;
            await loadingStateCache.saveLoadingState(currentUrl, cacheKey, loadingInfo);
            
            const branchInfo = branchId ? ` and branch ${branchId}` : '';
            serviceLogger.info(`SEND_LLM: Loading state saved for tab ${tabId}${branchInfo} with enhanced details`);
        }
        
        serviceLogger.info(`SEND_LLM: Calling LLM with ${effectiveMessages.length} messages${branchId ? ' (branch context sanitized)' : ''}`);
        
        const streamCallback = (chunk) => {
            if (chunk !== undefined && chunk !== null) {
                try {
                    // Filter chunk to ensure clean text
                    const filteredChunk = filterLlmResponse(chunk, serviceLogger);
                    
                    // Skip if chunk is empty or [object Object] after filtering
                    if (!filteredChunk || filteredChunk === '[object Object]') {
                        serviceLogger.debug('SEND_LLM: Filtered out invalid chunk');
                        return;
                    }
                    
                    safeSendMessage({ 
                        type: 'LLM_STREAM_CHUNK', 
                        chunk: filteredChunk,
                        tabId: tabId,
                        url: currentUrl,
                        branchId: branchId || null
                    });
                } catch (error) {
                    serviceLogger.error('SEND_LLM: Error sending chunk to sidebar:', error.message);
                }
            }
        };

        const doneCallback = async (fullResponse, finishReason = null) => {
            // Filter fullResponse to ensure it's clean text
            const cleanedResponse = filterLlmResponse(fullResponse, serviceLogger);
            
            const responseLength = cleanedResponse?.length || 0;
            const branchInfo = branchId ? ` for branch ${branchId}` : '';
            serviceLogger.info(`SEND_LLM: Stream finished - response length: ${responseLength}${branchInfo}`);
            
            const isAbnormalFinish = finishReason && 
                finishReason !== 'stop' && 
                finishReason !== 'STOP' && 
                finishReason !== 'end_turn';
            
            try {
                safeSendMessage({ 
                    type: 'LLM_STREAM_END', 
                    fullResponse: cleanedResponse,
                    finishReason,
                    isAbnormalFinish,
                    tabId: tabId,
                    url: currentUrl,
                    branchId: branchId || null
                });
            } catch (error) {
                serviceLogger.error('SEND_LLM: Error sending stream end to sidebar:', error.message);
            }

            // Persist branch result into chat history for the specific tab BEFORE broadcasting, so UI can read updated data
            if (branchId && currentUrl && tabId) {
                try {
                    const tabSpecificUrl = `${currentUrl}#${tabId}`;
                    let history = await storage.getChatHistory(tabSpecificUrl);
                    if (!Array.isArray(history)) history = [];

                    const nowTs = Date.now();
                    let updated = false;

                    // Find the last assistant message containing the branch and update it
                    for (let i = history.length - 1; i >= 0 && !updated; i--) {
                        const msg = history[i];
                        if (msg && msg.role === 'assistant' && Array.isArray(msg.responses)) {
                            for (let j = msg.responses.length - 1; j >= 0; j--) {
                                const r = msg.responses[j];
                                if (r && r.branchId === branchId) {
                                    r.status = 'done';
                                    r.content = cleanedResponse || '';
                                    r.errorMessage = null;
                                    r.model = r.model || (defaultModel ? (defaultModel.model || defaultModel.name) : 'unknown');
                                    r.updatedAt = nowTs;
                                    updated = true;
                                    break;
                                }
                            }
                            if (updated) {
                                msg.timestamp = msg.timestamp || nowTs;
                            }
                        }
                    }

                    // If not found, append a new assistant message with this branch
                    if (!updated) {
                        history.push({
                            role: 'assistant',
                            timestamp: nowTs,
                            responses: [
                                {
                                    branchId: branchId,
                                    model: (defaultModel && (defaultModel.model || defaultModel.name)) || 'unknown',
                                    content: cleanedResponse || '',
                                    status: 'done',
                                    errorMessage: null,
                                    updatedAt: nowTs
                                }
                            ]
                        });
                    }

                    await storage.saveChatHistory(tabSpecificUrl, history);
                    serviceLogger.info(`SEND_LLM: Persisted branch ${branchId} result to chat history for tab ${tabId}`);
                } catch (persistErr) {
                    serviceLogger.warn('SEND_LLM: Failed to persist branch result to chat history:', persistErr.message);
                }
            }

            // Unregister request from tracker
            if (typeof RequestTracker !== 'undefined') {
                RequestTracker.unregisterRequest(tabId, branchId);
            }

            try {
                // Update loading state to completed, then broadcast to content scripts and sidebar
                if (currentUrl && tabId) {
                    const cacheKey = branchId ? `${tabId}:${branchId}` : tabId;
                    await loadingStateCache.completeLoadingState(currentUrl, cacheKey, cleanedResponse);
                    // notify content scripts on the page
                    broadcastLoadingStateUpdate(currentUrl, tabId, 'completed', cleanedResponse, null, finishReason, branchId);
                    // notify extension pages (sidebar) directly
                    safeSendMessage({
                        type: 'LOADING_STATE_UPDATE',
                        url: currentUrl,
                        tabId: tabId,
                        status: 'completed',
                        result: cleanedResponse,
                        error: null,
                        finishReason: finishReason,
                        branchId: branchId || null,
                        timestamp: Date.now()
                    });
                }
            } catch (error) {
                serviceLogger.error('SEND_LLM: Error updating/loading state broadcast:', error.message);
            }

            // For branch requests, don't auto-save chat history - let the frontend handle it
            if (!branchId) {
                try {
                    if (currentUrl && messages) {
                        const tabSpecificUrl = tabId ? `${currentUrl}#${tabId}` : currentUrl;
                        // Preserve model information to avoid showing as unknown after refresh
                        const assistantModel = (defaultModel && (defaultModel.model || defaultModel.name)) || 'unknown';
                        const updatedMessages = [
                            ...messages,
                            { role: 'assistant', content: cleanedResponse, model: assistantModel }
                        ];
                        await storage.saveChatHistory(tabSpecificUrl, updatedMessages);
                        serviceLogger.info(`SEND_LLM: Chat history saved with ${updatedMessages.length} messages`);
                    } else {
                        serviceLogger.warn('SEND_LLM: Cannot save chat history - missing currentUrl or messages');
                    }
                } catch (error) {
                    serviceLogger.error('SEND_LLM: Error saving chat history:', error.message);
                }
            } else {
                serviceLogger.info(`SEND_LLM: Branch request completed, skipping auto-save of chat history`);
            }
        };

        const errorCallback = async (err) => {
            // Process LLM error with unified handling logic
            let errorDetails = {
                message: err.message || 'Error calling LLM',
                type: err.constructor?.name || 'Unknown',
                rawResponse: null,
                errorData: null,
                status: null
            };
            
            // Check if this is a RawError with raw response data  
            if (err.name === 'RawError') {
                errorDetails.rawResponse = err.rawResponse;
                errorDetails.errorData = err.errorData;
                errorDetails.status = err.status;
            }
            
            // Log error details for debugging
            serviceLogger.info('SEND_LLM: Processing error details', {
                hasRawResponse: !!errorDetails.rawResponse,
                hasErrorData: !!errorDetails.errorData,
                errorMessage: errorDetails.message,
                errorType: errorDetails.type,
                status: errorDetails.status
            });
            
            // Create error message for storage and transmission
            let errorMessage = null;
            
            // Priority 1: Use errorData if available (already parsed JSON)
            if (errorDetails.errorData && typeof errorDetails.errorData === 'object' && Object.keys(errorDetails.errorData).length > 0) {
                errorMessage = JSON.stringify(errorDetails.errorData, null, 2);
                serviceLogger.info('SEND_LLM: Using errorData for error message', {
                    errorDataKeys: Object.keys(errorDetails.errorData),
                    errorMessage: errorMessage.substring(0, 200)
                });
            }
            // Priority 2: Try to extract meaningful error message from raw response
            else if (errorDetails.rawResponse) {
                try {
                    const parsedResponse = typeof errorDetails.rawResponse === 'string'
                        ? JSON.parse(errorDetails.rawResponse)
                        : errorDetails.rawResponse;
                    
                    // Check if parsed response has meaningful content
                    if (parsedResponse && typeof parsedResponse === 'object' && Object.keys(parsedResponse).length > 0) {
                        // If it's a meaningful object, use it as error message directly
                        errorMessage = JSON.stringify(parsedResponse, null, 2);
                        serviceLogger.info('SEND_LLM: Parsed rawResponse successfully', {
                            keys: Object.keys(parsedResponse),
                            errorMessage: errorMessage.substring(0, 200)
                        });
                    } else {
                        // If it's empty or meaningless, use the raw response as string
                        errorMessage = typeof errorDetails.rawResponse === 'string' 
                            ? errorDetails.rawResponse 
                            : JSON.stringify(errorDetails.rawResponse);
                        serviceLogger.info('SEND_LLM: Using rawResponse as string', {
                            errorMessage: errorMessage.substring(0, 200)
                        });
                    }
                } catch (parseError) {
                    // If parsing fails, use raw response as string
                    errorMessage = typeof errorDetails.rawResponse === 'string' 
                        ? errorDetails.rawResponse 
                        : String(errorDetails.rawResponse);
                    serviceLogger.info('SEND_LLM: Failed to parse rawResponse, using as string', {
                        parseError: parseError.message,
                        errorMessage: errorMessage.substring(0, 200)
                    });
                }
            }
            
            // Priority 3: If we still don't have a meaningful error message, use fallback
            if (!errorMessage || errorMessage.trim() === '' || errorMessage === '{}' || errorMessage === 'null' || errorMessage === 'undefined') {
                if (errorDetails.message === 'Request was cancelled by user') {
                    errorMessage = errorDetails.message;
                } else {
                    // Use the original error message or a meaningful fallback
                    errorMessage = errorDetails.message || 'LLM service error - no detailed information available';
                }
                serviceLogger.info('SEND_LLM: Using fallback error message', {
                    errorMessage: errorMessage
                });
            }

            // Final log of what we're sending
            serviceLogger.info('SEND_LLM: Final error message to send', {
                errorMessage: errorMessage.substring(0, 300),
                errorMessageLength: errorMessage.length
            });

            // Check if this is a user cancellation - log as info instead of error
            if (errorDetails.message === 'Request was cancelled by user') {
                serviceLogger.info(`SEND_LLM: Request cancelled by user for tab ${tabId}`);
            } else {
                serviceLogger.error(`SEND_LLM: LLM error - ${errorDetails.message}`);
            }

            try {
                safeSendMessage({
                    type: 'LLM_ERROR',
                    error: errorMessage,
                    errorDetails: errorDetails,
                    tabId: tabId,
                    url: currentUrl,
                    branchId: branchId || null
                });
            } catch (sendError) {
                serviceLogger.error('SEND_LLM: Error sending error message to sidebar:', sendError.message);
            }

            // Clear loading state from chat history instead of persisting error
            if (branchId && currentUrl && tabId) {
                try {
                    const tabSpecificUrl = `${currentUrl}#${tabId}`;
                    let history = await storage.getChatHistory(tabSpecificUrl);
                    if (!Array.isArray(history)) history = [];

                    let updated = false;

                    // Remove loading branch from history - errors should only show in UI
                    for (let i = history.length - 1; i >= 0 && !updated; i--) {
                        const msg = history[i];
                        if (msg && msg.role === 'assistant' && Array.isArray(msg.responses)) {
                            for (let j = msg.responses.length - 1; j >= 0; j--) {
                                const r = msg.responses[j];
                                if (r && r.branchId === branchId && r.status === 'loading') {
                                    // Remove the loading branch instead of converting to error
                                    msg.responses.splice(j, 1);
                                    updated = true;
                                    break;
                                }
                            }
                            // If no responses left, remove the entire assistant message
                            if (updated && msg.responses.length === 0) {
                                history.splice(i, 1);
                            }
                        }
                    }

                    if (updated) {
                        await storage.saveChatHistory(tabSpecificUrl, history);
                        serviceLogger.info(`SEND_LLM: Removed loading branch ${branchId} from chat history after error`);
                    }
                } catch (persistErr) {
                    serviceLogger.warn('SEND_LLM: Failed to clean loading state from chat history:', persistErr.message);
                }
            }

            // Unregister request from tracker
            if (typeof RequestTracker !== 'undefined') {
                RequestTracker.unregisterRequest(tabId, branchId);
            }

            try {
                // Update loading state to error, then broadcast to content scripts and sidebar
                if (currentUrl && tabId) {
                    const cacheKey = branchId ? `${tabId}:${branchId}` : tabId;
                    await loadingStateCache.errorLoadingState(currentUrl, cacheKey, errorMessage);
                    // notify content scripts on the page
                    broadcastLoadingStateUpdate(currentUrl, tabId, 'error', null, errorMessage, null, errorDetails, branchId);
                    // notify extension pages (sidebar) directly
                    safeSendMessage({
                        type: 'LOADING_STATE_UPDATE',
                        url: currentUrl,
                        tabId: tabId,
                        status: 'error',
                        result: null,
                        error: errorMessage,
                        finishReason: null,
                        branchId: branchId || null,
                        timestamp: Date.now()
                    });
                }
            } catch (error) {
                serviceLogger.error('SEND_LLM: Error updating/loading state broadcast (error):', error.message);
            }
        };

        // Create AbortController for request cancellation
        const abortController = new AbortController();

        // Register request with tracker
        if (typeof RequestTracker !== 'undefined') {
            RequestTracker.registerRequest(tabId, currentUrl, abortController, branchId);
        }

        // Call the LLM service
        llmService.callLLM(
            effectiveMessages,
            llmConfig,
            systemPrompt,
            imageBase64,
            streamCallback,
            doneCallback,
            errorCallback,
            abortController,
            currentUrl,
            tabId
        );

        return { type: 'LLM_REQUEST_INITIATED' };

    } catch (err) {
        serviceLogger.error('SEND_LLM: Critical error initiating LLM call:', err.message);
        return { type: 'LLM_SETUP_ERROR', error: err.message || 'Error setting up LLM call' };
    }
}

/**
 * Broadcast loading state updates to all connected sidebars
 */
function broadcastLoadingStateUpdate(url, tabId, status, result = null, error = null, finishReason = null, errorDetails = null) {
    try {
        chrome.tabs.query({ url: url }, (tabs) => {
            if (tabs && tabs.length > 0) {
                tabs.forEach((tab) => {
                    chrome.tabs.sendMessage(tab.id, {
                        type: 'LOADING_STATE_UPDATE',
                        url: url,
                        tabId: tabId,
                        status: status,
                        result: result,
                        error: error,
                        finishReason: finishReason,
                        errorDetails: errorDetails,
                        timestamp: Date.now()
                    }).catch(() => {
                        // Tab might not have a content script or sidebar open
                    });
                });
            }
        });
    } catch (error) {
        // Silent fail for broadcast errors
    }
} 
