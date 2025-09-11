# Service Worker (`background/service-worker.js`) 接口与功能文档

本文档详细说明了 Think Bot 扩展程序中 Service Worker 的核心功能、事件监听器和消息处理机制。Service Worker 作为扩展程序的后台核心，负责处理数据存储、网络请求、与大语言模型 (LLM) 的通信以及协调扩展程序各部分（如侧边栏、内容脚本）之间的交互。

## 核心职责

- **生命周期管理**: 处理扩展程序的安装、更新和启动事件。
- **后台任务**: 执行定期的缓存清理任务。
- **事件监听**: 监听浏览器事件，如标签页切换、URL 变化和图标点击。
- **消息路由**: 作为中央消息处理器，接收来自其他脚本的请求，并分发给相应的处理模块。
- **状态管理**: 管理应用的配置、缓存和加载状态。
- **核心服务**: 对接内容提取、LLM 通信、数据同步等核心服务。

---

## 一、浏览器事件监听器 (Chrome API Event Listeners)

这些监听器由 Chrome API 提供，用于响应浏览器级别的事件。

### 1. `chrome.runtime.onInstalled`

- **功能**: 在扩展程序首次安装或更新后执行初始化操作。
- **调用时机**: 扩展程序被安装或更新时。
- **主要操作**:
    - 创建一个右键菜单项 "Conversations"，用于快速打开对话历史页面。
    - 初始化缓存压缩模块 (`cacheCompression`)，以清理旧版本的缓存数据。
    - 初始化配置管理器 (`storageConfigManager`)，确保默认配置存在。
    - 调用 `storage.cleanupExpiredCache()` 清理过期的缓存数据，防止存储空间无限增长。

### 2. `chrome.contextMenus.onClicked`

- **功能**: 处理右键菜单的点击事件。
- **调用时机**: 当用户点击在 `onInstalled` 事件中创建的 "Conversations" 菜单项时。
- **主要操作**:
    - 创建一个新的标签页，并打开 `conversations/conversations.html` 页面。

### 3. `chrome.action.onClicked`

- **功能**: 处理用户点击扩展程序工具栏图标的事件。
- **调用时机**: 用户点击浏览器工具栏中的 Think Bot 图标时。
- **主要操作**:
    - **页面限制检查**: 判断当前页面是否为受限制的页面（如 `chrome://` 或 `about:` 页面）。
    - **受限页面**: 如果是受限页面，则直接打开 `conversations/conversations.html` 页面，因为侧边栏无法在这些页面上运行。
    - **普通页面**: 如果是普通网页，则调用 `chrome.sidePanel.open()` 打开侧边栏，并发送 `SIDEBAR_OPENED` 消息通知侧边栏，以便其进行后续的初始化操作（如黑名单检查）。

### 4. `chrome.tabs.onActivated`

- **功能**: 跟踪用户正在查看的标签页，并相应地更新扩展程序的状态。
- **调用时机**: 用户切换到另一个标签页时。
- **主要操作**:
    - 调用 `handleTabActivated` 处理器。
    - 更新扩展程序图标的状态（例如，根据页面是否被缓存或是否在黑名单中来改变图标）。
    - 向侧边栏发送 `TAB_ACTIVATED` 消息，通知其当前活动的标签页已更改。

### 5. `chrome.tabs.onUpdated`

- **功能**: 监听标签页内容的变化，主要是 URL 的变化。
- **调用时机**: 当标签页的 URL 发生改变或页面加载状态变化（如从 `loading` 到 `complete`）时。
- **主要操作**:
    - 调用 `handleTabUpdated` 处理器。
    - 当 URL 变化时，清除与旧 URL 相关的缓存状态。
    - 向侧边栏发送 `URL_CHANGED` 消息，以便侧边栏可以刷新其内容以匹配新页面。

---

## 二、定时任务 (Periodic Tasks)

### `setInterval` for Cache Cleanup

- **功能**: 定期自动清理过期的缓存数据。
- **调用时机**: Service Worker 启动后，每 6 小时执行一次。
- **主要操作**:
    - 调用 `storage.cleanupExpiredCache()` 来删除已过期的缓存项，释放存储空间。

---

## 三、消息处理器 (`chrome.runtime.onMessage`)

这是 Service Worker 的核心部分，它作为一个中央消息总线，处理来自侧边栏 (`sidebar.js`) 和内容脚本 (`content_script.js`) 的各种请求。

- **调用时机**: 当其他脚本调用 `chrome.runtime.sendMessage()` 时。
- **返回机制**: 这是一个异步监听器，返回 `true` 以表明 `sendResponse` 回调函数将会被异步调用。

### 消息类型详解

| 消息类型 (Type) | 功能描述 | 发起方 | 处理器/依赖 |
| :--- | :--- | :--- | :--- |
| **页面内容** | | | |
| `GET_PAGE_DATA` | 获取当前页面的主要内容。它会首先尝试从缓存中读取，如果缓存不存在或已过期，则会通过内容脚本从页面中提取。 | 侧边栏 | `handleGetPageData`, `storage`, `contentExtractor` |
| `GET_CACHED_PAGE_DATA` | 仅从缓存中获取页面数据，不触发新的内容提取。 | 侧边栏 | `handleGetCachedPageData`, `storage` |
| `GET_ANY_CACHED_CONTENT` | 获取任意类型的缓存内容（无论是否为主要内容）。 | 侧边栏 | `handleGetAnyCachedContent`, `storage` |
| `SWITCH_EXTRACTION_METHOD` | 切换内容提取的方法（如 Readability），并立即重新提取内容。 | 侧边栏 | `handleSwitchExtractionMethod`, `storage`, `contentExtractor` |
| `RE_EXTRACT_CONTENT` | 强制重新从页面提取内容，并更新缓存。 | 侧边栏 | `handleReExtractContent`, `storage`, `contentExtractor` |
| **LLM 通信** | | | |
| `SEND_LLM_MESSAGE` | 将用户的消息和上下文发送给配置的大语言模型 (LLM) 服务。 | 侧边栏 | `handleSendLlmMessage`, `llmService`, `loadingStateCache` |
| `CANCEL_LLM_REQUEST` | 取消一个正在进行的 LLM 请求。 | 侧边栏 | `handleCancelLlmRequest`, `loadingStateCache` |
| `CANCEL_ALL_LLM_REQUESTS` | 取消所有正在进行的 LLM 请求。 | 侧边栏 | `handleCancelAllLlmRequests`, `loadingStateCache` |
| **数据管理** | | | |
| `CLEAR_URL_DATA` | 永久删除与特定 URL 相关的所有数据（包括内容缓存和聊天记录）。 | 侧边栏 | `handleClearUrlData`, `storage` |
| `SAVE_CHAT_HISTORY` | 保存或更新指定 URL 的聊天记录。 | 侧边栏 | `handleSaveChatHistory`, `storage` |
| `GET_CHAT_HISTORY` | 获取指定 URL 的聊天记录。 | 侧边栏 | `handleGetChatHistory`, `storage` |
| `GET_ALL_PAGE_METADATA` | 获取所有已存储页面的元数据列表（用于“对话”页面）。 | 对话页面 | `handleGetAllPageMetadata`, `storage` |
| `EXPORT_CONVERSATION` | 导出指定页面的对话为 Markdown 文件。 | 侧边栏 | `handleExportConversation` |
| **配置管理** | | | |
| `GET_CONFIG` | 获取当前的扩展程序配置。 | 侧边栏, 选项页 | `handleGetConfig`, `storageConfigManager` |
| `SAVE_CONFIG` | 保存用户修改后的配置。 | 选项页 | `handleSaveConfig`, `storageConfigManager` |
| `RESET_CONFIG` | 将所有配置重置为默认值。 | 选项页 | `handleResetConfig`, `storageConfigManager` |
| `CHECK_CONFIG_HEALTH` | 检查配置的健康状况，修复可能存在的问题。 | 选项页 | `handleCheckConfigHealth`, `storageConfigManager` |
| **状态管理** | | | |
| `GET_LOADING_STATE` | 查询特定请求（如 LLM 响应）的加载状态。 | 侧边栏 | `handleGetLoadingState`, `loadingStateCache` |
| `CLEAR_LOADING_STATE` | 清除特定请求的加载状态。 | 侧边栏 | `handleClearLoadingState`, `loadingStateCache` |
| `CLEAR_ALL_LOADING_STATES_FOR_URL` | 清除与特定 URL 相关的所有加载状态。 | 侧边栏 | `handleClearAllLoadingStatesForUrl`, `loadingStateCache` |
| `SAVE_PAGE_STATE` | 保存页面的 UI 状态（如滚动位置、输入框内容）。 | 侧边栏 | `handleSavePageState`, `storage` |
| `GET_PAGE_STATE` | 获取页面的 UI 状态。 | 侧边栏 | `handleGetPageState`, `storage` |
| **黑名单管理** | | | |
| `GET_BLACKLIST_PATTERNS` | 获取所有黑名单规则。 | 选项页 | `handleGetBlacklistPatterns` |
| `ADD_BLACKLIST_PATTERN` | 添加一条新的黑名单规则。 | 选项页 | `handleAddBlacklistPattern` |
| `UPDATE_BLACKLIST_PATTERN` | 更新一条已有的黑名单规则。 | 选项页 | `handleUpdateBlacklistPattern` |
| `DELETE_BLACKLIST_PATTERN` | 删除一条黑名单规则。 | 选项页 | `handleDeleteBlacklistPattern` |
| `CHECK_BLACKLIST_URL` | 检查给定的 URL 是否匹配黑名单。 | 侧边栏 | `handleCheckBlacklistUrl` |
| `TEST_BLACKLIST_PATTERN` | 测试一个黑名单正则表达式。 | 选项页 | `handleTestBlacklistPattern` |
| `RESET_BLACKLIST_TO_DEFAULTS` | 将黑名单规则重置为默认列表。 | 选项页 | `handleResetBlacklistToDefaults` |
| **数据同步** | | | |
| `TEST_SYNC_CONNECTION` | 测试与 GitHub Gist 的连接是否正常。 | 选项页 | `handleTestSyncConnection` |
| `GET_SYNC_CONFIG` | 获取用于导出的同步配置。 | 选项页 | `handleGetSyncConfig` |
