/**
 * exportConversationHandler.js - Handles conversation export requests
 */

// Note: sanitizeForFilename function is now available from background/utils.js
// which is imported in service-worker.js

// Main handler function
async function handleExportConversation(request, sender, sendResponse) {
  const { urlWithPossibleFragment, chatHistory, quickInputTabName } = request;

  try {
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
    const sanitizedTabName = sanitizeForFilename(quickInputTabName || chrome.i18n.getMessage('export_default_tab_name'));

    // 3. Generate timestamp with seconds to avoid filename conflicts
    const now = new Date();
    const timestamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;

    // 4. Construct filename
    const filename = `${sanitizedPageTitle}--${sanitizedTabName}--${timestamp}.md`;

    // 5. Generate markdown content
    let markdownContent = `# ${pageTitle}\n\nURL: ${baseUrl}\n\n`;
    chatHistory.forEach(message => {
      const role = message.role || chrome.i18n.getMessage('export_unknown_role');
      const content = message.content || '';
      markdownContent += `## --------${role}--------\n${content}\n\n`;
    });

    // 6. Send response with data to be downloaded
    sendResponse({
      success: true,
      filename,
      markdownContent
    });
  } catch (error) {
    console.error('Error exporting conversation:', error);
    sendResponse({ success: false, error: error.message });
  }
}