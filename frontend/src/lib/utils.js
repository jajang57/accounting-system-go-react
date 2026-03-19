// Hitung Net Income dari transaksi dan master_coa
// Param:
// - transactions: array transaksi (harus sudah difilter tanggal)
// - coaRows: array baris master_coa (A2:L)
// Return: number (net income)
export function hitungNetIncome(transactions, coaRows) {
    // Map nama akun ke headinglr/headerlr
    const nameToInfo = {};
    (coaRows || []).forEach(r => {
        const name = String(r[1] || "").trim();
        const headerlr = String(r[10] || "").trim();
        const headinglr = String(r[11] || "").trim();
        if (name && headinglr && headerlr) {
            nameToInfo[name] = { headinglr, headerlr };
        }
    });

    // Hitung saldo per akun
    const balances = {};
    (transactions || []).forEach(t => {
        const name = String(t.COA || "").trim();
        if (!nameToInfo[name]) return;
        const debit = Number(t.Debit) || 0;
        const kredit = Number(t.Kredit) || 0;
        if (nameToInfo[name].headinglr.toLowerCase().includes("pendapatan")) {
            balances[name] = (balances[name] || 0) + (kredit - debit);
        } else {
            balances[name] = (balances[name] || 0) + (debit - kredit);
        }
    });

    // Total pendapatan dan biaya
    let totalPendapatan = 0;
    let totalBiaya = 0;
    Object.keys(nameToInfo).forEach(name => {
        const { headinglr } = nameToInfo[name];
        const amount = balances[name] || 0;
        if (headinglr.toLowerCase().includes("pendapatan")) totalPendapatan += amount;
        if (headinglr.toLowerCase().includes("biaya")) totalBiaya += amount;
    });
    return totalPendapatan - totalBiaya;
}
export function toNumber(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
}

export function parseIDNumber(raw) {
    const s = String(raw ?? "").trim();
    if (!s) return 0;
    const normalized = s.replace(/\./g, "").replace(",", ".");
    const n = Number(normalized);
    return Number.isFinite(n) ? n : 0;
}

export function formatIDNumber(raw, decimals = 2) {
    const n = parseIDNumber(raw);
    return n.toLocaleString("id-ID", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    });
}

export function toDisplayDateInput(raw) {
    const d = parseDate(raw);
    if (!d) return "";
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
}

export function toSheetDate(raw) {
    const d = parseDate(raw);
    if (!d) return "";
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
}

export function deriveNextNoUrut(dataRows) {
    let maxNo = 0;
    dataRows.forEach(row => {
        const v = String(row?.[0] ?? "").trim();
        const normalized = v.replace(/\./g, "").replace(",", ".");
        const n = Math.floor(Number(normalized));
        if (Number.isFinite(n) && n > maxNo) maxNo = n;
    });
    return maxNo + 1;
}

export function deriveNextNoBukti(lastNoBukti, nextNoUrut) {
    const base = String(lastNoBukti || "").trim();
    if (!base) return `BK00/0000/${String(nextNoUrut).padStart(4, "0")}`;
    const m = base.match(/^(.*?)(\d+)$/);
    if (!m) return `${base}/${String(nextNoUrut).padStart(4, "0")}`;
    const width = m[2].length;
    return `${m[1]}${String(nextNoUrut).padStart(width, "0")}`;
}

export function fmt(v) {
    return toNumber(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function parseDate(raw) {
    const s = String(raw || "").trim();
    if (!s) return null;
    const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    const slash = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
    if (slash) {
        let y = Number(slash[3]);
        if (y < 100) y += 2000;
        return new Date(y, Number(slash[2]) - 1, Number(slash[1]));
    }
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return null;
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function flatten(data) {
    if (Array.isArray(data)) return data;
    if (data && typeof data === "object") return Object.values(data).flatMap(v => Array.isArray(v) ? v : []);
    return [];
}
