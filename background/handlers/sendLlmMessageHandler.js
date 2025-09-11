// background/handlers/sendLlmMessageHandler.js

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

    try {
        // Save loading state to cache if tabId is provided
        if (currentUrl && tabId) {
            const loadingInfo = {
                messageCount: messages ? messages.length : 0,
                hasImage: !!imageBase64,
                selectedModel: selectedModel?.name || (defaultModel ? defaultModel.name : 'default'),
                provider: llmConfig.provider,
                timestamp: Date.now(),
                lastMessageContent: messages && messages.length > 0 ? messages[messages.length - 1]?.content?.substring(0, 100) : null,
                isRetry: messages && messages.length > 0 && messages[messages.length - 1]?.isRetry === true,
                branchId: branchId || null
            };
            
            // For branch requests, use branchId in the cache key
            const cacheKey = branchId ? `${tabId}:${branchId}` : tabId;
            await loadingStateCache.saveLoadingState(currentUrl, cacheKey, loadingInfo);
            
            const branchInfo = branchId ? ` and branch ${branchId}` : '';
            serviceLogger.info(`SEND_LLM: Loading state saved for tab ${tabId}${branchInfo} with enhanced details`);
        }
        
        serviceLogger.info(`SEND_LLM: Calling LLM with ${messages.length} messages`);
        
        const streamCallback = (chunk) => {
            if (chunk !== undefined && chunk !== null) {
                try {
                    safeSendMessage({ 
                        type: 'LLM_STREAM_CHUNK', 
                        chunk: chunk,
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
            const responseLength = fullResponse?.length || 0;
            const branchInfo = branchId ? ` for branch ${branchId}` : '';
            serviceLogger.info(`SEND_LLM: Stream finished - response length: ${responseLength}${branchInfo}`);
            
            const isAbnormalFinish = finishReason && 
                finishReason !== 'stop' && 
                finishReason !== 'STOP' && 
                finishReason !== 'end_turn';
            
            try {
                safeSendMessage({ 
                    type: 'LLM_STREAM_END', 
                    fullResponse,
                    finishReason,
                    isAbnormalFinish,
                    tabId: tabId,
                    url: currentUrl,
                    branchId: branchId || null
                });
            } catch (error) {
                serviceLogger.error('SEND_LLM: Error sending stream end to sidebar:', error.message);
            }

            // Unregister request from tracker
            if (typeof RequestTracker !== 'undefined') {
                RequestTracker.unregisterRequest(tabId, branchId);
            }

            try {
                // Update loading state to completed
                if (currentUrl && tabId) {
                    const cacheKey = branchId ? `${tabId}:${branchId}` : tabId;
                    await loadingStateCache.completeLoadingState(currentUrl, cacheKey, fullResponse);
                    broadcastLoadingStateUpdate(currentUrl, tabId, 'completed', fullResponse, null, finishReason, branchId);
                }
            } catch (error) {
                serviceLogger.error('SEND_LLM: Error updating loading state:', error.message);
            }

            // For branch requests, don't auto-save chat history - let the frontend handle it
            if (!branchId) {
                try {
                    if (currentUrl && messages) {
                        const tabSpecificUrl = tabId ? `${currentUrl}#${tabId}` : currentUrl;
                        const updatedMessages = [
                            ...messages,
                            { role: 'assistant', content: fullResponse }
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
            
            // Check if this is an EnhancedError with raw response data
            if (err.name === 'EnhancedError') {
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
                    url: currentUrl
                });
            } catch (sendError) {
                serviceLogger.error('SEND_LLM: Error sending error message to sidebar:', sendError.message);
            }

            // Unregister request from tracker
            if (typeof RequestTracker !== 'undefined') {
                RequestTracker.unregisterRequest(tabId, branchId);
            }

            try {
                // Update loading state to error
                if (currentUrl && tabId) {
                    const cacheKey = branchId ? `${tabId}:${branchId}` : tabId;
                    await loadingStateCache.errorLoadingState(currentUrl, cacheKey, errorMessage);
                    broadcastLoadingStateUpdate(currentUrl, tabId, 'error', null, errorMessage, null, errorDetails, branchId);
                }
            } catch (error) {
                serviceLogger.error('SEND_LLM: Error updating loading state to error:', error.message);
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
            messages,
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