// offscreen.js

// Use existing logger if available, otherwise fallback to console
let offscreenLogger;
try {
  if (typeof logger !== 'undefined' && logger && logger.createModuleLogger) {
    offscreenLogger = logger.createModuleLogger('@offscreen');
  } else if (window.logger && window.logger.createModuleLogger) {
    offscreenLogger = window.logger.createModuleLogger('@offscreen');
  } else {
    offscreenLogger = console;
  }
} catch (e) {
  offscreenLogger = console;
}

// Log initial state
offscreenLogger.info('Offscreen document loaded');
offscreenLogger.info('Readability available:', !!self.Readability);
offscreenLogger.info('TurndownService available:', !!self.TurndownService);
offscreenLogger.info('DOM Parser available:', !!DOMParser);



// Listen for messages from the service worker.
chrome.runtime.onMessage.addListener(handleMessages);

async function handleMessages(message, sender, sendResponse) {
  offscreenLogger.info('Received message in offscreen:', { type: message.type, target: message.target });
  
  if (message.target !== 'offscreen') {
    return false; // Not for us
  }

  switch (message.type) {
    case 'extract-content':
    case 'extract-content-readability':
      try {
        offscreenLogger.info(`Processing message type: ${message.type}`, { 
          pageUrl: message.pageUrl, 
          hasHtmlString: !!message.htmlString,
          htmlLength: message.htmlString ? message.htmlString.length : 0
        });
        
        if (!message.htmlString) {
          offscreenLogger.error('No HTML string provided for extraction');
          sendResponse({ success: false, error: 'No HTML content provided for extraction.' });
          return true;
        }
        
        const article = processWithReadability(message.htmlString, message.pageUrl);
        
        if (article && article.content) {
          offscreenLogger.info('Article extraction successful', { 
            title: article.title, 
            contentLength: article.content.length,
            hasTextContent: !!article.textContent
          });
          
          const markdown = htmlToMarkdown(article.content);
          const fullContent = `# ${article.title || 'Untitled'}\n\n${markdown}`;
          
          offscreenLogger.info('Readability processing successful', { 
            pageUrl: message.pageUrl, 
            title: article.title,
            finalContentLength: fullContent.length
          });
          
          sendResponse({ success: true, content: fullContent });
        } else {
          offscreenLogger.error('Readability failed to parse content or extract title/content', { 
            pageUrl: message.pageUrl,
            article: article,
            hasArticle: !!article,
            hasContent: article ? !!article.content : false,
            hasTitle: article ? !!article.title : false
          });
          sendResponse({ success: false, error: 'Readability failed to parse content or extract title/content.' });
        }
      } catch (e) {
        offscreenLogger.error('Error in offscreen document during Readability processing:', { 
          pageUrl: message.pageUrl, 
          error: e.message, 
          stack: e.stack,
          name: e.name
        });
        sendResponse({ success: false, error: `Processing error: ${e.message}` });
      }
      return true; // Indicates an asynchronous response.
    default:
      offscreenLogger.warn(`Unexpected message type received: '${message.type}'.`, { receivedMessage: message });
      sendResponse({ success: false, error: `Unknown message type: ${message.type}` });
      return false;
  }
}

function processWithReadability(htmlString, pageUrl) {
  offscreenLogger.info('Starting Readability processing', {
    htmlLength: htmlString.length,
    pageUrl: pageUrl,
    readabilityAvailable: !!self.Readability
  });
  
  if (!self.Readability) {
    offscreenLogger.error('Readability library not loaded in offscreen document.');
    throw new Error('Readability library not loaded.');
  }
  
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlString, 'text/html');
    
    offscreenLogger.info('HTML parsed successfully', {
      hasDocumentElement: !!doc.documentElement,
      hasHead: !!doc.head,
      hasBody: !!doc.body,
      bodyChildCount: doc.body ? doc.body.children.length : 0
    });
    
    // Set baseURI for proper relative URL resolution by Readability
    if (pageUrl) {
      let base = doc.querySelector('base');
      if (!base) {
        base = doc.createElement('base');
        doc.head.appendChild(base);
      }
      base.href = pageUrl;
      offscreenLogger.debug('Set base href for Readability document', { pageUrl });
    } else if (doc.baseURI === "about:blank" && doc.head) {
      // Fallback if pageUrl is not provided, though it's less ideal
      let base = doc.createElement('base');
      base.href = 'http://localhost/'; 
      doc.head.appendChild(base);
      offscreenLogger.warn('pageUrl not provided for Readability, using generic localhost base.');
    }

    const reader = new self.Readability(doc);
    offscreenLogger.info('Readability instance created, starting parse');
    
    const result = reader.parse();
    
    offscreenLogger.info('Readability parse completed', {
      hasResult: !!result,
      hasTitle: result ? !!result.title : false,
      hasContent: result ? !!result.content : false,
      hasTextContent: result ? !!result.textContent : false,
      titleLength: result && result.title ? result.title.length : 0,
      contentLength: result && result.content ? result.content.length : 0,
      textContentLength: result && result.textContent ? result.textContent.length : 0
    });
    
    return result;
  } catch (error) {
    offscreenLogger.error('Error during Readability processing:', {
      error: error.message,
      stack: error.stack,
      name: error.name
    });
    throw error;
  }
}

// Convert HTML to Markdown using Turndown
function htmlToMarkdown(html) {
  try {
    if (typeof TurndownService === 'undefined') {
      offscreenLogger.error('TurndownService is not loaded.');
      throw new Error('TurndownService is not loaded.');
    }
    const turndownService = new TurndownService({
      headingStyle: 'atx', // Use '#' for headings
      codeBlockStyle: 'fenced', // Use '```' for code blocks
      bulletListMarker: '-', // Use '-' for unordered lists (common in GFM)
      emDelimiter: '*', // Use '*' for emphasis (italic)
      strongDelimiter: '**', // Use '**' for strong (bold)
      linkStyle: 'inlined', // Output links as [text](url)
      // fence: '```', // Default is '```', so not strictly necessary to set
      // hr: '---', // Default is '* * *', GFM often uses '---'
    });    

    // For basic GFM compatibility, we might need to add rules for strikethrough if desired
    // turndownService.addRule('strikethrough', {
    //   filter: ['del', 's', 'strike'],
    //   replacement: function (content) {
    //     return '~' + content + '~'; // GFM uses single tilde for strikethrough
    //   }
    // });
    // For now, we will stick to built-in options.

    let markdown = turndownService.turndown(html);
    
    // Turndown might leave some HTML entities, decode them
    // The decodeHtmlEntities function is still useful.
    markdown = decodeHtmlEntities(markdown);

    // Additional cleanup: Turndown usually handles this well, but an extra pass for multiple blank lines can be useful.
    markdown = markdown.replace(/\n\s*\n\s*\n/g, '\n\n');
    
    return markdown.trim();
  } catch (error) {
    offscreenLogger.error('Error converting HTML to Markdown with Turndown:', { errorMessage: error.message, stack: error.stack, originalHtmlLength: html.length });
    // Fallback to a very basic stripping or return original HTML snippet to avoid breaking flow.
    // For now, returning a simple error message in markdown.
    return `> Error during Markdown conversion: ${error.message}`;
  }
}

// Decode HTML entities (Copied from content_extractor.js - still useful)
function decodeHtmlEntities(text) {
  if (typeof document === 'undefined') {
    // This function cannot run in a Worker without a 'document' object.
    // Handle this case, perhaps by returning text as is or throwing an error.
    // For Offscreen document, 'document' will be available.
    offscreenLogger.warn('decodeHtmlEntities called in an environment without `document`. This should be in an offscreen document.');
    return text; // Or throw an error, depending on desired behavior
  }
  const textArea = document.createElement('textarea');
  textArea.innerHTML = text;
  return textArea.value;
} 