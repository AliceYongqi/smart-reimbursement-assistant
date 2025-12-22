# Smart Reimbursement Assistant - 智能发票报销助手

在实际办公中，发票处理和报销流程常常耗费大量时间和精力。Smart Reimbursement Assistant 应运而生，这是一款基于 Plasmo 开发的浏览器扩展，通过人工智能技术自动化处理发票信息提取和报销数据生成，让您的报销流程变得高效而轻松。

## 核心功能

- **直观的用户界面**：简洁明了的浏览器弹窗，让发票处理变得简单易用
- **多格式支持**：上传并处理多种格式的发票文件（JPG、PNG、PDF）
- **智能数据提取**：利用阿里云千问多模态 AI 模型自动识别发票上的关键信息
- **Excel 模板支持**：支持上传自定义 Excel 模板，灵活定制输出格式
- **数据汇总分析**：自动生成按类别和日期的汇总统计信息
- **一键下载导出**：轻松获取结构化的 JSON 数据和 CSV 报表

## 技术架构

### 前端实现

Smart Reimbursement Assistant 采用现代前端技术栈构建，确保良好的用户体验和性能：

- **React + TypeScript**：提供类型安全和组件化开发体验
- **Plasmo 框架**：简化浏览器扩展开发流程，提供丰富的 API 和工具
- **pdfjs-dist**：在浏览器端处理 PDF 文件，将其转换为可被 AI 识别的图像
- **FileSaver.js**：处理文件下载功能，确保数据导出的便捷性

### 核心组件

#### 1. 发票上传组件

```typescript
// FileUploadSection.tsx 核心功能示例
const FileUploadSection: React.FC<FileUploadSectionProps> = ({
  onTemplateSelect,
  onFapiaoSelect,
  templateFile,
  fapiaoFiles,
}) => {
  // 实现文件选择和上传逻辑
  // ...
};
```

该组件提供两个主要的文件上传区域：一个用于上传可选的 Excel 模板，另一个用于上传需要处理的发票文件（支持多选）。界面设计直观，用户可以轻松看到已选择的文件信息。

#### 2. 报销主界面

报销主界面整合了所有功能，包括 API 密钥输入、文件上传、汇总选项和提交按钮。界面还提供了处理状态和进度显示，让用户实时了解处理情况。

#### 3. 工具函数

扩展实现了一系列实用工具函数，处理从 PDF 转换到文件下载的各个环节：

- `pdfToImages()`：将 PDF 文件转换为浏览器中的图像数据
- `dataURLToFile()` / `dataURLToBlob()`：处理数据格式转换
- `downloadJson()` / `downloadExcel()`：提供文件下载功能

## 智能API开发实战：遇到的坑与解决方案

在开发 Smart Reimbursement Assistant 的过程中，我们在集成阿里云千问多模态 AI 模型时遇到了诸多挑战。以下是我们在智能 API 开发中遇到的主要问题及解决方案：

### 1. API 调用超时与重试策略

**问题**：
在处理大型发票文件或批量处理时，API 调用经常因为超时失败，导致用户体验差。

**解决方案**：
```typescript
// 实现指数退避重试策略
async function callQwenApiWithRetry(imageData, apiKey, maxRetries = 3) {
  let lastError;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // 增加超时控制
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000);
      
      const response = await fetch('https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ /* 请求体 */ }),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      return await response.json();
    } catch (error) {
      lastError = error;
      // 指数退避策略：第一次等待1秒，第二次等待2秒，第三次等待4秒
      const delay = Math.pow(2, attempt) * 1000 + Math.random() * 1000;
      console.log(`重试中... (第 ${attempt + 1} 次，延迟 ${delay}ms)`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError;
}
```

### 2. 多模态输入的数据格式问题

**问题**：
不同类型的文件（JPG、PNG、PDF）转换为 Base64 后，在 API 请求中的格式要求各不相同，经常导致识别失败。

**解决方案**：
我们开发了统一的数据预处理函数，确保所有图像数据在发送前都经过正确的格式处理：

```typescript
// 统一的图像数据预处理函数
async function preprocessImageForApi(file) {
  // 处理不同文件类型
  if (file.type === 'application/pdf') {
    // PDF 转换为图像
    const images = await pdfToImages(file);
    // 只取第一页进行处理
    return await imageToBase64WithMetadata(images[0], 'image/png');
  } else if (file.type.startsWith('image/')) {
    // 图像处理
    const imageData = await imageToBase64WithMetadata(file, file.type);
    // 调整图像大小，确保符合 API 要求
    return adjustImageSize(imageData, 1024);
  }
  
  throw new Error('不支持的文件类型');
}

// 添加元数据信息到 Base64 字符串
async function imageToBase64WithMetadata(file, mimeType) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      // 移除前缀，只保留纯 Base64 数据
      const base64 = reader.result.split(',')[1];
      resolve({
        type: mimeType,
        data: base64
      });
    };
    reader.readAsDataURL(file);
  });
}
```

### 3. 提示工程（Prompt Engineering）挑战

**问题**：
最初的提示词设计不够精确，导致 AI 返回的数据格式不统一，难以解析和处理。

**解决方案**：
我们精心设计了结构化提示词，明确指定了期望的输出格式：

```typescript
function createOptimizedPrompt() {
  return {
    model: "qwen-vl-max",
    input: {
      image: ["BASE64_IMAGE_DATA"], // 将被替换为实际的图像数据
      prompt: `请详细分析这张发票，按照以下严格的 JSON 格式输出信息，不要添加任何额外说明：
{
  "invoiceType": "发票类型",
  "amount": "总金额",
  "taxAmount": "税额",
  "invoiceCode": "发票代码",
  "invoiceNumber": "发票号码",
  "date": "开票日期（YYYY-MM-DD格式）",
  "seller": {
    "name": "销售方名称",
    "taxId": "销售方税号"
  },
  "buyer": {
    "name": "购买方名称",
    "taxId": "购买方税号"
  },
  "items": [
    {
      "name": "商品名称",
      "category": "商品类别",
      "quantity": "数量",
      "unitPrice": "单价",
      "amount": "金额"
    }
  ]
}`
    },
    parameters: {
      result_format: "json"
    }
  };
}
```

### 4. 浏览器安全限制与跨域问题

**问题**：
浏览器扩展在直接调用外部 API 时受到 CORS（跨域资源共享）限制，导致请求失败。

**解决方案**：
利用 Plasmo 框架的特性，我们配置了内容安全策略和后台代理：

```javascript
// plasmo.config.js
module.exports = {
  plasmo: {
    contentSecurityPolicy: {
      "connect-src": ["'self'", "https://dashscope.aliyuncs.com"]
    },
    permissions: [
      "activeTab",
      "storage",
      "https://dashscope.aliyuncs.com/*"
    ]
  }
};

// 使用后台服务工作线程处理 API 调用
async function processApiCallInBackground(imageData, apiKey) {
  const result = await chrome.runtime.sendMessage({
    type: "API_CALL",
    payload: {
      imageData,
      apiKey
    }
  });
  return result;
}
```

### 5. 错误处理与用户反馈机制

**问题**：
API 调用可能因为各种原因失败（网络问题、密钥错误、服务器错误等），需要提供友好的错误提示。

**解决方案**：
我们实现了全面的错误处理和用户反馈系统：

```typescript
async function processInvoice(file, apiKey, onProgress) {
  try {
    onProgress(0, "预处理图像...");
    const processedImage = await preprocessImageForApi(file);
    
    onProgress(30, "调用 AI 服务...");
    const result = await callQwenApiWithRetry(processedImage, apiKey);
    
    onProgress(70, "解析结果...");
    if (result.output && result.output.text) {
      // 尝试解析 JSON 输出
      try {
        const parsedData = JSON.parse(result.output.text);
        onProgress(100, "处理完成");
        return parsedData;
      } catch (parseError) {
        // 处理非 JSON 格式的输出
        return parseNaturalLanguageOutput(result.output.text);
      }
    }
    
    throw new Error("API 返回数据格式不正确");
  } catch (error) {
    // 错误分类处理
    if (error.name === 'AbortError') {
      throw new UserFriendlyError("请求超时，请检查网络连接后重试");
    } else if (error.message.includes('401')) {
      throw new UserFriendlyError("API 密钥无效，请检查您的密钥设置");
    } else if (error.message.includes('429')) {
      throw new UserFriendlyError("请求过于频繁，请稍后再试");
    } else {
      throw new UserFriendlyError(`处理失败: ${error.message}`);
    }
  }
}
```

### 6. 性能优化：大型文件处理

**问题**：
处理大型 PDF 文件或多张发票时，浏览器内存占用过高，可能导致扩展崩溃。

**解决方案**：
实现了渐进式处理和资源清理机制：

```typescript
// 渐进式处理多文件
async function processMultipleInvoices(files, apiKey, onProgress) {
  const results = [];
  const totalFiles = files.length;
  
  for (let i = 0; i < totalFiles; i++) {
    const file = files[i];
    onProgress((i / totalFiles) * 100, `处理文件 ${i + 1}/${totalFiles}`);
    
    try {
      const result = await processInvoice(file, apiKey, (progress) => {
        const adjustedProgress = (i / totalFiles) * 100 + (progress / totalFiles);
        onProgress(adjustedProgress, `处理文件 ${i + 1}/${totalFiles}`);
      });
      results.push(result);
    } finally {
      // 及时清理资源
      URL.revokeObjectURL(file);
    }
    
    // 添加小延迟，避免浏览器卡顿
    if (i < totalFiles - 1) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  
  return results;
}
```

## 工作流程

使用 Smart Reimbursement Assistant 处理发票的流程非常简单：

1. **启动扩展**：点击浏览器工具栏中的扩展图标，打开处理界面
2. **输入 API 密钥**：在界面中输入您的阿里云千问 API 密钥
3. **上传文件**：
   - 可选：上传 Excel 模板文件（用于自定义输出格式）
   - 必需：选择并上传一个或多个发票文件（支持 JPG、PNG、PDF 格式）
4. **设置选项**：勾选是否需要生成汇总数据
5. **提交处理**：点击提交按钮，等待 AI 处理完成
6. **下载结果**：处理完成后，点击下载按钮获取结构化数据文件

## 技术亮点

### 1. 浏览器端 PDF 处理

扩展采用浏览器端 PDF 处理策略，通过 pdfjs-dist 在前端将 PDF 文件转换为图像，避免了服务器端的复杂性。这种方式不仅提高了处理速度，还增强了数据隐私保护。

### 2. 灵活的模板系统

Excel/CSV 模板系统设计灵活，用户可以通过简单地上传模板文件来自定义输出格式。系统会读取模板的第一行来确定所需的输出列标题。

### 3. 智能数据提取

借助阿里云千问多模态模型（qwen-vl-max）强大的视觉理解能力，扩展能够准确识别发票上的各种信息，包括：

- 发票金额
- 税号
- 日期
- 商家信息
- 发票类型
- 商品明细（名称、类别、单价、数量）

### 4. 优雅的状态管理

界面设计注重用户体验，提供清晰的状态指示：

- 初始状态：提示用户上传文件
- 加载状态：显示处理进度条和动画效果
- 完成状态：提供明确的下载按钮

## 开发与部署

### 开发环境搭建

要开始开发或修改此扩展，只需几个简单步骤：

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 在浏览器中加载扩展
# 1. 访问 chrome://extensions
# 2. 启用开发者模式
# 3. 点击"加载已解压的扩展程序"
# 4. 选择 build/chrome-mv3-dev 目录
```

### 构建与打包

```bash
# 构建生产版本
npm run build

# 打包扩展
npm run package
```

## 未来计划

### 后端服务开发

在后续版本中，我们计划开发完整的后端服务架构，包括：

- **本地 Express 服务器**：提供更强大的文件处理和 API 通信能力
- **安全的 API 密钥管理**：增强密钥的安全性和用户体验
- **高级 PDF 处理**：服务器端 PDF 转换和优化，支持更大文件处理
- **数据存储与同步**：提供历史记录和跨设备同步功能
- **批处理优化**：提高大量发票的并行处理能力

### 功能增强

- 支持更多类型的发票和票据
- 添加发票验证和重复检测
- 集成 OCR 增强技术
- 提供更多数据可视化和分析选项
- 支持多语言界面

## 技术资源

- [Plasmo 扩展开发文档](https://docs.plasmo.com/)
- [React 官方文档](https://react.dev/)
- [TypeScript 文档](https://www.typescriptlang.org/)
- [阿里云千问多模态模型文档](https://help.aliyun.com/document_detail/2399484.html)

## 总结

Smart Reimbursement Assistant 通过将现代前端技术与强大的 AI 能力相结合，为用户提供了一种高效、智能的发票处理解决方案。在开发过程中，我们克服了诸多智能 API 集成的挑战，包括超时处理、格式转换、提示工程、安全限制等问题。

通过精心设计的错误处理机制、性能优化策略和用户友好的界面，我们确保了扩展的稳定性和易用性。随着后续后端服务的开发和功能的不断完善，这款扩展将为发票报销领域带来更多创新和便利。

对于计划使用智能 API 开发类似应用的开发者，我们希望分享的经验和解决方案能够有所帮助，让您少走弯路，更高效地构建自己的 AI 驱动应用。