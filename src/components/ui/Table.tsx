import React from 'react';

export interface TableColumn<T> {
  key: string;
  header: string;
  align?: 'left' | 'center' | 'right';
  width?: string;
  sortable?: boolean;
  render: (row: T, index: number) => React.ReactNode;
}

interface TableProps<T> {
  columns: TableColumn<T>[];
  data: T[];
  keyExtractor: (row: T) => string;
  onRowClick?: (row: T) => void;
  selectedId?: string;
  className?: string;
  stickyHeader?: boolean;
  emptyMessage?: string;
}

export function Table<T>({ columns, data, keyExtractor, onRowClick, selectedId, className = '', stickyHeader = true, emptyMessage }: TableProps<T>) {
  return (
    <div className={`table-wrap ${className}`}>
      <table className="table-base">
        <thead>
          <tr className={stickyHeader ? 'sticky top-0 z-10' : ''}>
            {columns.map((col) => (
              <th
                key={col.key}
                className={`table-th ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'}`}
                style={col.width ? { width: col.width } : undefined}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border-light">
          {data.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="p-8 text-center text-text-muted text-sm font-semibold">
                {emptyMessage || 'No data available.'}
              </td>
            </tr>
          ) : (
            data.map((row, index) => {
              const id = keyExtractor(row);
              const isSelected = id === selectedId;
              return (
                <tr
                  key={id}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={`table-tr transition-all duration-100 ${
                    onRowClick ? 'cursor-pointer' : ''
                  } ${
                    isSelected
                      ? 'bg-info-bg/40 border-l-3 border-l-brand-accent shadow-sm'
                      : 'hover:bg-surface-muted/70'
                  }`}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={`table-td ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'}`}
                    >
                      {col.render(row, index)}
                    </td>
                  ))}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
