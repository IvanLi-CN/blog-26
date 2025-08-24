import type { Element } from "hast";
import type { ReactNode } from "react";
import type { Plugin } from "unified";

/**
 * Markdown 渲染器组件的属性接口
 */
export interface MarkdownRendererProps {
  /** Markdown 内容字符串 */
  content: string;
  /** 自定义 CSS 类名 */
  className?: string;
  /** 渲染变体，影响样式和行为 */
  variant?: "article" | "memo" | "preview";
  /** 是否启用数学公式渲染 */
  enableMath?: boolean;
  /** 是否启用 Mermaid 图表渲染 */
  enableMermaid?: boolean;
  /** 是否启用代码折叠功能 */
  enableCodeFolding?: boolean;
  /** 触发代码折叠的最大行数 */
  maxCodeLines?: number;
  /** 代码折叠时显示的预览行数 */
  previewCodeLines?: number;
  /** 是否启用图片灯箱功能 */
  enableImageLightbox?: boolean;
  /** 文章路径，用于相对路径解析 */
  articlePath?: string;
  /** 内容源类型，用于图片路径解析 */
  contentSource?: "local" | "webdav";
  /** 是否移除内容中的标签 */
  removeTags?: boolean;
}

/**
 * 代码块组件属性
 */
export interface CodeBlockProps {
  /** 代码内容 */
  children: string;
  /** 语言类型 */
  language?: string;
  /** 是否启用折叠功能 */
  enableFolding?: boolean;
  /** 最大显示行数 */
  maxLines?: number;
  /** 预览行数 */
  previewLines?: number;
  /** 自定义类名 */
  className?: string;
}

/**
 * 图片灯箱组件属性
 */
export interface ImageLightboxProps {
  /** 图片源地址 */
  src: string;
  /** 图片替代文本 */
  alt?: string;
  /** 自定义类名 */
  className?: string;
  /** 是否启用灯箱功能 */
  enableLightbox?: boolean;
}

/**
 * Mermaid 图表组件属性
 */
export interface MermaidChartProps {
  /** Mermaid 图表代码 */
  chart: string;
  /** 自定义类名 */
  className?: string;
}

/**
 * 代码折叠插件配置选项
 */
export interface CollapsibleCodeOptions {
  /** 触发折叠的最大行数，默认为 30 */
  maxLines?: number;
  /** 折叠时显示的预览行数，默认为 20 */
  previewLines?: number;
}

/**
 * 图片优化插件配置选项
 */
export interface ImageOptimizationOptions {
  /** 是否启用懒加载 */
  enableLazyLoading?: boolean;
  /** 是否启用灯箱功能 */
  enableLightbox?: boolean;
  /** 文章路径，用于相对路径解析 */
  articlePath?: string;
  /** 内容源类型，用于图片路径解析 */
  contentSource?: "local" | "webdav";
}

/**
 * 响应式表格插件配置选项
 */
export interface ResponsiveTablesOptions {
  /** 表格容器的自定义类名 */
  containerClassName?: string;
}

/**
 * 自定义 Rehype 插件类型
 */
export type RehypePlugin = Plugin<unknown[], Element, Element>;

/**
 * 插件配置类型
 */
export interface PluginConfig {
  collapsibleCode?: CollapsibleCodeOptions;
  imageOptimization?: ImageOptimizationOptions;
  responsiveTables?: ResponsiveTablesOptions;
}

/**
 * 渲染变体配置
 */
export interface VariantConfig {
  /** 基础 CSS 类名 */
  baseClassName: string;
  /** 是否默认启用数学公式 */
  enableMath: boolean;
  /** 是否默认启用 Mermaid */
  enableMermaid: boolean;
  /** 是否默认启用代码折叠 */
  enableCodeFolding: boolean;
  /** 默认最大代码行数 */
  maxCodeLines: number;
  /** 默认预览代码行数 */
  previewCodeLines: number;
  /** 是否默认启用图片灯箱 */
  enableImageLightbox: boolean;
}

/**
 * 错误信息类型
 */
export interface MarkdownError {
  /** 错误类型 */
  type: "parse" | "render" | "plugin";
  /** 错误消息 */
  message: string;
  /** 错误详情 */
  details?: unknown;
}

/**
 * 渲染状态类型
 */
export type RenderState = "idle" | "loading" | "success" | "error";

/**
 * 组件状态接口
 */
export interface MarkdownState {
  /** 渲染状态 */
  state: RenderState;
  /** 渲染后的内容 */
  content: ReactNode | null;
  /** 错误信息 */
  error: MarkdownError | null;
}
