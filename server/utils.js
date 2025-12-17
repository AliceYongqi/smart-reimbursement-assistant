const fs = require('fs');
const path = require('path');
const { fromPath, fromBuffer } = require('pdf2pic');

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

	if (!input) {
		return '';
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
 * Parses JSON data and CSV content from the text string returned by Qwen
 * @param {string} text - The content[0].text returned by Qwen
 * @returns {{ jsonData: any[], csvContent: string }}
 */
function parseQwenResponseText(responseData) {
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
function parseJsonData(raw) {
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

/**
 * Retrieves an array of uploaded files for the specified field name (strictly matched by field name)
 * @param {Object} req - Express request object
 * @param {string} fieldName - The field name to retrieve (e.g., 'image', 'pdf')
 * @returns {Array} An array of matching files (possibly empty)
 */
function getUploadedFiles(req, fieldName) {
  // Handle single file upload (multer.single)
  if (req.file) {
    if (fieldName && req.file.fieldname === fieldName) {
      return [req.file];
    }
    if (!fieldName) {
      return [req.file];
    }
    return [];
  }

  // Handle multiple file uploads (multer.array/multer.fields)
  if (req.files && Array.isArray(req.files) && req.files.length > 0) {
    if (fieldName) {
      return req.files.filter(file => file.fieldname === fieldName);
    }
    return req.files;
  }

  return [];
}

function message(type, summary = true, custom = '') {
  const basePrompt = `你是一位拥有10年经验的高级财务专家，专精处理发票、Excel数据和财务报表。你能快速解析发票信息，精通Excel函数。
  	重要规则(严格遵守)：所有回答必须严格遵循用户指定的输出格式；禁止添加任何解释、注释、Markdown、中文说明或额外文本；只输出要求的内容，前后不要加任何字符。`;

  const taskPrompts = {
    'fapiao-header': `
      1. 从发票内容提取重要字段，以合法JSON格式输出，关键信息包括但不限于：金额、税号、日期、销售方、购买方、发票类型，以及商品明细（名称、类别、单价、数量等）。请从财务处理的角度判断哪些信息是重要的，并确保输出的JSON格式正确。
	  	最终输出格式：<JSON object[]>
	  2. 请对第一步发票数据进行汇总分析，生成JSON格式统计信息。统计内容包括总金额、发票数量，按项目和日期分别汇总的总金额与发票数量。输出格式为{summary: object}，summary中包含上述统计项。若输入数据为空或字段缺失，返回空统计结果。结果push到第1步生成的object[]数组后面。
      3. 根据提取的发票信息和用户提供的Excel模版提取出列定义（包括但不限于第一行），生成表格并返回{csv: CSV格式data}，push到第2步生成的object[]数组后面。
      	
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

	'fapiao-files': `
      1. 从上传的发票内容提取重要字段，以合法JSON格式输出，关键信息包括但不限于：金额、税号、日期、销售方、购买方、发票类型，以及商品明细（名称、类别、单价、数量等）。请从财务处理的角度判断哪些信息是重要的，并确保输出的JSON格式正确。
	  	最终输出格式：<JSON object[]>
	  2. 请对第一步发票数据进行汇总分析，生成JSON格式统计信息。统计内容包括总金额、发票数量，按项目和日期分别汇总的总金额与发票数量。输出格式为{summary: object}，summary中包含上述统计项。若输入数据为空或字段缺失，返回空统计结果。结果push到第1步生成的object[]数组后面。
      3. 根据提取的发票信息和报销规范智能生成表头（常见字段包括但不限于：日期、金额、商户、分类、税号等），生成表格并返回{csv: CSV格式data}，push到第2步生成的object[]数组后面。
      	
	  最终输出格式(严格遵守)：
      JSON object[]

      注意：仅输出要求内容，无额外文本。
    `,

	'fapiao-files-header': `
      1. 从上传的发票内容提取重要字段，以合法JSON格式输出，关键信息包括但不限于：金额、税号、日期、销售方、购买方、发票类型，以及商品明细（名称、类别、单价、数量等）。请从财务处理的角度判断哪些信息是重要的，并确保输出的JSON格式正确。
	  	最终输出格式：<JSON object[]>
	  2. 请对第一步发票数据进行汇总分析，生成JSON格式统计信息。统计内容包括总金额、发票数量，按项目和日期分别汇总的总金额与发票数量。输出格式为{summary: object}，summary中包含上述统计项。若输入数据为空或字段缺失，返回空统计结果。结果push到第1步生成的object[]数组后面。
      3. 文件列表的第一个文件为Excel模版文件，根据提取的发票信息和报销规范智能填写表格并返回{csv: CSV格式data}，push到第2步生成的object[]数组后面。
      	
	  最终输出格式(严格遵守)：
      JSON object[]

      注意：仅输出要求内容，无额外文本。
    `
  };

  return basePrompt + custom + (summary ? '任务分三步: ' : '任务分三步（忽略第二步汇总分析，仅完成第一步和第三步）: ') + (taskPrompts[type] || '');
}

async function pdfToText(input) {
	let pdfBuffer;
	if (typeof input === 'string') {
		if (!fs.existsSync(input)) throw new Error(`PDF file not found: ${input}`);
		pdfBuffer = fs.readFileSync(input);
	} else if (Buffer.isBuffer(input)) {
		pdfBuffer = input;
	} else {
		throw new Error('The input must be a file path string or a Buffer object.');
	}

	const pdf = require('pdf-parse');
	const data = await pdf(pdfBuffer);

	return data.text;
}

// const pdfjs = require('pdfjs-dist');

// // Load PDF and extract text with coordinates
// async function extractTextWithPosition(pdfPath) {
//   const data = new Uint8Array(fs.readFileSync(pdfPath));
//   const doc = await pdfjs.getDocument({ data }).promise;
//   const page = await doc.getPage(1);

//   const content = await page.getTextContent();
//   // content.items: [{ str: "文本", transform: [a,b,c,d,e,f] }]
//   // transform[4] = x, transform[5] = y

//   const texts = content.items.map(item => ({
//     text: item.str,
//     x: Math.round(item.transform[4]),
//     y: Math.round(item.transform[5])
//   }));

//   return texts;
// }

/**
 * Converts a PDF Buffer to image files
 * @param {Buffer} pdfBuffer - The PDF file as a Buffer object
 * @param {string} outputDir - Directory to save the output images
 * @param {string} prefix - Prefix for generated image filenames
 */
async function convertPdfBufferToImages(pdfBuffer, outputDir, prefix = 'fapiao') {
  // Ensure the output directory exists.
  await fs.mkdir(outputDir, { recursive: true });

  const options = {
    density: 300,
    saveFilename: prefix,
    savePath: outputDir,
    format: 'png',
    width: 2480,
    height: 3508,
    quality: 100
  };

  try {
    const convert = fromBuffer(pdfBuffer, options);
    const convertResult = await convert.bulk(-1); // -1 means all pages

    // Construct generated filenames (pdf2pic default format: {prefix}.{page}.png)
    const imagePaths = convertResult.map((_, index) => {
      // Note: page numbers start from 1
      return path.join(outputDir, `${prefix}.${index + 1}.png`);
    });

    return imagePaths;
  } catch (error) {
    console.error('PDF to image conversion failed:', error);
    throw error;
  }
}

// async function convertPdfBufferToImages(pdfBuffer, outputDir, prefix = 'fapiao') {
//   const tempPath = path.join(outputDir, `${prefix}_temp.pdf`);
//   await fs.writeFile(tempPath, pdfBuffer);

//   return new Promise((resolve, reject) => {
//     const options = {
//       density: 300,
//       saveFilename: prefix,
//       savePath: outputDir,
//       format: 'png',
//       width: 2480,
//       height: 3508,
//       quality: 100
//     };

//     const storeAsImage = fromPath(tempPath, options);

//     storeAsImage.bulk(-1, async (err, convertResult) => {
//       if (err) {
//         await fs.unlink(tempPath).catch(() => {});
//         return reject(err);
//       }

//       try {
//         // Read generated image files
//         const files = await fs.readdir(outputDir);
//         const images = files
//           .filter(f => f.startsWith(prefix) && f.endsWith('.png'))
//           .sort((a, b) => {
//             const matchA = a.match(/\.(\d+)\.png$/);
//             const matchB = b.match(/\.(\d+)\.png$/);
//             const numA = matchA ? parseInt(matchA[1]) : 0;
//             const numB = matchB ? parseInt(matchB[1]) : 0;
//             return numA - numB;
//           })
//           .map(f => path.join(outputDir, f));

//         // Delete temporary PDF
//         await fs.unlink(tempPath);
        
//         resolve(images);
//       } catch (error) {
//         reject(error);
//       }
//     });
//   });
// }

module.exports = {
	parseExcelOrCsv,
	parseQwenResponseText,
	getUploadedFiles,
	message,
	parseJsonData,
	pdfToText,
	convertPdfBufferToImages
};
