'use client';

import { useRef, useCallback, useState } from 'react';
import type { ParseRule, ParsedOrder } from '@/types/rule';

interface WorkerProgress {
  percent: number;
  message: string;
}

interface UseParseWorkerReturn {
  parseWithWorker: (
    file: File,
    rule: ParseRule,
    onProgress?: (p: WorkerProgress) => void
  ) => Promise<{ orders: ParsedOrder[]; totalRows: number }>;
  isWorking: boolean;
  progress: WorkerProgress;
  abort: () => void;
  isSupported: boolean;
}

/**
 * useParseWorker
 * 利用 Web Worker 在独立线程中解析大文件，避免阻塞 UI
 */
export function useParseWorker(): UseParseWorkerReturn {
  const workerRef = useRef<Worker | null>(null);
  const [isWorking, setIsWorking] = useState(false);
  const [progress, setProgress] = useState<WorkerProgress>({ percent: 0, message: '' });

  // 检测浏览器是否支持 Web Worker
  const isSupported = typeof Worker !== 'undefined';

  const abort = useCallback(() => {
    if (workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = null;
    }
    setIsWorking(false);
    setProgress({ percent: 0, message: '' });
  }, []);

  const parseWithWorker = useCallback(
    (
      file: File,
      rule: ParseRule,
      onProgress?: (p: WorkerProgress) => void
    ): Promise<{ orders: ParsedOrder[]; totalRows: number }> => {
      return new Promise(async (resolve, reject) => {
        if (!isSupported) {
          // 浏览器不支持 Worker，降级为主线程 fetch
          try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('rule', JSON.stringify(rule));
            const res = await fetch('/api/parse', { method: 'POST', body: formData });
            const data = await res.json();
            if (data.success) {
              resolve({ orders: data.orders, totalRows: data.totalRows });
            } else {
              reject(new Error(data.error || '解析失败'));
            }
          } catch (err: any) {
            reject(err);
          }
          return;
        }

        // 终止上一个 worker（如有）
        if (workerRef.current) {
          workerRef.current.terminate();
        }

        setIsWorking(true);
        setProgress({ percent: 0, message: '初始化 Worker...' });

        const worker = new Worker('/parse-worker.js');
        workerRef.current = worker;

        worker.onmessage = (event: MessageEvent) => {
          const { type, payload } = event.data;

          if (type === 'PROGRESS') {
            const p = payload as WorkerProgress;
            setProgress(p);
            onProgress?.(p);
          } else if (type === 'DONE') {
            worker.terminate();
            workerRef.current = null;
            setIsWorking(false);
            setProgress({ percent: 100, message: '完成' });
            resolve({ orders: payload.orders, totalRows: payload.totalRows });
          } else if (type === 'ERROR') {
            worker.terminate();
            workerRef.current = null;
            setIsWorking(false);
            setProgress({ percent: 0, message: '' });
            reject(new Error(payload.error));
          }
        };

        worker.onerror = (err) => {
          worker.terminate();
          workerRef.current = null;
          setIsWorking(false);
          reject(new Error(err.message || 'Worker 出错'));
        };

        // 读取文件为 ArrayBuffer，传给 Worker
        const fileBuffer = await file.arrayBuffer();

        worker.postMessage(
          {
            type: 'PARSE',
            payload: {
              fileBuffer,
              fileName: file.name,
              fileType: file.name.split('.').pop()?.toLowerCase() || 'excel',
              rule,
            },
          },
          [fileBuffer] // 转移所有权（零拷贝）
        );
      });
    },
    [isSupported]
  );

  return { parseWithWorker, isWorking, progress, abort, isSupported };
}
