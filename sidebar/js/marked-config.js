/**
 * marked-config.js - Configure marked.js options for optimal rendering
 * This file configures marked.js to prevent excessive whitespace and line breaks
 */

// Configure marked.js options to prevent excessive whitespace and line breaks
if (typeof window.marked !== 'undefined') {
  window.marked.setOptions({
    breaks: false, // Don't convert single line breaks to <br> tags
    gfm: true, // Enable GitHub Flavored Markdown
    pedantic: false, // Don't be pedantic about spacing
    silent: false // Don't silently ignore errors
  });

  // Use the 'preprocess' hook to fix common markdown issues before rendering
  window.marked.use({
    hooks: {
      preprocess: (markdown) => {
        if (typeof markdown !== 'string') {
          return markdown;
        }

        // Replace full-width quotes with standard quotes
        processed = markdown
          .replace(/“|”/g, '"')
          .replace(/‘|’/g, "'")
          .replace(/（/g, "(")
          .replace(/）/g, ")");

        return processed;
      },

      postprocess: (html) => {
        if (typeof html !== 'string') {
          return html;
        }

        // Post-process to handle markdown that wasn't converted by marked
        // This handles cases like: 一个**"原始日志记录器"(Raw Log Collector)**。
        // where the bold markdown syntax remains in the HTML output
        let processed = html;

        // Convert remaining **text** patterns to <strong> tags
        // This regex looks for **...** that wasn't converted by marked
        processed = processed.replace(/\*\*((?:[^*]|\*(?!\*))+?)\*\*/g, '<strong>$1</strong>');

        // Convert remaining *text* patterns to <em> tags (for italic)
        // This regex looks for *...* that wasn't converted by marked
        processed = processed.replace(/(?<!\*)\*([^*\n]+?)\*(?!\*)/g, '<em>$1</em>');

        // Convert remaining `code` patterns to <code> tags
        // This regex looks for `...` that wasn't converted by marked
        processed = processed.replace(/`([^`\n]+?)`/g, '<code>$1</code>');

        return processed;
      }
    }
  });

} else {
  console.error('[Marked Config] marked.js library not found');
}