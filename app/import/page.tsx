'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import FileUploader from '../components/Upload/FileUploader';
import OrderTable from '../components/Orders/OrderTable';
import Loading from '../components/Common/Loading';
import ProgressBar from '../components/Common/ProgressBar';
import Toast, { showToast } from '../components/Common/Toast';
import { useDebounce } from '../hooks/useDebounce';
import { useLargeData } from '../hooks/useLargeData';
import type { ParsedOrder, ParseRule } from '@/types/rule';

type StepType = 'upload' | 'analyze' | 'confirm' | 'result' | 'history';

interface AnalyzedFile {
  file: File;
  rule: ParseRule | null;
  sample: string;
  fileInfo: { name: string; type: string; sheets: string[] };
  analyzing: boolean;
  error?: string;
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
  const [analyzedFiles, setAnalyzedFiles] = useState<AnalyzedFile[]>([]);
  const [parsing, setParsing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [selectedIndices, setSelectedIndices] = useState<number[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingRuleIndex, setEditingRuleIndex] = useState<number | null>(null);
  const [editingRuleJson, setEditingRuleJson] = useState('');
  const [apiKey, setApiKey] = useState('sk-IoFm2IHaR3vBGy2pxgQWPDOSeOqJNFsDKIEM0X5dmuzT5zMq');
  const [apiUrl, setApiUrl] = useState('https://www.vbcode.io/v1/chat/completions');
  const [modelName, setModelName] = useState('gpt-5.4');

  // 从localStorage加载配置（如果有的话，否则使用默认值）
  useEffect(() => {
    const savedKey = localStorage.getItem('ai_api_key');
    const savedUrl = localStorage.getItem('ai_api_url');
    const savedModel = localStorage.getItem('ai_model_name');
    // 只有当localStorage有值且不为空且是完整URL时才覆盖默认值
    if (savedKey && savedKey !== 'undefined' && savedKey !== 'null' && savedKey.length > 10) {
      setApiKey(savedKey);
    }
    // URL必须包含/chat/completions才是完整地址
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
    setApiKey('sk-IoFm2IHaR3vBGy2pxgQWPDOSeOqJNFsDKIEM0X5dmuzT5zMq');
    setApiUrl('https://www.vbcode.io/v1/chat/completions');
    setModelName('gpt-5.4');
    localStorage.removeItem('ai_api_key');
    localStorage.removeItem('ai_api_url');
    localStorage.removeItem('ai_model_name');
    showToast('success', '已重置为默认配置');
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

  // 前端直接调用AI API（避免Cloudflare拦截）
  const callAIFromClient = async (sample: string, fileType: string, fileName: string): Promise<ParseRule> => {
    if (!apiKey) {
      throw new Error('请先配置AI API Key');
    }

    // 确保API URL是完整的
    let fullApiUrl = apiUrl;
    if (!apiUrl.includes('/chat/completions')) {
      fullApiUrl = apiUrl.replace(/\/+$/, '') + '/chat/completions';
    }

    const userMessage = `请根据以下文件样本生成解析规则。

## 文件信息
- 文件名：${fileName}
- 文件类型：${fileType}

## 文件内容样本（前20行）
\`\`\`
${sample}
\`\`\`

请分析文件结构，生成对应的解析规则JSON。`;

    console.log('调用AI API:', fullApiUrl, '模型:', modelName);
    console.log('系统提示词长度:', AI_SYSTEM_PROMPT.length, '用户消息长度:', userMessage.length);
    
    // 构建请求体 - 使用标准OpenAI格式
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
    console.log('请求体大小:', JSON.stringify(requestBody).length, '字符');
    
    // 使用AbortController实现超时
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000); // 60秒超时
    
    let response: Response;
    try {
      response = await fetch(fullApiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
    } catch (fetchError: any) {
      clearTimeout(timeoutId);
      if (fetchError.name === 'AbortError') {
        throw new Error('API请求超时（60秒），请检查网络连接或稍后重试');
      }
      throw new Error(`网络请求失败: ${fetchError.message}`);
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API调用失败 (${response.status}): ${errorText.substring(0, 200)}`);
    }

    // 获取响应文本
    const responseText = await response.text();
    console.log('API响应前1000字符:', responseText.substring(0, 1000));
    let content = '';

    // 先尝试直接解析为JSON（如果API返回标准JSON格式）
    try {
      const data = JSON.parse(responseText);
      console.log('解析后的JSON:', JSON.stringify(data).substring(0, 500));
      
      // 检查是否有错误
      if (data.error) {
        throw new Error(`API错误: ${data.error.message || JSON.stringify(data.error)}`);
      }
      
      // 检查choices是否为空
      if (!data.choices || data.choices.length === 0) {
        console.error('API返回空choices，完整响应:', data);
        throw new Error(`API返回空结果。模型: ${data.model || 'unknown'}, 使用tokens: ${data.usage?.total_tokens || 0}。请检查模型名称是否正确。`);
      }
      
      content = data.choices[0]?.message?.content || '';
    } catch (jsonError: any) {
      // 如果是API错误，直接抛出
      if (jsonError.message?.startsWith('API错误:') || jsonError.message?.startsWith('API返回空结果')) {
        throw jsonError;
      }
      
      // 如果不是JSON，尝试SSE格式
      if (responseText.includes('data: ')) {
        const lines = responseText.split('\n');
        let fullContent = '';
        let lastChunk: any = null;
        
        for (const line of lines) {
          const trimmedLine = line.trim();
          if (trimmedLine.startsWith('data: ') && !trimmedLine.includes('[DONE]')) {
            try {
              const chunk = JSON.parse(trimmedLine.slice(6));
              lastChunk = chunk;
              
              // 检查是否有错误
              if (chunk.error) {
                throw new Error(`API错误: ${chunk.error.message || JSON.stringify(chunk.error)}`);
              }
              
              // 支持delta格式和message格式
              const delta = chunk.choices?.[0]?.delta?.content || chunk.choices?.[0]?.message?.content;
              if (delta) {
                fullContent += delta;
              }
            } catch (e: any) {
              if (e.message?.startsWith('API错误:')) {
                throw e;
              }
              console.warn('SSE行解析失败:', trimmedLine);
            }
          }
        }
        
        // 如果没有内容，检查最后一个chunk
        if (!fullContent && lastChunk) {
          console.error('SSE响应无内容，最后一个chunk:', lastChunk);
          if (!lastChunk.choices || lastChunk.choices.length === 0) {
            throw new Error(`API返回空结果。模型: ${lastChunk.model || 'unknown'}, 使用tokens: ${lastChunk.usage?.total_tokens || 0}。请检查模型名称是否正确。`);
          }
        }
        
        content = fullContent;
      } else {
        throw new Error('无法解析API响应: ' + responseText.substring(0, 200));
      }
    }

    if (!content) {
      throw new Error('AI返回空内容，请检查模型名称是否正确（当前: ' + modelName + '）');
    }

    // 提取JSON
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('无法从AI响应中提取JSON');
    }

    return JSON.parse(jsonMatch[0]) as ParseRule;
  };

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

  // 步骤2：AI分析单个文件（前端调用）
  const handleAnalyzeFile = async (index: number) => {
    const item = analyzedFiles[index];
    if (!item) return;

    setAnalyzedFiles(prev => prev.map((f, i) => i === index ? { ...f, analyzing: true, error: undefined } : f));

    try {
      // 1. 先从服务端提取文件样本
      const formData = new FormData();
      formData.append('file', item.file);

      const extractResponse = await fetch('/api/extract-sample', { method: 'POST', body: formData });
      const extractData = await extractResponse.json();

      if (!extractData.success) {
        throw new Error(extractData.error || '提取样本失败');
      }

      // 2. 前端直接调用AI API生成规则
      const rule = await callAIFromClient(extractData.sample, extractData.fileInfo.type, extractData.fileInfo.name);

      setAnalyzedFiles(prev => prev.map((f, i) => i === index ? {
        ...f,
        rule,
        sample: extractData.sample,
        fileInfo: extractData.fileInfo,
        analyzing: false,
      } : f));
      showToast('success', `${item.file.name} AI分析完成`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : '分析失败';
      setAnalyzedFiles(prev => prev.map((f, i) => i === index ? {
        ...f,
        analyzing: false,
        error: errorMsg,
      } : f));
      showToast('error', `${item.file.name} 分析失败: ${errorMsg}`);
    }
  };

  // 批量AI分析所有文件
  const handleAnalyzeAll = async () => {
    if (!apiKey) {
      showToast('error', '请先配置AI API Key');
      return;
    }
    setStep('analyze');
    for (let i = 0; i < analyzedFiles.length; i++) {
      if (!analyzedFiles[i].rule) {
        await handleAnalyzeFile(i);
      }
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

  // 步骤3：用确认后的规则解析所有文件
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

    try {
      const allOrders: ParsedOrder[] = [];
      const total = filesWithRules.length;

      for (let i = 0; i < total; i++) {
        const item = filesWithRules[i];
        setProgress(((i + 0.5) / total) * 100);

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

        setProgress(((i + 1) / total) * 100);
      }

      setOrders(allOrders);
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
    if (orders.length === 0) {
      showToast('warning', '没有可导出的数据');
      return;
    }

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
        a.href = url;
        a.download = `运单数据_${Date.now()}.xlsx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast('success', '导出成功');
      } else {
        showToast('error', '导出失败');
      }
    } catch {
      showToast('error', '导出失败');
    }
  };

  // 删除选中
  const handleDeleteSelected = () => {
    if (selectedIndices.length === 0) {
      showToast('warning', '请先选择要删除的记录');
      return;
    }
    setOrders((prev: ParsedOrder[]) => prev.filter((_, i) => !selectedIndices.includes(i)));
    setSelectedIndices([]);
    showToast('success', `已删除 ${selectedIndices.length} 条记录`);
  };

  // 编辑订单
  const handleEditOrder = (index: number, order: ParsedOrder) => {
    const newValue = prompt('请输入新的收货人姓名', order.receiverName || '');
    if (newValue !== null) {
      setOrders((prev: ParsedOrder[]) => {
        const newOrders = [...prev];
        newOrders[index] = { ...newOrders[index], receiverName: newValue };
        return newOrders;
      });
    }
  };

  // 删除单个订单
  const handleDeleteOrder = (index: number) => {
    setOrders((prev: ParsedOrder[]) => prev.filter((_, i) => i !== index));
    showToast('success', '已删除');
  };

  // 批量提交
  const handleSubmitOrders = async () => {
    if (orders.length === 0) {
      showToast('warning', '没有可提交的数据');
      return;
    }
    const submitData = selectedIndices.length > 0
      ? orders.filter((_, i) => selectedIndices.includes(i))
      : filteredOrders;
    showToast('info', `准备提交 ${submitData.length} 条运单...`);
    showToast('success', `成功提交 ${submitData.length} 条运单`);
  };

  // 保存到数据库
  const [saving, setSaving] = useState(false);
  const handleSaveToDB = async () => {
    if (orders.length === 0) {
      showToast('warning', '没有可保存的数据');
      return;
    }
    setSaving(true);
    try {
      const saveData = selectedIndices.length > 0
        ? orders.filter((_, i) => selectedIndices.includes(i))
        : orders;

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
      if (data.success) {
        showToast('success', `已保存 ${saveData.length} 条运单到数据库`);
      } else {
        showToast('error', data.error || '保存失败');
      }
    } catch {
      showToast('error', '保存失败');
    } finally {
      setSaving(false);
    }
  };

  // 返回上传步骤
  const handleBackToUpload = () => {
    setStep('upload');
  };

  // 重新开始
  const handleRestart = () => {
    setStep('upload');
    setAnalyzedFiles([]);
    setOrders([]);
    setSelectedIndices([]);
    setSearchQuery('');
  };

  return (
    <div className="min-h-screen bg-gray-50 overflow-auto">
      <Toast />

      {/* 顶部导航 */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-[#0fc6c2] rounded-lg flex items-center justify-center">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">万能导入 V2</h1>
                <p className="text-xs text-gray-500">智能多格式批量下单系统</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              {orders.length > 0 && (
                <span className="text-sm text-gray-600">
                  已解析 <span className="font-medium text-[#0fc6c2]">{orders.length}</span> 条运单
                  {useVirtualScroll && (
                    <span className="ml-2 text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded">虚拟滚动</span>
                  )}
                </span>
              )}
              <button
                onClick={() => setStep('history')}
                className="text-sm text-[#0fc6c2] hover:text-[#0aa8a4]"
              >
                📋 历史记录
              </button>
              {step !== 'upload' && step !== 'history' && (
                <button onClick={handleRestart} className="text-sm text-gray-500 hover:text-gray-700">
                  重新开始
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* 步骤指示器 */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
        <div className="flex items-center justify-center gap-2 mb-6">
          {[
            { key: 'upload', label: '上传文件', icon: '📁' },
            { key: 'analyze', label: 'AI分析', icon: '🤖' },
            { key: 'confirm', label: '确认规则', icon: '✅' },
            { key: 'result', label: '解析结果', icon: '📊' },
          ].map((s, i) => (
            <div key={s.key} className="flex items-center">
              <div className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-sm ${
                step === s.key
                  ? 'bg-[#0fc6c2] text-white'
                  : (['upload', 'analyze', 'confirm', 'result'].indexOf(step) > i
                    ? 'bg-green-100 text-green-700'
                    : 'bg-gray-100 text-gray-500')
              }`}>
                <span>{s.icon}</span>
                <span>{s.label}</span>
              </div>
              {i < 3 && <div className="w-8 h-px bg-gray-300 mx-1" />}
            </div>
          ))}
        </div>
      </div>

      {/* 主内容区 */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-8">

        {/* AI配置区域 */}
        {step === 'upload' && (
          <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
            <h3 className="text-sm font-medium text-gray-700 mb-3">🤖 AI配置</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">API地址</label>
                <input
                  type="text"
                  value={apiUrl}
                  onChange={e => setApiUrl(e.target.value)}
                  placeholder="https://api.openai.com/v1/chat/completions"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0fc6c2]"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">模型名称</label>
                <select
                  value={modelName}
                  onChange={e => {
                    if (e.target.value === 'custom') {
                      setModelName('');
                    } else {
                      setModelName(e.target.value);
                    }
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0fc6c2] mb-2"
                >
                  <option value="gpt-5.4">gpt-5.4 (当前)</option>
                  <option value="gpt-4o">gpt-4o</option>
                  <option value="gpt-4o-mini">gpt-4o-mini</option>
                  <option value="gpt-4-turbo">gpt-4-turbo</option>
                  <option value="gpt-4">gpt-4</option>
                  <option value="gpt-3.5-turbo">gpt-3.5-turbo</option>
                  <option value="claude-3-5-sonnet-20241022">claude-3.5-sonnet</option>
                  <option value="claude-3-haiku-20240307">claude-3-haiku</option>
                  <option value="deepseek-chat">deepseek-chat</option>
                  <option value="custom">自定义...</option>
                </select>
                {(modelName === '' || !['gpt-5.4', 'gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-4', 'gpt-3.5-turbo', 'claude-3-5-sonnet-20241022', 'claude-3-haiku-20240307', 'deepseek-chat'].includes(modelName)) && (
                  <input
                    type="text"
                    value={modelName}
                    onChange={e => setModelName(e.target.value)}
                    placeholder="输入自定义模型名称"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0fc6c2]"
                  />
                )}
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">API Key</label>
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={apiKey}
                    onChange={e => setApiKey(e.target.value)}
                    placeholder="sk-..."
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0fc6c2]"
                  />
                  <button
                    onClick={saveConfig}
                    className="px-4 py-2 bg-[#0fc6c2] text-white rounded-lg text-sm hover:bg-[#0aa8a4]"
                  >
                    保存
                  </button>
                  <button
                    onClick={resetConfig}
                    className="px-4 py-2 bg-gray-100 text-gray-600 rounded-lg text-sm hover:bg-gray-200"
                  >
                    重置
                  </button>
                </div>
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-2">配置会保存在浏览器本地，下次无需重复输入</p>
          </div>
        )}

        {/* 步骤1：上传文件 */}
        {step === 'upload' && (
          <div className="space-y-6">
            <FileUploader onFilesSelected={handleFilesSelected} />

            {/* 核心理念说明 */}
            <div className="bg-blue-50 rounded-lg p-4">
              <h4 className="font-medium text-blue-900 mb-2">💡 核心设计理念</h4>
              <p className="text-sm text-blue-800">
                不是写 N 个 if-else 适配 N 种文件，而是设计一套<strong>通用规则描述语言</strong>。
                每种新格式只需"AI分析生成一条规则"即可适配。新增第 5、第 10 种格式时，<strong>系统代码零改动</strong>。
              </p>
            </div>

            <button
              onClick={handleAnalyzeAll}
              disabled={analyzedFiles.length === 0 || !apiKey}
              className="w-full px-6 py-3 bg-[#0fc6c2] text-white rounded-lg font-medium hover:bg-[#0aa8a4] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              🤖 开始AI分析 ({analyzedFiles.length} 个文件)
            </button>
            {!apiKey && (
              <p className="text-sm text-red-500 text-center">请先配置AI API Key</p>
            )}
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
                    {item.analyzing ? (
                      <Loading size="sm" />
                    ) : item.rule ? (
                      <span className="text-green-500">✅</span>
                    ) : item.error ? (
                      <span className="text-red-500">❌</span>
                    ) : (
                      <span className="text-gray-400">⏳</span>
                    )}
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
              <p className="text-sm text-gray-600 mb-4">
                AI已分析每个文件的结构并生成解析规则。请检查规则是否正确，可点击"编辑规则"手动调整。
              </p>

              <div className="space-y-4">
                {analyzedFiles.map((item, index) => (
                  <div key={index} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900">{item.file.name}</span>
                        {item.rule && (
                          <span className="text-xs bg-[#0fc6c2]/10 text-[#0fc6c2] px-2 py-0.5 rounded">
                            {item.rule.parser.type}
                          </span>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleAnalyzeFile(index)}
                          disabled={item.analyzing}
                          className="text-xs text-[#0fc6c2] hover:text-[#0aa8a4]"
                        >
                          重新分析
                        </button>
                        {item.rule && (
                          <button
                            onClick={() => handleEditRule(index)}
                            className="text-xs text-blue-500 hover:text-blue-700"
                          >
                            编辑规则
                          </button>
                        )}
                      </div>
                    </div>

                    {item.rule ? (
                      <div className="bg-gray-50 rounded p-3">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-sm font-medium">{item.rule.name}</span>
                        </div>
                        {item.rule.description && (
                          <p className="text-xs text-gray-600 mb-2">{item.rule.description}</p>
                        )}
                        <div className="text-xs text-gray-500">
                          解析模式: {item.rule.parser.type} |
                          字段数: {item.rule.parser.table?.columns?.length || item.rule.parser.matrix?.storeColumns?.length || '-'}
                        </div>
                      </div>
                    ) : (
                      <div className="bg-red-50 rounded p-3 text-sm text-red-700">
                        {item.error || '未能生成规则'}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* 规则编辑弹窗 */}
            {editingRuleIndex !== null && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[80vh] overflow-auto">
                  <h3 className="text-lg font-medium mb-4">编辑解析规则</h3>
                  <textarea
                    value={editingRuleJson}
                    onChange={e => setEditingRuleJson(e.target.value)}
                    className="w-full h-96 font-mono text-sm border border-gray-300 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-[#0fc6c2]"
                  />
                  <div className="flex gap-3 mt-4 justify-end">
                    <button
                      onClick={() => setEditingRuleIndex(null)}
                      className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                    >
                      取消
                    </button>
                    <button
                      onClick={handleSaveRule}
                      className="px-4 py-2 text-white bg-[#0fc6c2] rounded-lg hover:bg-[#0aa8a4]"
                    >
                      保存
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="flex gap-4">
              <button
                onClick={handleBackToUpload}
                className="px-6 py-3 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors"
              >
                ← 返回修改
              </button>
              <button
                onClick={handleParseAll}
                disabled={parsing || analyzedFiles.every(f => !f.rule)}
                className="flex-1 px-6 py-3 bg-[#0fc6c2] text-white rounded-lg font-medium hover:bg-[#0aa8a4] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {parsing ? (
                  <div className="flex items-center justify-center gap-2">
                    <Loading size="sm" />
                    <span>解析中... {Math.round(progress)}%</span>
                  </div>
                ) : (
                  '确认并开始解析'
                )}
              </button>
            </div>
          </div>
        )}

        {/* 步骤4：解析结果 */}
        {step === 'result' && (
          <div className="space-y-4">
            {/* 操作栏 */}
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={handleExport}
                    disabled={orders.length === 0}
                    className="px-4 py-2 bg-[#0fc6c2] text-white rounded-lg text-sm font-medium hover:bg-[#0aa8a4] disabled:opacity-50 transition-colors"
                  >
                    📥 导出Excel
                  </button>
                  <button
                    onClick={handleDeleteSelected}
                    disabled={selectedIndices.length === 0}
                    className="px-4 py-2 bg-red-500 text-white rounded-lg text-sm font-medium hover:bg-red-600 disabled:opacity-50 transition-colors"
                  >
                    🗑️ 删除选中 ({selectedIndices.length})
                  </button>
                  <button
                    onClick={handleSubmitOrders}
                    disabled={orders.length === 0}
                    className="px-4 py-2 bg-green-500 text-white rounded-lg text-sm font-medium hover:bg-green-600 disabled:opacity-50 transition-colors"
                  >
                    🚀 批量提交下单
                  </button>
                  <button
                    onClick={handleSaveToDB}
                    disabled={orders.length === 0 || saving}
                    className="px-4 py-2 bg-purple-500 text-white rounded-lg text-sm font-medium hover:bg-purple-600 disabled:opacity-50 transition-colors"
                  >
                    {saving ? '保存中...' : '💾 保存到数据库'}
                  </button>
                  <button
                    onClick={handleRestart}
                    className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors"
                  >
                    📁 继续导入
                  </button>
                </div>

                <div className="flex items-center gap-4">
                  <div className="relative">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      placeholder="搜索运单号、收货人、电话..."
                      className="w-64 pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0fc6c2] focus:border-transparent"
                    />
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
                          <span className="ml-2 text-red-500">({orders.filter(o => !o.isValid).length} 条有误)</span>
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
              selectable
              selectedIndices={selectedIndices}
              onSelectionChange={setSelectedIndices}
              onEdit={handleEditOrder}
              onDelete={handleDeleteOrder}
              useVirtualScroll={useVirtualScroll}
              virtualHeight={600}
            />

            {/* 分页 */}
            {totalCount > 100 && (
              <div className="bg-white rounded-lg border border-gray-200 p-4 flex justify-between items-center">
                <div className="text-sm text-gray-600">
                  显示 {displayedOrders.length} / {totalCount} 条
                  {totalPages > 1 && <span className="ml-2">(第 {currentPage}/{totalPages} 页)</span>}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={loadMore}
                    disabled={currentPage >= totalPages || isLoadingMore}
                    className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200 disabled:opacity-50 transition-colors"
                  >
                    {isLoadingMore ? '加载中...' : '加载更多'}
                  </button>
                  {totalPages > 1 && (
                    <div className="flex gap-1">
                      {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                        const page = i + 1;
                        return (
                          <button
                            key={page}
                            onClick={() => goToPage(page)}
                            className={`w-8 h-8 rounded text-sm ${
                              currentPage === page
                                ? 'bg-[#0fc6c2] text-white'
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            }`}
                          >
                            {page}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* 历史记录 */}
        {step === 'history' && <HistoryView onBack={() => setStep('upload')} />}
      </main>
    </div>
  );
}

// 历史记录组件
function HistoryView({ onBack }: { onBack: () => void }) {
  const [batches, setBatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBatch, setSelectedBatch] = useState<number | null>(null);
  const [batchOrders, setBatchOrders] = useState<any[]>([]);

  // 加载批次列表
  useState(() => {
    fetch('/api/import-orders?action=batches')
      .then(res => res.json())
      .then(data => {
        if (data.success) setBatches(data.batches);
      })
      .finally(() => setLoading(false));
  });

  // 加载批次运单
  const loadBatchOrders = async (batchId: number) => {
    setSelectedBatch(batchId);
    const res = await fetch(`/api/import-orders?batchId=${batchId}&pageSize=100`);
    const data = await res.json();
    if (data.success) setBatchOrders(data.orders);
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
        <Loading size="md" />
        <p className="mt-4 text-gray-500">加载历史记录...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium text-gray-900">📋 历史导入记录</h3>
          <button onClick={onBack} className="text-sm text-[#0fc6c2] hover:text-[#0aa8a4]">
            ← 返回上传
          </button>
        </div>

        {batches.length === 0 ? (
          <p className="text-gray-500 text-center py-8">暂无导入记录</p>
        ) : (
          <div className="space-y-3">
            {batches.map((batch: any) => (
              <div
                key={batch.id}
                className={`border rounded-lg p-4 cursor-pointer transition-all ${
                  selectedBatch === batch.id
                    ? 'border-[#0fc6c2] bg-[#0fc6c2]/5'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
                onClick={() => loadBatchOrders(batch.id)}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-medium text-gray-900">{batch.file_name}</span>
                    <span className="ml-2 text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                      {batch.file_type}
                    </span>
                  </div>
                  <span className="text-xs text-gray-500">
                    {new Date(batch.created_at).toLocaleString('zh-CN')}
                  </span>
                </div>
                <div className="mt-2 flex gap-4 text-sm text-gray-600">
                  <span>共 {batch.total_rows} 条</span>
                  <span className="text-green-600">✓ {batch.success_rows} 条</span>
                  {batch.error_rows > 0 && <span className="text-red-600">✗ {batch.error_rows} 条</span>}
                </div>
                {batch.rule_name && (
                  <div className="mt-1 text-xs text-gray-500">规则: {batch.rule_name}</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 批次运单详情 */}
      {selectedBatch && batchOrders.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <h4 className="font-medium text-gray-900 mb-3">批次 #{selectedBatch} 运单详情</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">收货人</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">电话</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">地址</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">物品</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">数量</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {batchOrders.map((order: any) => (
                  <tr key={order.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2">{order.receiver_name || '-'}</td>
                    <td className="px-3 py-2">{order.receiver_phone || '-'}</td>
                    <td className="px-3 py-2 max-w-xs truncate">{order.receiver_address || '-'}</td>
                    <td className="px-3 py-2">{order.item_name || '-'}</td>
                    <td className="px-3 py-2">{order.quantity ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
