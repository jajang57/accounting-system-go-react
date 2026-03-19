import React, { useState } from "react";
import { Trash2, Plus, Edit2, X } from "lucide-react";

// Struktur field item detail sesuai permintaan
const itemFields = [
  "NO_URUT", "ITEM_BARANG", "QTY", "HARGA", "TOTAL", "DPP", "PPN", "COA_PPH", "PPH", "SUBTOTAL", "COA_HPP", "COA_PERSEDIAAN", "HPP"
];

export function DetailItemTable({ editingValues, setEditingValues, headerRow, editingGroup, setEditingGroup, coaOptions, itemOptions, onDeleteItem }) {
  // Helper to find index with aliases
  const getHeaderIndex = (key) => {
    const normalize = (s) => s ? s.toUpperCase().replace(/[^A-Z0-9]/g, "") : "";
    const k = normalize(key);

    // Explicit Aliases
    let searchKeys = [k];
    if (k === "ITEMBARANG") searchKeys = ["ITEMBARANG", "NAMAITEM", "NAMABARANG", "DESKRIPSI", "ITEM"];
    if (k === "NOURUT") searchKeys = ["NOURUT", "NOMORURUT", "NO"];
    if (k === "QTY") searchKeys = ["QTY", "QUANTITY", "JUMLAHITEM"];
    if (k === "HARGA") searchKeys = ["HARGA", "PRICE", "HARGASATUAN"];
    if (k === "TOTAL") searchKeys = ["TOTAL", "TOTALHARGA", "JUMLAHHARGA"];
    if (k === "SUBTOTAL") searchKeys = ["SUBTOTAL", "SUBTOT", "JUMLAH"]; // Removed "TOTAL" to prevent collision
    if (k === "COAPPH") searchKeys = ["COAPPH", "AKUNPPH"];
    if (k === "COAHPP") searchKeys = ["COAHPP", "AKUNHPP"];
    if (k === "DPP") searchKeys = ["DPP", "DPPHARGA", "DASARPENGENAANPAJAK"];
    if (k === "PPN") searchKeys = ["PPN", "PAJAKPERTAMBAHANNILAI", "PPNKELUARAN"];
    if (k === "PPH") searchKeys = ["PPH", "PAJAKPENGHASILAN"];
    if (k === "HPP") searchKeys = ["HPP", "HARGAPOKOK", "MODAL"];
    if (k === "COAPERSEDIAAN") searchKeys = ["COAPERSEDIAAN", "AKUNPERSEDIAAN"];

    return headerRow.findIndex(h => {
      const normH = normalize(h);
      // Exact match check first?
      if (searchKeys.includes(normH)) return true;

      return searchKeys.some(sk => {
        if (!normH.includes(sk)) return false;
        // Prevention: If we are looking for "PPH" but the header is "COAPPH", ignore it.
        // Logic: If key is PPH/HPP/TOTAL, and header contains "COA" or "AKUN", reject.
        const isValueField = ["PPH", "HPP", "TOTAL", "HARGA", "QTY", "DPP", "PPN", "SUBTOTAL"].some(x => sk.includes(x));

        // If the SEARCH key (sk) itself indicates it IS an Account/COA field (e.g. "COAPPH"), then let it match headers with "COA".
        const isCoaKey = sk.includes("COA") || sk.includes("AKUN");

        if (isValueField && !isCoaKey && (normH.includes("COA") || normH.includes("AKUN"))) return false;

        return true;
      });
    });
  };

  // Construct single item from row data based on finding headers
  const getIdx = (key) => getHeaderIndex(key);

  // Map editingGroup to objects
  const items = Array.isArray(editingGroup) ? editingGroup.map(g => {
    const row = g.values;
    return itemFields.reduce((acc, field) => {
      const idx = getIdx(field);
      acc[field] = idx !== -1 ? row[idx] : "";
      return acc;
    }, {});
  }) : [];

  // State for Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItemIndex, setEditingItemIndex] = useState(-1);
  const [tempItem, setTempItem] = useState({});

  function handleOpenModal(index = -1) {
    if (index >= 0) {
      setEditingItemIndex(index);
      setTempItem({ ...items[index] });
    } else {
      setEditingItemIndex(-1);
      // New Item
      // Calculate Auto-Increment Number
      let nextNo = 1;
      const noUrutIdx = items.length > 0 ? getIdx("NO_URUT") : -1; // We can't use items here easily because it's derived
      // Use editingGroup directly
      if (editingGroup.length > 0) {
        // Find max NO_URUT
        // Need to identify which index is NO_URUT in the values array
        const idx = getHeaderIndex("NO_URUT");
        if (idx !== -1) {
          const max = editingGroup.reduce((m, g) => {
            const val = parseInt(g.values[idx]) || 0;
            return val > m ? val : m;
          }, 0);
          nextNo = max + 1;
        } else {
          nextNo = editingGroup.length + 1;
        }
      }

      const emptyItem = itemFields.reduce((acc, f) => { acc[f] = ""; return acc; }, {});
      emptyItem["NO_URUT"] = String(nextNo);
      setTempItem(emptyItem);
    }
    setIsModalOpen(true);
  }

  function handleCloseModal() {
    setIsModalOpen(false);
    setTempItem({});
    setEditingItemIndex(-1);
  }

  // Format number: 10000 -> "10.000"
  const formatNumber = (num) => {
    if (!num && num !== 0) return "";
    return String(num).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  };

  // Parse number: "10.000" -> 10000
  const parseNumber = (str) => {
    if (!str) return 0;
    return parseFloat(String(str).replace(/\./g, "")) || 0;
  };

  function handleModalChange(field, value) {
    setTempItem(prev => {
      // If it's a numeric field, we might want to store it as formatted string or raw number?
      // Input value comes as string. If user types "10.000", we should allow it.
      // But for calculation we need raw numbers.
      // Let's store raw user input in `prev`? No, let's try to format it on blur or on change?
      // Simplest: Store as is, but remove non-digits for calculation.

      // Better approach for controlled inputs with separators:
      // 1. Remove dots to get raw number.
      // 2. Re-format with dots.
      // 3. Store formatted string in state.

      const numericFields = ["QTY", "HARGA", "TOTAL", "DPP", "PPN", "PPH", "SUBTOTAL", "HPP"];
      let nextValue = value;

      if (numericFields.includes(field)) {
        const raw = value.replace(/\./g, "").replace(/[^0-9]/g, "");
        if (raw) {
          nextValue = formatNumber(raw);
        } else {
          nextValue = "";
        }
      }

      const updated = { ...prev, [field]: nextValue };

      // Helper to get raw value from updated state
      const val = (f) => parseNumber(updated[f]);

      // CALCULATION LOGIC
      // 1. TOTAL = QTY * HARGA
      if (field === "QTY" || field === "HARGA") {
        const total = val("QTY") * val("HARGA");
        updated.TOTAL = formatNumber(total);
        // When TOTAL updates, DPP updates too
        updated.DPP = formatNumber(total);
        // When DPP updates, PPN updates (11%)
        updated.PPN = formatNumber(Math.floor(total * 0.11));
      }

      // 2. DPP syncs with TOTAL if user edits TOTAL directly?
      // Request says: "DPP otomatis terisi sama nilainya dengan kolom total"
      // If user manually edits TOTAL, DPP should follow.
      if (field === "TOTAL") {
        updated.DPP = updated.TOTAL;
        updated.PPN = formatNumber(Math.floor(val("TOTAL") * 0.11));
      }

      // 3. If user Manually edits DPP, Recalculate PPN
      if (field === "DPP") {
        updated.PPN = formatNumber(Math.floor(val("DPP") * 0.11));
      }

      // 4. SUBTOTAL = DPP + PPN - PPH
      const dpp = val("DPP");
      const ppn = val("PPN");
      const pph = val("PPH");
      const subtotal = dpp + ppn - pph;
      updated.SUBTOTAL = formatNumber(subtotal);

      return updated;
    });
  }

  function handleSaveItem() {
    const nextGroup = [...editingGroup];

    if (editingItemIndex >= 0) {
      // Update existing row in group
      const targetRow = [...nextGroup[editingItemIndex].values];
      Object.keys(tempItem).forEach(key => {
        const idx = getIdx(key);
        if (idx !== -1) targetRow[idx] = tempItem[key];
      });
      nextGroup[editingItemIndex] = { ...nextGroup[editingItemIndex], values: targetRow };
    } else {
      // Add new row to group
      // Use first row template for header connections, but clear item fields
      // Since we don't know the exact indices of header fields easily here if we don't pass them,
      // we can assume the new row should inherit generic structure unless we want to copy from editingValues?
      // Actually, typically we copy relevant header fields from the FIRST row of the group.

      const firstRow = nextGroup.length > 0 ? nextGroup[0].values : editingValues;
      const newRow = [...firstRow]; // Copy header info

      // Overwrite item fields with tempItem
      Object.keys(tempItem).forEach(key => {
        const idx = getIdx(key);
        if (idx !== -1) newRow[idx] = tempItem[key];
      });

      nextGroup.push({ rowIndex: -1, values: newRow, isNew: true });
    }

    setEditingGroup(nextGroup);
    // Also update editingValues if we modified the *primary* row (index 0) to keep sync? 
    // Not strictly necessary as saving uses editingGroup, but good for UI consistency if we display something from editingValues elsewhere.
    if (editingItemIndex === 0) {
      // setEditingValues(nextGroup[0].values); 
    }

    handleCloseModal();
  }

  function handleDelete(idx) {
    if (onDeleteItem) {
      onDeleteItem(idx);
    }
  }

  return (
    <div className="w-full">
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="uppercase border-b border-slate-300">
            <tr>
              {itemFields.map(f => (
                <th key={f} className="px-4 py-3 bg-slate-200 text-slate-900 font-bold whitespace-nowrap min-w-[100px] text-xs">
                  {f.replace(/_/g, " ")}
                </th>
              ))}
              <th className="px-4 py-3 bg-slate-200 text-slate-900 text-center w-[100px] text-xs">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map((item, idx) => (
              <tr key={idx} className="bg-white hover:bg-slate-50 transition-colors group">
                {itemFields.map(f => (
                  <td key={f} className="px-4 py-2 text-slate-700 whitespace-nowrap text-xs border-r border-slate-100 last:border-0 relative">
                    {item[f] || "-"}
                  </td>
                ))}
                <td className="px-2 py-2 text-center flex items-center justify-center gap-2">
                  <button
                    onClick={() => handleOpenModal(idx)}
                    className="p-1.5 text-blue-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-all"
                    title="Edit Item"
                  >
                    <Edit2 size={16} />
                  </button>
                  <button
                    onClick={() => handleDelete(idx)}
                    className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-all"
                    title="Hapus Item"
                  >
                    <Trash2 size={16} />
                  </button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={itemFields.length + 1} className="px-4 py-8 text-center text-slate-400 italic bg-slate-50/30">
                  Belum ada item barang. Klik tombol tambah di bawah.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="p-2 bg-slate-50 border-t border-slate-200">
        {/* Only show Add if the current item is effectively empty/new */}
        <div className="p-2 bg-slate-50 border-t border-slate-200">
          <button
            onClick={() => handleOpenModal(-1)}
            className="w-full flex items-center justify-center gap-2 py-2.5 border-2 border-dashed border-slate-300 rounded-lg text-slate-500 font-medium hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 transition-all"
          >
            <Plus size={16} />
            <span>Tambah Item Barang (Baris Baru)</span>
          </button>
        </div>
      </div>

      {/* MODAL FORM */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-[2px] z-[60] flex items-center justify-center p-4" onClick={handleCloseModal}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100 bg-slate-50">
              <h3 className="font-bold text-slate-800">
                {editingItemIndex >= 0 ? "Edit Item Barang" : "Tambah Item Barang"}
              </h3>
              <button onClick={handleCloseModal} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>

            <div className="p-6 overflow-y-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              <datalist id="coa-options-list">
                {(coaOptions || []).map((opt, i) => (
                  <option key={i} value={opt} />
                ))}
              </datalist>
              {itemFields.map(f => {
                const isItemField = f === 'ITEM_BARANG';
                const isCoaField = ["COA_PPH", "COA_HPP", "COA_PERSEDIAAN"].includes(f);

                return (
                  <div key={f} className={`space-y-1 ${isItemField ? 'md:col-span-2 lg:col-span-3' : ''}`}>
                    <label className="text-xs font-semibold text-slate-500">{f.replace(/_/g, " ")}</label>

                    {isItemField ? (
                      <>
                        <input
                          list="item-options-list"
                          value={tempItem[f] || ""}
                          onChange={e => handleModalChange(f, e.target.value)}
                          className="w-full text-sm px-3 py-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition-all font-mono"
                          placeholder={`Input/Pilih ${f.replace(/_/g, " ")}...`}
                          autoFocus={f === 'NO_URUT'}
                        />
                        <datalist id="item-options-list">
                          {(itemOptions || []).map((opt, i) => (
                            <option key={i} value={opt} />
                          ))}
                        </datalist>
                      </>
                    ) : isCoaField ? (
                      <>
                        <input
                          list="coa-options-list"
                          value={tempItem[f] || ""}
                          onChange={e => handleModalChange(f, e.target.value)}
                          className="w-full text-sm px-3 py-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition-all font-mono"
                          placeholder="Ketik/Pilih COA..."
                        />
                        {/* Only render datalist once if possible, or render locally. ID must be unique per field? No, options are same. */}
                        {/* But we map over fields. If we render datalist mulitple times with same ID, it's valid HTML but redundant. */}
                        {/* Better: Render datalist once outside loops or use dynamic ID if options differed. Here options are same. */}
                        {/* We'll use one shared ID "coa-options-list" defined once in the Component or reusing one. */}
                        {/* Let's check if we can define it once. Yes. */}
                      </>
                    ) : (
                      <input
                        value={tempItem[f] || ""}
                        onChange={e => handleModalChange(f, e.target.value)}
                        disabled={
                          (f === "PPH" && !tempItem["COA_PPH"]) ||
                          (f === "HPP" && (!tempItem["COA_HPP"] || !tempItem["COA_PERSEDIAAN"]))
                        }
                        className={`w-full text-sm px-3 py-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition-all font-mono ${((f === "PPH" && !tempItem["COA_PPH"]) ||
                          (f === "HPP" && (!tempItem["COA_HPP"] || !tempItem["COA_PERSEDIAAN"])))
                          ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                          : ""
                          }`}
                        placeholder={
                          (f === "PPH" && !tempItem["COA_PPH"]) ? "Pilih COA PPH dulu" :
                            (f === "HPP" && (!tempItem["COA_HPP"] || !tempItem["COA_PERSEDIAAN"])) ? "Pilih COA HPP & Persediaan" :
                              `Input ${f.replace(/_/g, " ")}...`
                        }
                        autoFocus={f === 'NO_URUT'}
                      />
                    )}
                  </div>
                )
              })}
            </div>

            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
              <button
                onClick={handleCloseModal}
                className="px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
              >
                Batal
              </button>
              <button
                onClick={handleSaveItem}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 shadow-sm shadow-blue-200 transition-colors"
              >
                Simpan Item
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}