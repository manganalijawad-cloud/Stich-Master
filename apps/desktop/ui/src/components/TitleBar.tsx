import React, { useState, useEffect } from 'react';
import { Minus, X } from 'lucide-react';

export default function TitleBar() {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    window.electronAPI?.isMaximized().then(setIsMaximized);
    const cleanup = window.electronAPI?.onMaximizedChange(setIsMaximized);
    return cleanup;
  }, []);

  const handleMinimize = () => window.electronAPI?.minimize();
  const handleMaximize = () => window.electronAPI?.maximize();
  const handleClose = () => window.electronAPI?.close();
  const handleDoubleClick = () => window.electronAPI?.maximize();

  return (
    <div className="title-bar" onDoubleClick={handleDoubleClick}>
      <div className="title-bar-title">
        <span>Hello Darzi</span>
      </div>
      <div className="title-bar-controls">
        <button onClick={handleMinimize} className="title-bar-btn" aria-label="Minimize">
          <Minus size={14} />
        </button>
        <button onClick={handleMaximize} className="title-bar-btn" aria-label={isMaximized ? 'Restore' : 'Maximize'}>
          {isMaximized ? (
            <div className="title-bar-restore-icon">
              <div className="restore-back" />
              <div className="restore-front" />
            </div>
          ) : (
            <div className="title-bar-max-icon" />
          )}
        </button>
        <button onClick={handleClose} className="title-bar-btn title-bar-close" aria-label="Close">
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
