import { Icon } from "@iconify/react";

interface Post {
  public?: boolean;
  draft?: boolean;
}

interface PostStatusProps {
  post: Post;
  size?: "sm" | "md" | "lg";
  showText?: boolean;
  className?: string;
  isAdmin?: boolean;
}

// 根据优先级确定状态：私有 > 草稿 > 公开
function getPostStatus(post: Post) {
  // 私有状态：public 明确为 false 或者未设置（默认为 false）
  if (post.public === false || post.public === undefined) {
    return {
      type: "private",
      label: "私有",
      icon: "tabler:eye-off",
      badgeClass: "badge-error",
      iconClass: "text-error",
    };
  }

  // 草稿状态：draft 为 true
  if (post.draft) {
    return {
      type: "draft",
      label: "草稿",
      icon: "tabler:edit",
      badgeClass: "badge-warning",
      iconClass: "text-warning",
    };
  }

  // 公开状态：public 明确为 true 且 draft 不为 true
  return {
    type: "published",
    label: "公开",
    icon: "tabler:eye",
    badgeClass: "badge-success",
    iconClass: "text-success",
  };
}

export default function PostStatus({
  post,
  size = "md",
  showText = true,
  className = "",
  isAdmin = false,
}: PostStatusProps) {
  if (!isAdmin) return null;

  const status = getPostStatus(post);

  // 根据 size 确定样式
  const sizeClasses = {
    sm: {
      badge: "badge-sm",
      icon: "w-3 h-3",
      text: "text-xs",
    },
    md: {
      badge: "badge-md",
      icon: "w-4 h-4",
      text: "text-sm",
    },
    lg: {
      badge: "badge-lg",
      icon: "w-5 h-5",
      text: "text-base",
    },
  };

  const sizeClass = sizeClasses[size];

  if (showText) {
    return (
      <span className={`badge ${status.badgeClass} ${sizeClass.badge} gap-1 ${className}`}>
        <Icon icon={status.icon} className={sizeClass.icon} />
        <span className={sizeClass.text}>{status.label}</span>
      </span>
    );
  }

  return (
    <div className={`tooltip tooltip-bottom ${className}`} data-tip={status.label}>
      <Icon icon={status.icon} className={`${sizeClass.icon} ${status.iconClass}`} />
    </div>
  );
}
