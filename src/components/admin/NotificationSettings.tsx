import React, { useState, useEffect } from 'react';
import { Save, Smartphone } from 'lucide-react';

interface NotificationSettingsProps {
  token: string;
  onSettingsUpdated: () => void;
}

const DEFAULT_WHATSAPP_TEMPLATE = `{ShopName}\n\nAssalam-o-Alaikum Sir {CustomerName},\n\nYour order is ready.\n\nOrder:\n{OrderSummary}\n\nRemaining Amount: Rs. {RemainingBalance}\n\nPlease visit our shop to collect your order.\n\nNote: This is an automated message. Please do not reply.`;

export default function NotificationSettings({ token, onSettingsUpdated }: NotificationSettingsProps) {
  const [whatsappTemplate, setWhatsappTemplate] = useState('');
  const [notifyOnReady, setNotifyOnReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSettings = async () => {
    try {
      const res = await window.fetch('/api/settings', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setWhatsappTemplate(data.whatsapp_message_template ?? DEFAULT_WHATSAPP_TEMPLATE);
        setNotifyOnReady(data.whatsapp_notify_on_ready === true);
      }
    } catch (err) { console.error(err); }
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
          whatsapp_message_template: whatsappTemplate,
          whatsapp_notify_on_ready: notifyOnReady,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save.');
      setSuccess(true);
      onSettingsUpdated();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSave} className="divide-y divide-slate-100 animate-fade-in">
      <div className="px-4 py-3 flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-brand-sidebar font-display">Notifications</h2>
          <p className="text-3xs text-slate-500 mt-0.5">WhatsApp alerts for order readiness</p>
        </div>
        <button type="submit" disabled={saving} className="btn-primary py-1.5 px-3 text-xs shrink-0">
          <Save className="icon-xs text-brand-sky" />
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>

      {success && <div className="mx-4 mb-3 alert-success py-2 text-xs">Notification settings saved.</div>}
      {error && <div className="mx-4 mb-3 alert-error py-2 text-xs">{error}</div>}

      <section className="px-4 py-3 space-y-3">
        <div className="flex items-center gap-2">
          <Smartphone className="icon-xs text-brand-sky shrink-0" />
          <h3 className="text-xs font-bold text-brand-sidebar uppercase tracking-wider">WhatsApp Notifications</h3>
        </div>

        <label className="flex items-center gap-2 cursor-pointer select-none max-w-xl">
          <input type="checkbox" checked={notifyOnReady} onChange={(e) => setNotifyOnReady(e.target.checked)} className="w-4 h-4 rounded border-slate-300 text-emerald-500 cursor-pointer" />
          <div>
            <span className="text-xs font-semibold text-slate-700">Auto-notify on Ready to Deliver</span>
            <p className="text-3xs text-slate-500">Prompt WhatsApp when order is ready</p>
          </div>
        </label>

        <div className="max-w-xl space-y-1.5">
          <label className="text-3xs font-bold text-slate-500 uppercase tracking-wider block">Message Template</label>
          <p className="text-3xs text-slate-400">Placeholders: {'{ShopName}'}, {'{CustomerName}'}, {'{OrderSummary}'}, {'{RemainingBalance}'}</p>
          <textarea value={whatsappTemplate} onChange={(e) => setWhatsappTemplate(e.target.value)} rows={6} className="textarea-base font-mono text-xs" placeholder={DEFAULT_WHATSAPP_TEMPLATE} />
        </div>
      </section>
    </form>
  );
}
