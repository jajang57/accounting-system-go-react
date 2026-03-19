import React, { useState } from 'react';
import { useFetchJson } from '../hooks/useFetchJson';
import { API } from '../lib/api';

export function ComparePage({ spreadsheetId }) {
    const [a, setA] = useState("full");
    const [b, setB] = useState("script");
    const { loading, error, data } = useFetchJson(API.compare(a, b, spreadsheetId));

    return (
        <div className="panel">
            <div className="panel-header">
                <h2 className="title">Compare Sources</h2>
                <div className="subtitle">Bandingkan hasil 2 source backend</div>
            </div>
            <div className="controls">
                <select value={a} onChange={e => setA(e.target.value)}>
                    <option>full</option><option>alias</option><option>kasbesar</option><option>jurnal</option><option>backtest</option><option>script</option>
                </select>
                <select value={b} onChange={e => setB(e.target.value)}>
                    <option>script</option><option>full</option><option>alias</option><option>kasbesar</option><option>jurnal</option><option>backtest</option>
                </select>
            </div>
            {loading && <div className="status">Loading compare...</div>}
            {error && <div className="status">Error: {error}</div>}
            {data && (
                <>
                    <div className="cards">
                        <div className="card"><div className="k">Rows A</div><div className="v">{data.rowsA}</div></div>
                        <div className="card"><div className="k">Rows B</div><div className="v">{data.rowsB}</div></div>
                        <div className="card"><div className="k">Only In A</div><div className="v">{data.onlyInA}</div></div>
                        <div className="card"><div className="k">Only In B</div><div className="v">{data.onlyInB}</div></div>
                    </div>
                    <div className="list">
                        <div className="list-item"><span>Amount Mismatch</span><strong>{data.amountMismatch}</strong></div>
                        <div className="list-item"><span>Source A</span><strong>{data.sourceA}</strong></div>
                        <div className="list-item"><span>Source B</span><strong>{data.sourceB}</strong></div>
                    </div>
                </>
            )}
        </div>
    );
}
