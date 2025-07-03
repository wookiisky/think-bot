## i18n 故障诊断

... (previous steps) ...

### 步骤 11: 等待用户触发存储错误

- **结果**: **失败**。用户报告保存时没有错误，但侧边栏在打开时报告了一个新的错误。

### 步骤 12: 新的发现与最终诊断 - 运行时错误

- **关键证据**: 用户提供了侧边栏的错误日志: `[ImageHandler] Missing required elements for image handler`。
- **最终诊断**: 此错误发生在 `sidebar.js` 的 `DOMContentLoaded` 初始化序列中。由于我之前将 `i18n.applyToDOM()` 的调用放在了初始化的末尾，这个 `ImageHandler` 错误中断了脚本执行，导致翻译函数从未被调用。这才是问题的根本原因。

### 步骤 13: 最终修复计划

1.  **修复根源**: 调查并修复 `ImageHandler` 缺少的 HTML 元素问题。
2.  **优化健壮性**: 将 `i18n.applyToDOM()` 的调用移至所有相关JS文件 (`sidebar.js`, `options.js`, `conversations.js`) 中 `DOMContentLoaded` 监听器的最前面，确保翻译优先执行。