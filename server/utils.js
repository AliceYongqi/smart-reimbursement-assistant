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

	// Recursively collect strings from various shapes: string, array, or objects with 'text' or 'content'
	function collectStrings(value) {
		if (value == null) return [];
		if (typeof value === 'string') return [value];
		if (typeof value === 'number' || typeof value === 'boolean') return [String(value)];
		if (Array.isArray(value)) {
			const out = [];
			for (const v of value) {
				out.push(...collectStrings(v));
			}
			return out;
		}
		if (typeof value === 'object') {
			// Prefer explicit/common fields and try likely nested shapes
			if (value.text !== undefined) return collectStrings(value.text);
			if (value.content !== undefined) return collectStrings(value.content);
			if (value.data !== undefined) return collectStrings(value.data);
			if (Array.isArray(value.parts)) return collectStrings(value.parts);
			if (Array.isArray(value.items)) return collectStrings(value.items);
			// Some message shapes put text under nested objects like { text: [{ text: '...' }] }
			// Fallback: iterate keys in insertion order to preserve message ordering
			const out = [];
			for (const k of Object.keys(value)) {
				out.push(...collectStrings(value[k]));
			}
			return out;
		}
		return [];
	}

	function extractFromContent(content) {
		const collected = collectStrings(content);
		for (const s of collected) {
			if (s || s === 0) texts.push(String(s));
		}
	}

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
				extractFromContent(msg.content || ch.message?.content || ch.message?.content?.text || ch);
			}
		}

		// fallback: if there's a top-level 'content' array or 'text'
		if (data.content) extractFromContent(data.content);
		if (data.text) extractFromContent(data.text);
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
    let parsedFapiao = [];
	if (fapiaoJson && fapiaoJson.length > 0) {
		for (const item of fapiaoJson) {
			if (typeof item === 'object') {
				try {
					// fapiaoJson may contain required fields, do a mapping to ensure field names are consistent
					const j = item;
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
					parsedFapiao.push(fapiao);
					console.log('Parsed RawInvoice from parsedResp:', parsedFapiao);
				} catch (e) {
					console.error('Error mapping parsedResp.parsed to invoice:', e);
				}
			}
		}
	}

    // if (!parsedFapiao) {
    //   try {
    //     parsedFapiao = parseRawInvoiceFromText(fapiaoJson);
    //     console.log('Parsed RawInvoice (fallback):', parsedFapiao);
    //   } catch (e) {
    //     console.error('Failed to parse fapiao from text:', e.message || e);
    //     parsedFapiao = null;
    //   }
    // }
    return parsedFapiao;
}

 function safeParseNumber(str) {
    if (str == null) return 0;
    const m = String(str).replace(/[,，\s]/g, '').match(/-?\d+(?:\.\d+)?/);
    return m ? Number(m[0]) : 0;
}

/**
 * 从 Qwen 返回的 text 字符串中解析出 JSON 数据和 CSV 内容
 * @param {string} text - Qwen 返回的 content[0].text
 * @returns {{ jsonData: any[], csvContent: string }}
 */
function parseQwenResponseText(responseData) {
  // 按 "csv:" 分割，最多分成两部分
  const text = JSON.parse(responseData)['output']['choices'][0]['message']['content'][0]['text'];
  const parts = text.trim().split(/^csv:/m);
  console.log('JSON.parse(responseData)', JSON.parse(responseData));
  console.log('text', text);

  let jsonStr = '';
  let csvContent = '';

  if (parts.length === 1) {
    // 没有 csv，整个是 JSON
    jsonStr = parts[0].trim();
    csvContent = '';
  } else if (parts.length >= 2) {
    // 第一部分是 JSON，后面合并为 CSV（防止内容中有多个 "csv:"）
    jsonStr = parts[0].trim();
    
	for (let i = 1; i < parts.length; i++) {
		csvContent += parts[i];
	}
  }

  console.log('jsonStr=========', jsonStr);
  console.log('csvContent=========', csvContent);
  // 解析 JSON
  let jsonData = [];
  try {
    // 确保 JSON 字符串以 [ 开头、] 结尾
    if (jsonStr.startsWith('[') && jsonStr.endsWith(']')) {
      jsonData = JSON.parse(jsonStr);
    } else {
      console.warn('JSON 部分格式异常:', jsonStr.substring(0, 100));
    }
  } catch (err) {
    console.error('JSON 解析失败:', err);
    jsonData = [];
  }

  return {
    jsonData,       // 发票对象数组
    csvContent      // 纯 CSV 内容（不含 "csv:" 前缀）
  };
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
  const basePrompt = `你是一位拥有10年经验的高级财务专家，专精处理发票、Excel数据和财务报表。你能：
    ✅ 快速解析发票信息（金额、税率、供应商、日期等），自动识别异常；
    ✅ 精通Excel函数（VLOOKUP、SUMIFS等），一键清洗数据、生成透视表；
    ✅ 用简单大白话解释报表逻辑，拒绝术语轰炸；
    ✅ 保持耐心又幽默。
    重要规则：
    - 所有回答必须严格遵循用户指定的输出格式；
    - 禁止添加任何解释、注释、Markdown、中文说明或额外文本；
    - 只输出要求的内容，前后不要加任何字符。`;

  switch (type) {
    case 'fapiao':
      return basePrompt + `
        任务分两步，严格按顺序执行：
        第一步：从用户提供的一张或多张发票内容中提取重要字段，并以合法 JSON 格式输出，示例：
        [{ "amount": 数值, "taxId": 字符串, "date": "YYYY-MM-DD", "seller": 字符串, "buyer": 字符串, "invoiceType": 字符串, "items": [{"name":字符串,"category":字符串,"price":数值,"quantity":数值}] }]

        第二步：根据上述提取的发票信息，结合用户提供的 Excel 列定义，生成一个包含该发票数据的表格，并返回返回csv格式。

        最终输出格式（必须严格遵守）：
        <第一行：JSON object[]>
        <第二行：csv {csv: string}  csv: 不可变动的字段名，后面跟着冒号和 csv 格式字符串（必须）>

        注意：不要输出任何其他内容，包括“好的”、“以下是…”等。`;
    
    case 'parseExcel':
      return basePrompt + `
        请从用户提供的 Excel 文件内容中提取所有列名（即第一行表头），并以 JSON 数组格式返回。
        示例输出：["日期","金额","商户","分类"]
        要求：
        - 仅输出 JSON 数组；
        - 不要任何额外文本、解释或格式；
        - 列名顺序必须与原始文件一致。`;
    
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
	parseQwenResponseText,
	safeJson,
	getUploadedFiles,
    message,
    parseRawInvoiceFromJson
};