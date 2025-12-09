// server.js
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const multer = require('multer');
const { getUploadedFiles, message, parseExcelOrCsv, parseRawInvoiceFromJson,
  parseQwenResponse, extractJsonAndExcel, safeJson } = require('./utils');
let XLSX_LIB = null;
try { XLSX_LIB = require('xlsx'); } catch (e) { XLSX_LIB = null; }

const app = express();

// 启用 CORS（本地开发无需配置，但建议保留）
app.use(cors());

// 解析 JSON 和 urlencoded（避免 req.body 为 undefined 的情况）
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 处理文件上传
const upload = multer({ storage: multer.memoryStorage() });

// 解析模板：将模板文件发送到 Qwen，请求返回模板字段数组（JSON）
app.post('/api/parse-template', upload.any(), async (req, res) => {
  try {
    const token = (req.body && req.body.token) || (req.headers && (req.headers.authorization || req.headers.Authorization) && (req.headers.authorization || req.headers.Authorization).replace(/^Bearer\s+/i, '')) || null;
    if (!token) return res.status(400).json({ error: 'Missing token' });
    const uploaded = getUploadedFiles(req, ['template', 'file'])[0];
    const templateBuffer = uploaded && uploaded.buffer;
    if (!templateBuffer) return res.status(400).json({ error: 'Missing template file. Upload file field named "template" or "file" as multipart/form-data.' });
    const text = await parseExcelOrCsv(templateBuffer);
    const messageContent = message('parseExcel') + text;

    const qwenUrl = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation';
    const payload = {
      model: 'qwen-vl-max',
      input: {
        task: 'text-generation',
        messages: [
          {
            role: 'user',
            content: [
              { text: messageContent }
            ]
          }
        ]
      }
    };

    const response = await axios.post(qwenUrl, payload, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    // 使用 parseQwenResponse 提取并清理模型返回的文本/JSON
    const parsedResp = parseQwenResponse(response);
    console.log('Qwen template parse cleaned:', parsedResp.combined);

    // 如果解析出数组则直接返回
    if (parsedResp.parsed && Array.isArray(parsedResp.parsed)) return res.json(parsedResp.parsed);

    // 否则尝试从合并文本或首个片段解析为数组（保留原始 response 以便调试）
    const raw = parsedResp.combined || parsedResp.cleanedTexts[0] || JSON.stringify(response.data);

    try {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) return res.json(arr);
    } catch (e) {
      // ignore and continue
    }

    const m = raw.match(/\[.*\]/s);
    if (m) {
      try {
        const arr2 = JSON.parse(m[0]);
        if (Array.isArray(arr2)) return res.json(arr2);
      } catch (e) {
        // ignore
      }
    }

    res.json({ raw: raw, cleanedTexts: parsedResp.cleanedTexts, original: response.data });
  } catch (err) {
    console.error('parse-template error', err.response?.data || err.message || err);
    res.status(500).json({ error: err.message || String(err) });
  }
});

// 代理路由：接收发票图片 + Token → 转发给 Qwen
app.post('/api/parse-fapiao', upload.any(), async (req, res) => {
  try {

    // 从前端获取 Token（支持 multipart/form-data 字段、JSON body，或 Authorization header）
    const token = (req.body && req.body.token) ||
      (req.headers && (req.headers.authorization || req.headers.Authorization) &&
        (req.headers.authorization || req.headers.Authorization).replace(/^Bearer\s+/i, '')) ||
      null;

    // 如果没有 token，返回更明确的错误
    if (!token) {
      console.error('Missing token: no token found in req.body or Authorization header');
      return res.status(400).json({ error: 'Missing token. Send token as form field `token` (multipart/form-data) or as Authorization: Bearer <token> header.' });
    }

    const templateHeaders = req.body?.templateHeaders ?? [];
    if (!templateHeaders) return res.status(400).json({ error: 'Missing headers' });

    // Support various field names: prefer 'image', then 'file'
    const uploadedFiles = getUploadedFiles(req, ['image', 'file']);
    if (uploadedFiles.length === 0) {
      console.error('No uploaded files found in req.files');
      return res.status(400).json({ error: 'Missing image file. Upload a multipart/form-data file (field name: image or file).' });
    }

    const base64Images = [];
    for (const f of uploadedFiles) {
      const imageBuffer = f.buffer; // 发票图片二进制
      // 使用上传文件的 mimetype 构造 data URL 前缀，避免模型将裸 base64 误当成 URL
      const mimeType = (f.mimetype) || 'image/jpeg';
      const base64Str = imageBuffer.toString('base64');
      const base64Image = `data:${mimeType};base64,${base64Str}`;
      base64Images.push(base64Image);
    }
    const content = base64Images.map(base64 => ({ image: base64 }));
    const messageContent = message('fapiao') + templateHeaders;
    content.push({ text: messageContent });
    console.log('token', token);

    // 调用 Qwen API，不在后端保存 token——直接使用来自请求的 token
    const qwenUrl = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation';
    const payload = {
      model: 'qwen-vl-max',
      input: {
        task: 'image-text-generation',
        messages: [
          {
            role: 'user',
            content: content
          }
        ]
      }
    };

    const response = await axios.post(qwenUrl, payload, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    // console.log('Qwen fapiao parse rrrrrrrrrr:', JSON.stringify(response.data || {}));

    const parsedResp = extractJsonAndExcel(response);
    // console.log('Qwen fapiao parse json----json:', JSON.stringify(parsedResp.json || {}));

    const parsedFapiao = parseRawInvoiceFromJson(parsedResp.json ||'');
    console.log('Qwen fapiao parse cleaned:', JSON.stringify(parsedFapiao));

    // 返回 JSON：parsed 发票对象 + excel 的 base64 字符串（前端负责转换为 Blob）
    const excelBase64 = parsedResp.excel || '';
    res.json({
      parsedFapiao,
      excelBase64,
    });
  } catch (error) {
    console.error('Qwen API Error:', error.response?.data || error.message);
    res.status(500).json({ error: error.message });
  }
});

// 启动服务器
const PORT = 5000;
app.listen(PORT, () => {
  console.log(`✅ 本地代理服务器已启动: http://localhost:${PORT}`);
  console.log('✅ 使用模型: qwen-max (千问3-Max)');
});