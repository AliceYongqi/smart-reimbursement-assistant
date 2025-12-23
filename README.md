# Smart Reimbursement Assistant (Plasmo Extension)

Smart Reimbursement Assistant is a Plasmo-based browser extension for automating fapiao (invoice) processing and expense reimbursement workflows. It leverages Alibaba Cloud's Qwen multimodal AI model to extract structured data from invoice images and PDFs, with optional Excel template support for customized output formatting.

**Key Features**
- Upload multiple invoice images or PDFs via intuitive popup UI
- Optional Excel template to define custom CSV output columns
- AI-powered extraction of invoice details: amounts, tax IDs, dates, merchants, invoice types, and line items
- Automatic generation of summary statistics (totals by category/date)
- One-click download of structured JSON data and CSV reports
- Local Express server for secure API communication and file handling

---

## Quick Links
- **Extension source**: `src/`
- **Local helper server**: `server/`

---

## Prerequisites
- Node.js 18+ (or the version specified in package.json)
- pnpm recommended (npm/yarn supported)
- macOS development: Chrome or Chromium-based browser for loading unpacked extension
- **Alibaba Cloud account** with DashScope API access (for Qwen model)

---

## Installation & Setup

### 1. Extension Setup
```bash
# From project root
pnpm install
# or
npm install
```

### 2. Local Server Setup (Required for Invoice Processing)
The local Express server handles all communication with Qwen API and processes template files.

```bash
cd server
npm install
# Key dependencies installed automatically:
# - express, axios, cors, multer, form-data
# - xlsx (for Excel/CSV template parsing)
# - pdf-parse (for PDF text extraction fallback)
# - pdf2pic (for server-side PDF conversion, currently unused)
```

### 3. Qwen API Key Configuration
1. Sign up at [Alibaba Cloud DashScope](https://dashscope.aliyuncs.com/)
2. Navigate to API Key Management and create a key
3. **Enter the key directly in the extension popup UI** when processing invoices (not stored in config files)
4. **Important**: Never commit API keys to version control. The extension only stores the key temporarily during the session.

---

## Development Workflow

### Extension Development
```bash
# From project root
pnpm dev
# or
npm run dev
```
- Runs the Plasmo dev server and outputs to `build/chrome-mv3-dev`
- Load the unpacked build folder in Chrome at `chrome://extensions` (enable Developer mode)
- Use `cmd+r` on the extension card to reload after changes

### Server Development
```bash
cd server
node server.js
# For auto-restart on changes, install nodemon:
npm install -g nodemon
nodemon server.js
```
- Server runs on **http://localhost:5000** by default
- Configure port via `PORT` environment variable if needed

---

## How Invoice Processing Works

1. **File Upload**: User selects invoice files (JPG, PNG, PDF) and optional Excel template via extension popup
2. **PDF Conversion**: Frontend converts any PDF files to JPEG images using `pdfjs-dist` (browser-side)
3. **API Request**: Files, Qwen token, and template are sent to local server via multipart/form-data
4. **AI Processing**: Server constructs a multimodal prompt with invoice images and template context
5. **Data Extraction**: Qwen `qwen-vl-max` model extracts:
   - Invoice metadata (amount, tax_id, date, seller, buyer, invoice_type)
   - Line item details (product name, category, unit_price, quantity)
6. **Summary Generation**: Aggregates totals by category and date (can be disabled via UI)
7. **CSV Creation**: Formats extracted data into CSV (using template headers if provided)
8. **Response**: Server returns a JSON array containing:
   - Element 0-N: Extracted invoice objects
   - Element N+1: Summary statistics object
   - Element N+2: CSV string for download
9. **Download**: User clicks download to save `ReimbursementDetails.csv` and `FapiaoData.json`

---

## API Reference

### POST `/api/parse-fapiao` (Multipart)

**Endpoint**: `http://localhost:5000/api/parse-fapiao`

**Request Fields:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `token` | string | ✅ | Qwen API key (Bearer token) |
| `fapiao` | file[] | ✅ | Invoice images or PDFs (converted to images by frontend) |
| `template` | file | ❌ | Excel/CSV template defining output columns |
| `summary` | string/boolean | ❌ | Set to "false" to skip summary generation (default: true) |

**Response Format:**
```json
[
  {
    "amount": "1299.00",
    "tax_id": "91330108MA2XXXXXXY",
    "date": "2024-12-15",
    "seller": "杭州科技有限公司",
    "buyer": "测试企业",
    "invoice_type": "电子发票（增值税专用发票）",
    "items": [
      {
        "name": "笔记本电脑",
        "category": "办公设备",
        "unit_price": "1299.00",
        "quantity": "1"
      }
    ]
  },
  {
    "summary": {
      "total_amount": "1299.00",
      "invoice_count": 1,
      "by_category": {
        "办公设备": "1299.00"
      },
      "by_date": {
        "2024-12": "1299.00"
      }
    }
  },
  {
    "csv": "Date,Amount,Merchant,Category,Tax ID\n2024-12-15,1299.00,杭州科技有限公司,办公设备,91330108MA2XXXXXXY"
  }
]
```

**Error Responses:**
- `400`: Missing token or invoice files
- `500`: Qwen API error or processing failure (check server logs)

---

## Core File Structure

### Server Files

**`server/server.js`**
- Main Express server with `/api/parse-fapiao` endpoint
- Accepts multipart form data with invoice files and template
- Constructs multimodal payload for Qwen `qwen-vl-max` model
- Handles errors and logging

**`server/utils.js`**
- `parseExcelOrCsv()`: Parses Excel/CSV templates from Buffer, path, or multer file object
- `parseQwenResponseText()`: Extracts and parses JSON from Qwen's response format
- `parseJsonData()`: Robust JSON parser that extracts valid JSON from text blocks
- `getUploadedFiles()`: Helper to retrieve files from multer request objects
- `message()`: Generates specialized prompts for different processing modes
- `pdfToText()`: Extracts text from PDF buffers using pdf-parse
- `convertPdfBufferToImages()`: Converts PDFs to images using pdf2pic (currently unused)

### Extension Files

**`src/reimbursementPopup.tsx`**
- Main React component managing UI state and workflow
- Handles token input, file selection, and submission
- Caches processed data for download
- Orchestrates API calls and error handling

**`src/utils/qwenApi.ts`**
- `parseInvoiceWithQwen()`: Frontend API client
- Converts PDFs to images before uploading
- Sends multipart request to local server
- Returns parsed JSON response

**`src/utils/utils.ts`**
- `pdfToImages()`: Converts PDF files to JPEG data URLs in browser
- `dataURLToBlob()` / `dataURLToFile()`: Conversion utilities
- `downloadJson()` / `downloadExcel()`: File download helpers using FileSaver.js

---

## Important Technical Notes

- **PDF Processing Strategy**: Frontend converts PDFs to images using `pdfjs-dist` before upload. Server-side processing (`convertPdfBufferToImages`) is implemented but currently unused, allowing flexibility to move conversion server-side if needed.
- **Template Usage**: The Excel/CSV template is **not** used as input format. Instead, the model reads the template's first row to determine desired output column headers for the generated CSV.
- **Model Selection**: Uses `qwen-vl-max` specifically for its vision capabilities to read invoice images. Text-only models will not work.
- **Memory Considerations**: Large PDFs or high-resolution images may hit browser memory limits. Consider server-side conversion for batch processing.
- **API Costs**: Qwen charges per image and token. Each invoice image + template counts as separate multimodal inputs. Monitor usage in Alibaba Cloud console.
- **CORS**: Server enables CORS for local development (`http://localhost:*`). Adjust origin restrictions for production deployment.

---

## Development Tips (macOS)

- **Popup Debugging**: Right-click extension icon → "Inspect popup" for React DevTools and console
- **Service Worker Logs**: Click "service worker" link on extension card in `chrome://extensions`
- **Server Debugging**: Check terminal for detailed error messages from Qwen API
- **Network Inspection**: Use popup DevTools Network tab to inspect `/api/parse-fapiao` requests
- **Testing**: Start with a single clear invoice image before testing batches or PDFs

---

## Troubleshooting

### "Missing token" error
- Verify API key entered in popup is valid and starts with `sk-`
- Check for leading/trailing spaces in token input

### "No uploaded files" error
- Ensure at least one invoice file is selected
- Verify file field name is `fapiao` in multipart request
- Check browser console for frontend upload errors

### PDF conversion fails
- Confirm `pdfjs-dist` worker is loaded correctly (`workerSrc` must point to valid URL)
- For large PDFs, try converting pages individually or use server-side conversion
- Check browser memory usage in Task Manager

### Excel template not parsed
- **Server must have `xlsx` installed**: `cd server && npm install xlsx`
- Template must be `.xlsx`, `.xls`, or `.csv` format
- Check server logs for parsing errors: `Error: Missing dependency 'xlsx'`

### CSV download shows garbled characters
- Frontend adds BOM (`\uFEFF`) for UTF-8 encoding. If using in other tools, ensure UTF-8 support.

### Qwen API returns empty or malformed data
- Check token has sufficient balance and scope for `qwen-vl-max`
- Verify invoice images are clear and text is readable
- Review server logs for full API response to debug prompt/response mismatch

---

## Configuration & Environment Variables

### Server Environment Variables (`server/.env`)
```env
PORT=5000                    # Server port (default: 5000)
# QWEN_API_URL=...           # Override Qwen API endpoint if needed
# LOG_LEVEL=debug            # Enable verbose logging
```

### Extension Configuration
No build-time configuration required. All settings (token, summary toggle) are managed at runtime through the popup UI.

---

## Contributing
- Open issues and PRs. Use topic branches from main and include a short description and repro steps.

## License
- MIT (update if your project uses a different license)

---

## Resources
- [Plasmo Documentation](https://docs.plasmo.com/)
- [Alibaba Cloud DashScope Console](https://dashscope.console.aliyun.com/)
- [Qwen Multimodal Model Docs](https://help.aliyun.com/document_detail/2399484.html)
- [Multer File Upload](https://github.com/expressjs/multer)
- [pdfjs-dist GitHub](https://github.com/mozilla/pdf.js)

---

## Packaging the Extension for Distribution

To create a zip file of the extension for easy distribution or loading into other browsers:

```bash
# From project root
npm run zip
```

This command will:
1. Automatically build the extension (equivalent to running `npm run build`)
2. Create a zip file named `smart-reimbursement-extension.zip` containing all files from the `dist` folder
3. Place the zip file in the project root directory

### Loading the Packaged Extension
1. In Chrome, go to `chrome://extensions`
2. Enable Developer mode (top right)
3. Click "Load unpacked" and select the `smart-reimbursement-extension.zip` file
4. The extension will be installed and ready to use

---