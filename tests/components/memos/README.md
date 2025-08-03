# Memos 组件测试文档

本目录包含了 Memos 功能相关组件的测试用例，特别是针对 Base64 图片处理和 Markdown 预览功能的测试。

## 测试文件概览

### 1. SimpleMarkdownPreview.test.tsx
测试 `SimpleMarkdownPreview` 组件的核心内容处理逻辑。

**测试覆盖范围：**
- ✅ Milkdown HTML 转义处理
  - 标题转义 (`\#` → `#`)
  - 图片转义 (`!\[alt]\(url)` → `![alt](url)`)
  - 代码转义 (`\`` → `` ` ``)
  - 粗体/斜体转义 (`\*\*` → `**`, `\_` → `_`)
  - HTML 换行转换 (`<br />` → `\n\n`)

- ✅ 标签移除功能
  - 保留标签模式
  - 移除标签模式
  - 默认行为测试

- ✅ 正常 Markdown 内容处理
  - 无转义内容处理
  - 空内容处理
  - 仅空白字符内容处理

- ✅ 边缘情况处理
  - 混合转义和正常内容
  - 多重转义
  - 标签和转义混合内容

### 2. Base64ImageHandling.test.ts
专门测试 Base64 图片处理功能的测试套件。

**测试覆盖范围：**
- ✅ 真实世界的 Base64 图片场景
  - PNG 图片 (1x1 透明图片)
  - JPEG 图片
  - GIF 图片
  - WebP 图片
  - SVG 图片

- ✅ 复杂闪念内容处理
  - 包含标题、文本和 Base64 图片的闪念
  - 多张 Base64 图片的闪念
  - 带标签的 Base64 图片

- ✅ 边缘情况和错误场景
  - 格式错误的 Base64 图片
  - 不完整的 Base64 图片语法
  - 混合转义和正常图片
  - 超长 Base64 字符串
  - Alt 文本包含特殊字符

- ✅ 性能和验证
  - 大内容处理性能测试
  - 内容完整性验证

## 修复的问题

### 问题描述
Milkdown 编辑器在输出 Markdown 内容时会对特殊字符进行 HTML 转义，导致：
- `![alt](data:image/...)` 被转义为 `!\[alt]\(data:image/...)`
- ReactMarkdown 无法解析被转义的语法
- Base64 图片显示为原始文本而不是图片

### 解决方案
在 `SimpleMarkdownPreview.tsx` 组件中添加了反转义处理逻辑：

```typescript
processedContent = processedContent
  .replace(/\\#/g, '#')        // 反转义标题
  .replace(/!\\\[/g, '![')     // 反转义图片开始
  .replace(/\\\]/g, ']')       // 反转义右方括号
  .replace(/\\\(/g, '(')       // 反转义左圆括号
  .replace(/\\`/g, '`')        // 反转义代码
  .replace(/\\\*/g, '*')       // 反转义粗体/斜体
  .replace(/\\\_/g, '_')       // 反转义下划线
  .replace(/<br\s*\/?>/gi, '\n\n'); // 将HTML换行转换为markdown换行
```

### 测试验证
- ✅ 32 个测试用例全部通过
- ✅ 覆盖了各种 Base64 图片格式
- ✅ 验证了性能和内容完整性
- ✅ 测试了边缘情况和错误场景

## 运行测试

```bash
# 运行所有 Memos 组件测试
bun test tests/components/memos/

# 运行特定测试文件
bun test tests/components/memos/SimpleMarkdownPreview.test.tsx
bun test tests/components/memos/Base64ImageHandling.test.ts

# 运行测试并显示详细输出
bun test tests/components/memos/ --verbose
```

## 测试结果

```
✓ SimpleMarkdownPreview Content Processing > Milkdown HTML escape handling > should unescape markdown headers
✓ SimpleMarkdownPreview Content Processing > Milkdown HTML escape handling > should unescape markdown images
✓ SimpleMarkdownPreview Content Processing > Milkdown HTML escape handling > should unescape markdown code blocks
✓ SimpleMarkdownPreview Content Processing > Milkdown HTML escape handling > should unescape markdown bold and italic
✓ SimpleMarkdownPreview Content Processing > Milkdown HTML escape handling > should convert HTML line breaks to markdown line breaks
✓ SimpleMarkdownPreview Content Processing > Milkdown HTML escape handling > should handle complex escaped content with Base64 images
✓ SimpleMarkdownPreview Content Processing > Tag removal functionality > should remove tags when removeTags is true
✓ SimpleMarkdownPreview Content Processing > Tag removal functionality > should keep tags when removeTags is false
✓ SimpleMarkdownPreview Content Processing > Tag removal functionality > should keep tags when removeTags is not specified (default)
✓ SimpleMarkdownPreview Content Processing > Normal markdown content > should handle normal markdown content without escaping
✓ SimpleMarkdownPreview Content Processing > Normal markdown content > should handle empty content
✓ SimpleMarkdownPreview Content Processing > Normal markdown content > should handle content with only whitespace
✓ SimpleMarkdownPreview Content Processing > Edge cases > should handle mixed escaped and normal content
✓ SimpleMarkdownPreview Content Processing > Edge cases > should handle multiple consecutive escapes
✓ SimpleMarkdownPreview Content Processing > Edge cases > should handle content with both tags and escapes
✓ SimpleMarkdownPreview Content Processing > Edge cases > should handle Base64 images with various formats
✓ SimpleMarkdownPreview Content Processing > Edge cases > should handle complex content with multiple escape types
✓ Base64 Image Handling in Memos > Real-world Base64 image scenarios > should handle 1x1 transparent PNG (common test image)
✓ Base64 Image Handling in Memos > Real-world Base64 image scenarios > should handle Base64 JPEG images
✓ Base64 Image Handling in Memos > Real-world Base64 image scenarios > should handle Base64 GIF images
✓ Base64 Image Handling in Memos > Real-world Base64 image scenarios > should handle Base64 WebP images
✓ Base64 Image Handling in Memos > Real-world Base64 image scenarios > should handle Base64 SVG images
✓ Base64 Image Handling in Memos > Complex memo content with Base64 images > should handle memo with title, text, and Base64 image
✓ Base64 Image Handling in Memos > Complex memo content with Base64 images > should handle multiple Base64 images in one memo
✓ Base64 Image Handling in Memos > Complex memo content with Base64 images > should handle Base64 images with tags
✓ Base64 Image Handling in Memos > Edge cases and error scenarios > should handle malformed Base64 images gracefully
✓ Base64 Image Handling in Memos > Edge cases and error scenarios > should handle incomplete Base64 image syntax
✓ Base64 Image Handling in Memos > Edge cases and error scenarios > should handle mixed escaped and normal images
✓ Base64 Image Handling in Memos > Edge cases and error scenarios > should handle very long Base64 strings
✓ Base64 Image Handling in Memos > Edge cases and error scenarios > should handle Base64 images with special characters in alt text
✓ Base64 Image Handling in Memos > Performance and validation > should process content efficiently for large inputs
✓ Base64 Image Handling in Memos > Performance and validation > should maintain content integrity after processing

32 pass
0 fail
44 expect() calls
```

## 维护说明

1. **添加新的转义字符支持**：如果发现新的转义字符需要处理，请在 `processContent` 函数中添加相应的 `.replace()` 调用，并添加对应的测试用例。

2. **性能优化**：如果处理大量内容时性能不佳，可以考虑优化正则表达式或使用更高效的字符串处理方法。

3. **测试覆盖率**：确保新功能都有对应的测试用例，特别是边缘情况和错误处理。

4. **向后兼容性**：修改内容处理逻辑时，确保不会破坏现有的正常 Markdown 内容显示。
