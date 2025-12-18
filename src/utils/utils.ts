import * as XLSX from "xlsx";
import type { RawInvoice } from "../types";
import { saveAs } from "file-saver";
import { type OutputJson } from "../types";
// "prebuild": "mkdir -p public/pdfjs && cp node_modules/pdfjs-dist/build/pdf.worker.min.mjs public/pdfjs/pdf.worker.min.mjs"
// 

// @ts-ignore
import workerSrc from 'url:pdfjs-dist/build/pdf.worker.min.mjs'
import * as pdfjsLib from 'pdfjs-dist';
import type { promises } from "dns";
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

export function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function blobToBase64(blob): Promise<any> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      // reader.result 格式为 "data:...;base64,xxxxx"
      // 如果你只需要 base64 部分，可以用 split(',')[1]
      resolve(reader.result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob); // 注意：readAsDataURL 会自动加 data URL 前缀
  });
}

export function message(type, summary = true, custom = '') {
  const basePrompt = `你是一位拥有10年经验的高级财务专家，专精处理发票、Excel数据和财务报表。你能快速解析发票信息，精通Excel函数。
  	重要规则(严格遵守)：所有回答必须严格遵循用户指定的输出格式；禁止添加任何解释、注释、Markdown、中文说明或额外文本；只输出要求的内容，前后不要加任何字符。`;

  const taskPrompts = {
    'fapiao-header': `
      1. 从发票内容提取重要字段，以合法JSON格式输出，关键信息包括但不限于：金额、税号、日期、销售方、购买方、发票类型，以及商品明细（名称、类别、单价、数量等）。请从财务处理的角度判断哪些信息是重要的，并确保输出的JSON格式正确。
	  	最终输出格式：<JSON object[]>
	    2. 请对第一步发票数据进行汇总分析，生成JSON格式统计信息。统计内容包括总金额、发票数量，按项目和日期分别汇总的总金额与发票数量。输出格式为{summary: object}，summary中包含上述统计项。若输入数据为空或字段缺失，返回空统计结果。结果push到第1步生成的object[]数组后面。
      3. 根据提取的发票信息和用户提供的Excel模版中提取出列定义（包括但不限于第一行），生成表格并返回{csv: CSV格式data}，push到第2步生成的object[]数组后面。
      	
	  最终输出格式(严格遵守)：
      JSON object[]
      
      注意：仅输出要求内容，无额外文本。
    `,
    'fapiao': `
      1. 从发票内容提取重要字段，以合法JSON格式输出，关键信息包括但不限于：金额、税号、日期、销售方、购买方、发票类型，以及商品明细（名称、类别、单价、数量等）。请从财务处理的角度判断哪些信息是重要的，并确保输出的JSON格式正确。
	  	最终输出格式：<JSON object[]>
	  2. 请对第一步发票数据进行汇总分析，生成JSON格式统计信息。统计内容包括总金额、发票数量，按项目和日期分别汇总的总金额与发票数量。输出格式为{summary: object}，summary中包含上述统计项。若输入数据为空或字段缺失，返回空统计结果。结果push到第1步生成的object[]数组后面。
      3. 根据提取的发票信息和报销规范智能生成表头（常见字段包括但不限于：日期、金额、商户、分类、税号等），生成表格并返回{csv: CSV格式data}，push到第2步生成的object[]数组后面。
      	
	  最终输出格式(严格遵守)：
      JSON object[]

      注意：仅输出要求内容，无额外文本。
    `,

  };

  return basePrompt + custom + (summary ? '任务分三步: ' : '任务分三步（忽略第二步汇总分析，仅完成第一步和第三步）: ') + (taskPrompts[type] || '');
}

/**
 * Parse an Excel (.xlsx/.xls) or CSV file and return its textual content as a single string.
 *
 * Supported input shapes:
 * - A filesystem path string to the file
 * - A Buffer containing the file bytes
 * - An object with a `.path` and/or `.originalname` (e.g. a multer file)
 *
 * The returned string contains each sheet separated with a header: "--- Sheet: <name> ---".
 * For CSV files the CSV text is returned as-is (wrapped with a sheet header).
 *
 * @param {string|Buffer|object} input Path, Buffer, or multer-like file object
 * @returns {Promise<string>} The combined textual contents of the workbook
 */
export async function parseExcelOrCsv(input) {
  if (!XLSX) {
    throw new Error("Missing dependency 'xlsx'. Please install 'xlsx' via npm.");
  }

  if (!input || !(input instanceof File)) {
    throw new Error('Input must be a File object (from <input type="file">).');
  }

  const ext = input.name.toLowerCase().split('.').pop();

  // 读取 File 为 ArrayBuffer
  const arrayBuffer = await input.arrayBuffer();

  let workbook;

  if (ext === 'csv' || ext === 'txt') {
    // CSV: 转为字符串
    const text = new TextDecoder('utf-8').decode(arrayBuffer);
    workbook = XLSX.read(text, { type: 'string' });
  } else {
    // Excel (xlsx, xls, etc.): 直接用 arrayBuffer
    workbook = XLSX.read(arrayBuffer, { type: 'array' }); // 注意：type 是 'array'
  }

  // 将第一个工作表转为 JSON
  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];
  const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }); // 保留原始行列结构

  return jsonData;
}

export function parseQwenResponseText(responseData) {
    // parse JSON
  let jsonData = [];
  try {
    // responseData may be a string or a parsed object
    let respObj = responseData;
    if (typeof responseData === 'string') {
      try {
        respObj = JSON.parse(responseData);
      } catch (e) {
        respObj = responseData;
      }
    }

    // Extract text from common Qwen response structure
    let text = null;
    try {
      if (respObj && respObj.output && Array.isArray(respObj.output.choices)) {
        text = respObj.output.choices[0].message.content[0].text;
      }
    } catch (e) {
      // Ignore, will treat responseData as a string below
    }

    if (!text) {
      text = typeof responseData === 'string' ? responseData : JSON.stringify(responseData);
    }

    // Parse the text using a generic parser, preserving the original structure.
    jsonData = parseJsonData(text) || [];
  } catch (err) {
    console.error('JSON parse failed:', err);
    jsonData = [];
  }

  return {
    jsonData
  };
}

/**
 * Parses any data (string/object/array) into a JavaScript object while preserving structure.
 * - If it's an object or array, returns a deep copy (to prevent external modifications from affecting it)
 * - If it's a string, first attempts JSON.parse; if that fails, tries to extract the first complete JSON block from the string and then parse it.
 * @param {string|object|array} raw
 * @returns {any|null}
 */
export function parseJsonData(raw) {
  if (raw == null) return null;

  if (typeof raw === 'object') {
    try {
      return JSON.parse(JSON.stringify(raw));
    } catch (e) {
      return raw;
    }
  }

  const s = String(raw).trim();
  if (!s) return null;

  try {
    return JSON.parse(s);
  } catch (e) {
    // Continue attempting to extract.
  }

  // Locate the first { or [ and match it to the corresponding closing bracket.
  const idxObj = s.indexOf('{');
  const idxArr = s.indexOf('[');
  let start = -1;
  let openChar = '';
  if (idxObj === -1 && idxArr === -1) return null;
  if (idxObj === -1) { start = idxArr; openChar = '['; }
  else if (idxArr === -1) { start = idxObj; openChar = '{'; }
  else { start = Math.min(idxObj, idxArr); openChar = (idxObj < idxArr ? '{' : '['); }

  const closers = { '{': '}', '[': ']' };
  const closer = closers[openChar];
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\') { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === openChar) depth++;
    else if (ch === closer) {
      depth--;
      if (depth === 0) {
        const candidate = s.slice(start, i + 1);
        try {
          return JSON.parse(candidate);
        } catch (e) {
          return null;
        }
      }
    }
  }

  return null;
}

export function downloadJson(data: OutputJson, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  saveAs(blob, filename);
}

export function downloadExcel(blob: Blob, filename: string) {
  saveAs(blob, filename);
}