// server.js
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const multer = require('multer');
const { getUploadedFiles, message, parseExcelOrCsv, parseRawInvoiceFromJson,
  parseQwenResponse, extractJsonAndExcel, safeJson, parsePdfText, parseRawInvoiceFromText } = require('./utils');
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

// Parse template: send template file to Qwen, request returns template field array (JSON)
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
  // Use parseQwenResponse to extract and clean model returned text/JSON
  const parsedResp = parseQwenResponse(response);
  console.log('Qwen template parse cleaned:', parsedResp.combined);

  // If an array is parsed, return directly
  if (parsedResp.parsed && Array.isArray(parsedResp.parsed)) return res.json(parsedResp.parsed);

  // Otherwise, try to parse array from merged text or first fragment (keep original response for debugging)
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

// Proxy route: receive invoice image + Token → forward to Qwen
app.post('/api/parse-fapiao', upload.any(), async (req, res) => {
  try {

  // Get token from frontend (supports multipart/form-data field, JSON body, or Authorization header)
    const token = (req.body && req.body.token) ||
      (req.headers && (req.headers.authorization || req.headers.Authorization) &&
        (req.headers.authorization || req.headers.Authorization).replace(/^Bearer\s+/i, '')) ||
      null;

    // If no token, return a more specific error
    if (!token) {
      console.error('Missing token: no token found in req.body or Authorization header');
      return res.status(400).json({ error: 'Missing token. Send token as form field `token` (multipart/form-data) or as Authorization: Bearer <token> header.' });
    }

    const templateHeaders = req.body?.templateHeaders ?? [];
  if (!templateHeaders) return res.status(400).json({ error: 'Missing headers' });

  // Gather all uploaded files (multer.any may populate req.files)
    const allFiles = (req.files && Array.isArray(req.files) && req.files.length > 0) ? req.files : (req.file ? [req.file] : []);
    if (allFiles.length === 0) {
      console.error('No uploaded files found in request');
      return res.status(400).json({ error: 'Missing image/pdf file. Upload a multipart/form-data file (field name: image, file or pdf).' });
    }

  // If any PDF is present, try fast text-extraction path first
    const pdfFiles = allFiles.filter(f => (f.mimetype === 'application/pdf') || (f.originalname && f.originalname.toLowerCase().endsWith('.pdf')));
    if (pdfFiles.length > 0) {
      let parsedFromPdf = null;
      for (const pf of pdfFiles) {
        try {
          const pdfResult = await parsePdfText(pf.buffer || pf.path || pf);
          const text = pdfResult && pdfResult.text ? pdfResult.text : '';
          // Try to parse invoice directly from extracted text
          const candidate = parseRawInvoiceFromText(text);
          if (candidate && candidate.amount) {
            parsedFromPdf = candidate;
            break;
          }
        } catch (e) {
          console.warn('PDF text extraction failed for one file:', e.message || e);
          // continue to next pdf
        }
      }

      if (parsedFromPdf) {
        // Optionally generate a tiny excel (one-row) if xlsx lib available
        let excelBase64 = '';
        if (XLSX_LIB) {
          try {
            const wb = XLSX_LIB.utils.book_new();
            const row = {
              amount: parsedFromPdf.amount,
              taxId: parsedFromPdf.taxId,
              date: parsedFromPdf.date,
              seller: parsedFromPdf.seller,
              buyer: parsedFromPdf.buyer,
              invoiceType: parsedFromPdf.invoiceType,
              items: JSON.stringify(parsedFromPdf.items || [])
            };
            const ws = XLSX_LIB.utils.json_to_sheet([row]);
            XLSX_LIB.utils.book_append_sheet(wb, ws, 'Sheet1');
            const buffer = XLSX_LIB.write(wb, { type: 'buffer', bookType: 'xlsx' });
            excelBase64 = buffer.toString('base64');
          } catch (e) {
            console.warn('Failed to generate excel from parsed PDF:', e.message || e);
            excelBase64 = '';
          }
        }

        return res.json({ parsedFapiao: parsedFromPdf, excelBase64 });
      }
      // else fallthrough to image/multimodal path for other files
    }

  // Build image data URLs for non-pdf files and proceed with multimodal flow
    const nonPdfFiles = allFiles.filter(f => !(f.mimetype === 'application/pdf' || (f.originalname && f.originalname.toLowerCase().endsWith('.pdf'))));
    const base64Images = [];
    for (const f of nonPdfFiles) {
      const imageBuffer = f.buffer; // Invoice image binary
      const mimeType = (f.mimetype) || 'image/jpeg';
      const base64Str = imageBuffer.toString('base64');
      const base64Image = `data:${mimeType};base64,${base64Str}`;
      base64Images.push(base64Image);
    }
    const content = base64Images.map(base64 => ({ image: base64 }));
    const messageContent = message('fapiao') + templateHeaders;
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
    
    // console.log('Qwen fapiao parse rrrrrrrrrr:', JSON.stringify(response.data || {}));

    const parsedResp = extractJsonAndExcel(response);
    // console.log('Qwen fapiao parse json----json:', JSON.stringify(parsedResp.json || {}));

    const parsedFapiao = parseRawInvoiceFromJson(parsedResp.json ||'');
    console.log('Qwen fapiao parse cleaned:', JSON.stringify(parsedFapiao));

  // Return JSON: parsed invoice object + excel base64 string (frontend converts to Blob)
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

// Start server
const PORT = 5000;
app.listen(PORT, () => {
  console.log(`✅ Local proxy server started: http://localhost:${PORT}`);
  console.log('✅ Using model: qwen-max (Qwen 3-Max)');
});