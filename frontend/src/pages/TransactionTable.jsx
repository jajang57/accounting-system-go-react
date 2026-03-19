import React, { useState, useMemo } from 'react';
import { ChevronDown, ChevronRight, Edit2, Trash2, Plus } from 'lucide-react';

export function TransactionTable({
    rows,
    headerRow,
    dataRowNumbers,
    onEditGroup,
    onDeleteGroup
}) {
    const [expandedGroups, setExpandedGroups] = useState(new Set());

    // Helper to find column index by name
    const getColIdx = (name) => {
        if (!headerRow) return -1;
        const n = name.toUpperCase().replace(/[^A-Z0-9]/g, "");

        // Exact match prioritized
        const exact = headerRow.findIndex(h => {
            const hUp = String(h).toUpperCase().replace(/[^A-Z0-9]/g, "");
            return hUp === n;
        });
        if (exact !== -1) return exact;

        // Smart match for common aliases
        return headerRow.findIndex(h => {
            const hUp = String(h).toUpperCase().replace(/[^A-Z0-9]/g, "");
            // Avoid "PPH" matching "COAPPH" if target is just "PPH"
            if (n === "PPH") return hUp === "PPH" || hUp === "PAJAKPPH";
            if (n === "ITEM") return hUp === "ITEM" || hUp === "ITEMBARANG" || hUp === "NAMAITEM";
            return hUp.includes(n);
        });
    };

    // Identify Key Columns
    const noBuktiIdx = getColIdx("NOBUKTI");
    const dateIdx = getColIdx("TANGGAL");
    const customerIdx = getColIdx("CUSTOMER");
    const parseNum = (v) => {
        if (!v) return 0;
        const s = String(v).trim().replace(/[^\d,\.-]/g, '');
        if (!s) return 0;
        // Handle ID-ID format: 1.234,56 -> 1234.56
        const normalized = s.replace(/\./g, "").replace(",", ".");
        const n = parseFloat(normalized);
        return isNaN(n) ? 0 : n;
    };

    const getVal = (row, name) => {
        const i = getColIdx(name);
        return i !== -1 ? row[i] : "";
    };



    // Grouping Logic
    const groups = useMemo(() => {
        if (noBuktiIdx === -1) return [];

        const grouping = [];
        let currentGroup = null;

        rows.forEach((row, index) => {
            const noBukti = String(row[noBuktiIdx] || "").trim();

            if (!currentGroup || currentGroup.key !== noBukti) {
                if (currentGroup) grouping.push(currentGroup);
                currentGroup = {
                    key: noBukti,
                    rows: [],
                    indices: [],
                    date: dateIdx !== -1 ? row[dateIdx] : "",
                    customer: customerIdx !== -1 ? row[customerIdx] : "",
                    total: 0
                };
            }

            currentGroup.rows.push(row);
            currentGroup.indices.push(index);

            // Accumulate Best Total (Subtotal > Total Masuk > Total)
            const rowTotal = parseNum(getVal(row, "SUBTOTAL") || getVal(row, "TOTALMASUK") || getVal(row, "TOTAL"));
            currentGroup.total += rowTotal;
        });

        if (currentGroup) grouping.push(currentGroup);
        return grouping;
    }, [rows, headerRow, noBuktiIdx, dateIdx, customerIdx]);

    const toggleGroup = (key) => {
        const next = new Set(expandedGroups);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        setExpandedGroups(next);
    };

    if (noBuktiIdx === -1) {
        return <div className="p-4 text-red-500">Error: Kolom 'No Bukti' tidak ditemukan. Tidak dapat menampilkan mode transaksi.</div>;
    }

    return (
        <div className="w-full">
            <table className="w-full border-collapse text-sm">
                <thead className="bg-slate-100 text-xs uppercase font-bold !text-slate-900 border-b border-slate-200">
                    <tr>
                        <th className="p-3 text-left w-10"></th>
                        <th className="p-3 text-left">No Bukti</th>
                        <th className="p-3 text-left">Tanggal</th>
                        <th className="p-3 text-left">Customer</th>
                        <th className="p-3 text-right">Total Transaksi</th>
                        <th className="p-3 text-center">Aksi</th>
                    </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-100">
                    {groups.map(group => {
                        const isExpanded = expandedGroups.has(group.key);
                        return (
                            <React.Fragment key={group.key}>
                                {/* MASTER ROW */}
                                <tr className={`hover:bg-blue-50 transition-colors cursor-pointer ${isExpanded ? 'bg-blue-50' : ''}`}
                                    onClick={() => toggleGroup(group.key)}>
                                    <td className="p-3 text-center">
                                        <button className="text-slate-500 hover:text-blue-600 focus:outline-none">
                                            {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                                        </button>
                                    </td>
                                    <td className="p-3 font-medium text-slate-800">{group.key}</td>
                                    <td className="p-3 text-slate-600">{group.date}</td>
                                    <td className="p-3 text-slate-600">{group.customer}</td>
                                    <td className="p-3 text-right font-mono font-bold text-blue-600">
                                        Rp {group.total.toLocaleString('id-ID')}
                                    </td>
                                    <td className="p-3 text-center">
                                        <div className="flex justify-center gap-2">
                                            <button
                                                onClick={(e) => { e.stopPropagation(); onEditGroup(group); }}
                                                className="p-1.5 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors"
                                                title="Edit Transaksi"
                                            >
                                                <Edit2 size={16} />
                                            </button>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); onDeleteGroup(group); }}
                                                className="p-1.5 text-red-600 hover:bg-red-100 rounded-lg transition-colors"
                                                title="Hapus Transaksi"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>

                                {/* DETAIL ROWS (EXPANDED) */}
                                {isExpanded && (
                                    <tr>
                                        <td colSpan={6} className="p-0 border-b border-blue-100 bg-slate-50">
                                            <div className="p-4 pl-12">
                                                <table className="w-full text-xs border border-slate-200 rounded-lg overflow-hidden bg-white shadow-sm">
                                                    <thead className="bg-slate-100 !text-slate-900 font-semibold border-b border-slate-200">
                                                        <tr>
                                                            <th className="p-2 text-left">Item Barang</th>
                                                            <th className="p-2 text-right">Qty</th>
                                                            <th className="p-2 text-right">Harga</th>
                                                            <th className="p-2 text-right">Total</th>
                                                            <th className="p-2 text-right">DPP</th>
                                                            <th className="p-2 text-right">PPN</th>
                                                            <th className="p-2 text-left">COA PPH</th>
                                                            <th className="p-2 text-right">PPH</th>
                                                            <th className="p-2 text-right">Subtotal</th>
                                                            <th className="p-2 text-left">COA HPP</th>
                                                            <th className="p-2 text-left">COA Persediaan</th>
                                                            <th className="p-2 text-right">HPP</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-slate-100">
                                                        {group.rows.map((row, rIdx) => {
                                                            const val = (name) => {
                                                                const i = getColIdx(name);
                                                                return i !== -1 ? row[i] : "";
                                                            };
                                                            return (
                                                                <tr key={rIdx} className="hover:bg-slate-50">
                                                                    <td className="p-2">{val("ITEM") || val("BARANG") || "-"}</td>
                                                                    <td className="p-2 text-right font-mono">{val("QTY")}</td>
                                                                    <td className="p-2 text-right font-mono">{val("HARGA")}</td>
                                                                    <td className="p-2 text-right font-mono">{val("TOTAL")}</td>
                                                                    <td className="p-2 text-right font-mono">{val("DPP")}</td>
                                                                    <td className="p-2 text-right font-mono">{val("PPN")}</td>
                                                                    <td className="p-2 text-left whitespace-nowrap">{val("COAPPH") || "-"}</td>
                                                                    <td className="p-2 text-right font-mono">{val("PPH") || "0"}</td>
                                                                    <td className="p-2 text-right font-mono font-bold">{val("SUBTOTAL") || val("TOTAL_MASUK") || "0"}</td>
                                                                    <td className="p-2 text-left whitespace-nowrap">{val("COAHPP") || "-"}</td>
                                                                    <td className="p-2 text-left whitespace-nowrap">{val("COAPERSEDIAAN") || "-"}</td>
                                                                    <td className="p-2 text-right font-mono">{val("HPP") || "0"}</td>
                                                                </tr>
                                                            );
                                                        })}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </React.Fragment>
                        );
                    })}
                    {groups.length === 0 && (
                        <tr>
                            <td colSpan={6} className="p-8 text-center text-slate-500 italic">
                                Belum ada data transaksi.
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    );
}
