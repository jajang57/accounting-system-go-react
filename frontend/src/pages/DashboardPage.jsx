import React from 'react';

export function DashboardPage() {
    return (
        <div className="panel">
            <div className="panel-header">
                <h2 className="title">Dashboard</h2>
                <div className="subtitle">Akses cepat ke GL, compare, dan daftar sheet</div>
            </div>
            <div className="list">
                <div className="list-item"><span>General Ledger</span><span className="muted">Filter, total, export</span></div>
                <div className="list-item"><span>Compare</span><span className="muted">Validasi full vs script</span></div>
                <div className="list-item"><span>Sheets Explorer</span><span className="muted">Metadata sheet realtime</span></div>
                <div className="list-item"><span>Reports</span><span className="muted">Siap untuk LR/Neraca</span></div>
            </div>
        </div>
    );
}
