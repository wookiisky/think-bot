# Internationalization (i18n) and Localization (l10n) Architecture

This document outlines the comprehensive internationalization (i18n) and localization (l10n) architecture for the Think Bot Chrome extension. The goal is to create a robust, scalable, and easy-to-maintain system for supporting multiple languages.

## 1. Locale File Structure

We will adopt the standard directory structure recommended by Chrome for extensions. All locale files will be placed within a `_locales` directory at the root of the extension.

Each language will have its own subdirectory, named by its language code (e.g., `en` for English, `zh_CN` for Simplified Chinese). Inside each language-specific directory, there will be a `messages.json` file containing the translation strings.

```
.
├── _locales/
│   ├── en/
│   │   └── messages.json
│   ├── zh_CN/
│   │   └── messages.json
│   └── zh_TW/
│       └── messages.json
├── manifest.json
└── ... (rest of the extension files)
```

## 2. Translation Key Naming Convention

To ensure consistency and readability, all translation keys will follow a specific naming convention.

**Format:** `page_component_subComponent_attribute`

-   **`page`**: The page or major area of the extension where the string appears (e.g., `options`, `sidebar`, `global`).
-   **`component`**: The UI component or logical group the string belongs to (e.g., `header`, `cacheSettings`, `chat`).
-   **`subComponent`**: (Optional) A more specific element within the component.
-   **`attribute`**: The type of string (e.g., `text`, `title`, `placeholder`, `message`).

**Examples:**

-   `options_header_title_text`: The main title on the options page.
-   `sidebar_chatInput_placeholder`: The placeholder text for the chat input field in the sidebar.
-   `global_error_generic_message`: A generic error message used across the extension.
-   `sidebar_copyContentBtn_title`: The tooltip title for the "Copy Content" button.

This structured approach makes it easy to find and manage keys as the extension grows.

## 3. Locale File Format

We will use the standard `messages.json` format required by the `chrome.i18n` API. This is a JSON object where each key corresponds to a translation string.

Each entry in the JSON file will be an object with a `message` property and an optional `description` property. The `description` will provide context for translators.

**Example: `_locales/en/messages.json`**

```json
{
  "appName": {
    "message": "Think Bot",
    "description": "The name of the application."
  },
  "options_header_title_text": {
    "message": "Think Bot Settings",
    "description": "The main title on the options page."
  },
  "sidebar_chatInput_placeholder": {
    "message": "Ask ...",
    "description": "Placeholder text for the chat input field in the sidebar."
  },
  "chat_message_generationCancelled_text": {
    "message": "Response generation stopped by user.",
    "description": "Message shown when a streaming response is cancelled by the user."
  },
  "chat_message_errorMessage_text": {
    "message": "An error occurred: $details$",
    "description": "A generic error message. The $details$ placeholder will be replaced with the specific error.",
    "placeholders": {
      "details": {
        "content": "$1",
        "example": "Network request failed."
      }
    }
  }
}
```

## 4. Integration Strategy

### 4.1. `manifest.json`

The `manifest.json` file will be updated to specify the default language for the extension. This is crucial for the i18n system to function correctly.

```json
{
  "manifest_version": 3,
  "name": "__MSG_appName__",
  "description": "__MSG_appDescription__",
  "default_locale": "en",
  ...
}
```

### 4.2. HTML (Static Content)

For static content in HTML files, we will use a combination of `__MSG_key__` for direct replacement and a script-based approach for attributes.

**Direct Replacement (for simple text nodes):**

```html
<!-- Before -->
<h1>Think Bot Settings</h1>

<!-- After -->
<h1 data-i18n="options_header_title_text">Think Bot Settings</h1>
```

**Attribute Replacement (for `title`, `placeholder`, etc.):**

We will use `data-i18n-*` attributes to specify keys for element attributes.

```html
<!-- Before -->
<button id="copyContentBtn" title="Copy extracted content">...</button>
<textarea id="userInput" placeholder="Ask ..."></textarea>

<!-- After -->
<button id="copyContentBtn" data-i18n-title="sidebar_copyContentBtn_title">...</button>
<textarea id="userInput" data-i18n-placeholder="sidebar_chatInput_placeholder"></textarea>
```

A utility script will run on DOMContentLoaded to scan for these `data-i18n-*` attributes and populate the elements with the correct translated strings using `chrome.i18n.getMessage()`.

### 4.3. JavaScript (Dynamic Content)

For strings generated dynamically in JavaScript (e.g., error messages, status updates), we will use the `chrome.i18n.getMessage()` API.

To centralize this logic, we will create a small utility module, `i18n.js`.

**`js/modules/i18n.js`**

```javascript
// js/modules/i18n.js
export const i18n = {
  /**
   * Retrieves a translated string for the given key.
   * @param {string} key - The translation key.
   * @param {string|string[]} [substitutions] - Optional placeholder values.
   * @returns {string} The translated string.
   */
  getMessage(key, substitutions = []) {
    try {
      return chrome.i18n.getMessage(key, substitutions);
    } catch (e) {
      console.error(`Could not find i18n key: ${key}`, e);
      return key; // Return the key as a fallback
    }
  },

  /**
   * Applies translations to the DOM.
   * Scans for elements with data-i18n attributes and sets their content.
   */
  applyToDOM() {
    document.querySelectorAll('[data-i18n]').forEach(elem => {
      const key = elem.getAttribute('data-i18n');
      elem.textContent = this.getMessage(key);
    });

    document.querySelectorAll('[data-i18n-title]').forEach(elem => {
      const key = elem.getAttribute('data-i18n-title');
      elem.title = this.getMessage(key);
    });

    document.querySelectorAll('[data-i18n-placeholder]').forEach(elem => {
      const key = elem.getAttribute('data-i18n-placeholder');
      elem.placeholder = this.getMessage(key);
    });
  }
};

// Automatically apply to the DOM when the script is loaded
document.addEventListener('DOMContentLoaded', () => {
  i18n.applyToDOM();
});
```

This module will be included in `options.html`, `sidebar.html`, and any other pages that require UI translations.

**Example Usage in JS:**

```javascript
// Before
confirmationOverlay.show({
  message: 'This page is in your blacklist. Do you want to continue?'
});

// After
import { i18n } from './modules/i18n.js';

confirmationOverlay.show({
  message: i18n.getMessage('sidebar_blacklist_confirmation_message')
});
```

## 5. UI for Language Selection

A new "Language" section will be added to the `options/options.html` page, placed within the left sidebar under the "Theme" section.

**HTML Snippet for `options/options.html`:**

```html
<!-- ... inside left-sidebar div ... -->
<!-- Theme -->
<section class="settings-section sidebar-section">
  <h2>Theme</h2>
  ...
</section>

<!-- Language -->
<section class="settings-section sidebar-section">
  <h2 data-i18n="options_language_title">Language</h2>
  <div class="form-group">
    <select id="languageSelector" name="language">
      <option value="en">English</option>
      <option value="zh_CN">简体中文</option>
      <!-- More languages can be added here -->
    </select>
  </div>
</section>
<!-- ... -->
```

**Logic in `options.js`:**

1.  **Populate Selector**: The language selector will be populated with available languages.
2.  **Load Setting**: On page load, the saved language preference will be retrieved from `chrome.storage.local`.
3.  **Save Setting**: When the user changes the language, the new preference will be saved to `chrome.storage.local`.
4.  **Inform Extension**: After saving, a message will be sent to the background script to inform other parts of the extension about the language change, so they can update their UI if currently open. A page reload might be the simplest way to apply changes universally.

## 6. Process for Adding a New Language

The process for adding a new language (e.g., Japanese `ja`) will be straightforward:

1.  **Create Directory**: Add a new directory `_locales/ja/`.
2.  **Copy and Translate**: Copy the `_locales/en/messages.json` file to `_locales/ja/messages.json`.
3.  **Translate Strings**: Translate all the `message` values in the new `_locales/ja/messages.json` file. The `description` fields will provide context.
4.  **Update Options Page**: Add the new language to the dropdown in `options/options.html`:
    ```html
    <option value="ja">日本語</option>
    ```
5.  **Test**: Reload the extension and test the new language thoroughly.

This architecture ensures that adding new languages requires no changes to the JavaScript or HTML logic, only the addition of a new translation file and a single line in the options page.