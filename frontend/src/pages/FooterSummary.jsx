import React from "react";

export function FooterSummary({ editingValues, setEditingValues, headerRow, editingGroup }) {
  // Helper to find index with aliases
  const getIdx = (key) => {
    const normalize = (s) => s ? s.toUpperCase().replace(/[^A-Z0-9]/g, "") : "";
    const k = normalize(key);

    // Explicit Aliases
    let searchKeys = [k];
    if (k === "SUBTOTAL") searchKeys = ["SUBTOTAL", "SUBTOT", "JUMLAH"]; // Removed "TOTAL" to avoid confusion with Gross Total
    if (k === "KET") searchKeys = ["KET", "KETERANGAN", "CATATAN", "NOTES"];
    if (k === "DPP") searchKeys = ["DPP", "DPPHARGA", "DASARPENGENAANPAJAK"];
    if (k === "PPN") searchKeys = ["PPN", "PAJAKPERTAMBAHANNILAI", "PPNKELUARAN"];
    if (k === "PPH") searchKeys = ["PPH", "PAJAKPENGHASILAN"];
    if (k === "HPP") searchKeys = ["HPP", "HARGAPOKOK", "MODAL"];
    if (k === "COA_PPH") searchKeys = ["COAPPH", "AKUNPPH"]; // To distinguish if needed, but here we sum value fields

    return headerRow.findIndex(h => {
      const normH = normalize(h);
      return searchKeys.some(sk => normH.includes(sk));
    });
  };

  // Parse number: "10.000" -> 10000
  const parseNumber = (str) => {
    if (!str) return 0;
    return parseFloat(String(str).replace(/\./g, "").replace(/,/g, ".")) || 0; // Handle dot as separator
  };

  // Calculate Totals from editingGroup (Items)
  // If editingGroup is empty or not passed, fallback to editingValues? 
  // But editingValues usually holds the Header info or just the first row.
  // For safety, if editingGroup exists, we SUM it.

  let totalDPP = 0;
  let totalPPN = 0;
  let totalPPH = 0;
  let totalHPP = 0;
  let grandTotal = 0; // Subtotal

  const items = Array.isArray(editingGroup) ? editingGroup : [];

  // Column Indices
  const dppIdx = getIdx("DPP");
  const ppnIdx = getIdx("PPN");
  const pphIdx = getIdx("PPH");
  const hppIdx = getIdx("HPP");
  const subIdx = getIdx("SUBTOTAL");

  items.forEach(item => {
    const vals = item.values || [];
    totalDPP += dppIdx !== -1 ? parseNumber(vals[dppIdx]) : 0;
    totalPPN += ppnIdx !== -1 ? parseNumber(vals[ppnIdx]) : 0;
    totalPPH += pphIdx !== -1 ? parseNumber(vals[pphIdx]) : 0;
    totalHPP += hppIdx !== -1 ? parseNumber(vals[hppIdx]) : 0;

    // For grand total, we can sum the calculated subtotal column or derive it?
    // Better to sum the subtotal column if it exists.
    if (subIdx !== -1) {
      grandTotal += parseNumber(vals[subIdx]);
    } else {
      // Fallback derivation
      grandTotal += (dppIdx !== -1 ? parseNumber(vals[dppIdx]) : 0) +
        (ppnIdx !== -1 ? parseNumber(vals[ppnIdx]) : 0) -
        (pphIdx !== -1 ? parseNumber(vals[pphIdx]) : 0);
    }
  });

  // Keterangan
  const ketIdx = getIdx("KET");
  const keterangan = ketIdx !== -1 ? editingValues[ketIdx] : "";

  function handleKetChange(e) {
    if (ketIdx === -1) return;
    const next = [...editingValues];
    next[ketIdx] = e.target.value;
    setEditingValues(next);
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6 pt-4 border-t border-slate-100">
      {/* 2/3 COLUMN: KETERANGAN */}
      <div className="lg:col-span-2 space-y-2">
        <label className="text-sm font-bold text-slate-700">Keterangan / Catatan</label>
        <textarea
          value={keterangan}
          onChange={handleKetChange}
          readOnly={ketIdx === -1}
          className="w-full h-32 p-4 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-100 focus:border-blue-300 resize-none text-sm text-slate-600 placeholder:text-slate-400"
          placeholder={ketIdx === -1 ? "Kolom Keterangan tidak ditemukan" : "Tambahkan catatan untuk invoice ini..."}
        />
      </div>

      {/* 1/3 COLUMN: TOTALS SUMMARY */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 shadow-sm">
        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 pb-2 border-b border-slate-200">Ringkasan Total</h4>

        <div className="space-y-3">
          <div className="flex justify-between items-center text-sm text-slate-600">
            <span>Total DPP</span>
            <span className="font-mono font-medium">{totalDPP.toLocaleString("id-ID")}</span>
          </div>
          <div className="flex justify-between items-center text-sm text-slate-600">
            <span>Total PPN</span>
            <span className="font-mono font-medium">{totalPPN.toLocaleString("id-ID")}</span>
          </div>
          <div className="flex justify-between items-center text-sm text-slate-600">
            <span>Total PPH</span>
            <span className="font-mono font-medium">{totalPPH.toLocaleString("id-ID")}</span>
          </div>
          <div className="flex justify-between items-center text-sm text-slate-600">
            <span>Total HPP</span>
            <span className="font-mono font-medium">{totalHPP.toLocaleString("id-ID")}</span>
          </div>

          <div className="pt-3 mt-3 border-t border-slate-200">
            <div className="flex justify-between items-center">
              <span className="text-sm font-bold text-slate-800">Grand Total</span>
              <span className="text-lg font-bold text-blue-600 font-mono">
                Rp {grandTotal.toLocaleString("id-ID")}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}