'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import FileUploader from '../components/Upload/FileUploader';
import OrderTable from '../components/Orders/OrderTable';
import Loading from '../components/Common/Loading';
import ProgressBar from '../components/Common/ProgressBar';
import Toast, { showToast } from '../components/Common/Toast';
import { useDebounce } from '../hooks/useDebounce';
import { useLargeData } from '../hooks/useLargeData';
import { useParseWorker } from '../hooks/useWebWorker';
import type { ParsedOrder, ParseRule } from '@/types/rule';

type StepType = 'upload' | 'analyze' | 'confirm' | 'result' | 'history' | 'rules';

interface AnalyzedFile {
  file: File;
  rule: ParseRule | null;
  sample: string;
  fileInfo: { name: string; type: string; sheets: string[] };
  analyzing: boolean;
  error?: string;
}

interface SavedRule {
  id: number;
  name: string;
  description: string;
  fileTypes: string[];
  ruleJson: ParseRule;
  isAiGenerated: boolean;
  usageCount: number;
  createdAt: string;
  updatedAt: string;
}

// AI系统提示词 - 精简版
const AI_SYSTEM_PROMPT = `你是文件解析规则生成专家。根据文件样本生成JSON解析规则。

## 规则类型：table(标准表格) / matrix(矩阵转置) / card(卡片堆叠) / text(正则提取) / multi-sheet(多Sheet合并) / multi-page(多页PDF)

## 输出JSON格式：
\`\`\`json
{
  "name": "规则名称",
  "description": "规则描述",
  "fileTypes": ["excel"],
  "parser": {
    "type": "table",
    "table": {
      "headerRow": 0,
      "dataStartRow": 1,
      "columns": [
        {"sourceIndex": 0, "targetField": "字段名", "dataType": "string"}
      ]
    }
  },
  "recipient": {
    "source": "footer",
    "fields": {
      "name": {"pattern": "收货人[：:]\\\\s*(.+)"},
      "phone": {"pattern": "电话[：:]\\\\s*(\\\\d+)"},
      "address": {"pattern": "地址[：:]\\\\s*(.+)"}
    }
  }
}
\`\`\`

## multi-sheet必须提供table配置
## targetField标准字段：orderNo(单号) / receiverName(收货人) / receiverPhone(电话) / receiverAddress(地址) / itemName(商品) / quantity(数量) / specification(规格)
## 识别表头行，跳过空行和汇总行

targetField应使用以下标准字段名：
- 运单号/单据号/配送单号 → orderNo
- 发货人 → senderName
- 收货人/收货人姓名 → receiverName
- 电话/手机/联系电话 → receiverPhone
- 地址/收货地址/详细地址 → receiverAddress
- 物品名称/商品名称/SKU名称 → itemName
- 物品编码/商品编码/SKU编码 → itemCode
- 物品分类 → itemCategory
- 规格型号/规格 → specification
- 单位 → unit
- 数量/发货数量/出库数量 → quantity

## 重要提示

1. 只输出JSON，不要包含任何解释文字
2. headerRow和dataStartRow使用0-based索引
3. sourceIndex是列的索引（0-based）
4. 正则表达式需要正确转义
`;

export default function ImportPage() {
  const [step, setStep] = useState<StepType>('upload');
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [showMoreActions, setShowMoreActions] = useState(false);
  const [analyzedFiles, setAnalyzedFiles] = useState<AnalyzedFile[]>([]);
  const [parsing, setParsing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [selectedIndices, setSelectedIndices] = useState<number[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingRuleIndex, setEditingRuleIndex] = useState<number | null>(null);
  const [editingRuleJson, setEditingRuleJson] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [apiUrl, setApiUrl] = useState('https://api.siliconflow.cn/v1/chat/completions');
  const [modelName, setModelName] = useState('deepseek-ai/DeepSeek-V4-Pro');

  // 重复检测结果
  const [duplicateNos, setDuplicateNos] = useState<string[]>([]);
  const [dupStats, setDupStats] = useState<{ batchDupCount: number; dbDupCount: number } | null>(null);

  // 全量错误弹窗
  const [showErrorModal, setShowErrorModal] = useState(false);

  // Web Worker
  const { parseWithWorker, isWorking: isWorkerParsing, progress: workerProgress, isSupported: workerSupported } = useParseWorker();

  // 从localStorage或环境变量加载配置
  useEffect(() => {
    // 优先级：环境变量 > localStorage > 空
    const envKey = process.env.NEXT_PUBLIC_AI_API_KEY || '';
    const savedKey = localStorage.getItem('ai_api_key');
    const savedUrl = localStorage.getItem('ai_api_url');
    const savedModel = localStorage.getItem('ai_model_name');
    if (envKey) {
      setApiKey(envKey);
    } else if (savedKey && savedKey !== 'undefined' && savedKey !== 'null' && savedKey.length > 10) {
      setApiKey(savedKey);
    }
    if (savedUrl && savedUrl !== 'undefined' && savedUrl !== 'null' && savedUrl.includes('/chat/completions')) {
      setApiUrl(savedUrl);
    }
    if (savedModel && savedModel !== 'undefined' && savedModel !== 'null' && savedModel.length > 2) {
      setModelName(savedModel);
    }
  }, []);

  // 保存配置到localStorage
  const saveConfig = useCallback(() => {
    localStorage.setItem('ai_api_key', apiKey);
    localStorage.setItem('ai_api_url', apiUrl);
    localStorage.setItem('ai_model_name', modelName);
    showToast('success', '配置已保存');
  }, [apiKey, apiUrl, modelName]);

  // 重置为默认配置
  const resetConfig = useCallback(() => {
    setApiKey('');
    setApiUrl('https://api.siliconflow.cn/v1/chat/completions');
    setModelName('deepseek-ai/DeepSeek-V4-Pro');
    localStorage.removeItem('ai_api_key');
    localStorage.removeItem('ai_api_url');
    localStorage.removeItem('ai_model_name');
    showToast('success', '已重置为默认配置（请重新输入 API Key）');
  }, []);

  const {
    data: orders,
    setData: setOrders,
    displayedData: displayedOrders,
    totalCount,
    currentPage,
    totalPages,
    isLoading: isLoadingMore,
    loadMore,
    goToPage,
  } = useLargeData<ParsedOrder>({ pageSize: 100 });

  const debouncedSearchQuery = useDebounce(searchQuery, 300);

  const filteredOrders = useMemo(() => {
    if (!debouncedSearchQuery) return displayedOrders;
    const query = debouncedSearchQuery.toLowerCase();
    return displayedOrders.filter(order =>
      (order.orderNo?.toLowerCase().includes(query)) ||
      (order.receiverName?.toLowerCase().includes(query)) ||
      (order.receiverPhone?.includes(query)) ||
      (order.itemName?.toLowerCase().includes(query))
    );
  }, [displayedOrders, debouncedSearchQuery]);

  const useVirtualScroll = totalCount > 100;

  // 前端直接调用AI API
  const callAIFromClient = async (sample: string, fileType: string, fileName: string): Promise<ParseRule> => {
    if (!apiKey) throw new Error('请先配置AI API Key');
    let fullApiUrl = apiUrl;
    if (!apiUrl.includes('/chat/completions')) {
      fullApiUrl = apiUrl.replace(/\/+$/, '') + '/chat/completions';
    }
    const userMessage = `请根据以下文件样本生成解析规则。\n\n## 文件信息\n- 文件名：${fileName}\n- 文件类型：${fileType}\n\n## 文件内容样本（前20行）\n\`\`\`\n${sample}\n\`\`\`\n\n请分析文件结构，生成对应的解析规则JSON。`;
    const requestBody = {
      model: modelName,
      messages: [
        { role: 'system', content: AI_SYSTEM_PROMPT },
        { role: 'user', content: userMessage }
      ],
      temperature: 0.3,
      max_tokens: 2048,
      stream: false,
    };
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);
    let response: Response;
    try {
      response = await fetch(fullApiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
    } catch (fetchError: any) {
      clearTimeout(timeoutId);
      if (fetchError.name === 'AbortError') throw new Error('API请求超时（60秒），请检查网络连接或稍后重试');
      throw new Error(`网络请求失败: ${fetchError.message}`);
    }
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API调用失败 (${response.status}): ${errorText.substring(0, 200)}`);
    }
    const responseText = await response.text();
    let content = '';
    try {
      const data = JSON.parse(responseText);
      if (data.error) throw new Error(`API错误: ${data.error.message || JSON.stringify(data.error)}`);
      if (!data.choices || data.choices.length === 0) throw new Error(`API返回空结果。模型: ${data.model || 'unknown'}`);
      content = data.choices[0]?.message?.content || '';
    } catch (jsonError: any) {
      if (jsonError.message?.startsWith('API错误:') || jsonError.message?.startsWith('API返回空结果')) throw jsonError;
      if (responseText.includes('data: ')) {
        const lines = responseText.split('\n');
        let fullContent = '';
        for (const line of lines) {
          const trimmedLine = line.trim();
          if (trimmedLine.startsWith('data: ') && !trimmedLine.includes('[DONE]')) {
            try {
              const chunk = JSON.parse(trimmedLine.slice(6));
              const delta = chunk.choices?.[0]?.delta?.content || chunk.choices?.[0]?.message?.content;
              if (delta) fullContent += delta;
            } catch {}
          }
        }
        content = fullContent;
      } else {
        throw new Error('无法解析API响应: ' + responseText.substring(0, 200));
      }
    }
    if (!content) throw new Error('AI返回空内容，请检查模型名称是否正确（当前: ' + modelName + '）');
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('无法从AI响应中提取JSON');
    return JSON.parse(jsonMatch[0]) as ParseRule;
  };

  // 生成默认规则（当AI失败时的备用方案）—— 不使用文件名判断，统一返回通用 table 规则
  const generateFallbackRule = useCallback((_fileType: string, _fileName: string): ParseRule => {
    return {
      name: '默认规则（待手动配置）',
      description: 'AI分析失败时生成的通用规则，请根据实际文件结构手动编辑',
      fileTypes: ['excel'],
      identifier: {},
      parser: {
        type: 'table',
        table: { headerRow: 'auto', dataStartRow: 'auto', columns: [] }
      },
      recipient: {
        source: 'footer',
        fields: {
          name: { pattern: '收货人[：:]\\s*(.+?)(?:\\s|$)' },
          phone: { pattern: '(?:电话|手机)[：:]\\s*(\\d+)' },
          address: { pattern: '(?:地址|收货地址)[：:]\\s*(.+)' }
        }
      }
    };
  }, []);

  // 步骤1：选择文件
  const handleFilesSelected = useCallback((newFiles: File[]) => {
    const analyzed: AnalyzedFile[] = newFiles.map(file => ({
      file,
      rule: null,
      sample: '',
      fileInfo: { name: file.name, type: '', sheets: [] },
      analyzing: false,
    }));
    setAnalyzedFiles(prev => [...prev, ...analyzed]);
  }, []);

  // 步骤1：移除文件（与FileUploader同步）
  const handleFileRemoved = useCallback((fileName: string) => {
    setAnalyzedFiles(prev => prev.filter(f => f.file.name !== fileName));
  }, []);

  // 步骤2：AI分析单个文件
  const handleAnalyzeFile = async (index: number) => {
    const item = analyzedFiles[index];
    if (!item) return;
    setAnalyzedFiles(prev => prev.map((f, i) => i === index ? { ...f, analyzing: true, error: undefined } : f));
    try {
      const formData = new FormData();
      formData.append('file', item.file);
      const extractResponse = await fetch('/api/extract-sample', { method: 'POST', body: formData });
      const extractData = await extractResponse.json();
      if (!extractData.success) throw new Error(extractData.error || '提取样本失败');
      let rule: ParseRule;
      try {
        rule = await callAIFromClient(extractData.sample, extractData.fileInfo.type, extractData.fileInfo.name);
      } catch (aiError) {
        console.warn('AI分析失败，使用默认规则:', aiError);
        rule = generateFallbackRule(extractData.fileInfo.type, extractData.fileInfo.name);
        showToast('warning', `${item.file.name} AI分析失败，已使用默认规则（可手动编辑）`);
      }
      setAnalyzedFiles(prev => prev.map((f, i) => i === index ? {
        ...f, rule, sample: extractData.sample, fileInfo: extractData.fileInfo, analyzing: false,
      } : f));
      showToast('success', `${item.file.name} 分析完成`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : '分析失败';
      setAnalyzedFiles(prev => prev.map((f, i) => i === index ? { ...f, analyzing: false, error: errorMsg } : f));
      showToast('error', `${item.file.name} 分析失败: ${errorMsg}`);
    }
  };

  // 批量AI分析所有文件
  const handleAnalyzeAll = async () => {
    if (!apiKey) { showToast('error', '请先配置AI API Key'); return; }
    setStep('analyze');
    for (let i = 0; i < analyzedFiles.length; i++) {
      if (!analyzedFiles[i].rule) await handleAnalyzeFile(i);
    }
    setStep('confirm');
  };

  // 编辑规则
  const handleEditRule = (index: number) => {
    const item = analyzedFiles[index];
    if (!item?.rule) return;
    setEditingRuleIndex(index);
    setEditingRuleJson(JSON.stringify(item.rule, null, 2));
  };

  // 保存编辑后的规则
  const handleSaveRule = () => {
    if (editingRuleIndex === null) return;
    try {
      const rule = JSON.parse(editingRuleJson) as ParseRule;
      setAnalyzedFiles(prev => prev.map((f, i) => i === editingRuleIndex ? { ...f, rule } : f));
      setEditingRuleIndex(null);
      showToast('success', '规则已更新');
    } catch {
      showToast('error', 'JSON格式错误');
    }
  };

  // 保存规则到数据库（规则库）
  const handleSaveRuleToDB = async (index: number) => {
    const item = analyzedFiles[index];
    if (!item?.rule) return;
    try {
      const response = await fetch('/api/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: item.rule.name,
          description: item.rule.description || '',
          fileTypes: item.rule.fileTypes || ['excel'],
          ruleJson: item.rule,
          isAiGenerated: true,
        }),
      });
      const data = await response.json();
      if (data.success) {
        showToast('success', `规则"${item.rule.name}"已保存到规则库`);
      } else {
        showToast('error', data.error || '保存规则失败');
      }
    } catch {
      showToast('error', '保存规则失败');
    }
  };

  // 步骤3：用确认后的规则解析所有文件（分片上传 > Web Worker > 主线程）
  const CHUNK_SIZE = 2 * 1024 * 1024; // 2MB per chunk
  const CHUNK_THRESHOLD = 10 * 1024 * 1024; // >10MB 使用分片上传

  // 分片上传单个文件
  const parseFileWithChunks = async (file: File, rule: ParseRule): Promise<{ orders: ParsedOrder[]; totalRows: number }> => {
    const uploadId = crypto.randomUUID();
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

    // Step 1: 初始化会话
    const initFd = new FormData();
    initFd.append('action', 'init');
    initFd.append('uploadId', uploadId);
    initFd.append('fileName', file.name);
    initFd.append('fileType', file.name.split('.').pop() || 'excel');
    initFd.append('totalChunks', String(totalChunks));
    initFd.append('rule', JSON.stringify(rule));

    const initRes = await fetch('/api/upload-chunk', { method: 'POST', body: initFd });
    const initData = await initRes.json();
    if (!initData.success) throw new Error(initData.error || '初始化分片上传失败');

    // Step 2: 逐片上传
    showToast('info', `${file.name} 开始分片上传 (${totalChunks} 片, ${(file.size / 1024 / 1024).toFixed(1)}MB)...`);

    for (let i = 0; i < totalChunks; i++) {
      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, file.size);
      const chunkBlob = file.slice(start, end);
      const chunkFile = new File([chunkBlob], `chunk_${i}`);

      const fd = new FormData();
      fd.append('action', 'upload');
      fd.append('uploadId', uploadId);
      fd.append('chunkIndex', String(i));
      fd.append('data', chunkFile);

      const res = await fetch('/api/upload-chunk', { method: 'POST', body: fd });
      const data = await res.json();

      if (!data.success) throw new Error(`第 ${i + 1}/${totalChunks} 片上传失败: ${data.error || ''}`);

      setProgress(((i + 1) / totalChunks) * 100);
    }

    // Step 3: 触发合并和解析
    showToast('info', `所有分片已接收，正在合并解析...`);
    const finishFd = new FormData();
    finishFd.append('action', 'finish');
    finishFd.append('uploadId', uploadId);

    const finishRes = await fetch('/api/upload-chunk', { method: 'POST', body: finishFd });
    const finishData = await finishRes.json();

    if (!finishData.success) throw new Error(finishData.error || '合并解析失败');

    return { orders: finishData.orders, totalRows: finishData.totalRows };
  };

  const handleParseAll = async () => {
    const filesWithRules = analyzedFiles.filter(f => f.rule);
    if (filesWithRules.length === 0) {
      showToast('warning', '没有可用的解析规则，请先完成AI分析');
      return;
    }
    setParsing(true);
    setProgress(0);
    setOrders([]);
    setSelectedIndices([]);
    setDuplicateNos([]);
    setDupStats(null);

    try {
      const allOrders: ParsedOrder[] = [];
      const total = filesWithRules.length;

      for (let i = 0; i < total; i++) {
        const item = filesWithRules[i];
        setProgress(((i + 0.5) / total) * 100);

        try {
          // 策略选择：大文件分片 > 大文件Worker > 普通主线程
          if (item.file.size > CHUNK_THRESHOLD) {
            // >10MB：使用分片上传
            showToast('info', `${item.file.name} 使用分片上传 (${Math.ceil(item.file.size / CHUNK_SIZE)} 片)...`);
            const result = await parseFileWithChunks(item.file, item.rule!);
            allOrders.push(...result.orders);
            showToast('success', `${item.file.name} 分片完成，${result.totalRows} 条记录`);
          } else if (workerSupported && item.file.size > 500 * 1024) {
            // >500KB：使用 Web Worker
            showToast('info', `${item.file.name} 使用 Worker 后台解析...`);
            const result = await parseWithWorker(item.file, item.rule!, (p) => {
              const fileProgress = ((i + p.percent / 100) / total) * 100;
              setProgress(fileProgress);
            });
            allOrders.push(...result.orders);
            showToast('success', `${item.file.name} Worker解析完成，${result.totalRows} 条记录`);
          } else {
            // 小文件：直接主线程请求
            const formData = new FormData();
            formData.append('file', item.file);
            formData.append('rule', JSON.stringify(item.rule));
            const response = await fetch('/api/parse', { method: 'POST', body: formData });
            const data = await response.json();
            if (data.success) {
              allOrders.push(...data.orders);
              showToast('success', `${item.file.name} 解析完成，${data.totalRows} 条记录`);
            } else {
              showToast('error', `${item.file.name} 解析失败: ${data.error}`);
            }
          }
        } catch (fileErr: any) {
          showToast('error', `${item.file.name} 解析失败: ${fileErr?.message || '未知错误'}`);
        }

        setProgress(((i + 1) / total) * 100);
      }

      setOrders(allOrders);

      // 解析完成后自动执行重复检测
      const orderNos = allOrders.map(o => o.orderNo || '').filter(n => n);
      if (orderNos.length > 0) {
        try {
          const dupRes = await fetch('/api/check-duplicates', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ orderNos }),
          });
          const dupData = await dupRes.json();
          if (dupData.success && dupData.duplicates.length > 0) {
            setDuplicateNos(dupData.duplicates);
            setDupStats({ batchDupCount: dupData.stats.batchDupCount, dbDupCount: dupData.stats.dbDupCount });
            showToast('warning', `检测到 ${dupData.duplicates.length} 个重复运单号（批次内: ${dupData.stats.batchDupCount}，数据库已存在: ${dupData.stats.dbDupCount}）`);
          } else {
            showToast('success', '无重复运单号');
          }
        } catch {
          // 重复检测失败不影响主流程
        }
      }

      setStep('result');
      showToast('success', `全部解析完成，共 ${allOrders.length} 条记录`);
    } catch {
      showToast('error', '解析过程中发生错误');
    } finally {
      setParsing(false);
    }
  };

  // 移除文件
  const handleRemoveFile = (index: number) => {
    setAnalyzedFiles(prev => prev.filter((_, i) => i !== index));
  };

  // 导出Excel
  const handleExport = async () => {
    if (orders.length === 0) { showToast('warning', '没有可导出的数据'); return; }
    try {
      const exportData = selectedIndices.length > 0
        ? orders.filter((_, i) => selectedIndices.includes(i))
        : filteredOrders;
      const response = await fetch('/api/orders/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orders: exportData }),
      });
      if (response.ok) {
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `运单数据_${Date.now()}.xlsx`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast('success', '导出成功');
      } else { showToast('error', '导出失败'); }
    } catch { showToast('error', '导出失败'); }
  };

  // 删除选中
  const handleDeleteSelected = () => {
    if (selectedIndices.length === 0) { showToast('warning', '请先选择要删除的记录'); return; }
    setOrders((prev: ParsedOrder[]) => prev.filter((_, i) => !selectedIndices.includes(i)));
    setSelectedIndices([]);
    showToast('success', `已删除 ${selectedIndices.length} 条记录`);
  };

  // 删除单个订单
  const handleDeleteOrder = (index: number) => {
    setOrders((prev: ParsedOrder[]) => prev.filter((_, i) => i !== index));
    showToast('success', '已删除');
  };

  // 收集全量错误信息（行号 + 字段名 + 原因）
  const collectAllErrors = useCallback((): { row: number; field: string; reason: string; orderNo?: string }[] => {
    const allErrors: { row: number; field: string; reason: string; orderNo?: string }[] = [];
    orders.forEach((order, idx) => {
      if (!order.isValid && order.validationErrors?.length) {
        order.validationErrors.forEach((err: string) => {
          // 尝试从错误消息中提取字段名
          const fieldMatch = err.match(/^(.+?)[：:]\s*(.+)$/);
          allErrors.push({
            row: (order.sourceRow ?? idx) + 1,
            field: fieldMatch ? fieldMatch[1].trim() : '未知字段',
            reason: fieldMatch ? fieldMatch[2].trim() : err,
            orderNo: order.orderNo || undefined,
          });
        });
      } else if (!order.isValid) {
        // 无详细错误信息但标记为无效
        const missingFields: string[] = [];
        if (!order.itemCode) missingFields.push('物品编码');
        if (!order.itemName) missingFields.push('物品名称');
        if ((order.quantity == null || order.quantity <= 0)) missingFields.push('数量(正数)');
        if (!order.storeName && !order.receiverName) missingFields.push('门店或收件人(二选一)');
        if (order.receiverPhone && !/^1\d{10}$/.test(order.receiverPhone)) missingFields.push('电话格式');
        missingFields.forEach(f => {
          allErrors.push({ row: (order.sourceRow ?? idx) + 1, field: f, reason: `必填项为空或格式错误`, orderNo: order.orderNo || undefined });
        });
      }
    });
    return allErrors;
  }, [orders]);

  // 批量提交（校验+进度条+阻止错误行）
  const [submitting, setSubmitting] = useState(false);
  const [submitProgress, setSubmitProgress] = useState(0);
  const handleSubmitOrders = async () => {
    if (orders.length === 0) { showToast('warning', '没有可提交的数据'); return; }

    // 检查错误行 → 打开全量错误弹窗
    const errorOrders = orders.filter(o => !o.isValid);
    if (errorOrders.length > 0) {
      setShowErrorModal(true);
      return;
    }

    // 确认提交
    if (!confirm(`确定要提交 ${orders.length} 条运单吗？`)) return;

    setSubmitting(true);
    setSubmitProgress(0);

    try {
      const submitData = selectedIndices.length > 0 ? orders.filter((_, i) => selectedIndices.includes(i)) : orders;
      const BATCH_SIZE = 100; // 分批提交

      let successCount = 0;
      let failCount = 0;
      const totalBatches = Math.ceil(submitData.length / BATCH_SIZE);

      for (let batchIdx = 0; batchIdx < totalBatches; batchIdx++) {
        const start = batchIdx * BATCH_SIZE;
        const end = Math.min(start + BATCH_SIZE, submitData.length);
        const batch = submitData.slice(start, end);

        setSubmitProgress(Math.round((batchIdx / totalBatches) * 90));
        showToast('info', `正在提交第 ${start + 1} ~ ${end} 条，共 ${submitData.length} 条...`);

        const response = await fetch('/api/import-orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orders: batch,
            fileName: analyzedFiles.map(f => f.file.name).join(', '),
            fileType: analyzedFiles[0]?.fileInfo?.type || 'unknown',
            ruleName: analyzedFiles[0]?.rule?.name || '',
            ruleJson: analyzedFiles[0]?.rule || {},
          }),
        });
        const data = await response.json();

        if (data.success) {
          successCount += batch.length;
        } else {
          failCount += batch.length;
        }
      }

      setSubmitProgress(100);
      if (failCount === 0) {
        showToast('success', `全部提交成功！共 ${successCount} 条运单已入库`);
      } else {
        showToast('warning', `提交完成：成功 ${successCount} 条，失败 ${failCount} 条`);
      }
    } catch (err) {
      console.error('提交失败:', err);
      showToast('error', '提交失败，请检查网络连接');
    } finally {
      setSubmitting(false);
      setTimeout(() => setSubmitProgress(0), 2000);
    }
  };

  // 跳过错误行，仅提交有效数据
  const submitValidOrdersOnly = async (validOrders: ParsedOrder[]) => {
    if (validOrders.length === 0) return;
    setSubmitting(true);
    setSubmitProgress(0);
    try {
      const BATCH_SIZE = 100;
      const totalBatches = Math.ceil(validOrders.length / BATCH_SIZE);
      let successCount = 0;
      for (let i = 0; i < totalBatches; i++) {
        const batch = validOrders.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE);
        setSubmitProgress(Math.round((i / totalBatches) * 90));
        const res = await fetch('/api/import-orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orders: batch,
            fileName: analyzedFiles.map(f => f.file.name).join(', '),
            fileType: analyzedFiles[0]?.fileInfo?.type || 'unknown',
            ruleName: analyzedFiles[0]?.rule?.name || '',
            ruleJson: analyzedFiles[0]?.rule || {},
          }),
        });
        const data = await res.json();
        if (data.success) successCount += batch.length;
      }
      setSubmitProgress(100);
      showToast('success', `已跳过错误行，成功提交 ${successCount} 条有效运单`);
    } catch { showToast('error', '提交失败'); }
    finally { setSubmitting(false); setTimeout(() => setSubmitProgress(0), 2000); }
  };

  // 保存到数据库
  const [saving, setSaving] = useState(false);
  const handleSaveToDB = async () => {
    if (orders.length === 0) { showToast('warning', '没有可保存的数据'); return; }
    setSaving(true);
    try {
      const saveData = selectedIndices.length > 0 ? orders.filter((_, i) => selectedIndices.includes(i)) : orders;
      const response = await fetch('/api/import-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orders: saveData,
          fileName: analyzedFiles.map(f => f.file.name).join(', '),
          fileType: analyzedFiles[0]?.fileInfo?.type || 'unknown',
          ruleName: analyzedFiles[0]?.rule?.name || '',
          ruleJson: analyzedFiles[0]?.rule || {},
        }),
      });
      const data = await response.json();
      if (data.success) showToast('success', `已保存 ${saveData.length} 条运单到数据库`);
      else showToast('error', data.error || '保存失败');
    } catch { showToast('error', '保存失败'); }
    finally { setSaving(false); }
  };

  const handleBackToUpload = () => setStep('upload');
  const handleRestart = () => {
    setStep('upload'); setAnalyzedFiles([]); setOrders([]); setSelectedIndices([]); setSearchQuery('');
    setDuplicateNos([]); setDupStats(null);
  };

  return (
    <div className="min-h-screen bg-gray-50 overflow-auto">
      <Toast />

      {/* 顶部导航 - 响应式 */}
      <header className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-14 sm:h-16">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="w-8 h-8 sm:w-10 sm:h-10 bg-[#0fc6c2] rounded-lg flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 sm:w-6 sm:h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
              </div>
              <div className="min-w-0">
                <h1 className="text-base sm:text-xl font-bold text-gray-900 truncate">万能导入 V2</h1>
                <p className="hidden sm:block text-xs text-gray-500">智能多格式批量下单系统</p>
              </div>
            </div>
            {/* 右侧操作区：移动端折叠显示 */}
            <div className="flex items-center gap-1 sm:gap-3">
              {orders.length > 0 && (
                <span className="hidden md:inline-block text-sm text-gray-600 shrink-0">
                  已解析 <span className="font-medium text-[#0fc6c2]">{orders.length}</span> 条运单
                  {useVirtualScroll && <span className="ml-2 text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded">虚拟滚动</span>}
                  {workerSupported && <span className="ml-2 text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded">Worker</span>}
                </span>
              )}
              {/* 移动端显示简化计数 */}
              {orders.length > 0 && (
                <span className="md:hidden text-xs font-medium text-[#0fc6c2] bg-[#0fc6c2]/10 px-2 py-0.5 rounded-full shrink-0">{orders.length}条</span>
              )}
              <button onClick={() => setStep('rules')} className="text-xs sm:text-sm text-[#0fc6c2] hover:text-[#0aa8a4] whitespace-nowrap shrink-0 hidden xs:inline-block">⚙️ 规则库</button>
              <button onClick={() => setStep('history')} className="text-xs sm:text-sm text-[#0fc6c2] hover:text-[#0aa8a4] whitespace-nowrap shrink-0 hidden xs:inline-block">📋 历史记录</button>
              {step !== 'upload' && step !== 'history' && step !== 'rules' && (
                <button onClick={handleRestart} className="text-xs sm:text-sm text-gray-500 hover:text-gray-700 whitespace-nowrap shrink-0">重置</button>
              )}
              {/* 移动端菜单按钮 */}
              <button onClick={() => setShowMobileMenu(!showMobileMenu)} className="xs:hidden p-1.5 text-gray-600 hover:bg-gray-100 rounded-lg shrink-0" aria-label="菜单">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16"/></svg>
              </button>
            </div>
            {/* 移动端下拉菜单 */}
            {showMobileMenu && (
              <div className="absolute right-3 top-14 sm:top-16 bg-white shadow-lg border border-gray-200 rounded-lg py-2 z-50 min-w-[140px]">
                <button onClick={() => { setStep('rules'); setShowMobileMenu(false); }} className="block w-full text-left px-4 py-2 text-sm text-[#0fc6c2] hover:bg-[#0fc6c2]/5">⚙️ 规则库</button>
                <button onClick={() => { setStep('history'); setShowMobileMenu(false); }} className="block w-full text-left px-4 py-2 text-sm text-[#0fc6c2] hover:bg-[#0fc6c2]/5">📋 历史记录</button>
                {orders.length > 0 && <div className="border-t my-1"></div>}
                {orders.length > 0 && <div className="px-4 py-1 text-xs text-gray-400">已解析 {orders.length} 条运单</div>}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* 步骤指示器 - 响应式 */}
      {step !== 'history' && step !== 'rules' && (
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 pt-4 sm:pt-6">
          <div className="flex items-center justify-center gap-1 sm:gap-2 mb-4 sm:mb-6 overflow-x-auto pb-1 scrollbar-hide">
            {[
              { key: 'upload', label: '上传文件', icon: '📁' },
              { key: 'analyze', label: 'AI分析', icon: '🤖' },
              { key: 'confirm', label: '确认规则', icon: '✅' },
              { key: 'result', label: '解析结果', icon: '📊' },
            ].map((s, i) => (
              <div key={s.key} className="flex items-center shrink-0">
                <div className={`flex items-center gap-0.5 sm:gap-1 px-2 sm:px-3 py-1 sm:py-1.5 rounded-full text-xs sm:text-sm whitespace-nowrap ${
                  step === s.key ? 'bg-[#0fc6c2] text-white'
                    : (['upload', 'analyze', 'confirm', 'result'].indexOf(step) > i
                      ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500')
                }`}>
                  <span className="hidden xs:inline">{s.icon}</span><span>{s.label}</span>
                </div>
                {i < 3 && <div className="w-8 h-px bg-gray-300 mx-1" />}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 主内容区 - 响应式容器 */}
      <main className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 pb-8">

        {/* AI配置区域 */}
        {step === 'upload' && (
          <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
            <h3 className="text-sm font-medium text-gray-700 mb-3">🤖 AI配置</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">API地址</label>
                <input type="text" value={apiUrl} onChange={e => setApiUrl(e.target.value)}
                  placeholder="https://api.openai.com/v1/chat/completions"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0fc6c2]" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">模型名称</label>
                <input type="text" value={modelName} onChange={e => setModelName(e.target.value)}
                  placeholder="例如：deepseek-ai/DeepSeek-V4-Pro、deepseek-ai/DeepSeek-V3"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0fc6c2]" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">API Key</label>
                <div className="flex gap-2">
                  <input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="sk-..."
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0fc6c2]" />
                  <button onClick={saveConfig} className="px-4 py-2 bg-[#0fc6c2] text-white rounded-lg text-sm hover:bg-[#0aa8a4]">保存</button>
                  <button onClick={resetConfig} className="px-4 py-2 bg-gray-100 text-gray-600 rounded-lg text-sm hover:bg-gray-200">重置</button>
                </div>
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-2">配置会保存在浏览器本地，下次无需重复输入</p>
            <div className="mt-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
              <div className="flex items-center gap-1.5 mb-2">
                <span className="text-xs font-medium text-gray-600">📋 参考配置</span>
                <button
                  onClick={() => { setApiUrl('https://api.siliconflow.cn/v1/chat/completions'); setModelName('deepseek-ai/DeepSeek-V4-Pro'); setApiKey('sk-khaapftyovblxbluvgeneufbsokapjejqyndjtgcvwwadpld'); }}
                  className="text-xs text-[#0fc6c2] hover:text-[#0aa8a4] hover:underline cursor-pointer"
                >一键填入</button>
              </div>
              <div className="space-y-1.5 text-xs font-mono">
                <div className="flex items-center gap-2">
                  <span className="text-gray-500 w-16 shrink-0">API地址：</span>
                  <code className="bg-white px-2 py-0.5 rounded border border-gray-200 text-gray-700 break-all">https://api.siliconflow.cn/v1/chat/completions</code>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-gray-500 w-16 shrink-0">模型名：</span>
                  <code className="bg-white px-2 py-0.5 rounded border border-gray-200 text-gray-700 break-all">deepseek-ai/DeepSeek-V4-Pro</code>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-gray-500 w-16 shrink-0">API Key：</span>
                  <code className="bg-white px-2 py-0.5 rounded border border-gray-200 text-gray-700 break-all">sk-kh***adpld</code>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 步骤1：上传文件 */}
        {step === 'upload' && (
          <div className="space-y-6">
            <FileUploader onFilesSelected={handleFilesSelected} onFileRemoved={handleFileRemoved} />
            <div className="bg-blue-50 rounded-lg p-4">
              <h4 className="font-medium text-blue-900 mb-2">💡 核心设计理念</h4>
              <p className="text-sm text-blue-800">
                不是写 N 个 if-else 适配 N 种文件，而是设计一套<strong>通用规则描述语言</strong>。
                每种新格式只需"AI分析生成一条规则"即可适配。新增第 5、第 10 种格式时，<strong>系统代码零改动</strong>。
              </p>
            </div>
            <button onClick={handleAnalyzeAll} disabled={analyzedFiles.length === 0 || !apiKey}
              className="w-full px-6 py-3 bg-[#0fc6c2] text-white rounded-lg font-medium hover:bg-[#0aa8a4] disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
              🤖 开始AI分析 ({analyzedFiles.length} 个文件)
            </button>
            {!apiKey && <p className="text-sm text-red-500 text-center">请先配置AI API Key</p>}
          </div>
        )}

        {/* 步骤2：AI分析中 */}
        {step === 'analyze' && (
          <div className="space-y-4">
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">🤖 AI正在分析文件结构...</h3>
              <ProgressBar progress={progress} />
              <div className="mt-4 space-y-3">
                {analyzedFiles.map((item, index) => (
                  <div key={index} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                    {item.analyzing ? <Loading size="sm" /> : item.rule ? <span className="text-green-500">✅</span> : item.error ? <span className="text-red-500">❌</span> : <span className="text-gray-400">⏳</span>}
                    <span className="text-sm text-gray-700">{item.file.name}</span>
                    {item.rule && <span className="text-xs text-[#0fc6c2]">→ {item.rule.parser.type}</span>}
                    {item.error && <span className="text-xs text-red-500">{item.error}</span>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 步骤3：确认规则 */}
        {step === 'confirm' && (
          <div className="space-y-4">
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-2">✅ 确认解析规则</h3>
              <p className="text-sm text-gray-600 mb-4">AI已分析每个文件并生成规则。可编辑调整后保存到规则库供复用。</p>
              <div className="space-y-4">
                {analyzedFiles.map((item, index) => (
                  <div key={index} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900">{item.file.name}</span>
                        {item.rule && (
                          <span className="text-xs bg-[#0fc6c2]/10 text-[#0fc6c2] px-2 py-0.5 rounded">{item.rule.parser.type}</span>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => handleAnalyzeFile(index)} disabled={item.analyzing} className="text-xs text-[#0fc6c2] hover:text-[#0aa8a4]">重新分析</button>
                        {item.rule && (
                          <>
                            <button onClick={() => handleEditRule(index)} className="text-xs text-blue-500 hover:text-blue-700">编辑规则</button>
                            <button onClick={() => handleSaveRuleToDB(index)} className="text-xs text-purple-500 hover:text-purple-700">💾 保存到规则库</button>
                          </>
                        )}
                      </div>
                    </div>
                    {item.rule ? (
                      <div className="bg-gray-50 rounded p-3">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-sm font-medium">{item.rule.name}</span>
                        </div>
                        {item.rule.description && <p className="text-xs text-gray-600 mb-2">{item.rule.description}</p>}
                        <div className="text-xs text-gray-500">
                          解析模式: {item.rule.parser.type} | 字段数: {item.rule.parser.table?.columns?.length || item.rule.parser.matrix?.storeColumns?.length || '-'}
                        </div>
                      </div>
                    ) : (
                      <div className="bg-red-50 rounded p-3 text-sm text-red-700">{item.error || '未能生成规则'}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* 规则编辑弹窗 - 响应式 */}
            {editingRuleIndex !== null && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                <div className="bg-white rounded-lg p-4 sm:p-6 w-full max-w-2xl max-h-[85vh] overflow-auto">
                  <h3 className="text-lg font-medium mb-4">编辑解析规则</h3>
                  <textarea value={editingRuleJson} onChange={e => setEditingRuleJson(e.target.value)}
                    className="w-full h-96 font-mono text-sm border border-gray-300 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-[#0fc6c2]" />
                  <div className="flex gap-3 mt-4 justify-end">
                    <button onClick={() => setEditingRuleIndex(null)} className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200">取消</button>
                    <button onClick={handleSaveRule} className="px-4 py-2 text-white bg-[#0fc6c2] rounded-lg hover:bg-[#0aa8a4]">保存</button>
                  </div>
                </div>
              </div>
            )}

            <div className="flex gap-4">
              <button onClick={handleBackToUpload} className="px-6 py-3 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors">← 返回修改</button>
              <button onClick={handleParseAll} disabled={parsing || analyzedFiles.every(f => !f.rule)}
                className="flex-1 px-6 py-3 bg-[#0fc6c2] text-white rounded-lg font-medium hover:bg-[#0aa8a4] disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                {parsing ? (
                  <div className="flex items-center justify-center gap-2">
                    <Loading size="sm" />
                    <span>解析中{workerSupported ? '(Worker)' : ''}... {Math.round(progress)}%</span>
                  </div>
                ) : '确认并开始解析'}
              </button>
            </div>
          </div>
        )}

        {/* 步骤4：解析结果 */}
        {step === 'result' && (
          <div className="space-y-4">
            {/* 重复检测告警 */}
            {duplicateNos.length > 0 && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <div className="flex items-start gap-2">
                  <span className="text-yellow-500 text-xl">⚠️</span>
                  <div>
                    <p className="font-medium text-yellow-800">检测到 {duplicateNos.length} 个重复运单号</p>
                    <p className="text-sm text-yellow-700 mt-1">
                      批次内重复: {dupStats?.batchDupCount || 0} 个 &nbsp;|&nbsp; 数据库已存在: {dupStats?.dbDupCount || 0} 个
                    </p>
                    <p className="text-xs text-yellow-600 mt-1">
                      重复单号: {duplicateNos.slice(0, 10).join('、')}{duplicateNos.length > 10 ? `...等${duplicateNos.length}个` : ''}
                    </p>
                    <p className="text-xs text-yellow-600 mt-1">重复行已用黄色标记，请确认后再提交。</p>
                  </div>
                </div>
              </div>
            )}

            {/* 操作栏 - 粘性：滚动时关键按钮始终可见 */}
            <div className="bg-white rounded-lg border border-gray-200 p-3 sm:p-4 sticky top-14 sm:top-16 z-30 shadow-sm">
              <div className="flex flex-col gap-3 sm:gap-4">
                {/* 第一行：核心操作按钮（移动端紧凑排列） */}
                <div className="flex flex-wrap items-center gap-2">
                  {/* 主要操作 - 始终显示 */}
                  <button onClick={handleExport} disabled={orders.length === 0}
                    className="px-3 sm:px-4 py-1.5 sm:py-2 bg-[#0fc6c2] text-white rounded-lg text-xs sm:text-sm font-medium hover:bg-[#0aa8a4] disabled:opacity-50 transition-colors shrink-0">
                    📥 导出
                  </button>
                  <button onClick={handleSubmitOrders}
                    disabled={orders.length === 0 || submitting}
                    className="px-3 sm:px-4 py-1.5 sm:py-2 bg-green-500 text-white rounded-lg text-xs sm:text-sm font-medium hover:bg-green-600 disabled:opacity-50 transition-colors shrink-0 min-w-[80px]">
                    {submitting ? `提交中 ${submitProgress}%` : '🚀 提交'}
                  </button>
                  {/* 提交进度条 */}
                  {submitting && submitProgress > 0 && (
                    <div className="w-full sm:w-48 h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div className="h-full bg-green-500 transition-all duration-300"
                        style={{ width: `${submitProgress}%` }} />
                    </div>
                  )}
                  {/* 次要操作 - 小屏隐藏文字只留图标，或折叠 */}
                  <button onClick={handleDeleteSelected} disabled={selectedIndices.length === 0}
                    className="hidden xs:inline-flex px-3 sm:px-4 py-1.5 sm:py-2 bg-red-500 text-white rounded-lg text-xs sm:text-sm font-medium hover:bg-red-600 disabled:opacity-50 transition-colors items-center gap-1 shrink-0">
                    🗑️ <span className="hidden sm:inline">删除</span>({selectedIndices.length})
                  </button>
                  <button onClick={handleSaveToDB} disabled={orders.length === 0 || saving}
                    className="hidden sm:inline-flex px-3 sm:px-4 py-1.5 sm:py-2 bg-purple-500 text-white rounded-lg text-xs sm:text-sm font-medium hover:bg-purple-600 disabled:opacity-50 transition-colors shrink-0">
                    {saving ? '保存中...' : '💾 保存'}
                  </button>
                  <button onClick={handleRestart}
                    className="hidden md:inline-flex px-3 sm:px-4 py-1.5 sm:py-2 bg-gray-100 text-gray-700 rounded-lg text-xs sm:text-sm font-medium hover:bg-gray-200 transition-colors shrink-0">
                    📁 继续导入
                  </button>
                  {/* 移动端更多操作按钮 */}
                  <div className="xs:hidden flex items-center gap-1 ml-auto">
                    <button onClick={() => setShowMoreActions(!showMoreActions)} className="p-1.5 text-gray-500 hover:bg-gray-100 rounded-lg" aria-label="更多操作">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01"/></svg>
                    </button>
                  </div>
                </div>
                {/* 移动端展开的更多操作 */}
                {showMoreActions && (
                  <div className="xs:flex hidden flex-wrap gap-2 pt-2 border-t border-gray-100">
                    {selectedIndices.length > 0 && (
                      <button onClick={handleDeleteSelected}
                        className="px-3 py-1.5 bg-red-500 text-white rounded-lg text-xs font-medium hover:bg-red-600">🗑️ 删除({selectedIndices.length})</button>
                    )}
                    <button onClick={handleSaveToDB} disabled={orders.length === 0 || saving}
                      className="px-3 py-1.5 bg-purple-500 text-white rounded-lg text-xs font-medium hover:bg-purple-600 disabled:opacity-50">{saving ? '...' : '💾 保存'}</button>
                    <button onClick={handleRestart} className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-xs font-medium hover:bg-gray-200">📁 继续导入</button>
                  </div>
                )}
                {/* 第二行：搜索 + 统计信息（全宽自适应） */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-4">
                  <div className="relative flex-1 min-w-0">
                    <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                      placeholder="搜索运单号、收货人、电话..."
                      className="w-full sm:w-64 lg:w-80 pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0fc6c2] focus:border-transparent" />
                    <svg className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>
                  <div className="text-sm text-gray-600">
                    {orders.length > 0 && (
                      <>
                        共 <span className="font-medium text-[#0fc6c2]">{totalCount}</span> 条
                        {debouncedSearchQuery && <span className="ml-1">(筛选 {filteredOrders.length} 条)</span>}
                        {orders.filter(o => !o.isValid).length > 0 && (
                          <button onClick={() => setShowErrorModal(true)} className="ml-2 text-red-500 hover:text-red-700 underline cursor-pointer">({orders.filter(o => !o.isValid).length} 条有误)</button>
                        )}
                        {duplicateNos.length > 0 && (
                          <span className="ml-2 text-yellow-600">({duplicateNos.length} 重复)</span>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* 运单表格 */}
            <OrderTable
              orders={filteredOrders}
              onOrdersChange={(updated: ParsedOrder[]) => {
                // 保持原始数据顺序：filteredOrders 是筛选后的视图
                // 需要回写到 orders 中对应的位置
                setOrders((prev: ParsedOrder[]) => {
                  if (prev === filteredOrders) return updated;
                  // 如果有筛选条件，需要更精确地合并
                  const result = [...prev];
                  updated.forEach((u, i) => {
                    const origIdx = prev.findIndex(o =>
                      o.orderNo === u.orderNo && o.itemCode === u.itemCode && o.itemName === u.itemName
                    );
                    if (origIdx >= 0) result[origIdx] = u;
                  });
                  return result;
                });
              }}
              selectable
              selectedIndices={selectedIndices}
              onSelectionChange={setSelectedIndices}
              onDelete={handleDeleteOrder}
              useVirtualScroll={useVirtualScroll}
              virtualHeight={600}
              duplicateNos={duplicateNos}
            />

            {/* 分页 */}
            {totalCount > 100 && (
              <div className="bg-white rounded-lg border border-gray-200 p-4 flex justify-between items-center">
                <div className="text-sm text-gray-600">显示 {displayedOrders.length} / {totalCount} 条{totalPages > 1 && <span className="ml-2">(第 {currentPage}/{totalPages} 页)</span>}</div>
                <div className="flex gap-2">
                  <button onClick={loadMore} disabled={currentPage >= totalPages || isLoadingMore}
                    className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200 disabled:opacity-50 transition-colors">
                    {isLoadingMore ? '加载中...' : '加载更多'}
                  </button>
                  {totalPages > 1 && (
                    <div className="flex gap-1">
                      {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                        const page = i + 1;
                        return (
                          <button key={page} onClick={() => goToPage(page)}
                            className={`w-8 h-8 rounded text-sm ${currentPage === page ? 'bg-[#0fc6c2] text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
                            {page}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 全量错误弹窗 */}
            {showErrorModal && (() => {
              const allErrors = collectAllErrors();
              return (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowErrorModal(false)}>
                  <div className="bg-white rounded-xl shadow-2xl w-[90vw] max-w-3xl max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
                    {/* 弹窗标题 */}
                    <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
                      <div>
                        <h3 className="text-lg font-semibold text-red-600">数据校验错误</h3>
                        <p className="text-sm text-gray-500 mt-1">共 {orders.filter(o => !o.isValid).length} 条数据存在 {allErrors.length} 个错误，请修正后重新提交</p>
                      </div>
                      <button onClick={() => setShowErrorModal(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
                    </div>

                    {/* 错误表格 */}
                    <div className="flex-1 overflow-auto px-6 py-4">
                      <table className="w-full text-sm border-collapse">
                        <thead className="sticky top-0 bg-gray-50">
                          <tr>
                            <th className="px-4 py-2 text-left font-medium text-gray-600 border-b w-16">#</th>
                            <th className="px-4 py-2 text-left font-medium text-gray-600 border-b w-20">行号</th>
                            <th className="px-4 py-2 text-left font-medium text-gray-600 border-b w-32">字段</th>
                            <th className="px-4 py-2 text-left font-medium text-gray-600 border-b">错误原因</th>
                            <th className="px-4 py-2 text-left font-medium text-gray-600 border-b w-36">外部编码</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {allErrors.length > 0 ? allErrors.map((err, i) => (
                            <tr key={i} className="hover:bg-red-50/50">
                              <td className="px-4 py-2 text-gray-400">{i + 1}</td>
                              <td className="px-4 py-2 font-mono text-xs font-medium text-gray-700">{err.row}</td>
                              <td className="px-4 py-2">
                                <span className="inline-block px-2 py-0.5 bg-red-100 text-red-700 rounded text-xs font-medium">{err.field}</span>
                              </td>
                              <td className="px-4 py-2 text-gray-700">{err.reason}</td>
                              <td className="px-4 py-2 font-mono text-xs text-gray-500">{err.orderNo || '-'}</td>
                            </tr>
                          )) : (
                            <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">暂无详细错误信息（请检查标红行）</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>

                    {/* 底部操作 */}
                    <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200">
                      <button
                        onClick={() => setShowErrorModal(false)}
                        className="px-5 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50 transition-colors"
                      >
                        关闭并手动修正
                      </button>
                      <button
                        onClick={() => {
                          const validOrders = orders.filter(o => o.isValid);
                          if (validOrders.length === 0) { showToast('error', '没有可提交的有效数据'); return; }
                          if (!confirm(`仅提交 ${validOrders.length} 条有效数据（跳过 ${orders.filter(o => !o.isValid).length} 条有误），确定？`)) return;
                          setShowErrorModal(false);
                          submitValidOrdersOnly(validOrders);
                        }}
                        className="px-5 py-2 bg-[#0fc6c2] text-white rounded-lg text-sm hover:bg-[#0dbab6] transition-colors"
                      >
                        跳过错误行，提交有效数据 ({orders.filter(o => o.isValid).length} 条)
                      </button>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* 历史记录 */}
        {step === 'history' && <HistoryView onBack={() => setStep('upload')} />}

        {/* 规则管理库 */}
        {step === 'rules' && <RulesManager onBack={() => setStep('upload')} onSelectRule={(rule) => {
          // 应用规则到第一个未分析的文件
          const firstUnanalyzed = analyzedFiles.findIndex(f => !f.rule);
          if (firstUnanalyzed >= 0) {
            setAnalyzedFiles(prev => prev.map((f, i) => i === firstUnanalyzed ? { ...f, rule } : f));
            showToast('success', `规则"${rule.name}"已应用到文件`);
            setStep('confirm');
          } else {
            showToast('info', '规则已选择，请先上传文件再应用');
            setStep('upload');
          }
        }} />}
      </main>
    </div>
  );
}

// ==================== 规则管理组件 ====================
function RulesManager({ onBack, onSelectRule }: { onBack: () => void; onSelectRule: (rule: ParseRule) => void }) {
  const [rules, setRules] = useState<SavedRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingRule, setEditingRule] = useState<SavedRule | null>(null);
  const [editJson, setEditJson] = useState('');
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [testingRule, setTestingRule] = useState<SavedRule | null>(null);
  const [testFile, setTestFile] = useState<File | null>(null);
  const [testResult, setTestResult] = useState<any>(null);
  const [testing, setTesting] = useState(false);
  const [searchText, setSearchText] = useState('');

  useEffect(() => {
    loadRules();
  }, []);

  const loadRules = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/rules');
      const data = await res.json();
      if (data.success) {
        setRules(data.rules.map((r: any) => ({
          id: r.id, name: r.name, description: r.description,
          fileTypes: r.fileTypes || r.file_types || ['excel'],
          ruleJson: r.ruleJson || r.rule_json,
          isAiGenerated: r.isAiGenerated || r.is_ai_generated,
          usageCount: r.usageCount || r.usage_count || 0,
          createdAt: r.createdAt || r.created_at,
          updatedAt: r.updatedAt || r.updated_at,
        })));
      }
    } catch { showToast('error', '加载规则失败'); }
    finally { setLoading(false); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('确定要删除此规则吗？')) return;
    try {
      await fetch(`/api/rules?id=${id}`, { method: 'DELETE' });
      setRules(prev => prev.filter(r => r.id !== id));
      showToast('success', '规则已删除');
    } catch { showToast('error', '删除失败'); }
  };

  const handleEditOpen = (rule: SavedRule) => {
    setEditingRule(rule);
    setEditName(rule.name);
    setEditDesc(rule.description || '');
    setEditJson(JSON.stringify(rule.ruleJson, null, 2));
  };

  const handleEditSave = async () => {
    if (!editingRule) return;
    try {
      const ruleJson = JSON.parse(editJson);
      const res = await fetch('/api/rules', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingRule.id, name: editName, description: editDesc,
          fileTypes: ruleJson.fileTypes || editingRule.fileTypes, ruleJson,
        }),
      });
      const data = await res.json();
      if (data.success) {
        showToast('success', '规则已更新');
        setEditingRule(null);
        loadRules();
      } else { showToast('error', data.error || '更新失败'); }
    } catch { showToast('error', 'JSON格式错误，请检查'); }
  };

  // 规则测试
  const handleTestRule = async () => {
    if (!testingRule || !testFile) { showToast('warning', '请选择文件'); return; }
    setTesting(true);
    setTestResult(null);
    try {
      const formData = new FormData();
      formData.append('file', testFile);
      formData.append('rule', JSON.stringify(testingRule.ruleJson));
      const res = await fetch('/api/parse', { method: 'POST', body: formData });
      const data = await res.json();
      setTestResult(data);
      if (data.success) showToast('success', `测试完成，解析出 ${data.totalRows} 条数据`);
      else showToast('error', `测试失败: ${data.error}`);
    } catch (e: any) { showToast('error', e.message); }
    finally { setTesting(false); }
  };

  const filtered = rules.filter(r =>
    !searchText || r.name.includes(searchText) || (r.description || '').includes(searchText)
  );

  return (
    <div className="space-y-4">
      {/* 标题栏 - 响应式 */}
      <div className="bg-white rounded-lg border border-gray-200 p-3 sm:p-4 flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto">
          <button onClick={onBack} className="text-sm text-[#0fc6c2] hover:text-[#0aa8a4] shrink-0">← 返回</button>
          <h3 className="text-base sm:text-lg font-medium text-gray-900 truncate">⚙️ 规则库</h3>
          <span className="text-xs sm:text-sm text-gray-500">({rules.length})</span>
        </div>
        <input type="text" value={searchText} onChange={e => setSearchText(e.target.value)}
          placeholder="搜索规则..." className="w-full sm:w-56 px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0fc6c2]" />
      </div>

      {loading ? (
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center"><Loading size="md" /><p className="mt-4 text-gray-500">加载规则库...</p></div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center text-gray-500">
          <p className="text-4xl mb-3">📭</p>
          <p>暂无保存的规则</p>
          <p className="text-sm mt-1">在"确认规则"步骤中点击"保存到规则库"来保存AI生成的规则</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map(rule => (
            <div key={rule.id} className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900">{rule.name}</span>
                    {rule.isAiGenerated && <span className="text-xs bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded">AI生成</span>}
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">{rule.description || '无描述'}</p>
                </div>
                <div className="flex gap-1 ml-2">
                  <button onClick={() => handleEditOpen(rule)} className="text-xs text-blue-500 hover:text-blue-700 px-2 py-1 rounded hover:bg-blue-50">编辑</button>
                  <button onClick={() => { setTestingRule(rule); setTestFile(null); setTestResult(null); }} className="text-xs text-green-500 hover:text-green-700 px-2 py-1 rounded hover:bg-green-50">测试</button>
                  <button onClick={() => onSelectRule(rule.ruleJson)} className="text-xs text-[#0fc6c2] hover:text-[#0aa8a4] px-2 py-1 rounded hover:bg-[#0fc6c2]/10">应用</button>
                  <button onClick={() => handleDelete(rule.id)} className="text-xs text-red-400 hover:text-red-600 px-2 py-1 rounded hover:bg-red-50">删除</button>
                </div>
              </div>
              <div className="flex items-center gap-3 text-xs text-gray-400 mt-2">
                <span className="bg-gray-100 px-2 py-0.5 rounded">{Array.isArray(rule.ruleJson?.parser?.type) ? rule.ruleJson.parser.type : (rule.ruleJson?.parser?.type || '未知')}</span>
                <span>{(rule.fileTypes || []).join('/')}</span>
                <span>使用 {rule.usageCount} 次</span>
                <span>{new Date(rule.updatedAt).toLocaleDateString('zh-CN')}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 规则编辑弹窗 - 响应式 */}
      {editingRule && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-4 sm:p-6 w-full max-w-2xl max-h-[90vh] overflow-auto">
            <h3 className="text-lg font-medium mb-4">编辑规则</h3>
            <div className="space-y-3 mb-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">规则名称</label>
                <input type="text" value={editName} onChange={e => setEditName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0fc6c2]" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">描述</label>
                <input type="text" value={editDesc} onChange={e => setEditDesc(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0fc6c2]" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">规则JSON</label>
                <textarea value={editJson} onChange={e => setEditJson(e.target.value)}
                  className="w-full h-72 font-mono text-sm border border-gray-300 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-[#0fc6c2]" />
              </div>
            </div>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setEditingRule(null)} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">取消</button>
              <button onClick={handleEditSave} className="px-4 py-2 bg-[#0fc6c2] text-white rounded-lg hover:bg-[#0aa8a4]">保存</button>
            </div>
          </div>
        </div>
      )}

      {/* 规则测试弹窗 */}
      {testingRule && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-4 sm:p-6 w-full max-w-2xl max-h-[90vh] overflow-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium">🧪 规则测试 - {testingRule.name}</h3>
              <button onClick={() => setTestingRule(null)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">选择测试文件</label>
              <input type="file" accept=".xlsx,.xls,.csv,.pdf,.docx,.doc"
                onChange={e => { setTestFile(e.target.files?.[0] || null); setTestResult(null); }}
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-[#0fc6c2]/10 file:text-[#0fc6c2] hover:file:bg-[#0fc6c2]/20" />
              {testFile && <p className="text-xs text-gray-500 mt-1">已选择: {testFile.name} ({(testFile.size / 1024).toFixed(1)} KB)</p>}
            </div>
            <button onClick={handleTestRule} disabled={!testFile || testing}
              className="w-full py-2 bg-[#0fc6c2] text-white rounded-lg hover:bg-[#0aa8a4] disabled:opacity-50 mb-4">
              {testing ? <span className="flex items-center justify-center gap-2"><Loading size="sm" /> 测试中...</span> : '🚀 开始测试'}
            </button>

            {testResult && (
              <div className={`rounded-lg p-4 ${testResult.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                {testResult.success ? (
                  <>
                    <p className="font-medium text-green-800 mb-2">✅ 测试成功，解析 {testResult.totalRows} 条数据</p>
                    <div className="overflow-x-auto max-h-48">
                      <table className="w-full text-xs">
                        <thead className="bg-green-100">
                          <tr>
                            <th className="px-2 py-1 text-left">运单号</th>
                            <th className="px-2 py-1 text-left">收货人</th>
                            <th className="px-2 py-1 text-left">电话</th>
                            <th className="px-2 py-1 text-left">商品</th>
                            <th className="px-2 py-1 text-left">数量</th>
                          </tr>
                        </thead>
                        <tbody>
                          {testResult.orders?.slice(0, 5).map((o: any, i: number) => (
                            <tr key={i} className="border-t border-green-100">
                              <td className="px-2 py-1">{o.orderNo || '-'}</td>
                              <td className="px-2 py-1">{o.receiverName || '-'}</td>
                              <td className="px-2 py-1">{o.receiverPhone || '-'}</td>
                              <td className="px-2 py-1">{o.itemName || '-'}</td>
                              <td className="px-2 py-1">{o.quantity ?? '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {testResult.totalRows > 5 && <p className="text-xs text-green-600 mt-1 text-center">仅显示前5条，共 {testResult.totalRows} 条</p>}
                    </div>
                  </>
                ) : (
                  <p className="text-red-700">❌ 测试失败: {testResult.error}</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ==================== 历史记录组件 ====================
function HistoryView({ onBack }: { onBack: () => void }) {
  const [batches, setBatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBatch, setSelectedBatch] = useState<number | null>(null);
  const [batchOrders, setBatchOrders] = useState<any[]>([]);
  const [orderPage, setOrderPage] = useState(1);
  const [orderPageSize, setOrderPageSize] = useState(20);

  // 筛选搜索状态
  const [searchText, setSearchText] = useState('');
  const [filterField, setFilterField] = useState<'all' | 'orderNo' | 'receiver'>('all');

  useEffect(() => {
    fetch('/api/import-orders?action=batches')
      .then(res => res.json())
      .then(data => { if (data.success) setBatches(data.batches); })
      .finally(() => setLoading(false));
  }, []);

  const loadBatchOrders = async (batchId: number) => {
    setSelectedBatch(batchId);
    const res = await fetch(`/api/import-orders?batchId=${batchId}&pageSize=100`);
    const data = await res.json();
    if (data.success) setBatchOrders(data.orders || []);
  };

  // 批次筛选
  const filteredBatches = batches.filter((batch: any) => {
    if (!searchText.trim()) return true;
    const q = searchText.toLowerCase();
    return (batch.file_name || '').toLowerCase().includes(q) ||
           (batch.rule_name || '').toLowerCase().includes(q) ||
           String(batch.total_rows).includes(q);
  });

  // 运单详情筛选
  const filteredOrders = batchOrders.filter((order: any) => {
    if (!searchText.trim() || !selectedBatch) return true;
    const q = searchText.toLowerCase();
    switch (filterField) {
      case 'orderNo':
        return (order.order_no || '').toLowerCase().includes(q);
      case 'receiver':
        return (order.receiver_name || '').toLowerCase().includes(q) ||
               (order.store_name || '').toLowerCase().includes(q);
      default:
        return (order.order_no || '').toLowerCase().includes(q) ||
               (order.receiver_name || '').toLowerCase().includes(q) ||
               (order.item_name || '').toLowerCase().includes(q);
    }
  });

  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
        <Loading size="md" /><p className="mt-4 text-gray-500">加载历史记录...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium text-gray-900">📋 历史导入记录</h3>
          <div className="flex gap-2">
            {/* 搜索框 */}
            <input
              type="text"
              placeholder="搜索（编码/收件人/文件名）..."
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0fc6c2] w-48 sm:w-64"
            />
            <select
              value={filterField}
              onChange={e => setFilterField(e.target.value as any)}
              className="px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#0fc6c2]"
            >
              <option value="all">全部字段</option>
              <option value="orderNo">外部编码</option>
              <option value="receiver">收件人/门店</option>
            </select>
            <button onClick={onBack} className="text-sm text-[#0fc6c2] hover:text-[#0aa8a4] whitespace-nowrap">← 返回</button>
          </div>
        </div>
        {batches.length === 0 ? (
          <p className="text-gray-500 text-center py-8">暂无导入记录</p>
        ) : (
          <div className="space-y-3">
            {filteredBatches.map((batch: any) => (
              <div key={batch.id}
                className={`border rounded-lg p-4 cursor-pointer transition-all ${selectedBatch === batch.id ? 'border-[#0fc6c2] bg-[#0fc6c2]/5' : 'border-gray-200 hover:border-gray-300'}`}
                onClick={() => loadBatchOrders(batch.id)}>
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-medium text-gray-900">{batch.file_name}</span>
                    <span className="ml-2 text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{batch.file_type}</span>
                  </div>
                  <span className="text-xs text-gray-500">{new Date(batch.created_at).toLocaleString('zh-CN')}</span>
                </div>
                <div className="mt-2 flex gap-4 text-sm text-gray-600">
                  <span>共 {batch.total_rows} 条</span>
                  <span className="text-green-600">✓ {batch.success_rows} 条</span>
                  {batch.error_rows > 0 && <span className="text-red-600">✗ {batch.error_rows} 条</span>}
                </div>
                {batch.rule_name && <div className="mt-1 text-xs text-gray-500">规则: {batch.rule_name}</div>}
              </div>
            ))}
          </div>
        )}
      </div>
      {selectedBatch && batchOrders.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <h4 className="font-medium text-gray-900 mb-3">
            批次 #{selectedBatch} 运单详情
            {searchText && <span className="text-sm text-gray-500 ml-2">(筛选: {filteredOrders.length}/{batchOrders.length})</span>}
          </h4>
          {/* 分页控件 */}
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm text-gray-500">
              共 {filteredOrders.length} 条{filteredOrders.length !== batchOrders.length && ` (已筛选)`}
            </div>
            <div className="flex items-center gap-2">
              <select
                value={orderPageSize}
                onChange={e => { setOrderPageSize(Number(e.target.value)); setOrderPage(1); }}
                className="px-2 py-1 text-sm border border-gray-300 rounded"
              >
                <option value={10}>10条/页</option>
                <option value={20}>20条/页</option>
                <option value={50}>50条/页</option>
                <option value={100}>100条/页</option>
              </select>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">外部编码</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">收货门店</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">收件人</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">电话</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">SKU编码</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">SKU名称</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">数量</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredOrders
                  .slice((orderPage - 1) * orderPageSize, orderPage * orderPageSize)
                  .map((order: any) => (
                  <tr key={order.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 font-mono text-xs">{order.order_no || '-'}</td>
                    <td className="px-3 py-2">{order.store_name || '-'}</td>
                    <td className="px-3 py-2">{order.receiver_name || '-'}</td>
                    <td className="px-3 py-2">{order.receiver_phone || '-'}</td>
                    <td className="px-3 py-2 font-mono text-xs">{order.item_code || '-'}</td>
                    <td className="px-3 py-2">{order.item_name || '-'}</td>
                    <td className="px-3 py-2">{order.quantity ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* 分页导航 */}
          {Math.ceil(filteredOrders.length / orderPageSize) > 1 && (
            <div className="flex items-center justify-center gap-2 mt-4">
              <button
                onClick={() => setOrderPage(p => Math.max(1, p - 1))}
                disabled={orderPage === 1}
                className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
              >
                ← 上一页
              </button>
              <span className="text-sm text-gray-600">
                第 {orderPage} / {Math.ceil(filteredOrders.length / orderPageSize)} 页
              </span>
              <button
                onClick={() => setOrderPage(p => Math.min(Math.ceil(filteredOrders.length / orderPageSize), p + 1))}
                disabled={orderPage >= Math.ceil(filteredOrders.length / orderPageSize)}
                className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
              >
                下一页 →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
