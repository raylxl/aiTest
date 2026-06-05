/**
 * 调试 PDF 解析 - 保存原始解析结果到文件
 */
const fs = require('fs');
const path = require('path');

async function main() {
    // 使用 fetch 调用 extract-sample API
    const apiUrl = 'http://localhost:3000/api/extract-sample';
    const filePath = 'D:/WorkBuddy-projects/aiTest/exam-demos/demos/黔寨寨贵州烙锅（鞍山店）常温.pdf';
    
    const form = new FormData();
    const fileData = await fs.promises.readFile(filePath);
    const blob = new Blob([fileData]);
    form.append('file', blob, path.basename(filePath));
    
    const resp = await fetch(apiUrl, { method: 'POST', body: form });
    const data = await resp.json();
    
    console.log('success:', data.success);
    console.log('fileInfo:', JSON.stringify(data.fileInfo, null, 2));
    console.log('\n=== SAMPLE TEXT ===');
    console.log(data.sample);
    console.log('\n=== END ===');
}

main().catch(e => console.error(e));
