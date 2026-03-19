import React, { useEffect, useState } from 'react';
import { parseDate, hitungNetIncome } from '../../lib/utils';
import { Printer } from 'lucide-react';

export function NeracaPrintPage() {
    const searchParams = new URLSearchParams(window.location.search);
    const spreadsheetId = searchParams.get("spreadsheetId");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    const [loading, setLoading] = useState(true);
    const [reportData, setReportData] = useState({ left: [], right: [] }); // Assets vs Liab+Equity
    const [totals, setTotals] = useState({ left: 0, right: 0 });
    const [meta, setMeta] = useState({ companyName: "Loading...", periode: "" });

    useEffect(() => {
        if (!spreadsheetId) return;

        async function fetchData() {
            try {
                // 1. Fetch Master COA to get HeaderNRC (Range A-L)
                const coaResp = await fetch(`/sheet/preview?sheet=master_coa&range=A2:L&spreadsheetId=${spreadsheetId}`);
                const coaJson = await coaResp.json();

                // Moved mapping to Step 4 (Initialization with Saldo Awal)

                // 2. Fetch Transactions
                const trxResp = await fetch(`/bukubesar?source=full&spreadsheetId=${spreadsheetId}`);
                const trxJson = await trxResp.json();
                let transactions = Array.isArray(trxJson) ? trxJson : Object.values(trxJson).flat();

                // 3. Filter Date
                // Neraca is "As of Date" (Saldo per tanggal), usually derived from ALL transactions up to endDate.
                // If startDate is provided, it might mean "Movement", but usually Neraca is cumulative.
                // We will assume "Balance Sheet as of <endDate>".
                const end = endDate ? parseDate(endDate) : new Date(); // Default to today if null?

                transactions = transactions.filter(t => {
                    const d = parseDate(t.Tanggal);
                    if (!d) return false;
                    return d <= end;
                });

                // 2b. Initialize Balances with Opening Balance
                const balances = {};
                const lrBalances = {}; // For Net Income Calc

                // Let's rebuild nameToInfo to include Saldo Awal
                const coaRows = coaJson.rows || [];
                const accountDetails = {}; // name -> { headerNRC, headerLR, saldoAwal }

                coaRows.forEach(r => {
                    const name = String(r[1] || "").trim();
                    if (!name) return;

                    // Column H is Index 7
                    let rawSaldo = r[7];
                    if (typeof rawSaldo === 'string') {
                        rawSaldo = Number(rawSaldo.replace(/\./g, "").replace(",", ".")) || 0;
                    } else {
                        rawSaldo = Number(rawSaldo) || 0;
                    }

                    accountDetails[name] = {
                        headerNRC: String(r[8] || "").trim(),
                        headingNRC: String(r[9] || "").trim(),
                        headerLR: String(r[10] || "").trim(),
                        headingLR: String(r[11] || "").trim(),
                        saldoAwal: rawSaldo
                    };
                });

                // Initialize balances with Saldo Awal
                // IMPORTANT: We assume Saldo Awal is already "Net" (Debit - Credit) based on normal balance?
                // Or is it always Positive and we determine sign?
                // Usually in simple systems, Saldo Awal is just a number.
                // WE MUST KNOW if it's Debit or Credit.
                // Heuristic: Assets/Exp = Debit (+), Liab/Eq/Rev = Credit (-)?
                // Let's perform the same grouping check to assign sign to Saldo Awal.

                Object.keys(accountDetails).forEach(name => {
                    balances[name] = 0; // Start at 0, add Saldo Awal later per group logic?
                    // No, we should add it now.

                    const det = accountDetails[name];

                    // Determine if this account is Asset/Expense (Debit Normal) or Liab/Equity/Income (Credit Normal)
                    // We use HeaderLR and HeaderNRC to guess used for Grouping, but for Balance Calc we align with Buku Besar (Additive).

                    // In Buku Besar (ReportsPage.jsx), Saldo Awal is simply added: saldo += saldoAwal.
                    // Then transactions are: saldo += Debit - Kredit.
                    // This creates a "Debit-based" balance.

                    balances[name] += det.saldoAwal;
                    lrBalances[name] = (lrBalances[name] || 0) + det.saldoAwal;
                });

                transactions.forEach(t => {
                    const name = String(t.COA || "").trim();
                    if (!accountDetails[name]) return;

                    const debit = Number(t.Debit) || 0;
                    const kredit = Number(t.Kredit) || 0;
                    const headingnrc = String(accountDetails[name].headingNRC || "").trim().toLowerCase();
                    const headinglr = String(accountDetails[name].headingLR || "").trim().toLowerCase();
                    console.log(headingnrc, headinglr);
                    // Terapkan logika saldo sesuai Buku Besar
                    if (headingnrc === "pasiva") {
                        balances[name] += kredit - debit;
                        lrBalances[name] += kredit - debit;
                    } else if (headinglr === "pendapatan") {
                        balances[name] += kredit - debit;
                        lrBalances[name] += kredit - debit;
                    } else {
                        balances[name] += debit - kredit;
                        lrBalances[name] += debit - kredit;
                    }
                });

                // 5. Calculate Net Income (Laba Rugi Tahun Berjalan) for Equity
                // Hitung langsung dengan fungsi util agar konsisten dengan LabaRugiPrintPage
                const netIncome = hitungNetIncome(transactions, coaRows);
                console.log('DEBUG NERACA: netIncome (hitungNetIncome) =', netIncome);

                // 6. Grouping for Neraca
                const groups = {};

                Object.keys(accountDetails).forEach(name => {
                    const info = accountDetails[name];
                    if (!info.headerNRC) return; // Not a Neraca account

                    // Skip zero ?
                    const rawBalance = balances[name] || 0;
                    if (rawBalance === 0) return;

                    const groupName = info.headerNRC;

                    const gUp = groupName.toUpperCase();
                    let isAsset = gUp.includes("ASET") || gUp.includes("HARTA") || gUp.includes("AKTIVA") || gUp.includes("KAS") || gUp.includes("PIUTANG") || gUp.includes("PERSEDIAAN") || gUp.includes("BANK");

                    // Tampilkan amount apa adanya, tidak dibalik
                    let amount = rawBalance;

                    // Add to group
                    if (!groups[groupName]) {
                        groups[groupName] = { name: groupName, total: 0, items: [], type: isAsset ? 'asset' : 'liab' };
                    }
                    groups[groupName].items.push({ name, amount });
                    groups[groupName].total += amount;
                });

                // 7. Inject Net Income into Equity (Modal)
                // Find a group like "MODAL" or "EKUITAS"
                let equityKey = Object.keys(groups).find(k => k.toUpperCase().includes("MODAL") || k.toUpperCase().includes("EKUITAS"));
                if (!equityKey && netIncome !== 0) {
                    // Create if not exists
                    equityKey = "EKUITAS";
                    groups[equityKey] = { name: "EKUITAS", total: 0, items: [], type: 'liab' };
                }

                if (equityKey && netIncome !== 0) {
                    groups[equityKey].items.push({ name: "Laba/Rugi Tahun Berjalan", amount: netIncome });
                    groups[equityKey].total += netIncome;
                }

                // Split Left (Assets) and Right (Liab + Equity)
                const leftGroups = [];
                const rightGroups = [];
                let totalLeft = 0;
                let totalRight = 0;

                Object.values(groups).forEach(g => {
                    if (g.type === 'asset') {
                        leftGroups.push(g);
                        totalLeft += g.total;
                    } else {
                        rightGroups.push(g);
                        totalRight += g.total;
                    }
                });

                // Sort groups by name or standard?
                leftGroups.sort((a, b) => a.name.localeCompare(b.name));
                rightGroups.sort((a, b) => a.name.localeCompare(b.name));

                setReportData({ left: leftGroups, right: rightGroups });
                setTotals({ left: totalLeft, right: totalRight });

                setMeta({
                    companyName: coaJson.companyName || "MY COMPANY",
                    periode: endDate ? `Per ${endDate}` : "Semua Periode"
                });

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
    }, [spreadsheetId, endDate]);

    if (loading) return <div>Loading...</div>;

    const fmt = (n) => Number(n).toLocaleString('id-ID', { minimumFractionDigits: 2 });

    return (
        <div className="report-print-container">
            <div className="acc-header">
                <h1>{meta.companyName}</h1>
                <div style={{ fontSize: '14pt', fontWeight: 'bold', margin: '10px 0' }}>LAPORAN NERACA (BALANCE SHEET)</div>
                <div className="acc-meta" style={{ justifyContent: 'center' }}>
                    {meta.periode}
                </div>
            </div>

            {/* Split layout: Assets (Left) | Liab+Equity (Right) */}
            <div style={{ display: 'flex', gap: '20px', marginTop: '20px' }}>
                {/* LEFT SIDE: ASSETS */}
                <div style={{ flex: 1 }}>
                    <table className="acc-table">
                        <thead>
                            <tr>
                                <th style={{ width: '60%', textAlign: 'left' }}>ASET (AKTIVA)</th>
                                <th style={{ width: '40%', textAlign: 'right' }}>Nilai</th>
                            </tr>
                        </thead>
                        <tbody>
                            {reportData.left.map((group, idx) => (
                                <React.Fragment key={idx}>
                                    <tr>
                                        <td colSpan={2} style={{ fontWeight: 'bold', background: '#f9f9f9', padding: '6px' }}>{group.name}</td>
                                    </tr>
                                    {group.items.map((item, i) => (
                                        <tr key={i}>
                                            <td style={{ paddingLeft: '20px' }}>{item.name}</td>
                                            <td className="num">{fmt(item.amount)}</td>
                                        </tr>
                                    ))}
                                    <tr style={{ fontWeight: 'bold' }}>
                                        <td style={{ textAlign: 'right' }}>Total {group.name}</td>
                                        <td className="num" style={{ borderTop: '1px solid #000' }}>{fmt(group.total)}</td>
                                    </tr>
                                    <tr><td colSpan={2} style={{ border: 'none', height: '10px' }}></td></tr>
                                </React.Fragment>
                            ))}
                            {/* Grand Total Left */}
                            <tr className="acc-grandtotal" style={{ fontSize: '10pt', background: '#eee' }}>
                                <td className="label">TOTAL ASET</td>
                                <td className="num">{fmt(totals.left)}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                {/* RIGHT SIDE: LIABILITIES + EQUITY */}
                <div style={{ flex: 1 }}>
                    <table className="acc-table">
                        <thead>
                            <tr>
                                <th style={{ width: '60%', textAlign: 'left' }}>KEWAJIBAN & EKUITAS</th>
                                <th style={{ width: '40%', textAlign: 'right' }}>Nilai</th>
                            </tr>
                        </thead>
                        <tbody>
                            {reportData.right.map((group, idx) => (
                                <React.Fragment key={idx}>
                                    <tr>
                                        <td colSpan={2} style={{ fontWeight: 'bold', background: '#f9f9f9', padding: '6px' }}>{group.name}</td>
                                    </tr>
                                    {group.items.map((item, i) => (
                                        <tr key={i}>
                                            <td style={{ paddingLeft: '20px' }}>{item.name}</td>
                                            <td className="num">{fmt(item.amount)}</td>
                                        </tr>
                                    ))}
                                    <tr style={{ fontWeight: 'bold' }}>
                                        <td style={{ textAlign: 'right' }}>Total {group.name}</td>
                                        <td className="num" style={{ borderTop: '1px solid #000' }}>{fmt(group.total)}</td>
                                    </tr>
                                    <tr><td colSpan={2} style={{ border: 'none', height: '10px' }}></td></tr>
                                </React.Fragment>
                            ))}
                            {/* Grand Total Right */}
                            <tr className="acc-grandtotal" style={{ fontSize: '10pt', background: '#eee' }}>
                                <td className="label">TOTAL KEWAJIBAN & EKUITAS</td>
                                <td className="num">{fmt(totals.right)}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
