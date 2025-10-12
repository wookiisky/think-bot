/**
 * exportConversationHandler.js - Handles conversation export requests
 */

// Note: sanitizeForFilename function is now available from background/utils.js
// which is imported in service-worker.js

// Main handler function
async function handleExportConversation(request, serviceLogger) {
  const logger = serviceLogger || console;
  const { urlWithPossibleFragment, chatHistory, quickInputTabName } = request || {};

  try {
    if (!chatHistory || !Array.isArray(chatHistory) || chatHistory.length === 0) {
      return {
        success: false,
        error: chrome.i18n.getMessage('export_empty_conversation') || 'No conversation available to export'
      };
    }

    // 1. Get base URL and page title
    const baseUrl = urlWithPossibleFragment ? urlWithPossibleFragment.split('#')[0] : null;
    let pageTitle = chrome.i18n.getMessage('export_default_title');
    if (baseUrl) {
      const metadata = await getPageMetadata(baseUrl);
      if (metadata && metadata.title) {
        pageTitle = metadata.title;
      } else {
        try {
          pageTitle = new URL(baseUrl).hostname;
        } catch {
          pageTitle = chrome.i18n.getMessage('export_untitled_page');
        }
      }
    }

    // 2. Sanitize filename parts
    const sanitizedPageTitle = sanitizeForFilename(pageTitle);
    const sanitizedTabName = sanitizeForFilename(quickInputTabName || chrome.i18n.getMessage('common_chat'));

    // 3. Generate timestamp with seconds to avoid filename conflicts
    const now = new Date();
    const timestamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;

    // 4. Construct filename
    const filename = `${sanitizedPageTitle}--${sanitizedTabName}--${timestamp}.md`;

    // 5. Generate markdown content
    let markdownContent = `# ${pageTitle}\n\nURL: ${baseUrl}\n\n`;
    
    chatHistory.forEach(message => {
      if (message.role === 'user') {
        // Handle user messages (unchanged)
        const content = message.content || '';
        markdownContent += `## --------user--------\n${content}\n\n`;
      } else if (message.role === 'assistant') {
        // Handle assistant messages with potential branches
        if (message.responses && Array.isArray(message.responses) && message.responses.length > 0) {
          // Multiple branches format
          message.responses.forEach((response, index) => {
            const modelInfo = response.model ? ` (${response.model})` : '';
            const branchLabel = message.responses.length > 1 ? ` - Branch ${index + 1}` : '';
            
            markdownContent += `## --------assistant${branchLabel}${modelInfo}--------\n`;
            
            if (response.status === 'error') {
              markdownContent += `*Error: ${response.errorMessage || response.content}*\n\n`;
            } else if (response.status === 'loading') {
              markdownContent += `*Loading...*\n\n`;
            } else {
              markdownContent += `${response.content || ''}\n\n`;
            }
          });
        } else {
          // Legacy format - single assistant message
          const content = message.content || '';
          const modelInfo = message.model ? ` (${message.model})` : '';
          markdownContent += `## --------assistant${modelInfo}--------\n${content}\n\n`;
        }
      } else {
        // Handle other message types
        const role = message.role || chrome.i18n.getMessage('export_unknown_role');
        const content = message.content || '';
        markdownContent += `## --------${role}--------\n${content}\n\n`;
      }
    });

    // 6. Return response with data to be downloaded
    return {
      success: true,
      filename,
      markdownContent
    };
  } catch (error) {
    logger.error('Error exporting conversation:', error);
    return { success: false, error: error.message };
  }
}