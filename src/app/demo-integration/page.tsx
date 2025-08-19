"use client";

import MarkdownRenderer from "@/components/common/MarkdownRenderer";
import PageLayout from "@/components/common/PageLayout";

const demoArticleContent = `# 集成演示：MarkdownRenderer 在实际页面中的应用

这是一个演示页面，展示 MarkdownRenderer 组件在实际博客文章和闪念页面中的集成效果。

## 文章模式演示

在文章详情页面中，MarkdownRenderer 使用 \`variant="article"\` 配置，启用了所有高级功能：

### 代码高亮和折叠

\`\`\`javascript
// 这是一个示例函数
function createBlogPost(title, content, tags) {
  const post = {
    id: generateId(),
    title: title,
    content: content,
    tags: tags || [],
    publishDate: new Date(),
    author: 'Ivan Li'
  };
  
  // 保存到数据库
  return savePost(post);
}

// 使用示例
const newPost = createBlogPost(
  'MarkdownRenderer 集成指南',
  '这是一篇关于如何集成 MarkdownRenderer 的文章...',
  ['React', 'Markdown', 'TypeScript']
);
\`\`\`

### 数学公式支持

内联公式：$E = mc^2$

块级公式：
$$
\\int_{-\\infty}^{\\infty} e^{-x^2} dx = \\sqrt{\\pi}
$$

### Mermaid 图表

\`\`\`mermaid
graph TD
    A[用户访问文章] --> B{内容类型?}
    B -->|文章| C[使用 article 模式]
    B -->|闪念| D[使用 memo 模式]
    C --> E[启用所有功能]
    D --> F[简化功能集]
    E --> G[完整渲染]
    F --> G
\`\`\`

### 图片灯箱

![示例图片](data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAwIiBoZWlnaHQ9IjMwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KICA8cmVjdCB3aWR0aD0iNjAwIiBoZWlnaHQ9IjMwMCIgZmlsbD0iIzRGNDZFNSIvPgogIDx0ZXh0IHg9IjMwMCIgeT0iMTUwIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBkb21pbmFudC1iYXNlbGluZT0ibWlkZGxlIiBmaWxsPSJ3aGl0ZSIgZm9udC1zaXplPSIyNCIgZm9udC1mYW1pbHk9IkFyaWFsIj7npLrkvovlm77niYcgKDYwMHgzMDApPC90ZXh0Pgo8L3N2Zz4K)

*点击上面的图片可以在灯箱中查看*

### 响应式表格

| 功能 | 文章模式 | 闪念模式 | 闪念卡片 | 说明 |
|------|----------|----------|----------|------|
| 数学公式 | ✅ | ✅ | ✅ | 所有模式都支持 |
| Mermaid 图表 | ✅ | ✅ | ✅ | 所有模式都支持 |
| 代码折叠 | ✅ (30行) | ✅ (30行) | ✅ (15行) | 根据页面类型调整阈值 |
| 图片灯箱 | ✅ | ✅ | ✅ | 所有模式都支持 |

## 集成配置说明

### 文章页面配置

\`\`\`tsx
<MarkdownRenderer 
  content={post.body}
  variant="article"
  enableMath={true}
  enableMermaid={true}
  enableCodeFolding={true}
  enableImageLightbox={true}
  maxCodeLines={30}
  previewCodeLines={20}
  articlePath={\`/posts/\${post.slug}\`}
/>
\`\`\`

### 闪念页面配置

\`\`\`tsx
<MarkdownRenderer
  content={memo.content}
  variant="memo"
  enableMath={true}
  enableMermaid={true}
  enableCodeFolding={true}
  enableImageLightbox={true}
  maxCodeLines={30}
  previewCodeLines={20}
  articlePath={\`/memos/\${memo.slug}\`}
/>
\`\`\`

### 闪念卡片配置

\`\`\`tsx
<MarkdownRenderer
  content={truncatedContent}
  variant="preview"
  enableMath={true}
  enableMermaid={true}
  enableCodeFolding={true}
  enableImageLightbox={true}
  maxCodeLines={15}
  previewCodeLines={10}
  articlePath={\`/memos/\${memo.slug}\`}
/>
\`\`\`

## 总结

MarkdownRenderer 组件已经成功集成到以下页面：

1. **文章详情页** (\`/posts/[slug]\`) - 完整功能
2. **闪念详情页** (\`/memos/[slug]\`) - 完整功能
3. **闪念卡片** (列表页面) - 完整功能，优化阈值

所有页面都能正确渲染 Markdown 内容，并提供一致的用户体验！

> 🎉 集成完成！现在可以在整个博客系统中享受强大的 Markdown 渲染功能了。
`;

const demoMemoContent = `# 闪念模式演示

这是闪念模式的演示，现在具备完整功能：

## 基础功能

- **文本格式**：支持 **粗体**、*斜体*、~~删除线~~
- **代码**：支持 \`内联代码\` 和代码块
- **链接**：[GitHub](https://github.com)
- **列表**：有序和无序列表

## 数学公式支持

内联公式：$f(x) = x^2 + 2x + 1$

块级公式：
$$
\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}
$$

## Mermaid 图表

\`\`\`mermaid
graph LR
    A[闪念] --> B[编辑]
    B --> C[保存]
    C --> D[分享]
\`\`\`

## 代码示例

\`\`\`python
# 闪念中的代码片段
def process_memo(content):
    # 支持语法高亮
    processed = content.strip()
    if len(processed) > 100:
        # 支持代码折叠
        return processed[:100] + "..."
    return processed

# 使用示例
memo = process_memo("这是一个很长的闪念内容...")
print(f"处理后的闪念: {memo}")
\`\`\`

## 图片支持

![闪念图片](data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KICA8cmVjdCB3aWR0aD0iNDAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iIzEwQjk4MSIvPgogIDx0ZXh0IHg9IjIwMCIgeT0iMTAwIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBkb21pbmFudC1iYXNlbGluZT0ibWlkZGxlIiBmaWxsPSJ3aGl0ZSIgZm9udC1zaXplPSIyMCIgZm9udC1mYW1pbHk9IkFyaWFsIj7pl6nlv7Xlm77niYcgKDQwMHgyMDApPC90ZXh0Pgo8L3N2Zz4K)

*闪念中的图片也支持灯箱查看*

---

闪念模式现在具备完整功能，与文章模式保持一致！ 🎉`;

export default function DemoIntegrationPage() {
  return (
    <PageLayout>
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-4">
              MarkdownRenderer 集成演示
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              展示 MarkdownRenderer 组件在不同页面类型中的集成效果
            </p>
          </div>

          {/* 文章模式演示 */}
          <div className="mb-12">
            <h2 className="text-2xl font-semibold mb-4 text-blue-600 dark:text-blue-400">
              📄 文章模式 (Article Mode)
            </h2>
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
              <MarkdownRenderer
                content={demoArticleContent}
                variant="article"
                enableMath={true}
                enableMermaid={true}
                enableCodeFolding={true}
                enableImageLightbox={true}
                maxCodeLines={30}
                previewCodeLines={20}
                articlePath="/demo-integration"
              />
            </div>
          </div>

          {/* 闪念模式演示 */}
          <div className="mb-12">
            <h2 className="text-2xl font-semibold mb-4 text-green-600 dark:text-green-400">
              💭 闪念模式 (Memo Mode)
            </h2>
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
              <MarkdownRenderer
                content={demoMemoContent}
                variant="memo"
                enableMath={true}
                enableMermaid={true}
                enableCodeFolding={true}
                enableImageLightbox={true}
                maxCodeLines={30}
                previewCodeLines={20}
                articlePath="/demo-integration"
              />
            </div>
          </div>

          {/* 对比说明 */}
          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-blue-900 dark:text-blue-100 mb-3">
              🔍 模式对比
            </h3>
            <div className="grid md:grid-cols-3 gap-4 text-sm">
              <div>
                <h4 className="font-medium text-blue-800 dark:text-blue-200 mb-2">
                  文章模式特点：
                </h4>
                <ul className="text-blue-700 dark:text-blue-300 space-y-1">
                  <li>• 启用数学公式渲染</li>
                  <li>• 支持 Mermaid 图表</li>
                  <li>• 代码折叠阈值：30 行</li>
                  <li>• 完整的图片灯箱功能</li>
                  <li>• 适合长篇技术文章</li>
                </ul>
              </div>
              <div>
                <h4 className="font-medium text-blue-800 dark:text-blue-200 mb-2">
                  闪念模式特点：
                </h4>
                <ul className="text-blue-700 dark:text-blue-300 space-y-1">
                  <li>• 启用数学公式渲染</li>
                  <li>• 支持 Mermaid 图表</li>
                  <li>• 代码折叠阈值：30 行</li>
                  <li>• 完整的图片灯箱功能</li>
                  <li>• 适合快速记录和分享</li>
                </ul>
              </div>
              <div>
                <h4 className="font-medium text-blue-800 dark:text-blue-200 mb-2">
                  闪念卡片特点：
                </h4>
                <ul className="text-blue-700 dark:text-blue-300 space-y-1">
                  <li>• 启用数学公式渲染</li>
                  <li>• 支持 Mermaid 图表</li>
                  <li>• 代码折叠阈值：15 行</li>
                  <li>• 完整的图片灯箱功能</li>
                  <li>• 适合列表页面预览</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </PageLayout>
  );
}
