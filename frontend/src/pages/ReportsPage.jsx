import React, { useMemo, useState } from 'react';
import useSWR from 'swr';
import { API } from '../lib/api';
import { fetchJson } from '../lib/fetcher';
import { parseDate } from '../lib/utils';
import { Download, Printer } from 'lucide-react';

export function ReportsPage({ spreadsheetId }) {
    const [showModal, setShowModal] = useState(false);
    const [from, setFrom] = useState("");
    const [to, setTo] = useState("");
    const [coa, setCoa] = useState([]);
    const [filteredRows, setFilteredRows] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const masterCoaPreviewKey = spreadsheetId
        ? `/sheet/preview?sheet=master_coa&range=B2:B&spreadsheetId=${encodeURIComponent(spreadsheetId)}`
        : null;
    const { data: coaPreviewData } = useSWR(masterCoaPreviewKey, fetchJson, {
        revalidateOnFocus: false,
        revalidateOnReconnect: true
    });
    const coaOptions = useMemo(() => {
        const rows = Array.isArray(coaPreviewData?.rows) ? coaPreviewData.rows : [];
        return Array.from(new Set(rows.map(r => String(r?.[0] || "").trim()).filter(Boolean)));
    }, [coaPreviewData]);

    const masterCoaFullKey = spreadsheetId
        ? `/sheet/preview?sheet=master_coa&range=B2:K&spreadsheetId=${encodeURIComponent(spreadsheetId)}`
        : null;
    const { data: masterCoaFull, mutate: mutateMasterCoaFull } = useSWR(masterCoaFullKey, fetchJson, {
        revalidateOnFocus: false,
        revalidateOnReconnect: true
    });

    const bukubesarKey = spreadsheetId ? API.gl("full", spreadsheetId) : null;
    const { data: bukubesarData, mutate: mutateBukubesar } = useSWR(bukubesarKey, fetchJson, {
        revalidateOnFocus: false,
        revalidateOnReconnect: true
    });

    const [activeReportType, setActiveReportType] = useState('bukubesar'); // 'bukubesar' | 'labarugi' | 'neraca'

    function openModal(type = 'bukubesar') {
        setActiveReportType(type);
        setShowModal(true);
    }
    function closeModal() {
        setShowModal(false);
    }

    function exportToExcel(filteredRows, from, to) {
        let csv = '';
        filteredRows.forEach(tbl => {
            csv += `BUKU BESAR\n${tbl.coa || '-'}\nPeriode: ${from || '-'} s.d ${to || '-'}\n`;
            csv += 'Tanggal,No. Bukti,Keterangan,Ven/Customer,Debit,Kredit,Saldo\n';
            tbl.rows.forEach(row => {
                csv += [
                    row.Tanggal,
                    row.NoBukti,
                    row.Keterangan,
                    row.CustVendor,
                    Number(row.Debit).toLocaleString('id-ID', { minimumFractionDigits: 2 }),
                    Number(row.Kredit).toLocaleString('id-ID', { minimumFractionDigits: 2 }),
                    Number(row.Saldo).toLocaleString('id-ID', { minimumFractionDigits: 2 })
                ].map(v => '"' + String(v).replace(/"/g, '""') + '"').join(',') + '\n';
            });
            csv += '\n';
        });
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'buku_besar.csv';
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 100);
    }

    async function handleFilter() {
        setLoading(true);
        setError("");
        try {
            const refreshMasterCoa = mutateMasterCoaFull ?? (() => masterCoaFull);
            const refreshBukubesar = mutateBukubesar ?? (() => bukubesarData);
            const [latestCoa, latestBuku] = await Promise.all([
                refreshMasterCoa(),
                refreshBukubesar()
            ]);
            const rowsCoa = Array.isArray((latestCoa || masterCoaFull)?.rows) ? (latestCoa || masterCoaFull).rows : [];
            const bukubesarPayload = latestBuku ?? bukubesarData;
            const allRows = Array.isArray(bukubesarPayload)
                ? bukubesarPayload
                : Object.values(bukubesarPayload || {}).flat();
            let selectedCoa = coa;
            if (selectedCoa.length === 0 || selectedCoa.includes('__ALL__')) {
                selectedCoa = coaOptions;
            }
            const allResults = [];
            for (const coaVal of selectedCoa) {
                let saldoAwal = 0;
                let headingnrc = "";
                let headinglr = "";
                const found = rowsCoa.find(r => String(r[0] || "").trim() === coaVal);
                if (found) {
                    if (found[6]) saldoAwal = Number(String(found[6]).replace(/\./g, "").replace(",", ".")) || 0;
                    if (found[8]) headingnrc = String(found[8] || "").trim().toLowerCase();
                    if (found[9]) headinglr = String(found[9] || "").trim().toLowerCase();
                }
                let rows = allRows.filter(row => String(row.COA || "").trim() === coaVal);
                rows.sort((a, b) => {
                    const da = parseDate(a.Tanggal);
                    const db = parseDate(b.Tanggal);
                    if (!da && !db) return 0;
                    if (!da) return 1;
                    if (!db) return -1;
                    return da - db;
                });
                let saldo = saldoAwal;
                let openingDate = from || (rows[0] && rows[0].Tanggal);
                const mutasiSebelum = [];
                const mutasiDalam = [];
                const fromDate = from ? parseDate(from) : null;
                const toDate = to ? parseDate(to) : null;
                rows.forEach(row => {
                    const tgl = parseDate(row.Tanggal);
                    if (fromDate && tgl && tgl < fromDate) {
                        mutasiSebelum.push(row);
                    } else if (toDate && tgl && tgl > toDate) {
                        // Lewati transaksi di luar rentang to
                    } else {
                        mutasiDalam.push(row);
                    }
                });
                mutasiSebelum.forEach(row => {
                    const debit = Number(row.Debit) || 0;
                    const kredit = Number(row.Kredit) || 0;
                    if (headingnrc === "pasiva") {
                        saldo += kredit - debit;
                    } else if (headinglr === "pendapatan") {
                        saldo += kredit - debit;
                    } else {
                        saldo += debit - kredit;
                    }
                });
                const result = [];
                function toDDMMYYYY(raw) {
                    const d = parseDate(raw);
                    if (!d) return raw;
                    const dd = String(d.getDate()).padStart(2, '0');
                    const mm = String(d.getMonth() + 1).padStart(2, '0');
                    const yyyy = d.getFullYear();
                    return `${dd}/${mm}/${yyyy}`;
                }
                if (mutasiDalam.length > 0) {
                    result.push({
                        Tanggal: toDDMMYYYY(openingDate),
                        NoBukti: '',
                        Keterangan: 'Opening Balance',
                        CustVendor: '',
                        Debit: 0,
                        Kredit: 0,
                        Saldo: saldo,
                        COA: coaVal
                    });
                }
                mutasiDalam.forEach(row => {
                    const debit = Number(row.Debit) || 0;
                    const kredit = Number(row.Kredit) || 0;
                    console.log("heading" + headingnrc, headinglr);
                    if (headingnrc === "pasiva") {
                        saldo += kredit - debit;
                    } else if (headinglr === "pendapatan") {
                        saldo += kredit - debit;
                    } else {
                        saldo += debit - kredit;
                    }
                    result.push({ ...row, Saldo: saldo });
                });
                if (result.length > 0) {
                    allResults.push({ coa: coaVal, rows: result });
                }
            }
            setFilteredRows(allResults);
            setShowModal(false);
        } catch (e) {
            setError(e.message || "Gagal load data");
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="panel">
            <div className="panel-header">
                <h2 className="title">Reports</h2>
                <div className="subtitle">Laporan Buku Besar Per COA</div>
            </div>
            <div style={{ padding: 16 }}>
                <button className="btn" onClick={() => openModal('bukubesar')}>Filter Buku Besar Per COA</button>
            </div>

            {/* Sub-Header for Laba Rugi */}
            <div style={{ padding: '0 16px 16px 16px', borderBottom: '1px solid var(--line)' }}>
                <div className="subtitle" style={{ marginBottom: 8 }}>Laporan Keuangan</div>
                <div style={{ display: 'flex', gap: 10 }}>
                    <button className="btn" onClick={() => openModal('labarugi')} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <Printer size={16} /> Laba Rugi
                    </button>
                    <button className="btn" onClick={() => openModal('neraca')} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <Printer size={16} /> Neraca
                    </button>
                </div>
            </div>
            {showModal && (
                <div className="edit-modal-backdrop" onClick={closeModal}>
                    <div className="edit-modal" onClick={e => e.stopPropagation()}>
                        <div className="edit-modal-header">
                            <strong>
                                {activeReportType === 'bukubesar' && "Filter Buku Besar"}
                                {activeReportType === 'labarugi' && "Filter Laba Rugi"}
                                {activeReportType === 'neraca' && "Filter Neraca"}
                            </strong>
                            <span><button className="btn" onClick={closeModal}>Tutup</button></span>
                        </div>
                        <div className="edit-grid">
                            <div className="edit-field">
                                <label>Dari Tanggal</label>
                                <input type="date" value={from} onChange={e => setFrom(e.target.value)} />
                            </div>
                            <div className="edit-field">
                                <label>Sampai Tanggal</label>
                                <input type="date" value={to} onChange={e => setTo(e.target.value)} />
                            </div>

                            {activeReportType === 'bukubesar' && (
                                <div className="edit-field">
                                    <label>Pilih COA</label>
                                    <select multiple value={coa} onChange={e => {
                                        const opts = Array.from(e.target.selectedOptions).map(opt => opt.value);
                                        setCoa(opts);
                                    }} style={{ height: '120px' }}>
                                        <option value="__ALL__">-- Semua COA --</option>
                                        {coaOptions.map((c, idx) => <option key={c + idx} value={c}>{c}</option>)}
                                    </select>
                                    <div style={{ fontSize: '12px', color: '#64748b' }}>Tekan Ctrl (atau Cmd) untuk memilih lebih dari satu COA</div>
                                </div>
                            )}

                            <div className="edit-field">
                                <label>&nbsp;</label>
                                <div style={{ display: 'flex', gap: 10 }}>
                                    {activeReportType === 'bukubesar' && (
                                        <button className="btn" onClick={handleFilter}>Tampilkan</button>
                                    )}

                                    <button className="btn" onClick={() => {
                                        const params = new URLSearchParams();
                                        params.set("spreadsheetId", spreadsheetId);
                                        if (from) params.set("startDate", from);
                                        if (to) params.set("endDate", to);

                                        if (activeReportType === 'bukubesar') {
                                            params.set("page", "print_bukubesar");
                                            if (coa.length > 0 && !coa.includes('__ALL__')) {
                                                params.set("coa", coa.join(","));
                                            }
                                        } else if (activeReportType === 'labarugi') {
                                            params.set("page", "print_labarugi");
                                        } else if (activeReportType === 'neraca') {
                                            params.set("page", "print_neraca");
                                        }

                                        window.open(`/?${params.toString()}`, '_blank');
                                    }} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                        <Printer size={16} /> Print Preview
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            {loading && <div className="status">Memuat data...</div>}
            {error && <div className="status">Error: {error}</div>}
            {Array.isArray(filteredRows) && filteredRows.length > 0 && (
                <>
                    <div style={{ display: 'flex', gap: 8, margin: '8px 0 16px 0', padding: '0 16px' }}>
                        <button className="btn" onClick={() => {
                            const params = new URLSearchParams();
                            params.set("page", "print_bukubesar");
                            params.set("spreadsheetId", spreadsheetId);
                            if (from) params.set("startDate", from);
                            if (to) params.set("endDate", to);
                            if (coa.length > 0 && !coa.includes('__ALL__')) {
                                params.set("coa", coa.join(","));
                            }
                            window.open(`/?${params.toString()}`, '_blank');
                        }} style={{ display: 'flex', gap: 6, alignItems: 'center' }}><Printer size={16} /> Print (PDF View)</button>
                        <button className="btn" onClick={() => exportToExcel(filteredRows, from, to)} style={{ display: 'flex', gap: 6, alignItems: 'center' }}><Download size={16} /> Export ke Excel</button>
                    </div>
                    {filteredRows.map((tbl, i) => (
                        <div key={tbl.coa + String(i)} style={{ marginBottom: 32 }} className="export-table-block print-area panel">
                            <div style={{ padding: '16px', textAlign: 'center', borderBottom: '1px solid var(--line)', background: '#f8fafc' }}>
                                <div style={{ fontWeight: 'bold', fontSize: '18px' }}>BUKU BESAR</div>
                                <div style={{ fontWeight: 'bold', fontSize: '16px' }}>{tbl.coa || '-'}</div>
                                <div style={{ color: '#334155', fontSize: '14px' }}>
                                    Periode: {from ? (() => { const d = parseDate(from); return d ? `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}` : from; })() : '-'}
                                    {' s.d '}
                                    {to ? (() => { const d = parseDate(to); return d ? `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}` : to; })() : '-'}
                                </div>
                            </div>
                            <div className="table-wrap">
                                <table>
                                    <thead>
                                        <tr>
                                            <th>Tanggal</th>
                                            <th>No. Bukti</th>
                                            <th>Keterangan</th>
                                            <th>Ven/Customer</th>
                                            <th className="num">Debit</th>
                                            <th className="num">Kredit</th>
                                            <th className="num">Saldo</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {tbl.rows.map((row, idx) => (
                                            <tr key={row.NoBukti + idx}>
                                                <td>{row.Tanggal}</td>
                                                <td>{row.NoBukti}</td>
                                                <td>{row.Keterangan}</td>
                                                <td>{row.CustVendor}</td>
                                                <td className="num">{Number(row.Debit).toLocaleString("id-ID", { minimumFractionDigits: 2 })}</td>
                                                <td className="num">{Number(row.Kredit).toLocaleString("id-ID", { minimumFractionDigits: 2 })}</td>
                                                <td className="num">{Number(row.Saldo).toLocaleString("id-ID", { minimumFractionDigits: 2 })}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    ))}
                </>
            )}
        </div>
    );
}
