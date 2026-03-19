import React from "react";
import { EditableSheetPage } from "./EditableSheetPage";

export function PembelianPage({ spreadsheetId }) {
  return <EditableSheetPage sheetName="pembelian" spreadsheetId={spreadsheetId} title="Pembelian" />;
}
