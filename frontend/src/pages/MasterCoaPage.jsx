import React, { useState, useMemo } from 'react';
import { useFetchJson } from '../hooks/useFetchJson';
import { API } from '../lib/api';

export function MasterCoaPage({ spreadsheetId }) {
    const [reloadKey, setReloadKey] = useState(0);
    const [colFilters, setColFilters] = useState(Array.from({ length: 13 }, () => ""));
    const [activeFilterCol, setActiveFilterCol] = useState(-1);
    const [editingRowIndex, setEditingRowIndex] = useState(-1);
    const [editingValues, setEditingValues] = useState(Array.from({ length: 13 }, () => ""));
    const [saveStatus, setSaveStatus] = useState("");

    const previewUrl = `${API.sheetPreview("master_coa", spreadsheetId, "A1:M")}&_r=${reloadKey}`;
    const { loading, error, data } = useFetchJson(previewUrl);

    const rows = useMemo(() => {
        const r = data && Array.isArray(data.rows) ? data.rows : [];
        return r;
    }, [data]);
    const rowNumbers = useMemo(() => {
        const rn = data && Array.isArray(data.rowNumbers) ? data.rowNumbers : [];
        return rn;
    }, [data]);

    const maxCols = useMemo(() => {
        let m = 0;
        rows.forEach(r => { if (r.length > m) m = r.length; });
        return Math.max(m, 13);
    }, [rows]);

    const headerRow = rows.length > 0 ? rows[0] : Array.from({ length: maxCols }, (_, i) => `Col ${i + 1}`);
    const dataRows = rows.length > 1 ? rows.slice(1) : [];
    const dataRowNumbers = rowNumbers.length > 1 ? rowNumbers.slice(1) : [];
    const hasData = rows.length > 0;

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
    }

    function cancelEdit() {
        setEditingRowIndex(-1);
        setEditingValues(Array.from({ length: 13 }, () => ""));
    }

    async function saveEdit() {
        if (editingRowIndex < 0) return;
        const targetRowNumber = dataRowNumbers[editingRowIndex];
        if (!targetRowNumber) return;

        setSaveStatus("Menyimpan...");
        try {
            const res = await fetch(API.sheetUpdateRow, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    spreadsheetId,
                    sheet: "master_coa",
                    rowNumber: targetRowNumber,
                    values: editingValues
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
                <h2 className="title">Master COA</h2>
                <div className="subtitle">Kelola data master akun (range A1:M)</div>
            </div>
            {(loading) && !hasData && <div className="status">Loading master COA...</div>}
            {error && <div className="status">Error: {error}</div>}
            {hasData && !error && (
                <>
                    <div className="info-strip">
                        <div><strong>Sheet:</strong> master_coa</div>
                        {saveStatus && <div><strong>Status:</strong> {saveStatus}</div>}
                    </div>
                    <div className="table-wrap table-scroll" onClick={() => setActiveFilterCol(-1)}>
                        <table className="bank-table">
                            <thead>
                                <tr>
                                    <th style={{ minWidth: "92px" }}>
                                        <div className="th-flex"><span>Aksi</span><span className="filter-icon">▾</span></div>
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
                                                >▾</span>
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
                                                            >↻ Reset</button>
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
                                {filteredRows.map((row, filteredIndex) => (
                                    <tr key={filteredIndex}>
                                        <td><button className="btn" onClick={() => startEdit(filteredIndex)}>Edit</button></td>
                                        {Array.from({ length: maxCols }).map((_, j) => <td key={j}>{row[j] || ""}</td>)}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            )}
            {editingRowIndex >= 0 && (
                <div className="edit-modal-backdrop" onClick={cancelEdit}>
                    <div className="edit-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="edit-modal-header">
                            <strong>Edit Master COA Row {dataRowNumbers[editingRowIndex] || "-"}</strong>
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
                                    <input
                                        value={editingValues[j] || ""}
                                        onChange={e => {
                                            const next = [...editingValues];
                                            next[j] = e.target.value;
                                            setEditingValues(next);
                                        }}
                                    />
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
