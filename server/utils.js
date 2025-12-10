const fs = require('fs');
const path = require('path');
let XLSX;

try {
	// Lazy require so the module only needs to be installed when used
	XLSX = require('xlsx');
} catch (err) {
	// Provide a helpful error if xlsx is not installed
	XLSX = null;
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
async function parseExcelOrCsv(input) {
	if (!XLSX) {
		throw new Error("Missing dependency 'xlsx'. Please run 'npm install xlsx' in the server folder.");
	}

	let workbook;

	// Buffer input
	if (Buffer.isBuffer(input)) {
		workbook = XLSX.read(input, { type: 'buffer' });
	} else if (typeof input === 'string') {
		// filesystem path
		const ext = path.extname(input).toLowerCase();
		if (ext === '.csv' || ext === '.txt') {
			const content = fs.readFileSync(input, 'utf8');
			workbook = XLSX.read(content, { type: 'string' });
		} else {
			// For xlsx/xls etc
			workbook = XLSX.readFile(input);
		}
	} else if (input && typeof input === 'object') {
		// Multer-like file object or similar
		const filePath = input.path;
		const originalName = input.originalname || input.name || '';
		const ext = path.extname(originalName || filePath || '').toLowerCase();

		if (filePath && fs.existsSync(filePath)) {
			const data = fs.readFileSync(filePath);
			if (ext === '.csv') {
				workbook = XLSX.read(data.toString('utf8'), { type: 'string' });
			} else {
				workbook = XLSX.read(data, { type: 'buffer' });
			}
		} else if (input.buffer && Buffer.isBuffer(input.buffer)) {
			// Some upload middlewares provide a buffer property
			if (ext === '.csv') {
				workbook = XLSX.read(input.buffer.toString('utf8'), { type: 'string' });
			} else {
				workbook = XLSX.read(input.buffer, { type: 'buffer' });
			}
		} else {
			throw new Error('Unsupported file object provided to parseExcelOrCsv');
		}
	} else {
		throw new Error('Unsupported input type for parseExcelOrCsv');
	}

	const sheetNames = workbook.SheetNames || [];
	const parts = sheetNames.map((name) => {
		const sheet = workbook.Sheets[name];
		// Convert each sheet to CSV text for a simple, consistent textual representation
		const csv = XLSX.utils.sheet_to_csv(sheet);
		return `--- Sheet: ${name} ---\n${csv}`;
	});

	return parts.join('\n\n');
}

/**
 * Extract text from a PDF file (Buffer, file path, or multer-like file object).
 * Returns an object: { text, numpages, info, metadata }
 * Requires the `pdf-parse` package. If it's not installed, throws an informative error.
 */
async function parsePdfText(input) {
	let buffer;
	if (Buffer.isBuffer(input)) {
		buffer = input;
	} else if (typeof input === 'string') {
		if (!fs.existsSync(input)) throw new Error('PDF file path does not exist: ' + input);
		buffer = fs.readFileSync(input);
	} else if (input && typeof input === 'object') {
		const filePath = input.path;
		if (filePath && fs.existsSync(filePath)) {
			buffer = fs.readFileSync(filePath);
		} else if (input.buffer && Buffer.isBuffer(input.buffer)) {
			buffer = input.buffer;
		} else {
			throw new Error('Unsupported PDF input object. Provide a Buffer, a file path, or a multer-like file with .buffer or .path');
		}
	} else {
		throw new Error('Unsupported input type for parsePdfText');
	}

	let pdfParse;
	try {
		pdfParse = require('pdf-parse');
	} catch (e) {
		throw new Error("Missing dependency 'pdf-parse'. Please run 'npm install pdf-parse' in the server folder.");
	}

	try {
		const data = await pdfParse(buffer);
		return {
			text: data.text || '',
			numpages: data.numpages || (data.info && data.info.NPages) || 0,
			info: data.info || null,
			metadata: data.metadata || null
		};
	} catch (e) {
		throw new Error('Failed to parse PDF: ' + (e.message || String(e)));
	}
}

/**
 * Parse a Qwen-style response object and extract text content from message.content fields.
 * - Removes triple-backtick fences (e.g. ```json ... ```)
 * - Returns cleaned text(s) and attempts to parse the first JSON object/array found
 *
 * @param {object} resp The response object from Qwen (may be the raw response or response.data)
 * @returns {{rawTexts:string[], cleanedTexts:string[], combined:string, parsed:any|null}}
 */
function parseQwenResponse(resp) {
	if (!resp) return { rawTexts: [], cleanedTexts: [], combined: '', parsed: null };

	// If caller passed axios response, use resp.data
	const data = resp.data || resp;

	const texts = [];

	const pushText = (t) => {
		if (!t && t !== 0) return;
		if (typeof t !== 'string') t = String(t);
		texts.push(t);
	};

	// Helper to extract from a content value which may be array or string
	const extractFromContent = (content) => {
		if (!content) return;
		if (Array.isArray(content)) {
			for (const c of content) {
				if (c && typeof c === 'object' && 'text' in c) pushText(c.text);
				else if (typeof c === 'string') pushText(c);
			}
		} else if (typeof content === 'string') {
			pushText(content);
		} else if (typeof content === 'object') {
			if ('text' in content) pushText(content.text);
		}
	};

	// Common paths
	try {
		if (data.output && Array.isArray(data.output.choices)) {
			for (const ch of data.output.choices) {
				const msg = ch.message || {};
				extractFromContent(msg.content);
			}
		}

		// older/alternate shape: choices directly under data
		if (Array.isArray(data.choices)) {
			for (const ch of data.choices) {
				const msg = ch.message || {};
				extractFromContent(msg.content || ch.message?.content || ch.message?.content?.text);
			}
		}

		// fallback: if there's a top-level 'content' array
		if (data.content) extractFromContent(data.content);
	} catch (e) {
		// ignore extraction errors
	}

	// Clean up code fences like ```json ... ``` and surrounding whitespace
	const cleaned = texts.map(t => t.replace(/```(?:json)?\s*([\s\S]*?)\s*```/gi, '$1').trim());

	const combined = cleaned.join('\n\n').trim();

	// Try to parse JSON from the combined text or from individual cleaned pieces
	const tryParseJSON = (s) => {
		if (!s || typeof s !== 'string') return null;
		const trimmed = s.trim();
		try {
			return JSON.parse(trimmed);
		} catch (e) {
			// attempt to find a JSON object/array substring
			const objMatch = trimmed.match(/(\{[\s\S]*\})/);
			if (objMatch) {
				try { return JSON.parse(objMatch[1]); } catch (e2) {}
			}
			const arrMatch = trimmed.match(/(\[[\s\S]*\])/);
			if (arrMatch) {
				try { return JSON.parse(arrMatch[1]); } catch (e2) {}
			}
			return null;
		}
	};

	let parsed = tryParseJSON(combined);
	if (parsed == null) {
		for (const piece of cleaned) {
			parsed = tryParseJSON(piece);
			if (parsed != null) break;
		}
	}

	return {
		rawTexts: texts,
		cleanedTexts: cleaned,
		combined,
		parsed: parsed || null
	};
}


function parseRawInvoiceFromJson(fapiaoJson) {
    let parsedFapiao = null;
    if (fapiaoJson && typeof fapiaoJson === 'object') {
      try {
	// fapiaoJson may contain required fields, do a mapping to ensure field names are consistent
        const j = fapiaoJson;
        parsedFapiao = {
          amount: safeParseNumber(j.amount || j.total || j.totalAmount),
          taxId: j.taxId || j.tax_number || j.tax || j.税号 || '',
          date: j.date || j.invoice_date || j.日期 || '',
          seller: j.seller || j.seller_name || j.销售方 || '',
          buyer: j.buyer || j.buyer_name || j.购买方 || '',
          invoiceType: j.invoiceType || j.type || j.发票类型 || '',
          items: Array.isArray(j.items) ? j.items.map(it => ({
            name: it.name || it.item || '',
            category: it.category || it.cat || '',
            price: safeParseNumber(it.price || it.unitPrice || it['单价'] || it['unitPrice']),
            quantity: safeParseNumber(it.quantity || it.qty || it['数量'] || it['qty'])
          })) : []
        };
        console.log('Parsed RawInvoice from parsedResp:', parsedFapiao);
      } catch (e) {
        console.error('Error mapping parsedResp.parsed to invoice:', e);
        parsedFapiao = null;
      }
    }

    if (!parsedFapiao) {
      try {
        parsedFapiao = parseRawInvoiceFromText(fapiaoJson);
        console.log('Parsed RawInvoice (fallback):', parsedFapiao);
      } catch (e) {
        console.error('Failed to parse fapiao from text:', e.message || e);
        parsedFapiao = null;
      }
    }
    return parsedFapiao;
}

 function safeParseNumber(str) {
    if (str == null) return 0;
    const m = String(str).replace(/[,，\s]/g, '').match(/-?\d+(?:\.\d+)?/);
    return m ? Number(m[0]) : 0;
}
/**
 * 从 response 的结果或原始响应中提取两个文件的有效字段：
 * - JSON 部分（若模型返回了 JSON 代码块或可解析的 JSON）
 * - Excel 风格表格数据（从模型返回的文本表格或 markdown 表格中解析为行数组）
 *
 * 输入是 axios response 原始对象。
 * 返回 { json, excelRows, combined, rawTexts }
 */
function extractJsonAndExcel(response) {
	const parsedResp = parseQwenResponse(response);
	const combined = parsedResp.combined || '';
	const rawTexts = parsedResp.rawTexts || parsedResp.cleanedTexts || [];

	// Try parsed JSON first (parseQwenResponse attempts JSON parsing)
	let json = parsedResp.parsed && typeof parsedResp.parsed === 'object' ? parsedResp.parsed : null;

	// If not parsed, try to extract a JSON object/array substring from the combined text
	if (!json && combined) {
		const objMatch = combined.match(/(\{[\s\S]*\})/);
		const arrMatch = combined.match(/(\[[\s\S]*\])/);
		const match = objMatch || arrMatch;
		if (match) {
			try {
				json = JSON.parse(match[1]);
			} catch (e) {
				// ignore parse error; leave json as null
			}
		}
	}

	// Extract the base64 part that follows the JSON. We assume the model output puts the base64
	// on the following line(s). We'll take the text after the JSON substring (if any), trim and
	// collapse whitespace to produce a continuous base64 string.
	let excel = '';
	if (combined) {
		// find the first JSON/array match location
		const jsonMatch = combined.match(/(\{[\s\S]*\})|(\[[\s\S]*\])/);
		let after = combined;
		if (jsonMatch) {
			const idx = combined.indexOf(jsonMatch[0]);
			if (idx >= 0) {
				after = combined.slice(idx + jsonMatch[0].length).trim();
			}
		}

		// Collapse newlines/spaces — base64 is typically continuous; keep only base64-valid chars
		const candidate = (after || '').replace(/\s+/g, '');
		// Basic base64 validation: length and allowed chars
		if (candidate && candidate.length > 20 && /^[A-Za-z0-9+/=]+$/.test(candidate)) {
			excel = candidate;
		} else {
			// fallback: if there's any non-empty remainder, return it trimmed
			excel = (after || '').trim();
		}
	}

	return { json: json || null, excel };
}

// Safe stringify for logging (falls back to util.inspect if circular)
function safeJson(obj) {
	try {
		return JSON.stringify(obj);
	} catch (e) {
		try {
			const util = require('util');
			return util.inspect(obj, { depth: 2 });
		} catch (e2) {
			return String(obj);
		}
	}
}

// Helper: get uploaded file by preferred field names or fallback to first file
function getUploadedFiles(req, preferred = []) {
	// multer.single populates req.file; multer.any populates req.files
	if (req.file) return [req.file];
	if (req.files && Array.isArray(req.files) && req.files.length > 0) {
		for (const name of preferred) {
			const f = req.files.find(x => x.fieldname === name);
			if (f) return [f];
		}
		return req.files;
	}
	return null;
}

function message(type) {
	const basePrompt = `You are a senior finance expert with 10 years of experience, specializing in invoice, Excel data, and financial report processing. You can:
		✅ Quickly extract invoice information (amount, tax rate, vendor, date, etc.), automatically detect anomalies;
		✅ Master Excel functions (VLOOKUP, SUMIFS, etc.), clean data and generate pivot tables in one click;
		✅ Explain report logic in plain language, avoid jargon;
		✅ Remain patient and humorous.
		Important rules:
		- All answers must strictly follow the user-specified output format;
		- Do not add any explanations, comments, Markdown, Chinese notes, or extra text;
		- Only output the required content, do not add any characters before or after.`;

	switch (type) {
		case 'fapiao':
			return basePrompt + `
				Task in two steps, strictly in order:
				Step 1: Extract key fields from one or more invoices provided by the user and output as valid JSON, example:
				{ "amount": number, "taxId": string, "date": "YYYY-MM-DD", "seller": string, "buyer": string, "invoiceType": string, "items": [{"name":string,"category":string,"price":number,"quantity":number}] }

				Step 2: Based on the extracted invoice info and user-provided Excel column definitions, generate an Excel file containing the invoice data and return its base64 encoded string.

				Final output format (strictly follow):
				<First line: JSON object>
				<Second line: base64 string>

				Note: Do not output any other content, including "OK", "Here is...", etc.`;
    
		case 'parseExcel':
			return basePrompt + `
				Extract all column names (first row headers) from the user-provided Excel file and return as a JSON array.
				Example output: ["Date","Amount","Merchant","Category"]
				Requirements:
				- Only output JSON array;
				- Do not add any extra text, explanation, or format;
				- Column order must match the original file.`;
    
		case 'generateExcel':
			return basePrompt + `
				Based on the user-provided invoice data array and Excel column definitions, map the data to columns and generate an Excel file, then return its base64 encoded string.
				Requirements:
				- Only output base64 string;
				- Do not add any JSON, explanation, line breaks, or other characters;
				- Ensure base64 can be directly decoded to a valid .xlsx file.`;
    
		default:
			return basePrompt;
	}
}

function parseRawInvoiceFromText(text) {
    try {
    const j = JSON.parse(text);
    const fapiao = {
        amount: safeParseNumber(j.amount || j.total || j.totalAmount),
        taxId: j.taxId || j.tax_number || j.tax || j.税号 || '',
        date: j.date || j.invoice_date || j.日期 || '',
        seller: j.seller || j.seller_name || j.销售方 || '',
        buyer: j.buyer || j.buyer_name || j.购买方 || '',
        invoiceType: j.invoiceType || j.type || j.发票类型 || '',
        items: Array.isArray(j.items) ? j.items.map(it => ({
        name: it.name || it.item || '',
        category: it.category || it.cat || '',
        price: safeParseNumber(it.price || it.unitPrice || it['单价'] || it['unitPrice']),
        quantity: safeParseNumber(it.quantity || it.qty || it['数量'] || it['qty'])
        })) : []
    };
    return fapiao;
    } catch (e) {
	// Not JSON—fallback to regex extraction
    }

    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const joined = lines.join('\n');

    const getField = (keys) => {
    for (const key of keys) {
        const re = new RegExp(key + '[:：]?\\s*([^\\n,。]+)', 'i');
        const m = joined.match(re);
        if (m && m[1]) return m[1].trim();
    }
    return '';
    };

    const amountStr = getField(['金额', '合计', '总金额', 'total', 'amount']);
    const taxId = getField(['税号', '纳税人识别号', 'taxId', 'tax_number']);
    const date = getField(['日期', '开票日期', 'date', 'invoice_date']);
    const seller = getField(['销售方', '开票单位', 'seller']);
    const buyer = getField(['购买方', '购方', 'buyer']);
    const invoiceType = getField(['发票类型', 'type', 'invoiceType']);

    const items = [];
    for (const line of lines) {
    const m = line.match(/(.+?)\\s+(?:单价|价格|price)[:：]?\\s*([\d,\.]+)\\s*(?:数量|qty|数量[:：])?\\s*([\d,\.]+)/i);
    if (m) {
        items.push({ name: m[1].trim(), category: '', price: safeParseNumber(m[2]), quantity: safeParseNumber(m[3]) });
        continue;
    }
    const m2 = line.match(/^(.*?)\\s+([\d,\.]+)\\s+([\d,\.]+)$/);
    if (m2) {
        items.push({ name: m2[1].trim(), category: '', price: safeParseNumber(m2[2]), quantity: safeParseNumber(m2[3]) });
    }
    }

    return {
    amount: safeParseNumber(amountStr),
    taxId: taxId || '',
    date: date || '',
    seller: seller || '',
    buyer: buyer || '',
    invoiceType: invoiceType || '',
    items
    };
}

module.exports = {
	parseExcelOrCsv,
	parseQwenResponse,
	extractJsonAndExcel,
	safeJson,
	getUploadedFiles,
    message,
    parseRawInvoiceFromText,
    parseRawInvoiceFromJson,
    parsePdfText
};

