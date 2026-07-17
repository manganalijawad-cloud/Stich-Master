import React from 'react';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  siblingCount?: number;
}

export const Pagination = ({ currentPage, totalPages, onPageChange, siblingCount = 1 }: PaginationProps) => {
  if (totalPages <= 1) return null;

  const range = (start: number, end: number) => Array.from({ length: end - start + 1 }, (_, i) => start + i);

  const siblingsStart = Math.max(2, currentPage - siblingCount);
  const siblingsEnd = Math.min(totalPages - 1, currentPage + siblingCount);

  const pages: (number | 'ellipsis')[] = [1];
  if (siblingsStart > 2) pages.push('ellipsis');
  pages.push(...range(siblingsStart, siblingsEnd));
  if (siblingsEnd < totalPages - 1) pages.push('ellipsis');
  if (totalPages > 1) pages.push(totalPages);

  const btn = 'inline-flex items-center justify-center w-8 h-8 text-xs font-semibold rounded-lg transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40 disabled:opacity-30 disabled:cursor-not-allowed';

  return (
    <nav className="flex items-center justify-center gap-1" aria-label="Pagination">
      <button
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage <= 1}
        className={`${btn} text-text-muted hover:text-text-primary hover:bg-surface-hover cursor-pointer`}
        aria-label="Previous page"
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6"/></svg>
      </button>
      {pages.map((page, idx) =>
        page === 'ellipsis' ? (
          <span key={`ellipsis-${idx}`} className="w-8 h-8 flex items-center justify-center text-xs text-text-muted">...</span>
        ) : (
          <button
            key={page}
            onClick={() => onPageChange(page)}
            className={`${btn} cursor-pointer ${page === currentPage ? 'bg-brand-sidebar text-white shadow-sm' : 'text-text-secondary hover:bg-surface-hover'}`}
            aria-current={page === currentPage ? 'page' : undefined}
          >
            {page}
          </button>
        )
      )}
      <button
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage >= totalPages}
        className={`${btn} text-text-muted hover:text-text-primary hover:bg-surface-hover cursor-pointer`}
        aria-label="Next page"
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 18 6-6-6-6"/></svg>
      </button>
    </nav>
  );
};
