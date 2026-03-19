export const COMPANY_DATA_RANGE = 'A1:F60';

export const COMPANY_FIELDS_DEF = [
    { label: 'Nama', rowIndex: 3 },
    { label: 'Alamat', rowIndex: 4 },
    { label: 'Kota', rowIndex: 5 },
    { label: 'Propinsi', rowIndex: 6 },
    { label: 'Kode Pos', rowIndex: 7 },
    { label: 'Telephone', rowIndex: 8 },
    { label: 'Fax', rowIndex: 9 },
    { label: 'Website', rowIndex: 10 },
    { label: 'Email', rowIndex: 11 },
    { label: 'Logo', rowIndex: 12 }
];

export const TAX_FIELDS_DEF = [
    { label: 'Nama', rowIndex: 28 },
    { label: 'NPWP', rowIndex: 29 },
    { label: 'Alamat', rowIndex: 30 }
];

export const SHEET_FIELDS_DEF = [
    { label: 'Bank001', rowIndex: 33 },
    { label: 'Bank002', rowIndex: 34 },
    { label: 'Bank003', rowIndex: 35 },
    { label: 'Bank004', rowIndex: 36 },
    { label: 'Bank005', rowIndex: 37 },
    { label: 'Bank006', rowIndex: 38 },
    { label: 'Bank007', rowIndex: 39 },
    { label: 'Bank008', rowIndex: 40 },
    { label: 'Bank009', rowIndex: 41 },
    { label: 'Bank010', rowIndex: 42 }
];

export const LINKS_DEF = [
    { label: 'Link Sheet', rowIndex: 43 },
    { label: 'Link Deploy', rowIndex: 44 }
];

export const LEGAL_ROW_OFFSETS = Array.from({ length: 13 }, (_, idx) => 14 + idx);
