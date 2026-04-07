import { Icon } from "@iconify/react";
import Link from "next/link";

export default function ToBlogLink() {
  return (
    <div className="mx-auto mt-8 mb-8 max-w-3xl px-4 sm:px-6">
      <div className="text-center">
        <Link
          href="/posts"
          className="nature-button nature-button-ghost inline-flex items-center gap-2"
        >
          <Icon icon="tabler:arrow-left" className="w-4 h-4" />
          返回文章列表
        </Link>
      </div>
    </div>
  );
}
