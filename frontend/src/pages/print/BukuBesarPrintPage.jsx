import React, { useState, useEffect, useMemo } from 'react';
import { API } from '../../lib/api';
import { useFetchJson } from '../../hooks/useFetchJson';
import { flatten, parseDate, toNumber, fmt } from '../../lib/utils';
import { Printer } from 'lucide-react';

export function BukuBesarPrintPage() {
    const query = new URLSearchParams(window.location.search);
    const spreadsheetId = query.get("spreadsheetId");
    const source = query.get("source") || "full";
    const startDate = query.get("startDate");
    const endDate = query.get("endDate");
    const coaFilter = query.get("coa") || "";

    const { loading: l1, error: e1, data: glData } = useFetchJson(API.gl(source, spreadsheetId));
    const { loading: l2, error: e2, data: coaData } = useFetchJson(API.sheetPreview("master_coa", spreadsheetId, "B2:H"));

    const [processedData, setProcessedData] = useState([]);
    const [isReady, setIsReady] = useState(false);
    const [statusMsg, setStatusMsg] = useState("Initializing Report...");

    useEffect(() => {
        if (l1 || l2) {
            setStatusMsg("Loading Data...");
            return;
        }
        if (e1 || e2) {
            setStatusMsg("Error loading data.");
            return;
        }
        if (!glData && !coaData) return;

        setStatusMsg("Processing...");

        try {
            const rowsCoa = (coaData && Array.isArray(coaData.rows)) ? coaData.rows : [];
            const allRows = glData ? flatten(glData) : [];

            let targetCoas = [];
            if (coaFilter) {
                targetCoas = coaFilter.split(",").map(s => s.trim()).filter(Boolean);
            } else {
                targetCoas = rowsCoa.map(r => String(r?.[0] || "").trim()).filter(Boolean);
            }

            const fDate = parseDate(startDate);
            const tDate = parseDate(endDate);
            const groups = [];

            targetCoas.forEach(coaVal => {
                let saldo = 0;
                const foundCoa = rowsCoa.find(r => String(r?.[0] || "").trim().toLowerCase() === coaVal.toLowerCase());
                if (foundCoa) {
                    const rawBal = String(foundCoa[6] || "0");
                    const cleanBal = rawBal.replace(/\./g, "").replace(",", ".");
                    saldo = Number(cleanBal) || 0;
                }

                let trxRows = allRows.filter(row => String(row.COA || "").trim().toLowerCase() === coaVal.toLowerCase());
                trxRows.sort((a, b) => {
                    const da = parseDate(a.Tanggal);
                    const db = parseDate(b.Tanggal);
                    if (!da && !db) return 0;
                    if (!da) return 1;
                    if (!db) return -1;
                    return da - db;
                });

                const mutasiDalam = [];
                trxRows.forEach(row => {
                    const tgl = parseDate(row.Tanggal);
                    const deb = toNumber(row.Debit);
                    const kre = toNumber(row.Kredit);

                    if (fDate && tgl && tgl < fDate) {
                        saldo += (deb - kre);
                    } else if (tDate && tgl && tgl > tDate) {
                        // skip
                    } else {
                        mutasiDalam.push(row);
                    }
                });

                const groupRows = [];
                let totalDebit = 0;
                let totalKredit = 0;

                function toDDMMYYYY(d) {
                    if (!d) return "";
                    if (typeof d === 'string') return d;
                    const dd = String(d.getDate()).padStart(2, '0');
                    const mm = String(d.getMonth() + 1).padStart(2, '0');
                    const yyyy = d.getFullYear();
                    return `${dd}/${mm}/${yyyy}`;
                }

                if (mutasiDalam.length > 0) {
                    const openingDateStr = startDate ? toDDMMYYYY(fDate) : (mutasiDalam[0] ? mutasiDalam[0].Tanggal : "-");
                    groupRows.push({
                        Tanggal: openingDateStr,
                        NoBukti: "",
                        Keterangan: "Opening Balance",
                        CustVendor: "",
                        Debit: 0,
                        Kredit: 0,
                        Saldo: saldo,
                        isOpening: true
                    });

                    mutasiDalam.forEach(row => {
                        const deb = toNumber(row.Debit);
                        const kre = toNumber(row.Kredit);
                        saldo += (deb - kre);
                        totalDebit += deb;
                        totalKredit += kre;

                        groupRows.push({
                            Tanggal: row.Tanggal,
                            NoBukti: row.NoBukti,
                            Keterangan: row.Keterangan,
                            CustVendor: row.CustVendor,
                            Debit: deb,
                            Kredit: kre,
                            Saldo: saldo
                        });
                    });

                    groups.push({
                        coa: foundCoa ? String(foundCoa[0]) : coaVal,
                        rows: groupRows,
                        totalDebit,
                        totalKredit
                    });
                }
            });

            groups.sort((a, b) => a.coa.localeCompare(b.coa));
            setProcessedData(groups);
            setStatusMsg("");

            setTimeout(() => {
                window.reportReady = true;
                setIsReady(true);
            }, 500);

        } catch (e) {
            console.error(e);
            setStatusMsg("Error processing report.");
        }
    }, [l1, l2, e1, e2, glData, coaData, startDate, endDate, coaFilter]);

    if (statusMsg) {
        return <div style={{ padding: 20, textAlign: 'center' }}>{statusMsg}</div>;
    }

    return (
        <div className={`report-print-container ${isReady ? 'report-ready' : ''}`}>
            {/* Print Button Wrapper */}
            <div className="no-print" style={{ position: 'fixed', top: 20, right: 20, zIndex: 999 }}>
                <button
                    onClick={() => window.print()}
                    style={{
                        padding: '8px 16px',
                        background: '#2563eb',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontWeight: 'bold',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        boxShadow: '0 2px 5px rgba(0,0,0,0.2)'
                    }}>
                    <Printer size={16} /> Print PDF
                </button>
            </div>

            <div className="acc-header">
                <h1>BUKU BESAR</h1>
                <div className="acc-meta">
                    <div><strong>Periode:</strong> {startDate || "-"} s/d {endDate || "-"}</div>
                    <div style={{ textAlign: 'right' }}>
                        <div><strong>Tanggal Cetak:</strong> {new Date().toLocaleDateString("id-ID")}</div>
                        <div><strong>Source:</strong> {source}</div>
                    </div>
                </div>
            </div>

            {processedData.length === 0 && (
                <div className="acc-empty-msg">Tidak ada data transaksi untuk filter ini.</div>
            )}

            {processedData.map((group, idx) => (
                <div key={idx} className="acc-report">
                    <div className="acc-section-title">Akun: {group.coa}</div>
                    <table className="acc-table" style={{ width: '100%' }}>
                        <thead>
                            <tr>
                                <th style={{ width: '9%' }}>Tanggal</th>
                                <th style={{ width: '13%' }}>No. Bukti</th>
                                <th style={{ width: '25%' }}>Keterangan</th>
                                <th style={{ width: '10%' }}>Ven/Cust</th>
                                <th style={{ width: '14%' }}>Debit</th>
                                <th style={{ width: '14%' }}>Kredit</th>
                                <th style={{ width: '15%' }}>Saldo</th>
                            </tr>
                        </thead>
                        <tbody>
                            {group.rows.map((row, rIdx) => (
                                <tr key={rIdx} style={row.isOpening ? { fontStyle: 'italic', background: '#fcfcfc' } : {}}>
                                    <td className="center nowrap">{row.Tanggal}</td>
                                    <td className="nowrap">{row.NoBukti}</td>
                                    <td>{row.Keterangan}</td>
                                    <td>{row.CustVendor}</td>
                                    <td className="num">{fmt(row.Debit)}</td>
                                    <td className="num">{fmt(row.Kredit)}</td>
                                    <td className="num">{fmt(row.Saldo)}</td>
                                </tr>
                            ))}
                            <tr className="acc-subtotal">
                                <td colSpan={4} className="num">Total Pergerakan {group.coa}</td>
                                <td className="num">{fmt(group.totalDebit)}</td>
                                <td className="num">{fmt(group.totalKredit)}</td>
                                <td className="num"></td>
                            </tr>
                            <tr className="acc-grandtotal">
                                <td colSpan={6} className="num label">Saldo Akhir {group.coa}</td>
                                <td className="num value">{fmt(group.rows.length > 0 ? group.rows[group.rows.length - 1].Saldo : 0)}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            ))}
        </div>
    );
}
