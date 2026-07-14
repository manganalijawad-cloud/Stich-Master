import React, { useState, useRef, useCallback } from 'react';
import { Upload, ArrowRight, ArrowLeft, Check, X, AlertTriangle, FileSpreadsheet, Loader2, Database, ChevronDown } from 'lucide-react';
import * as XLSX from 'xlsx';
import type { GarmentType } from '../types';

interface DataImportProps {
  token: string;
  garmentTypes: GarmentType[];
  onComplete: () => void;
}

type Step = 'upload' | 'mapping' | 'preview' | 'importing' | 'done';

const CUSTOMER_FIELDS = [
  { id: '_ignore', label: 'Ignore', group: 'actions' },
  { id: 'name', label: 'Full Name *', group: 'customer' },
  { id: 'phone', label: 'Phone', group: 'customer' },
  { id: 'whatsapp', label: 'WhatsApp', group: 'customer' },
  { id: 'email', label: 'Email', group: 'customer' },
  { id: 'address', label: 'Address', group: 'customer' },
  { id: 'notes', label: 'Notes', group: 'customer' },
];

const SYNONYMS: Record<string, string[]> = {
  name: ['name', 'customer name', 'full name', 'client name', 'customer', 'fullname', 'client'],
  phone: ['phone', 'phone number', 'phone no', 'mobile', 'mobile number', 'contact', 'contact no', 'telephone', 'tel', 'cell'],
  whatsapp: ['whatsapp', 'whats app', 'wa', 'whats'],
  email: ['email', 'e-mail', 'e mail', 'email address', 'mail', 'e mail address'],
  address: ['address', 'full address', 'street', 'street address', 'location', 'home address'],
  notes: ['notes', 'note', 'comments', 'remarks', 'special notes', 'instructions', 'remark'],
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
        if (q && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          q = !q;
        }
      } else if (c === ',' && !q) {
        cols.push(cur.trim());
        cur = '';
      } else {
        cur += c;
      }
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
      headers.forEach((h, idx) => {
        row[h] = vals[idx] || '';
      });
      rows.push(row);
    }
  }
  return { headers, rows };
}

function parseXLSX(data: ArrayBuffer): { headers: string[]; rows: Record<string, string>[] } {
  const workbook = XLSX.read(data, { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
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
  const [importResults, setImportResults] = useState<any>(null);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase();
    let parsed: { headers: string[]; rows: Record<string, string>[] };

    if (ext === 'csv') {
      const text = await file.text();
      parsed = parseCSV(text);
    } else if (ext === 'xlsx' || ext === 'xls') {
      const buf = await file.arrayBuffer();
      parsed = parseXLSX(buf);
    } else {
      alert('Unsupported file format. Please use .csv or .xlsx');
      return;
    }

    if (parsed.headers.length === 0) {
      alert('Could not parse any columns from the file.');
      return;
    }

    setHeaders(parsed.headers);
    setRows(parsed.rows);

    const autoMap: Record<string, string> = {};
    for (const h of parsed.headers) {
      const detected = detectField(h);
      autoMap[h] = detected || '_ignore';
    }
    setMapping(autoMap);
    setStep('mapping');
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const getMappingOptions = () => {
    const opts = [...CUSTOMER_FIELDS];
    if (createMeasurements && selectedGarmentType) {
      const gt = garmentTypes.find(g => g.id === selectedGarmentType);
      if (gt?.measurement_fields) {
        for (const mf of gt.measurement_fields) {
          opts.push({
            id: `meas:${mf.name}`,
            label: `Measurement: ${mf.name}`,
            group: `measurements_${gt.name}`,
          });
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

  const mappedCount = Object.values(mapping).filter(v => v !== '_ignore').length;

  const mappedCustomerFields = Object.values(mapping).filter(v => v !== '_ignore' && !v.startsWith('meas:')).length;
  const mappedMeasFields = Object.values(mapping).filter(v => v.startsWith('meas:')).length;

  const handleStartImport = async () => {
    setStep('importing');
    setImporting(true);
    setImportProgress(0);

    const mappedHeaders = headers.filter(h => mapping[h] && mapping[h] !== '_ignore');
    const total = rows.length;

    const batchSize = 50;
    const results = { imported: 0, skipped: 0, errors: [] as string[] };

    for (let start = 0; start < rows.length; start += batchSize) {
      const batch = rows.slice(start, start + batchSize);
      const customers = batch.map(row => {
        const customer: Record<string, any> = {};
        const measurements: Record<string, string> = {};
        for (const h of mappedHeaders) {
          const target = mapping[h];
          if (target.startsWith('meas:')) {
            const fieldName = target.slice(5);
            measurements[fieldName] = row[h] || '';
          } else {
            customer[target] = row[h] || '';
          }
        }
        return { ...customer, measurements: Object.keys(measurements).length > 0 ? measurements : undefined };
      });

      try {
        const res = await fetch('/api/import/customers', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            customers,
            create_measurements: mappedMeasFields > 0,
            garment_type_id: selectedGarmentType || undefined,
          }),
        });

        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.error || 'Import failed');
        }

        const data = await res.json();
        results.imported += data.imported || 0;
        results.skipped += data.skipped || 0;
        if (data.errors) results.errors.push(...data.errors);
      } catch (err: any) {
        results.errors.push(`Batch error: ${err.message}`);
      }

      setImportProgress(Math.min((start + batchSize) / total * 100, 100));
    }

    setImportResults(results);
    setImporting(false);
    setStep('done');
  };

  const getPreviewRows = () => rows.slice(0, 5);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
        <Database className="w-5 h-5 text-emerald-500" />
        <h3 className="text-lg font-bold text-slate-900 uppercase tracking-wider font-display">
          Data Import
        </h3>
        <span className="ml-auto text-xs text-slate-400 font-semibold uppercase tracking-wider">
          Step {['upload', 'mapping', 'preview', 'importing', 'done'].indexOf(step) + 1} of 5
        </span>
      </div>

      {step === 'upload' && (
        <div
          onDragOver={e => e.preventDefault()}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-slate-300 rounded-2xl p-12 text-center cursor-pointer hover:border-emerald-400 hover:bg-emerald-50/30 transition-colors"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            onChange={handleInputChange}
            className="hidden"
          />
          <Upload className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-bold text-slate-600 uppercase tracking-wider">
            Drop a CSV or Excel file here, or click to browse
          </p>
          <p className="text-xs text-slate-400 mt-1">
            Supported: .csv, .xlsx, .xls
          </p>
        </div>
      )}

      {step === 'mapping' && (
        <div className="space-y-5">
          <div className="flex items-center gap-2 bg-slate-50 rounded-xl p-3">
            <FileSpreadsheet className="w-5 h-5 text-emerald-500 shrink-0" />
            <div className="text-xs text-slate-600">
              <span className="font-bold">{headers.length}</span> columns,{' '}
              <span className="font-bold">{rows.length}</span> rows detected
            </div>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-800">
              Map each file column to a system field. Columns mapped as measurements require selecting a garment type below.
            </p>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={createMeasurements}
                onChange={e => {
                  setCreateMeasurements(e.target.checked);
                  if (!e.target.checked) setSelectedGarmentType('');
                }}
                className="w-4 h-4 rounded border-slate-300 text-emerald-500 focus:ring-emerald-400 cursor-pointer"
              />
              Import measurements from this file
            </label>
            {createMeasurements && (
              <select
                value={selectedGarmentType}
                onChange={e => setSelectedGarmentType(e.target.value)}
                className="w-full max-w-xs px-3 py-2 bg-white border-2 border-slate-200 rounded-lg text-xs font-bold text-slate-700 focus:outline-none focus:border-emerald-400 cursor-pointer"
              >
                <option value="">Select garment type for measurements...</option>
                {garmentTypes.filter(g => g.enabled).map(gt => (
                  <option key={gt.id} value={gt.id}>{gt.name}</option>
                ))}
              </select>
            )}
          </div>

          {createMeasurements && !selectedGarmentType && (
            <p className="text-xs text-amber-600 font-semibold">
              Select a garment type to enable measurement field mapping.
            </p>
          )}

          <div className="space-y-2 max-h-[40vh] overflow-y-auto border border-slate-200 rounded-xl p-3">
            {headers.map(h => (
              <div key={h} className="flex items-center gap-3 bg-white border border-slate-100 rounded-lg px-3 py-2">
                <span className="text-xs font-bold text-slate-700 min-w-[100px] break-words flex-1">{h}</span>
                <ChevronDown className="w-3 h-3 text-slate-300 shrink-0" />
                <select
                  value={mapping[h]}
                  onChange={e => setMapping(prev => ({ ...prev, [h]: e.target.value }))}
                  className="flex-1 px-2 py-1 bg-white border border-slate-200 rounded text-xs font-semibold text-slate-700 focus:outline-none focus:border-emerald-400 cursor-pointer"
                >
                  {Object.entries(optionGroups).map(([groupName, opts]) => (
                    <optgroup key={groupName} label={groupName === 'actions' ? '' : groupName}>
                      {opts.map(opt => (
                        <option key={opt.id} value={opt.id}>{opt.label}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                {mapping[h] !== '_ignore' ? (
                  <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                ) : (
                  <X className="w-4 h-4 text-slate-300 shrink-0" />
                )}
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between">
            <div className="text-xs text-slate-500">
              <span className="font-bold text-emerald-600">{mappedCustomerFields}</span> customer fields ·{' '}
              <span className="font-bold text-emerald-600">{mappedMeasFields}</span> measurement fields mapped
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setStep('upload')}
                className="px-4 py-2 bg-white border border-slate-200 text-slate-600 font-bold rounded-lg text-xs uppercase tracking-wider cursor-pointer hover:bg-slate-50 flex items-center gap-1"
              >
                <ArrowLeft className="w-3 h-3" />
                Back
              </button>
              <button
                onClick={() => {
                  const hasName = Object.values(mapping).includes('name');
                  if (!hasName) {
                    alert('You must map at least one column to "Full Name".');
                    return;
                  }
                  if (createMeasurements && mappedMeasFields > 0 && !selectedGarmentType) {
                    alert('Select a garment type for measurement fields.');
                    return;
                  }
                  setStep('preview');
                }}
                disabled={mappedCount === 0}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-bold rounded-lg text-xs uppercase tracking-wider cursor-pointer disabled:cursor-not-allowed flex items-center gap-1"
              >
                Next
                <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>
      )}

      {step === 'preview' && (
        <div className="space-y-5">
          <div className="bg-sky-50 border border-sky-200 rounded-xl p-3 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-sky-500 shrink-0 mt-0.5" />
            <p className="text-xs text-sky-800">
              Preview of the first {Math.min(5, rows.length)} rows. Review the mapped data, then confirm to start importing.
            </p>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50">
                  <th className="text-left px-3 py-2 font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">#</th>
                  {headers.filter(h => mapping[h] !== '_ignore').map(h => (
                    <th key={h} className="text-left px-3 py-2 font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200 break-words min-w-0">
                      {mapping[h].startsWith('meas:') ? mapping[h].slice(5) : mapping[h]}
                      <span className="block text-[10px] text-slate-400 font-normal normal-case break-words">{h}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {getPreviewRows().map((row, idx) => (
                  <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                    <td className="px-3 py-2 text-slate-400 font-bold border-b border-slate-100">{idx + 1}</td>
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
            <p className="text-xs text-slate-400 text-center">
              ... and {rows.length - 5} more rows
            </p>
          )}

          <div className="flex gap-2 justify-between">
            <button
              onClick={() => setStep('mapping')}
              className="px-4 py-2 bg-white border border-slate-200 text-slate-600 font-bold rounded-lg text-xs uppercase tracking-wider cursor-pointer hover:bg-slate-50 flex items-center gap-1"
            >
              <ArrowLeft className="w-3 h-3" />
              Back to Mapping
            </button>
            <button
              onClick={handleStartImport}
              className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-xs uppercase tracking-wider cursor-pointer flex items-center gap-1.5"
            >
              <Database className="w-4 h-4" />
              Import {rows.length} Customer{rows.length !== 1 ? 's' : ''}
            </button>
          </div>
        </div>
      )}

      {step === 'importing' && (
        <div className="space-y-6 text-center py-8">
          <Loader2 className="w-10 h-10 text-emerald-500 animate-spin mx-auto" />
          <p className="text-sm font-bold text-slate-600 uppercase tracking-wider">
            Importing customers...
          </p>
          <div className="w-full max-w-md mx-auto bg-slate-200 rounded-full h-2.5 overflow-hidden">
            <div
              className="bg-emerald-500 h-full rounded-full transition-all duration-300"
              style={{ width: `${Math.min(importProgress, 100)}%` }}
            />
          </div>
          <p className="text-xs text-slate-400">{Math.round(importProgress)}%</p>
        </div>
      )}

      {step === 'done' && (
        <div className="space-y-5">
          {importResults && (
            <div className="space-y-3">
              <div className={`rounded-xl p-4 flex items-start gap-3 ${
                importResults.errors.length > 0
                  ? 'bg-amber-50 border border-amber-200'
                  : importResults.skipped > 0
                    ? 'bg-amber-50 border border-amber-200'
                    : 'bg-emerald-50 border border-emerald-200'
              }`}>
                {importResults.errors.length > 0 ? (
                  <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                ) : (
                  <Check className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                )}
                <div className="text-xs">
                  <p className="font-bold text-slate-800">
                    Import complete
                  </p>
                  <p className="text-slate-600 mt-1">
                    <span className="text-emerald-600 font-bold">{importResults.imported}</span> imported ·{' '}
                    <span className="text-amber-600 font-bold">{importResults.skipped}</span> skipped
                  </p>
                </div>
              </div>

              {importResults.details && importResults.details.length > 0 && (
                <div className="max-h-[30vh] overflow-y-auto border border-slate-200 rounded-xl">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-slate-50">
                        <th className="text-left px-3 py-2 font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">Name</th>
                        <th className="text-left px-3 py-2 font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">Status</th>
                        <th className="text-left px-3 py-2 font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">Detail</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importResults.details.map((d: any, idx: number) => (
                        <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                          <td className="px-3 py-2 text-slate-700 border-b border-slate-100 font-semibold">{d.name}</td>
                          <td className="px-3 py-2 border-b border-slate-100">
                            <span className={`inline-flex items-center gap-1 font-bold ${
                              d.status === 'imported' ? 'text-emerald-600' : 'text-amber-600'
                            }`}>
                              {d.status === 'imported' ? (
                                <Check className="w-3 h-3" />
                              ) : (
                                <X className="w-3 h-3" />
                              )}
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
                <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                  <p className="text-xs font-bold text-red-700 mb-1">Errors:</p>
                  <ul className="text-xs text-red-600 space-y-0.5 list-disc list-inside">
                    {importResults.errors.slice(0, 10).map((err: string, idx: number) => (
                      <li key={idx}>{err}</li>
                    ))}
                    {importResults.errors.length > 10 && (
                      <li className="text-slate-400">+{importResults.errors.length - 10} more errors</li>
                    )}
                  </ul>
                </div>
              )}
            </div>
          )}

          <div className="flex gap-2 justify-between">
            <button
              onClick={() => {
                setStep('upload');
                setHeaders([]);
                setRows([]);
                setMapping({});
                setImportResults(null);
                setCreateMeasurements(false);
                setSelectedGarmentType('');
              }}
              className="px-4 py-2 bg-white border border-slate-200 text-slate-600 font-bold rounded-lg text-xs uppercase tracking-wider cursor-pointer hover:bg-slate-50 flex items-center gap-1"
            >
              <Upload className="w-3 h-3" />
              Import Another File
            </button>
            <button
              onClick={onComplete}
              className="px-4 py-2 bg-[#0F172A] hover:bg-slate-800 text-white font-bold rounded-lg text-xs uppercase tracking-wider cursor-pointer flex items-center gap-1"
            >
              <Check className="w-3 h-3" />
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
