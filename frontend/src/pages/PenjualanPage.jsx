import React from "react";
import { EditableSheetPage } from "./EditableSheetPage";

export function PenjualanPage({ spreadsheetId }) {
  return <EditableSheetPage sheetName="penjualan" spreadsheetId={spreadsheetId} title="Penjualan" />;
}
