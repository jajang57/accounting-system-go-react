import React, { useMemo, useState } from 'react';
import useSWR from 'swr';
import { API } from '../lib/api';
import { flatten, parseDate, toNumber, fmt } from '../lib/utils';
import { fetchJson } from '../lib/fetcher';
import { Download } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export function GLPage({ spreadsheetId }) {
    const [source, setSource] = useState("full");
    const [from, setFrom] = useState("");
    const [to, setTo] = useState("");
    const [akun, setAkun] = useState("");
    const [tanggal, setTanggal] = useState("");
    const [noBukti, setNoBukti] = useState("");
    const [ket, setKet] = useState("");
    const [coaKosong, setCoaKosong] = useState(false);
    const [hideZero, setHideZero] = useState(true);

    const glKey = spreadsheetId ? API.gl(source, spreadsheetId) : null;
    const { data, error, isLoading, isValidating, mutate } = useSWR(glKey, fetchJson, {
        revalidateOnFocus: false,
        revalidateOnReconnect: true
    });
    const loading = isLoading || isValidating;
    const rows = useMemo(() => flatten(data), [data]);
    const { logout } = useAuth();

    const filtered = useMemo(() => {
        const f = parseDate(from);
        const t = parseDate(to);
        return rows.filter(row => {
            const rd = parseDate(row.Tanggal);
            if (f && (!rd || rd < f)) return false;
            if (t && (!rd || rd > t)) return false;
            if (coaKosong) {
                const c = String(row.COA || "").trim().toLowerCase();
                if (!(c === "" || c === "coa kosong")) return false;
            }
            if (hideZero && toNumber(row.Debit) === 0 && toNumber(row.Kredit) === 0) return false;
            const ok = (val, q) => String(val || "").toLowerCase().includes(String(q || "").toLowerCase().trim());
            return ok(row.COA, akun) && ok(row.Tanggal, tanggal) && ok(row.NoBukti, noBukti) && ok(row.Keterangan, ket);
        });
    }, [rows, from, to, akun, tanggal, noBukti, ket, coaKosong, hideZero]);

    const totals = useMemo(() => {
        let d = 0, k = 0;
        filtered.forEach(r => { d += toNumber(r.Debit); k += toNumber(r.Kredit); });
        return { debit: d, kredit: k };
    }, [filtered]);

    // Export ke Excel (CSV sederhana)
    function exportToExcel(filteredRows, from, to) {
        let csv = '';
        // Group by nothing here since filteredRows is flat list, but original code implied grouping logic in ReportsPage,
        // here in GLPage it was just flat list export or maybe original code had grouping?
        // Looking at original code:
        // exportToExcel function inside GLPage took filteredRows.
        // Wait, the original code inside GLPage.jsx (in index.html) had a logic:
        // filteredRows.forEach(tbl => ...) 
        // BUT filteredRows in GLPage (index.html line 676) is a flat array of rows.
        // The export function in index.html (line 700) iterates `filteredRows.forEach(tbl => ...)` which implies it expects grouped data.
        // Ah, wait. In index.html, `exportToExcel` is defined inside `GLPage`?
        // Let me check index.html content again.
        // Line 700: function exportToExcel(filteredRows, from, to) { ... }
        // But `filtered` (line 676) is `rows.filter(...)` which returns an array of objects (rows).
        // So `filtered.forEach(tbl => ...)` would fail if `tbl` is a row object and doesn't have `.rows` property?
        // Let's re-read carefully.
        // Line 702: `filteredRows.forEach(tbl => {`
        // Line 705: `tbl.rows.forEach(row => {`
        // accessible from ReportsPage... NOT GLPage.
        // Ah, `ReportsPage` has `exportToExcel` (line 1581 implies it calls it).
        // `GLPage` has an export link: `<a className="btn" href={API.exportCsv(source, spreadsheetId)}>Export CSV</a>` (line 753).
        // So GLPage uses server-side export.
        // The function `exportToExcel` I saw in index.html (lines 700-729) was likely inside `ReportsPage` or `GLPage`?
        // Attempting to find where `exportToExcel` was defined.
        // It was defined inside `GLPage` in my `view_file` output around line 700?
        // Wait, line 662 `function GLPage...`
        // Line 700 `function exportToExcel...`
        // Line 753 `<a ... href={API.exportCsv...}`
        // So `GLPage` defines `exportToExcel` but DOES NOT USE IT?
        // Let's look at `ReportsPage`.
        // Line 1581: `onClick={() => exportToExcel(filteredRows, from, to)}`
        // But `exportToExcel` is defined inside `GLPage` scope? No, that's impossible.
        // Ah, maybe I missed where `exportToExcel` is defined.
        // It must be defined globally or inside `ReportsPage`.
        // Let's check `ReportsPage` in previous view.
        // I don't see `exportToExcel` defined in `ReportsPage` in the snippet I saw (1405-1600).
        // Maybe it was defined globally?
        // Let's checking `index.html` reading again? No, I have the file content.
        // Line 577-621 global functions.
        // Line 700 is inside GLPage.
        // This implies `exportToExcel` inside GLPage is dead code, or I misread the indentation.
        // Let's assume I should move `exportToExcel` to utils or duplicate it in `ReportsPage` where it is used.
        // The `GLPage` uses `API.exportCsv` which hits the backend.

        // I will use `API.exportCsv` in GLPage as per the original code's render.
        return;
    }

    return (
        <div className="report-print-area panel">
            <div className="panel-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                    <h2 className="title">General Ledger</h2>
                    <div className="subtitle">{loading ? "Loading..." : `${filtered.length} baris`}</div>
                </div>
                <button className="btn" onClick={logout} type="button">Logout</button>
            </div>
            <div className="controls">
                <select value={source} onChange={e => setSource(e.target.value)}>
                    <option value="full">full</option>
                    <option value="alias">alias</option>
                    <option value="kasbesar">kasbesar</option>
                    <option value="jurnal">jurnal</option>
                    <option value="backtest">backtest</option>
                    <option value="script">script</option>
                </select>
                <input type="date" value={from} onChange={e => setFrom(e.target.value)} />
                <input type="date" value={to} onChange={e => setTo(e.target.value)} />
                <input placeholder="Filter Akun" value={akun} onChange={e => setAkun(e.target.value)} />
                <input placeholder="Filter Tanggal" value={tanggal} onChange={e => setTanggal(e.target.value)} />
                <input placeholder="Filter No Bukti" value={noBukti} onChange={e => setNoBukti(e.target.value)} />
                <input placeholder="Filter Keterangan" value={ket} onChange={e => setKet(e.target.value)} />
                <label className="toggle"><input type="checkbox" checked={coaKosong} onChange={e => setCoaKosong(e.target.checked)} />COA kosong saja</label>
                <label className="toggle"><input type="checkbox" checked={hideZero} onChange={e => setHideZero(e.target.checked)} />Sembunyikan Debit/Kredit 0</label>
                <button
                    type="button"
                    className="btn"
                    onClick={() => mutate?.()}
                    disabled={loading}
                    style={{ textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                    {loading ? "Memuat ulang..." : "Refresh data"}
                </button>
                <a className="btn" href={API.exportCsv(source, spreadsheetId)} style={{ textDecoration: 'none', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><Download size={14} /> Export CSV</a>
            </div>
            <div className="summary">
                <div>Total Debit: <strong>{fmt(totals.debit)}</strong></div>
                <div>Total Kredit: <strong>{fmt(totals.kredit)}</strong></div>
                <div className="muted">Source: {source}</div>
            </div>
            <div className="table-wrap">
                <table>
                    <thead>
                        <tr>
                            <th>Akun</th><th>Tanggal</th><th>No Bukti</th><th>Keterangan</th>
                            <th className="num">Debit</th><th className="num">Kredit</th><th className="num">Saldo</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.map((row, idx) => (
                            <tr key={`${row.NoBukti || "NB"}-${idx}`}>
                                <td>{row.COA}</td>
                                <td>{row.Tanggal}</td>
                                <td>{row.NoBukti}</td>
                                <td>{row.Keterangan}</td>
                                <td className="num">{fmt(row.Debit)}</td>
                                <td className="num">{fmt(row.Kredit)}</td>
                                <td className="num">{fmt(row.Saldo)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <div className="status">{error ? `Error: ${error}` : "Data berhasil dimuat."}</div>
        </div>
    );
}
