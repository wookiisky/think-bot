/**
 * find_unused_i18n.js - 查找未使用的国际化文本条目
 * 逐条搜索代码中的文本使用情况，找出没有任何使用的文本条目
 */

const fs = require('fs');
const path = require('path');

// 读取 messages.json 文件
function loadMessages(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    console.error(`Error loading ${filePath}:`, error.message);
    return {};
  }
}

// 搜索代码中的文本使用情况
function searchInCode(key) {
  const searchPatterns = [
    // 直接使用 chrome.i18n.getMessage
    `chrome.i18n.getMessage('${key}')`,
    `chrome.i18n.getMessage("${key}")`,
    // 使用 i18n.getMessage
    `i18n.getMessage('${key}')`,
    `i18n.getMessage("${key}")`,
    // 使用 safeI18n.getMessage
    `safeI18n.getMessage('${key}')`,
    `safeI18n.getMessage("${key}")`,
    // HTML 中的 data-i18n 属性
    `data-i18n="${key}"`,
    `data-i18n='${key}'`,
    // HTML 中的 data-i18n-title 属性
    `data-i18n-title="${key}"`,
    `data-i18n-title='${key}'`,
    // HTML 中的 data-i18n-placeholder 属性
    `data-i18n-placeholder="${key}"`,
    `data-i18n-placeholder='${key}'`,
    // HTML 中的 data-i18n-html 属性
    `data-i18n-html="${key}"`,
    `data-i18n-html='${key}'`
  ];

  const directories = [
    'background',
    'content_scripts', 
    'conversations',
    'js',
    'options',
    'sidebar',
    'offscreen'
  ];

  const fileExtensions = ['.js', '.html'];

  for (const dir of directories) {
    if (!fs.existsSync(dir)) continue;
    
    const files = getAllFiles(dir, fileExtensions);
    
    for (const file of files) {
      try {
        const content = fs.readFileSync(file, 'utf8');
        
        for (const pattern of searchPatterns) {
          if (content.includes(pattern)) {
            return {
              found: true,
              file: file,
              pattern: pattern
            };
          }
        }
      } catch (error) {
        // 忽略读取错误
      }
    }
  }

  return { found: false };
}

// 递归获取所有文件
function getAllFiles(dir, extensions) {
  const files = [];
  
  function traverse(currentDir) {
    const items = fs.readdirSync(currentDir);
    
    for (const item of items) {
      const fullPath = path.join(currentDir, item);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory()) {
        traverse(fullPath);
      } else if (stat.isFile()) {
        const ext = path.extname(item);
        if (extensions.includes(ext)) {
          files.push(fullPath);
        }
      }
    }
  }
  
  traverse(dir);
  return files;
}

// 主函数
function findUnusedKeys() {
  console.log('Searching for unused i18n keys...\n');
  
  const enMessages = loadMessages('_locales/en/messages.json');
  const zhMessages = loadMessages('_locales/zh_CN/messages.json');
  
  // 定义应该保留的键，即使它们未被使用
  const keysToPreserve = ['appName'];
  
  const unusedKeys = [];
  const preservedKeys = [];
  const totalKeys = Object.keys(enMessages).length;
  let processedKeys = 0;
  
  console.log(`Total keys to check: ${totalKeys}\n`);
  
  for (const key of Object.keys(enMessages)) {
    processedKeys++;
    process.stdout.write(`\rChecking key ${processedKeys}/${totalKeys}: ${key}`);
    
    const result = searchInCode(key);
    
    if (!result.found) {
      // 检查是否是需要保留的键
      if (keysToPreserve.includes(key)) {
        preservedKeys.push(key);
        console.log(`\n⚠️  PRESERVED: ${key} (marked for retention)`);
      } else {
        unusedKeys.push(key);
        console.log(`\n❌ UNUSED: ${key}`);
      }
    }
  }
  
  console.log(`\n\nFound ${unusedKeys.length} unused keys (excluding preserved keys):`);
  console.log('='.repeat(50));
  
  for (const key of unusedKeys) {
    console.log(key);
  }
  
  if (preservedKeys.length > 0) {
    console.log('\nPreserved keys (will not be removed):');
    console.log('-'.repeat(30));
    for (const key of preservedKeys) {
      console.log(key);
    }
  }
  
  console.log('\n' + '='.repeat(50));
  console.log(`Total unused keys: ${unusedKeys.length}`);
  console.log(`Preserved keys: ${preservedKeys.length}`);
  console.log(`Used keys: ${totalKeys - unusedKeys.length - preservedKeys.length}`);
  
  return unusedKeys;
}

// 删除未使用的键
function removeUnusedKeys(unusedKeys) {
  if (unusedKeys.length === 0) {
    console.log('\nNo unused keys to remove.');
    return;
  }
  
  console.log('\nRemoving unused keys...\n');
  
  // 定义应该保留的键，即使它们未被使用
  const keysToPreserve = ['appName'];
  
  const files = [
    '_locales/en/messages.json',
    '_locales/zh_CN/messages.json'
  ];
  
  for (const filePath of files) {
    try {
      const messages = loadMessages(filePath);
      let removedCount = 0;
      let preservedCount = 0;
      
      for (const key of unusedKeys) {
        if (messages[key]) {
          // 检查是否是需要保留的键
          if (keysToPreserve.includes(key)) {
            preservedCount++;
            console.log(`⚠️  Preserving key: ${key} (marked for preservation)`);
            continue;
          }
          
          delete messages[key];
          removedCount++;
        }
      }
      
      if (removedCount > 0) {
        fs.writeFileSync(filePath, JSON.stringify(messages, null, 2));
        console.log(`✅ Removed ${removedCount} unused keys from ${filePath}`);
      }
      
      if (preservedCount > 0) {
        console.log(`ℹ️  Preserved ${preservedCount} keys marked for retention`);
      }
    } catch (error) {
      console.error(`❌ Error processing ${filePath}:`, error.message);
    }
  }
}

// 执行主函数
const unusedKeys = findUnusedKeys();

// 询问是否删除未使用的键
if (unusedKeys.length > 0) {
  console.log('\nDo you want to remove these unused keys? (y/n)');
  
  // 在 Node.js 环境中，我们可以直接删除，因为这是脚本执行
  removeUnusedKeys(unusedKeys);
  console.log('\n✅ Cleanup completed!');
} else {
  console.log('\n✅ No unused keys found. All keys are being used.');
} 