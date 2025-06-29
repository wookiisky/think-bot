// background/handlers/sendLlmMessageHandler.js

async function handleSendLlmMessage(data, serviceLogger, configManager, storage, llmService, loadingStateCache, safeSendMessage) {
    const { messages, systemPromptTemplate, extractedPageContent, imageBase64, currentUrl, selectedModel, tabId } = data.payload;

    const config = await configManager.getConfig();
    
    // Use selected model or fall back to default (support both old and new config formats)
    let llmConfig;
    const llmModelsConfig = config.llm_models || config.llm;

    if (llmModelsConfig?.models && llmModelsConfig.models.length > 0) {
        // Get defaultModelId from basic config (new location) or fallback to llm config (old location)
        const basicConfig = config.basic || config;
        const defaultModelId = basicConfig.defaultModelId || llmModelsConfig.defaultModelId;
        const modelId = selectedModel?.id || defaultModelId;
        const defaultModel = llmModelsConfig.models.find(m => m.id === modelId && m.enabled) ||
                            llmModelsConfig.models.find(m => m.enabled);

        if (defaultModel) {
            llmConfig = {
                provider: defaultModel.provider,
                apiKey: defaultModel.apiKey,
                baseUrl: defaultModel.baseUrl,
                model: defaultModel.model,
                maxTokens: defaultModel.maxTokens || 2048,
                temperature: defaultModel.temperature || 0.7
            };
        }

        serviceLogger.info(`SEND_LLM: Using model ${defaultModel.name} (${defaultModel.provider})`);
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
                selectedModel: selectedModel?.name || 'default',
                provider: llmConfig.provider,
                timestamp: Date.now(),
                lastMessageContent: messages && messages.length > 0 ? messages[messages.length - 1]?.content?.substring(0, 100) : null,
                isRetry: messages && messages.length > 0 && messages[messages.length - 1]?.isRetry === true
            };
            
            await loadingStateCache.saveLoadingState(currentUrl, tabId, loadingInfo);
            serviceLogger.info(`SEND_LLM: Loading state saved for tab ${tabId} with enhanced details`);
        }
        
        serviceLogger.info(`SEND_LLM: Calling LLM with ${messages.length} messages`);
        
        const streamCallback = (chunk) => {
            if (chunk !== undefined && chunk !== null) {
                try {
                    safeSendMessage({ 
                        type: 'LLM_STREAM_CHUNK', 
                        chunk: chunk,
                        tabId: tabId,
                        url: currentUrl
                    });
                } catch (error) {
                    serviceLogger.error('SEND_LLM: Error sending chunk to sidebar:', error.message);
                }
            }
        };

        const doneCallback = async (fullResponse, finishReason = null) => {
            const responseLength = fullResponse?.length || 0;
            serviceLogger.info(`SEND_LLM: Stream finished - response length: ${responseLength}`);
            
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
                    url: currentUrl
                });
            } catch (error) {
                serviceLogger.error('SEND_LLM: Error sending stream end to sidebar:', error.message);
            }

            // Unregister request from tracker
            if (typeof RequestTracker !== 'undefined') {
                RequestTracker.unregisterRequest(tabId);
            }

            try {
                // Update loading state to completed
                if (currentUrl && tabId) {
                    await loadingStateCache.completeLoadingState(currentUrl, tabId, fullResponse);
                    broadcastLoadingStateUpdate(currentUrl, tabId, 'completed', fullResponse, null, finishReason);
                }
            } catch (error) {
                serviceLogger.error('SEND_LLM: Error updating loading state:', error.message);
            }

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
            
            // Create error JSON for storage and transmission
            let errorJsonObject = null;
            if (errorDetails.rawResponse) {
                try {
                    errorJsonObject = typeof errorDetails.rawResponse === 'string'
                        ? JSON.parse(errorDetails.rawResponse)
                        : errorDetails.rawResponse;
                } catch (parseError) {
                    errorJsonObject = errorDetails.rawResponse;
                }
            }

            if (!errorJsonObject) {
                // For user cancellation, use the actual error message instead of generic message
                if (errorDetails.message === 'Request was cancelled by user') {
                    errorJsonObject = {
                        message: errorDetails.message
                    };
                } else {
                    errorJsonObject = {
                        message: "No detailed error information available"
                    };
                }
            }
            
            const errorJsonString = JSON.stringify(errorJsonObject);

            // Check if this is a user cancellation - log as info instead of error
            if (errorDetails.message === 'Request was cancelled by user') {
                serviceLogger.info(`SEND_LLM: Request cancelled by user for tab ${tabId}`);
            } else {
                serviceLogger.error(`SEND_LLM: LLM error - ${errorDetails.message}`);
            }

            try {
                safeSendMessage({
                    type: 'LLM_ERROR',
                    error: errorJsonString,
                    errorDetails: errorDetails,
                    tabId: tabId,
                    url: currentUrl
                });
            } catch (sendError) {
                serviceLogger.error('SEND_LLM: Error sending error message to sidebar:', sendError.message);
            }

            // Unregister request from tracker
            if (typeof RequestTracker !== 'undefined') {
                RequestTracker.unregisterRequest(tabId);
            }

            try {
                // Update loading state to error
                if (currentUrl && tabId) {
                    await loadingStateCache.errorLoadingState(currentUrl, tabId, errorJsonString);
                    broadcastLoadingStateUpdate(currentUrl, tabId, 'error', null, errorJsonString, null, errorDetails);
                }
            } catch (error) {
                serviceLogger.error('SEND_LLM: Error updating loading state to error:', error.message);
            }
        };

        // Create AbortController for request cancellation
        const abortController = new AbortController();

        // Register request with tracker
        if (typeof RequestTracker !== 'undefined') {
            RequestTracker.registerRequest(tabId, currentUrl, abortController);
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