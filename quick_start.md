[中文](quick_start.md) | [English](quick_start.en.md)
# 快速上手教程

## 配置大模型
在扩展设置页面，选择『语言模型』，点击右上角『添加新模型』按钮创建新的大模型配置。
然后需要获取大模型的API信息，现在大多平台都有免费使用的额度。

### 免费大模型API
https://github.com/cheahjs/free-llm-api-resources

### 国外（大多数需要可以访问国外的网络）
#### 谷歌的Gemini
获取API key
1. 访问 [https://aistudio.google.com/api-keys](https://aistudio.google.com/api-keys),登录账号
2. 点击"Create API key"按钮
3. 输入名称，没有project则随便创建一个
4. 复制API Key部分的文本（AI开头的长串）

配置：
0. 服务提供商选择Gemini
1. Base URL配置：https://generativelanguage.googleapis.com
2. 模型id：   
- gemini-2.5-pro: 强大，但速度慢（**推荐**）
- gemini-flash-latest：比上一个快，效果不如pro
- gemini-3-pro-preview：需要是付费账户

免费额度参考：https://ai.google.dev/gemini-api/docs/pricing

#### OpenAI（GPT 系列）

获取 API key：

1. 打开 [https://platform.openai.com](https://platform.openai.com) 并登录你的 OpenAI 账号。
2. 顶部或左侧菜单找到 **API Keys**，也可以直接访问 [https://platform.openai.com/api-keys](https://platform.openai.com/api-keys)。 
3. 点击 **Create new secret key**，填写名称后创建密钥。
4. 复制生成的密钥并妥善保存（只会完整显示一次）。

配置：
0. 服务提供商选择“OpenAI兼容”
1. Base URL 配置：`https://api.openai.com/v1` 
2. 模型id：[https://platform.openai.com/docs/models](https://platform.openai.com/docs/models)

- gpt-5.1: 最新模型

价格参考：[https://openai.com/zh-Hans-CN/api/pricing/](https://openai.com/zh-Hans-CN/api/pricing/)

#### OpenRouter

获取 API key：

1. 访问 [https://openrouter.ai](https://openrouter.ai) 并注册登录账号。
2. 进入账户设置页面，在 **API Keys** 部分创建新的 API Key。
3. 复制生成的密钥并妥善保存。
4. 新用户有免费模型和额度。

配置：
0. 服务提供商选择"OpenAI兼容"
1. Base URL 配置：`https://openrouter.ai/api`
2. 模型id：根据实际id选择

说明：
- OpenRouter 是一个 AI 模型聚合平台，可以通过统一 API 访问多个不同厂商的模型
- 支持的模型列表：[https://openrouter.ai/models](https://openrouter.ai/models)

价格参考：[https://openrouter.ai/docs/pricing](https://openrouter.ai/docs/pricing)

### 国内

#### Kimi（Moonshot AI）

获取 API key：

1. 访问 Kimi 大模型开放平台：[https://platform.moonshot.cn](https://platform.moonshot.cn) 并注册登录账号。
2. 在控制台中找到「API 密钥」或「访问密钥」页面，创建新的 API Key。
3. 新用户通常会赠送一定额度。

配置：
0. 服务提供商选择“OpenAI兼容”
1. Base URL 配置（OpenAI 兼容）：`https://api.moonshot.cn` 
2. 常用模型 id（示例）：

- `kimi-k2-turbo-preview`：速度快，适合日常对话、编码等
- `kimi-k2-thinking`：思考版，推理能力更强
- `kimi-latest`：始终指向线上最新版本的 Kimi 模型


价格与额度参考：

- 模型与计费说明：[https://platform.moonshot.cn/docs/pricing/chat](https://platform.moonshot.cn/docs/pricing/chat) 

#### DeepSeek

获取 API key：

1. 访问 DeepSeek 平台：[https://platform.deepseek.com](https://platform.deepseek.com) 并注册登录。
2. 进入「API Keys」页面（也可以直接访问 [https://platform.deepseek.com/api_keys](https://platform.deepseek.com/api_keys)），创建新的 API key。

配置：
0. 服务提供商选择“OpenAI兼容”
1. Base URL 配置：`https://api.deepseek.com`
2. 常用模型 id：

- `deepseek-chat`：默认对话模型（非思考模式），底层对应 **DeepSeek-V3.2-Exp**
- `deepseek-reasoner`：思考模式，适合复杂推理，同样基于 **DeepSeek-V3.2-Exp**

价格与额度参考：

- 模型 & 价格文档：[https://api-docs.deepseek.com/zh-cn/quick_start/pricing/](https://api-docs.deepseek.com/zh-cn/quick_start/pricing/) 

#### 通义千问

获取 API key：

1. 注册阿里云账号，并开通「大模型服务平台百炼」：文档入口见「首次调用通义千问 API」。
2. 前往「密钥管理」页面创建 API Key（文档中给出的示例链接：
   [https://bailian.console.alibabacloud.com/?tab=model#/api-key](https://bailian.console.alibabacloud.com/?tab=model#/api-key)）。 

配置（OpenAI 兼容模式）：
0. 服务提供商选择“OpenAI兼容”
1. Base URL
   - 新加坡地域：`https://dashscope-intl.aliyuncs.com/compatible-mode`
   - 北京地域：`https://dashscope.aliyuncs.com/compatible-mode`
2. 模型 id（示例）：
- `qwen-plus`：强大的通用对话模型，官方示例代码中默认使用该模型。
价格 / 模型列表参考：

价格：[https://help.aliyun.com/zh/model-studio/models](https://help.aliyun.com/zh/model-studio/models) 

#### 豆包（字节跳动）

获取 API key：

1. 访问火山引擎「豆包大模型」平台：[https://console.volcengine.com/ark](https://console.volcengine.com/ark) 并注册登录。
2. 创建推理接入点（Endpoint），选择需要使用的模型。
3. 在「API Key 管理」页面创建新的 API Key。
4. 新用户通常会赠送一定的免费额度。

配置：
0. 服务提供商选择"OpenAI兼容"
1. Base URL 配置：`https://ark.cn-beijing.volces.com/api/v3/chat/completions#`
2. 模型 id：需要使用你创建的推理接入点的 Endpoint ID 或者模型id

常用模型（示例）：
- doubao-seed-1-6-251015：性能强大的旗舰模型

价格与额度参考：

- 模型与计费说明：[https://www.volcengine.com/docs/82379/1099320](https://www.volcengine.com/docs/82379/1099320)
- API 文档：[https://www.volcengine.com/docs/82379/1263482](https://www.volcengine.com/docs/82379/1263482)

## 对话管理页面

有以下几种方式打开对话管理页面：
1. 右键单击扩展栏的按钮，选择“对话管理”
2. 左键点击扩展栏的按钮打开扩展栏后，扩展栏右上角“对话管理”按钮
3. 在扩展管理等chrome内部页面，左键点击扩展栏的按钮，不会打开侧边栏，而是会直接打开对话管理页面。

