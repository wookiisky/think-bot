# Decision Log

## 2025-07-02: Internationalization (i18n) Architecture

**Decision:** Adopt the architecture outlined in `design/i18n_architecture.md`.

**Key Points:**
- **Structure:** Use the standard `_locales/[lang]/messages.json` directory structure.
- **API:** Utilize the `chrome.i18n.getMessage()` API for fetching translations.
- **DOM Integration:** Implement a utility (`i18n.js`) with a `data-i18n-*` attribute-based approach to apply translations to static HTML content.
- **Language Selection:** Add a `<select>` dropdown on the options page to allow users to change the language. The preference will be stored in `chrome.storage.local`.
- **Process:** Adding new languages will involve creating a new `messages.json` file and adding an entry to the options page dropdown.

## 2025-07-02: Core i18n Implementation

**Decision:** Implemented the foundational i18n framework as per the architecture.

**Key Points:**
- **Initial Files:** Created `_locales/en/messages.json`, `_locales/zh_CN/messages.json`, and `js/modules/i18n.js`.
- **Language Switch UX:** For the initial implementation, when a user switches the language on the options page, they are notified via an `alert` that a page reload is required for the changes to take full effect. A more seamless, automatic refresh is deferred to a future iteration to manage complexity.

- **Decision**: Moved the `language` configuration setting into the `basic` configuration group.
- **Reason**: The `language` setting was not being synchronized across devices because it was not part of any synchronized configuration group. Moving it to the `basic` group, which is included in the sync process, resolves this issue and ensures consistent language settings for the user.
- **Status**: Implemented.

- **Decision**: Refactored the language setting logic in `options.js` and `form-handler.js`.
- **Reason**: A previous fix to move the `language` setting to the `basic` config group was insufficient. The root cause was found in the UI logic: `populateForm` in `form-handler.js` failed to set the language selector's value from the loaded config, and `options.js` contained incorrect logic for reading and writing the language value to the wrong location (`config.language` instead of `config.basic.language`). This refactoring corrects the entire data flow for the language setting, ensuring it is properly loaded, displayed, and saved.
- **Status**: Implemented.

## 2025-07-03: Clarification on `i18n.js` Usage

- **Decision**: Removed the explicit `i18n.init()` call from `sidebar/sidebar.js`.
- **Reason**: The `i18n.js` module is designed for automatic initialization. It uses a `DOMContentLoaded` event listener to automatically scan the DOM and apply translations based on `data-i18n-*` attributes. Manual initialization is not required and the `init` function does not exist on the exported object, causing a runtime error. This change corrects the usage of the module to align with its design.
- **Status**: Implemented.