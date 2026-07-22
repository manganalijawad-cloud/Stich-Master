import React, { useState, useEffect, useCallback } from 'react';
import { Download, RefreshCw, AlertTriangle, CheckCircle } from 'lucide-react';

interface UpdateInfo {
  available: boolean;
  version?: string;
  downloading?: boolean;
  downloadProgress?: number;
  downloaded?: boolean;
  error?: string;
}

export default function VersionInfo({ collapsed = false, position }: { collapsed?: boolean; position?: 'bottom-right' }) {
  const [version, setVersion] = useState('v1.0.0');
  const [update, setUpdate] = useState<UpdateInfo>({ available: false });
  const [checking, setChecking] = useState(false);
  const isElectron = !!(window as any).electronAPI?.isElectron;

  useEffect(() => {
    if (!isElectron) return;
    (window as any).electronAPI.getAppVersion().then((v: string) => {
      setVersion(v.startsWith('v') ? v : `v${v}`);
    });
  }, [isElectron]);

  useEffect(() => {
    if (!isElectron) return;
    const api = (window as any).electronAPI;

    const unsubAvailable = api.onUpdateAvailable((info: { version: string }) => {
      setUpdate(prev => ({ ...prev, available: true, version: info.version, downloading: true }));
    });

    const unsubNotAvailable = api.onUpdateNotAvailable(() => {
      setUpdate(prev => ({ ...prev, available: false, downloading: false, downloaded: false }));
      setChecking(false);
    });

    const unsubProgress = api.onUpdateDownloadProgress((progress: { percent: number }) => {
      setUpdate(prev => ({ ...prev, downloading: true, downloadProgress: Math.round(progress.percent) }));
    });

    const unsubDownloaded = api.onUpdateDownloaded(() => {
      setUpdate(prev => ({ ...prev, downloaded: true, downloading: false, downloadProgress: 100 }));
    });

    const unsubError = api.onUpdateError((error: { message: string }) => {
      setUpdate(prev => ({ ...prev, error: error.message, downloading: false, available: false }));
      setChecking(false);
    });

    return () => {
      unsubAvailable();
      unsubNotAvailable();
      unsubProgress();
      unsubDownloaded();
      unsubError();
    };
  }, [isElectron]);

  const handleCheckForUpdates = useCallback(async () => {
    if (!isElectron) return;
    setChecking(true);
    setUpdate(prev => ({ ...prev, error: undefined }));
    try {
      const result = await (window as any).electronAPI.checkForUpdates();
      if (result.error && result.error !== 'Auto-updater not available') {
        setUpdate(prev => ({ ...prev, error: result.error }));
      }
      if (!result.updateAvailable) {
        setUpdate(prev => ({ ...prev, available: false }));
      }
    } catch {
      setUpdate(prev => ({ ...prev, error: 'Failed to check for updates.' }));
    } finally {
      setChecking(false);
    }
  }, [isElectron]);

  const handleInstallUpdate = useCallback(() => {
    if (!isElectron) return;
    (window as any).electronAPI.installUpdate();
  }, [isElectron]);

  if (position === 'bottom-right') {
    return (
      <div className="fixed bottom-2 right-3 z-50 flex items-center gap-2 print:hidden">
        {update.available && !update.downloaded && (
          <button
            onClick={handleCheckForUpdates}
            disabled={checking}
            className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-white text-[10px] font-bold uppercase tracking-wider rounded-md shadow-sm transition-colors cursor-pointer disabled:opacity-50"
            title="Check for updates"
          >
            {checking ? (
              <RefreshCw className="icon-xs animate-spin" />
            ) : (
              <Download className="icon-xs" />
            )}
            Update Available
          </button>
        )}

        {update.downloaded && (
          <button
            onClick={handleInstallUpdate}
            className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-500 hover:bg-emerald-600 text-white text-[10px] font-bold uppercase tracking-wider rounded-md shadow-sm transition-colors cursor-pointer"
          >
            <CheckCircle className="icon-xs" />
            Install Now
          </button>
        )}

        {update.error && (
          <div className="flex items-center gap-1.5 px-2 py-1 bg-red-900/20 text-red-400 text-[10px] rounded-md" title={update.error}>
            <AlertTriangle className="icon-xs" />
            Update Error
          </div>
        )}

        {update.downloading && update.downloadProgress !== undefined && !update.downloaded && (
          <div className="flex items-center gap-1.5 px-2 py-1 bg-brand-sky/20 text-brand-sky text-[10px] rounded-md">
            <RefreshCw className="icon-xs animate-spin" />
            {update.downloadProgress}%
          </div>
        )}

        <span className="text-[10px] font-mono text-slate-400 select-none">
          {version}
        </span>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className={`flex items-center gap-1.5 ${collapsed ? 'justify-center' : 'w-full'} relative group`}>
        {checking ? (
          <RefreshCw className="icon-xs text-slate-400 animate-spin shrink-0" />
        ) : update.available && !update.downloaded ? (
          <div className={`flex items-center gap-1.5 ${collapsed ? '' : 'w-full'}`}>
            <AlertTriangle className="icon-xs text-amber-400 shrink-0" />
            {!collapsed && (
              <button
                onClick={handleCheckForUpdates}
                className="text-[10px] text-amber-400 font-semibold uppercase tracking-wider truncate hover:text-amber-300 cursor-pointer"
              >
                Update Available
              </button>
            )}
          </div>
        ) : update.downloaded ? (
          <button
            onClick={handleInstallUpdate}
            className={`flex items-center gap-1.5 ${collapsed ? '' : 'w-full'} text-emerald-400 hover:text-emerald-300 cursor-pointer`}
          >
            <CheckCircle className="icon-xs shrink-0" />
            {!collapsed && <span className="text-[10px] font-semibold uppercase tracking-wider truncate">Install Now</span>}
          </button>
        ) : (
          <div className="flex items-center gap-1.5">
            <span className={`text-[10px] font-mono text-slate-500 ${collapsed ? 'hidden' : ''}`}>
              {version}
            </span>
            <button
              onClick={handleCheckForUpdates}
              className="text-[9px] text-slate-600 hover:text-slate-400 cursor-pointer uppercase tracking-wider"
              title="Check for updates"
            >
              <RefreshCw className="icon-xs" />
            </button>
          </div>
        )}

        {collapsed && (
          <div className="absolute left-full ml-2 hidden group-hover:block z-50 pointer-events-none">
            <div className="tooltip">
              {update.available ? `Update v${update.version} available` : version}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
