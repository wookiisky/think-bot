### 启动流程分析

1.  **用户点击扩展图标**：用户在浏览器工具栏点击“页面机器人”扩展图标，启动流程。

2.  **`background/service-worker.js` - `chrome.action.onClicked`**：
    *   `service-worker.js` 脚本监听此点击事件。
    *   它会检查当前页面是否为受限制的URL（例如 `chrome://` 页面）。
        *   如果是，扩展会在新标签页中打开 `conversations/conversations.html` 页面。
        *   如果不是，则继续打开侧边栏。
    *   调用 `chrome.sidePanel.open()` 来打开 `sidebar/sidebar.html`。
    *   延迟500毫秒后（以确保侧边栏加载完毕），向侧边栏发送一个 `SIDEBAR_OPENED` 消息，其中包含当前标签页的URL和ID。

3.  **`sidebar/sidebar.html` & `sidebar/sidebar.js` - 初始化**：
    *   加载 `sidebar.html` 文件，该文件会以模块形式加载 `sidebar.js`。
    *   `sidebar.js` 中的 `DOMContentLoaded` 事件被触发。
    *   **`UIManager.initElements()`**：缓存所有必要DOM元素的引用。
    *   **`StateManager.getConfig()`**：从存储中加载扩展的配置。
    *   **`ResizeHandler.applyPanelSize()`**：应用用户配置的面板尺寸。
    *   **`confirmationOverlay.init()`**：初始化用于黑名单警告的确认对话框。
    *   **`PageDataManager.setOnPageDataLoadedCallback(triggerAutoInputs)`**：设置一个回调函数，在页面内容提取后触发自动化的快捷输入。
    *   **`new ModelSelector()`**：初始化LLM模型选择器。
    *   **`TabManager.loadTabs()`**：加载快捷输入标签页。
    *   **`EventHandler.setupEventListeners()`**：设置所有的UI事件监听器（按钮、输入框等）。
    *   **`setupMessageListeners()`**：设置用于监听来自后台脚本的消息的监听器。侧边栏将在此处监听 `SIDEBAR_OPENED` 消息。

4.  **`sidebar/sidebar.js` - `handleSidebarOpened(message)`**：
    *   从服务工作线程接收到 `SIDEBAR_OPENED` 消息。
    *   使用标签页的URL和ID调用 `handleSidebarOpened` 函数。
    *   **`PageDataManager.checkBlacklistAndLoadData(url)`**：调用此函数检查当前URL是否在用户的黑名单中。
        *   如果URL在黑名单中，会向用户显示一个确认对话框。
            *   如果用户确认，流程继续。
            *   如果用户取消，侧边栏将关闭。
        *   如果URL不在黑名单中，则继续加载页面数据。

5.  **`sidebar/sidebar.js` - `PageDataManager.loadCurrentPageData()`**：
    *   此函数启动获取页面内容的过程。
    *   它向 `service-worker.js` 发送一个 `GET_PAGE_DATA` 消息。

6.  **`background/service-worker.js` - `handleGetPageData(data)`**：
    *   服务工作线程接收到 `GET_PAGE_DATA` 消息。
    *   它向在活动标签页上运行的 `content_script.js` 发送一个 `GET_HTML_CONTENT` 消息。

7.  **`content_scripts/content_script.js` - `chrome.runtime.onMessage`**：
    *   内容脚本接收到 `GET_HTML_CONTENT` 消息。
    *   它会检查页面是否完全加载。如果没有，则等待 `load` 事件。
    *   页面准备好后，它会将页面的HTML内容发送回服务工作线程。

8.  **`background/service-worker.js` - 内容提取**：
    *   服务工作线程从内容脚本接收HTML内容。
    *   它使用 `content_extractor.js` 模块，通过Readability.js库或其他配置的方法从HTML中提取主要内容。
    *   提取的内容被缓存在存储中。

9.  **`sidebar/sidebar.js` - 显示内容并完成启动**：
    *   服务工作线程将提取的内容发送回侧边栏。
    *   侧边栏接收内容并在“提取内容”区域显示它。
    *   触发 `onPageDataLoaded` 回调，该回调又会调用 `triggerAutoInputs()`。
    *   **`triggerAutoInputs()`**：此函数检查是否有任何配置为自动运行的“快捷输入”。如果找到，它会模拟点击它们，从而触发与LLM的预定义聊天交互。

从用户点击到显示提取内容和可能的自动交互的整个过程，构成了“页面机器人”侧边栏的启动流程。