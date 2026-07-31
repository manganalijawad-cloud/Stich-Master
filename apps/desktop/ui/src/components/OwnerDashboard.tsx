import React, { useState, useEffect } from 'react';
import { Database, Calendar, Upload, Shield, Printer, ListTodo, Sliders, ArrowUp, FolderOpen, Cloud } from 'lucide-react';
import { GarmentType } from '../types';
import GarmentConfiguration from './GarmentConfiguration';
import DataImport from './DataImport';
import ShopProfile from './admin/ShopProfile';
import PrintSettings from './admin/PrintSettings';
import PipelineSettings from './admin/PipelineSettings';
import CloudBackup from './admin/CloudBackup';
import { localDataStore } from '../lib/localDataStore';

interface OwnerDashboardProps {
  token: string;
  onSettingsUpdated: () => void;
  onOwnerModeRequired?: () => void;
}

export default function OwnerDashboard({ token, onSettingsUpdated, onOwnerModeRequired }: OwnerDashboardProps) {
  const [activeTab, setActiveTab] = useState<'ShopProfile' | 'Documents' | 'Pipeline' | 'GarmentTypes' | 'Backup' | 'CloudBackup' | 'Import'>('ShopProfile');

  const [archiveCutoff, setArchiveCutoff] = useState('');
  const [archiveSuccess, setArchiveSuccess] = useState<string | null>(null);
  const [backupLoading, setBackupLoading] = useState(false);
  const [restoreSuccess, setRestoreSuccess] = useState<string | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [autoBackupPath, setAutoBackupPath] = useState<string | null>(null);
  const [openingBackups, setOpeningBackups] = useState(false);

  const [garmentTypes, setGarmentTypes] = useState<GarmentType[]>([]);

  useEffect(() => {
    if (activeTab === 'Backup') {
      const d = new Date();
      d.setDate(d.getDate() - 30);
      setArchiveCutoff(d.toLocaleDateString('en-CA'));
      fetch('/api/backup/auto-dir', {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => r.json())
        .then((d) => {
          if (typeof d?.path === 'string') setAutoBackupPath(d.path);
        })
        .catch(() => setAutoBackupPath(null));
    }
    if (activeTab === 'Import') {
      fetch('/api/garment-types', {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then(r => r.json())
        .then(d => setGarmentTypes(Array.isArray(d) ? d : []))
        .catch(() => setGarmentTypes([]));
    }
  }, [activeTab, token]);

  const openAutoBackupsFolder = async () => {
    setOpeningBackups(true);
    try {
      let folder = autoBackupPath;
      if (!folder) {
        const res = await fetch('/api/backup/auto-dir', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || typeof data.path !== 'string') {
          throw new Error(data.error || 'Could not resolve auto-backup folder.');
        }
        folder = data.path;
        setAutoBackupPath(folder);
      }
      const api = (window as any).electronAPI;
      if (api?.openPath) {
        const result = await api.openPath(folder);
        if (result && result.success === false) {
          throw new Error(result.error || 'Could not open folder.');
        }
      } else {
        alert(`Auto-backups folder:\n${folder}`);
      }
    } catch (err: any) {
      alert(err?.message || 'Could not open auto-backups folder.');
    } finally {
      setOpeningBackups(false);
    }
  };
  const triggerBackupDownload = async () => {
    setBackupLoading(true);
    try {
      const res = await fetch('/api/backup', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });

      const backup = await res.json();
      if (!res.ok) {
        if (res.status === 403 && /owner mode required/i.test(backup.error || '')) {
          onOwnerModeRequired?.();
          return;
        }
        throw new Error(backup.error);
      }

      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `tailor_shop_backup_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      alert('Backup generation failed: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setBackupLoading(false);
    }
  };

  const handleRestoreUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setRestoreError(null);
    setRestoreSuccess(null);

    const confirmed = window.confirm(
      'Restore replaces ALL shop data on this computer (customers, orders, measurements, settings) with the backup file.\n\nThis cannot be undone. Download a fresh backup first if you are unsure.\n\nContinue?',
    );
    if (!confirmed) {
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const backupData = JSON.parse(event.target?.result as string);
        if (!backupData || !backupData.data) {
          throw new Error('Invalid system backup file structure.');
        }

        const res = await fetch('/api/restore', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ backupData }),
        });

        const data = await res.json();
        if (!res.ok) {
          if (res.status === 403 && /owner mode required/i.test(data.error || '')) {
            onOwnerModeRequired?.();
            return;
          }
          throw new Error(data.error);
        }

        setRestoreSuccess(
          typeof data.imported === 'number'
            ? `Backup restored (${data.imported} rows). Data refresh in progress…`
            : 'Backup restored. Data refresh in progress…',
        );
        await localDataStore.hydrate(token, { force: true });
        setRestoreSuccess(
          typeof data.imported === 'number'
            ? `Backup restored successfully (${data.imported} rows replaced).`
            : 'Backup restored successfully.',
        );
        onSettingsUpdated();
      } catch (err: any) {
        setRestoreError(err.message || 'Failed to parse JSON file.');
      } finally {
        e.target.value = '';
      }
    };
    reader.readAsText(file);
  };

  const handleArchiveOrders = async () => {
    if (!archiveCutoff) return;
    if (!confirm('Are you sure you want to archive all Completed/Delivered orders dated prior to ' + archiveCutoff + '? This clears active listings.')) {
      return;
    }

    setArchiveSuccess(null);

    try {
      const res = await fetch('/api/archive-orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ beforeDate: archiveCutoff }),
      });

      const data = await res.json();
      if (!res.ok) {
        if (res.status === 403 && /owner mode required/i.test(data.error || '')) {
          onOwnerModeRequired?.();
          return;
        }
        throw new Error(data.error);
      }

      setArchiveSuccess('Orders archived successfully!');
      await localDataStore.hydrate(token, { force: true });
    } catch (err: any) {
      alert('Archiving failed: ' + err.message);
    }
  };

  const tabs = [
    { id: 'ShopProfile' as const, label: 'Shop details', icon: Shield },
    { id: 'Documents' as const, label: 'Printing', icon: Printer },
    { id: 'Pipeline' as const, label: 'Order stages', icon: ListTodo },
    { id: 'GarmentTypes' as const, label: 'Clothes types', icon: Sliders },
    { id: 'Backup' as const, label: 'Backup', icon: Database },
    { id: 'CloudBackup' as const, label: 'Cloud backup', icon: Cloud },
    { id: 'Import' as const, label: 'Import customers', icon: Upload },
  ];

  return (
    <div className="stack-md">

      {/* ─── Compact Tab Navigation ─── */}
      <div className="filter-group w-fit max-w-full overflow-x-auto">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isSelected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`filter-tab ${isSelected ? 'filter-tab-active' : ''}`}
            >
              <Icon className="icon-xs" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ─── Content Area ─── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-hidden">

        {activeTab === 'ShopProfile' && (
          <ShopProfile token={token} onSettingsUpdated={onSettingsUpdated} onOwnerModeRequired={onOwnerModeRequired} />
        )}

        {activeTab === 'Documents' && (
          <PrintSettings token={token} onSettingsUpdated={onSettingsUpdated} onOwnerModeRequired={onOwnerModeRequired} />
        )}

        {activeTab === 'Pipeline' && (
          <PipelineSettings token={token} onSettingsUpdated={onSettingsUpdated} onOwnerModeRequired={onOwnerModeRequired} />
        )}

        {activeTab === 'GarmentTypes' && (
          <div className="p-3 animate-fade-in">
            <GarmentConfiguration token={token} />
          </div>
        )}

        {activeTab === 'Import' && (
          <div className="p-3 animate-fade-in">
            <DataImport token={token} garmentTypes={garmentTypes} onComplete={() => setActiveTab('ShopProfile')} />
          </div>
        )}

        {activeTab === 'CloudBackup' && (
          <CloudBackup token={token} onOwnerModeRequired={onOwnerModeRequired} />
        )}

        {activeTab === 'Backup' && (
          <div className="p-4 space-y-3 animate-fade-in">

            <div className="card-flat space-y-3">
              <div className="flex items-center gap-2">
                <FolderOpen className="icon-sm text-sky-600 shrink-0" />
                <div>
                  <h3 className="text-xs font-bold text-brand-sidebar uppercase tracking-wider">Automatic daily backups</h3>
                  <p className="text-3xs text-slate-500">
                    Hello Darzi saves a restore-compatible .json copy once per day on this PC (keeps the last 7).
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={openAutoBackupsFolder}
                disabled={openingBackups}
                className="px-4 py-2 bg-white hover:bg-slate-50 disabled:opacity-60 text-slate-800 font-semibold rounded-lg cursor-pointer text-xs uppercase tracking-wider border border-slate-200 transition-colors"
              >
                {openingBackups ? 'Opening…' : 'Open auto-backups folder'}
              </button>
            </div>

            <div className="card-flat space-y-3">
              <div className="flex items-center gap-2">
                <Database className="icon-sm text-slate-600 shrink-0" />
                <div>
                  <h3 className="text-xs font-bold text-brand-sidebar uppercase tracking-wider">Download backup</h3>
                  <p className="text-3xs text-slate-500">Save a .json copy of shop data</p>
                </div>
              </div>
              <button
                type="button"
                onClick={triggerBackupDownload}
                disabled={backupLoading}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white font-semibold rounded-lg cursor-pointer text-xs uppercase tracking-wider border border-slate-900 transition-colors"
              >
                {backupLoading ? 'Preparing…' : 'Download backup'}
              </button>
            </div>

            <div className="card-flat space-y-3">
              <div className="flex items-center gap-2">
                <ArrowUp className="icon-sm text-emerald-500 shrink-0" />
                <div>
                  <h3 className="text-xs font-bold text-brand-sidebar uppercase tracking-wider">Restore from backup</h3>
                  <p className="text-3xs text-slate-500">
                    Replaces all shop data on this PC with the backup. Download a backup first.
                  </p>
                </div>
              </div>
              {restoreSuccess && <div className="alert-success animate-fade-in text-xs py-1.5">{restoreSuccess}</div>}
              {restoreError && <div className="alert-error animate-fade-in text-xs py-1.5">{restoreError}</div>}
              <input type="file" accept=".json" onChange={handleRestoreUpload}
                className="block text-xs text-slate-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-3xs file:font-semibold file:uppercase file:tracking-wider file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200 cursor-pointer" />
            </div>

            <div className="card-flat space-y-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-brand-bg rounded-xl border border-slate-200">
                    <Calendar className="icon-md text-amber-500" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-brand-sidebar uppercase tracking-wider">Archive Old Orders</h3>
                    <p className="text-caption-xs mt-0.5">Batch-archive completed orders to maintain database speed</p>
                  </div>
                </div>
              </div>

              {archiveSuccess && <div className="alert-success animate-fade-in">{archiveSuccess}</div>}

              <div className="flex flex-wrap gap-3 items-end">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 block uppercase tracking-wider">Archive orders before:</label>
                  <input type="date" value={archiveCutoff} onChange={(e) => setArchiveCutoff(e.target.value)} className="input-base" />
                </div>
                <button onClick={handleArchiveOrders} className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold rounded-lg cursor-pointer text-xs uppercase tracking-wider border border-amber-500 transition-colors">
                  Archive Closed Orders
                </button>
              </div>
            </div>

          </div>
        )}

      </div>
    </div>
  );
}
