[中文](README.md) | [English](README.en.md)

# Think Bot

## Introduction
This browser extension is a tool that combines web content extraction + preset prompts + LLM API calls + reading/conversation features. It was iteratively developed as part of my cognitive enhancement workflow, aiming to reduce various friction points encountered during deep reading. The goal is to create a handy and useful tool that embodies my philosophy on cognitive improvement.

The initial idea was simply a web content extraction and controllable-prompt web page summary plugin. Since it was created during the early days of vibe coding, the entire development process and framework lacked design (e.g., no modern frontend development frameworks were used). Later, as more and more features were added, quick refactoring attempts failed and completely gave way to the need for new features, ultimately resulting in a functional product with less-than-ideal code quality.

Now the idea of refactoring is gradually fading: first, the focus has shifted to thinking about further issues in the cognitive enhancement process; second, AI browsers in the future may include these features; third, when vibe coding becomes even better, refactoring will be a much more efficient endeavor.

## Core Features
- Sidebar invocation with automatic web content extraction and automatic multi-model, multi-perspective analysis
- Historical page management and search
- Detail features for convenient reading and conversation
- Controllability of prompts

Note: You need to configure LLM API yourself

## Installation Instructions

### Chrome Web Store
- https://chromewebstore.google.com/detail/think-bot/fnicniodcfoggafbmigcbdnjdcmfhpob

- Search for "Think Bot"

### Local Installation

1. **Clone or download the project**  

2. **Load the extension in Chrome**
   - Open Chrome browser
   - Go to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the project's root directory

3. **Configure LLM API Key**
   - Click the extension icon to open the sidebar
   - Go to the settings page
   - Configure the required LLM model API key

## License

This project is licensed under the MIT License. 
