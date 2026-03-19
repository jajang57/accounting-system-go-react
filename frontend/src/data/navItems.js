import {
    LayoutDashboard,
    Book,
    GitCompare,
    FileSpreadsheet,
    Table,
    List,
    ShoppingCart,
    CreditCard,
    FileText,
    BarChart3,
    Building
} from 'lucide-react';

export const NAV_ITEMS = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "gl", label: "General Ledger", icon: Book },
    { id: "compare", label: "Compare", icon: GitCompare },
    { id: "sheets", label: "Sheets", icon: FileSpreadsheet },
    { id: "company", label: "Perusahaan", icon: Building },
    { id: "bankTables", label: "Bank Tables", icon: Table },
    { id: "masterCoa", label: "Master COA", icon: List },
    { id: "pembelian", label: "Pembelian", icon: ShoppingCart },
    { id: "penjualan", label: "Penjualan", icon: CreditCard },
    { id: "aje", label: "AJE", icon: FileText },
    { id: "reports", label: "Reports", icon: BarChart3 }
];

export const NAV_ITEM_IDS = NAV_ITEMS.map(item => item.id);
