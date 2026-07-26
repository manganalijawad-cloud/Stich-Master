import React, { useState, useEffect } from 'react';
import { Save, Shield } from 'lucide-react';

interface ShopProfileProps {
  token: string;
  onSettingsUpdated: () => void;
  onOwnerModeRequired?: () => void;
}

export default function ShopProfile({ token, onSettingsUpdated, onOwnerModeRequired }: ShopProfileProps) {
  const [shopName, setShopName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [currency, setCurrency] = useState('$');
  const [measurementUnit, setMeasurementUnit] = useState<'Inches' | 'Centimeters' | 'Feet'>('Inches');
  const [autoArchiveDays, setAutoArchiveDays] = useState<number>(30);
  const [shopLogo, setShopLogo] = useState('');
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
        setShopName(data.shop_name || '');
        setPhone(data.phone || '');
        setAddress(data.address || '');
        setCurrency(data.currency || '$');
        setMeasurementUnit(data.measurement_unit || 'Inches');
        setAutoArchiveDays(data.auto_archive_days !== undefined ? Number(data.auto_archive_days) : 30);
        setShopLogo(data.shop_logo || '');
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
          shop_name: shopName,
          phone,
          address,
          currency,
          measurement_unit: measurementUnit,
          auto_archive_days: autoArchiveDays,
          shop_logo: shopLogo,
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
        Loading shop settings…
      </div>
    );
  }

  return (
    <form onSubmit={handleSave} className="divide-y divide-slate-100 animate-fade-in">
      <div className="px-4 py-3 flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-brand-sidebar font-display">Shop Profile</h2>
          <p className="text-3xs text-slate-500 mt-0.5">Identity, contact, currency, and measurement defaults</p>
        </div>
        <button type="submit" disabled={saving} className="btn-primary py-1.5 px-3 text-xs shrink-0">
          <Save className="icon-xs text-brand-sky" />
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>

      {success && <div className="mx-4 mb-3 alert-success py-2 text-xs">Shop profile saved successfully.</div>}
      {error && <div className="mx-4 mb-3 alert-error py-2 text-xs">{error}</div>}

      <section className="px-4 py-3 space-y-3">
        <div className="flex items-center gap-2">
          <Shield className="icon-xs text-brand-sky shrink-0" />
          <h3 className="text-xs font-bold text-brand-sidebar uppercase tracking-wider">Identity & Contact</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 max-w-3xl">
          <div>
            <label className="text-3xs font-bold text-slate-500 uppercase tracking-wider block mb-0.5">Shop Name</label>
            <input type="text" required value={shopName} onChange={(e) => setShopName(e.target.value)} className="input-base text-xs" />
          </div>
          <div>
            <label className="text-3xs font-bold text-slate-500 uppercase tracking-wider block mb-0.5">Phone</label>
            <input type="text" value={phone} onChange={(e) => setPhone(e.target.value)} className="input-base text-xs" />
          </div>
          <div>
            <label className="text-3xs font-bold text-slate-500 uppercase tracking-wider block mb-0.5">Currency</label>
            <select value={currency} onChange={(e) => setCurrency(e.target.value)} className="select-base text-xs">
              <option value="$">USD ($)</option>
              <option value="PKR">PKR (Rs)</option>
              <option value="INR">INR (₹)</option>
              <option value="AED">AED (Dh)</option>
              <option value="£">GBP (£)</option>
              <option value="€">EUR (€)</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="text-3xs font-bold text-slate-500 uppercase tracking-wider block mb-0.5">Address</label>
            <textarea value={address} onChange={(e) => setAddress(e.target.value)} rows={1} className="textarea-base text-xs" />
          </div>
          <div>
            <label className="text-3xs font-bold text-slate-500 uppercase tracking-wider block mb-0.5">Measurement Unit</label>
            <select value={measurementUnit} onChange={(e) => setMeasurementUnit(e.target.value as any)} className="select-base text-xs">
              <option value="Inches">Inches</option>
              <option value="Centimeters">Centimeters</option>
              <option value="Feet">Feet</option>
            </select>
          </div>
          <div>
            <label className="text-3xs font-bold text-slate-500 uppercase tracking-wider block mb-0.5">Auto-Archive</label>
            <select value={autoArchiveDays} onChange={(e) => setAutoArchiveDays(Number(e.target.value))} className="select-base text-xs">
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

      <section className="px-4 py-3 space-y-3">
        <div className="flex items-center gap-2">
          <Shield className="icon-xs text-brand-sky shrink-0" />
          <h3 className="text-xs font-bold text-brand-sidebar uppercase tracking-wider">Shop Logo</h3>
        </div>
        <div className="flex items-center gap-2 max-w-xl">
          {shopLogo ? (
            <div className="relative w-12 h-12 rounded-lg border-2 border-slate-200 overflow-hidden bg-white shrink-0">
              <img src={shopLogo} alt="Shop Logo" className="w-full h-full object-contain" />
              <button type="button" onClick={() => setShopLogo('')} className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full flex items-center justify-center cursor-pointer hover:bg-red-600 text-3xs font-bold">X</button>
            </div>
          ) : (
            <div className="w-12 h-12 rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 flex items-center justify-center shrink-0">
              <span className="text-3xs text-slate-400 font-semibold">Logo</span>
            </div>
          )}
          <label className="btn-secondary cursor-pointer text-xs py-1.5 px-2.5">{shopLogo ? 'Change' : 'Upload'}
            <input type="file" accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml" onChange={e => {
              const file = e.target.files?.[0]; if (!file) return;
              if (file.size > 2 * 1024 * 1024) { alert('Logo must be under 2MB.'); return; }
              const reader = new FileReader(); reader.onload = ev => setShopLogo(ev.target?.result as string); reader.readAsDataURL(file);
            }} className="hidden" />
          </label>
        </div>
      </section>
    </form>
  );
}
