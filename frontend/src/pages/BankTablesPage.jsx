import React, { useState, useEffect, useMemo } from 'react';
import { useFetchJson } from '../hooks/useFetchJson';
import { useCompanySheetNames } from '../hooks/useCompanySheetNames';
import { API } from '../lib/api';
import { parseIDNumber, formatIDNumber, toSheetDate, toDisplayDateInput, deriveNextNoUrut, deriveNextNoBukti } from '../lib/utils';

export function BankTablesPage({ spreadsheetId, allowedBanks }) {
    const { loading: ls, error: es, data: ds } = useFetchJson(API.sheets(spreadsheetId));
    const allBankSheets = useMemo(() => {
        const list = Array.isArray(ds) ? ds : [];
        return list
            .filter(s => /^bank\d{3}$/i.test(String(s.title || "").trim()))
            .sort((a, b) => String(a.title).localeCompare(String(b.title)));
    }, [ds]);
    const normalizedAllowedBanks = useMemo(() => {
        if (!Array.isArray(allowedBanks) || allowedBanks.length === 0) return null;
        return allowedBanks
            .map(name => String(name || "").trim().toLowerCase())
            .filter(Boolean);
    }, [allowedBanks]);
    const bankSheets = useMemo(() => {
        if (!normalizedAllowedBanks) {
            return allBankSheets;
        }
        return allBankSheets.filter(s => {
            const title = String(s.title || "").toLowerCase();
            return normalizedAllowedBanks.includes(title);
        });
    }, [allBankSheets, normalizedAllowedBanks]);

    const [selected, setSelected] = useState("");
    const [reloadKey, setReloadKey] = useState(0);
    const [colFilters, setColFilters] = useState(Array.from({ length: 13 }, () => ""));
    const [activeFilterCol, setActiveFilterCol] = useState(-1);
    const [editingRowIndex, setEditingRowIndex] = useState(-1);
    const [editingValues, setEditingValues] = useState(Array.from({ length: 13 }, () => ""));
    const [isAddingRow, setIsAddingRow] = useState(false);
    const [coaOptions, setCoaOptions] = useState([]);
    const [saveStatus, setSaveStatus] = useState("");

    useEffect(() => {
        if (bankSheets.length === 0) {
            setSelected("");
            return;
        }
        if (!selected || !bankSheets.some(s => s.title === selected)) {
            setSelected(bankSheets[0].title);
        }
    }, [bankSheets, selected]);

    const previewUrl = selected ? `${API.sheetPreview(selected, spreadsheetId, "A4:M")}&_r=${reloadKey}` : "";
    const { loading, error, data } = useFetchJson(previewUrl);
    const bankNames = useCompanySheetNames(spreadsheetId);
    const rows = useMemo(() => {
        const r = data && Array.isArray(data.rows) ? data.rows : [];
        return selected ? r : [];
    }, [data, selected]);
    const rowNumbers = useMemo(() => {
        const rn = data && Array.isArray(data.rowNumbers) ? data.rowNumbers : [];
        return selected ? rn : [];
    }, [data, selected]);
    const companyName = data && data.companyName ? data.companyName : "-";
    const tableName = data && data.tableName ? data.tableName : selected || "-";

    useEffect(() => {
        setEditingRowIndex(-1);
        setEditingValues(Array.from({ length: 13 }, () => ""));
        setIsAddingRow(false);
        setSaveStatus("");
        setColFilters(Array.from({ length: 13 }, () => ""));
        setActiveFilterCol(-1);
    }, [selected, spreadsheetId]);

    useEffect(() => {
        let alive = true;
        fetch(API.sheetPreview("master_coa", spreadsheetId, "B2:B"))
            .then(r => {
                if (!r.ok) throw new Error(`HTTP ${r.status}`);
                return r.json();
            })
            .then(d => {
                if (!alive) return;
                const rows = Array.isArray(d?.rows) ? d.rows : [];
                const options = Array.from(new Set(
                    rows.map(r => String(r?.[0] || "").trim()).filter(Boolean)
                ));
                setCoaOptions(options);
            })
            .catch(() => {
                if (!alive) return;
                setCoaOptions([]);
            });
        return () => { alive = false; };
    }, [spreadsheetId]);

    const maxCols = useMemo(() => {
        let m = 0;
        rows.forEach(r => { if (r.length > m) m = r.length; });
        return Math.max(m, 13);
    }, [rows]);

    const headerRow = rows.length > 0 ? rows[0] : Array.from({ length: maxCols }, (_, i) => `Col ${i + 1}`);
    const dataRows = rows.length > 1 ? rows.slice(1) : [];
    const dataRowNumbers = rowNumbers.length > 1 ? rowNumbers.slice(1) : [];
    const hasPreviewData = rows.length > 0;

    const filteredRows = useMemo(() => {
        return dataRows.filter((row) => {
            for (let i = 0; i < maxCols; i++) {
                const q = String(colFilters[i] || "").toLowerCase().trim();
                if (!q) continue;
                const cell = String(row[i] || "").toLowerCase();
                if (!cell.includes(q)) return false;
            }
            return true;
        });
    }, [dataRows, colFilters, maxCols]);

    function startEdit(filteredIndex) {
        const row = filteredRows[filteredIndex] || [];
        const originalIdx = dataRows.findIndex(r => r === row);
        if (originalIdx < 0) return;
        const values = Array.from({ length: 13 }, (_, i) => row[i] || "");
        setEditingRowIndex(originalIdx);
        setEditingValues(values);
        setIsAddingRow(false);
    }

    function cancelEdit() {
        setEditingRowIndex(-1);
        setEditingValues(Array.from({ length: 13 }, () => ""));
        setIsAddingRow(false);
    }

    function recomputeSaldo(values, sourceRows, rowIdxForEdit, addingRow) {
        const next = [...values];
        const dr = parseIDNumber(next[6]);
        const cr = parseIDNumber(next[7]);
        let prevSaldo = 0;
        if (addingRow) {
            const prev = sourceRows[sourceRows.length - 1];
            prevSaldo = parseIDNumber(prev?.[8]);
        } else if (rowIdxForEdit > 0) {
            prevSaldo = parseIDNumber(sourceRows[rowIdxForEdit - 1]?.[8]);
        }
        const saldo = prevSaldo + dr - cr;
        next[8] = formatIDNumber(saldo);
        return next;
    }

    function startAddRow() {
        const nextNoUrut = deriveNextNoUrut(dataRows);
        const lastNoBukti = dataRows.length > 0 ? String(dataRows[dataRows.length - 1]?.[1] || "") : "";
        const values = Array.from({ length: 13 }, () => "");
        values[0] = String(nextNoUrut);
        values[1] = deriveNextNoBukti(lastNoBukti, nextNoUrut);
        values[2] = toSheetDate(new Date());
        const withSaldo = recomputeSaldo(values, dataRows, -1, true);
        setEditingValues(withSaldo);
        setEditingRowIndex(-1);
        setIsAddingRow(true);
    }

    async function saveEdit() {
        const targetRowNumber = isAddingRow
            ? ((rowNumbers[rowNumbers.length - 1] || 3) + 1)
            : dataRowNumbers[editingRowIndex];
        if (!targetRowNumber) return;

        setSaveStatus("Menyimpan...");
        try {
            const res = await fetch(API.sheetUpdateRow, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    spreadsheetId,
                    sheet: selected,
                    rowNumber: targetRowNumber,
                    values: editingValues.map((v, idx) => {
                        if (idx === 2) return toSheetDate(v);
                        return v;
                    })
                })
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            setSaveStatus("Berhasil disimpan ke Google Sheet.");
            cancelEdit();
            setReloadKey(k => k + 1);
        } catch (e) {
            setSaveStatus(`Gagal simpan: ${e.message}`);
        }
    }

    return (
        <div className="panel">
            <div className="panel-header">
                <h2 className="title">Bank Tables</h2>
                <div className="subtitle">Preview data table dari sheet Bank001-Bank010 (range A4:M)</div>
            </div>
            <div className="controls">
                    <select value={selected} onChange={e => setSelected(e.target.value)}>
                        {bankSheets.length === 0 && <option value="">Tidak ada sheet bank yang diizinkan</option>}
                        {bankSheets.map(s => {
                            const key = String(s.title || "").toLowerCase();
                            const label = bankNames[key] ? `${s.title} (${bankNames[key]})` : s.title;
                            return (
                                <option key={s.sheetId} value={s.title}>{label}</option>
                            );
                        })}
                    </select>
                <button className="btn" onClick={startAddRow} disabled={!selected}>Tambah Baris</button>
            </div>
            {(ls || loading) && !hasPreviewData && <div className="status">Loading bank tables...</div>}
            {(es || error) && <div className="status">Error: {es || error}</div>}
            {hasPreviewData && !es && !error && (
                <>
                    <div className="info-strip">
                        <div><strong>Perusahaan:</strong> {companyName}</div>
                        <div><strong>Tabel:</strong> {tableName}</div>
                        {saveStatus && <div><strong>Status:</strong> {saveStatus}</div>}
                        {(ls || loading) && <div><strong>Sinkronisasi:</strong> Memperbarui data...</div>}
                    </div>
                    <div className="table-wrap table-scroll" onClick={() => setActiveFilterCol(-1)}>
                        <table className="bank-table">
                            <thead>
                                <tr>
                                    <th style={{ minWidth: "92px" }}>
                                        <div className="th-flex">
                                            <span>Aksi</span>
                                            <span className="filter-icon">v</span>
                                        </div>
                                    </th>
                                    {Array.from({ length: maxCols }).map((_, i) => (
                                        <th key={i}>
                                            <div className="th-flex">
                                                <span>{headerRow[i] || `Col ${i + 1}`}</span>
                                                <span
                                                    className={`filter-icon ${activeFilterCol === i ? "active" : ""}`}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setActiveFilterCol(activeFilterCol === i ? -1 : i);
                                                    }}
                                                >
                                                    v
                                                </span>
                                                {activeFilterCol === i && (
                                                    <div className="filter-popover" onClick={(e) => e.stopPropagation()}>
                                                        <div className="label">FILTER {String(headerRow[i] || `COL ${i + 1}`).toUpperCase()}</div>
                                                        <input
                                                            autoFocus
                                                            placeholder={`Cari ${headerRow[i] || `Col ${i + 1}`}`}
                                                            value={colFilters[i] || ""}
                                                            onChange={e => {
                                                                const next = [...colFilters];
                                                                next[i] = e.target.value;
                                                                setColFilters(next);
                                                            }}
                                                        />
                                                        <div className="actions">
                                                            <button
                                                                className="filter-link-btn danger"
                                                                onClick={() => {
                                                                    const next = [...colFilters];
                                                                    next[i] = "";
                                                                    setColFilters(next);
                                                                }}
                                                            >
                                                                Reset
                                                            </button>
                                                            <button className="filter-link-btn" onClick={() => setActiveFilterCol(-1)}>Close</button>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {filteredRows.map((row, filteredIndex) => {
                                    return (
                                        <tr key={filteredIndex}>
                                            <td>
                                                <button className="btn" onClick={() => startEdit(filteredIndex)}>Edit</button>
                                            </td>
                                            {Array.from({ length: maxCols }).map((_, j) => (
                                                <td key={j}>{row[j] || ""}</td>
                                            ))}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </>
            )}
            {(editingRowIndex >= 0 || isAddingRow) && (
                <div className="edit-modal-backdrop" onClick={cancelEdit}>
                    <div className="edit-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="edit-modal-header">
                            <strong>{isAddingRow ? "Tambah Row Baru" : `Edit Row ${dataRowNumbers[editingRowIndex] || "-"}`}</strong>
                            <span>
                                <button className="btn" onClick={saveEdit}>Save</button>
                                {" "}
                                <button className="btn" onClick={cancelEdit}>Cancel</button>
                            </span>
                        </div>
                        <div className="edit-grid">
                            {Array.from({ length: maxCols }).map((_, j) => (
                                <div className="edit-field" key={j}>
                                    <label>{headerRow[j] || `Col ${j + 1}`}</label>
                                    {j === 2 ? (
                                        <input
                                            type="date"
                                            value={toDisplayDateInput(editingValues[j] || "")}
                                            onChange={e => {
                                                const next = [...editingValues];
                                                next[j] = toSheetDate(e.target.value);
                                                setEditingValues(next);
                                            }}
                                        />
                                    ) : j === 3 ? (
                                        <input
                                            list="coa-options-list"
                                            value={editingValues[j] || ""}
                                            onChange={e => {
                                                const next = [...editingValues];
                                                next[j] = e.target.value;
                                                setEditingValues(next);
                                            }}
                                        />
                                    ) : j === 8 ? (
                                        <input
                                            value={editingValues[j] || ""}
                                            disabled
                                        />
                                    ) : (
                                        <input
                                            value={editingValues[j] || ""}
                                            onChange={e => {
                                                const next = [...editingValues];
                                                next[j] = e.target.value;
                                                setEditingValues(next);
                                            }}
                                            onBlur={() => {
                                                if ([6, 7, 11].includes(j)) {
                                                    const next = [...editingValues];
                                                    next[j] = formatIDNumber(next[j]);
                                                    const rowIdx = editingRowIndex;
                                                    const withSaldo = recomputeSaldo(next, dataRows, rowIdx, isAddingRow);
                                                    setEditingValues(withSaldo);
                                                } else if (j === 0 && isAddingRow) {
                                                    const next = [...editingValues];
                                                    const nUrut = Math.max(1, Math.floor(parseIDNumber(next[0])));
                                                    next[0] = String(nUrut);
                                                    const lastNoBukti = dataRows.length > 0 ? String(dataRows[dataRows.length - 1]?.[1] || "") : "";
                                                    next[1] = deriveNextNoBukti(lastNoBukti, nUrut);
                                                    setEditingValues(next);
                                                }
                                            }}
                                        />
                                    )}
                                </div>
                            ))}
                            <datalist id="coa-options-list">
                                {coaOptions.map((c, idx) => <option key={`${c}-${idx}`} value={c} />)}
                            </datalist>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
