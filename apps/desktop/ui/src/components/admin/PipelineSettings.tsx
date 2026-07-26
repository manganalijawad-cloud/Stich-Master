import React, { useState, useEffect } from 'react';
import { Save, Plus, Trash2, ArrowDown, ArrowUp, ListTodo } from 'lucide-react';
import { PipelineStage } from '../../types';
import { DEFAULT_PIPELINE_STAGES } from '@hello-darzi/shared';

interface PipelineSettingsProps {
  token: string;
  onSettingsUpdated: () => void;
  onOwnerModeRequired?: () => void;
}

export default function PipelineSettings({ token, onSettingsUpdated, onOwnerModeRequired }: PipelineSettingsProps) {
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [newStageName, setNewStageName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const res = await window.fetch('/api/settings', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setStages(data.pipeline_stages || DEFAULT_PIPELINE_STAGES);
      }
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadSettings(); }, [token]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setSaving(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ pipeline_stages: stages }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 403 && /owner mode required/i.test(data.error || '')) {
          onOwnerModeRequired?.();
          return;
        }
        throw new Error(data.error || 'Failed to save.');
      }
      setSuccess(true);
      onSettingsUpdated();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const addStage = () => {
    const name = newStageName.trim();
    if (!name) return;
    if (stages.some(s => s.name.toLowerCase() === name.toLowerCase())) {
      alert('A stage with this name already exists.');
      return;
    }
    setStages([...stages, { id: 'stage_' + Math.random().toString(36).substring(2, 11), name, enabled: true }]);
    setNewStageName('');
  };

  const renameStage = (index: number, newName: string) => {
    const updated = [...stages];
    updated[index] = { ...updated[index], name: newName };
    setStages(updated);
  };

  const toggleStage = (index: number) => {
    const updated = [...stages];
    updated[index] = { ...updated[index], enabled: !updated[index].enabled };
    setStages(updated);
  };

  const isCoreStage = (stage: { id: string; name: string }) => {
    const id = stage.id;
    const name = stage.name.toLowerCase();
    return (
      id === 'Pending' ||
      id === 'Delivered' ||
      id === 'Archived' ||
      id === 'Ready to Deliver' ||
      name === 'archived' ||
      name === 'delivered' ||
      name === 'ready to deliver'
    );
  };

  const deleteStage = (index: number) => {
    const stage = stages[index];
    if (isCoreStage(stage)) {
      alert('Core stages (Getting Ready, Ready to Deliver, Delivered, Archived) cannot be deleted.');
      return;
    }
    if (confirm('Are you sure you want to delete the "' + stage.name + '" stage?')) {
      setStages(stages.filter((_, idx) => idx !== index));
    }
  };

  const moveStage = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === stages.length - 1) return;
    const updated = [...stages];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    const temp = updated[index];
    updated[index] = updated[targetIndex];
    updated[targetIndex] = temp;
    setStages(updated);
  };

  if (loading) {
    return (
      <div className="px-4 py-8 text-center text-xs font-semibold text-slate-400 uppercase tracking-wider animate-pulse">
        Loading order stages…
      </div>
    );
  }

  return (
    <form onSubmit={handleSave} className="divide-y divide-slate-100 animate-fade-in">
      <div className="px-4 py-3 flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-brand-sidebar font-display">Order stages</h2>
          <p className="text-3xs text-slate-500 mt-0.5">Set the steps an order goes through in your shop</p>
        </div>
        <button type="submit" disabled={saving} className="btn-primary py-1.5 px-3 text-xs shrink-0">
          <Save className="icon-xs text-brand-sky" />
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>

      {success && <div className="mx-4 mb-3 alert-success py-2 text-xs">Stages saved.</div>}
      {error && <div className="mx-4 mb-3 alert-error py-2 text-xs">{error}</div>}

      <section className="px-4 py-3 space-y-3">
        <div className="flex items-center gap-2">
          <ListTodo className="icon-xs text-brand-sky shrink-0" />
          <h3 className="text-xs font-bold text-brand-sidebar uppercase tracking-wider">Stages</h3>
        </div>

        <div className="flex gap-2 max-w-lg">
          <input type="text" value={newStageName} onChange={(e) => setNewStageName(e.target.value)} placeholder="Add e.g., Stitching, Cutting" className="input-base text-xs flex-1" onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addStage(); } }} />
          <button type="button" onClick={addStage} className="btn-primary py-1.5 px-3 text-xs shrink-0">
            <Plus className="icon-xs text-brand-sky" />
            Add
          </button>
        </div>

        <div className="space-y-2 max-w-xl">
          {stages.map((stage, idx) => {
            const isCore = isCoreStage(stage);
            return (
              <div key={stage.id} className="flex items-center gap-3 p-3 bg-white border border-slate-200 rounded-xl hover:border-slate-300 transition-colors">
                <div className="flex flex-col gap-0.5">
                  <button type="button" onClick={() => moveStage(idx, 'up')} disabled={idx === 0} className="p-0.5 rounded text-slate-400 hover:text-brand-sky disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed" title="Move up">
                    <ArrowUp className="icon-xs" />
                  </button>
                  <button type="button" onClick={() => moveStage(idx, 'down')} disabled={idx === stages.length - 1} className="p-0.5 rounded text-slate-400 hover:text-brand-sky disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed" title="Move down">
                    <ArrowDown className="icon-xs" />
                  </button>
                </div>
                <div className="flex-1 flex items-center gap-2.5">
                  <input type="text" required value={stage.name} onChange={(e) => renameStage(idx, e.target.value)} className="input-base max-w-[200px]" />
                  <div className="flex items-center gap-2">
                    {isCore && <span className="badge-blue">Core</span>}
                    <label className="flex items-center gap-1.5 text-xs font-bold text-slate-500 uppercase select-none cursor-pointer">
                      <input type="checkbox" checked={stage.enabled} disabled={isCore} onChange={() => toggleStage(idx)} className="w-4 h-4 rounded border-slate-300 text-brand-sky focus:ring-brand-sky cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed" />
                      {stage.enabled ? 'On' : 'Off'}
                    </label>
                  </div>
                </div>
                <button type="button" onClick={() => deleteStage(idx)} disabled={isCore} className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg cursor-pointer transition-colors disabled:opacity-30 disabled:cursor-not-allowed" title="Delete stage">
                  <Trash2 className="icon-xs" />
                </button>
              </div>
            );
          })}
        </div>
      </section>
    </form>
  );
}
