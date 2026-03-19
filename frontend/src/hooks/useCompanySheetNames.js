import { useMemo } from 'react';
import { API } from '../lib/api';
import { useFetchJson } from './useFetchJson';
import { COMPANY_DATA_RANGE, SHEET_FIELDS_DEF } from '../lib/companyConfig';

export function useCompanySheetNames(spreadsheetId) {
    const previewUrl = `${API.sheetPreview('seting perusahaan', spreadsheetId, COMPANY_DATA_RANGE)}&_r=0`;
    const { data } = useFetchJson(previewUrl);

    const rows = useMemo(() => {
        if (!data || !Array.isArray(data.rows)) return [];
        return data.rows;
    }, [data]);

    return useMemo(() => {
        const map = {};
        SHEET_FIELDS_DEF.forEach(def => {
            const row = rows[def.rowIndex];
            if (!Array.isArray(row)) return;
            const label = String(row[3] || '').trim();
            if (label) {
                map[def.label.toLowerCase()] = label;
            }
        });
        return map;
    }, [rows]);
}
