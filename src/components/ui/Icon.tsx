// 图标组件 - 兼容历史的 `icon` / `name` 两种调用方式。
import { Icon as IconifyIcon } from "@iconify/react";

interface IconProps {
  name?: string;
  icon?: string;
  className?: string;
  size?: number | string;
  style?: React.CSSProperties;
}

export default function Icon({ name, icon, className = "", size, style }: IconProps) {
  const iconName = name ?? icon;
  if (!iconName) return null;

  return (
    <IconifyIcon icon={iconName} className={className} width={size} height={size} style={style} />
  );
}
