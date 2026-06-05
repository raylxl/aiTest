/**
 * 解析 Web Worker
 * 在独立线程中执行大文件解析，避免阻塞主线程
 * 
 * 消息格式：
 * 主线程 → Worker: { type: 'PARSE', payload: { fileBuffer: ArrayBuffer, fileName: string, rule: ParseRule } }
 * Worker → 主线程: { type: 'PROGRESS', payload: { percent: number, message: string } }
 * Worker → 主线程: { type: 'DONE', payload: { orders: ParsedOrder[] } }
 * Worker → 主线程: { type: 'ERROR', payload: { error: string } }
 */

// Worker 环境下通过 fetch 调用服务端解析接口
// （Worker 内无法直接 import 服务端模块，因此发送请求给 /api/parse）

self.onmessage = async function (event: MessageEvent) {
  const { type, payload } = event.data;

  if (type !== 'PARSE') return;

  const { fileBuffer, fileName, fileType, rule } = payload as {
    fileBuffer: ArrayBuffer;
    fileName: string;
    fileType: string;
    rule: object;
  };

  try {
    self.postMessage({ type: 'PROGRESS', payload: { percent: 10, message: '准备解析文件...' } });

    // 将 ArrayBuffer 转成 Blob，再构造 File
    const blob = new Blob([fileBuffer]);
    const file = new File([blob], fileName);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('rule', JSON.stringify(rule));

    self.postMessage({ type: 'PROGRESS', payload: { percent: 30, message: '上传文件数据...' } });

    const response = await fetch('/api/parse', {
      method: 'POST',
      body: formData,
    });

    self.postMessage({ type: 'PROGRESS', payload: { percent: 80, message: '解析数据中...' } });

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || '解析失败');
    }

    self.postMessage({ type: 'PROGRESS', payload: { percent: 100, message: '解析完成' } });
    self.postMessage({ type: 'DONE', payload: { orders: data.orders, totalRows: data.totalRows } });
  } catch (error: any) {
    self.postMessage({ type: 'ERROR', payload: { error: error?.message || '未知错误' } });
  }
};
