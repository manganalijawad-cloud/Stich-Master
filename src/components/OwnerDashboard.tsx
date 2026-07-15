import React, { useState, useEffect } from 'react';
import { Settings, Database, Activity, Plus, Trash2, ArrowDown, ArrowUp, Calendar, Save, ListTodo, Sliders, Upload, Printer, Smartphone, Shield, ChevronRight } from 'lucide-react';
import { AuditLog, ShopSettings, PipelineStage, GarmentType } from '../types';
import GarmentConfiguration from './GarmentConfiguration';
import DataImport from './DataImport';

interface OwnerDashboardProps {
  token: string;
  currency: string;
  shopLogo: string;
  onSettingsUpdated: () => void;
}

export default function OwnerDashboard({ token, currency, shopLogo, onSettingsUpdated }: OwnerDashboardProps) {
  const [activeTab, setActiveTab] = useState<'Settings' | 'GarmentConfig' | 'Backup' | 'Logs' | 'Import'>('Settings');

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
  const [editedTermsConditions, setEditedTermsConditions] = useState('');
  const [editedReceiptFooter, setEditedReceiptFooter] = useState('');
  const [defaultPrintReceipt, setDefaultPrintReceipt] = useState(true);
  const [defaultPrintMeasure, setDefaultPrintMeasure] = useState(true);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [settingsSuccess, setSettingsSuccess] = useState(false);
  const [editedShopLogo, setEditedShopLogo] = useState('');
  const [editedWhatsappTemplate, setEditedWhatsappTemplate] = useState('');
  const [whatsappNotifyOnReady, setWhatsappNotifyOnReady] = useState(false);

  const DEFAULT_WHATSAPP_TEMPLATE = `{ShopName}

Assalam-o-Alaikum Sir {CustomerName},

Your order is ready.

Order:
{OrderSummary}

Remaining Amount: Rs. {RemainingBalance}

Please visit our shop to collect your order.

Note: This is an automated message. Please do not reply.`;

  const [archiveCutoff, setArchiveCutoff] = useState('');
  const [archiveSuccess, setArchiveSuccess] = useState<string | null>(null);
  const [backupLoading, setBackupLoading] = useState(false);
  const [restoreSuccess, setRestoreSuccess] = useState<string | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);

  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  const [garmentTypes, setGarmentTypes] = useState<GarmentType[]>([]);

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
        setEditedTermsConditions(data.terms_conditions ?? '');
        setEditedReceiptFooter(data.receipt_footer_text ?? '');
        setDefaultPrintReceipt(data.default_print_receipt !== false);
        setDefaultPrintMeasure(data.default_print_measure !== false);
        setEditedShopLogo(data.shop_logo || '');
        setEditedWhatsappTemplate(data.whatsapp_message_template ?? DEFAULT_WHATSAPP_TEMPLATE);
        setWhatsappNotifyOnReady(data.whatsapp_notify_on_ready === true);
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

  useEffect(() => {
    if (activeTab === 'Settings') fetchSettings();
    if (activeTab === 'Backup') {
      const d = new Date();
      d.setDate(d.getDate() - 30);
      setArchiveCutoff(d.toLocaleDateString('en-CA'));
    }
    if (activeTab === 'Logs') fetchLogs();
    if (activeTab === 'Import') {
      fetch('/api/garment-types', {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then(r => r.json())
        .then(d => setGarmentTypes(Array.isArray(d) ? d : []))
        .catch(() => setGarmentTypes([]));
    }
  }, [activeTab, token]);

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
          terms_conditions: editedTermsConditions,
          receipt_footer_text: editedReceiptFooter,
          default_print_receipt: defaultPrintReceipt,
          default_print_measure: defaultPrintMeasure,
          shop_logo: editedShopLogo,
          whatsapp_message_template: editedWhatsappTemplate,
          whatsapp_notify_on_ready: whatsappNotifyOnReady,
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

  const handleAddStage = () => {
    const stageName = newStageName.trim();
    if (!stageName) return;
    if (editedStages.some(s => s.name.toLowerCase() === stageName.toLowerCase())) {
      alert('A stage with this name already exists.');
      return;
    }
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
    if (confirm('Are you sure you want to delete the "' + stage.name + '" stage?')) {
      setEditedStages(editedStages.filter((_, idx) => idx !== index));
    }
  };

  const handleMoveStage = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === editedStages.length - 1) return;

    const updated = [...editedStages];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;

    const temp = updated[index];
    updated[index] = updated[targetIndex];
    updated[targetIndex] = temp;

    setEditedStages(updated);
  };

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

        setRestoreSuccess('System database restored successfully! Please refresh to reload state.');
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

      setArchiveSuccess('Orders archived successfully!' + (data.count !== undefined ? ' ' + data.count + ' orders cleared.' : ''));
    } catch (err: any) {
      alert('Archiving failed: ' + err.message);
    }
  };

  const tabs = [
    { id: 'Settings' as const, label: 'Shop Settings', icon: Settings },
    { id: 'GarmentConfig' as const, label: 'Garment Config', icon: Sliders },
    { id: 'Backup' as const, label: 'Backup & Archive', icon: Database },
    { id: 'Logs' as const, label: 'Audit Logs', icon: Activity },
    { id: 'Import' as const, label: 'Data Import', icon: Upload },
  ];

  return (
    <div className="space-y-6">

      {/* ─── Premium Tab Navigation ─── */}
      <div className="flex gap-1 p-1 bg-slate-100 rounded-2xl border border-slate-200 w-fit max-w-full overflow-x-auto">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isSelected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap ${
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

        {/* ============================================================ */}
        {/* TAB: SETTINGS                                                */}
        {/* ============================================================ */}
        {activeTab === 'Settings' && (
          <form onSubmit={handleUpdateSettings} className="divide-y divide-slate-100 animate-fade-in">

            {/* Section header */}
            <div className="px-6 py-5 flex items-center justify-between">
              <div>
                <h2 className="text-h2 text-brand-sidebar">Shop Identity & Parameters</h2>
                <p className="text-caption mt-0.5">Configure how your tailor shop appears and operates in the system</p>
              </div>
              <button type="submit" className="btn-primary shrink-0">
                <Save className="icon-xs text-brand-sky" />
                Save Settings
              </button>
            </div>

            {settingsSuccess && (
              <div className="mx-6 mb-4 alert-success">Shop settings updated successfully.</div>
            )}
            {settingsError && (
              <div className="mx-6 mb-4 alert-error">{settingsError}</div>
            )}

            {/* ── Identity & Localization ── */}
            <section className="px-6 py-5 space-y-5">
              <div className="flex items-center gap-2.5 mb-1">
                <div className="p-2 bg-brand-bg rounded-lg border border-slate-200">
                  <Shield className="icon-sm text-brand-sky" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-brand-sidebar uppercase tracking-wider">Identity & Localization</h3>
                  <p className="text-caption-xs">Basic shop profile, currency, and regional preferences</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 max-w-2xl">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Shop Name</label>
                  <input type="text" required value={editedShopName} onChange={(e) => setEditedShopName(e.target.value)} className="input-base" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Phone Number</label>
                  <input type="text" value={editedPhone} onChange={(e) => setEditedPhone(e.target.value)} className="input-base" />
                </div>
                <div className="space-y-1 md:col-span-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Address</label>
                  <textarea value={editedAddress} onChange={(e) => setEditedAddress(e.target.value)} rows={2} className="textarea-base" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Currency</label>
                  <select value={editedCurrency} onChange={(e) => setEditedCurrency(e.target.value)} className="select-base text-xs">
                    <option value="$">USD ($)</option>
                    <option value="PKR">PKR (Rs)</option>
                    <option value="INR">INR (₹)</option>
                    <option value="AED">AED (Dh)</option>
                    <option value="£">GBP (£)</option>
                    <option value="€">EUR (€)</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Measurement Unit</label>
                  <select value={editedMeasurementUnit} onChange={(e) => setEditedMeasurementUnit(e.target.value as any)} className="select-base text-xs">
                    <option value="Inches">Inches</option>
                    <option value="Centimeters">Centimeters (cm)</option>
                    <option value="Feet">Feet (ft)</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Auto-Archive Delivered Orders</label>
                  <select value={editedAutoArchiveDays} onChange={(e) => setEditedAutoArchiveDays(Number(e.target.value))} className="select-base text-xs">
                    <option value={0}>Never</option>
                    <option value={7}>7 Days</option>
                    <option value={15}>15 Days</option>
                    <option value={30}>30 Days</option>
                    <option value={60}>60 Days</option>
                    <option value={90}>90 Days</option>
                  </select>
                </div>
              </div>
            </section>

            {/* ── Printing & Documents ── */}
            <section className="px-6 py-5 space-y-5">
              <div className="flex items-center gap-2.5 mb-1">
                <div className="p-2 bg-brand-bg rounded-lg border border-slate-200">
                  <Printer className="icon-sm text-brand-sky" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-brand-sidebar uppercase tracking-wider">Printing & Documents</h3>
                  <p className="text-caption-xs">Receipt settings, logo, footer text, and default print behavior</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 max-w-2xl">
                <div className="space-y-1 col-span-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Shop Logo</label>
                  <div className="flex items-center gap-3">
                    {editedShopLogo ? (
                      <div className="relative w-16 h-16 rounded-xl border-2 border-slate-200 overflow-hidden bg-white shrink-0">
                        <img src={editedShopLogo} alt="Shop Logo" className="w-full h-full object-contain" />
                        <button
                          type="button"
                          onClick={() => setEditedShopLogo('')}
                          className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center cursor-pointer hover:bg-red-600 text-3xs font-bold"
                          aria-label="Remove logo"
                        >X</button>
                      </div>
                    ) : (
                      <div className="w-16 h-16 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 flex items-center justify-center shrink-0">
                        <span className="text-xs text-slate-400 font-semibold">Logo</span>
                      </div>
                    )}
                    <label className="btn-secondary cursor-pointer">
                      {editedShopLogo ? 'Change' : 'Upload'}
                      <input type="file" accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml" onChange={e => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        if (file.size > 2 * 1024 * 1024) { alert('Logo must be under 2MB.'); return; }
                        const reader = new FileReader();
                        reader.onload = ev => setEditedShopLogo(ev.target?.result as string);
                        reader.readAsDataURL(file);
                      }} className="hidden" />
                    </label>
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Receipt Footer Text</label>
                  <input type="text" value={editedReceiptFooter} onChange={(e) => setEditedReceiptFooter(e.target.value)} className="input-base" placeholder="Receipt is generated by Stitch Master - 03163455358" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Terms & Conditions</label>
                  <textarea value={editedTermsConditions} onChange={(e) => setEditedTermsConditions(e.target.value)} rows={3} className="textarea-base" placeholder="e.g. All orders are subject to our terms and conditions..." />
                </div>
                <div className="col-span-2 space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Default Print Preferences</label>
                  <div className="flex flex-wrap gap-6">
                    <label className="flex items-center gap-2.5 text-xs font-semibold text-slate-600 uppercase tracking-wider cursor-pointer select-none">
                      <input type="checkbox" checked={defaultPrintReceipt} onChange={(e) => setDefaultPrintReceipt(e.target.checked)} className="w-4 h-4 rounded border-slate-300 text-emerald-500 focus:ring-emerald-400 cursor-pointer" />
                      Customer Receipt
                    </label>
                    <label className="flex items-center gap-2.5 text-xs font-semibold text-slate-600 uppercase tracking-wider cursor-pointer select-none">
                      <input type="checkbox" checked={defaultPrintMeasure} onChange={(e) => setDefaultPrintMeasure(e.target.checked)} className="w-4 h-4 rounded border-slate-300 text-emerald-500 focus:ring-emerald-400 cursor-pointer" />
                      Measurement Slip(s)
                    </label>
                  </div>
                </div>
              </div>
            </section>

            {/* ── WhatsApp Notifications ── */}
            <section className="px-6 py-5 space-y-5">
              <div className="flex items-center gap-2.5 mb-1">
                <div className="p-2 bg-brand-bg rounded-lg border border-slate-200">
                  <Smartphone className="icon-sm text-brand-sky" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-brand-sidebar uppercase tracking-wider">WhatsApp Notifications</h3>
                  <p className="text-caption-xs">Automated customer notifications when orders are ready</p>
                </div>
              </div>

              <label className="flex items-center gap-3 cursor-pointer select-none max-w-xl">
                <input type="checkbox" checked={whatsappNotifyOnReady} onChange={(e) => setWhatsappNotifyOnReady(e.target.checked)} className="w-5 h-5 rounded border-slate-300 text-emerald-500 focus:ring-emerald-400 cursor-pointer" />
                <div>
                  <span className="text-sm font-semibold text-slate-700">Auto-notify on Ready to Deliver</span>
                  <p className="text-xs text-slate-500 mt-0.5">Show a prompt to send WhatsApp when an order moves to Ready to Deliver</p>
                </div>
              </label>

              <div className="max-w-xl space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Message Template</label>
                <p className="text-xs text-slate-400 leading-relaxed">Supported placeholders: {'{ShopName}'}, {'{CustomerName}'}, {'{OrderSummary}'}, {'{RemainingBalance}'}</p>
                <textarea value={editedWhatsappTemplate} onChange={(e) => setEditedWhatsappTemplate(e.target.value)} rows={10} className="textarea-base font-mono" placeholder={DEFAULT_WHATSAPP_TEMPLATE} />
              </div>
            </section>

            {/* ── Pipeline Stages ── */}
            <section className="px-6 py-5 space-y-5">
              <div className="flex items-center gap-2.5 mb-1">
                <div className="p-2 bg-brand-bg rounded-lg border border-slate-200">
                  <ListTodo className="icon-sm text-brand-sky" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-brand-sidebar uppercase tracking-wider">Pipeline Stages</h3>
                  <p className="text-caption-xs">Customize the order workflow stages for your tailoring process</p>
                </div>
              </div>

              <div className="flex gap-2 max-w-lg">
                <input type="text" value={newStageName} onChange={(e) => setNewStageName(e.target.value)} placeholder="Add e.g., Stitching, Cutting, Fitting" className="input-base flex-1" onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddStage(); } }} />
                <button type="button" onClick={handleAddStage} className="btn-primary shrink-0">
                  <Plus className="icon-xs text-brand-sky" />
                  Add Stage
                </button>
              </div>

              <div className="space-y-2 max-w-xl">
                {editedStages.map((stage, idx) => {
                  const isCore = stage.id === 'Pending' || stage.id === 'Archived' || stage.name.toLowerCase() === 'archived';
                  return (
                    <div key={stage.id} className="flex items-center gap-3 p-3 bg-white border border-slate-200 rounded-xl hover:border-slate-300 transition-colors">
                      <div className="flex flex-col gap-0.5">
                        <button type="button" onClick={() => handleMoveStage(idx, 'up')} disabled={idx === 0} className="p-0.5 rounded text-slate-400 hover:text-brand-sky disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed" title="Move up" aria-label="Move stage up">
                          <ArrowUp className="icon-xs" />
                        </button>
                        <button type="button" onClick={() => handleMoveStage(idx, 'down')} disabled={idx === editedStages.length - 1} className="p-0.5 rounded text-slate-400 hover:text-brand-sky disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed" title="Move down" aria-label="Move stage down">
                          <ArrowDown className="icon-xs" />
                        </button>
                      </div>
                      <div className="flex-1 flex items-center gap-2.5">
                        <input type="text" required value={stage.name} onChange={(e) => handleRenameStage(idx, e.target.value)} className="input-base max-w-[200px]" />
                        <div className="flex items-center gap-2">
                          {isCore && <span className="badge-blue">Core</span>}
                          <label className="flex items-center gap-1.5 text-xs font-bold text-slate-500 uppercase select-none cursor-pointer">
                            <input type="checkbox" checked={stage.enabled} disabled={isCore} onChange={() => handleToggleStage(idx)} className="w-4 h-4 rounded border-slate-300 text-brand-sky focus:ring-brand-sky cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed" />
                            {stage.enabled ? 'On' : 'Off'}
                          </label>
                        </div>
                      </div>
                      <button type="button" onClick={() => handleDeleteStage(idx)} disabled={isCore} className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg cursor-pointer transition-colors disabled:opacity-30 disabled:cursor-not-allowed" title="Delete stage" aria-label="Delete stage">
                        <Trash2 className="icon-xs" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Sticky save bar */}
            <div className="px-6 py-4 bg-brand-bg border-t border-slate-200 flex justify-end rounded-b-2xl">
              <button type="submit" className="btn-primary">
                <Save className="icon-xs text-brand-sky" />
                Save All Settings
              </button>
            </div>
          </form>
        )}

        {/* ============================================================ */}
        {/* TAB: GARMENT CONFIG                                          */}
        {/* ============================================================ */}
        {activeTab === 'GarmentConfig' && (
          <div className="p-6 animate-fade-in">
            <GarmentConfiguration token={token} />
          </div>
        )}

        {/* ============================================================ */}
        {/* TAB: DATA IMPORT                                             */}
        {/* ============================================================ */}
        {activeTab === 'Import' && (
          <div className="p-6 animate-fade-in">
            <DataImport token={token} garmentTypes={garmentTypes} onComplete={() => setActiveTab('Settings')} />
          </div>
        )}

        {/* ============================================================ */}
        {/* TAB: BACKUP & ARCHIVE                                        */}
        {/* ============================================================ */}
        {activeTab === 'Backup' && (
          <div className="p-6 space-y-6 animate-fade-in">

            {/* Backup card */}
            <div className="card-flat space-y-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-brand-bg rounded-xl border border-slate-200">
                    <ArrowDown className="icon-md text-brand-sky" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-brand-sidebar uppercase tracking-wider">System Backup</h3>
                    <p className="text-caption-xs mt-0.5">Export full database as a JSON file for safekeeping</p>
                  </div>
                </div>
                <button onClick={triggerBackupDownload} disabled={backupLoading} className="btn-primary">
                  <ArrowDown className="icon-xs text-brand-sky" />
                  {backupLoading ? 'Compiling Backup...' : 'Download Backup'}
                </button>
              </div>
            </div>

            {/* Restore card */}
            <div className="card-flat space-y-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-brand-bg rounded-xl border border-slate-200">
                    <ArrowUp className="icon-md text-emerald-500" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-brand-sidebar uppercase tracking-wider">Restore Backup</h3>
                    <p className="text-caption-xs mt-0.5">Upload a previously exported .json backup to restore data</p>
                  </div>
                </div>
              </div>

              {restoreSuccess && <div className="alert-success animate-fade-in">{restoreSuccess}</div>}
              {restoreError && <div className="alert-error animate-fade-in">{restoreError}</div>}

              <input type="file" accept=".json" onChange={handleRestoreUpload}
                className="block text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:uppercase file:tracking-wider file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200 cursor-pointer" />
            </div>

            {/* Archive card */}
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
                  <label className="text-xs font-bold text-slate-500 block uppercase tracking-wider">Archive Prior To:</label>
                  <input type="date" value={archiveCutoff} onChange={(e) => setArchiveCutoff(e.target.value)} className="input-base" />
                </div>
                <button onClick={handleArchiveOrders} className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold rounded-lg cursor-pointer text-xs uppercase tracking-wider border border-amber-500 transition-colors">
                  Archive Closed Orders
                </button>
              </div>
            </div>

          </div>
        )}

        {/* ============================================================ */}
        {/* TAB: AUDIT LOGS                                              */}
        {/* ============================================================ */}
        {activeTab === 'Logs' && (
          <div className="p-6 space-y-4 animate-fade-in">

            <div className="flex items-center gap-3 mb-2">
              <div className="p-2.5 bg-brand-bg rounded-xl border border-slate-200">
                <Activity className="icon-md text-indigo-500" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-brand-sidebar uppercase tracking-wider">Security Audit Logs</h2>
                <p className="text-caption-xs">Real-time tracking of logins, settings changes, and system modifications</p>
              </div>
            </div>

            <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
              <div className="max-h-[55vh] overflow-y-auto divide-y divide-slate-100">
                {logsLoading && (
                  <div className="p-8 text-center text-slate-400 text-xs font-semibold uppercase tracking-wider">Loading logs...</div>
                )}
                {!logsLoading && logs.length === 0 && (
                  <div className="p-8 text-center">
                    <div className="empty-state">
                      <Activity className="empty-state-icon" />
                      <p className="empty-state-title">No Logs Recorded</p>
                      <p className="empty-state-text">System modifications and login events will appear here once they occur</p>
                    </div>
                  </div>
                )}
                {logs.map((log) => (
                  <div key={log.id} className="p-4 bg-white hover:bg-slate-50/50 flex items-start justify-between gap-4 transition-colors">
                    <div className="space-y-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800">
                        <span className="text-indigo-600 font-bold uppercase tracking-wide">[{log.action}]</span>
                        <span className="text-slate-400 mx-1.5">by</span>
                        {log.user_email}
                      </p>
                      {log.details && (
                        <pre className="text-xs text-slate-500 bg-slate-50 p-2.5 border border-slate-200 rounded-lg mt-1.5 overflow-x-auto max-w-lg font-mono">
                          {JSON.stringify(log.details)}
                        </pre>
                      )}
                    </div>
                    <time className="text-xs font-bold text-slate-400 shrink-0 whitespace-nowrap">
                      {new Date(log.created_at).toLocaleString()}
                    </time>
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
