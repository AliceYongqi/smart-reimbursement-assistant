// server.js
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const multer = require('multer');
const { getUploadedFiles, message, parseExcelOrCsv, parseQwenResponseText, parseJsonData } = require('./utils');
let XLSX_LIB = null;
try { XLSX_LIB = require('xlsx'); } catch (e) { XLSX_LIB = null; }

const app = express();

// Enable CORS (recommended for local development)
app.use(cors());

// Parse JSON and urlencoded (to avoid req.body being undefined)
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Handle file uploads
const upload = multer({ storage: multer.memoryStorage() });

// Proxy route: receive invoice fapiao + Token → forward to Qwen
app.post('/api/parse-fapiao', upload.any(), async (req, res) => {
  try {

    // Get token from frontend (supports multipart/form-data field, JSON body, or Authorization header)
    const token = (req.body && req.body.token) || (req.headers && (req.headers.authorization || req.headers.Authorization) &&
        (req.headers.authorization || req.headers.Authorization).replace(/^Bearer\s+/i, '')) || null;

    // If no token, return a more specific error
    if (!token) {
      console.error('Missing token: no token found in req.body or Authorization header');
      return res.status(400).json({ error: 'Missing token. Send token as form field `token` (multipart/form-data) or as Authorization: Bearer <token> header.' });
    }

    const summary = req.body && (req.body.summary === 'false' || req.body.summary === false) ? false : true;

    const uploadedTemplate = getUploadedFiles(req, ['template', 'file'])[0];
    const uploadedFapiao = getUploadedFiles(req, ['fapiao', 'file']) || [];

    // Gather all uploaded files (multer.any may populate req.files)
    if (uploadedFapiao.length === 0) {
      console.error('No uploaded files found in request');
      return res.status(400).json({ error: 'Missing image/pdf file. Upload a multipart/form-data file (field name: image, file or pdf).' });
    }

  // Build image data URLs for non-pdf files and proceed with multimodal flow
    const nonPdfFiles = uploadedFapiao.filter(f => !(f.mimetype === 'application/pdf' || (f.originalname && f.originalname.toLowerCase().endsWith('.pdf'))));
    const base64Images = [];
    for (const f of nonPdfFiles) {
      const imageBuffer = f.buffer; // Invoice image binary
      const mimeType = (f.mimetype) || 'image/jpeg';
      const base64Str = imageBuffer.toString('base64');
      const base64Image = `data:${mimeType};base64,${base64Str}`;
      base64Images.push(base64Image);
    }
    const content = base64Images.map(base64 => ({ image: base64 }));
    const templateBuffer = uploadedTemplate && uploadedTemplate.buffer;
    const text = await parseExcelOrCsv(templateBuffer);

    const messageContent = message(`fapiao${text.length ? '-header' : ''}`, summary) + `Excel模版如下: ${text}`;
    content.push({ text: messageContent });

    console.log('token', token);

  // Call Qwen API, do not save token on backend—use token from request directly
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
    console.log('Qwen fapiao parse json----json:', JSON.stringify(response.data  || {}));

    const parsedResp = parseQwenResponseText(JSON.stringify(response.data || {}));
    const data = parseJsonData(parsedResp);

    res.json(data);
  } catch (error) {
    console.error('Qwen API Error:', error.response?.data || error.message);
    res.status(500).json({ error: error.message });
  }
});

// Start server
const PORT = 5000;
app.listen(PORT, () => {
  console.log(`✅ Local proxy server started: http://localhost:${PORT}`);
  console.log('✅ Using model: qwen-max (Qwen 3-Max)');
});