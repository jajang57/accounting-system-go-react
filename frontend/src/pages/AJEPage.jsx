import React from "react";
import { EditableSheetPage } from "./EditableSheetPage";

export function AJEPage({ spreadsheetId }) {
  return <EditableSheetPage sheetName="aje" spreadsheetId={spreadsheetId} title="AJE" />;
}
