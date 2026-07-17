import React, { useState } from 'react';

interface TooltipProps {
  content: string;
  children: React.ReactNode;
  position?: 'top' | 'bottom' | 'left' | 'right';
  delay?: number;
}

const positionClasses = {
  top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
  bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
  left: 'right-full top-1/2 -translate-y-1/2 mr-2',
  right: 'left-full top-1/2 -translate-y-1/2 ml-2',
};

const arrowClasses = {
  top: 'top-full left-1/2 -translate-x-1/2 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-text-primary',
  bottom: 'bottom-full left-1/2 -translate-x-1/2 border-l-4 border-r-4 border-b-4 border-l-transparent border-r-transparent border-b-text-primary',
  left: 'left-full top-1/2 -translate-y-1/2 border-t-4 border-b-4 border-l-4 border-t-transparent border-b-transparent border-l-text-primary',
  right: 'right-full top-1/2 -translate-y-1/2 border-t-4 border-b-4 border-r-4 border-t-transparent border-b-transparent border-r-text-primary',
};

export const Tooltip = ({ content, children, position = 'top', delay = 300 }: TooltipProps) => {
  const [visible, setVisible] = useState(false);
  let timeout: ReturnType<typeof setTimeout>;

  const show = () => {
    timeout = setTimeout(() => setVisible(true), delay);
  };
  const hide = () => {
    clearTimeout(timeout);
    setVisible(false);
  };

  return (
    <div className="relative inline-flex" onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}>
      {children}
      {visible && (
        <div className={`absolute z-50 ${positionClasses[position]}`}>
          <div className="px-2.5 py-1.5 bg-text-primary text-white text-xs font-semibold rounded-md shadow-md whitespace-nowrap">
            {content}
          </div>
          <div className={`absolute ${arrowClasses[position]}`} />
        </div>
      )}
    </div>
  );
};
