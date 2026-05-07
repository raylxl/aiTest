'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import type { WaybillRow, ValidationError, Waybill } from '@/lib/waybill-types';
import { SYSTEM_FIELDS, TEMP_LAYER_OPTIONS } from '@/lib/waybill-types';

// ============ SVG 图标 ============
function Icon({ name, size = 14 }: { name: string; size?: number }) {
  const paths: Record<string, string> = {
    upload: 'M832 192v640q0 17-7 24t-24 7H176q-17 0-24-7t-7-24V192q0-17 7-24t24-7h656q17 0 24 7t7 24zm-352 448V320q0-26-19-45t-45-19-45 19-19 45v352l288-160q14-7 29-7 16 0 29 7l352 192q22 13 22 31 0 19-19 38-19 17-45 17t-45-19l-64-32v32q0 26-19 45t-45 19-45-19-19-45z',
    check: 'M896 166H128c-17 0-30 13-30 30v32c0 17 13 30 30 30h768c17 0 30-13 30-30v-32c0-17-13-30-30-30zm0-166H128c-88 0-160 72-160 160v32c0 88 72 160 160 160h768c88 0 160-72 160-160v-32c0-88-72-160-160-160z',
    close: 'M810 274l-238 238 238 238L608 810 370 572l238-238-238-238L274 240l238-238L370-2 608 236l238-238z',
    refresh: 'M724 218.3V141c0-6.7-7.7-10.4-12.9-6.3L260.3 486.8a31.75 31.75 0 0 0 50.3l450.8 352.1c5.3 3.1 12.9.4 12.9-6.3v-77.3a304 304 0 0 1 273-298.2c91.3-12.5 160 60.4 160 144 0 54.7-29.1 99.5-72.1 126.6-6.4 4-8.5 12.2-4.5 18.1l66.8 92.8c4 5.5 12 6.9 17.8 3.1a144 144 0 0 0 96.1-134.4c3.7-54.4-27.3-105.4-71.4-126C771.5 251.5 748 218.3 724 218.3z',
    delete: 'M864 256H736v-64c0-35.2-28.8-64-64-64H352c-35.2 0-64 28.8-64 64v64H160c-44.2 0-80 35.8-80 80v32c0 17.7 14.3 32 32 32h640c17.7 0 32-14.3 32-32v-32c0-44.2-35.8-80-80-80zm-96-64V64c0-17.7 14.3-32 32-32h320c17.7 0 32 14.3 32 32v128c0 17.7-14.3 32-32 32H800c-17.7 0-32-14.3-32-32z',
    plus: 'M480-64v448h-64v64h448v-64h-64V-64h-64v448H544v-64H480z',
    download: 'M864 256v448q0 26-19 45t-45 19H224q-26 0-45-19t-19-45V256q0-26 19-45t45-19h224q13 0 22 9.5t9 22.5v128h224V320q0-13 9.5-22.5T768 288H544v192q0 26-19 45t-45 19H256q-13 0-22-9.5T224 704V544h544q13 0 22 9.5t9 22.5v352q0 13-9.5 22.5T768 928H288q-39 0-56-31t-9-67l96-160q16-24 56-24h448q40 0 56 24l96 160q16 40-9 67t-56 31H160q-26 0-45-19t-19-45V448q0-26 19-45t45-19h448q13 0 22 9.5t9 22.5V320q0 13-9.5 22.5T864 352H640V160q0-26 19-45t45-19h160q26 0 45 19t19 45v96z',
    file: 'M800 64H352c-17.7 0-32 14.3-32 32v160H192V96H64v768h64V416h128v448c0 17.7 14.3 32 32 32h512c17.7 0 32-14.3 32-32V416q0-26.5-18.5-45T832 384H224V96h448v96q0 26.5 18.5 45t45.5 18.5h96V96zM736 448H352v-64h384z',
    warning: 'M480 128L64 832h896L544 128zm16 144l368 640H96l368-640zm16 112v96q0 14.9-10.7 25.6T480 496q-14.9 0-25.6-10.7T443.7 480v-96q0-14.9 10.7-25.6T480 368q14.9 0 25.6 10.7T516.3 384zm0 160v96q0 14.9-10.7 25.6T480 656q-14.9 0-25.6-10.7T443.7 640v-96q0-14.9 10.7-25.6T480 512q14.9 0 25.6 10.7T516.3 528z',
    search: 'M772.188 672.172L579.558 479.586C605.586 442.688 620 398.766 620 352c0-141.16-114.84-256-256-256S108 210.84 108 352s114.84 256 256 256c46.766 0 90.688-14.414 127.586-40.442L672.172 772.188a16 16 0 0 0 22.628 0l77.388-77.388a16 16 0 0 0 0-22.628zM364 352c0-79.4 64.6-144 144-144s144 64.6 144 144-64.6 144-144 144-144-64.6-144-144z',
  };
  return <svg width={size} height={size} viewBox="0 0 1024 1024" style={{ display: 'inline-block', flexShrink: 0 }}><path fill="currentColor" d={paths[name] || paths.file} /></svg>;
}

// ============ 校验工具函数 ============
function validatePhone(phone: string): boolean {
  const p = phone.trim();
  return /^1[3-9]\d{9}$/.test(p) || /^0\d{2,3}-?\d{7,8}$/.test(p);
}

function validateRow(row: WaybillRow): Record<string, string> {
  const errors: Record<string, string> = {};
  const reqFields = ['sender_name', 'sender_phone', 'sender_address', 'receiver_name', 'receiver_phone', 'receiver_address', 'weight', 'quantity', 'temp_layer'];
  const labels: Record<string, string> = {
    sender_name: '发件人姓名', sender_phone: '发件人电话', sender_address: '发件人地址',
    receiver_name: '收件人姓名', receiver_phone: '收件人电话', receiver_address: '收件人地址',
    weight: '重量(kg)', quantity: '件数', temp_layer: '温层',
  };
  for (const k of reqFields) {
    const v = String(row[k as keyof WaybillRow] || '').trim();
    if (!v) errors[k] = '不能为空';
  }
  if (row.sender_phone && !validatePhone(row.sender_phone)) {
    if (!errors.sender_phone) errors.sender_phone = '格式错误';
  }
  if (row.receiver_phone && !validatePhone(row.receiver_phone)) {
    if (!errors.receiver_phone) errors.receiver_phone = '格式错误';
  }
  const w = parseFloat(String(row.weight));
  if (row.weight !== '' && row.weight !== undefined && (isNaN(w) || w <= 0)) {
    errors.weight = '必须为正数';
  }
  const q = parseInt(String(row.quantity));
  if (row.quantity !== '' && row.quantity !== undefined && (isNaN(q) || q <= 0 || !Number.isInteger(q))) {
    errors.quantity = '必须为正整数';
  }
  if (row.temp_layer && !(TEMP_LAYER_OPTIONS as readonly string[]).includes(row.temp_layer)) {
    errors.temp_layer = `可选值：${TEMP_LAYER_OPTIONS.join('、')}`;
  }
  return errors;
}

// ============ Toast 消息组件 ============
function Toast({ text, type, onClose }: { text: string; type: 'success' | 'error' | 'warning'; onClose: () => void }) {
  return (
    <div style={{
      position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 9999,
      padding: '10px 20px', borderRadius: 6,
      background: type === 'success' ? '#52c41a' : type === 'error' ? '#ff4d4f' : '#faad14',
      color: '#fff', fontSize: 14, boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
      animation: 'fadeInDown 0.3s ease',
    }}>
      {text}
    </div>
  );
}

// ============ 进度条组件 ============
function ProgressBar({ value, label }: { value: number; label: string }) {
  return (
    <div style={{ margin: '8px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#595959', marginBottom: 4 }}>
        <span>{label}</span>
        <span>{value}%</span>
      </div>
      <div style={{ height: 8, background: '#f0f0f0', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${value}%`, background: '#00BEBE', borderRadius: 4, transition: 'width 0.3s' }} />
      </div>
    </div>
  );
}

// ============ 单元格编辑组件 ============
function EditableCell({
  value, rowIndex, field, onChange, error, options
}: {
  value: string; rowIndex: number; field: string; onChange: (rowIdx: number, field: string, value: string) => void;
  error?: string; options?: readonly string[];
}) {
  const [editing, setEditing] = useState(false);
  const [editVal, setEditVal] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setEditVal(value); }, [value]);

  const commitEdit = () => {
    setEditing(false);
    if (editVal !== value) onChange(rowIndex, field, editVal);
  };

  if (options) {
    return editing ? (
      <select
        value={editVal} onChange={e => { setEditVal(e.target.value); onChange(rowIndex, field, e.target.value); setEditing(false); }}
        autoFocus style={{ width: '100%', height: 32, border: '1px solid #00BEBE', borderRadius: 4, padding: '0 6px', fontSize: 13, outline: 'none', background: '#fff' }}
      >
        <option value="">请选择</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    ) : (
      <div onClick={() => setEditing(true)} style={{
        padding: '0 8px', minHeight: 32, lineHeight: '32px', cursor: 'text',
        background: error ? '#fff1f0' : value ? '#fff' : '#fafafa',
        border: `1px solid ${error ? '#ffccc7' : 'transparent'}`, borderRadius: 4, fontSize: 13,
        color: error ? '#ff4d4f' : '#262626',
      }}>
        {value || <span style={{ color: '#bfbfbf' }}>点击选择</span>}
      </div>
    );
  }

  return editing ? (
    <input
      ref={inputRef} value={editVal} onChange={e => setEditVal(e.target.value)}
      onBlur={commitEdit} onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') { setEditVal(value); setEditing(false); } }}
      style={{ width: '100%', height: 32, border: '1px solid #00BEBE', borderRadius: 4, padding: '0 6px', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
    />
  ) : (
    <div onClick={() => setEditing(true)} style={{
      padding: '0 8px', minHeight: 32, lineHeight: '32px', cursor: 'text',
      background: error ? '#fff1f0' : '#fff',
      border: `1px solid ${error ? '#ffccc7' : 'transparent'}`, borderRadius: 4, fontSize: 13,
      color: error ? '#ff4d4f' : '#262626', position: 'relative',
    }}>
      {value || <span style={{ color: '#bfbfbf' }}>点击编辑</span>}
      {error && <span style={{ position: 'absolute', bottom: -16, left: 8, fontSize: 11, color: '#ff4d4f', whiteSpace: 'nowrap' }}>{error}</span>}
    </div>
  );
}

// ============ 主组件 ============
export default function UniversalImport() {
  // 上传状态
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [dragOver, setDragOver] = useState(false);

  // 预览数据
  const [previewData, setPreviewData] = useState<WaybillRow[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [headerHash, setHeaderHash] = useState('');
  const [hasSavedMapping, setHasSavedMapping] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [isManualMapping, setIsManualMapping] = useState(false);
  const [pendingMapping, setPendingMapping] = useState<Record<string, string>>({});

  // 提交状态
  const [submitting, setSubmitting] = useState(false);
  const [submitProgress, setSubmitProgress] = useState(0);
  const [submitResult, setSubmitResult] = useState<{ success: number; failed: number } | null>(null);

  // 运单列表
  const [waybillList, setWaybillList] = useState<Waybill[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listPage, setListPage] = useState(1);
  const [listTotal, setListTotal] = useState(0);
  const [listQuery, setListQuery] = useState({ external_code: '', receiver_name: '', start_date: '', end_date: '' });

  // Toast
  const [toast, setToast] = useState<{ text: string; type: 'success' | 'error' | 'warning' } | null>(null);
  const showToast = (text: string, type: 'success' | 'error' | 'warning' = 'success') => {
    setToast({ text, type });
    setTimeout(() => setToast(null), 3000);
  };

  // 当前激活的 tab
  const [activeTab, setActiveTab] = useState<'import' | 'list'>('import');

  // 全选状态
  const allSelected = previewData.length > 0 && previewData.every(r => r._selected !== false);
  const someSelected = previewData.some(r => r._selected !== false);

  // 所有错误列表
  const allErrors: Array<{ row: number; field: string; msg: string }> = [];
  for (const row of previewData) {
    if (row._errors) {
      for (const [f, msg] of Object.entries(row._errors)) {
        const label = SYSTEM_FIELDS.find(sf => sf.key === f)?.label || f;
        allErrors.push({ row: row._rowIndex, field: label, msg });
      }
    }
  }

  // 文件上传处理
  const handleFileUpload = useCallback(async (file: File) => {
    if (!file.name.match(/\.xlsx?$/)) {
      showToast('仅支持 .xlsx 或 .xls 格式', 'error');
      return;
    }
    setUploading(true);
    setUploadProgress(0);
    setSubmitResult(null);

    try {
      setUploadProgress(20);
      const formData = new FormData();
      formData.append('file', file);

      setUploadProgress(50);
      const res = await fetch('/api/waybills/upload', { method: 'POST', body: formData });
      setUploadProgress(80);

      const json = await res.json();
      if (!res.ok) {
        showToast(json.error || '上传失败', 'error');
        return;
      }

      setUploadProgress(100);
      setHeaders(json.headers || []);
      setMapping(json.mapping || {});
      setHeaderHash(json.headerHash || '');
      setHasSavedMapping(json.hasSavedMapping || false);
      setTemplateName(json.templateName || '');
      setPendingMapping(json.mapping || {});
      setIsManualMapping(false);
      setPreviewData(json.rows || []);
      showToast(`解析成功，共 ${json.totalCount} 条数据${json.totalErrors > 0 ? `，其中 ${json.totalErrors} 条有错误` : ''}`, json.totalErrors > 0 ? 'warning' : 'success');
    } catch (e) {
      showToast('上传失败：' + (e instanceof Error ? e.message : String(e)), 'error');
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  }, []);

  // 单元格修改
  const handleCellChange = useCallback((rowIndex: number, field: string, value: string) => {
    setPreviewData(prev => prev.map((row, i) => {
      if (i !== rowIndex) return row;
      const updated = { ...row, [field]: value };
      const errors = validateRow(updated as WaybillRow);
      return { ...updated, _errors: errors, _isValid: Object.keys(errors).length === 0 } as WaybillRow;
    }));
  }, []);

  // 切换选中
  const toggleRow = useCallback((rowIndex: number) => {
    setPreviewData(prev => prev.map((row, i) => i === rowIndex ? { ...row, _selected: row._selected === false ? true : false } : row));
  }, []);

  const toggleAll = useCallback(() => {
    if (allSelected) {
      setPreviewData(prev => prev.map(r => ({ ...r, _selected: false })));
    } else {
      setPreviewData(prev => prev.map(r => ({ ...r, _selected: true })));
    }
  }, [allSelected]);

  // 提交下单
  const handleSubmit = useCallback(async () => {
    const selectedRows = previewData.filter(r => r._selected !== false);
    const errors = selectedRows.flatMap((row, i) => {
      const errs = validateRow(row);
      return Object.entries(errs).map(([f, msg]) => ({ row: row._rowIndex, field: f, msg }));
    });
    if (errors.length > 0) {
      showToast(`仍有 ${errors.length} 个错误，请先修正`, 'error');
      return;
    }
    if (selectedRows.length === 0) {
      showToast('请至少选择一行数据', 'warning');
      return;
    }

    setSubmitting(true);
    setSubmitProgress(0);
    setSubmitResult(null);

    try {
      const res = await fetch('/api/waybills/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: selectedRows, skipDuplicates: false }),
      });
      const json = await res.json();
      if (!res.ok) {
        showToast(json.error || '提交失败', 'error');
        return;
      }
      setSubmitResult({ success: json.success, failed: json.failed });
      showToast(`提交完成：成功 ${json.success} 条，失败 ${json.failed} 条`, json.failed > 0 ? 'warning' : 'success');
      if (json.success > 0) {
        // 清空预览
        setPreviewData([]);
        setHeaders([]);
        setMapping({});
        setHeaderHash('');
        // 刷新列表
        fetchWaybillList(listPage);
      }
    } catch (e) {
      showToast('提交失败：' + (e instanceof Error ? e.message : String(e)), 'error');
    } finally {
      setSubmitting(false);
      setSubmitProgress(0);
    }
  }, [previewData, listPage]);

  // 导出Excel（前端生成）
  const handleExport = useCallback(async () => {
    if (previewData.length === 0) {
      showToast('没有可导出的数据', 'warning');
      return;
    }
    try {
      const XLSX = await import('xlsx');
      const FIELD_LABELS: Record<string, string> = {
        external_code: '外部编码', sender_name: '发件人姓名', sender_phone: '发件人电话',
        sender_address: '发件人地址', receiver_name: '收件人姓名', receiver_phone: '收件人电话',
        receiver_address: '收件人地址', weight: '重量(kg)', quantity: '件数',
        temp_layer: '温层', remark: '备注',
      };
      const exportData = previewData.map((row, i) => {
        const item: Record<string, unknown> = { '行号': row._rowIndex, '选中': row._selected !== false };
        for (const [key, label] of Object.entries(FIELD_LABELS)) {
          item[label] = row[key as keyof WaybillRow] ?? '';
        }
        const rowErrors = validateRow(row);
        if (Object.keys(rowErrors).length > 0) {
          item['错误'] = Object.entries(rowErrors).map(([f, m]) => `${SYSTEM_FIELDS.find(sf => sf.key === f)?.label || f}:${m}`).join('; ');
        }
        return item;
      });
      const ws = XLSX.utils.json_to_sheet(exportData);
      ws['!cols'] = [
        { wch: 6 }, { wch: 8 }, { wch: 12 }, { wch: 15 }, { wch: 35 },
        { wch: 12 }, { wch: 15 }, { wch: 35 }, { wch: 10 }, { wch: 8 },
        { wch: 10 }, { wch: 20 }, { wch: 8 }, { wch: 30 },
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, '运单导入预览');
      XLSX.writeFile(wb, `waybill_preview_${Date.now()}.xlsx`);
      showToast('导出成功', 'success');
    } catch (e) {
      showToast('导出失败', 'error');
    }
  }, [previewData]);

  // 获取运单列表
  const fetchWaybillList = useCallback(async (page = 1) => {
    setListLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: '10',
        ...(listQuery.external_code && { external_code: listQuery.external_code }),
        ...(listQuery.receiver_name && { receiver_name: listQuery.receiver_name }),
        ...(listQuery.start_date && { start_date: listQuery.start_date }),
        ...(listQuery.end_date && { end_date: listQuery.end_date }),
      });
      const res = await fetch(`/api/waybills?${params}`);
      const json = await res.json();
      if (res.ok) {
        setWaybillList(json.data || []);
        setListTotal(json.total || 0);
        setListPage(json.page || 1);
      }
    } finally {
      setListLoading(false);
    }
  }, [listQuery]);

  useEffect(() => {
    if (activeTab === 'list') fetchWaybillList(1);
  }, [activeTab]);

  // 删除行
  const deleteRow = useCallback((rowIndex: number) => {
    setPreviewData(prev => prev.filter((_, i) => i !== rowIndex));
  }, []);

  // 新增空行
  const addEmptyRow = useCallback(() => {
    const newRow: WaybillRow = {
      _rowIndex: previewData.length + 1, _selected: true,
      external_code: '', sender_name: '', sender_phone: '', sender_address: '',
      receiver_name: '', receiver_phone: '', receiver_address: '',
      weight: '', quantity: '', temp_layer: '', remark: '',
      _errors: {}, _isValid: false,
    };
    setPreviewData(prev => [...prev, newRow]);
  }, [previewData.length]);

  // ============ 渲染 ============
  const validCount = previewData.filter(r => r._isValid && r._selected !== false).length;
  const invalidCount = previewData.filter(r => !r._isValid && r._selected !== false).length;
  const totalSelected = previewData.filter(r => r._selected !== false).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", sans-serif' }}>
      <style>{`
        @keyframes fadeInDown { from { opacity: 0; transform: translateX(-50%) translateY(-10px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      {toast && <Toast text={toast.text} type={toast.type} onClose={() => setToast(null)} />}

      {/* Tab切换 */}
      <div style={{ display: 'flex', borderBottom: '1px solid #e8e8e8', padding: '0 0 0 16px', background: '#fff', flexShrink: 0 }}>
        {[
          { key: 'import', label: '万能导入', icon: 'upload' },
          { key: 'list', label: '已导入运单', icon: 'file' },
        ].map(tab => (
          <div key={tab.key} onClick={() => setActiveTab(tab.key as 'import' | 'list')}
            style={{
              padding: '12px 20px', cursor: 'pointer', fontSize: 14, fontWeight: activeTab === tab.key ? 600 : 400,
              color: activeTab === tab.key ? '#00BEBE' : '#595959',
              borderBottom: activeTab === tab.key ? '2px solid #00BEBE' : '2px solid transparent',
              marginBottom: -1, display: 'flex', alignItems: 'center', gap: 6,
            }}>
            <Icon name={tab.icon} size={14} />
            {tab.label}
          </div>
        ))}
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        {activeTab === 'import' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* 上传区 */}
            <div style={{ background: '#fff', borderRadius: 8, padding: 20, border: '1px solid #e8e8e8' }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#262626', marginBottom: 12 }}>📤 Excel 文件上传</div>
              <div
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFileUpload(f); }}
                onClick={() => {
                  const input = document.createElement('input');
                  input.type = 'file';
                  input.accept = '.xlsx,.xls';
                  input.onchange = () => { if (input.files?.[0]) handleFileUpload(input.files[0]); };
                  input.click();
                }}
                style={{
                  border: `2px dashed ${dragOver ? '#00BEBE' : uploading ? '#00BEBE' : '#d9d9d9'}`,
                  borderRadius: 8, padding: '40px 20px', textAlign: 'center', cursor: 'pointer',
                  background: dragOver ? '#e6fffb' : '#fafafa', transition: 'all 0.2s',
                }}>
                {uploading ? (
                  <div style={{ color: '#00BEBE' }}>
                    <div style={{ animation: 'spin 1s linear infinite', fontSize: 28, marginBottom: 8 }}>⟳</div>
                    <div style={{ fontSize: 14 }}>正在解析 Excel... {uploadProgress > 0 && `(${uploadProgress}%)`}</div>
                    {uploadProgress > 0 && <div style={{ height: 4, background: '#e8e8e8', borderRadius: 2, marginTop: 12, overflow: 'hidden' }}><div style={{ height: '100%', width: `${uploadProgress}%`, background: '#00BEBE', transition: 'width 0.3s' }} /></div>}
                  </div>
                ) : (
                  <>
                    <Icon name="upload" size={32} />
                    <div style={{ fontSize: 14, color: '#595959', marginTop: 8 }}>
                      拖拽 Excel 文件到此处，或<span style={{ color: '#00BEBE', fontWeight: 600 }}>点击选择文件</span>
                    </div>
                    <div style={{ fontSize: 12, color: '#bfbfbf', marginTop: 4 }}>支持 .xlsx / .xls 格式，拖拽或点击上传</div>
                  </>
                )}
              </div>

              {templateName && (
                <div style={{ marginTop: 12, fontSize: 13, color: '#8c8c8c', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Icon name="check" size={14} />
                  <span>检测到模板：<strong style={{ color: '#00BEBE' }}>{templateName}</strong>
                    {hasSavedMapping && <span style={{ marginLeft: 8, fontSize: 12, padding: '2px 6px', background: '#f6ffed', color: '#52c41a', borderRadius: 4 }}>已保存映射</span>}
                  </span>
                </div>
              )}
            </div>

            {/* 预览表格 */}
            {previewData.length > 0 && (
              <div style={{ background: '#fff', borderRadius: 8, border: '1px solid #e8e8e8', overflow: 'hidden' }}>
                {/* 操作栏 */}
                <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#262626' }}>
                    数据预览
                    <span style={{ fontWeight: 400, fontSize: 13, color: '#8c8c8c', marginLeft: 8 }}>
                      共 {totalSelected} 行（含 {invalidCount} 个错误行）
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button onClick={addEmptyRow} style={{ height: 30, padding: '0 12px', border: '1px solid #d9d9d9', borderRadius: 4, background: '#fff', cursor: 'pointer', fontSize: 13, color: '#595959', display: 'flex', alignItems: 'center', gap: 4 }}
                      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#00BEBE'; (e.currentTarget as HTMLButtonElement).style.color = '#00BEBE'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#d9d9d9'; (e.currentTarget as HTMLButtonElement).style.color = '#595959'; }}>
                      <Icon name="plus" size={12} /> 新增行
                    </button>
                    <button onClick={handleExport} style={{ height: 30, padding: '0 12px', border: '1px solid #d9d9d9', borderRadius: 4, background: '#fff', cursor: 'pointer', fontSize: 13, color: '#595959', display: 'flex', alignItems: 'center', gap: 4 }}
                      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#00BEBE'; (e.currentTarget as HTMLButtonElement).style.color = '#00BEBE'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#d9d9d9'; (e.currentTarget as HTMLButtonElement).style.color = '#595959'; }}>
                      <Icon name="download" size={12} /> 导出Excel
                    </button>
                  </div>
                </div>

                {/* 错误总览 */}
                {allErrors.length > 0 && (
                  <div style={{ margin: '12px 16px 0', padding: '10px 12px', background: '#fff2f0', borderRadius: 6, border: '1px solid #ffccc7', fontSize: 13 }}>
                    <div style={{ fontWeight: 600, color: '#ff4d4f', marginBottom: 6 }}>⚠ 错误汇总（共 {allErrors.length} 个）</div>
                    <div style={{ maxHeight: 120, overflow: 'auto' }}>
                      {allErrors.slice(0, 50).map((e, i) => (
                        <div key={i} style={{ color: '#cf1322', marginBottom: 2 }}>
                          <strong>第{e.row}行</strong> {e.field}：{e.msg}
                        </div>
                      ))}
                      {allErrors.length > 50 && <div style={{ color: '#8c8c8c', fontSize: 12 }}>...还有 {allErrors.length - 50} 个错误</div>}
                    </div>
                  </div>
                )}

                {/* 表格 */}
                <div style={{ overflow: 'auto', maxHeight: 500, margin: '12px 0' }}>
                  <table style={{ width: 'max-content', minWidth: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: '#fafafa', position: 'sticky', top: 0, zIndex: 2 }}>
                        <th style={{ padding: '8px 8px', width: 40, textAlign: 'center', borderBottom: '2px solid #e8e8e8', borderRight: '1px solid #f0f0f0', fontWeight: 600, color: '#595959', whiteSpace: 'nowrap' }}>
                          <input type="checkbox" checked={allSelected} onChange={toggleAll} style={{ cursor: 'pointer', width: 16, height: 16 }} />
                        </th>
                        <th style={{ padding: '8px 8px', width: 60, textAlign: 'center', borderBottom: '2px solid #e8e8e8', borderRight: '1px solid #f0f0f0', fontWeight: 600, color: '#595959', whiteSpace: 'nowrap' }}>行号</th>
                        {SYSTEM_FIELDS.map(f => (
                          <th key={f.key} style={{ padding: '8px 8px', minWidth: 120, borderBottom: '2px solid #e8e8e8', borderRight: '1px solid #f0f0f0', fontWeight: 600, color: f.required ? '#cf1322' : '#595959', whiteSpace: 'nowrap' }}>
                            {f.label}{f.required && <span style={{ color: '#ff4d4f', marginLeft: 2 }}>*</span>}
                          </th>
                        ))}
                        <th style={{ padding: '8px 8px', width: 60, borderBottom: '2px solid #e8e8e8', fontWeight: 600, color: '#595959' }}>操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewData.map((row, rowIdx) => (
                        <tr key={rowIdx} style={{ background: row._isValid ? '#fff' : '#fff1f0' }}>
                          <td style={{ padding: '4px 8px', textAlign: 'center', borderBottom: '1px solid #f0f0f0' }}>
                            <input type="checkbox" checked={row._selected !== false} onChange={() => toggleRow(rowIdx)} style={{ cursor: 'pointer', width: 16, height: 16 }} />
                          </td>
                          <td style={{ padding: '4px 8px', textAlign: 'center', color: '#8c8c8c', borderBottom: '1px solid #f0f0f0', borderRight: '1px solid #f0f0f0', whiteSpace: 'nowrap' }}>{row._rowIndex}</td>
                          {SYSTEM_FIELDS.map(f => (
                            <td key={f.key} style={{ padding: '2px 4px', borderBottom: '1px solid #f0f0f0', borderRight: '1px solid #f0f0f0' }}>
                              <EditableCell
                                value={String(row[f.key as keyof WaybillRow] || '')}
                                rowIndex={rowIdx}
                                field={f.key}
                                onChange={handleCellChange}
                                error={row._errors?.[f.key]}
                                options={f.options as readonly string[] | undefined}
                              />
                            </td>
                          ))}
                          <td style={{ padding: '4px 8px', borderBottom: '1px solid #f0f0f0' }}>
                            <button onClick={() => deleteRow(rowIdx)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ff4d4f', fontSize: 16, padding: 4 }}
                              title="删除此行">×</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* 提交区 */}
                <div style={{ padding: '12px 16px', borderTop: '1px solid #e8e8e8', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                  <div style={{ fontSize: 13, color: '#8c8c8c' }}>
                    已选 <strong style={{ color: invalidCount > 0 ? '#ff4d4f' : '#52c41a' }}>{totalSelected}</strong> 行，其中 {invalidCount > 0 ? <strong style={{ color: '#ff4d4f' }}>{invalidCount} 行有错误</strong> : <strong style={{ color: '#52c41a' }}>全部有效</strong>}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {submitting && <ProgressBar value={submitProgress} label="提交中..." />}
                    <button
                      onClick={handleSubmit}
                      disabled={submitting || invalidCount > 0 || totalSelected === 0}
                      style={{
                        height: 36, padding: '0 24px', border: 'none', borderRadius: 4,
                        background: (submitting || invalidCount > 0 || totalSelected === 0) ? '#d9d9d9' : '#00BEBE',
                        color: '#fff', cursor: (submitting || invalidCount > 0 || totalSelected === 0) ? 'not-allowed' : 'pointer',
                        fontSize: 14, fontWeight: 600,
                      }}>
                      {submitting ? '提交中...' : '提交下单'}
                    </button>
                  </div>
                </div>

                {/* 提交结果 */}
                {submitResult && (
                  <div style={{ margin: '0 16px 12px', padding: '12px 16px', background: submitResult.failed > 0 ? '#fff2f0' : '#f6ffed', borderRadius: 6, border: `1px solid ${submitResult.failed > 0 ? '#ffccc7' : '#b7eb8f'}`, fontSize: 14 }}>
                    <strong style={{ color: submitResult.failed > 0 ? '#ff4d4f' : '#52c41a' }}>
                      提交完成：成功 {submitResult.success} 条，失败 {submitResult.failed} 条
                    </strong>
                  </div>
                )}
              </div>
            )}

            {/* 空状态 */}
            {previewData.length === 0 && (
              <div style={{ background: '#fff', borderRadius: 8, padding: '60px 20px', border: '1px solid #e8e8e8', textAlign: 'center' }}>
                <Icon name="upload" size={48} />
                <div style={{ fontSize: 14, color: '#8c8c8c', marginTop: 12 }}>请上传 Excel 文件开始导入</div>
                <div style={{ fontSize: 12, color: '#bfbfbf', marginTop: 8 }}>支持多模板自动识别、拖拽上传、批量编辑</div>
              </div>
            )}
          </div>
        ) : (
          /* 运单列表 */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* 搜索栏 */}
            <div style={{ background: '#fff', borderRadius: 8, padding: 16, border: '1px solid #e8e8e8' }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#262626', marginBottom: 12 }}>🔍 查询条件</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
                {[
                  { label: '外部编码', key: 'external_code', placeholder: '输入外部编码' },
                  { label: '收件人姓名', key: 'receiver_name', placeholder: '输入收件人姓名' },
                  { label: '开始日期', key: 'start_date', placeholder: '开始日期', type: 'date' },
                  { label: '结束日期', key: 'end_date', placeholder: '结束日期', type: 'date' },
                ].map(f => (
                  <div key={f.key}>
                    <div style={{ fontSize: 13, color: '#595959', marginBottom: 4 }}>{f.label}</div>
                    <input
                      type={f.type || 'text'} value={listQuery[f.key as keyof typeof listQuery]}
                      onChange={e => setListQuery(q => ({ ...q, [f.key]: e.target.value }))}
                      placeholder={f.placeholder}
                      style={{ height: 32, padding: '0 10px', border: '1px solid #d9d9d9', borderRadius: 4, fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box' }}
                      onFocus={e => (e.target.style.borderColor = '#00BEBE')}
                      onBlur={e => (e.target.style.borderColor = '#d9d9d9')}
                    />
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                <button onClick={() => fetchWaybillList(1)} style={{ height: 32, padding: '0 16px', border: 'none', borderRadius: 4, background: '#00BEBE', color: '#fff', cursor: 'pointer', fontSize: 13 }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#00c4c4')}
                  onMouseLeave={e => (e.currentTarget.style.background = '#00BEBE')}>查询</button>
                <button onClick={() => { setListQuery({ external_code: '', receiver_name: '', start_date: '', end_date: '' }); }}
                  style={{ height: 32, padding: '0 16px', border: '1px solid #d9d9d9', borderRadius: 4, background: '#fff', color: '#595959', cursor: 'pointer', fontSize: 13 }}>重置</button>
              </div>
            </div>

            {/* 列表 */}
            <div style={{ background: '#fff', borderRadius: 8, border: '1px solid #e8e8e8', overflow: 'hidden' }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0', fontSize: 14, fontWeight: 600, color: '#262626' }}>
                运单列表 <span style={{ fontWeight: 400, color: '#8c8c8c' }}>（共 {listTotal} 条）</span>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: 'max-content', minWidth: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: '#fafafa' }}>
                      {['ID', '外部编码', '发件人', '发件人电话', '发件人地址', '收件人', '收件人电话', '收件人地址', '重量', '件数', '温层', '备注', '状态', '创建时间'].map(h => (
                        <th key={h} style={{ padding: '8px 10px', textAlign: 'left', borderBottom: '1px solid #e8e8e8', whiteSpace: 'nowrap', fontWeight: 600, color: '#595959' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {listLoading ? (
                      <tr><td colSpan={14} style={{ padding: 40, textAlign: 'center', color: '#8c8c8c' }}>加载中...</td></tr>
                    ) : waybillList.length === 0 ? (
                      <tr><td colSpan={14} style={{ padding: 40, textAlign: 'center', color: '#8c8c8c' }}>暂无数据</td></tr>
                    ) : waybillList.map(w => (
                      <tr key={w.id} style={{ borderBottom: '1px solid #f0f0f0' }}
                        onMouseEnter={e => (e.currentTarget.style.background = '#fafafa')}
                        onMouseLeave={e => (e.currentTarget.style.background = '#fff')}>
                        <td style={{ padding: '8px 10px', color: '#8c8c8c', whiteSpace: 'nowrap' }}>{w.id}</td>
                        <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>{w.external_code || '-'}</td>
                        <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>{w.sender_name}</td>
                        <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>{w.sender_phone}</td>
                        <td style={{ padding: '8px 10px', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.sender_address}</td>
                        <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>{w.receiver_name}</td>
                        <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>{w.receiver_phone}</td>
                        <td style={{ padding: '8px 10px', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.receiver_address}</td>
                        <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>{w.weight}</td>
                        <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>{w.quantity}</td>
                        <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>
                          <span style={{ padding: '2px 6px', borderRadius: 4, fontSize: 12, background: w.temp_layer === '冷藏' ? '#e6f7ff' : w.temp_layer === '冷冻' ? '#f0f5ff' : '#f6ffed', color: '#1677ff' }}>{w.temp_layer}</span>
                        </td>
                        <td style={{ padding: '8px 10px', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.remark || '-'}</td>
                        <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>
                          <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 12, background: '#f6ffed', color: '#52c41a' }}>已提交</span>
                        </td>
                        <td style={{ padding: '8px 10px', color: '#8c8c8c', whiteSpace: 'nowrap' }}>{w.created_at ? new Date(w.created_at).toLocaleString('zh-CN') : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* 分页 */}
              {listTotal > 10 && (
                <div style={{ padding: '12px 16px', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, borderTop: '1px solid #f0f0f0' }}>
                  <span style={{ fontSize: 13, color: '#8c8c8c' }}>共 {listTotal} 条</span>
                  <button onClick={() => fetchWaybillList(listPage - 1)} disabled={listPage <= 1}
                    style={{ height: 28, padding: '0 10px', border: '1px solid #d9d9d9', borderRadius: 4, background: '#fff', cursor: listPage <= 1 ? 'not-allowed' : 'pointer', color: listPage <= 1 ? '#d9d9d9' : '#595959', fontSize: 13 }}>上一页</button>
                  <span style={{ fontSize: 13, color: '#595959' }}>第 {listPage} / {Math.ceil(listTotal / 10)} 页</span>
                  <button onClick={() => fetchWaybillList(listPage + 1)} disabled={listPage >= Math.ceil(listTotal / 10)}
                    style={{ height: 28, padding: '0 10px', border: '1px solid #d9d9d9', borderRadius: 4, background: '#fff', cursor: listPage >= Math.ceil(listTotal / 10) ? 'not-allowed' : 'pointer', color: listPage >= Math.ceil(listTotal / 10) ? '#d9d9d9' : '#595959', fontSize: 13 }}>下一页</button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
