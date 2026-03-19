import React, { useState, useEffect, useMemo } from 'react';
import { DetailItemTable } from './DetailItemTable';
import { FooterSummary } from './FooterSummary';
import { TransactionTable } from './TransactionTable';
import { useFetchJson } from '../hooks/useFetchJson';
import { API } from '../lib/api';
import { parseIDNumber, formatIDNumber, toSheetDate, toDisplayDateInput, deriveNextNoUrut, deriveNextNoBukti } from '../lib/utils';

export function EditableSheetPage({ sheetName, spreadsheetId, title }) {
    const INVOICE_PAGE_SIZE = 50;
    const [reloadKey, setReloadKey] = useState(0);
    const [colFilters, setColFilters] = useState(Array.from({ length: 13 }, () => ""));
    const [activeFilterCol, setActiveFilterCol] = useState(-1);
    const [editingRowIndex, setEditingRowIndex] = useState(-1);
    const [editingValues, setEditingValues] = useState(Array.from({ length: 13 }, () => ""));
    const [isAddingRow, setIsAddingRow] = useState(false);
    const [coaOptions, setCoaOptions] = useState([]);
    const [globalOptions, setGlobalOptions] = useState({ customers: [], items: [] });
    const [saveStatus, setSaveStatus] = useState("");

    // Pagination State
    const [page, setPage] = useState(1);
    const [totalRows, setTotalRows] = useState(0);
    const [invoiceRanges, setInvoiceRanges] = useState([]);
    const [headerValues, setHeaderValues] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [rows, setRows] = useState([]);
    const [rowNumbers, setRowNumbers] = useState([]);

    // 1. Fetch Metadata & Header on Mount (or Sheet Change)
    useEffect(() => {
        let alive = true;
        setLoading(true);
        setError("");

        const fetchInit = async () => {
            try {
                // A. Fetch Header (Row 4)
                const headerRes = await fetch(API.sheetPreview(sheetName, spreadsheetId, "A4:Z4"));
                if (!headerRes.ok) throw new Error("Gagal mengambil header");
                const headerData = await headerRes.json();
                const hRow = (headerData.rows && headerData.rows.length > 0) ? headerData.rows[0] : [];

                if (!alive) return;
                setHeaderValues(hRow);

                // B. Fetch Metadata for Total Rows
                const metaRes = await fetch(API.sheets(spreadsheetId));
                if (!metaRes.ok) throw new Error("Gagal mengambil metadata");
                const metaList = await metaRes.json();

                // Case-insensitive match to be safe
                const meta = metaList.find(s => (s.title || "").toLowerCase() === (sheetName || "").toLowerCase());
                const tRows = meta ? (meta.rowCount || 0) : 0;
                console.log("DEBUG METADATA:", { sheetName, tRows, metaList });

                if (!alive) return;
                setTotalRows(tRows);

            } catch (err) {
                console.error("Init fetch failed", err);
                if (alive) setError(err.message || "Gagal memuat data awal");
            }
        };

        fetchInit();
        return () => { alive = false; };
    }, [sheetName, spreadsheetId]);

    // Build invoice ranges (start/end row) grouped by No. Bukti so we can paginate per invoice
    useEffect(() => {
        let alive = true;

        const loadInvoiceRanges = async () => {
            if (!sheetName || !spreadsheetId) return;
            try {
                const range = "B5:B";
                const res = await fetch(API.sheetPreview(sheetName, spreadsheetId, range));
                if (!res.ok) throw new Error("Gagal mengambil daftar invoice");
                const data = await res.json();
                const cols = data.rows || [];
                const rowNums = data.rowNumbers || [];
                const ranges = [];

                cols.forEach((row, idx) => {
                    const invoiceNo = String(row?.[0] || "").trim();
                    const rowNumber = rowNums[idx];
                    if (!rowNumber) return;

                    if (!invoiceNo) {
                        if (ranges.length) {
                            ranges[ranges.length - 1].endRow = rowNumber;
                        }
                        return;
                    }

                    const lastRange = ranges[ranges.length - 1];
                    if (!lastRange || lastRange.value !== invoiceNo) {
                        ranges.push({ value: invoiceNo, startRow: rowNumber, endRow: rowNumber });
                    } else {
                        lastRange.endRow = rowNumber;
                    }
                });

                if (!alive) return;
                setInvoiceRanges(ranges);
                setPage(prev => {
                    const nextPage = Math.max(1, Math.ceil(ranges.length / INVOICE_PAGE_SIZE));
                    return prev === nextPage ? prev : nextPage;
                });
            } catch (err) {
                console.error("Invoice index fetch failed", err);
                if (alive) setError(err.message || "Gagal memuat daftar invoice");
            }
        };

        loadInvoiceRanges();
        return () => { alive = false; };
    }, [sheetName, spreadsheetId, reloadKey]);

    // 2. Fetch Page Data OR Filtered Data
    useEffect(() => {
        if (!headerValues.length) return; // Wait for header

        const hasFilters = colFilters.some(f => f.trim() !== "");
        let alive = true;

        const fetchData = async () => {
            try {
                let d;
                if (hasFilters) {
                    // SERVER-SIDE FILTER
                    if (alive) setLoading(true);
                    const filters = {};
                    colFilters.forEach((val, idx) => {
                        if (val.trim()) filters[String(idx)] = val.trim();
                    });

                    const res = await fetch(API.sheetFilter, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            spreadsheetId,
                            sheet: sheetName,
                            filters
                        })
                    });
                    if (!res.ok) throw new Error("Filter gagal");
                    d = await res.json();
                } else {
                    if (!invoiceRanges.length) {
                        if (alive) {
                            setRows([headerValues]);
                            setRowNumbers([4]);
                        }
                        return;
                    }

                    const startInvoice = (page - 1) * INVOICE_PAGE_SIZE;
                    const pageSlice = invoiceRanges.slice(startInvoice, startInvoice + INVOICE_PAGE_SIZE);
                    if (!pageSlice.length) {
                        if (alive) {
                            setRows([headerValues]);
                            setRowNumbers([4]);
                        }
                        return;
                    }

                    const startRow = pageSlice[0].startRow;
                    const endRow = pageSlice[pageSlice.length - 1].endRow;
                    if (!startRow || !endRow) {
                        if (alive) {
                            setRows([headerValues]);
                            setRowNumbers([4]);
                        }
                        return;
                    }

                    if (alive) setLoading(true);
                    const range = `A${startRow}:Z${endRow}`;
                    const url = API.sheetPreview(sheetName, spreadsheetId, range) + `&_r=${reloadKey}`;
                    const res = await fetch(url);
                    d = await res.json();
                }

                if (!alive || !d) return;

                const fetchedRows = d.rows || [];
                const fetchedNums = d.rowNumbers || [];

                if (hasFilters) {
                    setRows(fetchedRows);
                    setRowNumbers(fetchedNums);
                } else {
                    setRows([headerValues, ...fetchedRows]);
                    setRowNumbers([4, ...fetchedNums]);
                }
            } catch (err) {
                console.error("Fetch failed", err);
                if (alive) setError(err.message || "Gagal memuat data");
            } finally {
                if (alive) setLoading(false);
            }
        };

        // Debounce fetch to avoid rapid requests on filter changes
        const timer = setTimeout(fetchData, 500);

        return () => {
            alive = false;
            clearTimeout(timer);
        };
    }, [page, reloadKey, headerValues, sheetName, spreadsheetId, colFilters, invoiceRanges]);

    /* Consts derived from data */
    const companyName = "Penjualan"; // Simplified, or fetch separately if needed
    const tableName = sheetName || "-";
    const totalInvoices = invoiceRanges.length;
    const invoiceLastPage = Math.max(1, Math.ceil(totalInvoices / INVOICE_PAGE_SIZE));

    useEffect(() => {
        setEditingRowIndex(-1);
        setEditingValues(Array.from({ length: 13 }, () => ""));
        setIsAddingRow(false);
        setSaveStatus("");
        setColFilters(Array.from({ length: 13 }, () => ""));
        setActiveFilterCol(-1);
    }, [sheetName, spreadsheetId]);

    useEffect(() => {
        let alive = true;

        // Fetch Global Options (COA, Customer, Items)
        const loadGlobals = async () => {
            // 1. COA
            try {
                const coaRes = await fetch(API.sheetPreview("master_coa", spreadsheetId, "B2:B"));
                const coaData = coaRes.ok ? await coaRes.json() : null;
                if (alive && coaData?.rows) {
                    setCoaOptions(Array.from(new Set(
                        coaData.rows.map(r => String(r?.[0] || "").trim()).filter(Boolean)
                    )));
                }
            } catch (e) { console.error("COA fetch err", e); }

            // 2. Global Customer & Item Options
            try {
                // We need to fetch from distinct endpoint
                // But we depend on sheetName.
                if (!sheetName) return;

                const distRes = await fetch(API.sheetDistinct, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        spreadsheetId,
                        sheet: sheetName,
                        columns: ["CUSTOMER", "ITEMBARANG"]
                    })
                });

                const distData = distRes.ok ? await distRes.json() : null;
                if (alive && distData) {
                    setGlobalOptions({
                        customers: (distData["CUSTOMER"] || []).sort(),
                        items: (distData["ITEMBARANG"] || []).sort()
                    });
                }

            } catch (e) { console.error("Distinct fetch err", e); }
        };

        loadGlobals();

        return () => { alive = false; };
    }, [spreadsheetId, sheetName, reloadKey]); // Reload when reloadKey changes too? Yes, if data updates.

    const maxCols = useMemo(() => {
        let m = 0;
        rows.forEach(r => { if (r.length > m) m = r.length; });
        return Math.max(m, 13);
    }, [rows]);

    const headerRow = rows.length > 0 ? rows[0] : Array.from({ length: maxCols }, (_, i) => `Col ${i + 1}`);
    const dataRows = rows.length > 1 ? rows.slice(1) : [];
    const dataRowNumbers = rowNumbers.length > 1 ? rowNumbers.slice(1) : [];
    const hasPreviewData = rows.length > 0;

    const { filteredRows, filteredDataRowNumbers } = useMemo(() => {
        const fr = [];
        const frn = [];
        dataRows.forEach((row, idx) => {
            let match = true;
            for (let i = 0; i < maxCols; i++) {
                const q = String(colFilters[i] || "").toLowerCase().trim();
                if (!q) continue;
                const cell = String(row[i] || "").toLowerCase();
                if (!cell.includes(q)) {
                    match = false;
                    break;
                }
            }
            if (match) {
                fr.push(row);
                frn.push(dataRowNumbers[idx]);
            }
        });
        return { filteredRows: fr, filteredDataRowNumbers: frn };
    }, [dataRows, dataRowNumbers, colFilters, maxCols]);

    const [editingGroup, setEditingGroup] = useState([]); // Array of { rowIndex: number, values: array }
    const [pendingDeletes, setPendingDeletes] = useState(new Set()); // Row numbers to be deleted on save

    function startEdit(filteredIndex) {
        const row = filteredRows[filteredIndex] || [];
        const originalIdx = dataRows.findIndex(r => r === row);
        if (originalIdx < 0) return;

        // 1. Identify No. Bukti Column
        const noBuktiIdx = headerRow.findIndex(h => h && h.toUpperCase().replace(/[^A-Z0-9]/g, "").includes("NOBUKTI"));
        if (noBuktiIdx === -1) {
            // Fallback to single row if No Bukti not found
            const values = Array.from({ length: maxCols }, (_, i) => row[i] || "");
            setEditingGroup([{ rowIndex: originalIdx, values }]);
            setEditingValues(values);
        } else {
            // 2. Find ALL rows with same No. Bukti
            const noBukti = row[noBuktiIdx];
            const group = [];
            dataRows.forEach((r, idx) => {
                if (r[noBuktiIdx] === noBukti) {
                    group.push({
                        rowIndex: idx,
                        values: Array.from({ length: maxCols }, (_, i) => r[i] || "")
                    });
                }
            });
            setEditingGroup(group);
            // Open modal with the first row's values (for header info)
            setEditingValues(group[0].values);
        }

        setEditingRowIndex(originalIdx); // Keep track of "primary" row for fallback
        setIsAddingRow(false);
        setPendingDeletes(new Set());
    }

    function cancelEdit() {
        setEditingRowIndex(-1);
        setEditingGroup([]);
        setEditingValues(Array.from({ length: maxCols }, () => ""));
        setIsAddingRow(false);
        setPendingDeletes(new Set());
    }

    function handleDeleteItem(index) {
        const item = editingGroup[index];
        if (!item) return;

        if (!window.confirm("Hapus baris item ini?")) return;

        const nextGroup = [...editingGroup];
        nextGroup.splice(index, 1);
        setEditingGroup(nextGroup);

        // If it's an existing row, track it for deletion in Google Sheets
        if (!item.isNew && item.rowIndex !== -1) {
            const rowNum = dataRowNumbers[item.rowIndex];
            if (rowNum) {
                setPendingDeletes(prev => {
                    const next = new Set(prev);
                    next.add(rowNum);
                    return next;
                });
            }
        }
    }

    function recomputeSaldo(values, sourceRows, rowIdxForEdit, addingRow) {
        const next = [...values];
        const dr = parseIDNumber(next[6]);
        const cr = parseIDNumber(next[7]);
        let prevSaldo = 0;
        if (addingRow) {
            const prev = sourceRows[sourceRows.length - 1];
            prevSaldo = parseIDNumber(prev?.[8]);
        } else if (rowIdxForEdit > 0) {
            prevSaldo = parseIDNumber(sourceRows[rowIdxForEdit - 1]?.[8]);
        }
        const saldo = prevSaldo + dr - cr;
        next[8] = formatIDNumber(saldo);
        return next;
    }

    const [pendingAdd, setPendingAdd] = useState(false);

    // Effect to trigger Add Row after auto-navigation to last page
    useEffect(() => {
        if (pendingAdd && !loading && page === invoiceLastPage && rows.length > 0) {
            initiateAddRow();
            setPendingAdd(false);
        }
    }, [pendingAdd, loading, page, invoiceLastPage, rows]);

    function initiateAddRow() {
        const nextNoUrut = deriveNextNoUrut(dataRows);
        const lastNoBukti = dataRows.length > 0 ? String(dataRows[dataRows.length - 1]?.[1] || "") : "";
        const values = Array.from({ length: maxCols }, () => "");
        values[0] = String(nextNoUrut);
        values[1] = deriveNextNoBukti(lastNoBukti, nextNoUrut);
        values[2] = toSheetDate(new Date());
        const withSaldo = recomputeSaldo(values, dataRows, -1, true);

        setEditingValues(withSaldo);
        setEditingGroup([{ rowIndex: -1, values: withSaldo, isNew: true }]);
        setEditingRowIndex(-1);
        setIsAddingRow(true);
    }

    function startAddRow() {
        if (page !== invoiceLastPage) {
            setPage(invoiceLastPage);
            setPendingAdd(true);
            return;
        }
        initiateAddRow();
    }

    async function saveEdit() {
        setSaveStatus("Menyimpan...");
        try {
            // Helper to find index with aliases (Same as in DetailItemTable/FooterSummary)
            // Helper to find index with aliases (Same as in DetailItemTable/FooterSummary)
            const getHeaderIndex = (key) => {
                const normalize = (s) => s ? s.toUpperCase().replace(/[^A-Z0-9]/g, "") : "";
                const k = normalize(key);
                let searchKeys = [k];
                if (k === "NOBUKTI") searchKeys = ["NOBUKTI", "NOMORBUKTI", "NOFAKTUR"];
                if (k === "TANGGAL") searchKeys = ["TANGGAL", "TGL"];
                if (k === "CUSTOMER") searchKeys = ["CUSTOMER", "PELANGGAN", "NAMACUSTOMER"];
                if (k === "KET") searchKeys = ["KET", "KETERANGAN", "CATATAN", "NOTES"];
                if (k === "COA") searchKeys = ["COA", "AKUN", "COAPENJUALAN"];

                return headerRow.findIndex(h => {
                    const normH = normalize(h);

                    // Exact match check
                    if (searchKeys.includes(normH)) return true;

                    return searchKeys.some(sk => {
                        if (!normH.includes(sk)) return false;

                        // Prevention for COA: Ensure we don't match fields like COA PPH, COA HPP, or AKUN PERSEDIAAN
                        if (sk === "COA" || sk === "AKUN") {
                            if (normH.includes("PPH") || normH.includes("HPP") || normH.includes("PERSEDIAAN") || normH.includes("COST")) return false;
                        }
                        return true;
                    });
                });
            };

            // Identify Indices for Header Columns that should be synced across all rows in the group
            const headerKeys = ["NOBUKTI", "TANGGAL", "NOMORFAKTUR", "TANGGALFAKTUR", "CUSTOMER", "NPWP", "COA", "KET"];
            const headerMap = {};
            headerKeys.forEach(k => {
                const idx = getHeaderIndex(k);
                if (idx !== -1) headerMap[idx] = true;
            });

            // Identify Date Columns dynamically
            const dateColIndices = [getHeaderIndex("TANGGAL"), getHeaderIndex("TANGGALFAKTUR")].filter(i => i !== -1);

            // 1. Handle Pending Deletes first
            if (pendingDeletes.size > 0) {
                const rowNumbersToDelete = Array.from(pendingDeletes);
                const deleteRes = await fetch(API.sheetDeleteRows, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        spreadsheetId,
                        sheet: sheetName,
                        rowNumbers: rowNumbersToDelete
                    })
                });
                if (!deleteRes.ok) throw new Error("Gagal menghapus item lama");
            }

            const promises = editingGroup.map(groupItem => {
                // Merge Header fields from `editingValues` into this groupItem's values
                const finalValues = [...groupItem.values];

                Object.keys(headerMap).forEach(idxStr => {
                    const idx = parseInt(idxStr);
                    finalValues[idx] = editingValues[idx];
                });

                if (isAddingRow || groupItem.isNew || groupItem.rowIndex === -1) {
                    // NEW ROW -> Use Append Logic
                    return fetch(API.sheetAppendRow, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            spreadsheetId,
                            sheet: sheetName,
                            values: finalValues.map((v, idx) => {
                                if (dateColIndices.includes(idx)) return toSheetDate(v);
                                return v;
                            })
                        })
                    });
                } else {
                    // EXISTING ROW -> Use Update Logic
                    let targetRowNumber = dataRowNumbers[groupItem.rowIndex];
                    if (!targetRowNumber) return Promise.resolve();

                    return fetch(API.sheetUpdateRow, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            spreadsheetId,
                            sheet: sheetName,
                            rowNumber: targetRowNumber,
                            values: finalValues.map((v, idx) => {
                                // Only format as date if it's actually a date column
                                if (dateColIndices.includes(idx)) return toSheetDate(v);
                                return v;
                            })
                        })
                    });
                }
            });

            await Promise.all(promises);

            // Optimistic UI Update: Update local `rows` state immediately
            // Create a map of rowIndex -> newValues for O(1) lookups during map
            const updates = {};
            editingGroup.forEach(groupItem => {
                // Reconstruct the final values same as we did for the API call
                const finalValues = [...groupItem.values];
                Object.keys(headerMap).forEach(idxStr => {
                    const idx = parseInt(idxStr);
                    finalValues[idx] = editingValues[idx];
                });

                // Format dates locally so UI looks correct immediately
                dateColIndices.forEach(idx => {
                    finalValues[idx] = toSheetDate(finalValues[idx]);
                });

                // Check if it's an existing row update or a new row
                if (!groupItem.isNew && groupItem.rowIndex !== -1) {
                    // Shift index by +1 because rows[0] is header
                    updates[groupItem.rowIndex + 1] = finalValues;
                }
            });

            // Apply updates to current rows
            setRows(prevRows => {
                return prevRows.map((r, i) => {
                    if (updates[i]) return updates[i];
                    return r;
                });
            });

            setSaveStatus("Berhasil disimpan (Optimistic).");
            setTimeout(() => setSaveStatus(""), 3000);
            cancelEdit();

            // Trigger refresh logic only for new rows to update pagination/totalRows
            if (isAddingRow) {
                setReloadKey(prev => prev + 1);
            }
        } catch (err) {
            setSaveStatus("Gagal menyimpan: " + err.message);
        }
    }

    // Helper for column widths
    const getColumnWidth = (header) => {
        if (!header) return "150px";
        const h = String(header).toUpperCase();
        if (h.includes("ITEM") || h.includes("BARANG")) return "350px";
        if (h.includes("CUSTOMER") || h.includes("PELANGGAN")) return "250px";
        if (h.includes("KET")) return "250px";
        if (h.includes("COA") || h.includes("AKUN")) return "200px";
        return "150px";
    };

    const [selectedRows, setSelectedRows] = useState(new Set());

    function toggleRowSelection(rowIndex) {
        if (rowIndex < 0) return;
        const newSet = new Set(selectedRows);
        if (newSet.has(rowIndex)) {
            newSet.delete(rowIndex);
        } else {
            newSet.add(rowIndex);
        }
        setSelectedRows(newSet);
    }

    function toggleAllSelection() {
        if (selectedRows.size === filteredRows.length && filteredRows.length > 0) {
            setSelectedRows(new Set());
        } else {
            const newSet = new Set();
            filteredRows.forEach((_, idx) => newSet.add(idx));
            setSelectedRows(newSet);
        }
    }

    async function deleteSelectedRows() {
        if (selectedRows.size === 0) return;
        if (!confirm(`Apakah anda yakin ingin menghapus ${selectedRows.size} baris data?`)) return;

        setSaveStatus("Menghapus...");
        try {
            // Convert filtered indices back to original row numbers
            const rowsToDelete = [];
            selectedRows.forEach(filteredIdx => {
                const rowNum = dataRowNumbers[filteredIdx];
                if (rowNum) rowsToDelete.push(rowNum);
            });

            if (rowsToDelete.length === 0) return;

            const res = await fetch(API.sheetDeleteRows, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    spreadsheetId,
                    sheet: sheetName,
                    rowNumbers: rowsToDelete
                })
            });

            if (!res.ok) throw new Error("Gagal menghapus baris");

            setSaveStatus("Berhasil dihapus.");
            setTimeout(() => setSaveStatus(""), 2000);
            setSelectedRows(new Set());
            setReloadKey(prev => prev + 1); // Reload to update list
        } catch (err) {
            console.error(err);
            setSaveStatus("Gagal hapus: " + err.message);
        }
    }

    // Check for Transaction Mode
    const hasNoBukti = headerRow.some(h => String(h).toUpperCase().replace(/[^A-Z]/g, "").includes("NOBUKTI"));

    const handleEditGroup = (group) => {
        if (group.indices.length > 0) {
            startEdit(group.indices[0]);
        }
    };

    const handleDeleteGroup = async (group) => {
        if (!confirm(`Hapus transaksi ${group.key} (${group.rows.length} items)?`)) return;
        setSaveStatus("Menghapus Transaksi...");
        try {
            const rowsToDelete = group.indices.map(idx => filteredDataRowNumbers[idx]);
            const res = await fetch(API.sheetDeleteRows, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    spreadsheetId,
                    sheet: sheetName,
                    rowNumbers: rowsToDelete
                })
            });
            if (!res.ok) throw new Error("Gagal menghapus transaksi");
            setSaveStatus("Transaksi dihapus.");
            setTimeout(() => setSaveStatus(""), 2000);
            setReloadKey(prev => prev + 1);
        } catch (e) {
            setSaveStatus("Gagal hapus: " + e.message);
        }
    };

    return (
        <div className="flex-1 overflow-hidden flex flex-col h-full relative">
            {(loading || saveStatus) && (
                <div className="absolute top-0 left-0 right-0 z-50">
                    <div className="h-1 w-full bg-blue-100 overflow-hidden">
                        <div className="animate-progress w-full h-full bg-blue-500 origin-left-right"></div>
                    </div>
                    {saveStatus && (
                        <div className="bg-blue-600 text-white text-xs px-4 py-1 text-center font-medium shadow-md">
                            {saveStatus}
                        </div>
                    )}
                </div>
            )}

            {title && (
                <div className="bg-white border-b border-slate-200 px-6 py-4 flex justify-between items-center shrink-0">
                    <div>
                        <h1 className="text-xl font-bold text-slate-800">{companyName}</h1>
                        <p className="text-sm text-slate-500">Form Input & Data: {tableName}</p>
                    </div>
                </div>
            )}

            {!loading && !error && (
                <>
                    <div className="flex justify-between items-center px-6 py-4 bg-slate-50/50 border-b border-slate-200">
                        <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-slate-600">Total Data: {rows.length} Baris</span>
                            {selectedRows.size > 0 && (
                                <span className="text-xs bg-slate-200 text-slate-700 px-2 py-0.5 rounded-full">{selectedRows.size} Dipilih</span>
                            )}
                        </div>
                        <div className="flex gap-2">
                            {selectedRows.size > 0 && (
                                <button onClick={deleteSelectedRows} className="bg-red-600 hover:bg-red-700 text-white text-sm font-medium py-2 px-4 rounded-lg shadow-sm hover:shadow-md transition-all flex items-center gap-2">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                        <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                                    </svg>
                                    <span>Hapus</span>
                                </button>
                            )}
                            <button onClick={startAddRow} className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2 px-4 rounded-lg shadow-sm hover:shadow-md transition-all flex items-center gap-2">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                                </svg>
                                <span>Buat Baru</span>
                            </button>
                        </div>
                    </div >

                    <div className="flex-1 overflow-auto custom-scrollbar bg-white">
                        {hasNoBukti ? (
                            <TransactionTable
                                rows={filteredRows}
                                headerRow={headerRow}
                                dataRowNumbers={filteredDataRowNumbers}
                                onEditGroup={handleEditGroup}
                                onDeleteGroup={handleDeleteGroup}
                            />
                        ) : (
                            <table className="w-full border-collapse text-sm">
                                <thead className="sticky top-0 bg-slate-100 shadow-sm z-10 text-xs uppercase tracking-wider !text-slate-900 font-bold border-b border-slate-300">
                                    <tr>
                                        <th className="!text-slate-900 !bg-slate-100 text-center" style={{ width: "40px", minWidth: "40px" }}>
                                            <input
                                                type="checkbox"
                                                className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                                checked={filteredRows.length > 0 && selectedRows.size === filteredRows.length}
                                                onChange={toggleAllSelection}
                                            />
                                        </th>
                                        <th className="!text-slate-900 !bg-slate-100" style={{ minWidth: "60px" }}>
                                            <div className="th-flex justify-center">
                                                <span>Aksi</span>
                                            </div>
                                        </th>
                                        {Array.from({ length: maxCols }).map((_, i) => (
                                            <th key={i} className="!text-slate-900 !bg-slate-100" style={{ minWidth: getColumnWidth(headerRow[i]) }}>
                                                <div className="th-flex">
                                                    <span>{headerRow[i] || `Col ${i + 1}`}</span>
                                                    <span
                                                        className={`filter-icon ${activeFilterCol === i ? "active" : ""}`}
                                                        onClick={e => {
                                                            e.stopPropagation();
                                                            setActiveFilterCol(activeFilterCol === i ? -1 : i);
                                                        }}
                                                    >
                                                        v
                                                    </span>
                                                    {activeFilterCol === i && (
                                                        <div className="filter-popover" onClick={e => e.stopPropagation()}>
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
                                                                >
                                                                    Reset
                                                                </button>
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
                                        <tr key={filteredIndex} className={selectedRows.has(filteredIndex) ? "bg-blue-50" : ""}>
                                            <td className="text-center bg-white/0">
                                                <input
                                                    type="checkbox"
                                                    className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                                    checked={selectedRows.has(filteredIndex)}
                                                    onChange={() => toggleRowSelection(filteredIndex)}
                                                />
                                            </td>
                                            <td className="text-center">
                                                <span
                                                    className="text-blue-600 hover:text-blue-800 cursor-pointer font-medium hover:underline text-xs"
                                                    onClick={() => startEdit(filteredIndex)}
                                                >
                                                    Edit
                                                </span>
                                            </td>
                                            {Array.from({ length: maxCols }).map((_, j) => (
                                                <td key={j}>{row[j] || ""}</td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                    {/* Pagination Controls */}
                    <div className="bg-white border-t border-slate-200 px-6 py-4 flex items-center justify-between shadow-sm z-20 relative">
                        <div className="text-sm text-slate-500">
                            Halaman <b>{page}</b> dari <b>{invoiceLastPage}</b> ({totalInvoices} Invoice, {totalRows} Baris)
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setPage(Math.max(1, page - 1))}
                                disabled={page <= 1}
                                className="px-3 py-1 text-sm bg-white border border-slate-300 rounded hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                Sebelumnya
                            </button>
                            <button
                                onClick={() => setPage(Math.min(invoiceLastPage, page + 1))}
                                disabled={page >= invoiceLastPage}
                                className="px-3 py-1 text-sm bg-white border border-slate-300 rounded hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                Selanjutnya
                            </button>
                        </div>
                    </div>
                </>
            )
            }
            {
                (editingRowIndex >= 0 || isAddingRow) && (
                    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 sm:p-6" onClick={cancelEdit}>
                        <div
                            className="bg-white rounded-2xl shadow-xl w-full max-w-[95vw] max-h-[95vh] overflow-hidden flex flex-col border border-slate-200"
                            onClick={e => e.stopPropagation()}
                        >
                            {/* Modal Header */}
                            <div className="bg-slate-50 px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
                                <div>
                                    <h3 className="text-lg font-bold text-slate-800">
                                        {isAddingRow ? "Tambah Invoice Baru" : `Edit Invoice Row ${dataRowNumbers[editingRowIndex] || "-"}`}
                                    </h3>
                                    <p className="text-sm text-slate-500">Isi detail invoice penjualan di bawah ini</p>
                                </div>
                                <div className="flex gap-3">
                                    <button
                                        onClick={cancelEdit}
                                        className="px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 hover:text-slate-800 transition-colors"
                                    >
                                        Batal
                                    </button>
                                    <button
                                        onClick={saveEdit}
                                        className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 shadow-sm shadow-blue-200 transition-colors"
                                    >
                                        Simpan Perubahan
                                    </button>
                                </div>
                            </div>

                            {/* Modal Content - Scrollable */}
                            <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">

                                {/* Invoice Header Form */}
                                <div className="bg-slate-50/50 border border-slate-200 rounded-xl p-5 mb-6">
                                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Informasi Utama</h4>
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
                                        {/* helper for header index finding */}
                                        {(() => {
                                            const getHeaderIndex = (key) => {
                                                const normalize = (s) => s ? s.toUpperCase().replace(/[^A-Z0-9]/g, "") : "";
                                                const k = normalize(key);
                                                let searchKeys = [k];
                                                if (k === "NOBUKTI") searchKeys = ["NOBUKTI", "NOMORBUKTI", "NOFAKTUR"];
                                                if (k === "TANGGAL") searchKeys = ["TANGGAL", "TGL"];
                                                if (k === "CUSTOMER") searchKeys = ["CUSTOMER", "PELANGGAN", "NAMACUSTOMER"];
                                                if (k === "NPWP") searchKeys = ["NPWP"];
                                                if (k === "NOMORFAKTUR") searchKeys = ["NOMORFAKTUR", "NOFAKTURPAJAK"];
                                                if (k === "TANGGALFAKTUR") searchKeys = ["TANGGALFAKTUR", "TGLFAKTUR"];
                                                if (k === "COA") searchKeys = ["COA", "AKUN", "COAPENJUALAN"];

                                                // Helper to find exact header index
                                                // Added explicit debugging here could be useful but we have limited space
                                                return headerRow.findIndex(h => {
                                                    const normH = normalize(h);
                                                    return searchKeys.some(sk => normH.includes(sk));
                                                });
                                            };

                                            const noBuktiIdx = getHeaderIndex("NOBUKTI");
                                            const tglIdx = getHeaderIndex("TANGGAL");
                                            const noFakturIdx = getHeaderIndex("NOMORFAKTUR");
                                            const tglFakturIdx = getHeaderIndex("TANGGALFAKTUR");
                                            const custIdx = getHeaderIndex("CUSTOMER");
                                            const npwpIdx = getHeaderIndex("NPWP");
                                            const coaIdx = getHeaderIndex("COA");

                                            return (
                                                <>
                                                    {/* ROW 1 */}
                                                    <div className="space-y-1">
                                                        <label className="text-xs font-semibold text-slate-500">No. Bukti</label>
                                                        <input
                                                            value={editingValues[noBuktiIdx] || ""}
                                                            onChange={e => {
                                                                if (noBuktiIdx === -1) return;
                                                                console.log("DEBUG INPUT: Changing NoBukti", e.target.value);
                                                                const next = [...editingValues];
                                                                next[noBuktiIdx] = e.target.value;
                                                                setEditingValues(next);
                                                            }}
                                                            disabled={noBuktiIdx === -1}
                                                            className="w-full text-sm px-3 py-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition-all font-mono"
                                                            placeholder="Contoh: INV/2025/001"
                                                        />
                                                    </div>
                                                    <div className="space-y-1">
                                                        <label className="text-xs font-semibold text-slate-500">Tanggal</label>
                                                        <input
                                                            type="date"
                                                            value={toDisplayDateInput(editingValues[tglIdx])}
                                                            onChange={e => {
                                                                if (tglIdx === -1) return;
                                                                const next = [...editingValues];
                                                                next[tglIdx] = toSheetDate(e.target.value);
                                                                setEditingValues(next);
                                                            }}
                                                            disabled={tglIdx === -1}
                                                            className="w-full text-sm px-3 py-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition-all font-mono"
                                                        />
                                                    </div>
                                                    <div className="space-y-1">
                                                        <label className="text-xs font-semibold text-slate-500">Nomor Faktur</label>
                                                        <input
                                                            value={editingValues[noFakturIdx] || ""}
                                                            onChange={e => {
                                                                if (noFakturIdx === -1) return;
                                                                const next = [...editingValues];
                                                                next[noFakturIdx] = e.target.value;
                                                                setEditingValues(next);
                                                            }}
                                                            disabled={noFakturIdx === -1}
                                                            className="w-full text-sm px-3 py-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition-all font-mono"
                                                            placeholder="Nomor Seri Faktur Pajak"
                                                        />
                                                    </div>
                                                    <div className="space-y-1">
                                                        <label className="text-xs font-semibold text-slate-500">Tanggal Faktur</label>
                                                        <input
                                                            type="date"
                                                            value={toDisplayDateInput(editingValues[tglFakturIdx])}
                                                            onChange={e => {
                                                                if (tglFakturIdx === -1) return;
                                                                const next = [...editingValues];
                                                                next[tglFakturIdx] = toSheetDate(e.target.value);
                                                                setEditingValues(next);
                                                            }}
                                                            disabled={tglFakturIdx === -1}
                                                            className="w-full text-sm px-3 py-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition-all font-mono"
                                                        />
                                                    </div>

                                                    {/* ROW 2 */}
                                                    <div className="space-y-1 md:col-span-2">
                                                        <label className="text-xs font-semibold text-slate-500">Customer</label>
                                                        <input
                                                            list="customer-options-list"
                                                            value={editingValues[custIdx] || ""}
                                                            onChange={e => {
                                                                if (custIdx === -1) return;
                                                                const next = [...editingValues];
                                                                next[custIdx] = e.target.value;
                                                                setEditingValues(next);
                                                            }}
                                                            disabled={custIdx === -1}
                                                            className="w-full text-sm px-3 py-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition-all font-mono"
                                                            placeholder="Nama Customer..."
                                                        />
                                                        <datalist id="customer-options-list">
                                                            {(globalOptions.customers || []).map((opt, i) => (
                                                                <option key={i} value={opt} />
                                                            ))}
                                                        </datalist>
                                                    </div>
                                                    <div className="space-y-1">
                                                        <label className="text-xs font-semibold text-slate-500">NPWP</label>
                                                        <input
                                                            value={editingValues[npwpIdx] || ""}
                                                            onChange={e => {
                                                                if (npwpIdx === -1) return;
                                                                const next = [...editingValues];
                                                                next[npwpIdx] = e.target.value;
                                                                setEditingValues(next);
                                                            }}
                                                            disabled={npwpIdx === -1}
                                                            className="w-full text-sm px-3 py-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition-all font-mono"
                                                        />
                                                    </div>
                                                    <div className="space-y-1">
                                                        <label className="text-xs font-semibold text-slate-500">COA Penjualan</label>
                                                        <select
                                                            value={editingValues[coaIdx] || ""}
                                                            onChange={e => {
                                                                if (coaIdx === -1) return;
                                                                const next = [...editingValues];
                                                                next[coaIdx] = e.target.value;
                                                                setEditingValues(next);
                                                            }}
                                                            disabled={coaIdx === -1}
                                                            className="w-full text-sm px-3 py-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition-all font-mono appearance-none"
                                                        >
                                                            <option value="">-- Pilih COA --</option>
                                                            {coaOptions.map((opt, idx) => (
                                                                <option key={idx} value={opt}>{opt}</option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                </>
                                            );
                                        })()}
                                    </div>
                                </div>

                                {/* DETAIL ITEM TABLE */}
                                <div className="flex-1 overflow-auto p-6 pt-0">
                                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Detail Item Barang</h4>
                                    <div className="rounded-xl border border-slate-200 overflow-hidden bg-white shadow-sm mb-6">
                                        <DetailItemTable
                                            editingValues={editingValues}
                                            setEditingValues={setEditingValues}
                                            headerRow={headerRow}
                                            editingGroup={editingGroup}
                                            setEditingGroup={setEditingGroup}
                                            coaOptions={coaOptions}
                                            itemOptions={globalOptions.items || []}
                                            onDeleteItem={handleDeleteItem}
                                        />
                                    </div>
                                </div>

                                {/* FOOTER SUMMARY */}
                                <FooterSummary
                                    editingValues={editingValues}
                                    setEditingValues={setEditingValues}
                                    headerRow={headerRow}
                                    editingGroup={editingGroup}
                                />
                            </div>
                        </div>
                    </div>
                )
            }
        </div >
    );
}
