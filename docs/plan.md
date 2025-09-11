# 技术方案：对话分叉功能

## 1. 概述

本文档旨在为 `think-bot` 插件实现对话分叉（Branching）功能提供详细的技术方案。该功能允许用户基于任意一轮对话，使用不同的模型生成多个并行的回答，并将这些回答以分栏的形式展示。方案将重点关注数据结构的修改、旧数据兼容、复用现有逻辑以及前后端的交互实现。

desc.md: 需求文档

## 2. 数据结构变更

为了支持单一用户问题对应多个模型回答，我们需要将当前的对话历史数据结构进行升级。

### 2.1 新的对话历史结构

当前每一轮对话由一个用户消息和一个助手消息组成。我们将修改助手消息的结构，使其能够包含一个响应数组（`responses`）。

**旧结构示例**:
```json
[
  { "role": "user", "content": "你好" },
  { "role": "assistant", "content": "你好，有什么可以帮您？", "model": "gemini-pro" }
]
```

**新结构设计**:
我们将把 `assistant` 角色的消息从一个单一对象升级为一个包含 `responses` 数组的对象。数组中的每一项都是一个独立的分支，拥有自己的ID、模型信息和内容。

```json
[
  { "role": "user", "content": "你好" },
  {
    "role": "assistant",
    "responses": [
      {
        "branchId": "b1-a7c8-4f5e-8b6a-2e9d7f3c1b0e",
        "model": "gemini-pro",
        "content": "你好，有什么可以帮您？"
      },
      {
        "branchId": "b2-d9f2-4a3b-9c1d-8e4b1a0c5d7f",
        "model": "claude-3-opus",
        "content": "您好！今天我能为您做些什么？"
      }
    ]
  }
]
```
**优点**:
-   **最小化变更**: 仅修改了 `assistant` 消息的结构，`user` 消息保持不变。
-   **易于扩展**: `responses` 数组可以轻松地增加、删除或修改，方便管理多个分支。
-   **信息完备**: 每个分支都包含独立的 `branchId` 和 `model` 信息，便于追踪和展示。

#### 2.1.1 分支对象字段定义

为支持状态管理、取消/删除、导出与统计，每个 `responses` 项建议包含如下字段（可按需精简持久化）：

```json
{
  "branchId": "string",                // 分支唯一ID
  "model": "string",              // 模型名
  "content": "string",                 // 渲染用最终文本（流式时可增量拼接）
  "status": "loading|done|error",     // 分支生成状态
  "errorMessage": "string|null",       // 错误信息（status=error时）  
  "updatedAt": 0,                        // unix ms
  
}
```

说明：
-   `status` 用于 UI 决定是否展示 loading、停止/删除按钮可用态等。
-   `model` 用于在 UI 悬浮按钮下方的小字展示模型名（需求要求）。

### 2.2 数据迁移与向后兼容

为了保证旧版本对话数据的正常使用，我们需要在加载数据时进行动态迁移。

**迁移策略**:
在获取对话历史的逻辑中（如 `background/handlers/getChatHistoryHandler.js`），增加一个迁移函数。该函数会遍历加载的对话历史数据：
1.  检查消息是否为 `role: 'assistant'`。
2.  如果是，并且消息结构不包含 `responses` 字段，则判定为旧数据。
3.  将旧数据转换为新结构。

**转换示例**:
```javascript
// 识别到的旧数据
const oldMessage = {
  role: 'assistant',
  content: '这是一个旧的回答。',
  model: 'legacy-model'
};

// 转换为新结构
const newMessage = {
  role: 'assistant',
  responses: [
    {
      branchId: `main-${Date.now()}`, // 生成一个唯一的默认ID
      model: oldMessage.model || 'unknown', // 保留旧模型信息或设为未知
      content: oldMessage.content
    }
  ]
};
```
此迁移在内存中动态完成，不会修改存储在本地的原始文件，保证了数据的安全性和可逆性。所有保存操作将统一使用新数据结构。

### 2.3 分支 ID 生成

-   优先使用 `crypto.randomUUID()` 生成 `branchId`；若环境不支持，则回退 `Date.now() + '-' + Math.random().toString(36).slice(2)`。
-   建议增加固定前缀（如 `br-`）便于日志检索与人读。

## 3. 核心功能实现

### 3.1 UI 变更 (`sidebar/components/chat-message.js`)

1.  **多列消息布局**:
    -   渲染助手消息的容器需要从块级元素改为 `Flexbox` 或 `Grid` 布局。
    -   通过遍历 `message.responses` 数组，为每个分支动态创建一个消息列。
    -   每个消息列都是一个独立的展示单元，包含消息内容、模型名称和独立的悬浮按钮。

2.  **悬浮按钮**:
    -   在每个消息列的悬浮按钮组中，新增 "分支 (Branch)" 和 "删除此分支 (Delete Branch)" 按钮：
        -   生成中展示："停止并删除此分支"（点击先取消流，再删除）。
        -   生成完成后展示："删除此分支"。
    -   悬浮按钮区域下方以小字号文本展示当前分支所用模型名（来自 `response.meta.modelLabel` 或 `model`）。
    -   点击 "分支" 按钮时，在按钮下方弹出一个模型列表下拉菜单（见 3.6）。

### 3.2 分支创建逻辑 (`sidebar/modules/chat-manager.js`)

1.  **触发调用**: 用户从下拉菜单中选择一个模型后，触发分支创建流程。
2.  **构建上下文**:
    -   定位到当前操作的助手消息在整个对话历史中的索引。
    -   截取从对话开始到当前助手消息之前的对话消息为止的上下文历史。这是调用新模型所需的核心上下文。
3.  **更新UI与数据**:
    -   在当前助手消息的 `responses` 数组中，添加一个新的分支对象，初始内容为空，`status=loading`，`createdAt/updatedAt` 赋值。
    -   UI上即时渲染出一个新的消息列，并显示加载动画（复用现有loading组件，停止并删除分支按钮）。
4.  **调用大模型**:
    -   调用 `chrome.runtime.sendMessage` 发送 `SEND_LLM_MESSAGE` 事件，参数包含：上下文消息、新选择的模型、`branchId`、`tabId`、可选生成参数（温度、maxTokens 等）。
5.  **状态管理**:
    -   复用 `request-tracker.js`：为每个分支请求生成请求ID，并与 `tabId + branchId` 建立映射；支持通过 `branchId` 精确取消。
    -   UI 通过 `getLoadingStateHandler` 传入 `branchId` 查询加载状态，实现独立 loading/停止控制。
    -   流式返回的数据帧应包含 `branchId`，前端按 `branchId` 将增量内容追加至对应列，结束时写入 `usage/finishReason`、`status=done|error`，并更新 `updatedAt`。

### 3.3 继续对话

当用户输入新消息继续对话时，默认使用第一个分支（主分支）作为上下文。
-   在构建发送给大模型的对话历史时，遍历当前所有轮次。
-   当遇到 `role: 'assistant'` 的消息时，取其 `responses[0]` 的内容作为一个标准助手消息 `{ role: 'assistant', content: responses[0].content }` 添加到上下文中。
    -   若 `responses[0].status !== 'done'`，则跳过该轮或回退到最近一次已完成的分支；避免将未完成内容作为上下文。

> 备注：继续聊天默认取第一列（主分支）符合需求；后续如需支持主分支切换，可在 `assistant` 层增加 `mainIndex` 字段，但本期不实现。

### 3.4 删除分支

-   点击 "删除此分支" 按钮，获取对应的 `branchId`。
-   从 `responses` 数组中移除具有该 `branchId` 的对象。
-   如果 `responses` 数组为空，则整轮对话（包括之前的用户消息）都将被删除。
-   更新UI并触发保存对话历史的操作。

### 3.5 取消与中断（复用现有逻辑）

-   进行中的分支支持在该列的悬浮区点击“停止并删除此分支”。流程：
    1.  调用 `cancelLlmRequestHandler`，参数包含 `tabId` 与 `branchId`；
    2.  等待后台确认取消（或设定超时回退）；
    3.  从 `responses` 中移除该 `branchId`；若该轮为空，则删除整轮；
    4.  保存历史与刷新 UI。

### 3.6 模型下拉：数据源与过滤

-   模型列表来源：读取配置中的启用的模型列表
-   i18n：下拉标题、搜索占位、空态提示使用 `_locales` 文案。

#### 3.6.1 交互细节

-   打开方式：点击分支按钮在其下方弹出；再次点击或失焦关闭。
-   选择行为：选择一项即刻触发分支创建并关闭下拉；按钮进入 loading 态避免重复触发。
-   禁用态：无可用模型时禁用分支按钮，并展示 `branch.noModels` 提示。
-   性能：首次获取模型列表后在内存缓存本次会话（页面级），变更设置后自动刷新缓存。


### 3.7 Markdown 展示

-   继续复用 `sidebar/js/marked-config.js` 与现有 markdown 渲染与样式；
-   多列布局下，确保代码块与表格横向滚动良好，避免列内溢出影响相邻列；
-   图片与数学公式（若有）遵循现有渲染策略。

### 3.8 边界与兼容策略

-   旧消息的 `assistant` 未含 `responses` 时按 2.2 动态迁移；
-   某分支 `model` 已在设置中禁用或不可用：依然展示历史内容，新增分支时不再提供该模型；
-   页面刷新/切换 Tab：确保基于 `branchId` 的 loading 状态可恢复或正确清理（见 4.3）。

## 4. 其他功能模块更新

### 4.1 对话历史存储 (`background/handlers/saveChatHistoryHandler.js`)

-   该模块无需大幅修改，只需确保其能正确接收并存储新的对话数据结构即可。由于数据迁移是在加载时完成的，所有保存的都将是新格式数据。

### 4.2 对话导出 (`sidebar/modules/export-utils.js`)

-   需要重构导出逻辑以支持分支展示。
-   **Markdown/Text 格式**:
    -   对于包含多个分支的助手消息，采用分割线的方式来顺序展示。
    -   在每列的顶部清晰地标示出所使用的模型名称。
    -   示例：
        ```markdown
        ---
        **User:** 什么是AI?

        --- Model: gemini-pro ---
        AI是人工智能的简称... 
        ---

        --- Model: claude-3-opus ---
        AI是... 
        ---
        ```
-   **JSON 格式**: 直接导出新的数据结构即可。

### 4.3 加载状态与请求跟踪（`background/request-tracker.js` 等）

-   为进程内请求状态增加 `branchId` 维度：键建议为 `{tabId}:{branchId}`；
-   `sendLlmMessageHandler.js` 下发与回传流式事件时均携带 `branchId`；
-   `getLoadingStateHandler.js`/`clearLoadingStateHandler.js` 支持按 `branchId` 查询/清理；
-   `cancelLlmRequestHandler.js`/`cancelAllLlmRequestsHandler.js` 接受 `branchId`，仅取消目标分支；
-   保持与既有 `tab` 级 loading 状态的兼容（页面顶层 loading 仍可汇总）。
    -   页面卸载/刷新时，`clearAllLoadingStatesForUrlHandler.js` 与 `clearUrlDataHandler.js` 应扩展支持按 `branchId` 清理，避免“幽灵”loading。

### 4.4 `conversations` 页面同步

-   `conversations/conversations.js` 模块需要同步更新，复用 `sidebar` 中更新后的消息渲染组件和逻辑，以确保在独立页面中也能正确地展示和管理带有分支的对话。

> 复用策略：优先抽取通用渲染与操作为可复用模块（例如将分支列渲染封装为 `renderBranchColumns()`），供 `sidebar` 与 `conversations` 共同使用，避免双处维护。

### 4.5 i18n

-   新增文案键（示例）：
    -   `branch.add`: "分支"
    -   `branch.delete`: "删除此分支"
    -   `branch.stopAndDelete`: "停止并删除此分支"
    -   `branch.model`: "模型"
    -   `branch.selectModel`: "选择模型"
    -   `branch.noModels`: "暂无可用模型"
-   同步更新 `_locales/en/messages.json` 与 `_locales/zh_CN/messages.json`；
-   使用 `js/modules/i18n.js` 获取文案，保持与现有键风格一致。

### 4.6 存储与同步（`js/modules/storage.js`、`js/modules/sync/*`）

-   `chat-history` 的存取统一使用新数据结构；
-   `sync/data_serializer.js` 如有 schema 版本，可记录 `schemaVersion` 便于后续扩展（本期可选）；
-   `gist_client.js`/`webdav_client.js` 无需特殊处理，仅确保 JSON 序列化与解序列化保持新结构。

> 隐私与安全：避免在日志与远端同步中记录敏感对话内容，usage 统计为可选并可在设置中关闭（可选）。

### 4.7 样式与布局（`sidebar/styles/chat.css` 等）

-   多列布局建议使用 CSS Grid：列宽可响应自适应，最小列宽保证可读（如 `minmax(320px, 1fr)`）；
-   横向滚动容器包裹列区，移动端可单列堆叠；
-   悬浮按钮与模型小字遵循现有视觉规范；
-   仅在关键步骤显示 loading/状态提示，避免过多干扰性视觉元素。

### 4.8 日志与错误处理

-   日志：使用 `js/modules/logger.js`，仅在关键操作打点（创建分支开始/结束、流式完成/错误、取消请求、删除分支），级别遵循 info/warn/error；
-   日志字段：`{ tabId, branchId, model, requestId, durationMs, finishReason }`，避免记录原文内容；
-   错误处理：
    -   流式错误：在对应分支列展示错误态（`status=error`）与简短可读文案（i18n），错误详情记录在 `errorMessage`；
    -   取消失败/超时：重试一次，仍失败时提示用户并允许“强制删除”分支；
    -   导出错误：给出失败原因并引导用户选择 JSON 导出作为回退；
-   只在关键步骤添加日志，避免噪音与性能开销。

## 5. 文件修改清单

-   `sidebar/components/chat-message.js`: 实现多列UI布局、分支按钮和模型下拉菜单。
-   `sidebar/modules/chat-manager.js`: 处理分支创建、删除和继续对话的核心交互逻辑。
-   `sidebar/modules/chat-history.js`: 适配新的数据结构，提供增删改查接口。
-   `background/handlers/getChatHistoryHandler.js`: **核心**，实现旧数据到新数据的兼容迁移逻辑。
-   `background/handlers/sendLlmMessageHandler.js`: 可能需要微调，以接收 `branchId` 并路由流式数据。
-   `background/request-tracker.js`: 确保能按 `branchId` 独立跟踪和取消请求。
-   `background/handlers/getLoadingStateHandler.js`: 支持按 `branchId` 查询加载状态。
-   `background/handlers/clearLoadingStateHandler.js`: 支持按 `branchId` 清理状态。
-   `background/handlers/cancelLlmRequestHandler.js`: 接收 `branchId`，仅取消目标分支。
-   `background/handlers/cancelAllLlmRequestsHandler.js`: 复核与分支维度的兼容性。
-   `background/handlers/clearAllLoadingStatesForUrlHandler.js`: 支持 `branchId` 维度清理，防止页面卸载遗留状态。
-   `sidebar/modules/export-utils.js`: 重构导出功能以支持分支。
-   `conversations/conversations.js`: 同步UI和逻辑变更。
-   `sidebar/styles/chat.css` (或相关CSS文件): 添加多列布局所需的样式。
-   `sidebar/modules/state-manager.js`: 若存在全局状态，增加 `branchId` 维度的读写辅助。
-   `sidebar/modules/model-selector.js`: 复用或扩展为分支下拉选择器（如已存在）。

## 6. 实施步骤 (Roadmap)

1.  **[第一阶段] 数据结构与兼容性**:
    -   在 `getChatHistoryHandler.js` 中实现数据迁移逻辑。
    -   在 `chat-history.js` 中适配数据结构。
    -   **目标**: 保证旧对话能正常加载并以新结构在内存中表示。

2.  **[第二阶段] UI渲染**:
    -   修改 `chat-message.js` 和相关CSS，实现基于新数据结构的多列渲染。
    -   **目标**: 带有分支的对话数据能够被正确地展示出来。

3.  **[第三阶段] 核心交互：创建与保存**:
    -   实现 "分支" 按钮、模型选择（3.6）、调用后台创建新分支的完整流程。
    -   对接流式响应与请求跟踪（4.3），确保加载、状态更新、使用量统计正确。
    -   支持进行中分支的“停止并删除”（3.5）。
    -   确保分支的增、删、改能被正确保存。

4.  **[第四阶段] 完善功能**:
    -   实现 "继续对话" 默认使用第一分支的逻辑（含未完成分支的回退策略）。
    -   重构导出功能（4.2），使其能够美观地展示分支并带模型名。
    -   同步更新 `conversations` 页面（4.4）。
    -   完成 i18n 文案与多语言适配（4.5）。

5.  **[第五阶段] 测试与优化**:
    -   对整个功能进行完整测试：
        -   数据迁移：旧数据 -> 新结构正确转换；无副作用写回；
        -   UI：多列渲染稳定、列宽自适应、移动端单列回退；
        -   模型下拉：无模型禁用、搜索/分组（若实现）、键盘可用；
        -   分支创建：上下文正确、去抖与重复点击防护、状态切换；
        -   流式路由：严格按 `branchId` 追加顺序一致、异常重连策略（如无则校验无数据错位）；
        -   取消与删除：进行中取消成功、失败重试、强制删除回退；最后一个分支删除时整轮删除；
        -   继续对话：默认第一分支，未完成跳过；
        -   导出：Markdown 含模型名与分割线、JSON 与内存结构一致；
        -   同步：序列化/反序列化一致，跨设备加载可迁移；
        -   i18n：中英文本案完整，未翻译键回退策略；
        -   性能：大对话（≥200 轮）下滚动与渲染可接受；
        -   日志：关键路径有打点，无敏感信息泄露；
    -   验收标准（摘选）：
        -   能在同一轮生成≥2个分支并独立取消/删除；
        -   刷新页面后无残留 loading，历史正常渲染；
        -   导出 Markdown/JSON 符合规范；
        -   继续对话严格使用第一分支；
        -   conversations 页面显示与 sidebar 一致。
