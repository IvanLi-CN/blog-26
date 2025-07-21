import { Icon } from '@iconify/react';
import { useEffect, useState } from 'react';
import { trpc } from '~/lib/trpc-client';

export type VectorizationStatusType = 'correct' | 'mismatch' | 'notvectorized' | 'loading';

interface VectorizationStatusProps {
  slug: string;
  className?: string;
  showText?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

interface StatusConfig {
  icon: string;
  text: string;
  className: string;
  title: string;
}

const statusConfigs: Record<VectorizationStatusType, StatusConfig> = {
  loading: {
    icon: 'mingcute:loading-line',
    text: '检查中',
    className: 'text-base-content/60',
    title: '正在检查向量化状态...',
  },
  correct: {
    icon: 'mingcute:ai-line',
    text: '已索引',
    className: 'text-base-content/60',
    title: '内容已成功向量化，可用于智能搜索',
  },
  mismatch: {
    icon: 'mingcute:ai-line',
    text: '需更新',
    className: 'text-base-content/60',
    title: '向量化模型已更新，需要重新向量化此内容',
  },
  notvectorized: {
    icon: 'mingcute:warning-line',
    text: '未索引',
    className: 'text-base-content/60',
    title: '内容尚未向量化，无法用于智能搜索',
  },
};

const sizeClasses = {
  sm: 'w-3 h-3',
  md: 'w-4 h-4',
  lg: 'w-5 h-5',
};

export function VectorizationStatus({ slug, className = '', showText = false, size = 'md' }: VectorizationStatusProps) {
  const [status, setStatus] = useState<VectorizationStatusType>('loading');

  // 使用 tRPC 查询向量化状态
  const { data: statusData, isLoading } = trpc.vectorization.getStatus.useQuery(
    { slugs: [slug] },
    {
      enabled: !!slug,
      refetchOnWindowFocus: false,
      staleTime: 1000 * 60 * 5, // 5分钟缓存
    }
  );

  useEffect(() => {
    if (isLoading) {
      setStatus('loading');
      return;
    }

    if (statusData && statusData[slug]) {
      const statusInfo = statusData[slug];
      setStatus(statusInfo.status as VectorizationStatusType);
    } else {
      setStatus('notvectorized');
    }
  }, [statusData, isLoading, slug]);

  // 只在状态为 'correct' 时显示组件
  if (status !== 'correct') {
    return null;
  }

  const config = statusConfigs[status];
  const iconSizeClass = sizeClasses[size];

  // 构建 title，对于 correct 状态使用默认 title
  const title = config.title;

  // 只渲染正确向量化的图标
  const renderIcon = () => {
    const iconClassName = `${iconSizeClass} ${config.className} flex-shrink-0`;

    return <Icon icon={config.icon} className={iconClassName} />;
  };

  return (
    <div className={`flex items-center gap-1 ${className}`} title={title}>
      {renderIcon()}

      {/* 文本（可选） */}
      {showText && <span className={`text-xs ${config.className}`}>{config.text}</span>}
    </div>
  );
}
