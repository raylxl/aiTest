'use client';

import { useState, useCallback, useRef, useEffect } from 'react';

interface UseLargeDataOptions<T> {
  pageSize?: number; // 每页数据量
  initialData?: T[]; // 初始数据
}

interface UseLargeDataReturn<T> {
  data: T[];
  displayedData: T[];
  totalCount: number;
  currentPage: number;
  totalPages: number;
  isLoading: boolean;
  setData: (data: T[] | ((prev: T[]) => T[])) => void;
  loadMore: () => void;
  goToPage: (page: number) => void;
  reset: () => void;
}

/**
 * 大数据分页Hook - 用于处理大量数据的分页加载
 * @param options 配置选项
 * @returns 分页数据和操作方法
 */
export function useLargeData<T>(
  options: UseLargeDataOptions<T> = {}
): UseLargeDataReturn<T> {
  const { pageSize = 50, initialData = [] } = options;
  
  const [data, setDataState] = useState<T[]>(initialData);
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  
  // 支持函数式更新
  const setData = useCallback((dataOrFn: T[] | ((prev: T[]) => T[])) => {
    if (typeof dataOrFn === 'function') {
      setDataState(dataOrFn);
    } else {
      setDataState(dataOrFn);
    }
  }, []);
  
  const totalPages = Math.ceil(data.length / pageSize);
  const displayedData = data.slice(0, currentPage * pageSize);
  
  const loadMore = useCallback(() => {
    if (currentPage < totalPages && !isLoading) {
      setIsLoading(true);
      // 模拟异步加载
      setTimeout(() => {
        setCurrentPage(prev => prev + 1);
        setIsLoading(false);
      }, 100);
    }
  }, [currentPage, totalPages, isLoading]);
  
  const goToPage = useCallback((page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  }, [totalPages]);
  
  const reset = useCallback(() => {
    setCurrentPage(1);
    setData([]);
  }, []);
  
  // 监听数据变化，自动重置分页
  useEffect(() => {
    setCurrentPage(1);
  }, [data.length]);
  
  return {
    data,
    displayedData,
    totalCount: data.length,
    currentPage,
    totalPages,
    isLoading,
    setData,
    loadMore,
    goToPage,
    reset,
  };
}

/**
 * 虚拟滚动数据Hook - 用于超大数据集的虚拟滚动
 * @param data 完整数据
 * @param containerHeight 容器高度
 * @param itemHeight 每项高度
 * @returns 虚拟滚动所需的数据和样式
 */
export function useVirtualScrollData<T>(
  data: T[],
  containerHeight: number,
  itemHeight: number
) {
  const [scrollTop, setScrollTop] = useState(0);
  const overscan = 5;
  
  const totalHeight = data.length * itemHeight;
  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
  const endIndex = Math.min(
    data.length,
    Math.ceil((scrollTop + containerHeight) / itemHeight) + overscan
  );
  
  const visibleData = data.slice(startIndex, endIndex);
  const offsetY = startIndex * itemHeight;
  
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);
  
  return {
    visibleData,
    totalHeight,
    offsetY,
    handleScroll,
    startIndex,
    endIndex,
  };
}

/**
 * Web Worker处理Hook - 用于后台处理大数据
 * @param workerPath Worker脚本路径
 * @returns Worker操作方法
 */
export function useWebWorker(workerPath: string) {
  const workerRef = useRef<Worker | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<Error | null>(null);
  
  useEffect(() => {
    // 创建Worker
    workerRef.current = new Worker(workerPath);
    
    // 监听消息
    workerRef.current.onmessage = (e) => {
      setResult(e.data);
      setIsProcessing(false);
    };
    
    // 监听错误
    workerRef.current.onerror = (e) => {
      setError(new Error(e.message));
      setIsProcessing(false);
    };
    
    return () => {
      workerRef.current?.terminate();
    };
  }, [workerPath]);
  
  const postMessage = useCallback((data: any) => {
    if (workerRef.current) {
      setIsProcessing(true);
      setError(null);
      workerRef.current.postMessage(data);
    }
  }, []);
  
  const terminate = useCallback(() => {
    workerRef.current?.terminate();
    setIsProcessing(false);
  }, []);
  
  return {
    postMessage,
    terminate,
    isProcessing,
    result,
    error,
  };
}
