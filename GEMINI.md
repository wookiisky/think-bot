# Think Bot Project Overview

This document provides a high-level overview of the Think Bot browser extension, intended to guide development and maintenance activities.

## Introduction

Think Bot is a browser extension designed to enable users to interact with web pages through a chat interface powered by Large Language Models (LLMs).

## Project Type

Browser extension (Chrome Extension Manifest V3)

## Core Functionality

The primary function of this extension is to extract content from a web page, send it to an LLM, and display the response in a user-friendly chat interface within a side panel.

## Key Files and Directories

-   **`manifest.json`**: The core configuration file for the Chrome extension, defining permissions, scripts, and other essential metadata.
-   **`background/service-worker.js`**: The background script that manages the extension's state, handles events, and communicates with other parts of the extension.
-   **`sidebar/`**: This directory contains the user interface for the extension, which is displayed in the browser's side panel.
    -   `sidebar.html`: The main HTML structure of the side panel.
    -   `sidebar.js`: The primary JavaScript file for the side panel, handling user interactions and communication with the background script.
-   **`content_scripts/`**: This directory contains scripts that are injected into web pages to extract content and interact with the DOM.
    -   `content_script.js`: The main content script responsible for extracting page data.
-   **`options/`**: This directory contains the extension's options page, allowing users to configure settings.
    -   `options.html`: The HTML structure of the options page.
    -   `options.js`: The JavaScript file that manages the options page and saves user settings.
-   **`js/modules/`**: This directory contains shared JavaScript modules used across different parts of the extension, such as storage management, content extraction logic, and LLM service integration.


## rule
- 模块化开发，遵循软件工程的最佳原则（如低耦合、高内聚），同时确保所有功能的完整实现。
    - 职责分离: 每个模块有明确的单一职责
    - 可重用性: 模块可以独立测试和重用
    - 可维护性: 修改一个功能不会影响其他功能
- 注意chrome 扩展开发规范，支持语法，特殊限制
- 关键步骤添加日志
- 使用中文回复和生成文档
- 使用英文生成commit信息
- 代码文件中只能使用英文，包括日志，注释等
- 单个代码文件最好不要超过250行，超过则尽可能按照模块化的思路拆分到更多文件
