"use client";

/**
 * 通用空状态组件
 *
 * 提供一致的空状态视觉设计，支持自定义图标、文案和行动按钮
 * 完全响应式设计，与项目的DaisyUI主题系统完美集成
 */

import { cn } from "../../lib/utils";
import { Button } from "./button";
import Icon from "./Icon";

export interface EmptyStateProps {
  /** 图标名称，使用项目的iconify图标 */
  icon?: string;
  /** 主标题 */
  title?: string;
  /** 副标题描述 */
  description?: string;
  /** 可选的行动按钮 */
  action?: {
    label: string;
    onClick: () => void;
    variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
  };
  /** 自定义样式类名 */
  className?: string;
  /** 尺寸变体 */
  size?: "sm" | "md" | "lg";
}

export function EmptyState({
  icon = "tabler:notes",
  title = "暂无内容",
  description,
  action,
  className,
  size = "md",
}: EmptyStateProps) {
  // 根据尺寸确定样式
  const sizeConfig = {
    sm: {
      container: "py-8 px-4",
      iconContainer: "w-12 h-12 mb-4",
      icon: "w-6 h-6",
      title: "text-lg font-semibold",
      description: "text-sm",
      spacing: "space-y-3",
    },
    md: {
      container: "py-12 px-4",
      iconContainer: "w-16 h-16 sm:w-20 sm:h-20 mb-6",
      icon: "w-8 h-8 sm:w-10 sm:h-10",
      title: "text-xl sm:text-2xl font-semibold",
      description: "text-base sm:text-lg",
      spacing: "space-y-4",
    },
    lg: {
      container: "py-16 px-6",
      iconContainer: "w-20 h-20 sm:w-24 sm:h-24 mb-8",
      icon: "w-10 h-10 sm:w-12 sm:h-12",
      title: "text-2xl sm:text-3xl font-semibold",
      description: "text-lg sm:text-xl",
      spacing: "space-y-6",
    },
  };

  const config = sizeConfig[size];

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center animate-fade-in-up",
        config.container,
        config.spacing,
        className
      )}
    >
      {/* 图标容器 */}
      <div
        className={cn(
          "flex items-center justify-center rounded-full bg-primary/10 transition-colors",
          config.iconContainer
        )}
      >
        <Icon name={icon} className={cn("text-primary/60", config.icon)} />
      </div>

      {/* 文字内容 */}
      <div className={cn("max-w-md", config.spacing)}>
        {/* 主标题 */}
        <h3 className={cn("text-base-content mb-2", config.title)}>{title}</h3>

        {/* 副标题描述 */}
        {description && (
          <p className={cn("text-base-content/60", config.description)}>{description}</p>
        )}
      </div>

      {/* 行动按钮 */}
      {action && (
        <div className="mt-6">
          <Button
            onClick={action.onClick}
            variant={action.variant || "default"}
            className="animate-scale-in"
          >
            {action.label}
          </Button>
        </div>
      )}
    </div>
  );
}

export default EmptyState;
