import { pdfToImages, dataURLToFile, dataURLToBlob, arrayBufferToBase64,
  blobToBase64, message, parseExcelOrCsv, parseQwenResponseText, parseJsonData } from "./utils";

/**
 * Upload multiple fapiao files to the backend/large model for parsing. 
 * Optionally provide a template file to allow the model to optimize parsing results based on the template.
 */
// export async function parseInvoiceWithQwen(
//   fapiaoFiles: File[],
//   token: string,
//   templateFile?: File,
//   aggregate: boolean = true
// ) {
//   try {
//     const formData = new FormData();
//     for(const file of fapiaoFiles) {
//       if (file.type === 'application/pdf' || file.name?.endsWith('.pdf')) {
//         const dataUrl = await pdfToImages(file);
//         // const fileImage = dataURLToBlob(dataUrl);
//         const fileImage = dataURLToFile(dataUrl, `${file.name}.jpg`);
//         formData.append('fapiao', fileImage);
//         console.log("Converted fapiao to images:", dataUrl.slice(0, 30) + "...");
//       } else {
//         formData.append("fapiao", file);
//       }
//     }

//     formData.append("token", token);
//     if (templateFile) formData.append("template", templateFile);

//     // Send summary options to the backend as a string.
//     formData.append("summary", String(aggregate));

//     const res = await fetch("http://localhost:5000/api/parse-fapiao", {
//       method: "POST",
//       body: formData,
//     });

//     if (!res.ok) {
//       const text = await res.text().catch(() => "");
//       throw new Error(`Request failed with status ${res.status}: ${text}`);
//     }

//     const data = await res.json();
//     console.log("Qwen parseInvoiceWithQwen data:", data);
    
//     return data.jsonData;
//   } catch (e) {
//     if (e instanceof Error) throw e;
//     throw new Error("Failed to parse Qwen response as JSON");
//   }
// }


// 定义进度回调类型


type ProgressCallback = (progress: number, message: string) => void;

export async function parseInvoiceWithQwen(
  fapiaoFiles: File[],
  token: string,
  templateFile?: File,
  summary: boolean = true,
  onProgress?: ProgressCallback
) {
  try {
    onProgress?.(0, "开始处理发票文件...");
    
    const base64Images = [];
    
    for (let i = 0; i < fapiaoFiles.length; i++) {
      const file = fapiaoFiles[i];
      
      let base64Image = '';
      if (file.type === 'application/pdf' || file.name?.endsWith('.pdf')) {
        const dataUrl = await pdfToImages(file);
        const fileImage = dataURLToBlob(dataUrl);
        base64Image = await blobToBase64(fileImage);
      } else {
        const imageBuffer = await file.arrayBuffer();
        const base64Str = arrayBufferToBase64(imageBuffer);
        base64Image = `data:image/jpeg;base64,${base64Str}`;
      }
      base64Images.push(base64Image);
    }
    onProgress?.(10, "fapiao转换完成...");


    let templateText = [];
    if (templateFile) {
      onProgress?.(10, "正在解析Excel模板...");
      templateText = await parseExcelOrCsv(templateFile);
    }
    
    onProgress?.(20, "正在构建请求...");
    const content: any[] = base64Images.map(base64 => ({ image: base64 }));
    const messageContent = message(`fapiao`, summary,
      templateText.length ? `Excel模版如下: ${templateText[0]}` : '');
    content.push({ text: messageContent });

    onProgress?.(30, "正在调用千问API...");




    const res = await fetch("https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "qwen-vl-max",
        input: {
          task: 'image-text-generation',
          messages: [{ role: 'user', content: content }]
        }
      })
    });





    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Request failed with status ${res.status}: ${text}`);
    }

    onProgress?.(90, "正在处理响应...");
    const response = await res.json();
    console.log("Qwen parseInvoiceWithQwen parsedResp:", response);


    const parsedResp = parseQwenResponseText(JSON.stringify(response || {}));
    console.log("Qwen parseInvoiceWithQwen parsedResp:", parsedResp);

    const data = parseJsonData(parsedResp);
    console.log("Qwen parseInvoiceWithQwen data:", data);

    onProgress?.(100, "解析完成！");

    return data.jsonData;

  } catch (e) {
    onProgress?.(100, `错误: ${e instanceof Error ? e.message : '未知错误'}`);
    if (e instanceof Error) throw e;
    throw new Error("Failed to parse Qwen response as JSON");
  }
}







// export async function parseInvoiceWithQwen(
//   fapiaoFiles: File[],
//   token: string,
//   templateFile?: File,
//   summary: boolean = true,
//   onProgress?: ProgressCallback
// ) {
//   try {
//     const BATCH_SIZE = 8;
//     const totalFiles = fapiaoFiles.length;
//     const totalBatches = Math.ceil(totalFiles / BATCH_SIZE);
    
//     onProgress?.(0, `准备处理 ${totalFiles} 张发票，共 ${totalBatches} 批...`);
    
//     // 1. 预处理阶段：0-10%
//     let templateText: string[] = [];
//     if (templateFile) {
//       onProgress?.(2, "正在解析Excel模板...");
//       templateText = await parseExcelOrCsv(templateFile);
//       onProgress?.(5, "模板解析完成");
//     }
    
//     // 图片转换：5-10%
//     onProgress?.(5, "正在转换所有图片...");
//     const base64Images = [];
//     for (let i = 0; i < totalFiles; i++) {
//       const file = fapiaoFiles[i];
//       const progress = 5 + (i / totalFiles) * 5;
//       onProgress?.(progress, `转换图片 ${i + 1}/${totalFiles}...`);
      
//       let base64Image = '';
//       if (file.type === 'application/pdf' || file.name?.endsWith('.pdf')) {
//         const dataUrl = await pdfToImages(file);
//         const fileImage = dataURLToBlob(dataUrl);
//         base64Image = await blobToBase64(fileImage);
//       } else {
//         const imageBuffer = await file.arrayBuffer();
//         const base64Str = arrayBufferToBase64(imageBuffer);
//         base64Image = `data:image/jpeg;base64,${base64Str}`;
//       }
//       base64Images.push(base64Image);
//     }
    
//     // 2. API调用阶段：10-90%（占总进度的80%）
//     const apiProgressPerBatch = 80 / totalBatches;
//     const allFapiaoData: any[] = [];
//     let finalSummary = {};
//     let finalCsv = '';
    
//     onProgress?.(10, "开始批量调用千问API...");
    
//     for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
//       const startIdx = batchIndex * BATCH_SIZE;
//       const endIdx = Math.min(startIdx + BATCH_SIZE, totalFiles);
//       const currentBatchImages = base64Images.slice(startIdx, endIdx);
      
//       // 计算该批次的进度范围
//       const batchStartProgress = 10 + batchIndex * apiProgressPerBatch;
      
//       onProgress?.(
//         batchStartProgress + apiProgressPerBatch * 0.1,
//         `处理批次 ${batchIndex + 1}/${totalBatches}（${startIdx + 1}-${endIdx}张）...`
//       );
      
//       // 构建请求内容
//       const content: any[] = currentBatchImages.map(base64 => ({ image: base64 }));
//       const messageContent = message(`fapiao`, summary,
//         templateText.length ? `Excel模版如下: ${templateText[0]}` : '');
//       content.push({ text: messageContent });
      
//       // 启动模拟进度
//       const apiCallProgressStart = batchStartProgress + apiProgressPerBatch * 0.15;
//       let simulatedProgress = 0;
//       const progressInterval = setInterval(() => {
//         simulatedProgress = Math.min(simulatedProgress + 3, apiProgressPerBatch * 0.75);
//         onProgress?.(
//           apiCallProgressStart + simulatedProgress,
//           `等待API响应（批次 ${batchIndex + 1}/${totalBatches}）...`
//         );
//       }, 200);
      
//       // 实际的fetch调用
//       const res = await fetch(
//         "https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation",
//         {
//           method: "POST",
//           headers: {
//             "Authorization": `Bearer ${token}`,
//             "Content-Type": "application/json"
//           },
//           body: JSON.stringify({
//             model: "qwen-vl-max",
//             input: {
//               task: 'image-text-generation',
//               messages: [{ role: 'user', content: content }]
//             }
//           })
//         }
//       );
      
//       clearInterval(progressInterval);
      
//       if (!res.ok) {
//         const text = await res.text().catch(() => "");
//         throw new Error(`批次 ${batchIndex + 1} 失败: ${res.status} - ${text}`);
//       }
      
//       // 解析响应
//       onProgress?.(batchStartProgress + apiProgressPerBatch * 0.95, "解析响应中...");
//       const response = await res.json();
//       const parsedResp = parseQwenResponseText(JSON.stringify(response || {}));
//       const batchData = parseJsonData(parsedResp);
      
//       // ✅ 分离发票数据、summary和csv
//       // 假设batchData.jsonData格式: [{fapiao: {}}, {fapiao: {}}, {summary: {}}, {csv: ''}]
//       if (Array.isArray(batchData.jsonData)) {
//         batchData.jsonData.forEach(item => {
//           if (item.fapiao) {
//             allFapiaoData.push(item);
//           } else if (item.summary) {
//             finalSummary = item.summary; // 覆盖，保留最后一个批次的summary
//           } else if (item.csv && typeof item.csv === 'string') {
//             // 收集所有csv并合并
//             finalCsv = item.csv;
//           }
//         });
//       }
//     }
    
//     // 3. 后处理阶段：90-100%
//     onProgress?.(90, "正在组装最终结果...");
    
//     // ✅ 构建最终返回格式: [{fapiao: {}}, {fapiao: {}}, ..., {summary: {}}, {csv: ''}]
//     const finalResult = [
//       ...allFapiaoData,          // 所有发票数据
//       { summary: finalSummary },  // summary对象
//       { csv: finalCsv }           // csv字符串
//     ];
    
//     onProgress?.(100, "解析完成！");
//     return finalResult;

//   } catch (e) {
//     onProgress?.(100, `错误: ${e instanceof Error ? e.message : '未知错误'}`);
//     if (e instanceof Error) throw e;
//     throw new Error("Failed to parse Qwen response as JSON");
//   }
// }

// jsonData是[{fapiao: {}}, {fapioa: {}}, ... {summary: {}} {csv: ''}]