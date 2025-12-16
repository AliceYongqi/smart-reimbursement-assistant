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
 * 从 Qwen 返回的 text 字符串中解析出 JSON 数据和 CSV 内容
 * @param {string} text - Qwen 返回的 content[0].text
 * @returns {{ jsonData: any[], csvContent: string }}
 */
function parseQwenResponseText(responseData) {
  // 解析 JSON
	let jsonData = [];
	try {
		// responseData 可能是字符串或已解析的对象
		let respObj = responseData;
		if (typeof responseData === 'string') {
			try {
				respObj = JSON.parse(responseData);
			} catch (e) {
				respObj = responseData;
			}
		}

		// 从常见 Qwen 返回结构中取出 text
		let text = null;
		try {
			if (respObj && respObj.output && Array.isArray(respObj.output.choices)) {
				text = respObj.output.choices[0].message.content[0].text;
			}
		} catch (e) {
			// 忽略，下面会把 responseData 当字符串处理
		}

		if (!text) {
			text = typeof responseData === 'string' ? responseData : JSON.stringify(responseData);
		}

		// 使用通用解析器解析 text，保持结构不变
		jsonData = parseJsonData(text) || [];
	} catch (err) {
		console.error('JSON 解析失败:', err);
		jsonData = [];
	}

	return {
		jsonData
	};
}

/**
 * 将任意 jsonData（字符串/对象/数组）解析成 JS 对象并保持结构。
 * - 如果是对象或数组，返回其深拷贝（以防外部修改）
 * - 如果是字符串，先尝试 JSON.parse，解析失败则尝试从字符串中提取第一个完整 JSON 块再解析
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

	// 直接尝试 parse
	try {
		return JSON.parse(s);
	} catch (e) {
		// 继续尝试提取
	}

	// 查找第一个 { 或 [ 并匹配到对应闭合符
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
 * 获取指定字段名的上传文件数组（严格按字段名匹配）
 * @param {Object} req - Express request object
 * @param {string} fieldName - 要获取的字段名（如 'image'、'pdf'）
 * @returns {Array} 匹配的文件数组（可能为空）
 */
function getUploadedFiles(req, fieldName) {
  // 处理单文件上传 (multer.single)
  if (req.file) {
    // 如果指定了字段名且匹配，返回包含该文件的数组
    if (fieldName && req.file.fieldname === fieldName) {
      return [req.file];
    }
    // 如果未指定字段名，返回单个文件的数组
    if (!fieldName) {
      return [req.file];
    }
    // 指定了字段名但不匹配，返回空数组
    return [];
  }

  // 处理多文件上传 (multer.array/multer.fields)
  if (req.files && Array.isArray(req.files) && req.files.length > 0) {
    // 如果指定了字段名，返回所有匹配的文件
    if (fieldName) {
      return req.files.filter(file => file.fieldname === fieldName);
    }
    // 未指定字段名，返回所有文件
    return req.files;
  }

  // 没有上传文件
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
		if (!fs.existsSync(input)) throw new Error(`PDF文件不存在: ${input}`);
		pdfBuffer = fs.readFileSync(input);
	} else if (Buffer.isBuffer(input)) {
		pdfBuffer = input;
	} else {
		throw new Error('输入必须是文件路径字符串或Buffer对象');
	}

	const pdf = require('pdf-parse');
	const data = await pdf(pdfBuffer);

	return data.text;
}

// const pdfjs = require('pdfjs-dist');

// // 加载 PDF 并提取带坐标的文本
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

// /**
//  * 将PDF Buffer转换为图片
//  * @param {Buffer} pdfBuffer - PDF文件Buffer
//  * @param {string} outputDir - 输出目录
//  * @param {string} prefix - 文件名前缀
//  */
async function convertPdfBufferToImages(pdfBuffer, outputDir, prefix = 'invoice') {
  // 确保输出目录存在
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
    // ✅ 使用 fromBuffer 直接处理 Buffer（推荐）
    const convert = fromBuffer(pdfBuffer, options);
    
    // ✅ bulk() 现在返回 Promise，不传 callback
    const convertResult = await convert.bulk(-1); // -1 表示所有页

    // 构造生成的文件名（pdf2pic 默认格式：{prefix}.{page}.png）
    const imagePaths = convertResult.map((_, index) => {
      // 注意：页码从 1 开始
      return path.join(outputDir, `${prefix}.${index + 1}.png`);
    });

    return imagePaths;
  } catch (error) {
    console.error('PDF 转图片失败:', error);
    throw error;
  }
}

// async function convertPdfBufferToImages(pdfBuffer, outputDir, prefix = 'invoice') {
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

//     // ✅ 正确：bulk() 需要回调函数
//     storeAsImage.bulk(-1, async (err, convertResult) => {
//       if (err) {
//         await fs.unlink(tempPath).catch(() => {});
//         return reject(err);
//       }

//       try {
//         // 读取生成的图片文件
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

//         // 删除临时PDF
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
