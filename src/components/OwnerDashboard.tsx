/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { DollarSign, Users, Settings, Database, Activity, Plus, Trash2, ShieldAlert, ArrowDown, ArrowUp, Calendar, AlertTriangle, Save, ListTodo, Sparkles, Sliders } from 'lucide-react';
import { UserProfile, AuditLog, ShopSettings, PipelineStage } from '../types';
import GarmentConfiguration from './GarmentConfiguration';

interface OwnerDashboardProps {
  token: string;
  currency: string;
  onSettingsUpdated: () => void;
  onWorkersUpdated?: (workers: UserProfile[]) => void;
}

export default function OwnerDashboard({ token, currency, onSettingsUpdated, onWorkersUpdated }: OwnerDashboardProps) {
  const [activeTab, setActiveTab] = useState<'Settings' | 'GarmentConfig' | 'Backup' | 'Logs'>('Settings');

  // Workers State
  const [workers, setWorkers] = useState<UserProfile[]>([]);
  const [workersLoading, setWorkersLoading] = useState(false);
  const [newWorkerName, setNewWorkerName] = useState('');
  const [workerError, setWorkerError] = useState<string | null>(null);
  const [workerSuccess, setWorkerSuccess] = useState<string | null>(null);

  // Settings State
  const [settings, setSettings] = useState<ShopSettings | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [editedShopName, setEditedShopName] = useState('');
  const [editedPhone, setEditedPhone] = useState('');
  const [editedAddress, setEditedAddress] = useState('');
  const [editedCurrency, setEditedCurrency] = useState('$');
  const [editedFields, setEditedFields] = useState<string[]>([]);
  const [editedStages, setEditedStages] = useState<PipelineStage[]>([]);
  const [newStageName, setNewStageName] = useState('');
  const [editedAutoArchiveDays, setEditedAutoArchiveDays] = useState<number>(30);
  const [editedMeasurementUnit, setEditedMeasurementUnit] = useState<'Inches' | 'Centimeters' | 'Feet'>('Inches');
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [settingsSuccess, setSettingsSuccess] = useState(false);

  // Backup & Restore State
  const [archiveCutoff, setArchiveCutoff] = useState('');
  const [archiveSuccess, setArchiveSuccess] = useState<string | null>(null);
  const [backupLoading, setBackupLoading] = useState(false);
  const [restoreSuccess, setRestoreSuccess] = useState<string | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);

  // Audit Logs State
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  // Fetch Workers
  const fetchWorkers = async () => {
    setWorkersLoading(true);
    try {
      const res = await fetch('/api/workers', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setWorkers(data);
        if (onWorkersUpdated) {
          onWorkersUpdated(data);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setWorkersLoading(false);
    }
  };

  // Fetch Settings
  const fetchSettings = async () => {
    setSettingsLoading(true);
    try {
      const res = await fetch('/api/settings', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setSettings(data);
        setEditedShopName(data.shop_name || '');
        setEditedPhone(data.phone || '');
        setEditedAddress(data.address || '');
        setEditedCurrency(data.currency || '$');
        setEditedAutoArchiveDays(data.auto_archive_days !== undefined ? Number(data.auto_archive_days) : 30);
        setEditedMeasurementUnit(data.measurement_unit || 'Inches');
        setEditedFields(data.measurement_fields || []);
        setEditedStages(data.pipeline_stages || [
          { id: 'Pending', name: 'Getting Ready', enabled: true },
          { id: 'Ready to Deliver', name: 'Ready to Deliver', enabled: true },
          { id: 'Delivered', name: 'Delivered', enabled: true },
          { id: 'Archived', name: 'Archived', enabled: true }
        ]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSettingsLoading(false);
    }
  };

  // Fetch Logs
  const fetchLogs = async () => {
    setLogsLoading(true);
    try {
      const res = await fetch('/api/audit-logs', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setLogs(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLogsLoading(false);
    }
  };

  // Load appropriate data on tab click
  useEffect(() => {
    if (activeTab === 'Workers') fetchWorkers();
    if (activeTab === 'Settings') fetchSettings();
    if (activeTab === 'Backup') {
      const d = new Date();
      d.setDate(d.getDate() - 30);
      setArchiveCutoff(d.toISOString().split('T')[0]);
    }
    if (activeTab === 'Logs') fetchLogs();
  }, [activeTab, token]);

  // Handle Create Worker
  const handleCreateWorker = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWorkerName || newWorkerName.trim() === '') {
      setWorkerError('Worker name is required.');
      return;
    }

    setWorkerError(null);
    setWorkerSuccess(null);

    try {
      const res = await fetch('/api/workers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: newWorkerName,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to create worker.');
      }

      setWorkerSuccess(`Successfully created worker profile for ${newWorkerName}!`);
      setNewWorkerName('');
      fetchWorkers();
    } catch (err: any) {
      setWorkerError(err.message);
    }
  };

  // Handle Delete Worker
  const handleDeleteWorker = async (workerId: string) => {
    if (!confirm('Are you absolutely sure you want to permanently delete this worker account? This will block their login immediately.')) {
      return;
    }

    setWorkerError(null);
    setWorkerSuccess(null);

    try {
      const res = await fetch(`/api/workers/${workerId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to delete worker.');
      }

      setWorkerSuccess('Worker account deleted successfully.');
      fetchWorkers();
    } catch (err: any) {
      setWorkerError(err.message);
    }
  };

  // Handle Settings Update
  const handleUpdateSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSettingsError(null);
    setSettingsSuccess(false);

    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          shop_name: editedShopName,
          phone: editedPhone,
          address: editedAddress,
          currency: editedCurrency,
          measurement_fields: editedFields,
          pipeline_stages: editedStages,
          auto_archive_days: editedAutoArchiveDays,
          measurement_unit: editedMeasurementUnit,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to save settings.');
      }

      setSettingsSuccess(true);
      onSettingsUpdated();
    } catch (err: any) {
      setSettingsError(err.message);
    }
  };

  // Pipeline Stage Helpers
  const handleAddStage = () => {
    const stageName = newStageName.trim();
    if (!stageName) return;
    if (editedStages.some(s => s.name.toLowerCase() === stageName.toLowerCase())) {
      alert('A stage with this name already exists.');
      return;
    }
    // Generate unique stage ID
    const newId = 'stage_' + Math.random().toString(36).substring(2, 11);
    setEditedStages([...editedStages, { id: newId, name: stageName, enabled: true }]);
    setNewStageName('');
  };

  const handleRenameStage = (index: number, newName: string) => {
    const updated = [...editedStages];
    updated[index] = { ...updated[index], name: newName };
    setEditedStages(updated);
  };

  const handleToggleStage = (index: number) => {
    const updated = [...editedStages];
    updated[index] = { ...updated[index], enabled: !updated[index].enabled };
    setEditedStages(updated);
  };

  const handleDeleteStage = (index: number) => {
    const stage = editedStages[index];
    if (stage.id === 'Pending' || stage.id === 'Archived' || stage.name.toLowerCase() === 'archived') {
      alert('The core start and archive stages cannot be deleted to maintain system integrity.');
      return;
    }
    if (confirm(`Are you sure you want to delete the "${stage.name}" stage?`)) {
      setEditedStages(editedStages.filter((_, idx) => idx !== index));
    }
  };

  const handleMoveStage = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === editedStages.length - 1) return;

    const updated = [...editedStages];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    
    // Swap
    const temp = updated[index];
    updated[index] = updated[targetIndex];
    updated[targetIndex] = temp;
    
    setEditedStages(updated);
  };

  // Handle Database Backup download
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
    } catch (err: any) {
      alert('Backup generation failed: ' + err.message);
    } finally {
      setBackupLoading(false);
    }
  };

  // Handle Database Restore from file upload
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

        setRestoreSuccess('System database restored successfully! Please refresh to reload state.');
      } catch (err: any) {
        setRestoreError(err.message || 'Failed to parse JSON file.');
      }
    };
    reader.readAsText(file);
  };

  // Handle Archiving Orders
  const handleArchiveOrders = async () => {
    if (!archiveCutoff) return;
    if (!confirm(`Are you sure you want to archive all Completed/Delivered orders dated prior to ${archiveCutoff}? This clears active listings.`)) {
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

      setArchiveSuccess(`Orders archived successfully! ${data.count !== undefined ? `${data.count} orders cleared.` : ''}`);
    } catch (err: any) {
      alert('Archiving failed: ' + err.message);
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Tab Navigation header - Styled as a premium command deck */}
      <div className="flex flex-wrap gap-1.5 border-b border-slate-200 pb-3">
        {[
          { id: 'Settings', label: 'Shop Settings', icon: Settings },
          { id: 'GarmentConfig', label: 'Garment Configuration', icon: Sliders },
          { id: 'Backup', label: 'Backup & Archiving', icon: Database },
          { id: 'Logs', label: 'Audit Logs', icon: Activity },
        ].map((tab) => {
          const Icon = tab.icon;
          const isSelected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`py-2.5 px-4 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer border ${
                isSelected
                  ? 'bg-[#0F172A] text-[#F8FAFC] border-[#0F172A] border-b-2 border-b-[#38BDF8] shadow-sm'
                  : 'bg-white text-slate-500 hover:text-slate-800 hover:bg-slate-50 border-slate-200'
              }`}
            >
              <Icon className={`w-4 h-4 shrink-0 ${isSelected ? 'text-[#38BDF8]' : 'text-slate-400'}`} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Body - Clean container frame */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 min-h-[450px]">
        
        {/* TAB 3: SHOP SETTINGS */}
        {activeTab === 'Settings' && (
          <form onSubmit={handleUpdateSettings} className="space-y-6 animate-fade-in">
            <h3 className="text-lg font-bold text-slate-900 uppercase tracking-wider font-display border-b border-slate-100 pb-2">Shop Identity & Parameters</h3>

            {settingsSuccess && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-700 text-xs font-semibold">
                Shop settings updated successfully.
              </div>
            )}

            {settingsError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs font-semibold">
                {settingsError}
              </div>
            )}

            <div className="max-w-xl">
              <div className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Shop / Company Name *</label>
                  <input
                    type="text"
                    required
                    value={editedShopName}
                    onChange={(e) => setEditedShopName(e.target.value)}
                    className="w-full px-3 py-2 bg-white border-2 border-slate-200 rounded-lg text-slate-800 text-sm font-semibold focus:outline-none focus:border-[#38BDF8]"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Identity Phone Number</label>
                  <input
                    type="text"
                    value={editedPhone}
                    onChange={(e) => setEditedPhone(e.target.value)}
                    className="w-full px-3 py-2 bg-white border-2 border-slate-200 rounded-lg text-slate-800 text-sm font-semibold focus:outline-none focus:border-[#38BDF8]"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Company Address</label>
                  <textarea
                    value={editedAddress}
                    onChange={(e) => setEditedAddress(e.target.value)}
                    rows={2}
                    className="w-full px-3 py-2 bg-white border-2 border-slate-200 rounded-lg text-slate-800 text-sm font-semibold focus:outline-none focus:border-[#38BDF8]"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">System Currency Symbol</label>
                  <select
                    value={editedCurrency}
                    onChange={(e) => setEditedCurrency(e.target.value)}
                    className="w-full px-3 py-2 bg-white border-2 border-slate-200 rounded-lg font-bold text-slate-800 text-xs focus:outline-none focus:border-[#38BDF8]"
                  >
                    <option value="$">USD ($)</option>
                    <option value="PKR">PKR (Rs)</option>
                    <option value="INR">INR (₹)</option>
                    <option value="AED">AED (Dh)</option>
                    <option value="£">GBP (£)</option>
                    <option value="€">EUR (€)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Auto-Archive Delivered Orders</label>
                  <select
                    value={editedAutoArchiveDays}
                    onChange={(e) => setEditedAutoArchiveDays(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-white border-2 border-slate-200 rounded-lg font-bold text-slate-800 text-xs focus:outline-none focus:border-[#38BDF8]"
                  >
                    <option value={0}>Never</option>
                    <option value={7}>7 Days</option>
                    <option value={15}>15 Days</option>
                    <option value={30}>30 Days</option>
                    <option value={60}>60 Days</option>
                    <option value={90}>90 Days</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Default Measurement Unit</label>
                  <select
                    value={editedMeasurementUnit}
                    onChange={(e) => setEditedMeasurementUnit(e.target.value as any)}
                    className="w-full px-3 py-2 bg-white border-2 border-slate-200 rounded-lg font-bold text-slate-800 text-xs focus:outline-none focus:border-[#38BDF8]"
                  >
                    <option value="Inches">Inches</option>
                    <option value="Centimeters">Centimeters (cm)</option>
                    <option value="Feet">Feet (ft)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Custom Pipeline Queue Stages */}
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 space-y-4">
              <div>
                <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5 font-display">
                  <ListTodo className="w-5 h-5 text-[#38BDF8]" />
                  Pipeline Queue Stages (Custom Workflow Builder)
                </h4>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  Customize the stages of your garment order pipeline. You can add new custom stages, rename them, toggle active status, and reorder them. Core stages (Getting Ready/Pending and Archived) are maintained for operational stability.
                </p>
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={newStageName}
                  onChange={(e) => setNewStageName(e.target.value)}
                  placeholder="Add e.g., Stitching, Cutting, Fitting"
                  className="flex-1 px-3 py-2 bg-white border-2 border-slate-200 rounded-lg text-slate-800 text-xs font-semibold focus:outline-none focus:border-[#38BDF8]"
                />
                <button
                  type="button"
                  onClick={handleAddStage}
                  className="px-4 py-2 bg-[#0F172A] text-white font-bold rounded-lg text-2xs uppercase tracking-wider cursor-pointer hover:bg-slate-800 flex items-center gap-1 shrink-0"
                >
                  <Plus className="w-4 h-4 text-[#38BDF8]" />
                  Add Stage
                </button>
              </div>

              <div className="space-y-2 max-h-96 overflow-y-auto p-4 bg-white border border-slate-200 rounded-xl shadow-2xs">
                {editedStages.map((stage, idx) => {
                  const isCore = stage.id === 'Pending' || stage.id === 'Archived' || stage.name.toLowerCase() === 'archived';
                  return (
                    <div key={stage.id} className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-3.5 bg-slate-50/50 hover:bg-slate-50 border border-slate-150 rounded-xl gap-3 transition-colors">
                      <div className="flex items-center gap-2.5 w-full sm:w-auto">
                        {/* Up / Down arrows for sorting */}
                        <div className="flex flex-col gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleMoveStage(idx, 'up')}
                            disabled={idx === 0}
                            className="p-0.5 rounded text-slate-400 hover:text-[#38BDF8] disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed hover:bg-white"
                            title="Move Stage Up"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleMoveStage(idx, 'down')}
                            disabled={idx === editedStages.length - 1}
                            className="p-0.5 rounded text-slate-400 hover:text-[#38BDF8] disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed hover:bg-white"
                            title="Move Stage Down"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* Editable Name Input */}
                        <input
                          type="text"
                          required
                          value={stage.name}
                          onChange={(e) => handleRenameStage(idx, e.target.value)}
                          className="px-2 py-1 bg-white border border-slate-200 rounded-md text-slate-800 text-xs font-bold uppercase tracking-wider focus:outline-none focus:border-[#38BDF8] w-full max-w-[200px]"
                        />

                        {isCore && (
                          <span className="text-[9px] font-extrabold bg-[#E0F2FE] text-[#0369A1] px-1.5 py-0.5 rounded uppercase tracking-wider shrink-0">
                            Core
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
                        {/* Enable / Disable checkbox */}
                        <label className="flex items-center gap-1.5 text-2xs font-extrabold text-slate-500 uppercase select-none cursor-pointer">
                          <input
                            type="checkbox"
                            checked={stage.enabled}
                            disabled={isCore}
                            onChange={() => handleToggleStage(idx)}
                            className="w-3.5 h-3.5 rounded border-slate-300 text-[#38BDF8] focus:ring-[#38BDF8] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                          />
                          <span>{stage.enabled ? 'Enabled' : 'Disabled'}</span>
                        </label>

                        {/* Trash button to delete */}
                        <button
                          type="button"
                          onClick={() => handleDeleteStage(idx)}
                          disabled={isCore}
                          className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg cursor-pointer transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                          title="Delete Custom Stage"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-3 px-6 bg-[#0F172A] hover:bg-[#1E293B] text-white font-bold text-sm uppercase tracking-wider rounded-xl flex items-center justify-center gap-1.5 cursor-pointer transition-colors shadow-sm"
            >
              <Save className="w-4 h-4 text-[#38BDF8]" />
              Save Identity Settings
            </button>
          </form>
        )}

        {/* TAB 4: BACKUP & ARCHIVING */}
        {activeTab === 'Backup' && (
          <div className="space-y-6 divide-y divide-slate-100 animate-fade-in">
            {/* Backup download block */}
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider font-display flex items-center gap-1.5">
                <Database className="w-5 h-5 text-[#38BDF8]" />
                System Backups
              </h3>
              <p className="text-slate-500 text-xs font-semibold uppercase tracking-wider max-w-xl leading-relaxed">
                Generate and download full relational database backups. This produces a secure JSON file including all profiles, settings, frozen custom measurements, and orders.
              </p>

              <button
                onClick={triggerBackupDownload}
                disabled={backupLoading}
                className="px-4 py-2.5 bg-[#0F172A] hover:bg-[#1E293B] disabled:opacity-50 text-white font-bold rounded-lg flex items-center gap-1.5 cursor-pointer text-2xs uppercase tracking-wider border border-slate-800 transition-colors"
              >
                <ArrowDown className="w-4 h-4 text-[#38BDF8]" />
                {backupLoading ? 'Compiling Backup...' : 'Download Full System Backup'}
              </button>
            </div>

            {/* Restore upload block */}
            <div className="pt-6 space-y-4">
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider font-display flex items-center gap-1.5">
                <ArrowUp className="w-5 h-5 text-emerald-500" />
                Restore System Backup
              </h3>
              <p className="text-slate-500 text-xs font-semibold uppercase tracking-wider max-w-xl leading-relaxed">
                Upload a previously exported `.json` backup file to restore database tables. Existing customer records with duplicate phone numbers will safely merge.
              </p>

              {restoreSuccess && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-700 text-xs font-semibold max-w-xl animate-fade-in">
                  {restoreSuccess}
                </div>
              )}

              {restoreError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs font-semibold max-w-xl animate-fade-in">
                  {restoreError}
                </div>
              )}

              <input
                type="file"
                accept=".json"
                onChange={handleRestoreUpload}
                className="block text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-bold file:uppercase file:tracking-wider file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200 cursor-pointer"
              />
            </div>

            {/* Archive Orders Block */}
            <div className="pt-6 space-y-4">
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider font-display flex items-center gap-1.5">
                <Calendar className="w-5 h-5 text-amber-500" />
                Archive Old Orders
              </h3>
              <p className="text-slate-500 text-xs font-semibold uppercase tracking-wider max-w-xl leading-relaxed">
                Batch-archive completed or delivered orders prior to the selected date to maintain instant database and active queue speeds. Archived metrics are preserved in historical records.
              </p>

              {archiveSuccess && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-700 text-xs font-semibold max-w-xl animate-fade-in">
                  {archiveSuccess}
                </div>
              )}

              <div className="flex flex-wrap gap-3 items-end">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 block uppercase tracking-wider">Archive Prior To:</label>
                  <input
                    type="date"
                    value={archiveCutoff}
                    onChange={(e) => setArchiveCutoff(e.target.value)}
                    className="px-3 py-1.5 border-2 border-slate-200 rounded-lg text-slate-800 text-xs font-bold focus:outline-none focus:border-[#38BDF8]"
                  />
                </div>
                <button
                  onClick={handleArchiveOrders}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-lg cursor-pointer text-2xs uppercase tracking-wider border border-amber-500 transition-colors"
                >
                  Archive Closed Orders
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: UNIFIED GARMENT CONFIGURATION */}
        {activeTab === 'GarmentConfig' && (
          <div className="animate-fade-in">
            <GarmentConfiguration token={token} />
          </div>
        )}

        {/* TAB 5: AUDIT LOGS */}
        {activeTab === 'Logs' && (
          <div className="space-y-4 animate-fade-in">
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider font-display flex items-center gap-1.5">
                <Activity className="w-5 h-5 text-indigo-500" />
                Security Audit Logs
              </h3>
              <p className="text-slate-500 text-xs font-semibold uppercase tracking-wider">
                Real-time security log tracking logins, setting edits, or worker modifications.
              </p>
            </div>

            <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
              <div className="max-h-[400px] overflow-y-auto divide-y divide-slate-100 bg-slate-50">
                {logsLoading && <p className="p-6 text-center text-slate-400 text-xs font-bold uppercase tracking-wider">Retrieving log buffers...</p>}
                {!logsLoading && logs.length === 0 && (
                  <p className="p-10 text-center text-slate-400 text-xs font-bold uppercase tracking-wider">No modification actions logged in session.</p>
                )}
                {logs.map((log) => (
                  <div key={log.id} className="p-4 bg-white hover:bg-slate-50/50 flex items-start justify-between text-xs transition-colors">
                    <div className="space-y-1">
                      <p className="font-bold text-slate-800 leading-normal">
                        <span className="text-indigo-600 font-extrabold uppercase tracking-wide">[{log.action}]</span> by {log.user_email}
                      </p>
                      {log.details && (
                        <pre className="text-2xs text-slate-500 bg-slate-50 p-2.5 border border-slate-200/60 rounded-lg mt-1.5 overflow-x-auto max-w-lg font-mono">
                          {JSON.stringify(log.details)}
                        </pre>
                      )}
                    </div>
                    <span className="text-2xs font-extrabold text-slate-400 shrink-0 ml-4">
                      {new Date(log.created_at).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
