import { NextRequest, NextResponse } from 'next/server';
import { parseExcelFile } from '@/lib/parser/excel-parser';
import { parsePDFFile } from '@/lib/parser/pdf-parser';
import { parseWordFile } from '@/lib/parser/word-parser';
import { generateRuleWithAI, extractExcelSample, extractPDFSample, extractWordSample } from '@/lib/ai/deepseek';
import type { FileType } from '@/types/rule';

/**
 * 文件分析API - 上传文件后，AI自动分析结构并生成解析规则
 * 这是"万能导入"的核心：不硬编码任何文件格式
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: '请上传文件' }, { status: 400 });
    }

    const fileName = file.name;
    const fileType = detectFileType(fileName);
    const buffer = await file.arrayBuffer();

    // 提取文件内容样本
    let sample = '';
    let sheets: string[] = [];

    switch (fileType) {
      case 'excel': {
        const excelData = await parseExcelFile(buffer);
        sheets = excelData.sheets.map(s => s.name);
        const firstSheet = excelData.sheets[0];
        if (firstSheet) {
          sample = extractExcelSample(firstSheet.data, 25);
        }
        break;
      }
      case 'pdf': {
        const pdfData = await parsePDFFile(buffer);
        sample = extractPDFSample(pdfData.fullText, 3000);
        break;
      }
      case 'word': {
        const wordData = await parseWordFile(buffer);
        sample = extractWordSample(wordData.text, 3000);
        break;
      }
      case 'csv': {
        const text = new TextDecoder().decode(buffer);
        sample = text.substring(0, 3000);
        break;
      }
    }

    if (!sample.trim()) {
      return NextResponse.json({ error: '无法提取文件内容' }, { status: 400 });
    }

    // 调用AI生成解析规则
    const rule = await generateRuleWithAI(sample, fileType, fileName);

    return NextResponse.json({
      success: true,
      rule,
      sample: sample.substring(0, 1000), // 返回部分样本供前端预览
      fileInfo: {
        name: fileName,
        type: fileType,
        sheets,
      },
    });
  } catch (error) {
    console.error('文件分析失败:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '文件分析失败' },
      { status: 500 }
    );
  }
}

function detectFileType(fileName: string): FileType {
  const ext = fileName.toLowerCase().split('.').pop();
  switch (ext) {
    case 'xlsx': case 'xls': case 'xlsm': return 'excel';
    case 'pdf': return 'pdf';
    case 'docx': case 'doc': return 'word';
    case 'csv': return 'csv';
    default: throw new Error(`不支持的文件类型: ${ext}`);
  }
}
