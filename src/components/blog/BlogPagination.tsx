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
    <div className="flex">
      <div className="mx-auto flex w-full flex-row justify-between gap-3">
        <button
          type="button"
          onClick={handlePrevClick}
          className={`nature-button nature-button-ghost px-4 ${!hasPrev ? "invisible" : ""}`}
          disabled={!hasPrev}
        >
          <Icon icon="tabler:chevron-left" className="w-6 h-6" />
          <p className="ml-2">{prevText}</p>
        </button>

        <button
          type="button"
          onClick={handleNextClick}
          className={`nature-button nature-button-ghost px-4 ${!hasNext ? "invisible" : ""}`}
          disabled={!hasNext}
        >
          <span className="mr-2">{nextText}</span>
          <Icon icon="tabler:chevron-right" className="w-6 h-6" />
        </button>
      </div>
    </div>
  );
}
