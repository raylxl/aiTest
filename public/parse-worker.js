/**
 * 解析 Web Worker
 * 在独立线程中执行大文件解析，避免阻塞主线程
 * 
 * 消息格式：
 * 主线程 → Worker: { type: 'PARSE', payload: { fileBuffer: ArrayBuffer, fileName: string, fileType: string, rule: object } }
 * Worker → 主线程: { type: 'PROGRESS', payload: { percent: number, message: string } }
 * Worker → 主线程: { type: 'DONE', payload: { orders: ParsedOrder[], totalRows: number } }
 * Worker → 主线程: { type: 'ERROR', payload: { error: string } }
 */

self.onmessage = async function (event) {
  var data = event.data;
  var type = data.type;
  var payload = data.payload;

  if (type !== 'PARSE') return;

  var fileBuffer = payload.fileBuffer;
  var fileName = payload.fileName;
  var fileType = payload.fileType;
  var rule = payload.rule;

  try {
    self.postMessage({ type: 'PROGRESS', payload: { percent: 10, message: '准备解析文件...' } });

    // 将 ArrayBuffer 转成 Blob，再构造 File
    var blob = new Blob([fileBuffer]);
    var file = new File([blob], fileName);

    var formData = new FormData();
    formData.append('file', file);
    formData.append('rule', JSON.stringify(rule));

    self.postMessage({ type: 'PROGRESS', payload: { percent: 30, message: '上传文件数据...' } });

    var response = await fetch('/api/parse', {
      method: 'POST',
      body: formData,
    });

    self.postMessage({ type: 'PROGRESS', payload: { percent: 80, message: '解析数据中...' } });

    var json = await response.json();

    if (!json.success) {
      throw new Error(json.error || '解析失败');
    }

    self.postMessage({ type: 'PROGRESS', payload: { percent: 100, message: '解析完成' } });
    self.postMessage({ type: 'DONE', payload: { orders: json.orders, totalRows: json.totalRows } });
  } catch (error) {
    var msg = error && error.message ? error.message : '未知错误';
    self.postMessage({ type: 'ERROR', payload: { error: msg } });
  }
};
