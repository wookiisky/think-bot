#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
i18n Key Merger Script for Think Bot

This script merges duplicate text keys into unified keys with appropriate names.
It updates both language files and code references.
"""

import os
import re
import json
import glob
from pathlib import Path
from typing import Dict, List, Tuple, Set


class I18nKeyMerger:
    def __init__(self, project_root: str = "."):
        """Initialize the I18n Key Merger with project root path."""
        self.project_root = Path(project_root)
        self.locales_dir = self.project_root / "_locales"
        
        # File patterns to scan for i18n usage
        self.scan_patterns = [
            "**/*.js",
            "**/*.html"
        ]
        
        # Directories to exclude from scanning
        self.exclude_dirs = {
            "node_modules",
            ".git",
            "_locales",
            "scripts"
        }
        
        # Define merge mapping: old_keys -> preferred_key
        # Based on duplicate text analysis from i18n_manager.py
        self.merge_mapping = {
            # Ask... / 提问...
            "global_ask_placeholder": "common_ask_placeholder",
            "sidebar_placeholder_ask": "common_ask_placeholder",
            
            # Cancel / 取消
            "global_cancel_button": "common_cancel",
            "options_blacklist_cancel_button": "common_cancel",
            "sidebar_confirmationOverlay_cancel": "common_cancel",
            
            # Chat / 聊天
            "sidebar_tabManager_text_chat": "common_chat",
            
            # Confirm / 确认
            "sidebar_confirmationOverlay_confirm": "common_confirm",
            "sidebar_confirmationOverlay_title": "common_confirm",
            
            # Are you sure? / 您确定吗？
            "sidebar_confirmationOverlay_areYouSure": "common_confirm_are_you_sure",
            
            # Copy Markdown / 复制 Markdown
            "sidebar_chatManager_title_copyMarkdown": "common_copy_markdown",
            
            # Delete / 删除
            "global_delete_button": "common_delete",
            
            # Export Conversation / 导出对话
            "global_export_conversation_title": "common_export_conversation",
            "sidebar_title_exportConversation": "common_export_conversation",
            
            # Include page content in system prompt / 将页面内容插入到system prompt中
            "global_include_page_content_title": "common_include_page_content",
            "sidebar_title_includePageContent": "common_include_page_content",
            
            # Retry / 重试
            "sidebar_chatManager_title_retry": "common_retry",
            
            # Save / 保存
            "options_save_button": "common_save",
            
            # Send message / 发送消息
            "global_send_message_title": "common_send_message",
            "sidebar_title_sendMessage": "common_send_message",
            
            # Syncing... / 同步中...
            "options_js_syncing": "common_syncing",
            "options_js_sync_status_syncing": "common_syncing",
            
            # Update / 更新
            "options_blacklist_update_button": "common_update",
            
            # Language / 语言
            "options_language_title": "options_language_label",
            
            # Button Text / 按钮文本
            "options_quick_input_placeholder_button_text": "options_quick_input_button_text_label",
            
            # Not configured / 未配置
            "options_js_sync_status_not_configured": "options_sync_status_not_configured",
            
            # System Prompt / 系统提示词
            "options_system_prompt_title": "options_system_prompt_label",
            
            # Theme / 主题
            "options_theme_title": "options_theme_label",
            
            # Retrying message... / 重试消息中...
            "sidebar_tabManager_text_retryingMessage": "sidebar_tabManager_retryingMessage",
            
            # Matched pattern: $PATTERN$ / 匹配的模式：$PATTERN$
            "sidebar_confirmationOverlay_matchedPattern": "common_matched_pattern",
            
            # Response stopped by user / 用户停止了响应
            "sidebar_js_responseStoppedByUser": "conversations_js_response_stopped",
            
            # Model / 默认模型 (Chinese specific)
            "options_default_model_title": "common_model",
            
            # Remove unused keys
            "branch_selectModel": None  # Mark for removal
        }

    def load_language_file(self, lang_code: str) -> Dict:
        """Load a language file and return its content."""
        messages_file = self.locales_dir / lang_code / "messages.json"
        if not messages_file.exists():
            raise FileNotFoundError(f"Language file not found: {messages_file}")
        
        with open(messages_file, 'r', encoding='utf-8') as f:
            return json.load(f)

    def save_language_file(self, lang_code: str, messages: Dict):
        """Save a language file with updated content."""
        messages_file = self.locales_dir / lang_code / "messages.json"
        with open(messages_file, 'w', encoding='utf-8') as f:
            json.dump(messages, f, indent=2, ensure_ascii=False)

    def merge_language_files(self):
        """Merge duplicate keys in language files."""
        print("=== Merging Language Files ===")
        
        for lang_code in ["en", "zh_CN"]:
            print(f"\nProcessing {lang_code}...")
            
            try:
                messages = self.load_language_file(lang_code)
                original_count = len(messages)
                
                # Apply merge mapping
                for old_key, new_key in self.merge_mapping.items():
                    if old_key in messages:
                        if new_key is None:
                            # Remove unused key
                            del messages[old_key]
                            print(f"  Removed unused: {old_key}")
                        elif new_key not in messages:
                            # Move the content to new key
                            messages[new_key] = messages[old_key]
                            print(f"  Moved: {old_key} -> {new_key}")
                            del messages[old_key]
                        else:
                            # Key already exists, just remove the old one
                            print(f"  Removed duplicate: {old_key} (kept {new_key})")
                            del messages[old_key]
                
                # Add new keys that might be missing
                new_keys = {
                    "common_model": {
                        "en": {"message": "Model"},
                        "zh_CN": {"message": "默认模型"}
                    },
                    "common_send_message": {
                        "en": {"message": "Send message"},
                        "zh_CN": {"message": "发送消息"}
                    }
                }
                
                for key, lang_data in new_keys.items():
                    if key not in messages and lang_code in lang_data:
                        messages[key] = lang_data[lang_code]
                        print(f"  Added: {key}")
                
                # Save updated file
                self.save_language_file(lang_code, messages)
                new_count = len(messages)
                print(f"  {lang_code}: {original_count} -> {new_count} keys ({original_count - new_count} removed)")
                
            except Exception as e:
                print(f"  Error processing {lang_code}: {e}")

    def find_key_usage_in_files(self, key: str) -> List[Tuple[str, int, str]]:
        """Find usage of a specific key in code files."""
        usage_list = []
        
        # Patterns to match key usage
        patterns = [
            rf'i18n\.getMessage\s*\(\s*[\'"]({re.escape(key)})[\'"]\s*[,\)]',
            rf'chrome\.i18n\.getMessage\s*\(\s*[\'"]({re.escape(key)})[\'"]\s*[,\)]',
            rf'(?<!\.)\bgetMessage\s*\(\s*[\'"]({re.escape(key)})[\'"]\s*[,\)]',
            rf'\w*[iI]18n\w*\.getMessage\s*\(\s*[\'"]({re.escape(key)})[\'"]\s*[,\)]',
            rf'data-i18n\s*=\s*[\'"]({re.escape(key)})[\'"]',
            rf'data-i18n-title\s*=\s*[\'"]({re.escape(key)})[\'"]',
            rf'data-i18n-placeholder\s*=\s*[\'"]({re.escape(key)})[\'"]',
            rf'data-i18n-\w+\s*=\s*[\'"]({re.escape(key)})[\'"]'
        ]
        
        compiled_patterns = [re.compile(pattern, re.IGNORECASE) for pattern in patterns]
        
        for pattern in self.scan_patterns:
            for file_path in self.project_root.glob(pattern):
                # Skip if in excluded directory
                if any(exc_dir in file_path.parts for exc_dir in self.exclude_dirs):
                    continue
                
                if file_path.is_dir():
                    continue
                
                try:
                    with open(file_path, 'r', encoding='utf-8') as f:
                        lines = f.readlines()
                        for line_num, line in enumerate(lines, 1):
                            for regex in compiled_patterns:
                                matches = regex.findall(line)
                                if matches:
                                    usage_list.append((str(file_path), line_num, line.strip()))
                except (UnicodeDecodeError, PermissionError):
                    continue
        
        return usage_list

    def update_code_references(self):
        """Update code references to use merged keys."""
        print("\n=== Updating Code References ===")
        
        for old_key, new_key in self.merge_mapping.items():
            print(f"\nUpdating: {old_key} -> {new_key}")
            
            # Find usage of old key
            usage_list = self.find_key_usage_in_files(old_key)
            
            if not usage_list:
                print(f"  No usage found for {old_key}")
                continue
            
            # Group by file
            files_to_update = {}
            for file_path, line_num, line_content in usage_list:
                if file_path not in files_to_update:
                    files_to_update[file_path] = []
                files_to_update[file_path].append((line_num, line_content))
            
            # Update each file
            for file_path, line_info in files_to_update.items():
                try:
                    self.update_file_key_references(file_path, old_key, new_key)
                    print(f"  Updated {file_path} ({len(line_info)} occurrences)")
                except Exception as e:
                    print(f"  Error updating {file_path}: {e}")

    def update_file_key_references(self, file_path: str, old_key: str, new_key: str):
        """Update key references in a specific file."""
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # Patterns for replacement
        patterns = [
            (rf'(i18n\.getMessage\s*\(\s*[\'"])({re.escape(old_key)})([\'"]\s*[,\)])', rf'\1{new_key}\3'),
            (rf'(chrome\.i18n\.getMessage\s*\(\s*[\'"])({re.escape(old_key)})([\'"]\s*[,\)])', rf'\1{new_key}\3'),
            (rf'((?<!\.)\bgetMessage\s*\(\s*[\'"])({re.escape(old_key)})([\'"]\s*[,\)])', rf'\1{new_key}\3'),
            (rf'(\w*[iI]18n\w*\.getMessage\s*\(\s*[\'"])({re.escape(old_key)})([\'"]\s*[,\)])', rf'\1{new_key}\3'),
            (rf'(data-i18n\s*=\s*[\'"])({re.escape(old_key)})([\'"])', rf'\1{new_key}\3'),
            (rf'(data-i18n-title\s*=\s*[\'"])({re.escape(old_key)})([\'"])', rf'\1{new_key}\3'),
            (rf'(data-i18n-placeholder\s*=\s*[\'"])({re.escape(old_key)})([\'"])', rf'\1{new_key}\3'),
            (rf'(data-i18n-\w+\s*=\s*[\'"])({re.escape(old_key)})([\'"])', rf'\1{new_key}\3')
        ]
        
        updated_content = content
        for pattern, replacement in patterns:
            updated_content = re.sub(pattern, replacement, updated_content, flags=re.IGNORECASE)
        
        if updated_content != content:
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(updated_content)

    def run_merge(self):
        """Run the complete merge process."""
        print("🔄 Think Bot I18n Key Merger")
        print("=" * 50)
        
        print("Merge mapping:")
        for old_key, new_key in self.merge_mapping.items():
            print(f"  {old_key} -> {new_key}")
        
        # Step 1: Merge language files
        self.merge_language_files()
        
        # Step 2: Update code references
        self.update_code_references()
        
        print("\n✅ Merge process completed!")
        print("Please run the i18n_manager.py script again to verify the results.")


def main():
    """Main entry point."""
    # Change to project root directory
    script_dir = Path(__file__).parent
    project_root = script_dir.parent
    os.chdir(project_root)
    
    print(f"Working directory: {project_root}")
    
    merger = I18nKeyMerger()
    merger.run_merge()


if __name__ == "__main__":
    main()
