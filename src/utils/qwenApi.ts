import { pdfToImages, dataURLToFile, dataURLToBlob, arrayBufferToBase64,
  blobToBase64, message, parseExcelOrCsv, parseQwenResponseText, parseJsonData, 
  convertToCsv} from "./utils";

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

type ProgressCallback = (progress: number, message: string) => void;
export async function parseInvoiceWithQwen(
  fapiaoFiles: File[],
  token: string,
  templateFile?: File,
  summary: boolean = true,
  onProgress?: ProgressCallback
) {
  try {
    const BATCH_SIZE = 8;
    const totalFiles = fapiaoFiles.length;
    const totalBatches = Math.ceil(totalFiles / BATCH_SIZE);
    
    onProgress?.(0, `Preparing to process ${totalFiles} invoices...`);
    
    // Phase 1: Template parsing (0-5%)
    let templateText = [];
    if (templateFile) {
      onProgress?.(5, "Parsing Excel template...");
      templateText = await parseExcelOrCsv(templateFile);
      // templateText = await convertToCsv(templateText);
    }
    onProgress?.(5, "Template ready");
    
    // Phase 2: Image conversion (5-20%)
    onProgress?.(5, `Converting ${totalFiles} files to base64...`);
    // 
    const base64Images = await getbase64Images(fapiaoFiles, onProgress);

    onProgress?.(20, "All files converted");
    
    // Phase 3: Batch API calls (20-80%)
    const allFapiaoData: any[] = [];
    const apiProgressPerBatch = 60 / totalBatches;
    let finalSummary = {};
    let finalCsv = '';
    
    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
      const startIdx = batchIndex * BATCH_SIZE;
      const endIdx = Math.min(startIdx + BATCH_SIZE, totalFiles);
      const currentBatchImages = base64Images.slice(startIdx, endIdx);
      
      const batchStartProgress = 20 + batchIndex * apiProgressPerBatch;
      onProgress?.(
        Math.round(batchStartProgress + apiProgressPerBatch * 0.1),
        `Processing batch ${batchIndex + 1}/${totalBatches} (${endIdx - startIdx} files)`
      );
      
      const content: any[] = currentBatchImages.map(base64 => ({ image: base64 }));
      const messageContent = message(`fapiao`);
      content.push({ text: messageContent });
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 480000);
      
      try {
        onProgress?.(
          Math.round(batchStartProgress + apiProgressPerBatch * 0.2),
          `Calling Qwen API (batch ${batchIndex + 1}/${totalBatches})...`
        );
        
        const res = await fetchQianWen(token, content, controller);
        
        clearTimeout(timeoutId);
        
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(`Batch ${batchIndex + 1} failed: ${res.status} - ${text}`);
        }
        
        onProgress?.(
          Math.round(batchStartProgress + apiProgressPerBatch * 0.9),
          `Parsing response for batch ${batchIndex + 1}...`
        );
        
        const response = await res.json();
        const parsedResp = parseQwenResponseText(JSON.stringify(response || {}));
        const batchData = parseJsonData(parsedResp);
        
        if (Array.isArray(batchData.jsonData)) {
          allFapiaoData.push(...batchData.jsonData);
        }
      } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
          throw new Error(`Batch ${batchIndex + 1} timed out after 120 seconds`);
        }
        throw error;
      }
    }
    
    // Phase 4: Final summary and csv API call (80-100%)
    console.log('allFapiaoData:', allFapiaoData);
    
    // 改进数据格式，使模型更容易理解
     const customContent = `
    【发票数据】：
    ${JSON.stringify(allFapiaoData, null, 2)}。
    ${templateText.length ? `
    【Excel模板】：
    ${templateText[0].join(',')}。` : ''}
    `;
    
    const messageContent = message(
      `csv${summary ? '-summary' : ''}${templateText.length ? '-header' : ''}`,
      customContent
    );

    onProgress?.(80, "Generating final summary via Qwen API...");
    try {
      const responseCSV = await fetchQianWen(token, [ {text: messageContent }]);
      
      if (!responseCSV.ok) {
        const text = await responseCSV.text().catch(() => "");
        throw new Error(`Summary generation failed: ${responseCSV.status} - ${text}`);
      }

      onProgress?.(95, "Parsing summary response...");
      const response = await responseCSV.json();
      const parsedResp = parseQwenResponseText(JSON.stringify(response || {}));
      const batchData = parseJsonData(parsedResp) || {};
      console.log('batchData:', batchData);
      
      if (summary) {
        finalSummary = batchData.jsonData?.[0]?.summary || {};
        finalCsv = batchData.jsonData?.[1]?.csv || '';
      } else {
        finalCsv = batchData.jsonData?.[0]?.csv || '';
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error("Summary generation timed out after 120 seconds");
      }
      throw error;
    }
    
    // Final result
    const finalResult = [
      ...allFapiaoData,
      { summary: finalSummary },
      { csv: finalCsv }
    ];
    
    console.log('finalResult=====:', finalResult);
    onProgress?.(100, `Completed! Processed ${totalFiles} invoices successfully.`);
    return finalResult;

  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'Unknown error';
    onProgress?.(100, `Error: ${errorMessage}`);
    throw e;
  }
}

async function getbase64Images(fapiaoFiles: File[], onProgress?: ProgressCallback) {
  const totalFiles = fapiaoFiles.length;
  const conversionWeight = 15 / totalFiles;
  const base64Images = [];

  for (let i = 0; i < totalFiles; i++) {
    const file = fapiaoFiles[i];
    const progress = 5 + (i + 0.5) * conversionWeight;
    onProgress?.(Math.round(progress), `Converting file ${i + 1}/${totalFiles}: ${file.name}`);
    
    try {
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
    } catch (error) {
      throw new Error(`Failed to convert file ${file.name}: ${error.message}`);
    }
  }

  return base64Images;
}

async function fetchQianWen(token: string, content: any[], controller?: AbortController): Promise<Response> {
  const url = "https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation";
  const res = await fetch(url,
    {
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
        },
        parameters: {
          temperature: 0.3, // 降低温度减少幻觉，0.1-0.3是比较保守的设置
          top_p: 0.8,       // 控制采样多样性
          max_new_tokens: 2048 // 限制最大生成 tokens
        }
      }),
      signal: controller?.signal
    }
  );

  return res;
}