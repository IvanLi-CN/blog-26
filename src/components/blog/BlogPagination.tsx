"use client";

import { Icon } from "@iconify/react";

interface BlogPaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange?: (page: number) => void;
  prevText?: string;
  nextText?: string;
}

export default function BlogPagination({
  currentPage,
  totalPages,
  onPageChange,
  prevText = "Newer posts",
  nextText = "Older posts",
}: BlogPaginationProps) {
  const hasPrev = currentPage > 1;
  const hasNext = currentPage < totalPages;

  const handlePrevClick = () => {
    if (hasPrev && onPageChange) {
      onPageChange(currentPage - 1);
    }
  };

  const handleNextClick = () => {
    if (hasNext && onPageChange) {
      onPageChange(currentPage + 1);
    }
  };

  if (!hasPrev && !hasNext) {
    return null;
  }

  return (
    <div className="container flex">
      <div className="flex flex-row mx-auto container justify-between">
        <button
          type="button"
          onClick={handlePrevClick}
          className={`btn btn-ghost md:px-3 px-3 mr-2 ${!hasPrev ? "invisible" : ""}`}
          disabled={!hasPrev}
        >
          <Icon icon="tabler:chevron-left" className="w-6 h-6" />
          <p className="ml-2">{prevText}</p>
        </button>

        <button
          type="button"
          onClick={handleNextClick}
          className={`btn btn-ghost md:px-3 px-3 ${!hasNext ? "invisible" : ""}`}
          disabled={!hasNext}
        >
          <span className="mr-2">{nextText}</span>
          <Icon icon="tabler:chevron-right" className="w-6 h-6" />
        </button>
      </div>
    </div>
  );
}
