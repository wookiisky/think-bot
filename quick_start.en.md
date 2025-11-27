# Quick Start Guide

## Configure Language Models
On the extension settings page, select "Language Models", click the "Add New Model" button in the upper right corner to create a new language model configuration.
Then you need to obtain the API information of the language model. Most platforms now offer free usage quotas.

### Free Language Model APIs
https://github.com/cheahjs/free-llm-api-resources

### International (most require access to international networks)
#### Google Gemini
Get API key:
1. Visit [https://aistudio.google.com/api-keys](https://aistudio.google.com/api-keys) and log in to your account
2. Click the "Create API key" button
3. Enter a name, create a project if you don't have one
4. Copy the text in the API Key section (the long string starting with AI)

Configuration:
0. Select Gemini as the service provider
1. Base URL configuration: https://generativelanguage.googleapis.com
2. Model id:   
- gemini-2.5-pro: Powerful, but slower (**Recommended**)
- gemini-flash-latest: Faster than the previous one, but not as effective as pro
- gemini-3-pro-preview: Requires a paid account

Free quota reference: https://ai.google.dev/gemini-api/docs/pricing

#### OpenAI (GPT Series)

Get API key:

1. Open [https://platform.openai.com](https://platform.openai.com) and log in to your OpenAI account.
2. Find **API Keys** in the top or side menu, or directly visit [https://platform.openai.com/api-keys](https://platform.openai.com/api-keys). 
3. Click **Create new secret key**, fill in the name and create the key.
4. Copy the generated key and save it securely (it will only be displayed in full once).

Configuration:
0. Select "OpenAI Compatible" as the service provider
1. Base URL configuration: `https://api.openai.com/v1` 
2. Model id: [https://platform.openai.com/docs/models](https://platform.openai.com/docs/models)

- gpt-5.1: Latest model

Pricing reference: [https://openai.com/zh-Hans-CN/api/pricing/](https://openai.com/zh-Hans-CN/api/pricing/)

#### OpenRouter

Get API key:

1. Visit [https://openrouter.ai](https://openrouter.ai) and register/log in to your account.
2. Go to the account settings page and create a new API Key in the **API Keys** section.
3. Copy the generated key and save it securely.
4. New users have access to free models and quotas.

Configuration:
0. Select "OpenAI Compatible" as the service provider
1. Base URL configuration: `https://openrouter.ai/api`
2. Model id: Choose according to the actual id

Description:
- OpenRouter is an AI model aggregation platform that allows access to multiple models from different vendors through a unified API
- Supported models list: [https://openrouter.ai/models](https://openrouter.ai/models)

Pricing reference: [https://openrouter.ai/docs/pricing](https://openrouter.ai/docs/pricing)

### China

#### Kimi (Moonshot AI)

Get API key:

1. Visit the Kimi large model open platform: [https://platform.moonshot.cn](https://platform.moonshot.cn) and register/log in to your account.
2. Find the "API Keys" or "Access Keys" page in the console and create a new API Key.
3. New users usually receive a certain amount of free quota.

Configuration:
0. Select "OpenAI Compatible" as the service provider
1. Base URL configuration (OpenAI compatible): `https://api.moonshot.cn` 
2. Common model ids (examples):

- `kimi-k2-turbo-preview`: Fast, suitable for daily conversations, coding, etc.
- `kimi-k2-thinking`: Thinking version, stronger reasoning capabilities
- `kimi-latest`: Always points to the latest version of the Kimi model online


Pricing and quota reference:

- Model and billing instructions: [https://platform.moonshot.cn/docs/pricing/chat](https://platform.moonshot.cn/docs/pricing/chat) 

#### DeepSeek

Get API key:

1. Visit the DeepSeek platform: [https://platform.deepseek.com](https://platform.deepseek.com) and register/log in.
2. Go to the "API Keys" page (or directly visit [https://platform.deepseek.com/api_keys](https://platform.deepseek.com/api_keys)) and create a new API key.

Configuration:
0. Select "OpenAI Compatible" as the service provider
1. Base URL configuration: `https://api.deepseek.com`
2. Common model ids:

- `deepseek-chat`: Default conversation model (non-thinking mode), underlying **DeepSeek-V3.2-Exp**
- `deepseek-reasoner`: Thinking mode, suitable for complex reasoning, also based on **DeepSeek-V3.2-Exp**

Pricing and quota reference:

- Model & pricing documentation: [https://api-docs.deepseek.com/zh-cn/quick_start/pricing/](https://api-docs.deepseek.com/zh-cn/quick_start/pricing/) 

#### Qwen (Tongyi Qianwen)

Get API key:

1. Register an Alibaba Cloud account and activate "DashScope" (大模型服务平台百炼): refer to the documentation entry for "First time calling Tongyi Qianwen API".
2. Go to the "Key Management" page to create an API Key (example link provided in the documentation:
   [https://bailian.console.alibabacloud.com/?tab=model#/api-key](https://bailian.console.alibabacloud.com/?tab=model#/api-key)). 

Configuration (OpenAI compatible mode):
0. Select "OpenAI Compatible" as the service provider
1. Base URL
   - Singapore region: `https://dashscope-intl.aliyuncs.com/compatible-mode`
   - Beijing region: `https://dashscope.aliyuncs.com/compatible-mode`
2. Model id (example):
- `qwen-plus`: Powerful general conversation model, used by default in official sample code.

Pricing / model list reference:

Pricing: [https://help.aliyun.com/zh/model-studio/models](https://help.aliyun.com/zh/model-studio/models) 

#### Doubao (ByteDance)

Get API key:

1. Visit the Volcano Engine "Doubao Large Model" platform: [https://console.volcengine.com/ark](https://console.volcengine.com/ark) and register/log in.
2. Create an inference endpoint, and select the model you want to use.
3. Create a new API Key on the "API Key Management" page.
4. New users usually receive a certain amount of free quota.

Configuration:
0. Select "OpenAI Compatible" as the service provider
1. Base URL configuration: `https://ark.cn-beijing.volces.com/api/v3/chat/completions#`
2. Model id: You need to use the Endpoint ID or model id of the inference endpoint you created

Common models (examples):
- doubao-seed-1-6-251015: Powerful flagship model

Pricing and quota reference:

- Model and billing instructions: [https://www.volcengine.com/docs/82379/1099320](https://www.volcengine.com/docs/82379/1099320)
- API documentation: [https://www.volcengine.com/docs/82379/1263482](https://www.volcengine.com/docs/82379/1263482)

## Conversation Management Page

There are several ways to open the conversation management page:
1. Right-click the extension icon in the toolbar and select "Conversation Management"
2. Left-click the extension icon in the toolbar to open the sidebar, then click the "Conversation Management" button in the upper right corner of the sidebar
3. On Chrome internal pages such as extension management, left-clicking the extension icon will not open the sidebar, but will directly open the conversation management page.


