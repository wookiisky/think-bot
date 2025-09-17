#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
i18n Key Management Script for Think Bot

This script provides tools for managing internationalization (i18n) keys:
1. Find keys used in code but missing from language files
2. Find keys in language files but not used in code

Usage:
    python scripts/i18n_manager.py
"""

import os
import re
import json
import glob
from pathlib import Path
from typing import Set, Dict, List, Tuple


class I18nManager:
    def __init__(self, project_root: str = "."):
        """Initialize the I18n Manager with project root path."""
        self.project_root = Path(project_root)
        self.locales_dir = self.project_root / "_locales"
        
        # File patterns to scan for i18n usage
        self.scan_patterns = [
            "**/*.js",
            "**/*.html",
            "**/*.json"  # For manifest.json and other config files
        ]
        
        # Directories to exclude from scanning
        self.exclude_dirs = {
            "node_modules",
            ".git",
            "_locales",  # Don't scan the language files themselves
            "scripts"    # Don't scan this script itself
        }
        
        # Regular expressions to match i18n key usage
        self.i18n_patterns = [
            # i18n.getMessage('key') or i18n.getMessage("key")
            r'i18n\.getMessage\s*\(\s*[\'"]([^\'\"]+)[\'"]\s*[,\)]',
            # chrome.i18n.getMessage('key') or chrome.i18n.getMessage("key")
            r'chrome\.i18n\.getMessage\s*\(\s*[\'"]([^\'\"]+)[\'"]\s*[,\)]',
            # getMessage('key') or getMessage("key") (for wrapped functions)
            r'(?<!\.)\bgetMessage\s*\(\s*[\'"]([^\'\"]+)[\'"]\s*[,\)]',
            # safeI18n.getMessage('key') or similar variants
            r'\w*[iI]18n\w*\.getMessage\s*\(\s*[\'"]([^\'\"]+)[\'"]\s*[,\)]',
            # HTML data-i18n attributes: data-i18n="key"
            r'data-i18n\s*=\s*[\'"]([^\'\"]+)[\'"]',
            # HTML data-i18n-title attributes: data-i18n-title="key"
            r'data-i18n-title\s*=\s*[\'"]([^\'\"]+)[\'"]',
            # HTML data-i18n-placeholder attributes: data-i18n-placeholder="key"
            r'data-i18n-placeholder\s*=\s*[\'"]([^\'\"]+)[\'"]',
            # HTML data-i18n-* attributes (generic pattern for other variations)
            r'data-i18n-\w+\s*=\s*[\'"]([^\'\"]+)[\'"]',
            # __MSG_key__ pattern in manifest.json
            r'__MSG_([^_]+)__'
        ]

    def scan_code_for_keys(self) -> Set[str]:
        """
        Scan all code files for i18n key usage.
        
        Returns:
            Set of unique i18n keys found in the code
        """
        found_keys = set()
        compiled_patterns = [re.compile(pattern, re.IGNORECASE) for pattern in self.i18n_patterns]
        
        print("Scanning code files for i18n keys...")
        
        for pattern in self.scan_patterns:
            for file_path in self.project_root.glob(pattern):
                # Skip if in excluded directory
                if any(exc_dir in file_path.parts for exc_dir in self.exclude_dirs):
                    continue
                
                # Skip if it's a directory
                if file_path.is_dir():
                    continue
                
                try:
                    with open(file_path, 'r', encoding='utf-8') as f:
                        content = f.read()
                        
                        # Apply all regex patterns
                        for regex in compiled_patterns:
                            matches = regex.findall(content)
                            for match in matches:
                                if isinstance(match, tuple):
                                    # Some regex groups might return tuples
                                    match = match[0] if match[0] else match[1] if len(match) > 1 else ""
                                if match:
                                    found_keys.add(match)
                                    
                except (UnicodeDecodeError, PermissionError) as e:
                    print(f"Warning: Could not read file {file_path}: {e}")
                    continue
        
        print(f"Found {len(found_keys)} unique i18n keys in code")
        return found_keys

    def load_language_keys(self) -> Dict[str, Set[str]]:
        """
        Load all keys from language files.
        
        Returns:
            Dictionary mapping language codes to sets of keys
        """
        language_keys = {}
        
        if not self.locales_dir.exists():
            print(f"Warning: Locales directory not found: {self.locales_dir}")
            return language_keys
        
        print("Loading language files...")
        
        for lang_dir in self.locales_dir.iterdir():
            if not lang_dir.is_dir():
                continue
                
            messages_file = lang_dir / "messages.json"
            if not messages_file.exists():
                continue
            
            try:
                with open(messages_file, 'r', encoding='utf-8') as f:
                    messages = json.load(f)
                    # Extract keys from the messages object
                    keys = set(messages.keys())
                    language_keys[lang_dir.name] = keys
                    print(f"  {lang_dir.name}: {len(keys)} keys")
                    
            except (json.JSONDecodeError, UnicodeDecodeError) as e:
                print(f"Warning: Could not read language file {messages_file}: {e}")
                continue
        
        return language_keys

    def find_missing_keys(self) -> Dict[str, Set[str]]:
        """
        Find keys that are used in code but missing from language files.
        
        Returns:
            Dictionary mapping language codes to sets of missing keys
        """
        print("\n=== Finding Missing Keys ===")
        
        code_keys = self.scan_code_for_keys()
        language_keys = self.load_language_keys()
        
        missing_keys = {}
        
        for lang_code, lang_keys in language_keys.items():
            missing = code_keys - lang_keys
            if missing:
                missing_keys[lang_code] = missing
                print(f"\n{lang_code} is missing {len(missing)} keys:")
                for key in sorted(missing):
                    print(f"  - {key}")
            else:
                print(f"\n{lang_code}: No missing keys found ✓")
        
        if not missing_keys:
            print("\n✓ All languages have all required keys!")
        
        return missing_keys

    def find_unused_keys(self) -> Dict[str, Set[str]]:
        """
        Find keys that exist in language files but are not used in code.
        
        Returns:
            Dictionary mapping language codes to sets of unused keys
        """
        print("\n=== Finding Unused Keys ===")
        
        code_keys = self.scan_code_for_keys()
        language_keys = self.load_language_keys()
        
        unused_keys = {}
        
        for lang_code, lang_keys in language_keys.items():
            unused = lang_keys - code_keys
            if unused:
                unused_keys[lang_code] = unused
                print(f"\n{lang_code} has {len(unused)} unused keys:")
                for key in sorted(unused):
                    print(f"  - {key}")
            else:
                print(f"\n{lang_code}: No unused keys found ✓")
        
        if not unused_keys:
            print("\n✓ All keys in language files are being used!")
        
        return unused_keys

    def generate_missing_keys_template(self, missing_keys: Dict[str, Set[str]], output_file: str = "missing_keys.json"):
        """
        Generate a JSON template file for missing keys.
        
        Args:
            missing_keys: Dictionary of language codes to missing keys
            output_file: Output file name
        """
        if not missing_keys:
            print("No missing keys to generate template for.")
            return
        
        # Get all unique missing keys across all languages
        all_missing = set()
        for keys in missing_keys.values():
            all_missing.update(keys)
        
        # Create template with empty message values
        template = {}
        for key in sorted(all_missing):
            template[key] = {
                "message": f"TODO: Add translation for '{key}'"
            }
        
        output_path = self.project_root / "scripts" / output_file
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(template, f, indent=2, ensure_ascii=False)
        
        print(f"\n📝 Missing keys template generated: {output_path}")
        print(f"   Contains {len(template)} keys ready for translation")

    def find_duplicate_text_keys(self) -> Dict[str, Dict[str, List[str]]]:
        """
        Find keys with duplicate message text within each language.
        
        Returns:
            Dictionary mapping language codes to dictionaries of {message: [keys]} 
            where multiple keys have the same message text
        """
        print("\n=== Finding Duplicate Text Keys ===")
        
        language_keys = self.load_language_keys()
        duplicate_texts = {}
        
        for lang_code in language_keys.keys():
            messages_file = self.locales_dir / lang_code / "messages.json"
            if not messages_file.exists():
                continue
            
            try:
                with open(messages_file, 'r', encoding='utf-8') as f:
                    messages = json.load(f)
                
                # Group keys by their message text
                text_to_keys = {}
                for key, value in messages.items():
                    if isinstance(value, dict) and 'message' in value:
                        message_text = value['message'].strip()
                        if message_text:  # Skip empty messages
                            if message_text not in text_to_keys:
                                text_to_keys[message_text] = []
                            text_to_keys[message_text].append(key)
                
                # Find duplicates (messages with more than one key)
                duplicates = {text: keys for text, keys in text_to_keys.items() if len(keys) > 1}
                
                if duplicates:
                    duplicate_texts[lang_code] = duplicates
                    print(f"\n{lang_code} has {len(duplicates)} duplicate text groups:")
                    for text, keys in duplicates.items():
                        print(f"  Text: \"{text[:50]}{'...' if len(text) > 50 else ''}\"")
                        print(f"    Keys: {', '.join(keys)}")
                else:
                    print(f"\n{lang_code}: No duplicate texts found ✓")
                    
            except (json.JSONDecodeError, UnicodeDecodeError) as e:
                print(f"Warning: Could not read language file {messages_file}: {e}")
                continue
        
        if not duplicate_texts:
            print("\n✓ No duplicate texts found in any language!")
        
        return duplicate_texts

    def clean_unused_keys_interactive(self, unused_keys: Dict[str, Set[str]]):
        """
        Interactively clean unused keys from language files.
        
        Args:
            unused_keys: Dictionary of language codes to unused keys
        """
        if not unused_keys:
            print("No unused keys to clean.")
            return
        
        print("\n🧹 Interactive Unused Key Cleanup")
        print("=" * 40)
        
        for lang_code, keys in unused_keys.items():
            if not keys:
                continue
                
            print(f"\nLanguage: {lang_code}")
            print(f"Unused keys: {len(keys)}")
            
            response = input(f"Remove all {len(keys)} unused keys from {lang_code}? (y/N): ").strip().lower()
            
            if response in ['y', 'yes']:
                messages_file = self.locales_dir / lang_code / "messages.json"
                
                try:
                    with open(messages_file, 'r', encoding='utf-8') as f:
                        messages = json.load(f)
                    
                    # Remove unused keys
                    removed_count = 0
                    for key in keys:
                        if key in messages:
                            del messages[key]
                            removed_count += 1
                    
                    # Write back the cleaned file
                    with open(messages_file, 'w', encoding='utf-8') as f:
                        json.dump(messages, f, indent=2, ensure_ascii=False)
                    
                    print(f"✅ Removed {removed_count} unused keys from {lang_code}")
                    
                except Exception as e:
                    print(f"❌ Error cleaning {lang_code}: {e}")
            else:
                print(f"Skipped cleaning {lang_code}")

    def run_analysis(self):
        """Run complete i18n analysis."""
        print("🌍 Think Bot I18n Key Analysis")
        print("=" * 50)
        
        # Find missing keys
        missing_keys = self.find_missing_keys()
        
        # Find unused keys
        unused_keys = self.find_unused_keys()
        
        # Find duplicate text keys
        duplicate_texts = self.find_duplicate_text_keys()
        
        # Generate summary
        print("\n📊 Summary")
        print("=" * 20)
        
        total_missing = sum(len(keys) for keys in missing_keys.values())
        total_unused = sum(len(keys) for keys in unused_keys.values())
        total_duplicate_groups = sum(len(groups) for groups in duplicate_texts.values())
        total_duplicate_keys = sum(
            sum(len(keys) for keys in groups.values()) 
            for groups in duplicate_texts.values()
        )
        
        print(f"Missing keys: {total_missing}")
        print(f"Unused keys: {total_unused}")
        print(f"Duplicate text groups: {total_duplicate_groups}")
        print(f"Total keys with duplicate texts: {total_duplicate_keys}")
        
        # Offer to generate template for missing keys
        if missing_keys:
            response = input("\nGenerate missing keys template? (Y/n): ").strip().lower()
            if response in ['', 'y', 'yes']:
                self.generate_missing_keys_template(missing_keys)
        
        # Offer to clean unused keys
        if unused_keys:
            response = input("\nClean unused keys interactively? (y/N): ").strip().lower()
            if response in ['y', 'yes']:
                self.clean_unused_keys_interactive(unused_keys)


def main():
    """Main entry point."""
    # Change to project root directory
    script_dir = Path(__file__).parent
    project_root = script_dir.parent
    os.chdir(project_root)
    
    print(f"Working directory: {project_root}")
    
    manager = I18nManager()
    manager.run_analysis()


if __name__ == "__main__":
    main()
