[中文](README.md) | [English](README.en.md)

# Think Bot

## Introduction

Chrome extension:
- A handy tool for conversing with web pages, summary, etc.
- Emphasizes making the AI think a little more
- Prompts designed with 'Role' rather than workflow

It was initially created for summarizing web pages then evolved to handle tasks like abbreviation, inspiration, and critical analysis, becoming a key tool for me to enhance my cognition with AI.

Note: 
- **Only declarative writing, unfettered by the pursuit of exhaustive correctness, is truly valuable.**

- **Do not let AI think for you.**


### Vibe Coding

The entire project was built through Vibe Coding. It started as a way to quickly get a tool that could summarize web pages, but gradually grew into a large and complex project. There were attempts to refactor it, but they were only partially successful. Subsequent refactoring gave way to continuous new feature development. 
It is functional but not really well designed. Now that the features are mostly stable, a new version is being developed from scratch (Also with vibe coding).

## Core Features

### 📄 Page Conversation
- Extracts page content using Readability, adds it to the large model's context, and allows you to converse with it.

### ⚡ Quick Inputs
- Pre-set prompts that can be sent automatically when the extension is opened.
- Built-in professional prompts like "Abbreviate", "Counter-intuitive", etc.

### 💾 Conversation Management
- Automatic saving of conversation history.
- Supports exporting conversation records.
- Caching of page states.
- Data synchronization feature (WebDAV, Gist).

## Tools

### Content Extractors
- readability
- jina

### Data Sync
- webdav
- GitHub Gist

### Large Language Models
- OpenAI compatible
- Gemini (recommended)
- Azure OpenAI

## Installation Instructions

1. **Clone or download the project**

2. **Load the extension in Chrome**
   - Open Chrome browser
   - Go to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the project's root directory

3. **Configure API Key**
   - Click the extension icon to open the sidebar
   - Go to the settings page
   - Configure the required LLM model API key

## License

This project is licensed under the MIT License. 
