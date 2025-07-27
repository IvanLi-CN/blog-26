# 基于显示尺寸的水印优化

## 概述

本项目的图片优化器现在支持根据图片的实际显示尺寸而不是原始分辨率来生成水印。这确保了水印在不同界面显示场景中都能保持合适的大小和可读性。

## 功能特性

### 1. 显示尺寸参数

系统支持通过 `display-w` 和 `display-h` 参数指定图片的实际显示尺寸：

- **闪念附件**: 300x300px（1:1 比例的正方形显示）
- **闪念内容图片**: 600x450px（4:3 比例，适合内容展示）
- **文章列表图片**: 400x225px（移动端）或 900x506px（桌面端，16:9 比例）
- **文章详情图片**: 900x506px（16:9 比例，较大尺寸）

### 2. 水印缩放算法

水印大小基于以下逻辑计算：

1. 根据显示尺寸计算基础字体大小：`Math.max(8, Math.min(32, displayWidth * 0.02))`
2. 计算实际图片与显示尺寸的缩放比例
3. 将基础字体大小按比例缩放到实际图片尺寸
4. 阴影效果和描边也会相应缩放

## API 使用

### 图片渲染 API 参数

在 `/api/render-image/[...path]` 端点中，新增了以下查询参数：

- `display-w`: 指定显示宽度（像素）
- `display-h`: 指定显示高度（像素）

示例：

```url
/api/render-image/example.jpg?w=800&f=webp&q=85&display-w=400&display-h=225
```

### 组件使用

#### Image 组件

```astro
<Image
  src={imageSrc}
  width={400}
  height={225}
  displayWidth={400}
  displayHeight={225}
  alt="文章图片"
/>
```

#### 闪念附件

```tsx
<img
  src={`/api/render-image/${imagePath}?w=300&f=webp&q=85&display-w=300&display-h=300`}
  alt="附件"
/>
```

#### 闪念内容

```tsx
const optimizedSrc = `/api/render-image/${imagePath}?f=webp&q=85&display-w=600&display-h=450`;
```

## 实现细节

### 接口定义

```typescript
export interface ImageOptimizationOptions {
  width?: number;
  height?: number;
  quality?: number;
  format?: 'webp' | 'jpeg' | 'png';
  addWatermark?: boolean;
  removeMetadata?: boolean;
  // 显示尺寸：用于计算水印大小
  displayWidth?: number;
  displayHeight?: number;
}
```

### 水印生成函数

```typescript
async function createWatermarkSvg(
  text: string,
  displayWidth: number,
  displayHeight: number,
  actualWidth: number,
  actualHeight: number
): Promise<Buffer>
```

## 优势

1. **一致性**: 水印在不同设备上保持一致的视觉效果
2. **可读性**: 水印大小适合实际显示尺寸，不会过大或过小
3. **性能**: 避免为高分辨率图片生成过大的水印
4. **灵活性**: 支持不同内容类型的个性化配置

## 缓存策略

缓存键现在包含显示尺寸参数，确保不同配置的图片能够正确缓存：

```text
${path}-${width}-${height}-${quality}-${format}-${displayWidth}-${displayHeight}-${hasWatermark}-${lastModified}
```

## 向后兼容

- 如果没有指定 `display-w` 和 `display-h`，水印将基于实际图片尺寸计算
- 现有的图片 URL 仍然有效，会使用默认的水印计算方式
- 新的显示尺寸参数是可选的，不会影响现有功能
