import { NextRequest, NextResponse } from 'next/server';
import { generateRuleWithAI, extractExcelSample, extractPDFSample, extractWordSample } from '@/lib/ai/deepseek';
import { parseExcelFile } from '@/lib/parser/excel-parser';
import { parsePDFFile } from '@/lib/parser/pdf-parser';
import { parseWordFile } from '@/lib/parser/word-parser';
import { parseEngine } from '@/lib/parser/engine';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json(
        { error: '请上传文件' },
        { status: 400 }
      );
    }

    const fileType = parseEngine.detectFileType(file.name);
    const buffer = await file.arrayBuffer();
    
    let sample: string;

    // 根据文件类型提取样本
    switch (fileType) {
      case 'excel': {
        const excelData = await parseExcelFile(buffer);
        const firstSheet = excelData.sheets[0];
        if (!firstSheet) throw new Error('Excel文件没有Sheet');
        sample = extractExcelSample(firstSheet.data, 20);
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
      default:
        throw new Error(`不支持的文件类型: ${fileType}`);
    }

    // 调用AI生成规则
    const rule = await generateRuleWithAI(sample, fileType, file.name);

    return NextResponse.json({
      success: true,
      rule,
      sample,
    });
  } catch (error) {
    console.error('生成规则失败:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '生成规则失败' },
      { status: 500 }
    );
  }
}
