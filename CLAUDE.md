# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## High-level Architecture

This project is a Chrome extension (Manifest V3) called "Think Bot". Its core function is to allow users to have an AI-powered conversation about the content of the current web page via a browser sidebar.

The extension is structured into several key parts:

-   **`background/`**: Contains the service worker (`service-worker.js`) which is the central event handler for the extension. It manages extension state, handles messages between different parts of the extension, and orchestrates long-running tasks. The `background/handlers/` directory contains specific handlers for different actions like fetching page data, managing chat history, etc.
-   **`sidebar/`**: This is the main user interface for the extension. It's a self-contained HTML/CSS/JS application that displays the extracted page content and the chat interface. It communicates with the background script to get data and send user actions. Key modules include `chat-manager.js` for handling the chat UI, `page-data-manager.js` for displaying page content, and `content-extractor.js` for triggering content extraction.
-   **`content_scripts/`**: These scripts run in the context of the web page and are used to interact with the page's DOM, for example, to extract content.
-   **`options/`**: The configuration page for the extension, allowing users to set API keys, choose models, and configure other settings.
-   **`js/modules/`**: Contains the core logic of the application, shared between different parts of the extension.
    -   `content_extractor.js` and `content_extract/`: Manages different methods for extracting page content (e.g., Readability, Jina AI).
    -   `llm_service.js` and `llm_provider/`: Handles communication with different Large Language Models (LLMs) like OpenAI and Gemini.
    -   `storage.js`: A key module for managing all data persistence, including page content, chat history, and user configurations. It uses `chrome.storage.local` and `chrome.storage.sync`.
-   **`conversations/`**: A separate page to manage and view all cached page conversations. It reuses many of the sidebar components and modules.


When working on this codebase, pay attention to the following:

-   **Modularity**: The code is designed to be modular. When adding new features, try to follow the existing pattern of separating concerns into different modules. For example, a new LLM provider should be a new file in `js/modules/llm_provider/`.
-   **Asynchronous Operations**: The extension heavily relies on asynchronous operations (e.g., fetching data, communicating between components). Be mindful of Promises and `async/await`.
-   **Data Flow**: The typical data flow is: User action in `sidebar` -> message to `service-worker` -> `service-worker` calls a handler -> handler uses core modules in `js/modules/` -> data is saved to `storage` -> UI is updated.
-   **Error Handling**: Implement robust error handling, especially for external API calls (LLMs, Jina) and when interacting with the Chrome extension APIs.


## rule
- 模块化开发，遵循软件工程的最佳原则（如低耦合、高内聚），同时确保所有功能的完整实现。
    - 职责分离: 每个模块有明确的单一职责
    - 可重用性: 模块可以独立测试和重用
    - 可维护性: 修改一个功能不会影响其他功能
- 注意chrome 扩展开发规范，支持语法，特殊限制
- 关键步骤添加日志
- 使用中文回复
- 代码文件中只能使用英文，包括日志，注释等
- 单个代码文件最好不要超过250行，超过则尽可能按照模块化的思路拆分到更多文件

