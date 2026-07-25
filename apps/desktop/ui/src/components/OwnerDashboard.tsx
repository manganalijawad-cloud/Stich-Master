import React, { useState, useEffect } from 'react';
import { Database, Calendar, Upload, Shield, Printer, ListTodo, Sliders, ArrowUp } from 'lucide-react';
import { GarmentType } from '../types';
import GarmentConfiguration from './GarmentConfiguration';
import DataImport from './DataImport';
import ShopProfile from './admin/ShopProfile';
import PrintSettings from './admin/PrintSettings';
import PipelineSettings from './admin/PipelineSettings';

interface OwnerDashboardProps {
  token: string;
  onSettingsUpdated: () => void;
}

export default function OwnerDashboard({ token, onSettingsUpdated }: OwnerDashboardProps) {
  const [activeTab, setActiveTab] = useState<'ShopProfile' | 'Documents' | 'Pipeline' | 'GarmentTypes' | 'Backup' | 'Import'>('ShopProfile');

  const [archiveCutoff, setArchiveCutoff] = useState('');
  const [archiveSuccess, setArchiveSuccess] = useState<string | null>(null);
  const [backupLoading, setBackupLoading] = useState(false);
  const [restoreSuccess, setRestoreSuccess] = useState<string | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);

  const [garmentTypes, setGarmentTypes] = useState<GarmentType[]>([]);

  useEffect(() => {
    if (activeTab === 'Backup') {
      const d = new Date();
      d.setDate(d.getDate() - 30);
      setArchiveCutoff(d.toLocaleDateString('en-CA'));
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

  const triggerBackupDownload = async () => {
    setBackupLoading(true);
    try {
      const res = await fetch('/api/backup', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });

      const backup = await res.json();
      if (!res.ok) throw new Error(backup.error);

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
        if (!res.ok) throw new Error(data.error);

        setRestoreSuccess('Backup restored. Please refresh the app.');
      } catch (err: any) {
        setRestoreError(err.message || 'Failed to parse JSON file.');
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
      if (!res.ok) throw new Error(data.error);

      setArchiveSuccess('Orders archived successfully!');
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
    { id: 'Import' as const, label: 'Import customers', icon: Upload },
  ];

  return (
    <div className="space-y-3">

      {/* ─── Compact Tab Navigation ─── */}
      <div className="flex gap-1 p-1 bg-slate-100 rounded-xl border border-slate-200 w-fit max-w-full overflow-x-auto">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isSelected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap ${
                isSelected
                  ? 'bg-white text-brand-sidebar shadow-sm border border-slate-200'
                  : 'text-slate-500 hover:text-slate-800 hover:bg-white/60'
              }`}
            >
              <Icon className={`icon-xs ${isSelected ? 'text-brand-sky' : 'text-slate-400'}`} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ─── Content Area ─── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">

        {activeTab === 'ShopProfile' && (
          <ShopProfile token={token} onSettingsUpdated={onSettingsUpdated} />
        )}

        {activeTab === 'Documents' && (
          <PrintSettings token={token} onSettingsUpdated={onSettingsUpdated} />
        )}

        {activeTab === 'Pipeline' && (
          <PipelineSettings token={token} onSettingsUpdated={onSettingsUpdated} />
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

        {activeTab === 'Backup' && (
          <div className="p-4 space-y-3 animate-fade-in">

            <div className="card-flat space-y-3">
              <div className="flex items-center gap-2">
                <ArrowUp className="icon-sm text-emerald-500 shrink-0" />
                <div>
                  <h3 className="text-xs font-bold text-brand-sidebar uppercase tracking-wider">Restore from backup</h3>
                  <p className="text-3xs text-slate-500">Upload a .json backup file</p>
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
