"use client";

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import Icon from '../ui/Icon';

interface TimelineItemProps {
  item: {
    type: 'post' | 'memo';
    id: string;
    slug: string;
    title?: string;
    content?: string;
    body?: string;
    excerpt?: string;
    publishDate: Date;
    tags?: string[];
    image?: string;
    permalink?: string;
    dataSource?: string;
  };
  isLast?: boolean;
  loading?: boolean;
}

export default function TimelineItem({ item, isLast = false, loading = false }: TimelineItemProps) {
  const connectorRef = useRef<HTMLDivElement>(null);

  // 根据类型确定链接
  const itemUrl = item.type === 'memo' ? `/memos/${item.slug}` : item.permalink || `/posts/${item.slug}`;

  // 格式化时间
  const formatDate = (date: Date) => {
    return date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
  };

  // 获取类型图标和颜色
  const getTypeIcon = (type: string) => {
    return type === 'memo' ? 'tabler:bulb' : 'tabler:article';
  };

  const getTypeColor = (type: string) => {
    return type === 'memo' ? 'text-yellow-500' : 'text-blue-500';
  };

  // 动态调整时间线连接线高度
  useEffect(() => {
    const adjustConnectorHeight = () => {
      if (!connectorRef.current || isLast) return;

      const currentItem = connectorRef.current.closest('.timeline-item') as HTMLElement;
      if (!currentItem) return;

      const nextItem = currentItem.nextElementSibling as HTMLElement;
      if (!nextItem) return;

      const currentRect = currentItem.getBoundingClientRect();
      const nextRect = nextItem.getBoundingClientRect();
      const nextNodeOffset = 32; // 下一个节点的大概位置

      const connectorHeight = nextRect.top - currentRect.top - 32 + nextNodeOffset;
      connectorRef.current.style.height = `${Math.max(connectorHeight, 80)}px`;
    };

    // 延迟执行以确保DOM已渲染
    const timer = setTimeout(adjustConnectorHeight, 100);
    
    // 监听窗口大小变化
    window.addEventListener('resize', adjustConnectorHeight);
    
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', adjustConnectorHeight);
    };
  }, [isLast]);

  return (
    <div className="timeline-item relative flex items-start gap-3 sm:gap-4">
      {/* 时间线主轴和节点 */}
      <div className="flex flex-col items-center relative">
        {/* 时间线节点 */}
        <div className="flex items-center justify-center w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-base-200 border-2 border-base-300 flex-shrink-0 z-10 relative">
          {loading ? (
            <div className="w-5 h-5 bg-base-300 rounded-full animate-pulse"></div>
          ) : (
            <Icon
              name={getTypeIcon(item.type)}
              className={`w-5 h-5 ${getTypeColor(item.type)}`}
            />
          )}
        </div>

        {/* 时间线主轴（连接线） */}
        {!isLast && (
          <div 
            ref={connectorRef}
            className="timeline-connector w-0.5 bg-base-300 opacity-30 absolute top-8 sm:top-10 left-1/2 transform -translate-x-1/2"
            style={{ height: '100vh' }}
          ></div>
        )}
      </div>

      {/* 内容区域 */}
      <div className="flex-1 min-w-0 pb-6 sm:pb-8">
        {/* 时间和类型信息 */}
        <div className="flex items-center gap-2 mb-2">
          {loading ? (
            <>
              <div className="h-4 bg-base-300 rounded w-20 animate-pulse"></div>
              <div className="h-5 bg-base-300 rounded w-12 animate-pulse"></div>
            </>
          ) : (
            <>
              <span className="text-sm md:text-base text-muted">
                {formatDate(item.publishDate)}
              </span>
              <span className="badge badge-outline badge-xs">
                {item.type === 'memo' ? '闪念' : '文章'}
              </span>
            </>
          )}
        </div>

        {/* 内容卡片 */}
        {loading ? (
          <div className="card bg-base-100 shadow-sm border border-base-200">
            <div className="card-body p-3 sm:p-4">
              <div className="h-20 bg-base-200 rounded mb-2 animate-pulse"></div>
              <div className="h-3 bg-base-300 rounded w-3/4 mb-1 animate-pulse"></div>
              <div className="h-3 bg-base-300 rounded w-1/2 animate-pulse"></div>
            </div>
          </div>
        ) : (
          <div className="card bg-base-100 shadow-sm hover:shadow-md transition-all duration-200 border border-base-200 hover:border-base-300">
            <div className="card-body p-3 sm:p-4">
              {item.type === 'post' && (
                <div className="flex gap-4">
                  {/* 文章封面图 */}
                  {item.image && (
                    <div className="flex-shrink-0">
                      <img
                        src={item.image}
                        alt={item.title || '文章封面'}
                        className="w-20 h-20 sm:w-24 sm:h-24 object-cover rounded"
                        loading="lazy"
                        width={96}
                        height={96}
                      />
                    </div>
                  )}

                  {/* 文章内容 */}
                  <div className="flex-1 min-w-0">
                    {/* 文章标题 */}
                    {item.title && (
                      <Link href={itemUrl} className="block">
                        <h3 className="card-title text-lg md:text-xl mb-2 line-clamp-2 hover:text-primary transition-colors">
                          {item.title}
                        </h3>
                      </Link>
                    )}

                    {/* 文章摘要 */}
                    {item.excerpt && (
                      <p className="text-sm md:text-base text-muted line-clamp-3">
                        {item.excerpt}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {item.type === 'memo' && (
                <>
                  {/* 闪念完整内容 */}
                  {(item.content || item.body) && (
                    <div className="memo-content">
                      <div className="prose prose-sm md:prose-base max-w-none text-sm md:text-base">
                        {/* 简单的markdown渲染，这里先用纯文本 */}
                        <p>{(item.content || item.body)?.substring(0, 200)}...</p>
                      </div>
                    </div>
                  )}
                  {/* 闪念查看详情链接 */}
                  <div className="mt-3">
                    <Link href={itemUrl} className="text-sm text-primary hover:text-primary-focus transition-colors">
                      查看详情 →
                    </Link>
                  </div>
                </>
              )}

              {/* 标签 */}
              {item.tags && item.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-3">
                  {item.tags.slice(0, 3).map((tag: string, index: number) => (
                    <span key={index} className="badge badge-outline badge-xs md:badge-sm">
                      #{tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
