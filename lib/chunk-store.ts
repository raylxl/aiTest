/**
 * 分片上传存储模块（持久化版本）
 * 使用数据库存储上传会话和分片数据，支持Vercel Serverless多实例环境
 */

import sql, { initDB, getNeonClient } from './db';

interface UploadSession {
  uploadId: string;
  fileName: string;
  fileType: string;
  rule: any; // ParseRule
  totalChunks: number;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

// 会话TTL：30分钟
const SESSION_TTL_MS = 30 * 60 * 1000;

/**
 * 初始化数据库（如果尚未初始化）
 */
async function ensureDB() {
  await initDB();
}

/**
 * 创建新的上传会话
 */
export async function createSession(uploadId: string, fileName: string, fileType: string, rule: any, totalChunks: number): Promise<void> {
  await ensureDB();
  
  await sql`
    INSERT INTO upload_sessions (upload_id, file_name, file_type, rule_json, total_chunks, status, created_at, updated_at)
    VALUES (${uploadId}, ${fileName}, ${fileType}, ${JSON.stringify(rule)}, ${totalChunks}, 'uploading', NOW(), NOW())
    ON CONFLICT (upload_id) DO UPDATE SET
      file_name = EXCLUDED.file_name,
      file_type = EXCLUDED.file_type,
      rule_json = EXCLUDED.rule_json,
      total_chunks = EXCLUDED.total_chunks,
      status = 'uploading',
      updated_at = NOW()
  `;
}

/**
 * 存储单个分片
 */
export async function storeChunk(uploadId: string, chunkIndex: number, data: Buffer): Promise<{ received: boolean; chunksReceived: number; totalChunks: number }> {
  await ensureDB();
  
  // 验证会话存在
  const [session] = await sql`SELECT total_chunks FROM upload_sessions WHERE upload_id = ${uploadId} AND status = 'uploading'`;
  if (!session) {
    throw new Error('Upload session not found or expired');
  }
  
  if (chunkIndex < 0 || chunkIndex >= (session as any).total_chunks) {
    throw new Error('Invalid chunk index');
  }
  
  // 存储分片数据（使用ON CONFLICT实现upsert）
  await sql`
    INSERT INTO upload_chunks (upload_id, chunk_index, chunk_data, received_at)
    VALUES (${uploadId}, ${chunkIndex}, ${data}, NOW())
    ON CONFLICT (upload_id, chunk_index) DO UPDATE SET
      chunk_data = EXCLUDED.chunk_data,
      received_at = NOW()
  `;
  
  // 更新会话的updated_at时间
  await sql`UPDATE upload_sessions SET updated_at = NOW() WHERE upload_id = ${uploadId}`;
  
  // 获取已接收的分片数量
  const [countResult] = await sql`SELECT COUNT(*) as count FROM upload_chunks WHERE upload_id = ${uploadId}`;
  const chunksReceived = parseInt((countResult as any).count) || 0;
  
  return {
    received: true,
    chunksReceived,
    totalChunks: (session as any).total_chunks,
  };
}

/**
 * 检查分片是否全部接收完成
 */
export async function isComplete(uploadId: string): Promise<{ complete: boolean; missingIndices?: number[] }> {
  await ensureDB();
  
  const [session] = await sql`SELECT total_chunks FROM upload_sessions WHERE upload_id = ${uploadId} AND status = 'uploading'`;
  if (!session) {
    return { complete: false };
  }
  
  const totalChunks = (session as any).total_chunks;
  
  // 获取已接收的分片索引
  const chunks = await sql`SELECT chunk_index FROM upload_chunks WHERE upload_id = ${uploadId} ORDER BY chunk_index`;
  const receivedIndices = new Set((chunks as any[]).map(c => c.chunk_index));
  
  if (receivedIndices.size === totalChunks) {
    return { complete: true };
  }
  
  // 找出缺失的分片索引
  const missing: number[] = [];
  for (let i = 0; i < totalChunks; i++) {
    if (!receivedIndices.has(i)) {
      missing.push(i);
    }
  }
  
  return { complete: false, missingIndices: missing };
}

/**
 * 合并所有分片并返回文件内容
 */
export async function mergeAndGetFile(uploadId: string): Promise<Buffer | null> {
  await ensureDB();
  
  const [session] = await sql`SELECT total_chunks FROM upload_sessions WHERE upload_id = ${uploadId} AND status = 'uploading'`;
  if (!session) {
    return null;
  }
  
  const totalChunks = (session as any).total_chunks;
  
  // 获取所有分片数据，按索引排序
  const chunks = await sql`
    SELECT chunk_index, chunk_data 
    FROM upload_chunks 
    WHERE upload_id = ${uploadId} 
    ORDER BY chunk_index
  `;
  
  if ((chunks as any[]).length !== totalChunks) {
    return null;
  }
  
  // 合并分片数据
  const buffers: Buffer[] = [];
  for (const chunk of chunks as any[]) {
    buffers.push(Buffer.from(chunk.chunk_data));
  }
  
  return Buffer.concat(buffers);
}

/**
 * 获取会话的解析规则
 */
export async function getSessionRule(uploadId: string): Promise<any> {
  await ensureDB();
  
  const [session] = await sql`SELECT rule_json FROM upload_sessions WHERE upload_id = ${uploadId}`;
  if (!session) {
    return null;
  }
  
  try {
    return JSON.parse((session as any).rule_json);
  } catch {
    return null;
  }
}

/**
 * 获取会话信息（文件名和类型）
 */
export async function getSessionInfo(uploadId: string): Promise<{ fileName: string; fileType: string } | null> {
  await ensureDB();
  
  const [session] = await sql`SELECT file_name, file_type FROM upload_sessions WHERE upload_id = ${uploadId}`;
  if (!session) {
    return null;
  }
  
  return {
    fileName: (session as any).file_name,
    fileType: (session as any).file_type,
  };
}

/**
 * 删除上传会话及其所有分片
 */
export async function deleteSession(uploadId: string): Promise<void> {
  await ensureDB();
  
  // 由于外键约束，删除会话时会自动删除关联的分片
  await sql`DELETE FROM upload_sessions WHERE upload_id = ${uploadId}`;
}

/**
 * 清理过期的上传会话
 */
export async function cleanupExpiredSessions(): Promise<number> {
  await ensureDB();
  
  const cutoffTime = new Date(Date.now() - SESSION_TTL_MS);
  
  // 删除过期的会话（级联删除分片）
  const result = await sql`
    DELETE FROM upload_sessions 
    WHERE updated_at < ${cutoffTime.toISOString()}
    AND status = 'uploading'
  `;
  
  return (result as any[]).length || 0;
}

/**
 * 获取会话状态（用于调试）
 */
export async function getSessionStatus(uploadId: string): Promise<{
  exists: boolean;
  status?: string;
  totalChunks?: number;
  receivedChunks?: number;
  missingIndices?: number[];
} | null> {
  await ensureDB();
  
  const [session] = await sql`
    SELECT status, total_chunks 
    FROM upload_sessions 
    WHERE upload_id = ${uploadId}
  `;
  
  if (!session) {
    return { exists: false };
  }
  
  const totalChunks = (session as any).total_chunks;
  const status = (session as any).status;
  
  // 获取已接收的分片数量
  const [countResult] = await sql`SELECT COUNT(*) as count FROM upload_chunks WHERE upload_id = ${uploadId}`;
  const receivedChunks = parseInt((countResult as any).count) || 0;
  
  // 如果状态是uploading，计算缺失的分片
  let missingIndices: number[] | undefined;
  if (status === 'uploading' && receivedChunks < totalChunks) {
    const chunks = await sql`SELECT chunk_index FROM upload_chunks WHERE upload_id = ${uploadId} ORDER BY chunk_index`;
    const receivedSet = new Set((chunks as any[]).map(c => c.chunk_index));
    
    missingIndices = [];
    for (let i = 0; i < totalChunks; i++) {
      if (!receivedSet.has(i)) {
        missingIndices.push(i);
      }
    }
  }
  
  return {
    exists: true,
    status,
    totalChunks,
    receivedChunks,
    missingIndices,
  };
}