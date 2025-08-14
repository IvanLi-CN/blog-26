// 图标组件 - 封装 @iconify/react
import { Icon as IconifyIcon } from '@iconify/react';

interface IconProps {
  name: string;
  className?: string;
  size?: number | string;
  style?: React.CSSProperties;
}

export default function Icon({ name, className = '', size, style }: IconProps) {
  return (
    <IconifyIcon
      icon={name}
      className={className}
      width={size}
      height={size}
      style={style}
    />
  );
}
