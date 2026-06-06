import { NextRequest, NextResponse } from 'next/server';
import {
  createSession,
  storeChunk,
  isComplete,
  mergeAndGetFile,
  getSessionRule,
  getSessionInfo,
  deleteSession,
} from '@/lib/chunk-store';
import { parseEngine } from '@/lib/parser/engine';

const CHUNK_SIZE = 2 * 1024 * 1024; // 2MB per chunk

// POST: 上传分片或创建会话
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const uploadId = (formData.get('uploadId') as string) || crypto.randomUUID();
    const action = (formData.get('action') as string) || 'upload'; // 'init' | 'upload' | 'finish'
    const chunkIndexStr = formData.get('chunkIndex') as string;
    const totalChunksStr = (formData.get('totalChunks') as string);
    const ruleJsonStr = formData.get('rule') as string;
    const fileName = formData.get('fileName') as string;
    const fileType = formData.get('fileType') as string;
    const chunkData = formData.get('data') as File | null;

    if (action === 'init' && fileName && totalChunksStr && ruleJsonStr) {
      // 初始化上传会话
      let rule: any;
      try { rule = JSON.parse(ruleJsonStr); } catch { return NextResponse.json({ error: '规则JSON格式错误' }, { status: 400 }); }

      const totalChunks = parseInt(totalChunksStr);
      await createSession(uploadId, fileName, fileType || 'excel', rule, totalChunks);

      return NextResponse.json({
        success: true,
        uploadId,
        chunkSize: CHUNK_SIZE,
        message: `会话已创建，请分 ${totalChunks} 片上传`,
        totalChunks,
      });
    }

    if (action === 'upload' && uploadId && chunkData && chunkIndexStr !== null) {
      // 上传单个分片
      const chunkIndex = parseInt(chunkIndexStr);
      const buffer = Buffer.from(await chunkData.arrayBuffer());

      const result = await storeChunk(uploadId, chunkIndex, buffer);
      const completeInfo = await isComplete(uploadId);

      return NextResponse.json({
        success: true,
        ...result,
        complete: completeInfo.complete,
        progress: Math.round((result.chunksReceived / result.totalChunks) * 100),
      });
    }

    if (action === 'finish' && uploadId) {
      // 所有分片已上传完成，触发合并和解析
      const completeInfo = await isComplete(uploadId);
      if (!completeInfo.complete) {
        return NextResponse.json({
          success: false,
          error: `还有 ${completeInfo.missingIndices?.length || 0} 个分片未上传`,
          missingIndices: completeInfo.missingIndices || [],
        }, { status: 400 });
      }

      const mergedBuffer = await mergeAndGetFile(uploadId);
      const rule = await getSessionRule(uploadId);
      const sessionInfo = await getSessionInfo(uploadId);

      if (!mergedBuffer || !rule || !sessionInfo) {
        await deleteSession(uploadId);
        return NextResponse.json({ error: '合并失败，请重新上传' }, { status: 500 });
      }

      // 将 Node.js Buffer 转为 ArrayBuffer（浏览器 API 需要）
      const arrayBuffer = mergedBuffer.buffer.slice(
        mergedBuffer.byteOffset,
        mergedBuffer.byteOffset + mergedBuffer.byteLength
      ) as ArrayBuffer;

      try {
        const parseResult = await parseEngine.parseFile(
          arrayBuffer,
          sessionInfo.fileName,
          rule
        );

        await deleteSession(uploadId);

        return NextResponse.json({
          success: true,
          orders: parseResult.orders || [],
          totalRows: parseResult.totalRows || 0,
          errors: parseResult.errors || [],
          message: `分片合并解析完成，共 ${parseResult.totalRows || 0} 条记录`,
        });
      } catch (parseError: any) {
        await deleteSession(uploadId);
        console.error('分片合并后解析失败:', parseError);
        throw parseError;
      }
    }

    return NextResponse.json({ error: '缺少必要参数' }, { status: 400 });
  } catch (error: any) {
    console.error('分片上传错误:', error);
    return NextResponse.json({ error: error.message || '分片上传失败' }, { status: 500 });
  }
}

function getMimeType(fileType: string): string {
  const map: Record<string, string> = {
    excel: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    xls: 'application/vnd.ms-excel',
    csv: 'text/csv',
    pdf: 'application/pdf',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    doc: 'application/msword',
  };
  return map[fileType] || 'application/octet-stream';
}
