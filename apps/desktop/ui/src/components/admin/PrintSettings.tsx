import React, { useState, useEffect } from 'react';
import { Save, Printer } from 'lucide-react';

interface PrintSettingsProps {
  token: string;
  onSettingsUpdated: () => void;
  onOwnerModeRequired?: () => void;
}

export default function PrintSettings({ token, onSettingsUpdated, onOwnerModeRequired }: PrintSettingsProps) {
  const [receiptFooter, setReceiptFooter] = useState('');
  const [termsConditions, setTermsConditions] = useState('');
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
        setReceiptFooter(data.receipt_footer_text ?? '');
        setTermsConditions(data.terms_conditions ?? '');
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
        body: JSON.stringify({
          receipt_footer_text: receiptFooter,
          terms_conditions: termsConditions,
        }),
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

  if (loading) {
    return (
      <div className="px-4 py-8 text-center text-xs font-semibold text-slate-400 uppercase tracking-wider animate-pulse">
        Loading print settings…
      </div>
    );
  }

  return (
    <form onSubmit={handleSave} className="divide-y divide-slate-100 animate-fade-in">
      <div className="px-4 py-3 flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-brand-sidebar font-display">Documents & Printing</h2>
          <p className="text-3xs text-slate-500 mt-0.5">Receipt footer and terms & conditions</p>
        </div>
        <button type="submit" disabled={saving} className="btn-primary py-1.5 px-3 text-xs shrink-0">
          <Save className="icon-xs text-brand-sky" />
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>

      {success && <div className="mx-4 mb-3 alert-success py-2 text-xs">Document settings saved.</div>}
      {error && <div className="mx-4 mb-3 alert-error py-2 text-xs">{error}</div>}

      <section className="px-4 py-3 space-y-3">
        <div className="flex items-center gap-2">
          <Printer className="icon-xs text-brand-sky shrink-0" />
          <h3 className="text-xs font-bold text-brand-sidebar uppercase tracking-wider">Receipt & Documents</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 max-w-3xl">
          <div>
            <label className="text-3xs font-bold text-slate-500 uppercase tracking-wider block mb-0.5">Receipt Footer</label>
            <input type="text" value={receiptFooter} onChange={(e) => setReceiptFooter(e.target.value)} className="input-base text-xs" />
          </div>
          <div className="md:col-span-2">
            <label className="text-3xs font-bold text-slate-500 uppercase tracking-wider block mb-0.5">Terms & Conditions</label>
            <textarea value={termsConditions} onChange={(e) => setTermsConditions(e.target.value)} rows={2} className="textarea-base text-xs" />
          </div>
        </div>
      </section>
    </form>
  );
}
