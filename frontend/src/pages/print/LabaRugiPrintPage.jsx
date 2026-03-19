import React, { useEffect, useState } from 'react';
import { parseDate } from '../../lib/utils';
import { Printer } from 'lucide-react';

export function LabaRugiPrintPage() {
    const searchParams = new URLSearchParams(window.location.search);
    const spreadsheetId = searchParams.get("spreadsheetId");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    const [loading, setLoading] = useState(true);
    const [reportData, setReportData] = useState(null);
    const [meta, setMeta] = useState({ companyName: "Loading...", periode: "" });

    useEffect(() => {
        if (!spreadsheetId) return;

        async function fetchData() {
            try {
                // 1. Fetch Master COA to get headinglr & headerlr (Range A-L)
                // Col A=Kode, B=Nama, K=headerlr, L=headinglr
                const coaResp = await fetch(`/sheet/preview?sheet=master_coa&range=A2:L&spreadsheetId=${spreadsheetId}`);
                const coaJson = await coaResp.json();

                // Map Name -> Info
                const nameToInfo = {};
                (coaJson.rows || []).forEach(r => {
                    const name = String(r[1] || "").trim();
                    const headerlr = String(r[10] || "").trim(); // K
                    const headinglr = String(r[11] || "").trim(); // L
                    if (name && headinglr && headerlr) {
                        nameToInfo[name] = { headinglr, headerlr };
                    }
                });

                // 2. Fetch Transactions (Source: full)
                const trxResp = await fetch(`/bukubesar?source=full&spreadsheetId=${spreadsheetId}`);
                const trxJson = await trxResp.json();
                let transactions = Array.isArray(trxJson) ? trxJson : Object.values(trxJson).flat();

                // 3. Filter Date
                if (startDate || endDate) {
                    const start = startDate ? parseDate(startDate) : null;
                    const end = endDate ? parseDate(endDate) : null;
                    transactions = transactions.filter(t => {
                        const d = parseDate(t.Tanggal);
                        if (!d) return false;
                        if (start && d < start) return false;
                        if (end && d > end) return false;
                        return true;
                    });
                }

                // 4. Hitung saldo per akun
                const balances = {}; // Name -> Amount
                transactions.forEach(t => {
                    const name = String(t.COA || "").trim();
                    if (!nameToInfo[name]) return;
                    const debit = Number(t.Debit) || 0;
                    const kredit = Number(t.Kredit) || 0;
                    // Pendapatan (credit normal): saldo += kredit - debit, selain itu saldo += debit - kredit
                    if (!balances[name]) balances[name] = 0;
                    if (nameToInfo[name].headinglr.toLowerCase().includes("pendapatan")) {
                        balances[name] += (kredit - debit);
                    } else {
                        balances[name] += (debit - kredit);
                    }
                });

                // 5. Grouping: headinglr > headerlr > akun
                const report = {};
                Object.keys(nameToInfo).forEach(name => {
                    const { headinglr, headerlr } = nameToInfo[name];
                    const amount = balances[name] || 0;
                    if (amount === 0) return;
                    if (!report[headinglr]) report[headinglr] = {};
                    if (!report[headinglr][headerlr]) report[headinglr][headerlr] = [];
                    report[headinglr][headerlr].push({ name, amount });
                });

                // 6. Hitung total per subhead dan head
                const reportArr = [];
                let totalPendapatan = 0;
                let totalBiaya = 0;
                Object.keys(report).forEach(heading => {
                    const subheads = report[heading];
                    let headTotal = 0;
                    const subArr = [];
                    Object.keys(subheads).forEach(sub => {
                        const items = subheads[sub];
                        let subTotal = 0;
                        items.forEach(item => { subTotal += item.amount; });
                        headTotal += subTotal;
                        subArr.push({ sub, items, subTotal });
                    });
                    reportArr.push({ heading, subArr, headTotal });
                    if (heading.toLowerCase().includes("pendapatan")) totalPendapatan += headTotal;
                    if (heading.toLowerCase().includes("biaya")) totalBiaya += headTotal;
                });

                setReportData(reportArr);
                const netIncome = totalPendapatan - totalBiaya;
                setMeta({
                    companyName: coaJson.companyName || "MY COMPANY",
                    periode: `${startDate || '-'} s/d ${endDate || '-'}`,
                    netIncome
                });

                // Set global for NeracaPrintPage sync
                if (typeof window !== 'undefined') {
                    window.labaRugiNetIncome = netIncome;
                }

                setLoading(false);
                setTimeout(() => {
                    window.reportReady = true;
                }, 500);
            } catch (error) {
                console.error(error);
                setLoading(false);
            }
        }
        fetchData();
    }, [spreadsheetId, startDate, endDate]);

    if (loading) return <div>Loading...</div>;

    const fmt = (n) => Number(n).toLocaleString('id-ID', { minimumFractionDigits: 2 });

    return (
        <div className="report-print-container">
            <div className="acc-header">
                <h1>{meta.companyName}</h1>
                <div style={{ fontSize: '14pt', fontWeight: 'bold', margin: '10px 0' }}>LAPORAN LABA RUGI</div>
                <div className="acc-meta" style={{ justifyContent: 'center' }}>
                    Periode: {meta.periode}
                </div>
            </div>
            <table className="acc-table" style={{ marginTop: '20px' }}>
                <thead>
                    <tr>
                        <th style={{ textAlign: 'left', width: '60%' }}>Keterangan</th>
                        <th style={{ textAlign: 'right', width: '20%' }}>Nominal</th>
                        <th style={{ textAlign: 'right', width: '20%' }}>Total</th>
                    </tr>
                </thead>
                <tbody>
                    {reportData && reportData.map((head, idx) => (
                        <React.Fragment key={idx}>
                            <tr>
                                <td colSpan={3} style={{ fontWeight: 'bold', background: '#f9f9f9', padding: '8px 4px' }}>{head.heading}</td>
                            </tr>
                            {head.subArr.map((sub, sidx) => (
                                <React.Fragment key={sidx}>
                                    <tr>
                                        <td colSpan={3} style={{ fontWeight: 'bold', background: '#f1f5f9', padding: '6px 4px' }}>{sub.sub}</td>
                                    </tr>
                                    {sub.items.map((item, i) => (
                                        <tr key={i}>
                                            <td style={{ paddingLeft: '32px' }}>{item.name}</td>
                                            <td className="num">{fmt(item.amount)}</td>
                                            <td></td>
                                        </tr>
                                    ))}
                                    <tr style={{ fontWeight: 'bold' }}>
                                        <td style={{ textAlign: 'right' }}>Total {sub.sub}</td>
                                        <td></td>
                                        <td className="num" style={{ borderTop: '1px solid #000' }}>{fmt(sub.subTotal)}</td>
                                    </tr>
                                    <tr><td colSpan={3} style={{ border: 'none', height: '6px' }}></td></tr>
                                </React.Fragment>
                            ))}
                            <tr style={{ fontWeight: 'bold', background: '#e2e8f0' }}>
                                <td style={{ textAlign: 'right' }}>Total {head.heading}</td>
                                <td></td>
                                <td className="num" style={{ borderTop: '2px solid #000' }}>{fmt(head.headTotal)}</td>
                            </tr>
                            <tr><td colSpan={3} style={{ border: 'none', height: '10px' }}></td></tr>
                        </React.Fragment>
                    ))}
                    <tr className="acc-grandtotal" style={{ fontSize: '11pt' }}>
                        <td className="label">LABA / (RUGI) BERSIH</td>
                        <td></td>
                        <td className="num">{fmt(meta.netIncome)}</td>
                    </tr>
                </tbody>
            </table>
        </div>
    );
}
