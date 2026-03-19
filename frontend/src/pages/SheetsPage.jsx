import React from 'react';
import { useFetchJson } from '../hooks/useFetchJson';
import { API } from '../lib/api';

export function SheetsPage({ spreadsheetId }) {
    const { loading, error, data } = useFetchJson(API.sheets(spreadsheetId));
    const sheets = Array.isArray(data) ? data : [];
    return (
        <div className="panel">
            <div className="panel-header">
                <h2 className="title">Sheets Explorer</h2>
                <div className="subtitle">Daftar sheet dari Google Spreadsheet</div>
            </div>
            {loading && <div className="status">Loading sheets...</div>}
            {error && <div className="status">Error: {error}</div>}
            {!loading && !error && (
                <div className="list">
                    {sheets.map(s => (
                        <div className="list-item" key={s.sheetId}>
                            <span><strong>{s.title}</strong> <span className="muted">index {s.index}</span></span>
                            <span className="muted">{s.rowCount} rows x {s.colCount} cols</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
