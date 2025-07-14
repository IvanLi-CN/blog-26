# 专业 Markdown 双栏编辑器

这是一个基于 `react-markdown` 的专业 Markdown 双栏编辑器，专为博客文章编辑而设计。

## 🚀 核心特性

### 双栏布局
- **左侧**：Markdown 源码编辑器（原生 textarea）
- **右侧**：专业 Markdown 实时预览

### 专业 Markdown 解析
- **react-markdown**：业界标准的 React Markdown 解析器
- **remark-gfm**：GitHub Flavored Markdown 支持
- **rehype-highlight**：代码语法高亮
- **rehype-raw**：支持原始 HTML

### 工具栏功能
- **文本格式**：粗体、斜体、删除线、行内代码
- **标题**：H1、H2、H3
- **列表**：无序列表、有序列表、任务列表
- **其他格式**：引用、代码块、水平线
- **媒体**：链接、图片
- **表格**：插入表格
- **工具**：复制 Markdown 到剪贴板

### 支持的 Markdown 语法

#### 文本格式
```markdown
**粗体文本**
*斜体文本*
~~删除线~~
`行内代码`
```

#### 标题
```markdown
# 一级标题
## 二级标题
### 三级标题
```

#### 列表
```markdown
- 无序列表项
- 另一个项目

1. 有序列表项
2. 另一个项目

- [ ] 未完成任务
- [x] 已完成任务
```

#### 其他格式
```markdown
> 这是引用文本

```代码块```

---

[链接文本](https://example.com)
![图片描述](https://example.com/image.jpg)
```

#### 表格
```markdown
| 标题1 | 标题2 | 标题3 |
|-------|-------|-------|
| 内容1 | 内容2 | 内容3 |
| 内容4 | 内容5 | 内容6 |
```

## 使用方法

1. 在左侧编辑器中输入 Markdown 内容
2. 右侧会实时显示渲染后的预览
3. 使用工具栏快速插入格式
4. 支持键盘快捷键和选中文本格式化

## 🔧 技术实现

### 核心技术栈
- **React Hooks**：useState、useRef、useEffect
- **react-markdown**：专业 Markdown 解析和渲染
- **remark-gfm**：GitHub Flavored Markdown 扩展
- **rehype-highlight**：代码语法高亮（highlight.js）
- **rehype-raw**：原始 HTML 支持
- **TypeScript**：完整的类型安全

### 架构优势
- **专业解析**：使用业界标准的 Markdown 解析器，而非手动实现
- **插件生态**：支持丰富的 remark/rehype 插件扩展
- **性能优化**：高效的 AST 解析和渲染
- **标准兼容**：完全兼容 CommonMark 和 GitHub Flavored Markdown
- **可扩展性**：易于添加新的 Markdown 功能和语法

### 为什么选择 react-markdown？
1. **专业性**：业界标准，被广泛使用和测试
2. **功能完整**：支持所有标准 Markdown 语法
3. **可扩展**：丰富的插件生态系统
4. **性能优秀**：基于 AST 的高效解析
5. **维护活跃**：持续更新和维护
6. **类型安全**：完整的 TypeScript 支持

相比手动实现 Markdown 解析：
- ✅ **更可靠**：经过大量测试和使用验证
- ✅ **更完整**：支持复杂的 Markdown 语法
- ✅ **更易维护**：无需维护复杂的正则表达式
- ✅ **更标准**：严格遵循 Markdown 规范
