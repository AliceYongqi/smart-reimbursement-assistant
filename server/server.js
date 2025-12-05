// server.js
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const multer = require('multer');
const app = express();

// 启用 CORS（本地开发无需配置，但建议保留）
app.use(cors());

// 处理文件上传
const upload = multer({ storage: multer.memoryStorage() });

// 代理路由：接收发票图片 + Token → 转发给 Qwen
app.post('/api/parse-invoice', upload.single('image'), async (req, res) => {
  try {
    const { token } = req.body; // 从前端获取 Token
    const imageBuffer = req.file.buffer; // 发票图片二进制

    // 将图片转为 Base64（Qwen API 要求）
    const base64Image = imageBuffer.toString('base64');
    const imagePrefix = 'data:image/jpeg;base64,'; // 根据图片类型调整

    // 调用 Qwen API（后端直接请求，无 CORS 问题）
    const response = await axios.post(
      'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation',
      {
        model: "qwen-vl-plus",
        input: {
          messages: [{
            role: "user",
            content: [
              { image: imagePrefix + base64Image },
              { text: "提取发票信息：金额、税号、日期、销售方、购买方、发票类型、商品明细（名称、分类、单价、数量）" }
            ]
          }]
        }
      },
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );

    // 将 Qwen 响应直接返回给前端
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 在 server.js 中添加
// const pdfjs = require('pdfjs-dist');
// const { PDFDocument } = require('pdf-lib');

// // 上传 PDF 时转成图片
// app.post('/api/parse-invoice', upload.single('file'), async (req, res) => {
//   if (req.file.mimetype === 'application/pdf') {
//     // PDF 转图片逻辑（简化版）
//     const pdfDoc = await pdfjs.getDocument(req.file.buffer).promise;
//     const page = await pdfDoc.getPage(1);
//     const viewport = page.getViewport({ scale: 2 });
//     const canvas = document.createElement('canvas');
//     const context = canvas.getContext('2d');
//     await page.render({ canvas, viewport }).promise;
//     const imageData = canvas.toDataURL('image/jpeg');
//     req.file.buffer = Buffer.from(imageData.split(',')[1], 'base64');
//   }
//   // 后续走原逻辑...
// });

// 启动服务器
const PORT = 5000;
app.listen(PORT, () => {
  console.log(`✅ 本地代理服务器已启动: http://localhost:${PORT}`);
});