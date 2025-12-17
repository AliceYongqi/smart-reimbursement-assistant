import * as XLSX from "xlsx";
import type { RawInvoice } from "../types";
import { saveAs } from "file-saver";
import { type OutputJson } from "../types";
// "prebuild": "mkdir -p public/pdfjs && cp node_modules/pdfjs-dist/build/pdf.worker.min.mjs public/pdfjs/pdf.worker.min.mjs"
// 

// @ts-ignore
import workerSrc from 'url:pdfjs-dist/build/pdf.worker.min.mjs'
import * as pdfjsLib from 'pdfjs-dist';
pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;

export async function pdfToImages(pdfFile: File): Promise<string> {
  const arrayBuffer = await pdfFile.arrayBuffer();
  // const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const pdf = await pdfjsLib.getDocument({
    data: arrayBuffer,
    cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/cmaps/',
    standardFontDataUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/standard_fonts/'
  }).promise;
  
  
  let image: string = '';
  
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    
    // set scale (DPI control)
    const scale = 2.0;
    const viewport = page.getViewport({ scale });
    
    // create canvas
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d')!;
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    
    // ✅ Key: pass canvas instead of canvasContext
    await page.render({
      canvas,        // ← must pass canvas element
      viewport       // ← viewport optional but recommended
    }).promise;
    
    image = canvas.toDataURL('image/jpeg', 0.95);
  }
  
  return image;
}

// Data URL → Blob
export function dataURLToBlob(dataURL: string): Blob {
  const [header, base64] = dataURL.split(',');
  const mime = header.match(/:(.*?);/)?.[1] || 'image/jpeg';
  const binary = atob(base64);
  const array = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    array[i] = binary.charCodeAt(i);
  }
  return new Blob([array], { type: mime });
}

// Data URL → File (with filename)
export function dataURLToFile(dataURL: string, filename: string): File {
  const blob = dataURLToBlob(dataURL);
  return new File([blob], filename, { type: blob.type });
}

export function downloadJson(data: OutputJson, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  saveAs(blob, filename);
}

export function downloadExcel(blob: Blob, filename: string) {
  saveAs(blob, filename);
}