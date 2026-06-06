'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import FileUploader from '../components/Upload/FileUploader';
import OrderTable from '../components/Orders/OrderTable';
import Loading from '../components/Common/Loading';
import ProgressBar from '../components/Common/ProgressBar';
import Toast, { showToast } from '../components/Common/Toast';
import { useDebounce } from '../hooks/useDebounce';
import { useLargeData } from '../hooks/useLargeData';
import { AI_RULE_SYSTEM_PROMPT } from '@/lib/ai/prompts';
import { useParseWorker } from '../hooks/useWebWorker';
import type { ParsedOrder, ParseRule } from '@/types/rule';
import { validateParseRule, formatValidationErrors } from '@/lib/parser/validator';

type StepType = 'upload' | 'analyze' | 'confirm' | 'result' | 'history' | 'rules';

interface AnalyzedFile {
  file: File;
  rule: ParseRule | null;
  sample: string;
  fileInfo: { name: string; type: string; sheets: string[] };
  analyzing: boolean;
  selectedRuleId?: number | null;
  ruleOrigin?: 'saved' | 'ai' | 'blank';
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

// AI系统提示词 — 从共享模块导入（唯一数据源）
const AI_SYSTEM_PROMPT = AI_RULE_SYSTEM_PROMPT;

interface SamplePreviewTableRow {
  rowLabel: string;
  cells: string[];
}

interface SamplePreviewData {
  mode: 'empty' | 'table' | 'text';
  columns: string[];
  rows: SamplePreviewTableRow[];
  text: string;
  rowCount: number;
  headerRowLabel?: string;
  usesFirstRowAsHeader?: boolean;
}

const JT_PRIMARY = '#0fc6c2';
const JT_PRIMARY_HOVER = '#0aa8a4';
const JT_PRIMARY_LIGHT = '#e8fafa';
const JT_PRIMARY_BORDER = '#b5e8e8';
const JT_SUCCESS = '#52c41a';
const JT_WARNING = '#faad14';
const JT_DANGER = '#ff4d4f';
const JT_NAVY = '#001529';

const STEP_CONFIG: Array<{ key: StepType; label: string; icon: string; desc: string }> = [
  { key: 'upload', label: '上传文件', icon: '1', desc: '准备源文件与 AI 配置' },
  { key: 'analyze', label: 'AI 分析', icon: '2', desc: '抽样识别文件结构' },
  { key: 'confirm', label: '确认规则', icon: '3', desc: '核对规则与风险项' },
  { key: 'result', label: '解析结果', icon: '4', desc: '确认数据后提交导入' },
];

const STEP_ORDER: StepType[] = STEP_CONFIG.map(item => item.key);

function isLikelyHeaderRow(cells: string[]): boolean {
  const normalized = cells.map(cell => cell.trim()).filter(Boolean);
  if (!normalized.length) return false;

  const uniqueCount = new Set(normalized).size;
  const textLikeCount = normalized.filter(cell => /[\u4e00-\u9fa5a-zA-Z]/.test(cell)).length;
  const numericLikeCount = normalized.filter(cell => /^[-+]?\d+(?:\.\d+)?$/.test(cell)).length;

  return uniqueCount === normalized.length && textLikeCount >= Math.max(1, Math.ceil(normalized.length * 0.6)) && numericLikeCount < normalized.length;
}

function buildTablePreview(rows: SamplePreviewTableRow[], sample: string): SamplePreviewData {
  if (!rows.length || rows.every(row => row.cells.length <= 1)) return {
    mode: 'text',
    columns: [],
    rows: [],
    text: sample,
    rowCount: sample.split(/\r?\n/).filter(Boolean).length,
  };

  const maxCols = Math.max(...rows.map(row => row.cells.length));
  const normalizedRows = rows.map(row => ({
    rowLabel: row.rowLabel,
    cells: Array.from({ length: maxCols }, (_, index) => row.cells[index] ?? ''),
  }));

  const firstRow = normalizedRows[0];
  const useFirstRowAsHeader = firstRow ? isLikelyHeaderRow(firstRow.cells) : false;
  const columns = useFirstRowAsHeader
    ? firstRow.cells.map((cell, index) => cell || `列${index + 1}`)
    : Array.from({ length: maxCols }, (_, index) => `列${index + 1}`);
  const bodyRows = useFirstRowAsHeader ? normalizedRows.slice(1) : normalizedRows;

  return {
    mode: 'table',
    columns,
    rows: bodyRows,
    text: sample,
    rowCount: bodyRows.length,
    headerRowLabel: useFirstRowAsHeader ? firstRow.rowLabel : undefined,
    usesFirstRowAsHeader: useFirstRowAsHeader,
  };
}

function detectDelimitedRows(sample: string, fileType?: string): SamplePreviewData | null {
  const lines = sample
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);

  if (lines.length === 0) return null;

  if (fileType === 'excel') {
    const rows = lines.map((line, index) => {
      const match = line.match(/^\[(\d+)\]\s*(.*)$/);
      const rowLabel = match ? `第 ${Number(match[1]) + 1} 行` : `第 ${index + 1} 行`;
      const content = match ? match[2] : line;
      const cells = content.split('|').map(cell => cell.trim());
      return { rowLabel, cells };
    }).filter(row => row.cells.some(cell => cell.length > 0));

    if (!rows.length || rows.every(row => row.cells.length <= 1)) return null;
    return buildTablePreview(rows, sample);
  }

  const firstLine = lines[0] || '';
  const delimiterCandidates = [',', '\t', ';'] as const;
  const detectedDelimiter = delimiterCandidates.find(delimiter => firstLine.includes(delimiter));

  if (fileType === 'csv' && detectedDelimiter) {
    const rows = lines.map((line, index) => ({
      rowLabel: `第 ${index + 1} 行`,
      cells: line.split(detectedDelimiter).map(cell => cell.trim()),
    })).filter(row => row.cells.some(cell => cell.length > 0));

    if (!rows.length || rows.every(row => row.cells.length <= 1)) return null;
    return buildTablePreview(rows, sample);
  }

  return null;
}

function buildSamplePreview(sample: string, fileType?: string): SamplePreviewData {
  if (!sample.trim()) {
    return {
      mode: 'empty',
      columns: [],
      rows: [],
      text: '',
      rowCount: 0,
    };
  }

  const tablePreview = detectDelimitedRows(sample, fileType);
  if (tablePreview) return tablePreview;

  const textLines = sample.split(/\r?\n/).filter(Boolean);
  return {
    mode: 'text',
    columns: [],
    rows: [],
    text: sample,
    rowCount: textLines.length,
  };
}

export default function ImportPage() {
  const [step, setStep] = useState<StepType>('upload');
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [showMoreActions, setShowMoreActions] = useState(false);
  const [analyzedFiles, setAnalyzedFiles] = useState<AnalyzedFile[]>([]);
  const [savedRules, setSavedRules] = useState<SavedRule[]>([]);
  const [rulesLoading, setRulesLoading] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [parseProgressText, setParseProgressText] = useState('');
  const [submitProgressText, setSubmitProgressText] = useState('');
  const [selectedIndices, setSelectedIndices] = useState<number[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingRuleIndex, setEditingRuleIndex] = useState<number | null>(null);
  const [editingRuleJson, setEditingRuleJson] = useState('');
  const [testingEditedRule, setTestingEditedRule] = useState(false);
  const [editingRuleTestResult, setEditingRuleTestResult] = useState<any>(null);
  const [apiKey, setApiKey] = useState('');
  const [apiUrl, setApiUrl] = useState('https://api.siliconflow.cn/v1/chat/completions');
  const [modelName, setModelName] = useState('deepseek-ai/DeepSeek-V4-Pro');

  const currentStepIndex = STEP_ORDER.indexOf(step);
  const filesReadyForConfirm = analyzedFiles.filter(file => Boolean(file.rule)).length;
  const canEnterAnalyze = analyzedFiles.length > 0 && Boolean(apiKey);

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

  const loadSavedRules = useCallback(async () => {
    setRulesLoading(true);
    try {
      const res = await fetch('/api/rules');
      const data = await res.json();
      if (data.success) {
        setSavedRules(data.rules.map((r: any) => ({
          id: r.id,
          name: r.name,
          description: r.description,
          fileTypes: r.fileTypes || r.file_types || ['excel'],
          ruleJson: r.ruleJson || r.rule_json,
          isAiGenerated: r.isAiGenerated || r.is_ai_generated,
          usageCount: r.usageCount || r.usage_count || 0,
          createdAt: r.createdAt || r.created_at,
          updatedAt: r.updatedAt || r.updated_at,
        })));
      }
    } catch {
      showToast('error', '加载规则库失败');
    } finally {
      setRulesLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSavedRules();
  }, [loadSavedRules]);

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
  const invalidOrdersCount = orders.filter(order => !order.isValid).length;
  const selectedOrdersCount = selectedIndices.length > 0 ? selectedIndices.length : orders.length;
  const canEnterConfirm = analyzedFiles.length > 0 && filesReadyForConfirm === analyzedFiles.length;
  const canEnterResult = orders.length > 0;

  const stepSummary = useMemo(() => {
    if (step === 'upload') return `已选择 ${analyzedFiles.length} 个文件，待确认规则 ${Math.max(analyzedFiles.length - filesReadyForConfirm, 0)} 个`;
    if (step === 'analyze') return `正在为 ${analyzedFiles.length} 个文件抽样分析结构并生成推荐规则`;
    if (step === 'confirm') return `已准备 ${filesReadyForConfirm}/${analyzedFiles.length} 个规则，确认后即可开始解析`;
    if (step === 'result') return `共解析 ${orders.length} 条记录，可提交 ${selectedOrdersCount} 条${invalidOrdersCount > 0 ? `，其中 ${invalidOrdersCount} 条待修正` : ''}`;
    return '';
  }, [analyzedFiles.length, filesReadyForConfirm, invalidOrdersCount, orders.length, selectedOrdersCount, step]);

  const stepCanJump = useCallback((target: StepType) => {
    if (target === 'upload') return true;
    if (target === 'analyze') return canEnterAnalyze && !parsing;
    if (target === 'confirm') return canEnterConfirm && !parsing;
    if (target === 'result') return canEnterResult && !parsing;
    return false;
  }, [canEnterAnalyze, canEnterConfirm, canEnterResult, parsing]);

  const handleStepChange = useCallback((target: StepType) => {
    if (!stepCanJump(target)) {
      if (target === 'analyze') showToast('warning', '请先上传文件并配置 AI Key');
      else if (target === 'confirm') showToast('warning', '请先为全部文件完成规则准备');
      else if (target === 'result') showToast('warning', '请先完成解析后再查看结果');
      return;
    }
    setStep(target);
  }, [stepCanJump]);

  const stepStatusTone = step === 'result'
    ? invalidOrdersCount > 0 ? 'warning' : 'success'
    : step === 'confirm'
      ? canEnterConfirm ? 'ready' : 'warning'
      : 'info';
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

  // 生成默认规则（当AI失败时的备用方案）—— 仅生成通用空规则骨架，由用户继续编辑
  const generateFallbackRule = useCallback((fileType: string, fileName: string): ParseRule => {
    return {
      name: `${fileName} - 待确认规则`,
      description: 'AI分析失败后生成的通用规则骨架，请结合样例预览手动完善后测试保存',
      fileTypes: [fileType as any],
      identifier: {},
      parser: {
        type: fileType === 'pdf' || fileType === 'word' ? 'text' : 'table',
        table: fileType === 'excel' || fileType === 'csv' ? { headerRow: 'auto', dataStartRow: 'auto', columns: [] } : undefined,
        text: fileType === 'pdf' || fileType === 'word' ? { patterns: [], itemPatterns: [] } : undefined,
      },
      recipient: {
        source: 'header',
        fields: {},
      },
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
      selectedRuleId: null,
      ruleOrigin: undefined,
    }));
    setAnalyzedFiles(prev => [...prev, ...analyzed]);
  }, []);

  const handleApplySavedRule = useCallback((index: number, ruleId: number) => {
    const selected = savedRules.find(r => r.id === ruleId);
    if (!selected) return;
    setAnalyzedFiles(prev => prev.map((f, i) => i === index ? {
      ...f,
      rule: selected.ruleJson,
      selectedRuleId: selected.id,
      ruleOrigin: 'saved',
      error: undefined,
    } : f));
    showToast('success', `已为 ${analyzedFiles[index]?.file.name || '文件'} 选择规则：${selected.name}`);
  }, [savedRules, analyzedFiles]);

  const handleCreateBlankRuleForFile = useCallback((index: number) => {
    const item = analyzedFiles[index];
    if (!item) return;
    const blankRule: ParseRule = {
      name: `${item.file.name} - 新规则`,
      description: '手动新建规则，请根据样例文件补充解析配置',
      fileTypes: [((item.fileInfo.type || item.file.name.split('.').pop()?.toLowerCase() || 'excel') as any)],
      identifier: {},
      parser: {
        type: 'table',
        table: { headerRow: 'auto', dataStartRow: 'auto', columns: [] },
      },
      recipient: {
        source: 'header',
        fields: {},
      },
    };
    setAnalyzedFiles(prev => prev.map((f, i) => i === index ? {
      ...f,
      rule: blankRule,
      selectedRuleId: null,
      ruleOrigin: 'blank',
      error: undefined,
    } : f));
    setEditingRuleIndex(index);
    setEditingRuleJson(JSON.stringify(blankRule, null, 2));
  }, [analyzedFiles]);

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
        selectedRuleId: null, ruleOrigin: 'ai',
      } : f));
      // AI 生成后自动打开编辑器，让用户确认/微调/保存
      setEditingRuleIndex(index);
      setEditingRuleJson(JSON.stringify(rule, null, 2));
      setEditingRuleTestResult(null);
      showToast('success', `${item.file.name} 分析完成，请确认规则后保存`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : '分析失败';
      setAnalyzedFiles(prev => prev.map((f, i) => i === index ? { ...f, analyzing: false, error: errorMsg } : f));
      showToast('error', `${item.file.name} 分析失败: ${errorMsg}`);
    }
  };

  // 批量AI分析所有文件
  const handleAnalyzeAll = async () => {
    if (!apiKey) { showToast('error', '请先配置AI API Key'); return; }
    if (analyzedFiles.length === 0) { showToast('warning', '请先上传至少一个文件'); return; }
    setStep('analyze');
    setProgress(8);
    setParseProgressText(`开始分析 ${analyzedFiles.length} 个文件，系统将依次提取样例并生成推荐规则`);
    for (let i = 0; i < analyzedFiles.length; i++) {
      if (!analyzedFiles[i].rule || analyzedFiles[i].ruleOrigin !== 'saved') await handleAnalyzeFile(i);
      setProgress(Math.round(((i + 1) / analyzedFiles.length) * 100));
    }
    setParseProgressText(`AI 分析完成，已准备 ${analyzedFiles.filter(file => file.rule || file.ruleOrigin === 'saved').length}/${analyzedFiles.length} 个规则`);
    setStep('confirm');
  };

  // 编辑规则
  const handleEditRule = (index: number) => {
    const item = analyzedFiles[index];
    if (!item?.rule) return;
    setEditingRuleIndex(index);
    setEditingRuleJson(JSON.stringify(item.rule, null, 2));
    setEditingRuleTestResult(null);
  };

  // 保存编辑后的规则（含校验）
  const handleSaveRule = () => {
    if (editingRuleIndex === null) return;
    try {
      const rule = JSON.parse(editingRuleJson) as ParseRule;

      // 使用统一校验器验证规则
      const validationResult = validateParseRule(rule);
      if (!validationResult.valid) {
        showToast('error', '规则校验失败，请检查错误信息');
        setEditingRuleTestResult({
          success: false,
          error: formatValidationErrors(validationResult),
          validationErrors: validationResult.errors,
        });
        return;
      }

      setAnalyzedFiles(prev => prev.map((f, i) => i === editingRuleIndex ? { ...f, rule, selectedRuleId: null } : f));
      setEditingRuleTestResult(null);
      setEditingRuleIndex(null);
      showToast('success', '规则已更新');

      // 如果有警告，仍然允许保存但提示用户
      if (validationResult.warnings.length > 0) {
        showToast('warning', `规则已保存，但有 ${validationResult.warnings.length} 个警告`);
      }
    } catch {
      showToast('error', 'JSON格式错误');
    }
  };

  // 仅校验规则结构
  const handleValidateRule = () => {
    if (editingRuleIndex === null) return;
    try {
      const rule = JSON.parse(editingRuleJson);
      const result = validateParseRule(rule);
      if (result.valid) {
        showToast('success', '规则结构校验通过');
        setEditingRuleTestResult({
          success: true,
          message: '规则结构校验通过' + (result.warnings.length > 0 ? `（${result.warnings.length} 个警告）` : ''),
          warnings: result.warnings,
        });
      } else {
        showToast('error', '规则校验失败');
        setEditingRuleTestResult({
          success: false,
          error: formatValidationErrors(result),
          validationErrors: result.errors,
          warnings: result.warnings,
        });
      }
    } catch {
      showToast('error', 'JSON 格式错误');
      setEditingRuleTestResult({ success: false, error: 'JSON 格式错误' });
    }
  };

  const testRuleJsonOnCurrentFile = async () => {
    if (editingRuleIndex === null) return;
    const item = analyzedFiles[editingRuleIndex];
    if (!item) return;

    setTestingEditedRule(true);
    setEditingRuleTestResult(null);

    try {
      const parsedRule = JSON.parse(editingRuleJson) as ParseRule;
      const formData = new FormData();
      formData.append('file', item.file);
      formData.append('rule', JSON.stringify(parsedRule));
      const res = await fetch('/api/parse', { method: 'POST', body: formData });
      const data = await res.json();
      setEditingRuleTestResult(data);
      if (data.success) {
        showToast('success', `规则测试完成，解析 ${data.totalRows} 条数据`);
      } else {
        showToast('error', data.error || '规则测试失败');
      }
    } catch (error: any) {
      const message = error?.message || '规则测试失败';
      setEditingRuleTestResult({ success: false, error: message });
      showToast('error', message);
    } finally {
      setTestingEditedRule(false);
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
        loadSavedRules();
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
  const parseFileWithChunks = async (file: File, rule: ParseRule, fileLabel: string, fileIndex: number, totalFiles: number): Promise<{ orders: ParsedOrder[]; totalRows: number }> => {
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
    setParseProgressText(`正在解析第 ${fileIndex + 1}/${totalFiles} 个文件：${fileLabel}（上传分片 0/${totalChunks}）`);

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

      setParseProgressText(`正在解析第 ${fileIndex + 1}/${totalFiles} 个文件：${fileLabel}（上传分片 ${i + 1}/${totalChunks}）`);
      setProgress(((i + 1) / totalChunks) * 100);
    }

    // Step 3: 触发合并和解析
    showToast('info', `所有分片已接收，正在合并解析...`);
    setParseProgressText(`正在解析第 ${fileIndex + 1}/${totalFiles} 个文件：${fileLabel}（分片上传完成，开始合并）`);
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
    setParseProgressText('准备开始解析...');
    setOrders([]);
    setSelectedIndices([]);
    setDuplicateNos([]);
    setDupStats(null);

    try {
      const allOrders: ParsedOrder[] = [];
      const total = filesWithRules.length;

      for (let i = 0; i < total; i++) {
        const item = filesWithRules[i];
        setParseProgressText(`正在解析第 ${i + 1}/${total} 个文件：${item.file.name}`);
        setProgress(((i + 0.5) / total) * 100);

        try {
          // 策略选择：大文件分片 > 大文件Worker > 普通主线程
          if (item.file.size > CHUNK_THRESHOLD) {
            // >10MB：使用分片上传
            showToast('info', `${item.file.name} 使用分片上传 (${Math.ceil(item.file.size / CHUNK_SIZE)} 片)...`);
            const result = await parseFileWithChunks(item.file, item.rule!, item.file.name, i, total);
            allOrders.push(...result.orders);
            showToast('success', `${item.file.name} 分片完成，${result.totalRows} 条记录`);
          } else if (workerSupported && item.file.size > 500 * 1024) {
            // >500KB：使用 Web Worker
            showToast('info', `${item.file.name} 使用 Worker 后台解析...`);
            setParseProgressText(`正在解析第 ${i + 1}/${total} 个文件：${item.file.name}（Worker）`);
            const result = await parseWithWorker(item.file, item.rule!, (p) => {
              const fileProgress = ((i + p.percent / 100) / total) * 100;
              setParseProgressText(`正在解析第 ${i + 1}/${total} 个文件：${item.file.name}（Worker ${Math.round(p.percent)}%，${p.message || '处理中'}）`);
              setProgress(fileProgress);
            });
            allOrders.push(...result.orders);
            showToast('success', `${item.file.name} Worker解析完成，${result.totalRows} 条记录`);
          } else {
            // 小文件：直接主线程请求
            setParseProgressText(`正在解析第 ${i + 1}/${total} 个文件：${item.file.name}（主线程）`);
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
      setParseProgressText(`解析完成，共处理 ${allOrders.length} 条记录`);

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
      setParseProgressText(`解析完成，共 ${allOrders.length} 条记录，已进入结果确认阶段`);
    } catch {
      showToast('error', '解析过程中发生错误');
    } finally {
      setParsing(false);
      setTimeout(() => setParseProgressText(''), 2000);
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
    setSubmitProgressText('准备开始提交...');

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
        setSubmitProgressText(`正在提交第 ${start + 1} ~ ${end} 条，共 ${submitData.length} 条（第 ${batchIdx + 1}/${totalBatches} 批）`);
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
      setSubmitProgressText(`提交完成：成功 ${successCount} 条，失败 ${failCount} 条`);
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
      setTimeout(() => { setSubmitProgress(0); setSubmitProgressText(''); }, 2000);
    }
  };

  // 跳过错误行，仅提交有效数据
  const submitValidOrdersOnly = async (validOrders: ParsedOrder[]) => {
    if (validOrders.length === 0) return;
    setSubmitting(true);
    setSubmitProgress(0);
    setSubmitProgressText('准备开始提交有效数据...');
    try {
      const BATCH_SIZE = 100;
      const totalBatches = Math.ceil(validOrders.length / BATCH_SIZE);
      let successCount = 0;
      for (let i = 0; i < totalBatches; i++) {
        const batch = validOrders.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE);
        const start = i * BATCH_SIZE + 1;
        const end = Math.min((i + 1) * BATCH_SIZE, validOrders.length);
        setSubmitProgress(Math.round((i / totalBatches) * 90));
        setSubmitProgressText(`正在提交有效数据第 ${start} ~ ${end} 条，共 ${validOrders.length} 条（第 ${i + 1}/${totalBatches} 批）`);
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
      setSubmitProgressText(`已跳过错误行，成功提交 ${successCount} 条有效运单`);
      showToast('success', `已跳过错误行，成功提交 ${successCount} 条有效运单`);
    } catch { showToast('error', '提交失败'); }
    finally { setSubmitting(false); setTimeout(() => { setSubmitProgress(0); setSubmitProgressText(''); }, 2000); }
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
              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: JT_PRIMARY }}>
                <svg className="w-5 h-5 sm:w-6 sm:h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-base sm:text-xl font-bold text-gray-900 truncate">万能导入 V2</h1>
                  <span className="hidden sm:inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium border" style={{ color: JT_PRIMARY, backgroundColor: JT_PRIMARY_LIGHT, borderColor: JT_PRIMARY_BORDER }}>鲸天风格</span>
                </div>
                <p className="hidden sm:block text-xs text-gray-500">智能多格式批量下单系统 · 规则驱动解析</p>
              </div>
            </div>
            <div className="flex items-center gap-1 sm:gap-3">
              {orders.length > 0 && (
                <span className="hidden md:inline-block text-sm text-gray-600 shrink-0">
                  已解析 <span className="font-medium" style={{ color: JT_PRIMARY }}>{orders.length}</span> 条运单
                  {useVirtualScroll && <span className="ml-2 text-xs px-2 py-0.5 rounded" style={{ backgroundColor: JT_PRIMARY_LIGHT, color: JT_PRIMARY }}>虚拟滚动</span>}
                  {workerSupported && <span className="ml-2 text-xs px-2 py-0.5 rounded bg-green-100 text-green-700">Worker</span>}
                </span>
              )}
              {orders.length > 0 && (
                <span className="md:hidden text-xs font-medium px-2 py-0.5 rounded-full shrink-0" style={{ color: JT_PRIMARY, backgroundColor: JT_PRIMARY_LIGHT }}>{orders.length}条</span>
              )}
              <button onClick={() => handleStepChange('rules')} className="text-xs sm:text-sm whitespace-nowrap shrink-0 hidden xs:inline-block" style={{ color: JT_PRIMARY }}>⚙️ 规则库</button>
              <button onClick={() => handleStepChange('history')} className="text-xs sm:text-sm whitespace-nowrap shrink-0 hidden xs:inline-block" style={{ color: JT_PRIMARY }}>📋 历史记录</button>
              {step !== 'upload' && step !== 'history' && step !== 'rules' && (
                <button onClick={handleRestart} className="text-xs sm:text-sm text-gray-500 hover:text-gray-700 whitespace-nowrap shrink-0">重置</button>
              )}
              <button onClick={() => setShowMobileMenu(!showMobileMenu)} className="xs:hidden p-1.5 text-gray-600 hover:bg-gray-100 rounded-lg shrink-0" aria-label="菜单">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16"/></svg>
              </button>
            </div>
            {showMobileMenu && (
              <div className="absolute right-3 top-14 sm:top-16 bg-white shadow-lg border border-gray-200 rounded-lg py-2 z-50 min-w-[140px]">
                <button onClick={() => { handleStepChange('rules'); setShowMobileMenu(false); }} className="block w-full text-left px-4 py-2 text-sm hover:bg-blue-50" style={{ color: JT_PRIMARY }}>⚙️ 规则库</button>
                <button onClick={() => { handleStepChange('history'); setShowMobileMenu(false); }} className="block w-full text-left px-4 py-2 text-sm hover:bg-blue-50" style={{ color: JT_PRIMARY }}>📋 历史记录</button>
                {orders.length > 0 && <div className="border-t my-1"></div>}
                {orders.length > 0 && <div className="px-4 py-1 text-xs text-gray-400">已解析 {orders.length} 条运单</div>}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* 步骤指示器 - 响应式 */}
      {step !== 'history' && step !== 'rules' && (
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 pt-4 sm:pt-6 space-y-4">
          <div className="rounded-2xl border bg-white shadow-sm overflow-hidden" style={{ borderColor: stepStatusTone === 'warning' ? '#ffe58f' : '#d9d9d9' }}>
            <div className="px-4 sm:px-5 py-4 border-b border-gray-100 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium text-white" style={{ backgroundColor: step === 'result' ? (invalidOrdersCount > 0 ? JT_WARNING : JT_SUCCESS) : JT_PRIMARY }}>
                    当前阶段 · {STEP_CONFIG[currentStepIndex]?.label || '上传文件'}
                  </span>
                  <span className="text-sm font-medium text-gray-900">{STEP_CONFIG[currentStepIndex]?.desc || '准备源文件与 AI 配置'}</span>
                </div>
                <p className="mt-2 text-sm text-gray-500">{stepSummary}</p>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-end text-xs">
                <div className="rounded-xl border border-gray-200 px-3 py-2 bg-gray-50 text-gray-600">文件数 <span className="ml-1 font-semibold text-gray-900">{analyzedFiles.length}</span></div>
                <div className="rounded-xl border border-gray-200 px-3 py-2 bg-gray-50 text-gray-600">规则就绪 <span className="ml-1 font-semibold text-gray-900">{filesReadyForConfirm}</span></div>
                <div className="rounded-xl border border-gray-200 px-3 py-2 bg-gray-50 text-gray-600">解析记录 <span className="ml-1 font-semibold text-gray-900">{orders.length}</span></div>
                <div className="rounded-xl border border-gray-200 px-3 py-2 bg-gray-50 text-gray-600">待修正 <span className="ml-1 font-semibold" style={{ color: invalidOrdersCount > 0 ? JT_DANGER : '#262626' }}>{invalidOrdersCount}</span></div>
              </div>
            </div>
            <div className="px-3 sm:px-5 py-4">
              <div className="flex items-center justify-center gap-1 sm:gap-2 overflow-x-auto pb-1 scrollbar-hide">
                {STEP_CONFIG.map((s, i) => {
                  const isCurrent = step === s.key;
                  const isDone = currentStepIndex > i;
                  const canJump = stepCanJump(s.key);
                  return (
                    <div key={s.key} className="flex items-center shrink-0">
                      <button
                        type="button"
                        onClick={() => handleStepChange(s.key)}
                        disabled={!canJump && !isCurrent}
                        className={`flex items-center gap-2 px-2.5 sm:px-4 py-2 rounded-full text-xs sm:text-sm whitespace-nowrap border transition-colors ${!canJump && !isCurrent ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
                        style={{
                          backgroundColor: isCurrent ? JT_PRIMARY : isDone ? '#f6ffed' : '#fafafa',
                          borderColor: isCurrent ? JT_PRIMARY : isDone ? '#b7eb8f' : '#d9d9d9',
                          color: isCurrent ? '#ffffff' : isDone ? '#389e0d' : '#595959',
                        }}
                      >
                        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold" style={{ backgroundColor: isCurrent ? 'rgba(255,255,255,0.2)' : '#ffffff', color: isCurrent ? '#ffffff' : isDone ? '#389e0d' : JT_PRIMARY }}>{s.icon}</span>
                        <span>{s.label}</span>
                      </button>
                      {i < STEP_CONFIG.length - 1 && <div className="w-8 sm:w-10 h-px bg-gray-300 mx-1" />}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 主内容区 - 响应式容器 */}
      <main className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 pb-8">

        {/* AI配置区域 */}
        {step === 'upload' && (
          <div className="rounded-2xl border bg-white shadow-sm overflow-hidden" style={{ borderColor: '#d9d9d9' }}>
            <div className="px-4 sm:px-5 py-4 border-b border-gray-100 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h3 className="text-sm font-semibold text-gray-800">AI 配置</h3>
                <p className="mt-1 text-xs text-gray-500">先固定分析模型，再进入文件上传与规则生成。配置保存在当前浏览器。</p>
              </div>
              <div className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs" style={{ backgroundColor: JT_PRIMARY_LIGHT, color: JT_PRIMARY }}>
                当前阶段必填
              </div>
            </div>
            <div className="p-4 sm:p-5 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">API地址</label>
                  <input type="text" value={apiUrl} onChange={e => setApiUrl(e.target.value)}
                    placeholder="https://api.openai.com/v1/chat/completions"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2"
                    style={{ boxShadow: `0 0 0 2px ${JT_PRIMARY}33` }} />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">模型名称</label>
                  <input type="text" value={modelName} onChange={e => setModelName(e.target.value)}
                    placeholder="例如：deepseek-ai/DeepSeek-V4-Pro、deepseek-ai/DeepSeek-V3"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2"
                    style={{ boxShadow: `0 0 0 2px ${JT_PRIMARY}33` }} />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">API Key</label>
                  <div className="flex gap-2">
                    <input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="sk-..."
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2"
                      style={{ boxShadow: `0 0 0 2px ${JT_PRIMARY}33` }} />
                    <button onClick={saveConfig} className="px-4 py-2 text-white rounded-lg text-sm" style={{ backgroundColor: JT_PRIMARY }}>保存</button>
                    <button onClick={resetConfig} className="px-4 py-2 bg-gray-100 text-gray-600 rounded-lg text-sm hover:bg-gray-200">重置</button>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.1fr),minmax(0,0.9fr)] gap-4">
                <div className="rounded-xl border p-4" style={{ borderColor: JT_PRIMARY_BORDER, backgroundColor: JT_PRIMARY_LIGHT }}>
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div>
                      <h4 className="text-sm font-medium" style={{ color: JT_PRIMARY }}>推荐配置</h4>
                      <p className="mt-1 text-xs text-gray-600">用于当前 DeepSeek 规则生成链路，可一键回填。</p>
                    </div>
                    <button
                      onClick={() => { setApiUrl('https://api.siliconflow.cn/v1/chat/completions'); setModelName('deepseek-ai/DeepSeek-V4-Pro'); }}
                      className="text-xs font-medium hover:underline"
                      style={{ color: JT_PRIMARY }}
                    >一键填入</button>
                  </div>
                  <div className="mt-3 space-y-2 text-xs font-mono text-gray-700">
                    <div className="rounded-lg border border-white/70 bg-white px-3 py-2 break-all">API地址：https://api.siliconflow.cn/v1/chat/completions</div>
                    <div className="rounded-lg border border-white/70 bg-white px-3 py-2 break-all">模型名：deepseek-ai/DeepSeek-V4-Pro</div>
                    <div className="rounded-lg border border-white/70 bg-white px-3 py-2 break-all">API Key：请自行申请并填写</div>
                  </div>
                </div>
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                  <h4 className="text-sm font-medium text-gray-800">阶段提醒</h4>
                  <ul className="mt-3 space-y-2 text-xs text-gray-600 leading-5">
                    <li>1. 上传前先保存配置，避免批量分析中断。</li>
                    <li>2. AI 只负责理解结构，不直接决定最终导入结果。</li>
                    <li>3. 后续仍需在“确认规则”和“解析结果”阶段人工复核风险项。</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 步骤1：上传文件 */}
        {step === 'upload' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr),320px] gap-6 items-start">
              <div className="space-y-6">
                <FileUploader onFilesSelected={handleFilesSelected} onFileRemoved={handleFileRemoved} />
                {analyzedFiles.length > 0 && (
                  <div className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-5 space-y-4 shadow-sm">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div>
                        <h4 className="font-semibold text-gray-900">规则选择与样例预览</h4>
                        <p className="text-sm text-gray-500 mt-1">每个文件必须明确选择规则；也可以先做 AI 分析生成推荐规则，再微调后落库。</p>
                      </div>
                      <div className="text-xs text-gray-500 rounded-full bg-gray-50 px-3 py-1 border border-gray-200">
                        规则库 {rulesLoading ? '加载中...' : `${savedRules.length} 条`}
                      </div>
                    </div>
                    <div className="space-y-3">
                      {analyzedFiles.map((item, index) => {
                    const matchedRules = savedRules.filter(rule => {
                      if (!item.fileInfo.type) return true;
                      return (rule.fileTypes || []).includes(item.fileInfo.type as any);
                    });
                    const samplePreview = buildSamplePreview(item.sample, item.fileInfo.type);
                    return (
                      <div key={`${item.file.name}-${index}`} className="border border-gray-200 rounded-xl p-4 bg-gradient-to-br from-gray-50 to-white shadow-sm">
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                          <div className="min-w-0">
                            <div className="font-medium text-gray-900 break-all">{item.file.name}</div>
                            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-gray-500">
                              <span className="inline-flex items-center rounded-full bg-white px-2 py-0.5 border border-gray-200">
                                类型：{item.fileInfo.type || '待识别'}
                              </span>
                              {item.fileInfo.sheets.length > 0 && (
                                <span className="inline-flex items-center rounded-full bg-white px-2 py-0.5 border border-gray-200">
                                  Sheet：{item.fileInfo.sheets.length} 个
                                </span>
                              )}
                              {samplePreview.mode !== 'empty' && (
                                <span className="inline-flex items-center rounded-full bg-white px-2 py-0.5 border border-gray-200">
                                  样例：{samplePreview.mode === 'table' ? `${samplePreview.rowCount} 行表格` : `${samplePreview.rowCount} 行文本`}
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-gray-500 mt-2">
                              当前规则：{item.rule?.name || '未选择'}
                              {item.ruleOrigin === 'saved' && ' · 来自规则库'}
                              {item.ruleOrigin === 'ai' && ' · AI推荐'}
                              {item.ruleOrigin === 'blank' && ' · 手动新建'}
                            </div>
                          </div>
                          <div className="flex gap-2 flex-wrap">
                            <button
                              onClick={() => handleAnalyzeFile(index)}
                              disabled={item.analyzing || !apiKey}
                              className="inline-flex items-center gap-1 px-3.5 py-2 text-xs font-medium text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                              style={{ backgroundColor: JT_PRIMARY }}
                            >
                              <span>{item.analyzing ? '分析中...' : 'AI生成推荐规则'}</span>
                            </button>
                            <button
                              onClick={() => handleCreateBlankRuleForFile(index)}
                              className="inline-flex items-center gap-1 px-3.5 py-2 text-xs font-medium bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100"
                            >
                              新建规则
                            </button>
                            {item.rule && (
                              <>
                                <button
                                  onClick={() => handleEditRule(index)}
                                  className="inline-flex items-center gap-1 px-3.5 py-2 text-xs font-medium bg-white rounded-lg hover:bg-gray-50"
                                  style={{ border: `1px solid ${JT_PRIMARY_BORDER}`, color: JT_PRIMARY }}
                                >
                                  编辑规则
                                </button>
                                <button
                                  onClick={() => handleSaveRuleToDB(index)}
                                  className="inline-flex items-center gap-1 px-3.5 py-2 text-xs font-medium text-white rounded-lg shadow-sm"
                                  style={{ backgroundColor: JT_PRIMARY }}
                                >
                                  保存到规则库
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                        <div className="mt-3 grid grid-cols-1 xl:grid-cols-[minmax(0,320px),1fr] gap-4">
                          <div className="rounded-xl border border-gray-200 bg-white p-3">
                            <div className="flex items-center justify-between gap-2 mb-2">
                              <label className="block text-xs font-medium text-gray-600">手动选择规则</label>
                              <span className="text-[11px] text-gray-400">仅手动生效</span>
                            </div>
                            <select
                              value={item.selectedRuleId ?? ''}
                              onChange={(e) => {
                                const value = e.target.value;
                                if (!value) return;
                                handleApplySavedRule(index, Number(value));
                              }}
                              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-gray-50 focus:bg-white focus:outline-none focus:ring-2"
                              style={{ boxShadow: `0 0 0 2px ${JT_PRIMARY}33` }}
                            >
                              <option value="">请选择规则（不自动匹配）</option>
                              {matchedRules.map(rule => (
                                <option key={rule.id} value={rule.id}>{rule.name}</option>
                              ))}
                            </select>
                            <p className="mt-2 text-xs leading-5 text-gray-400">上传时不会自动套规则，必须由你明确选择，或先通过 AI 生成推荐规则后再确认。</p>
                          </div>
                          <div className="rounded-xl border border-gray-200 bg-white p-3">
                            <div className="flex items-center justify-between gap-2 mb-2">
                              <div>
                                <label className="block text-xs font-medium text-gray-600">文件样例预览</label>
                                <p className="mt-1 text-[11px] text-gray-400">AI 抽取的样例内容优先按表格展示，便于快速确认列结构。</p>
                              </div>
                              <div className="flex items-center gap-2 flex-wrap justify-end">
                                {samplePreview.usesFirstRowAsHeader && samplePreview.headerRowLabel && (
                                  <span className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1 rounded-full">
                                    已将 {samplePreview.headerRowLabel} 识别为表头
                                  </span>
                                )}
                                {samplePreview.mode === 'table' && (
                                  <span className="text-[11px] px-2 py-1 rounded-full" style={{ color: JT_PRIMARY, backgroundColor: JT_PRIMARY_LIGHT }}>表格视图</span>
                                )}
                              </div>
                            </div>

                            {samplePreview.mode === 'empty' && (
                              <div className="min-h-[156px] rounded-lg border border-dashed border-gray-200 bg-gray-50 flex items-center justify-center px-4 text-center text-xs text-gray-400">
                                点击“AI生成推荐规则”后，可先查看当前文件提取出的样例内容。
                              </div>
                            )}

                            {samplePreview.mode === 'table' && (
                              <div className="rounded-lg border border-gray-200 overflow-hidden">
                                <div className="flex items-center justify-between gap-2 px-3 py-2 bg-gray-50 border-b border-gray-200 text-[11px] text-gray-500">
                                  <span>共 {samplePreview.rowCount} 行可预览数据</span>
                                  <span>支持横向滚动查看全部列</span>
                                </div>
                                <div className="max-h-56 overflow-auto">
                                  <table className="min-w-full text-xs text-gray-700 table-fixed">
                                    <thead className="sticky top-0 z-10 bg-gray-50">
                                      <tr>
                                        <th className="w-20 px-3 py-2 text-left font-medium text-gray-500 border-b border-r border-gray-200">行号</th>
                                        {samplePreview.columns.map((column, colIndex) => (
                                          <th key={`${item.file.name}-sample-head-${colIndex}`} className="min-w-[140px] px-3 py-2 text-left font-medium text-gray-600 border-b border-gray-200 whitespace-nowrap">
                                            <div className="truncate" title={column}>{column}</div>
                                          </th>
                                        ))}
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {samplePreview.rows.map((row, rowIndex) => (
                                        <tr key={`${item.file.name}-sample-row-${rowIndex}`} className={rowIndex % 2 === 0 ? 'bg-white' : 'bg-gray-50/60'}>
                                          <td className="px-3 py-2 align-top text-gray-400 border-b border-r border-gray-100 whitespace-nowrap">{row.rowLabel}</td>
                                          {row.cells.map((cell, cellIndex) => (
                                            <td key={`${item.file.name}-sample-cell-${rowIndex}-${cellIndex}`} className="px-3 py-2 align-top border-b border-gray-100 break-all whitespace-pre-wrap">
                                              {cell || <span className="text-gray-300">—</span>}
                                            </td>
                                          ))}
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            )}

                            {samplePreview.mode === 'text' && (
                              <div className="min-h-[156px] max-h-56 overflow-auto rounded-lg border border-gray-200 bg-gray-50 p-3 font-mono text-xs leading-5 text-gray-700 whitespace-pre-wrap">
                                {samplePreview.text}
                              </div>
                            )}
                          </div>
                        </div>
                        {item.error && <div className="mt-2 text-xs text-red-500">{item.error}</div>}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            </div>
            <aside className="space-y-4 xl:sticky xl:top-28">
              <div className="rounded-2xl border bg-white p-4 shadow-sm border-gray-200">
                <h4 className="text-sm font-semibold text-gray-900">上传阶段检查清单</h4>
                <div className="mt-3 space-y-3 text-xs text-gray-600">
                  <div className="flex items-start justify-between gap-3 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
                    <span>AI 配置</span>
                    <span className={`font-medium ${apiKey ? 'text-green-600' : 'text-red-500'}`}>{apiKey ? '已完成' : '未配置'}</span>
                  </div>
                  <div className="flex items-start justify-between gap-3 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
                    <span>已上传文件</span>
                    <span className="font-medium text-gray-900">{analyzedFiles.length} 个</span>
                  </div>
                  <div className="flex items-start justify-between gap-3 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
                    <span>规则已就绪</span>
                    <span className="font-medium text-gray-900">{filesReadyForConfirm}/{analyzedFiles.length || 0}</span>
                  </div>
                </div>
              </div>
              <div className="rounded-2xl border p-4 shadow-sm" style={{ borderColor: JT_PRIMARY_BORDER, backgroundColor: JT_PRIMARY_LIGHT }}>
                <h4 className="text-sm font-semibold" style={{ color: JT_PRIMARY }}>设计原则</h4>
                <p className="mt-2 text-sm leading-6 text-gray-700">
                  不是为 N 种文件写 N 套 if-else，而是把格式理解交给大模型，把稳定执行交给规则 DSL 和解析引擎。
                </p>
                <ul className="mt-3 space-y-2 text-xs text-gray-600 leading-5">
                  <li>• 新格式优先生成新规则，而不是改系统逻辑。</li>
                  <li>• 规则确认阶段必须显式暴露不确定字段。</li>
                  <li>• 结果确认阶段必须把风险项高亮给用户。</li>
                </ul>
              </div>
              <button onClick={handleAnalyzeAll} disabled={!canEnterAnalyze}
                className="w-full px-6 py-3 text-white rounded-xl font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                style={{ backgroundColor: canEnterAnalyze ? JT_PRIMARY : '#bfbfbf' }}>
                批量生成推荐规则（{analyzedFiles.length} 个文件）
              </button>
              {!apiKey && <p className="text-sm text-red-500 text-center">请先配置 AI API Key</p>}
            </aside>
          </div>
          </div>
        )}

        {/* 步骤2：AI分析中 */}
        {step === 'analyze' && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
              <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">AI 正在分析文件结构</h3>
                  <p className="mt-1 text-sm text-gray-500">系统会先提取样例，再逐个生成推荐规则。当前阶段不直接导入数据。</p>
                </div>
                <span className="inline-flex items-center rounded-full px-3 py-1 text-xs font-medium text-white" style={{ backgroundColor: JT_PRIMARY }}>阶段 2 / 4</span>
              </div>
              <ProgressBar progress={progress} />
              {parseProgressText && <p className="mt-3 text-sm text-gray-600">{parseProgressText}</p>}
              <div className="mt-4 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr),280px] gap-4">
                <div className="space-y-3">
                  {analyzedFiles.map((item, index) => (
                    <div key={index} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100">
                      {item.analyzing ? <Loading size="sm" /> : item.rule ? <span className="text-green-500">✅</span> : item.error ? <span className="text-red-500">❌</span> : <span className="text-gray-400">⏳</span>}
                      <div className="min-w-0 flex-1">
                        <div className="text-sm text-gray-700 truncate">{item.file.name}</div>
                        {item.rule && <span className="text-xs" style={{ color: JT_PRIMARY }}>→ {item.rule.parser.type}</span>}
                        {item.error && <span className="text-xs text-red-500 block">{item.error}</span>}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="rounded-2xl border p-4" style={{ borderColor: JT_PRIMARY_BORDER, backgroundColor: JT_PRIMARY_LIGHT }}>
                  <h4 className="text-sm font-semibold" style={{ color: JT_PRIMARY }}>当前执行内容</h4>
                  <ul className="mt-3 space-y-2 text-xs text-gray-600 leading-5">
                    <li>• 提取文件前 20 行样例</li>
                    <li>• 调用 LLM 生成推荐规则 JSON</li>
                    <li>• 为失败文件回退到通用规则骨架</li>
                    <li>• 分析完成后进入规则确认阶段</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 步骤3：确认规则 */}
        {step === 'confirm' && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">确认解析规则</h3>
                  <p className="text-sm text-gray-600 mt-1">AI 已给出推荐规则。此阶段必须确认关键字段、低置信度映射和缺失项，再进入解析。</p>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs min-w-[240px]">
                  <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-gray-600">文件总数 <span className="ml-1 font-semibold text-gray-900">{analyzedFiles.length}</span></div>
                  <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-gray-600">规则就绪 <span className="ml-1 font-semibold text-gray-900">{filesReadyForConfirm}</span></div>
                  <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-gray-600">可直接解析 <span className="ml-1 font-semibold" style={{ color: canEnterConfirm ? JT_SUCCESS : JT_WARNING }}>{canEnterConfirm ? '是' : '否'}</span></div>
                  <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-gray-600">重点检查 <span className="ml-1 font-semibold text-gray-900">低置信度/缺字段</span></div>
                </div>
              </div>
              <div className="space-y-4">
                {analyzedFiles.map((item, index) => (
                  <div key={index} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900">{item.file.name}</span>
                        {item.rule && (
                          <span className="text-xs px-2 py-0.5 rounded" style={{ backgroundColor: JT_PRIMARY_LIGHT, color: JT_PRIMARY }}>{item.rule.parser.type}</span>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => handleAnalyzeFile(index)} disabled={item.analyzing} className="text-xs hover:underline" style={{ color: JT_PRIMARY }}>重新分析</button>
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
                          {/* 置信度概览 */}
                          {item.rule.parser?.table?.columns && (
                            (() => {
                              const cols = item.rule.parser.table.columns;
                              const high = cols.filter((c: any) => c.confidence === 'high').length;
                              const med = cols.filter((c: any) => c.confidence === 'medium').length;
                              const low = cols.filter((c: any) => c.confidence !== 'high' && c.confidence !== 'medium').length;
                              return (
                                <div className="flex gap-1.5 text-xs">
                                  {high > 0 && <span className="bg-green-100 text-green-700 px-1.5 py-0.5 rounded">高 {high}</span>}
                                  {med > 0 && <span className="bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded">中 {med}</span>}
                                  {low > 0 && <span className="bg-red-100 text-red-700 px-1.5 py-0.5 rounded">低 {low}</span>}
                                </div>
                              );
                            })()
                          )}
                        </div>
                        {item.rule.description && <p className="text-xs text-gray-600 mb-2">{item.rule.description}</p>}
                        
                        {/* 字段映射表格 - 含置信度 */}
                        {item.rule.parser?.table?.columns && (
                          <div className="mt-2 overflow-x-auto">
                            <table className="w-full text-xs border-collapse">
                              <thead>
                                <tr className="bg-gray-100">
                                  <th className="px-2 py-1 text-left">列号</th>
                                  <th className="px-2 py-1 text-left">目标字段</th>
                                  <th className="px-2 py-1 text-left">置信度</th>
                                  <th className="px-2 py-1 text-left">推测依据</th>
                                </tr>
                              </thead>
                              <tbody>
                                {item.rule.parser.table.columns.map((col: any, ci: number) => (
                                  <tr key={ci} className={`border-t ${
                                    col.confidence === 'high' ? 'bg-white' : 
                                    col.confidence === 'medium' ? 'bg-yellow-50' : 'bg-red-50'
                                  }`}>
                                    <td className="px-2 py-1">{col.sourceIndex}</td>
                                    <td className="px-2 py-1 font-medium">{col.targetField || '-'}</td>
                                    <td className="px-2 py-1">
                                      {col.confidence === 'high' && <span className="text-green-600">● 高</span>}
                                      {col.confidence === 'medium' && <span className="text-yellow-600">▲ 中</span>}
                                      {col.confidence !== 'high' && col.confidence !== 'medium' && <span className="text-red-600">▼ 低</span>}
                                    </td>
                                    <td className="px-2 py-1 text-gray-500">{col.reason || '-'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                        
                        {/* AI推测警告 */}
                        {item.rule.parser?.table?.columns && 
                          item.rule.parser.table.columns.some((c: any) => c.confidence !== 'high') && (
                          <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-800">
                            ⚠️ AI对部分字段的映射不确定（标注为"中"或"低"），请仔细确认后再开始解析！
                          </div>
                        )}
                        {/* 缺少关键字段警告 */}
                        {item.rule.parser?.table?.columns && (() => {
                          const cols = item.rule.parser.table.columns;
                          const mappedFields = new Set(cols.map((c: any) => c.targetField));
                          const hasGroupA = mappedFields.has('storeName');
                          const hasGroupB = mappedFields.has('receiverName') && mappedFields.has('receiverPhone') && mappedFields.has('receiverAddress');
                          const hasItemCode = mappedFields.has('itemCode');
                          const hasItemName = mappedFields.has('itemName');
                          const hasQuantity = mappedFields.has('quantity');
                          const missingGroups: string[] = [];
                          if (!hasGroupA && !hasGroupB) missingGroups.push('收货信息（A组门店或B组收件人）');
                          if (!hasItemCode) missingGroups.push('SKU物品编码');
                          if (!hasItemName) missingGroups.push('SKU物品名称');
                          if (!hasQuantity) missingGroups.push('SKU发货数量');
                          if (missingGroups.length > 0) {
                            return (
                              <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-800">
                                ❌ 规则缺少以下关键字段映射：{missingGroups.join('、')}。
                                请点击"编辑规则"补充，否则解析后将全部报错！
                              </div>
                            );
                          }
                          return null;
                        })()}
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
                  <h3 className="text-lg font-medium mb-2">规则编辑器</h3>
                  <p className="text-xs text-gray-500 mb-4">在此编辑规则 JSON → 点击「测试解析」验证效果 → 确认正确后点击「保存到规则库」持久化。</p>
                  <textarea value={editingRuleJson} onChange={e => setEditingRuleJson(e.target.value)}
                    className="w-full h-96 font-mono text-sm border border-gray-300 rounded-lg p-3 focus:outline-none focus:ring-2"
                    style={{ boxShadow: `0 0 0 2px ${JT_PRIMARY}33` }} />
                  {editingRuleTestResult && (
                    <div className={`mt-4 rounded-lg border p-3 text-sm ${editingRuleTestResult.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                      {editingRuleTestResult.success ? (
                        <>
                          <div className="font-medium text-green-700">
                            {editingRuleTestResult.message || `测试成功，共解析 ${editingRuleTestResult.totalRows} 条`}
                          </div>
                          {editingRuleTestResult.orders && (
                            <div className="mt-2 overflow-x-auto max-h-48">
                              <table className="w-full text-xs">
                                <thead className="bg-green-100">
                                  <tr>
                                    <th className="px-2 py-1 text-left">门店/收件人</th>
                                    <th className="px-2 py-1 text-left">商品</th>
                                    <th className="px-2 py-1 text-left">数量</th>
                                    <th className="px-2 py-1 text-left">编码</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {editingRuleTestResult.orders?.slice(0, 5).map((o: any, i: number) => (
                                    <tr key={i} className="border-t border-green-100">
                                      <td className="px-2 py-1">{o.storeName || o.receiverName || '-'}</td>
                                      <td className="px-2 py-1">{o.itemName || '-'}</td>
                                      <td className="px-2 py-1">{o.quantity ?? '-'}</td>
                                      <td className="px-2 py-1">{o.itemCode || '-'}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </>
                      ) : (
                        <div>
                          <div className="font-medium text-red-700">校验失败</div>
                          <pre className="mt-2 text-xs text-red-600 whitespace-pre-wrap">{editingRuleTestResult.error || '未知错误'}</pre>
                        </div>
                      )}
                      {/* 警告信息 */}
                      {editingRuleTestResult.warnings && editingRuleTestResult.warnings.length > 0 && (
                        <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-800">
                          <div className="font-medium">⚠️ 警告：</div>
                          {editingRuleTestResult.warnings.map((w: any, i: number) => (
                            <div key={i} className="ml-2">• [{w.field}] {w.message}</div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  <div className="flex gap-3 mt-4 justify-end flex-wrap">
                    <button onClick={() => setEditingRuleIndex(null)} className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200">取消</button>
                    <button onClick={handleValidateRule}
                      className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200">
                      校验结构
                    </button>
                    <button onClick={testRuleJsonOnCurrentFile} disabled={testingEditedRule}
                      className="px-4 py-2 rounded-lg disabled:opacity-50"
                      style={{ color: JT_PRIMARY, backgroundColor: JT_PRIMARY_LIGHT }}>
                      {testingEditedRule ? '测试中...' : '测试解析'}
                    </button>
                    <button onClick={handleSaveRule} className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200">保存到当前文件</button>
                    <button onClick={async () => {
                      // 先保存到当前文件，再保存到规则库
                      handleSaveRule();
                      if (editingRuleIndex !== null) {
                        await handleSaveRuleToDB(editingRuleIndex);
                      }
                    }} className="px-4 py-2 text-white rounded-lg" style={{ backgroundColor: JT_PRIMARY }}>保存到规则库</button>
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-[220px,minmax(0,1fr)] gap-4">
              <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                <h4 className="text-sm font-semibold text-gray-900">进入解析前确认</h4>
                <ul className="mt-3 space-y-2 text-xs text-gray-600 leading-5">
                  <li>• 关键字段映射完整（门店/收件人、SKU、数量）</li>
                  <li>• 中低置信度字段已人工确认</li>
                  <li>• 当前规则已可测试通过或可接受回退策略</li>
                </ul>
              </div>
              <div className="flex gap-4">
                <button onClick={handleBackToUpload} className="px-6 py-3 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 transition-colors">← 返回修改</button>
                <button onClick={handleParseAll} disabled={parsing || analyzedFiles.every(f => !f.rule)}
                  className="flex-1 px-6 py-3 text-white rounded-xl font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  style={{ backgroundColor: parsing || analyzedFiles.every(f => !f.rule) ? '#bfbfbf' : JT_PRIMARY }}>
                  {parsing ? (
                    <div className="flex items-center justify-center gap-2">
                      <Loading size="sm" />
                      <span>{parseProgressText || `解析中${workerSupported ? '(Worker)' : ''}... ${Math.round(progress)}%`}</span>
                    </div>
                  ) : '确认并开始解析'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 步骤4：解析结果 */}
        {step === 'result' && (
          <div className="space-y-4">
            {/* 结果概览 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
              <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                <div className="text-xs text-gray-500">解析总数</div>
                <div className="mt-2 text-2xl font-semibold text-gray-900">{orders.length}</div>
                <div className="mt-1 text-xs text-gray-400">当前结果池中的全部记录</div>
              </div>
              <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                <div className="text-xs text-gray-500">有效记录</div>
                <div className="mt-2 text-2xl font-semibold" style={{ color: JT_SUCCESS }}>{orders.length - invalidOrdersCount}</div>
                <div className="mt-1 text-xs text-gray-400">满足校验，可直接提交</div>
              </div>
              <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                <div className="text-xs text-gray-500">待修正</div>
                <div className="mt-2 text-2xl font-semibold" style={{ color: invalidOrdersCount > 0 ? JT_DANGER : '#262626' }}>{invalidOrdersCount}</div>
                <div className="mt-1 text-xs text-gray-400">缺字段、格式错误或业务校验未通过</div>
              </div>
              <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                <div className="text-xs text-gray-500">重复单号</div>
                <div className="mt-2 text-2xl font-semibold" style={{ color: duplicateNos.length > 0 ? JT_WARNING : '#262626' }}>{duplicateNos.length}</div>
                <div className="mt-1 text-xs text-gray-400">含批次内重复和库内重复</div>
              </div>
            </div>

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
            <div className="sticky top-14 sm:top-16 z-30 space-y-3">
              <div
                className="rounded-2xl border p-4 shadow-sm"
                style={{
                  borderColor: invalidOrdersCount > 0 || duplicateNos.length > 0 ? '#ffe58f' : '#b7eb8f',
                  backgroundColor: invalidOrdersCount > 0 || duplicateNos.length > 0 ? '#fffbe6' : '#f6ffed',
                }}
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div
                      className="text-sm font-semibold"
                      style={{ color: invalidOrdersCount > 0 || duplicateNos.length > 0 ? '#ad6800' : '#237804' }}
                    >
                      {invalidOrdersCount > 0 || duplicateNos.length > 0 ? '提交前仍有风险项待确认' : '结果已通过主要校验，可进入提交流程'}
                    </div>
                    <p className="mt-1 text-xs sm:text-sm text-gray-600">
                      {invalidOrdersCount > 0
                        ? `当前有 ${invalidOrdersCount} 条异常记录，建议优先修正；也可仅提交 ${orders.filter(o => o.isValid).length} 条有效数据。`
                        : duplicateNos.length > 0
                          ? `当前无校验错误，但存在 ${duplicateNos.length} 个重复单号，请确认是否允许继续提交。`
                          : '建议先导出留档，再提交到批量下单流程。'}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs sm:flex sm:flex-wrap">
                    <div className="rounded-xl border border-white/80 bg-white px-3 py-2 text-gray-600">有效 <span className="ml-1 font-semibold" style={{ color: JT_SUCCESS }}>{orders.length - invalidOrdersCount}</span></div>
                    <div className="rounded-xl border border-white/80 bg-white px-3 py-2 text-gray-600">异常 <span className="ml-1 font-semibold" style={{ color: invalidOrdersCount > 0 ? JT_DANGER : '#262626' }}>{invalidOrdersCount}</span></div>
                    <div className="rounded-xl border border-white/80 bg-white px-3 py-2 text-gray-600">重复 <span className="ml-1 font-semibold" style={{ color: duplicateNos.length > 0 ? JT_WARNING : '#262626' }}>{duplicateNos.length}</span></div>
                    <div className="rounded-xl border border-white/80 bg-white px-3 py-2 text-gray-600">已选 <span className="ml-1 font-semibold text-gray-900">{selectedOrdersCount}</span></div>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-gray-200 p-3 sm:p-4 shadow-sm">
                <div className="flex flex-col gap-3 sm:gap-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={handleExport}
                      disabled={orders.length === 0}
                      className="px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium disabled:opacity-50 transition-colors shrink-0"
                      style={{ color: JT_PRIMARY, backgroundColor: JT_PRIMARY_LIGHT }}
                    >
                      导出结果
                    </button>
                    <button
                      onClick={handleSubmitOrders}
                      disabled={orders.length === 0 || submitting}
                      className="px-3 sm:px-4 py-1.5 sm:py-2 text-white rounded-lg text-xs sm:text-sm font-medium disabled:opacity-50 transition-colors shrink-0 min-w-[92px]"
                      style={{ backgroundColor: JT_PRIMARY }}
                    >
                      {submitting ? `提交中 ${submitProgress}%` : '提交全部'}
                    </button>
                    {invalidOrdersCount > 0 && (
                      <button
                        onClick={() => {
                          const validOrders = orders.filter(o => o.isValid);
                          if (validOrders.length === 0) {
                            showToast('error', '没有可提交的有效数据');
                            return;
                          }
                          if (!confirm(`仅提交 ${validOrders.length} 条有效数据（跳过 ${invalidOrdersCount} 条异常），确定继续吗？`)) return;
                          submitValidOrdersOnly(validOrders);
                        }}
                        disabled={submitting}
                        className="px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium disabled:opacity-50 transition-colors shrink-0"
                        style={{ color: '#ad6800', backgroundColor: '#fff7e6' }}
                      >
                        仅提交有效数据
                      </button>
                    )}
                    {submitting && submitProgress > 0 && (
                      <div className="w-full lg:w-80">
                        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div className="h-full transition-all duration-300" style={{ width: `${submitProgress}%`, backgroundColor: JT_PRIMARY }} />
                        </div>
                        {submitProgressText && <p className="mt-1 text-xs text-gray-600">{submitProgressText}</p>}
                      </div>
                    )}
                    <button
                      onClick={handleDeleteSelected}
                      disabled={selectedIndices.length === 0}
                      className="hidden xs:inline-flex px-3 sm:px-4 py-1.5 sm:py-2 bg-red-500 text-white rounded-lg text-xs sm:text-sm font-medium hover:bg-red-600 disabled:opacity-50 transition-colors items-center gap-1 shrink-0"
                    >
                      🗑️ <span className="hidden sm:inline">删除</span>({selectedIndices.length})
                    </button>
                    <button
                      onClick={handleSaveToDB}
                      disabled={orders.length === 0 || saving}
                      className="hidden sm:inline-flex px-3 sm:px-4 py-1.5 sm:py-2 text-white rounded-lg text-xs sm:text-sm font-medium disabled:opacity-50 transition-colors shrink-0"
                      style={{ backgroundColor: JT_NAVY }}
                    >
                      {saving ? '保存中...' : '保存批次'}
                    </button>
                    <button
                      onClick={handleRestart}
                      className="hidden md:inline-flex px-3 sm:px-4 py-1.5 sm:py-2 bg-gray-100 text-gray-700 rounded-lg text-xs sm:text-sm font-medium hover:bg-gray-200 transition-colors shrink-0"
                    >
                      继续导入
                    </button>
                    <div className="xs:hidden flex items-center gap-1 ml-auto">
                      <button onClick={() => setShowMoreActions(!showMoreActions)} className="p-1.5 text-gray-500 hover:bg-gray-100 rounded-lg" aria-label="更多操作">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01"/></svg>
                      </button>
                    </div>
                  </div>

                  {showMoreActions && (
                    <div className="xs:flex hidden flex-wrap gap-2 pt-2 border-t border-gray-100">
                      {selectedIndices.length > 0 && (
                        <button onClick={handleDeleteSelected} className="px-3 py-1.5 bg-red-500 text-white rounded-lg text-xs font-medium hover:bg-red-600">🗑️ 删除({selectedIndices.length})</button>
                      )}
                      {invalidOrdersCount > 0 && (
                        <button
                          onClick={() => {
                            const validOrders = orders.filter(o => o.isValid);
                            if (validOrders.length === 0) {
                              showToast('error', '没有可提交的有效数据');
                              return;
                            }
                            if (!confirm(`仅提交 ${validOrders.length} 条有效数据（跳过 ${invalidOrdersCount} 条异常），确定继续吗？`)) return;
                            submitValidOrdersOnly(validOrders);
                          }}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium"
                          style={{ color: '#ad6800', backgroundColor: '#fff7e6' }}
                        >
                          仅提交有效
                        </button>
                      )}
                      <button onClick={handleSaveToDB} disabled={orders.length === 0 || saving} className="px-3 py-1.5 text-white rounded-lg text-xs font-medium disabled:opacity-50" style={{ backgroundColor: JT_NAVY }}>{saving ? '...' : '保存批次'}</button>
                      <button onClick={handleRestart} className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-xs font-medium hover:bg-gray-200">继续导入</button>
                    </div>
                  )}

                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-4">
                    <div className="relative flex-1 min-w-0">
                      <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                        placeholder="搜索运单号、收货人、电话..."
                        className="w-full sm:w-64 lg:w-80 pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:border-transparent"
                        style={{ boxShadow: `0 0 0 2px ${JT_PRIMARY}33` }} />
                      <svg className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                    </div>
                    <div className="text-sm text-gray-600">
                      {orders.length > 0 && (
                        <>
                          共 <span className="font-medium" style={{ color: JT_PRIMARY }}>{totalCount}</span> 条
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
                            className={`w-8 h-8 rounded text-sm ${currentPage === page ? 'text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                            style={currentPage === page ? { backgroundColor: JT_PRIMARY } : undefined}>
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
                        className="px-5 py-2 text-white rounded-lg text-sm transition-colors"
                        style={{ backgroundColor: JT_PRIMARY }}
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
        {step === 'history' && <HistoryView onBack={() => handleStepChange('upload')} />}

        {/* 规则管理库 */}
        {step === 'rules' && <RulesManager onBack={() => handleStepChange('upload')} onRulesChanged={loadSavedRules} onSelectRule={(rule) => {
          // 应用规则到第一个未分析的文件
          const firstUnanalyzed = analyzedFiles.findIndex(f => !f.rule);
          if (firstUnanalyzed >= 0) {
            setAnalyzedFiles(prev => prev.map((f, i) => i === firstUnanalyzed ? { ...f, rule, ruleOrigin: 'saved', selectedRuleId: null } : f));
            showToast('success', `规则"${rule.name}"已应用到文件`);
            handleStepChange('confirm');
          } else {
            showToast('info', '规则已选择，请先上传文件再应用');
            handleStepChange('upload');
          }
        }} />}
      </main>
    </div>
  );
}

// ==================== 规则管理组件 ====================
function RulesManager({ onBack, onSelectRule, onRulesChanged }: { onBack: () => void; onSelectRule: (rule: ParseRule) => void; onRulesChanged?: () => void }) {
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
  const [isCreating, setIsCreating] = useState(false); // 是否正在创建新规则

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
      onRulesChanged?.();
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
    if (!editJson.trim()) { showToast('warning', '规则JSON不能为空'); return; }
    try {
      const ruleJson = JSON.parse(editJson);
      const isNew = isCreating || !editingRule;
      const url = '/api/rules';
      const method = isNew ? 'POST' : 'PUT';
      const body: any = {
        name: editName || ruleJson.name || '新规则',
        description: editDesc || ruleJson.description || '',
        fileTypes: ruleJson.fileTypes || ['excel', 'pdf', 'word'],
        ruleJson,
        isAiGenerated: false,
      };
      if (!isNew && editingRule) body.id = editingRule.id;

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.success) {
        showToast('success', isNew ? '规则已创建' : '规则已更新');
        onRulesChanged?.();
        setIsCreating(false);
        setEditingRule(null);
        loadRules();
      } else { showToast('error', data.error || (isNew ? '创建失败' : '更新失败')); }
    } catch (e: any) { showToast('error', `JSON格式错误: ${e.message}`); }
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
      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="px-4 sm:px-5 py-4 border-b border-gray-100 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <button onClick={onBack} className="text-sm shrink-0" style={{ color: JT_PRIMARY }}>← 返回导入</button>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-lg font-semibold text-gray-900 truncate">规则库</h3>
                <span className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium" style={{ color: JT_PRIMARY, backgroundColor: JT_PRIMARY_LIGHT }}>
                  {rules.length} 条规则
                </span>
              </div>
              <p className="mt-1 text-sm text-gray-500">集中管理 AI 生成规则与人工维护规则，支持搜索、复制、测试和直接应用。</p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 w-full lg:w-auto">
            <input type="text" value={searchText} onChange={e => setSearchText(e.target.value)}
              placeholder="搜索规则名称或描述..."
              className="w-full sm:w-64 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2"
              style={{ boxShadow: `0 0 0 2px ${JT_PRIMARY}33` }} />
            <button onClick={() => {
              setIsCreating(true);
              setEditingRule(null);
              setEditName('');
              setEditDesc('');
              setEditJson(JSON.stringify({
                name: '新规则',
                description: '请输入描述',
                fileTypes: ['excel'],
                identifier: {},
                parser: {
                  type: 'table',
                  table: { headerRow: 'auto', dataStartRow: 'auto', columns: [] }
                },
                recipient: {
                  source: 'header',
                  fields: {}
                }
              }, null, 2));
            }} className="w-full sm:w-auto px-4 py-2 text-white rounded-lg text-sm whitespace-nowrap"
              style={{ backgroundColor: JT_PRIMARY }}>
              新建规则
            </button>
          </div>
        </div>
        <div className="px-4 sm:px-5 py-4 grid grid-cols-1 md:grid-cols-3 gap-3 text-xs text-gray-600 bg-gray-50">
          <div className="rounded-xl border border-gray-200 bg-white px-3 py-2">规则总数 <span className="ml-1 font-semibold text-gray-900">{rules.length}</span></div>
          <div className="rounded-xl border border-gray-200 bg-white px-3 py-2">当前筛选 <span className="ml-1 font-semibold text-gray-900">{filtered.length}</span></div>
          <div className="rounded-xl border border-gray-200 bg-white px-3 py-2">推荐动作 <span className="ml-1 font-semibold" style={{ color: JT_PRIMARY }}>测试后再应用</span></div>
        </div>
      </div>

      {loading ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-10 text-center shadow-sm">
          <Loading size="md" />
          <p className="mt-4 text-gray-500">正在加载规则库...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-10 text-center shadow-sm">
          <div className="text-4xl mb-3">📭</div>
          <p className="text-base font-medium text-gray-700">当前没有匹配的规则</p>
          <p className="text-sm text-gray-500 mt-2">可以在“确认规则”阶段保存 AI 生成规则，或在这里直接新建一条通用规则。</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {filtered.map(rule => (
            <div key={rule.id} className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="text-base font-semibold text-gray-900 truncate">{rule.name}</h4>
                    {rule.isAiGenerated && <span className="text-xs px-2 py-0.5 rounded-full" style={{ color: JT_PRIMARY, backgroundColor: JT_PRIMARY_LIGHT }}>AI生成</span>}
                  </div>
                  <p className="text-sm text-gray-500 mt-1 line-clamp-2">{rule.description || '暂无描述'}</p>
                </div>
                <div className="text-right shrink-0 text-xs text-gray-400">
                  <div>使用 {rule.usageCount} 次</div>
                  <div className="mt-1">{new Date(rule.updatedAt).toLocaleDateString('zh-CN')}</div>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2 text-xs text-gray-500">
                <span className="px-2.5 py-1 rounded-full bg-gray-100 text-gray-700">{Array.isArray(rule.ruleJson?.parser?.type) ? rule.ruleJson.parser.type.join('/') : (rule.ruleJson?.parser?.type || '未知')}</span>
                <span className="px-2.5 py-1 rounded-full bg-gray-100 text-gray-700">{(rule.fileTypes || []).join(' / ')}</span>
                <span className="px-2.5 py-1 rounded-full bg-gray-100 text-gray-700">规则可复用</span>
              </div>

              <div className="mt-4 grid grid-cols-2 sm:flex sm:flex-wrap gap-2">
                <button onClick={() => {
                  setIsCreating(true);
                  setEditingRule(null);
                  setEditName(rule.name + '（副本）');
                  setEditDesc(rule.description || '');
                  setEditJson(JSON.stringify(rule.ruleJson, null, 2));
                }} className="px-3 py-2 text-xs rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200">复制</button>
                <button onClick={() => handleEditOpen(rule)} className="px-3 py-2 text-xs rounded-lg" style={{ color: JT_PRIMARY, backgroundColor: JT_PRIMARY_LIGHT }}>编辑</button>
                <button onClick={() => { setTestingRule(rule); setTestFile(null); setTestResult(null); }} className="px-3 py-2 text-xs rounded-lg bg-green-50 text-green-700 hover:bg-green-100">测试</button>
                <button onClick={() => onSelectRule(rule.ruleJson)} className="px-3 py-2 text-xs rounded-lg text-white" style={{ backgroundColor: JT_PRIMARY }}>应用到当前文件</button>
                <button onClick={() => handleDelete(rule.id)} className="px-3 py-2 text-xs rounded-lg bg-red-50 text-red-600 hover:bg-red-100">删除</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {(editingRule || isCreating) && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-4 sm:p-6 w-full max-w-3xl max-h-[90vh] overflow-auto shadow-2xl">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">{isCreating ? '新建规则' : '编辑规则'}</h3>
                <p className="text-sm text-gray-500 mt-1">建议先补齐说明，再保存规则 JSON，最后用真实文件测试。</p>
              </div>
              <button onClick={() => { setIsCreating(false); setEditingRule(null); }} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <div className="space-y-4 mb-5">
              <div>
                <label className="block text-xs text-gray-500 mb-1">规则名称</label>
                <input type="text" value={editName} onChange={e => setEditName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2"
                  style={{ boxShadow: `0 0 0 2px ${JT_PRIMARY}33` }} />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">描述</label>
                <input type="text" value={editDesc} onChange={e => setEditDesc(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2"
                  style={{ boxShadow: `0 0 0 2px ${JT_PRIMARY}33` }} />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">规则JSON</label>
                <textarea value={editJson} onChange={e => setEditJson(e.target.value)}
                  className="w-full h-80 font-mono text-sm border border-gray-300 rounded-lg p-3 focus:outline-none focus:ring-2"
                  style={{ boxShadow: `0 0 0 2px ${JT_PRIMARY}33` }} />
              </div>
            </div>
            <div className="flex gap-3 justify-end flex-wrap">
              <button onClick={() => { setIsCreating(false); setEditingRule(null); }} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">取消</button>
              <button onClick={handleEditSave} className="px-4 py-2 text-white rounded-lg" style={{ backgroundColor: JT_PRIMARY }}>{isCreating ? '创建规则' : '保存变更'}</button>
            </div>
          </div>
        </div>
      )}

      {testingRule && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-4 sm:p-6 w-full max-w-2xl max-h-[90vh] overflow-auto shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">规则测试 · {testingRule.name}</h3>
                <p className="text-sm text-gray-500 mt-1">上传一份样例文件，验证当前规则的解析效果。</p>
              </div>
              <button onClick={() => setTestingRule(null)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <div className="mb-4 rounded-xl border border-gray-200 bg-gray-50 p-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">选择测试文件</label>
              <input type="file" accept=".xlsx,.xls,.csv,.pdf,.docx,.doc"
                onChange={e => { setTestFile(e.target.files?.[0] || null); setTestResult(null); }}
                className="block w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium"
                style={{ color: '#6b7280' }} />
              {testFile && <p className="text-xs text-gray-500 mt-2">已选择: {testFile.name} ({(testFile.size / 1024).toFixed(1)} KB)</p>}
            </div>
            <button onClick={handleTestRule} disabled={!testFile || testing}
              className="w-full py-2.5 text-white rounded-lg disabled:opacity-50 mb-4"
              style={{ backgroundColor: JT_PRIMARY }}>
              {testing ? <span className="flex items-center justify-center gap-2"><Loading size="sm" /> 测试中...</span> : '开始测试'}
            </button>

            {testResult && (
              <div className={`rounded-2xl p-4 ${testResult.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                {testResult.success ? (
                  <>
                    <p className="font-medium text-green-800 mb-2">测试成功，解析 {testResult.totalRows} 条数据</p>
                    <div className="overflow-x-auto max-h-56">
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
                      {testResult.totalRows > 5 && <p className="text-xs text-green-600 mt-2 text-center">仅显示前5条，共 {testResult.totalRows} 条</p>}
                    </div>
                  </>
                ) : (
                  <p className="text-red-700">测试失败: {testResult.error}</p>
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
  const [filterField, setFilterField] = useState<'all' | 'orderNo' | 'receiver' | 'submitTime'>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  useEffect(() => {
    fetch('/api/import-orders?action=batches')
      .then(res => res.json())
      .then(data => { if (data.success) setBatches(data.batches); })
      .finally(() => setLoading(false));
  }, []);

  const loadBatchOrders = async (batchId: number) => {
    setSelectedBatch(batchId);
    setOrderPage(1);
    const res = await fetch(`/api/import-orders?batchId=${batchId}&pageSize=100`);
    const data = await res.json();
    if (data.success) setBatchOrders(data.orders || []);
  };

  const matchesDateRange = useCallback((dateValue?: string) => {
    if (!dateFrom && !dateTo) return true;
    if (!dateValue) return false;

    const target = new Date(dateValue);
    if (Number.isNaN(target.getTime())) return false;

    const fromOk = !dateFrom || target >= new Date(`${dateFrom}T00:00:00`);
    const toOk = !dateTo || target <= new Date(`${dateTo}T23:59:59`);
    return fromOk && toOk;
  }, [dateFrom, dateTo]);

  // 批次筛选
  const filteredBatches = batches.filter((batch: any) => {
    const textMatched = !searchText.trim() || (() => {
      const q = searchText.toLowerCase();
      if (filterField === 'submitTime') {
        return new Date(batch.created_at).toLocaleString('zh-CN').toLowerCase().includes(q);
      }
      return (batch.file_name || '').toLowerCase().includes(q) ||
             (batch.rule_name || '').toLowerCase().includes(q) ||
             String(batch.total_rows).includes(q);
    })();

    return textMatched && matchesDateRange(batch.created_at);
  });

  // 运单详情筛选
  const filteredOrders = batchOrders.filter((order: any) => {
    if (!selectedBatch) return true;
    const textMatched = !searchText.trim() || (() => {
      const q = searchText.toLowerCase();
      switch (filterField) {
        case 'orderNo':
          return (order.order_no || '').toLowerCase().includes(q);
        case 'receiver':
          return (order.receiver_name || '').toLowerCase().includes(q) ||
                 (order.store_name || '').toLowerCase().includes(q);
        case 'submitTime':
          return new Date(order.created_at || '').toLocaleString('zh-CN').toLowerCase().includes(q);
        default:
          return (order.order_no || '').toLowerCase().includes(q) ||
                 (order.receiver_name || '').toLowerCase().includes(q) ||
                 (order.item_name || '').toLowerCase().includes(q);
      }
    })();

    return textMatched && matchesDateRange(order.created_at);
  });

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-10 text-center shadow-sm">
        <Loading size="md" />
        <p className="mt-4 text-gray-500">正在加载历史记录...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-4 sm:px-5 py-4 border-b border-gray-100 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-lg font-semibold text-gray-900">历史导入记录</h3>
              <span className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium" style={{ color: JT_PRIMARY, backgroundColor: JT_PRIMARY_LIGHT }}>
                {filteredBatches.length} 个批次
              </span>
            </div>
            <p className="mt-1 text-sm text-gray-500">支持按文件名、收件人、提交时间和日期范围快速回查导入结果。</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => { setSearchText(''); setFilterField('all'); setDateFrom(''); setDateTo(''); setOrderPage(1); }}
              className="px-3 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 whitespace-nowrap"
            >
              清空筛选
            </button>
            <button onClick={onBack} className="px-3 py-2 text-sm whitespace-nowrap rounded-lg" style={{ color: JT_PRIMARY, backgroundColor: JT_PRIMARY_LIGHT }}>← 返回导入</button>
          </div>
        </div>

        <div className="px-4 sm:px-5 py-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3 border-b border-gray-100 bg-gray-50">
          <input
            type="text"
            placeholder="搜索（编码/收件人/文件名/提交时间）..."
            value={searchText}
            onChange={e => { setSearchText(e.target.value); setOrderPage(1); }}
            className="xl:col-span-2 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2"
            style={{ boxShadow: `0 0 0 2px ${JT_PRIMARY}33` }}
          />
          <select
            value={filterField}
            onChange={e => { setFilterField(e.target.value as any); setOrderPage(1); }}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1"
            style={{ boxShadow: `0 0 0 2px ${JT_PRIMARY}33` }}
          >
            <option value="all">全部字段</option>
            <option value="orderNo">外部编码</option>
            <option value="receiver">收件人/门店</option>
            <option value="submitTime">提交时间</option>
          </select>
          <input
            type="date"
            value={dateFrom}
            onChange={e => { setDateFrom(e.target.value); setOrderPage(1); }}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1"
            style={{ boxShadow: `0 0 0 2px ${JT_PRIMARY}33` }}
            title="开始日期"
          />
          <input
            type="date"
            value={dateTo}
            onChange={e => { setDateTo(e.target.value); setOrderPage(1); }}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1"
            style={{ boxShadow: `0 0 0 2px ${JT_PRIMARY}33` }}
            title="结束日期"
          />
        </div>

        <div className="px-4 sm:px-5 py-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs text-gray-600">
          <div className="rounded-xl border border-gray-200 bg-white px-3 py-2">历史批次 <span className="ml-1 font-semibold text-gray-900">{batches.length}</span></div>
          <div className="rounded-xl border border-gray-200 bg-white px-3 py-2">筛选结果 <span className="ml-1 font-semibold text-gray-900">{filteredBatches.length}</span></div>
          <div className="rounded-xl border border-gray-200 bg-white px-3 py-2">已选批次 <span className="ml-1 font-semibold text-gray-900">{selectedBatch || '-'}</span></div>
          <div className="rounded-xl border border-gray-200 bg-white px-3 py-2">当前明细 <span className="ml-1 font-semibold text-gray-900">{filteredOrders.length}</span></div>
        </div>
      </div>

      {batches.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-10 text-center shadow-sm">
          <div className="text-4xl mb-3">🗂️</div>
          <p className="text-base font-medium text-gray-700">暂无导入记录</p>
          <p className="text-sm text-gray-500 mt-2">后续完成批量导入后，这里会沉淀每个批次的文件、规则和提交明细。</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-[360px,minmax(0,1fr)] gap-4 items-start">
          <div className="space-y-3 xl:sticky xl:top-24">
            {filteredBatches.map((batch: any) => (
              <div key={batch.id}
                className={`rounded-2xl border p-4 cursor-pointer transition-all shadow-sm ${selectedBatch === batch.id ? 'border-blue-300 bg-blue-50' : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-md'}`}
                onClick={() => loadBatchOrders(batch.id)}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-gray-900 truncate">{batch.file_name}</div>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-gray-500">
                      <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">{batch.file_type}</span>
                      {batch.rule_name && <span className="px-2 py-0.5 rounded-full" style={{ color: JT_PRIMARY, backgroundColor: JT_PRIMARY_LIGHT }}>{batch.rule_name}</span>}
                    </div>
                  </div>
                  <span className="text-xs text-gray-500 shrink-0">#{batch.id}</span>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                  <div className="rounded-xl bg-white/90 border border-gray-200 px-3 py-2 text-gray-600">总数 <span className="ml-1 font-semibold text-gray-900">{batch.total_rows}</span></div>
                  <div className="rounded-xl bg-white/90 border border-gray-200 px-3 py-2 text-gray-600">成功 <span className="ml-1 font-semibold text-green-600">{batch.success_rows}</span></div>
                  <div className="rounded-xl bg-white/90 border border-gray-200 px-3 py-2 text-gray-600">异常 <span className="ml-1 font-semibold text-red-600">{batch.error_rows}</span></div>
                </div>
                <div className="mt-3 text-xs text-gray-500">提交时间：{new Date(batch.created_at).toLocaleString('zh-CN')}</div>
              </div>
            ))}
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-5 shadow-sm min-h-[240px]">
            {selectedBatch && batchOrders.length > 0 ? (
              <>
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between mb-4">
                  <div>
                    <h4 className="text-base font-semibold text-gray-900">批次 #{selectedBatch} 运单详情</h4>
                    <p className="text-sm text-gray-500 mt-1">
                      共 {filteredOrders.length} 条记录{filteredOrders.length !== batchOrders.length && `（原始 ${batchOrders.length} 条）`}
                      {searchText && <span className="ml-2">当前已按筛选条件过滤</span>}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <span>每页</span>
                    <select
                      value={orderPageSize}
                      onChange={e => { setOrderPageSize(Number(e.target.value)); setOrderPage(1); }}
                      className="px-2 py-1 text-sm border border-gray-300 rounded-lg"
                    >
                      <option value={10}>10条</option>
                      <option value={20}>20条</option>
                      <option value={50}>50条</option>
                      <option value={100}>100条</option>
                    </select>
                  </div>
                </div>
                <div className="overflow-x-auto rounded-xl border border-gray-200">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-3 text-left text-xs font-medium text-gray-500">外部编码</th>
                        <th className="px-3 py-3 text-left text-xs font-medium text-gray-500">收货门店</th>
                        <th className="px-3 py-3 text-left text-xs font-medium text-gray-500">收件人</th>
                        <th className="px-3 py-3 text-left text-xs font-medium text-gray-500">电话</th>
                        <th className="px-3 py-3 text-left text-xs font-medium text-gray-500">SKU编码</th>
                        <th className="px-3 py-3 text-left text-xs font-medium text-gray-500">SKU名称</th>
                        <th className="px-3 py-3 text-left text-xs font-medium text-gray-500">数量</th>
                        <th className="px-3 py-3 text-left text-xs font-medium text-gray-500">提交时间</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white">
                      {filteredOrders
                        .slice((orderPage - 1) * orderPageSize, orderPage * orderPageSize)
                        .map((order: any) => (
                        <tr key={order.id} className="hover:bg-gray-50">
                          <td className="px-3 py-2.5 font-mono text-xs">{order.order_no || '-'}</td>
                          <td className="px-3 py-2.5">{order.store_name || '-'}</td>
                          <td className="px-3 py-2.5">{order.receiver_name || '-'}</td>
                          <td className="px-3 py-2.5">{order.receiver_phone || '-'}</td>
                          <td className="px-3 py-2.5 font-mono text-xs">{order.item_code || '-'}</td>
                          <td className="px-3 py-2.5">{order.item_name || '-'}</td>
                          <td className="px-3 py-2.5">{order.quantity ?? '-'}</td>
                          <td className="px-3 py-2.5 text-xs text-gray-500">{order.created_at ? new Date(order.created_at).toLocaleString('zh-CN') : '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {Math.ceil(filteredOrders.length / orderPageSize) > 1 && (
                  <div className="flex items-center justify-center gap-2 mt-4">
                    <button
                      onClick={() => setOrderPage(p => Math.max(1, p - 1))}
                      disabled={orderPage === 1}
                      className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                    >
                      ← 上一页
                    </button>
                    <span className="text-sm text-gray-600">
                      第 {orderPage} / {Math.ceil(filteredOrders.length / orderPageSize)} 页
                    </span>
                    <button
                      onClick={() => setOrderPage(p => Math.min(Math.ceil(filteredOrders.length / orderPageSize), p + 1))}
                      disabled={orderPage >= Math.ceil(filteredOrders.length / orderPageSize)}
                      className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                    >
                      下一页 →
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div className="h-full min-h-[220px] flex flex-col items-center justify-center text-center text-gray-500">
                <div className="text-4xl mb-3">🧾</div>
                <p className="text-base font-medium text-gray-700">请选择左侧批次查看详情</p>
                <p className="text-sm text-gray-500 mt-2">这里会展示对应批次的运单明细、SKU 和提交时间，便于回查。</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
