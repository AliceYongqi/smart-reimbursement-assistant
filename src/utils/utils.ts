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

export function message(type, custom = '') {
  // 优化后的基础提示词：保留核心约束，精简表述
  const basePrompt = `你是一位高级财务专家，专精处理发票、Excel数据和财务报表。
  【严格约束】：
  1. 所有回答必须仅基于当前提供的输入数据
  2. 关键财务数据必须完全匹配提供的数据，不得估算
  3. 禁止添加任何解释、注释或额外文本
  4. 只输出要求的内容，前后不要加任何字符
  5. 进行摘要或汇总时，只能使用提供的发票JSON数据中的信息
  6. 生成的表头必须完全基于提供的数据，不得凭空创建不存在的表头字段

  【智能引导】：
  1. 合并记录时，智能合并开票日期和项目名称相同的记录
  2. 当没有提供Excel模板时，可以基于发票实际内容智能生成合理的表头
  3. 表头字段应覆盖发票上的所有关键信息，并遵循财务报表的通用规范
  4. 可以根据发票类型调整表头字段的优先级和组合
  5. 如果发票上有特殊字段，应包含在表头中
  `;

  const taskPrompts = {
    'fapiao': `
      从发票内容提取重要字段，以合法JSON格式输出，关键信息包括金额、税号、日期、销售方、购买方、发票类型，必须包括项目明细。
      最终输出格式(严格遵守)：<JSON object[]>

      注意：项目明细中必须包括项目名称。仅输出要求内容，无额外文本。
    `,

    'csv-summary-header': `
      任务分两步，**必须按顺序完成**：
      1. **强制要求**：将开票日期和项目名称相同的多条记录合并成一条汇总记录。汇总时，金额等数值字段累加计算，其他共同字段保持不变。**必须保存**为JSON格式 [{ "summary": json格式data }]。
      2. **强制要求**：基于第1步汇总结果和Excel模版中提取出的列定义，**必须生成**表格并**必须保存**为 [{ "csv": CSV格式data }]。
      
      最终输出格式(严格遵守，这是核心要求)：
      [{ "summary": summaryData }, { "csv": csvData }]

      注意(严格遵守)：
      1. 仅输出要求内容，无任何额外文本
      2. 汇总后的数据应该是原始数据的精简汇总版本
      3. 对于开票日期和项目明细中项目名称相同的记录，无论其他字段是否有差异，都必须合并汇总
      4. 两步任务**必须都完成**，确保最终输出同时包含summary和csv两部分
    `,
    'csv-summary': `
      任务分两步，**必须按顺序完成**：
      1. **强制要求**：将开票日期和项目明细中项目名称相同的多条记录合并成一条汇总记录。汇总时，金额等数值字段累加计算，其他共同字段保持不变。**必须保存**为JSON格式 [{ "summary": json格式data }]。
      2. **强制要求**：基于第1步汇总结果和报销规范智能生成表头（常见字段包括日期、金额、商户、分类、税号、类别等），**必须生成**表格并**必须保存**为[{"csv": CSV格式data}]
      
      最终输出格式(严格遵守，这是核心要求)：
      [{ "summary": summaryData }, { "csv": csvData }]

      注意(严格遵守)：
      1. 仅输出要求内容，无任何额外文本
      2. 汇总后的数据应该是原始数据的精简汇总版本
      3. 对于开票日期和项目明细中项目名称相同的记录，无论其他字段是否有差异，都必须合并汇总
      4. 两步任务**必须都完成**，确保最终输出同时包含summary和csv两部分
    `,
    'csv-header': `
      仅基于当前提供的发票图像内容，根据发票数据和Excel模版中提取出的列定义，生成表格并保存[{"csv": CSV格式data}]。
      
      最终输出格式(严格遵守)：
      [{"csv": CSV格式data}]

      注意(严格遵守)：仅输出要求内容，无任何额外文本。
    `,
    'csv': `
      仅基于当前提供的发票图像内容，根据发票数据和报销规范智能生成表头（常见字段包括日期、金额、商户、分类、税号、项目名称等），生成表格。并保存[{"csv": CSV格式data}]。
      
      最终输出格式(严格遵守)：
      [{"csv": CSV格式data}]

      注意(严格遵守)：仅输出要求内容，无任何额外文本。
    `,
  };

  return basePrompt + custom + (taskPrompts[type] || '');
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
    // 尝试修复结构
    const fixedString = fixJsonStructure(s);
    try {
      console.log("修复后的字符串解析:", JSON.parse(fixedString));
      return JSON.parse(fixedString);
    } catch (fixError) {
      // Continue attempting to extract.
    }
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

// 修复结构错误的 JSON 字符串
function fixJsonStructure(jsonString: string): string {
  // 如果是字符串包裹的，先去除外层引号
  if (jsonString.startsWith('"') && jsonString.endsWith('"')) {
    jsonString = jsonString.slice(1, -1);
  }
  
  // 替换转义字符
  jsonString = jsonString.replace(/\\"/g, '"');
  
  // ❌ 修复这个关键错误：将 `}], [{"csv":` 替换为 `}, {"csv":`
  // 处理可能的空格和换行
  jsonString = jsonString.replace(
    /\}\s*\]\s*,\s*\[\s*{/g, 
    '}, {'
  );
  
  // 如果是双重数组结尾，修复为单数组
  jsonString = jsonString.replace(/\}\s*\]\s*\]/g, '}]');
  
  return jsonString;
}

export function downloadJson(data: OutputJson, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  saveAs(blob, filename);
}

export function downloadExcel(blob: Blob, filename: string) {
  saveAs(blob, filename);
}
