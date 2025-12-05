// src/utils/downloadUtils.ts
import { saveAs } from "file-saver";
import { type OutputJson } from "../types";

export function downloadJson(data: OutputJson, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  saveAs(blob, filename);
}

export function downloadExcel(blob: Blob, filename: string) {
  saveAs(blob, filename);
}