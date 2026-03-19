import React, { useEffect, useMemo, useState } from 'react';
import { API } from '../lib/api';
import { useFetchJson } from '../hooks/useFetchJson';
import {
    COMPANY_DATA_RANGE,
    COMPANY_FIELDS_DEF,
    TAX_FIELDS_DEF,
    SHEET_FIELDS_DEF,
    LINKS_DEF,
    LEGAL_ROW_OFFSETS
} from '../lib/companyConfig';

const getCellValue = (rows, rowIndex, colIndex = 3) => {
    if (!Array.isArray(rows)) return '';
    const row = rows[rowIndex];
    if (!Array.isArray(row)) return '';
    return String(row[colIndex] || '').trim();
};

const ensureRowValues = (rows, rowIndex, minLength = 6) => {
    const existing = Array.isArray(rows[rowIndex]) ? [...rows[rowIndex]] : [];
    const filled = [...existing];
    while (filled.length < minLength) filled.push('');
    return filled;
};

const buildTabularEntries = (rows, fieldDef) =>
    fieldDef.map(def => ({
        ...def,
        value: getCellValue(rows, def.rowIndex) || ''
    }));

export function CompanyPage({ spreadsheetId }) {
    const [reloadKey, setReloadKey] = useState(0);
    const [yearDraft, setYearDraft] = useState('');
    const [companyDraft, setCompanyDraft] = useState([]);
    const [taxDraft, setTaxDraft] = useState([]);
    const [legalDraft, setLegalDraft] = useState([]);
    const [sheetDraft, setSheetDraft] = useState([]);
    const [linksDraft, setLinksDraft] = useState({ sheet: '', deploy: '' });
    const [isSaving, setIsSaving] = useState(false);
    const [saveMessage, setSaveMessage] = useState('');

    const previewUrl = `${API.sheetPreview('seting perusahaan', spreadsheetId, DATA_RANGE)}&_r=${reloadKey}`;
    const { loading, error, data } = useFetchJson(previewUrl);

    const rows = useMemo(() => {
        if (!data || !Array.isArray(data.rows)) return [];
        return data.rows;
    }, [data]);

    useEffect(() => {
        setYearDraft(getCellValue(rows, 0));
        setCompanyDraft(buildTabularEntries(rows, COMPANY_FIELDS_DEF));
        setTaxDraft(buildTabularEntries(rows, TAX_FIELDS_DEF));
        setSheetDraft(buildTabularEntries(rows, SHEET_FIELDS_DEF));
        setLegalDraft(
            LEGAL_ROW_OFFSETS.map(rowIndex => ({
                rowIndex,
                doc: getCellValue(rows, rowIndex),
                nomor: getCellValue(rows, rowIndex, 4),
                masa: getCellValue(rows, rowIndex, 5)
            }))
        );
        setLinksDraft({
            sheet: getCellValue(rows, LINKS_DEF[0].rowIndex),
            deploy: getCellValue(rows, LINKS_DEF[1].rowIndex)
        });
    }, [rows]);

    const updateDraft = (setter, idx, key, value) => {
        setter(prev => prev.map((item, index) => (index === idx ? { ...item, [key]: value } : item)));
    };

    const updateLegalDraft = (idx, field, value) => {
        setLegalDraft(prev => prev.map((item, index) => (index === idx ? { ...item, [field]: value } : item)));
    };

    const ensureOverrides = (overrides = []) => overrides.map(o => ({ col: o.col, value: o.value || '' }));

    const persistRow = async (rowIndex, overrides = []) => {
        const values = ensureRowValues(rows, rowIndex);
        ensureOverrides(overrides).forEach(({ col, value }) => {
            values[col] = value;
        });
        const res = await fetch(API.sheetUpdateRow, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                spreadsheetId,
                sheet: 'seting perusahaan',
                rowNumber: rowIndex + 1,
                values
            })
        });
        if (!res.ok) {
            const text = await res.text();
            throw new Error(text || 'Gagal menyimpan baris');
        }
    };

    const handleSave = async () => {
        setIsSaving(true);
        setSaveMessage('');
        try {
            await persistRow(0, [{ col: 3, value: yearDraft }]);
            for (const field of companyDraft) {
                await persistRow(field.rowIndex, [{ col: 3, value: field.value }]);
            }
            for (const field of taxDraft) {
                await persistRow(field.rowIndex, [{ col: 3, value: field.value }]);
            }
            for (const field of sheetDraft) {
                await persistRow(field.rowIndex, [{ col: 3, value: field.value }]);
            }
            await persistRow(LINKS_DEF[0].rowIndex, [{ col: 3, value: linksDraft.sheet }]);
            await persistRow(LINKS_DEF[1].rowIndex, [{ col: 3, value: linksDraft.deploy }]);
            for (const entry of legalDraft) {
                await persistRow(entry.rowIndex, [
                    { col: 3, value: entry.doc },
                    { col: 4, value: entry.nomor },
                    { col: 5, value: entry.masa }
                ]);
            }
            setSaveMessage('Semua data tersimpan.');
            setReloadKey(k => k + 1);
        } catch (err) {
            setSaveMessage(err.message || 'Terjadi kesalahan saat menyimpan.');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="panel">
            <div className="panel-header">
                <h2 className="title">Setting Perusahaan</h2>
                <div className="subtitle">Entry langsung dari sheet "seting perusahaan"</div>
            </div>
            {loading && <div className="status">Memuat data...</div>}
            {error && <div className="status">Error: {error}</div>}
            {!loading && !error && (
                <div className="grid gap-5">
                    <div className="border border-slate-100 rounded-xl p-4 bg-white shadow-sm">
                        <h3 className="title text-sm mb-2">Tahun Pembukaan</h3>
                        <input
                            className="w-full text-lg font-bold border-b border-slate-200 focus-visible:outline-none"
                            value={yearDraft}
                            onChange={e => setYearDraft(e.target.value)}
                        />
                    </div>

                    <div className="border border-slate-100 rounded-xl p-4 bg-white shadow-sm space-y-2">
                        <h3 className="title text-sm mb-2">Data Perusahaan</h3>
                        {companyDraft.map((field, idx) => (
                            <div key={`company-${field.label}`} className="flex items-center gap-3 text-sm">
                                <span className="w-24 text-slate-500">{field.label}</span>
                                <input
                                    className="flex-1 bg-slate-50 rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-900"
                                    value={field.value}
                                    onChange={e => updateDraft(setCompanyDraft, idx, 'value', e.target.value)}
                                />
                            </div>
                        ))}
                    </div>

                    <div className="border border-slate-100 rounded-xl p-4 bg-white shadow-sm space-y-2">
                        <h3 className="title text-sm mb-2">Data Wajib Pajak</h3>
                        {taxDraft.map((field, idx) => (
                            <div key={`tax-${field.label}`} className="flex items-center gap-3 text-sm">
                                <span className="w-24 text-slate-500">{field.label}</span>
                                <input
                                    className="flex-1 bg-slate-50 rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-900"
                                    value={field.value}
                                    onChange={e => updateDraft(setTaxDraft, idx, 'value', e.target.value)}
                                />
                            </div>
                        ))}
                    </div>

                    <div className="border border-slate-100 rounded-xl p-4 bg-white shadow-sm space-y-2">
                        <h3 className="title text-sm mb-2">Data Sheet</h3>
                        {sheetDraft.map((field, idx) => (
                            <div key={`sheet-${field.label}`} className="flex items-center gap-3 text-sm">
                                <span className="w-24 text-slate-500">{field.label}</span>
                                <input
                                    className="flex-1 bg-slate-50 rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-900"
                                    value={field.value}
                                    onChange={e => updateDraft(setSheetDraft, idx, 'value', e.target.value)}
                                />
                            </div>
                        ))}
                    </div>

                    <div className="border border-slate-100 rounded-xl p-4 bg-white shadow-sm space-y-2">
                        <h3 className="title text-sm mb-2">Link Sheet / Deploy</h3>
                        {LINKS_DEF.map(link => (
                            <div key={link.label} className="flex flex-col gap-1 text-xs">
                                <span className="text-slate-500">{link.label}</span>
                                <input
                                    className="bg-slate-50 rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-900"
                                    value={link.label === 'Link Sheet' ? linksDraft.sheet : linksDraft.deploy}
                                    onChange={e =>
                                        setLinksDraft(prev => ({
                                            ...prev,
                                            [link.label === 'Link Sheet' ? 'sheet' : 'deploy']: e.target.value
                                        }))
                                    }
                                />
                            </div>
                        ))}
                    </div>

                    <div className="border border-slate-100 rounded-xl p-4 bg-white shadow-sm space-y-3">
                        <h3 className="title text-sm mb-2">Legalitas Perusahaan</h3>
                        <div className="overflow-x-auto">
                            <table className="w-full text-xs border-separate" style={{ borderSpacing: '0 0.75rem' }}>
                                <thead>
                                    <tr className="text-left text-slate-500 text-[11px]">
                                        <th className="pb-2">Jenis Dokumen</th>
                                        <th className="pb-2">Nomor</th>
                                        <th className="pb-2">Masa Berlaku</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {legalDraft.map((row, idx) => (
                                        <tr key={`legal-${idx}`} className="bg-slate-50/50">
                                            <td className="p-1">
                                                <input
                                                    className="w-full bg-white rounded border border-slate-200 px-2 py-1 text-xs"
                                                    value={row.doc}
                                                    onChange={e => updateLegalDraft(idx, 'doc', e.target.value)}
                                                />
                                            </td>
                                            <td className="p-1">
                                                <input
                                                    className="w-full bg-white rounded border border-slate-200 px-2 py-1 text-xs"
                                                    value={row.nomor}
                                                    onChange={e => updateLegalDraft(idx, 'nomor', e.target.value)}
                                                />
                                            </td>
                                            <td className="p-1">
                                                <input
                                                    className="w-full bg-white rounded border border-slate-200 px-2 py-1 text-xs"
                                                    value={row.masa}
                                                    onChange={e => updateLegalDraft(idx, 'masa', e.target.value)}
                                                />
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div className="flex flex-col gap-2">
                        {saveMessage && <div className="status">{saveMessage}</div>}
                        <button className="btn w-max" onClick={handleSave} disabled={isSaving}>
                            {isSaving ? 'Menyimpan...' : 'Simpan Semua Data'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
