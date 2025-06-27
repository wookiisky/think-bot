# Think Bot 项目设计文档

## 项目概述

Think Bot 是一个Chrome扩展，允许用户与网页内容进行交互，使用大语言模型（LLM）来理解和回答关于网页内容的问题。主要功能包括网页内容提取、LLM对话、聊天历史管理等。

## 目录结构

```
page-bot/
├── background/              # 后台服务脚本
│   ├── service-worker.js    # 主服务工作进程
│   ├── utils.js             # 通用工具函数
│   └── handlers/            # 消息处理程序
├── content_scripts/         # 内容脚本
│   └── content_script.js    # 在网页上下文中运行的脚本
├── js/
│   ├── lib/                 # 第三方库
│   └── modules/             # 核心功能模块
│       ├── config_manager.js     # 配置管理
│       ├── content_extractor.js  # 内容提取器协调器
│       ├── llm_service.js        # LLM服务
│       ├── logger.js             # 日志系统
│       ├── storage.js            # 存储管理
│       ├── content_extract/      # 内容提取实现
│       └── llm_provider/         # LLM提供商实现
├── sidebar/                 # 侧边栏UI
│   ├── sidebar.html         # 侧边栏HTML
│   ├── styles/              # 侧边栏样式模块
│   │   ├── main.css              # 主样式文件
│   │   ├── base.css              # 基础样式和设计令牌
│   │   ├── buttons.css           # 按钮组件样式
│   │   ├── header.css            # 头部区域样式
│   │   ├── content-extraction.css # 内容提取样式
│   │   ├── chat.css              # 聊天界面样式
│   │   ├── markdown.css          # Markdown渲染样式
│   │   └── input.css             # 输入区域样式
│   ├── sidebar.js           # 侧边栏主逻辑
│   ├── modules/             # 侧边栏核心模块
│   │   ├── utils.js              # 通用工具函数
│   │   ├── state-manager.js      # 应用状态管理
│   │   ├── ui-manager.js         # UI状态和DOM操作
│   │   ├── message-handler.js    # 后台通信
│   │   ├── content-extractor.js  # 内容提取功能
│   │   ├── chat-manager.js       # 聊天相关功能
│   │   ├── resize-handler.js     # UI尺寸调整
│   │   └── image-handler.js      # 图片处理功能
│   ├── components/          # UI组件
│   │   ├── chat-message.js       # 聊天消息处理
│   │   └── quick-inputs.js       # 快速输入按钮管理
│   └── services/            # UI服务
├── options/                 # 选项页面
│   ├── options.html         # 选项页面HTML
│   └── default_options.json # 默认配置
├── offscreen/               # 离屏文档处理
├── icons/                   # 图标资源
└── manifest.json            # 扩展清单
```

## 核心模块功能

### 1. 后台服务工作进程 (Background Service Worker)

文件：`background/service-worker.js`

**功能**：
- 处理扩展安装/更新事件
- 响应扩展图标点击
- 处理标签页激活和URL更新事件
- 协调内容提取、LLM交互和消息处理
- 维护扩展状态

**主要接口**：
- `chrome.runtime.onInstalled` - 处理扩展安装和更新事件
  - 初始化配置管理器
  - 设置扩展的初始状态
- `chrome.action.onClicked` - 处理扩展图标点击
  - 检查当前页面是否受限
  - 在普通页面上打开侧边栏
  - 在受限页面上显示通知
- `chrome.tabs.onActivated` - 处理标签页激活事件
  - 由 `handleTabActivated` 函数处理
  - 检查新激活标签页的URL是否受限
  - 通知侧边栏更新状态
- `chrome.tabs.onUpdated` - 处理标签页URL更新事件
  - 由 `handleTabUpdated` 函数处理
  - 检测URL变化并触发内容重新提取
  - 更新存储中的页面数据
- `chrome.runtime.onMessage` - 处理来自内容脚本和侧边栏的消息
  - 根据消息类型分发到相应的处理函数

**消息处理函数**：
- `handleGetPageData` - 获取当前页面数据
  - 参数：tabId, url
  - 返回：页面提取内容、元数据和聊天历史
- `handleSwitchExtractionMethod` - 切换内容提取方法
  - 参数：method, tabId, url
  - 功能：使用新方法重新提取内容
- `handleReExtractContent` - 重新提取内容
  - 参数：tabId, url
  - 功能：使用当前方法重新提取内容
- `handleSendLlmMessage` - 发送消息到LLM
  - 参数：message, includePageContent, url
  - 功能：调用LLM服务并返回响应
- `handleClearUrlData` - 清除URL数据
  - 参数：url
  - 功能：从存储中删除指定URL的数据
- `handleGetConfig` - 获取配置
  - 返回：当前扩展配置
- `handleSaveConfig` - 保存配置
  - 参数：newConfig
  - 功能：更新存储中的配置
- `handleSaveChatHistory` - 保存聊天历史
  - 参数：url, chatHistory
  - 功能：更新存储中特定URL的聊天历史

**工具函数**：
- `safeSendMessage` - 安全地发送消息
- `safeSendTabMessage` - 安全地向特定标签页发送消息
- `isRestrictedPage` - 检查页面是否受限
- `checkSidePanelAllowed` - 检查是否允许侧边栏

### 2. 内容脚本 (Content Script)

文件：`content_scripts/content_script.js`

**功能**：
- 在网页上下文中运行
- 提取网页HTML内容
- 使用Readability.js进行内容提取
- 与后台脚本通信

**主要接口**：
- `chrome.runtime.onMessage` - 处理来自后台脚本的消息
  - `GET_HTML_CONTENT` - 获取页面HTML内容
    - 返回：{ htmlContent: string }
    - 处理页面未完全加载的情况，设置5秒超时
  - `EXTRACT_WITH_READABILITY` - 使用Readability.js提取内容
    - 返回：{ title, content, textContent, excerpt }
    - 如Readability.js不可用，回退到基本提取

**主要变量**：
- `pageLoaded` - 跟踪页面是否完全加载
- `readabilityScript` - 存储可能注入的Readability.js脚本

**事件监听器**：
- `window.addEventListener('load')` - 检测页面完全加载
  - 设置pageLoaded标志
  - 允许在页面加载后响应消息

### 3. 配置管理器 (Config Manager)

文件：`js/modules/config_manager.js`

**功能**：
- 管理扩展配置
- 提供默认配置
- 保存和加载用户配置
- 确保配置字段的兼容性

**主要接口**：
- `getDefaultConfig()` - 获取默认配置
  - 尝试从'/options/default_options.json'加载
  - 如果失败，回退到硬编码默认值
  - 返回：包含所有配置键值的对象
- `initializeIfNeeded()` - 初始化配置
  - 检查chrome.storage.sync中是否有配置
  - 如果没有，初始化默认配置
- `getConfig()` - 获取当前配置
  - 从chrome.storage.sync获取配置
  - 与默认配置合并，确保所有字段存在
  - 返回：合并后的配置对象
- `saveConfig(newConfig)` - 保存配置
  - 参数：newConfig - 新配置对象
  - 将配置保存到chrome.storage.sync
  - 返回：布尔值，表示操作是否成功
- `resetConfig()` - 重置配置到默认值
  - 获取默认配置并保存
  - 返回：布尔值，表示操作是否成功

**配置结构**：
```javascript
{
  defaultExtractionMethod: string, // 'readability' 或 'jina'
  jinaApiKey: string,
  jinaResponseTemplate: string,
  llm: {
    defaultProvider: string, // 'openai' 或 'gemini'
    providers: {
      openai: {
        apiKey: string,
        baseUrl: string,
        model: string
      },
      gemini: {
        apiKey: string,
        model: string
      }
    }
  },
  systemPrompt: string,
  quickInputs: Array<{ displayText: string, sendText: string }>,
  contentDisplayHeight: number
}
```

### 4. 内容提取器 (Content Extractor)

文件：`js/modules/content_extractor.js`

**功能**：
- 协调不同的内容提取方法
- 支持Readability和Jina AI提取方法
- 委托给专门的提取器模块

**主要接口**：
- `extract(url, htmlString, method, config)` - 主提取方法
  - 参数：
    - url: string - 要提取内容的URL
    - htmlString: string - 页面的HTML内容
    - method: string - 提取方法('readability'或'jina')
    - config: object - 提取配置，包含API密钥等
  - 返回：提取的内容
  - 错误处理：抛出带有描述性消息的错误

**依赖模块**：
- `/js/modules/content_extract/jina_extractor.js` - Jina提取器实现
  - 提供`extractWithJina(url, apiKey, template)`方法
- `/js/modules/content_extract/readability_extractor.js` - Readability提取器实现
  - 提供`extractWithReadabilityViaOffscreen(htmlString, url)`方法

**提取方法**：
- **Readability提取**:
  1. 使用Readability.js解析HTML内容
  2. 通过离屏文档处理，避免内容脚本限制
  3. 返回结构化内容：标题、正文、纯文本和摘要
- **Jina AI提取**:
  1. 调用Jina AI API进行内容提取
  2. 使用API密钥进行身份验证
  3. 使用提供的模板格式化响应
  4. 返回结构化内容

### 5. LLM服务 (LLM Service)

文件：`js/modules/llm_service.js`

**功能**：
- 管理与大语言模型的交互
- 支持不同的LLM提供商（OpenAI和Gemini）
- 处理API调用和响应

**主要接口**：
- `callLLM(messages, llmConfig, systemPrompt, imageBase64, streamCallback, doneCallback, errorCallback)` - 主调用方法
  - 参数：
    - messages: Array - 消息历史
    - llmConfig: Object - LLM配置，包含provider和model
    - systemPrompt: string - 系统提示
    - imageBase64: string - 可选的图像数据
    - streamCallback: Function - 流式响应回调
    - doneCallback: Function - 完成回调
    - errorCallback: Function - 错误回调
  - 根据provider参数选择合适的LLM提供商实现
  - 错误处理：记录错误并调用errorCallback

**依赖模块**：
- `/js/modules/llm_provider/gemini_provider.js` - Gemini提供商实现
  - 提供`execute(messages, llmConfig, systemPrompt, imageBase64, streamCallback, doneCallback, errorCallback)`方法
- `/js/modules/llm_provider/openai_provider.js` - OpenAI提供商实现
  - 提供`execute(messages, llmConfig, systemPrompt, imageBase64, streamCallback, doneCallback, errorCallback)`方法

**LLM调用流程**：
1. 记录调用信息（不包含敏感数据）
2. 根据provider选择相应的提供商
3. 检查提供商模块是否正确加载
4. 调用提供商的execute方法处理请求
5. 捕获并处理任何错误

### 6. 存储管理 (Storage)

文件：`js/modules/storage.js`

**功能**：
- 管理扩展数据存储
- 存储网页内容和聊天历史
- 提供数据持久化

**主要接口**：
- `storePageData(url, data)` - 存储页面数据
  - 参数：
    - url: string - 页面URL
    - data: object - 页面数据（内容、元数据等）
  - 使用chrome.storage.local存储数据
  - 实现URL键管理和数据压缩

- `getPageData(url)` - 获取页面数据
  - 参数：url: string - 页面URL
  - 返回：存储的页面数据，如果不存在则返回null
  - 处理数据解压缩

- `storeChatHistory(url, chatHistory)` - 存储聊天历史
  - 参数：
    - url: string - 页面URL
    - chatHistory: array - 聊天消息数组
  - 更新现有页面数据的聊天历史

- `clearUrlData(url)` - 清除URL数据
  - 参数：url: string - 页面URL
  - 从存储中删除指定URL的所有数据

- `getAllStoredUrls()` - 获取所有存储的URL
  - 返回：存储中所有URL的数组

**存储数据结构**：
```javascript
{
  [urlKey]: {
    url: string,
    title: string,
    content: string,
    textContent: string,
    extractionMethod: string,
    extractionTime: number,
    chatHistory: Array<{
      role: string,  // 'user' 或 'assistant'
      content: string,
      timestamp: number
    }>
  }
}
```

**存储优化**：
- 实现数据压缩/解压缩减少存储空间使用
- 管理存储限制，实现LRU（最近最少使用）数据清理
- 监控存储使用情况，避免超出Chrome存储限制

### 7. 日志系统 (Logger)

文件：`js/modules/logger.js`

**功能**：
- 提供模块化日志记录
- 支持不同的日志级别
- 帮助调试和问题诊断

**主要接口**：
- `createModuleLogger(moduleName)` - 创建模块日志记录器
  - 参数：moduleName: string - 模块名称
  - 返回：具有日志方法的日志记录器对象
  - 每个模块的日志会自动带有模块标识

- 日志方法：
  - `info(message, data)` - 记录信息级别日志
  - `warn(message, data)` - 记录警告级别日志
  - `error(message, data)` - 记录错误级别日志
  - `debug(message, data)` - 记录调试级别日志

- `setLogLevel(level)` - 设置全局日志级别
  - 参数：level: string - 'debug', 'info', 'warn', 'error'中的一个
  - 控制哪些日志会被显示

- `enableConsoleOutput(enabled)` - 启用/禁用控制台输出
  - 参数：enabled: boolean - 是否启用控制台输出
  - 允许在生产环境中禁用日志输出

**日志格式**：
```
[LEVEL] [TIMESTAMP] [MODULE]: MESSAGE DATA
```

**高级功能**：
- 日志缓冲，允许在需要时导出最近的日志
- 日志过滤，基于级别和模块名称
- 可配置的日志格式化

### 8. 侧边栏 (Sidebar)

文件：`sidebar/sidebar.html`, `sidebar/sidebar.js`, `sidebar/styles/`, `sidebar/modules/`, `sidebar/components/`

**功能**：
- 提供用户界面
- 显示提取的内容
- 管理用户与LLM的交互
- 提供快速输入按钮
- 支持聊天历史管理

**模块化架构**：
- **核心模块** (`sidebar/modules/`)：
  - `state-manager.js` - 应用状态管理
  - `ui-manager.js` - UI状态和DOM操作
  - `message-handler.js` - 与后台服务通信
  - `content-extractor.js` - 内容提取功能
  - `chat-manager.js` - 聊天相关功能
  - `resize-handler.js` - UI尺寸调整
  - `image-handler.js` - 图片处理功能
  - `utils.js` - 通用工具函数

- **UI组件** (`sidebar/components/`)：
  - `quick-inputs.js` - 快速输入按钮管理
  - `chat-message.js` - 聊天消息处理

- **主入口文件** (`sidebar/sidebar.js`)：
  - 整合所有模块
  - 初始化应用
  - 设置主要事件监听
  - 协调模块间交互

**主要UI组件**：
- 提取控制区域 - 选择提取方法和操作按钮
- 内容显示区域 - 显示提取的网页内容
- 聊天区域 - 显示与LLM的对话
- 输入区域 - 用户输入问题
- 快速输入按钮 - 预定义的问题模板

**主要接口**：
- 初始化函数:
  - `setupEventListeners()` - 设置所有事件监听器
  - `loadCurrentPageData()` - 加载当前页面数据
  - `loadQuickInputs()` - 从配置加载快速输入按钮

- 内容提取:
  - `switchExtractionMethod(method)` - 切换提取方法
  - `reExtractContent(method)` - 重新提取内容
  - `handlePageDataLoaded(data)` - 处理页面数据加载完成

- 聊天功能:
  - `sendUserMessage()` - 发送用户消息到LLM
  - `handleQuickInputClick(displayText, sendTextTemplate)` - 处理快速输入按钮点击
  - `clearConversationAndContext()` - 清除对话和上下文
  - `exportConversation()` - 导出对话

- 状态管理:
  - 通过StateManager模块管理应用状态
  - 通过UIManager模块管理UI状态

**模块间通信**：
- 通过明确的公共API进行模块间交互
- 状态管理模块作为中央数据存储
- 消息处理模块负责与后台服务通信
- UI管理模块处理DOM操作和视觉反馈

**与后台通信**：
- 通过message-handler.js模块封装所有通信逻辑
- 发送消息类型：
  - `GET_PAGE_DATA` - 获取当前页面数据
  - `SWITCH_EXTRACTION_METHOD` - 切换提取方法
  - `RE_EXTRACT_CONTENT` - 重新提取内容
  - `SEND_LLM_MESSAGE` - 发送消息到LLM
  - `CLEAR_URL_DATA` - 清除URL数据
  - `GET_CONFIG` - 获取配置
  - `SAVE_CHAT_HISTORY` - 保存聊天历史

## 主要逻辑流程

### 1. 扩展启动和初始化流程

1. 扩展安装或Chrome启动时，加载service-worker.js
2. service-worker执行初始化：
   - 创建日志记录器
   - 导入必要的模块和处理程序
   - 设置事件监听器
3. 扩展安装/更新时触发chrome.runtime.onInstalled事件：
   - 初始化配置管理器 `configManager.initializeIfNeeded()`
   - 记录启动日志 `serviceLogger.info('Think Bot extension installed or updated')`
4. 后台服务保持活跃状态，等待用户交互

### 2. 内容提取流程

1. 用户激活扩展或切换到新标签页
   - 标签页激活时触发`chrome.tabs.onActivated`事件
   - 调用`handleTabActivated`处理程序

2. 检查页面是否可处理
   - 使用`isRestrictedPage`函数检查URL
   - 如果是受限页面，通知侧边栏显示受限状态
   - 如果是普通页面，继续内容提取

3. 获取页面HTML内容
   - 后台服务向内容脚本发送`GET_HTML_CONTENT`消息
   - 内容脚本检查页面是否完全加载
   - 如果已加载，立即返回HTML
   - 如果未加载，设置超时或等待加载完成后返回

4. 提取内容
   - 根据当前配置选择提取方法（Readability或Jina AI）
   - 如果是Readability方法：
     - 调用`extractWithReadabilityViaOffscreen`
     - 在离屏文档中处理HTML内容
     - 返回结构化的文章内容
   - 如果是Jina AI方法：
     - 调用`extractWithJina`
     - 发送API请求到Jina AI服务
     - 使用模板格式化返回的内容

5. 存储和显示提取的内容
   - 使用`storage.storePageData`保存提取结果
   - 向侧边栏发送提取内容 
   - 侧边栏使用`displayExtractedContent`显示内容

### 3. LLM交互流程

1. 用户在侧边栏输入问题
   - 侧边栏捕获输入事件
   - 用户可选择是否包含页面内容（通过toggleIncludePageContent按钮）

2. 发送消息到后台服务
   - 侧边栏发送`SEND_LLM_MESSAGE`消息
   - 参数包括：用户消息、是否包含页面内容和当前URL

3. 后台服务准备上下文
   - 调用`handleSendLlmMessage`处理程序
   - 如果需要包含页面内容，从存储获取内容
   - 准备消息数组，包括系统提示、页面内容和用户消息

4. 调用LLM服务
   - 获取当前LLM配置（provider、model和API密钥）
   - 调用`llmService.callLLM`方法
   - 根据provider参数选择OpenAI或Gemini实现
   - 提供商实现构建API请求并发送

5. 处理LLM响应
   - 对于流式响应，使用streamCallback逐步更新UI
   - 处理完成后，调用doneCallback
   - 错误处理通过errorCallback提供

6. 更新侧边栏界面
   - 显示助手响应
   - 将对话添加到聊天历史
   - 保存更新后的聊天历史

### 4. 配置管理流程

1. 扩展安装或更新时初始化配置
   - 调用`configManager.initializeIfNeeded()`
   - 检查存储中是否有配置
   - 如果没有，加载默认配置并保存

2. 用户访问选项页面
   - 加载`options/options.html`
   - 通过`GET_CONFIG`消息获取当前配置
   - 在界面上显示当前配置值

3. 用户修改配置
   - 捕获输入和选择事件
   - 验证输入是否有效
   - 构建新的配置对象

4. 保存配置
   - 发送`SAVE_CONFIG`消息到后台服务
   - 后台服务调用`configManager.saveConfig`
   - 配置保存到chrome.storage.sync

5. 配置应用
   - 各模块通过`configManager.getConfig()`获取最新配置
   - 配置变更立即应用于新操作
   - 无需重启扩展

### 5. 标签页状态管理流程

1. 标签页激活
   - 触发`chrome.tabs.onActivated`事件
   - 调用`handleTabActivated`函数
   - 获取新标签页的URL和ID

2. 检查标签页兼容性
   - 使用`isRestrictedPage`检查URL
   - 如果是受限页面，通知侧边栏
   - 如果是普通页面，检查是否有缓存数据

3. 标签页URL更新
   - 触发`