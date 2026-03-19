const DEFAULT_SPREADSHEET_ID = "1ALS7m3wpPhJsX2CXGiCid_AJOv0zX6vD49OYiOIcZ90";

export function withSpreadsheetId(url, spreadsheetId = DEFAULT_SPREADSHEET_ID) {
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}spreadsheetId=${encodeURIComponent(spreadsheetId)}`;
}

export const API = {
  base: "",
  gl: (source, spreadsheetId) => withSpreadsheetId(`/bukubesar?source=${encodeURIComponent(source)}`, spreadsheetId),
  compare: (a, b, spreadsheetId) => withSpreadsheetId(`/compare?sourceA=${encodeURIComponent(a)}&sourceB=${encodeURIComponent(b)}`, spreadsheetId),
  sheets: (spreadsheetId) => withSpreadsheetId("/sheets", spreadsheetId),
  sheetPreview: (sheet, spreadsheetId, range = "A4:M") =>
    withSpreadsheetId(`/sheet/preview?sheet=${encodeURIComponent(sheet)}&range=${encodeURIComponent(range)}`, spreadsheetId),
  sheetUpdateRow: "/sheet/update-row",
  sheetAppendRow: "/sheet/append-row",
  sheetFilter: "/sheet/filter",
  sheetDeleteRows: "/sheet/delete-rows",
  sheetDistinct: "/sheet/distinct",
  exportCsv: (source, spreadsheetId) => withSpreadsheetId(`/export/bukubesar.csv?source=${encodeURIComponent(source)}`, spreadsheetId),
  authLogin: "/auth/login",
  authUsers: "/auth/users"
};

export { DEFAULT_SPREADSHEET_ID };
