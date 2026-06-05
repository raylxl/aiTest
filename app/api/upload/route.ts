import { NextRequest, NextResponse } from 'next/server';
import { parseEngine } from '@/lib/parser/engine';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const files = formData.getAll('files') as File[];

    if (!files || files.length === 0) {
      return NextResponse.json(
        { error: '请上传至少一个文件' },
        { status: 400 }
      );
    }

    const results = [];

    for (const file of files) {
      try {
        const fileType = parseEngine.detectFileType(file.name);
        results.push({
          fileName: file.name,
          fileType,
          fileSize: file.size,
          success: true,
        });
      } catch (error) {
        results.push({
          fileName: file.name,
          success: false,
          error: error instanceof Error ? error.message : '文件类型不支持',
        });
      }
    }

    return NextResponse.json({
      success: true,
      files: results,
    });
  } catch (error) {
    console.error('上传失败:', error);
    return NextResponse.json(
      { error: '文件上传失败' },
      { status: 500 }
    );
  }
}
