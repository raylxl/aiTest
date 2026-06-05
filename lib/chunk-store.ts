/**
 * 分片上传存储模块
 * 在服务端内存中暂存文件分片，全部接收后合并解析
 */

interface ChunkData {
  index: number;
  data: Buffer;
  receivedAt: number;
}

interface UploadSession {
  fileName: string;
  fileType: string;
  rule: any; // ParseRule
  totalChunks: number;
  chunks: Map<number, ChunkData>;
  createdAt: number;
}

// 内存存储（生产环境应使用 Redis 或临时文件）
const sessions = new Map<string, UploadSession>();

// 清理超过30分钟的会话
const SESSION_TTL = 30 * 60 * 1000;

function cleanup() {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (now - session.createdAt > SESSION_TTL) {
      sessions.delete(id);
    }
  }
}

// 定时清理（每5分钟检查一次）
if (typeof globalThis !== 'undefined') {
  setInterval(cleanup, 5 * 60 * 1000);
}

export function createSession(uploadId: string, fileName: string, fileType: string, rule: any, totalChunks: number): void {
  sessions.set(uploadId, {
    fileName,
    fileType,
    rule,
    totalChunks,
    chunks: new Map(),
    createdAt: Date.now(),
  });
}

export function storeChunk(uploadId: string, chunkIndex: number, data: Buffer): { received: boolean; chunksReceived: number; totalChunks: number } {
  const session = sessions.get(uploadId);
  if (!session) throw new Error('Upload session not found or expired');
  if (chunkIndex < 0 || chunkIndex >= session.totalChunks) throw new Error('Invalid chunk index');

  session.chunks.set(chunkIndex, { index: chunkIndex, data, receivedAt: Date.now() });

  return {
    received: true,
    chunksReceived: session.chunks.size,
    totalChunks: session.totalChunks,
  };
}

export function isComplete(uploadId: string): { complete: boolean; missingIndices?: number[] } {
  const session = sessions.get(uploadId);
  if (!session) return { complete: false };

  if (session.chunks.size === session.totalChunks) return { complete: true };

  // 找出缺失的分片索引
  const missing: number[] = [];
  for (let i = 0; i < session.totalChunks; i++) {
    if (!session.chunks.has(i)) missing.push(i);
  }

  return { complete: false, missingIndices: missing };
}

export function mergeAndGetFile(uploadId: string): Buffer | null {
  const session = sessions.get(uploadId);
  if (!session || session.chunks.size !== session.totalChunks) return null;

  // 按顺序合并所有分片
  const buffers: Buffer[] = [];
  for (let i = 0; i < session.totalChunks; i++) {
    const chunk = session.chunks.get(i)!;
    buffers.push(chunk.data);
  }

  return Buffer.concat(buffers);
}

export function getSessionRule(uploadId: string): any {
  return sessions.get(uploadId)?.rule ?? null;
}

export function getSessionInfo(uploadId: string): { fileName: string; fileType: string } | null {
  const session = sessions.get(uploadId);
  if (!session) return null;
  return { fileName: session.fileName, fileType: session.fileType };
}

export function deleteSession(uploadId: string): void {
  sessions.delete(uploadId);
}
