# 图片灯箱 URL Hash 功能

## 概述

为图片灯箱添加了 URL hash 支持，用户现在可以：
1. 点击图片时在 URL 中添加 hash 来标识当前查看的图片
2. 通过带有 hash 的 URL 直接打开对应图片的灯箱
3. 使用浏览器的后退/前进按钮来控制灯箱的开关

## 功能特性

### 1. URL Hash 格式
- 格式：`#image-{imageId}`
- 示例：`https://example.com/article#image-abc123`
- imageId 基于图片路径生成，确保唯一性

### 2. 支持的操作
- ✅ 点击图片时自动添加 hash
- ✅ 通过 URL 直接打开灯箱
- ✅ 关闭灯箱时清除 hash
- ✅ 浏览器后退/前进按钮支持
- ✅ ESC 键关闭灯箱

### 3. 兼容性
- 兼容现有的图片优化机制
- 支持多种图片路径格式
- 不影响现有的缩放和拖拽功能

## 修改的文件

### 1. `src/components/common/ContentImageHandler.tsx`
- 添加图片 ID 生成函数
- 添加 URL hash 操作函数
- 添加 hashchange 事件监听
- 修改图片点击事件处理

### 2. `src/components/common/ImageLightbox.tsx`
- 添加 popstate 事件监听
- 支持浏览器导航按钮

### 3. `src/components/memos/AttachmentGrid.tsx`
- 为闪念附件图片添加相同的 hash 支持
- 修改 ImageModal 组件
- 添加键盘和导航事件处理

## 技术实现

### 图片 ID 生成
```typescript
const generateImageId = (src: string): string => {
  const cleanSrc = src.replace(/\?.*$/, '').replace(/^https?:\/\//, '').replace(/^\//, '');
  let hash = 0;
  for (let i = 0; i < cleanSrc.length; i++) {
    const char = cleanSrc.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
};
```

### URL Hash 操作
```typescript
// 设置 hash
const setImageHash = (imageId: string) => {
  window.history.pushState(null, '', `#image-${imageId}`);
};

// 清除 hash
const clearImageHash = () => {
  window.history.pushState(null, '', window.location.pathname + window.location.search);
};
```

### 事件监听
```typescript
// 监听 hash 变化
window.addEventListener('hashchange', handleHashChange);

// 监听浏览器导航
window.addEventListener('popstate', handlePopState);
```

## 使用场景

### 1. 分享特定图片
用户可以复制带有 hash 的 URL 分享给他人，接收者打开链接时会直接看到对应的图片灯箱。

### 2. 浏览器导航
用户可以使用浏览器的后退/前进按钮来控制灯箱的开关，提供更自然的浏览体验。

### 3. 书签功能
用户可以将带有图片 hash 的 URL 添加为书签，下次访问时直接打开对应图片。

## 测试方法

1. 打开包含图片的文章页面
2. 点击图片，观察 URL 是否添加了 hash
3. 复制 URL 在新标签页打开，验证是否直接显示灯箱
4. 使用后退按钮，验证灯箱是否正确关闭
5. 按 ESC 键关闭灯箱，验证 hash 是否被清除

## 注意事项

1. **唯一性**：图片 ID 基于路径生成，同一图片在不同页面中会有相同的 ID
2. **性能**：hash 操作不会触发页面重新加载，性能影响最小
3. **兼容性**：使用标准的 Web API，兼容所有现代浏览器
4. **SEO**：hash 变化不影响 SEO，因为是客户端操作

## 未来扩展

可以考虑添加以下功能：
- 图片集合的导航（上一张/下一张）
- 图片元数据在 URL 中的编码
- 社交媒体分享优化
- 图片预加载优化
