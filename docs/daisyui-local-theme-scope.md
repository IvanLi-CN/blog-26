# DaisyUI 局部主题作用域问题解决

## 问题
DaisyUI v5 + Tailwind CSS v4 环境中，`data-theme` 属性无法在局部作用域生效。

## 解决方案
在 `src/app/globals.css` 中配置：

```css
@import "tailwindcss";
@plugin "daisyui" {
  themes: all;
}
```

## 使用
```tsx
// 局部主题
<div data-theme="synthwave">
  <button className="btn btn-primary">按钮</button>
</div>

// 纯 CSS 颜色预览圆点
<div data-theme={theme}>
  <span className="w-4 h-4 rounded-full bg-primary" />
  <span className="w-4 h-4 rounded-full bg-secondary" />
  <span className="w-4 h-4 rounded-full bg-accent" />
  <span className="w-4 h-4 rounded-full bg-neutral" />
</div>
```

## 约定：`data-theme` 与 `.dark`

- 全局主题由 `document.documentElement[data-theme]` 控制（值来源：`localStorage.theme`）。
- `.dark` class 仅用于 Tailwind `dark:` 变体；暗色主题判定以 `src/config/site.ts` 的 `UI.theme.darkThemes` 为准（实现：`src/lib/theme.ts`）。

## 原理
`themes: all` 让 DaisyUI 自动生成所有主题的 `[data-theme="themename"]` CSS 规则，无需手动定义颜色变量。

## 验证
```javascript
const element = document.querySelector('[data-theme="synthwave"]');
const color = getComputedStyle(element).getPropertyValue('--color-primary');
console.log(color); // 应该显示 synthwave 主题的颜色值
```
