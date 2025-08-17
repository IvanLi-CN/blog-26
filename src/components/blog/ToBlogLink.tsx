import { Icon } from '@iconify/react';
import Link from 'next/link';

export default function ToBlogLink() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 mt-8 mb-8">
      <div className="text-center">
        <Link
          href="/posts"
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-primary hover:text-primary/80 transition-colors duration-200"
        >
          <Icon icon="tabler:arrow-left" className="w-4 h-4" />
          返回文章列表
        </Link>
      </div>
    </div>
  );
}
