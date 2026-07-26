import React, { useState, useRef, useCallback } from 'react';
import { Upload, ArrowRight, ArrowLeft, Check, X, AlertTriangle, FileSpreadsheet, Loader2, Database, ChevronDown, Plus } from 'lucide-react';
import * as XLSX from 'xlsx';
import type { GarmentType } from '../types';
import { localDataStore } from '../lib/localDataStore';

interface DataImportProps {
  token: string;
  garmentTypes: GarmentType[];
  onComplete: () => void;
}

type Step = 'upload' | 'mapping' | 'preview' | 'importing' | 'done';

const CORE_FIELDS = [
  { id: '_ignore', label: 'Ignore', group: 'actions' },
  { id: 'name', label: 'Name *', group: 'customer' },
  { id: 'phone', label: 'Mobile Number', group: 'customer' },
  { id: 'address', label: 'Address', group: 'customer' },
];

const EXTRA_FIELDS = [
  { id: 'email', label: 'Email', group: 'extra' },
  { id: 'notes', label: 'Notes', group: 'extra' },
];

const SYNONYMS: Record<string, string[]> = {
  name: ['name', 'customer name', 'full name', 'client name', 'customer', 'fullname', 'client'],
  phone: ['phone', 'phone number', 'phone no', 'mobile', 'mobile number', 'contact', 'contact no', 'telephone', 'tel', 'cell', 'mobile no', 'mobile#'],
  address: ['address', 'full address', 'street', 'street address', 'location', 'home address', 'mailing address'],
};

function normalize(str: string): string {
  return str.toLowerCase().replace(/[-_\s]+/g, ' ').trim();
}

function detectField(header: string): string | null {
  const n = normalize(header);
  for (const [field, synonyms] of Object.entries(SYNONYMS)) {
    for (const syn of synonyms) {
      if (n === normalize(syn)) return field;
    }
  }
  return null;
}

function parseCSV(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === '\n' && !inQuotes) {
      lines.push(current);
      current = '';
    } else if (ch === '\r' && !inQuotes) {
      continue;
    } else {
      current += ch;
    }
  }
  if (current.trim()) lines.push(current);
  if (lines.length < 2) return { headers: [], rows: [] };

  const parseLine = (line: string): string[] => {
    const cols: string[] = [];
    let cur = '';
    let q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (q && line[i + 1] === '"') { cur += '"'; i++; }
        else { q = !q; }
      } else if (c === ',' && !q) {
        cols.push(cur.trim());
        cur = '';
      } else { cur += c; }
    }
    cols.push(cur.trim());
    return cols;
  };

  const headers = parseLine(lines[0]);
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = parseLine(lines[i]);
    if (vals.some(v => v.length > 0)) {
      const row: Record<string, string> = {};
      headers.forEach((h, idx) => { row[h] = vals[idx] || ''; });
      rows.push(row);
    }
  }
  return { headers, rows };
}

function parseXLSX(data: ArrayBuffer): { headers: string[]; rows: Record<string, string>[] } {
  const workbook = XLSX.read(data, { type: 'array' });
  if (!workbook.SheetNames || workbook.SheetNames.length === 0) return { headers: [], rows: [] };
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) return { headers: [], rows: [] };
  const json = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, { defval: '' });
  if (json.length === 0) return { headers: [], rows: [] };
  const headers = Object.keys(json[0]);
  const rows = json.map(r => {
    const row: Record<string, string> = {};
    headers.forEach(h => { row[h] = String(r[h] ?? ''); });
    return row;
  });
  return { headers, rows };
}

export default function DataImport({ token, garmentTypes, onComplete }: DataImportProps) {
  const [step, setStep] = useState<Step>('upload');
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [createMeasurements, setCreateMeasurements] = useState(false);
  const [selectedGarmentType, setSelectedGarmentType] = useState('');
  const [newMeasFields, setNewMeasFields] = useState<string[]>([]);
  const [importResults, setImportResults] = useState<{
    imported: number;
    skipped: number;
    errors: string[];
    details: Array<{ name: string; status: string; reason?: string }>;
  } | null>(null);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (file: File) => {
    setImportError(null);
    const ext = file.name.split('.').pop()?.toLowerCase();
    let parsed: { headers: string[]; rows: Record<string, string>[] };
    try {
      if (ext === 'csv') {
        parsed = parseCSV(await file.text());
      } else if (ext === 'xlsx' || ext === 'xls') {
        parsed = parseXLSX(await file.arrayBuffer());
      } else {
        setImportError('Unsupported file format. Please use .csv or .xlsx');
        return;
      }
    } catch {
      setImportError('Failed to read file. The file may be corrupted or in an unsupported format.');
      return;
    }
    if (parsed.headers.length === 0) {
      setImportError('Could not parse any columns from the file.');
      return;
    }
    setNewMeasFields([]);
    setHeaders(parsed.headers);
    setRows(parsed.rows);
    const autoMap: Record<string, string> = {};
    for (const h of parsed.headers) {
      autoMap[h] = detectField(h) || '_ignore';
    }
    setMapping(autoMap);
    setStep('mapping');
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const selectedGarment = garmentTypes.find(g => g.id === selectedGarmentType);

  const getMappingOptions = () => {
    const opts = [...CORE_FIELDS, ...EXTRA_FIELDS];
    if (createMeasurements && selectedGarmentType && selectedGarment) {
      const existingNames = new Set(selectedGarment.measurement_fields.map(mf => mf.name.toLowerCase()));
      for (const mf of selectedGarment.measurement_fields) {
        opts.push({ id: `meas:${mf.name}`, label: `Measurement: ${mf.name}`, group: `measurements_${selectedGarment.name}` });
      }
      for (const h of headers) {
        const normalH = normalize(h);
        if (!existingNames.has(normalH) && !opts.some(o => o.id === `meas_new:${h}`)) {
          opts.push({ id: `meas_new:${h}`, label: `+ Create measurement: ${h}`, group: `actions` });
        }
      }
    }
    return opts;
  };

  const mappingOptions = getMappingOptions();
  const optionGroups = mappingOptions.reduce<Record<string, typeof mappingOptions>>((acc, opt) => {
    if (!acc[opt.group]) acc[opt.group] = [];
    acc[opt.group].push(opt);
    return acc;
  }, {});

  const vals = Object.values(mapping) as string[];
  const mappedCount = vals.filter(v => v !== '_ignore').length;
  const mappedCustomerFields = vals.filter(v => v !== '_ignore' && !v.startsWith('meas:') && !v.startsWith('meas_new:')).length;
  const mappedMeasFields = vals.filter(v => v.startsWith('meas:') || v.startsWith('meas_new:')).length;

  const handleStartImport = async () => {
    setStep('importing');
    setImporting(true);
    setImportProgress(0);

    const measNewFields: string[] = [];
    for (const h of headers) {
      const target = mapping[h];
      if (target && target.startsWith('meas_new:')) {
        const fieldName = h;
        if (!measNewFields.includes(fieldName)) measNewFields.push(fieldName);
      }
    }

    setNewMeasFields(measNewFields);

    if (measNewFields.length > 0 && selectedGarmentType) {
      try {
        const currentGt = garmentTypes.find(g => g.id === selectedGarmentType);
        if (currentGt) {
          const existingFields = currentGt.measurement_fields || [];
          const maxOrder = existingFields.reduce((max, f) => Math.max(max, f.display_order || 0), 0);
          const newFields = measNewFields.map((name, i) => ({
            name,
            required: false,
            display_order: maxOrder + i + 1,
          }));
          const updatedFields = [...existingFields, ...newFields];
          const res = await fetch(`/api/garment-types/${selectedGarmentType}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ measurement_fields: updatedFields }),
          });
          if (!res.ok) {
            const errData = await res.json();
            throw new Error(errData.error || 'Failed to create measurement fields');
          }
        }
      } catch (err: any) {
        setImportError(`Failed to create measurement fields: ${err.message}`);
        setImporting(false);
        setStep('mapping');
        return;
      }
    }

    const mappedHeaders = headers.filter(h => mapping[h] && mapping[h] !== '_ignore');
    const total = rows.length;
    const batchSize = Math.min(200, total);
    const results: {
      imported: number;
      skipped: number;
      errors: string[];
      details: Array<{ name: string; status: string; reason?: string }>;
    } = { imported: 0, skipped: 0, errors: [], details: [] };

    const buildBatchCustomers = (batchRows: typeof rows) =>
      batchRows.map(row => {
        const customer: Record<string, string> = {};
        const measurements: Record<string, string> = {};
        for (const h of mappedHeaders) {
          const target = mapping[h];
          if (target.startsWith('meas:') || target.startsWith('meas_new:')) {
            const fieldName = target.startsWith('meas_new:') ? h : target.slice(5);
            measurements[fieldName] = row[h] || '';
          } else {
            customer[target] = row[h] || '';
          }
        }
        return { ...customer, measurements: Object.keys(measurements).length > 0 ? measurements : undefined };
      });

    const sendBatch = async (batchRows: typeof rows) => {
      const customers = buildBatchCustomers(batchRows);
      const res = await fetch('/api/import/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ customers, create_measurements: mappedMeasFields > 0, garment_type_id: selectedGarmentType || undefined }),
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Import failed');
      }
      return res.json() as Promise<{ imported: number; skipped: number; errors: string[]; details: Array<{ name: string; status: string; reason?: string }> }>;
    };

    const batches: typeof rows[] = [];
    for (let start = 0; start < rows.length; start += batchSize) {
      batches.push(rows.slice(start, start + batchSize));
    }

    let completed = 0;
    const CONCURRENCY = 4;

    for (let i = 0; i < batches.length; i += CONCURRENCY) {
      const chunk = batches.slice(i, i + CONCURRENCY);
      const chunkResults = await Promise.allSettled(
        chunk.map(b => sendBatch(b))
      );
      for (const r of chunkResults) {
        if (r.status === 'fulfilled') {
          const data = r.value;
          results.imported += data.imported || 0;
          results.skipped += data.skipped || 0;
          if (data.errors) results.errors.push(...data.errors);
          if (data.details) results.details.push(...data.details);
        } else {
          results.errors.push(`Batch error: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`);
        }
      }
      completed += chunk.length;
      setImportProgress(Math.round((completed / batches.length) * 100));
    }

    setImportResults(results);
    setImporting(false);
    setStep('done');
    // Refresh offline cache so Customers/Orders search sees imported rows
    void localDataStore.hydrate(token, { force: true });
  };

  const getPreviewRows = () => rows.slice(0, 5);

  const measColumnHeaders = headers.filter(h => {
    const t = mapping[h];
    return t && (t.startsWith('meas:') || t.startsWith('meas_new:'));
  });
  const measColumnCount = measColumnHeaders.length;
  const hasUnmappedMeas = createMeasurements && selectedGarmentType && headers.some(h => {
    const normalH = normalize(h);
    if (mapping[h] && mapping[h] !== '_ignore') return false;
    return selectedGarment && !selectedGarment.measurement_fields.some(mf => normalize(mf.name) === normalH);
  });

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
        <Database className="icon-sm text-emerald-500" />
        <h3 className="text-lg font-semibold text-slate-900 uppercase tracking-wider font-display">Import customers</h3>
        <span className="ml-auto text-xs text-slate-400 font-semibold uppercase tracking-wider">
          Step {['upload', 'mapping', 'preview', 'importing', 'done'].indexOf(step) + 1} of 5
        </span>
      </div>

      {importError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs font-semibold text-red-700 flex items-center gap-2">
          <span>{importError}</span>
          <button onClick={() => setImportError(null)} aria-label="Dismiss" className="ml-auto text-red-400 hover:text-red-600 cursor-pointer border-none bg-transparent">&times;</button>
        </div>
      )}

      {step === 'upload' && (
        <div
          onDragOver={e => e.preventDefault()}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-slate-300 rounded-xl p-6 text-center cursor-pointer hover:border-emerald-400 hover:bg-emerald-50/30 transition-colors"
        >
          <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" onChange={handleInputChange} className="hidden" />
          <Upload className="w-9 h-9 text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-semibold text-slate-600 uppercase tracking-wider">Drop a CSV or Excel file here, or click to browse</p>
          <p className="text-xs text-slate-400 mt-1">Supported: .csv, .xlsx, .xls</p>
        </div>
      )}

      {step === 'mapping' && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 bg-slate-50 rounded-lg p-3">
            <FileSpreadsheet className="icon-sm text-emerald-500 shrink-0" />
            <div className="text-xs text-slate-600">
              <span className="font-semibold">{headers.length}</span> columns, <span className="font-semibold">{rows.length}</span> rows detected
            </div>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2">
            <AlertTriangle className="icon-xs text-amber-500 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-800">
              Map each column to a system field. Columns mapped as measurements require a garment type. Unmatched columns can be created as new measurement fields.
            </p>
          </div>

          <div className="flex items-center gap-4 flex-wrap">
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 cursor-pointer">
              <input type="checkbox" checked={createMeasurements} onChange={e => { setCreateMeasurements(e.target.checked); if (!e.target.checked) setSelectedGarmentType(''); }} className="w-4 h-4 rounded border-slate-300 text-emerald-500 focus:ring-emerald-400 cursor-pointer" />
              Import measurements
            </label>
            {createMeasurements && (
              <select value={selectedGarmentType} onChange={e => setSelectedGarmentType(e.target.value)} className="input-base">
                <option value="">Select garment type...</option>
                {garmentTypes.filter(g => g.enabled).map(gt => (
                  <option key={gt.id} value={gt.id}>{gt.name}</option>
                ))}
              </select>
            )}
          </div>

          {createMeasurements && !selectedGarmentType && (
            <p className="text-xs text-amber-600 font-semibold">Select a garment type to enable measurement column mapping.</p>
          )}

          <div className="space-y-1.5 max-h-[45vh] overflow-y-auto border border-slate-200 rounded-lg p-2">
            {headers.map(h => (
              <div key={h} className="flex items-center gap-2 bg-white border border-slate-100 rounded-lg px-3 py-2 hover:border-slate-200 transition-colors">
                <span className="text-xs font-semibold text-slate-700 min-w-[120px] break-words flex-1">{h}</span>
                <ChevronDown className="w-3 h-3 text-slate-300 shrink-0" />
                <select value={mapping[h]} onChange={e => setMapping(prev => ({ ...prev, [h]: e.target.value }))} className="input-base flex-1">
                  {Object.entries(optionGroups).map(([groupName, opts]) => (
                    <optgroup key={groupName} label={groupName === 'actions' ? '' : groupName === 'extra' ? 'Additional Fields' : groupName.startsWith('measurements') ? 'Measurement Fields' : groupName}>
                      {opts.map(opt => (
                        <option key={opt.id} value={opt.id}>{opt.label}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                {mapping[h] !== '_ignore' ? (
                  <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                ) : (
                  <X className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                )}
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between">
            <div className="text-xs text-slate-500">
              <span className="font-semibold text-emerald-600">{mappedCustomerFields}</span> fields &middot;{' '}
              <span className="font-semibold text-emerald-600">{mappedMeasFields}</span> measurements mapped
              {createMeasurements && selectedGarmentType && measColumnCount > 0 && (
                <span className="ml-2 text-amber-600 font-semibold">
                  ({measColumnCount} to {selectedGarment?.name || 'garment'})
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setStep('upload')} className="btn-secondary">
                <ArrowLeft className="w-3 h-3" /> Back
              </button>
              <button
                onClick={() => {
                  const hasName = Object.values(mapping).includes('name');
                  if (!hasName) { setImportError('You must map at least one column to "Name".'); return; }
                  if (createMeasurements && mappedMeasFields > 0 && !selectedGarmentType) { setImportError('Select a garment type for measurement fields.'); return; }
                  setStep('preview');
                }}
                disabled={mappedCount === 0}
                className="btn-success"
              >
                Next <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>
      )}

      {step === 'preview' && (
        <div className="space-y-4">
          <div className="bg-sky-50 border border-sky-200 rounded-lg p-3 flex items-start gap-2">
            <AlertTriangle className="icon-xs text-sky-500 shrink-0 mt-0.5" />
            <p className="text-xs text-sky-800">
              Preview of the first {Math.min(5, rows.length)} rows. Confirm to start importing.
            </p>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-lg">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50">
                  <th className="text-left px-3 py-2 font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-200">#</th>
                  {headers.filter(h => mapping[h] !== '_ignore').map(h => (
                    <th key={h} className="text-left px-3 py-2 font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-200 break-words min-w-0">
                      {mapping[h].startsWith('meas:') ? mapping[h].slice(5) : mapping[h].startsWith('meas_new:') ? `${h} (new)` : mapping[h]}
                      <span className="block text-[10px] text-slate-400 font-normal normal-case break-words">{h}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {getPreviewRows().map((row, idx) => (
                  <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                    <td className="px-3 py-2 text-slate-400 font-semibold border-b border-slate-100">{idx + 1}</td>
                    {headers.filter(h => mapping[h] !== '_ignore').map(h => (
                      <td key={h} className="px-3 py-2 text-slate-700 border-b border-slate-100 break-words min-w-0">
                        {row[h] || <span className="text-slate-300 italic">empty</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {rows.length > 5 && (
            <p className="text-xs text-slate-400 text-center">... and {rows.length - 5} more rows</p>
          )}

          <div className="flex gap-2 justify-between">
            <button onClick={() => setStep('mapping')} className="btn-secondary">
              <ArrowLeft className="w-3 h-3" /> Back to Mapping
            </button>
            <button onClick={handleStartImport} className="btn-success">
              <Database className="icon-xs" />
              Import {rows.length} Customer{rows.length !== 1 ? 's' : ''}
            </button>
          </div>
        </div>
      )}

      {step === 'importing' && (
        <div className="space-y-4 text-center py-6">
          <Loader2 className="w-10 h-10 text-emerald-500 animate-spin mx-auto" />
          <p className="text-sm font-semibold text-slate-600 uppercase tracking-wider">Importing customers...</p>
          <div className="w-full max-w-md mx-auto bg-slate-200 rounded-full h-2.5 overflow-hidden">
            <div className="bg-emerald-500 h-full rounded-full transition-[width] duration-300" style={{ width: `${Math.min(importProgress, 100)}%` }} />
          </div>
          <p className="text-xs text-slate-400">{Math.round(importProgress)}%</p>
        </div>
      )}

      {step === 'done' && (
        <div className="space-y-4">
          {importResults && (
            <div className="space-y-3">
              <div className={`rounded-lg p-4 flex items-start gap-3 ${importResults.errors.length > 0 ? 'bg-amber-50 border border-amber-200' : importResults.skipped > 0 ? 'bg-amber-50 border border-amber-200' : 'bg-emerald-50 border border-emerald-200'}`}>
                {importResults.errors.length > 0 ? <AlertTriangle className="icon-sm text-amber-500 shrink-0 mt-0.5" /> : <Check className="icon-sm text-emerald-500 shrink-0 mt-0.5" />}
                <div className="text-xs">
                  <p className="font-semibold text-slate-800">Import complete</p>
                  <p className="text-slate-600 mt-1"><span className="text-emerald-600 font-semibold">{importResults.imported}</span> imported &middot; <span className="text-amber-600 font-semibold">{importResults.skipped}</span> skipped</p>
                </div>
              </div>
              {newMeasFields.length > 0 && (
                <div className="bg-sky-50 border border-sky-200 rounded-lg p-3">
                  <p className="text-xs font-semibold text-sky-700 mb-1">New measurement fields created:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {newMeasFields.map(name => (
                      <span key={name} className="text-3xs bg-white border border-sky-200 px-2 py-0.5 rounded font-semibold text-sky-700 flex items-center gap-1">
                        <Plus className="w-3 h-3" />{name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {importResults.details && importResults.details.length > 0 && (
                <div className="max-h-[30vh] overflow-y-auto overflow-x-auto border border-slate-200 rounded-lg">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-slate-50">
                        <th className="text-left px-3 py-2 font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-200">Name</th>
                        <th className="text-left px-3 py-2 font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-200">Status</th>
                        <th className="text-left px-3 py-2 font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-200">Detail</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importResults.details.map((d, idx) => (
                        <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                          <td className="px-3 py-2 text-slate-700 border-b border-slate-100 font-semibold">{d.name}</td>
                          <td className="px-3 py-2 border-b border-slate-100">
                            <span className={`inline-flex items-center gap-1 font-semibold ${d.status === 'imported' ? 'text-emerald-600' : 'text-amber-600'}`}>
                              {d.status === 'imported' ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                              {d.status}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-slate-500 border-b border-slate-100">{d.reason || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {importResults.errors && importResults.errors.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <p className="text-xs font-semibold text-red-700 mb-1">Errors:</p>
                  <ul className="text-xs text-red-600 space-y-0.5 list-disc list-inside">
                    {importResults.errors.slice(0, 10).map((err: string, idx: number) => <li key={idx}>{err}</li>)}
                    {importResults.errors.length > 10 && <li className="text-slate-400">+{importResults.errors.length - 10} more errors</li>}
                  </ul>
                </div>
              )}
            </div>
          )}
          <div className="flex gap-2 justify-between">
            <button onClick={() => { setStep('upload'); setHeaders([]); setRows([]); setMapping({}); setImportResults(null); setCreateMeasurements(false); setSelectedGarmentType(''); setNewMeasFields([]); }} className="btn-secondary">
              <Upload className="w-3 h-3" /> Import Another File
            </button>
            <button onClick={onComplete} className="btn-primary">
              <Check className="w-3 h-3" /> Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
