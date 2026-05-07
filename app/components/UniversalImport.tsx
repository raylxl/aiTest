'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import type { WaybillRow, ValidationError, Waybill } from '@/lib/waybill-types';
import { SYSTEM_FIELDS, TEMP_LAYER_OPTIONS } from '@/lib/waybill-types';
import Icon from './Icon';

// ============ SVG 图标 ============
// Icon 已提取到 ./Icon.tsx

// ============ Toast 组件 ============
function Toast({ text, type, onClose }: { text: string; type: 'success' | 'error' | 'warning'; onClose: () => void }) {
  const colors = { success: '#52c41a', error: '#ff4d4f', warning: '#faad14' };
  return (
    <div style={{
      position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)',
      background: '#fff', borderLeft: `4px solid ${colors[type]}`,
      padding: '10px 20px', borderRadius: 4, boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
      zIndex: 9999, minWidth: 200, animation: 'fadeInDown 0.3s ease',
      color: '#333', fontSize: 14,
    }}>
      <span style={{ marginRight: 12, color: colors[type], fontWeight: 600 }}>
        {type === 'success' ? '✓' : type === 'error' ? '✕' : '⚠'}
      </span>
      {text}
      <button onClick={onClose} style={{ float: 'right', border: 'none', background: 'none', cursor: 'pointer', color: '#999', fontSize: 18, lineHeight: 1, padding: '0 0 0 8px' }}>×</button>
    </div>
  );
}

// ============ EditableCell 组件 ============
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
      {error && (
        <span style={{ position: 'absolute', bottom: -18, left: 0, fontSize: 11, color: '#ff4d4f', whiteSpace: 'nowrap', background: '#fff', border: '1px solid #ffccc7', borderRadius: 3, padding: '1px 4px', zIndex: 10, cursor: 'default' }} title={`错误：${error}`}>
          {error}
        </span>
      )}
    </div>
  );
}

// ============ MappingPanel 组件 ============
function MappingPanel({
  headers, mapping, pendingMapping, setPendingMapping,
  onReapply, onSaveTemplate, hasSavedMapping, templateName, templateMatchNote, onReset
}: {
  headers: string[];
  mapping: Record<string, string>;
  pendingMapping: Record<string, string>;
  setPendingMapping: (m: Record<string, string>) => void;
  onReapply: (m: Record<string, string>) => void;
  onSaveTemplate: (m: Record<string, string>) => void;
  hasSavedMapping: boolean;
  templateName: string;
  templateMatchNote: string;
  onReset: () => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const currentMapping = Object.keys(pendingMapping).length > 0 ? pendingMapping : mapping;

  return (
    <div style={{ border: '1px solid #d9d9d9', borderRadius: 8, background: '#fff', marginBottom: 12 }}>
      <div
        onClick={() => setCollapsed(c => !c)}
        style={{
          padding: '10px 16px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', borderBottom: collapsed ? 'none' : '1px solid #f0f0f0',
          userSelect: 'none',
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 600, color: '#262626', display: 'flex', alignItems: 'center', gap: 8 }}>
          🔗 映射关系配置
          {templateName && (
            <span style={{ fontSize: 12, padding: '2px 8px', background: '#e6f4ff', color: '#1677ff', borderRadius: 4, fontWeight: 400 }}>
              {templateName}
            </span>
          )}
          {hasSavedMapping && (
            <span style={{ fontSize: 12, padding: '2px 8px', background: '#f6ffed', color: '#52c41a', borderRadius: 4, fontWeight: 400 }}>
              {templateMatchNote || '已保存'}
            </span>
          )}
          <span
            onClick={e => { e.stopPropagation(); onReset(); }}
            style={{ fontSize: 12, padding: '2px 8px', background: '#fff', color: '#8c8c8c', borderRadius: 4, fontWeight: 400, cursor: 'pointer', border: '1px solid #d9d9d9', marginLeft: 4 }}
            title="重新上传文件"
          >
            🔄 重新上传
          </span>
        </div>
        <span style={{ color: '#8c8c8c', fontSize: 18 }}>{collapsed ? '▶' : '▼'}</span>
      </div>

      {!collapsed && (
        <div style={{ padding: '12px 16px' }}>
          <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 10 }}>
            请确认每个 Excel 列名对应的系统字段。如需调整，请在下方下拉框中选择正确的字段映射。
          </div>

          <div style={{ overflow: 'auto', maxHeight: 240, border: '1px solid #f0f0f0', borderRadius: 6 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#fafafa' }}>
                  <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: '#595959', borderBottom: '1px solid #e8e8e8', whiteSpace: 'nowrap' }}>
                    Excel 列名
                  </th>
                  <th style={{ padding: '8px 12px', width: 40, textAlign: 'center', color: '#8c8c8c', borderBottom: '1px solid #e8e8e8' }}>→</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: '#595959', borderBottom: '1px solid #e8e8e8', whiteSpace: 'nowrap' }}>
                    映射到系统字段
                  </th>
                </tr>
              </thead>
              <tbody>
                {headers.map((col, idx) => {
                  const mapped = currentMapping[col];
                  return (
                    <tr key={idx} style={{ borderBottom: idx < headers.length - 1 ? '1px solid #f5f5f5' : 'none' }}>
                      <td style={{ padding: '6px 12px', color: '#262626', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {col}
                      </td>
                      <td style={{ padding: '6px 12px', textAlign: 'center', color: '#d9d9d9' }}>→</td>
                      <td style={{ padding: '4px 12px' }}>
                        <select
                          value={mapped || ''}
                          onChange={e => {
                            const newMap = { ...currentMapping, [col]: e.target.value };
                            setPendingMapping(newMap);
                          }}
                          style={{
                            height: 30, padding: '0 8px', border: `1px solid ${mapped ? '#d9d9d9' : '#ff4d4f'}`,
                            borderRadius: 4, fontSize: 13, outline: 'none', width: '100%', minWidth: 140,
                            background: '#fff', cursor: 'pointer',
                            color: mapped ? '#262626' : '#ff4d4f',
                          }}
                        >
                          <option value="">— 未映射 —</option>
                          {SYSTEM_FIELDS.map(f => (
                            <option key={f.key} value={f.key}>{f.label}{f.required ? ' *' : ''}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
            <button
              onClick={() => onReapply(currentMapping)}
              style={{ height: 32, padding: '0 16px', border: '1px solid #00BEBE', borderRadius: 4, background: '#00BEBE', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}
            >
              🔄 重新解析数据
            </button>
            <button
              onClick={() => onSaveTemplate(currentMapping)}
              style={{ height: 32, padding: '0 16px', border: '1px solid #d9d9d9', borderRadius: 4, background: '#fff', color: '#595959', cursor: 'pointer', fontSize: 13 }}
            >
              💾 保存为模板
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============ ConfirmImportModal 组件 ============
function ConfirmImportModal({
  validCount, duplicateCount, onConfirm, onCancel, loading
}: {
  validCount: number;
  duplicateCount: number; // 有外部编码且已存在的行数
  onConfirm: (mode: 'skip' | 'overwrite') => void;
  onCancel: () => void;
  loading: boolean;
}) {
  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.45)', zIndex: 9000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: '#fff', borderRadius: 8, padding: '24px 28px',
        width: 440, maxWidth: '90vw',
        boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
        animation: 'fadeInDown 0.2s ease',
      }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#262626', marginBottom: 6 }}>
          确认导入运单
        </div>
        <div style={{ fontSize: 14, color: '#595959', marginBottom: 16, lineHeight: 1.7 }}>
          即将导入 <strong style={{ color: '#1677ff' }}>{validCount}</strong> 条有效运单到数据库。
          {duplicateCount > 0 && (
            <span style={{ color: '#faad14', fontWeight: 600 }}>
              {' '}&nbsp;其中 <strong>{duplicateCount}</strong> 条外部编码与已有数据重复
            </span>
          )}
        </div>

        {/* 跳过冲突 */}
        <div
          id="card-skip"
          onClick={() => !loading && (document.getElementById('mode-skip') as HTMLInputElement)?.click()}
          style={{
            display: 'block', padding: '12px 14px', border: '2px solid #d9d9d9',
            borderRadius: 8, marginBottom: 10, cursor: loading ? 'not-allowed' : 'pointer',
            background: '#fafafa', transition: 'all 0.15s',
          }}
        >
          <input type="radio" name="import-mode" id="mode-skip" value="skip" defaultChecked style={{ display: 'none' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid #d9d9d9', background: '#fff', flexShrink: 0, transition: 'all 0.15s' }} id="dot-skip" />
            <div>
              <strong style={{ color: '#262626', fontSize: 14 }}>跳过冲突（推荐）</strong>
              <div style={{ fontSize: 12, color: '#8c8c8c', marginTop: 3 }}>
                {duplicateCount > 0
                  ? `已有编码的 ${duplicateCount} 条将被跳过，不更新`
                  : '数据库中无重复编码，等效于直接插入'}
              </div>
            </div>
          </div>
        </div>

        {/* 覆盖已有 */}
        <div
          id="card-overwrite"
          onClick={() => !loading && (document.getElementById('mode-overwrite') as HTMLInputElement)?.click()}
          style={{
            display: 'block', padding: '12px 14px', border: '2px solid #d9d9d9',
            borderRadius: 8, marginBottom: 20, cursor: loading ? 'not-allowed' : 'pointer',
            background: '#fafafa', transition: 'all 0.15s',
          }}
        >
          <input type="radio" name="import-mode" id="mode-overwrite" value="overwrite" style={{ display: 'none' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid #d9d9d9', background: '#fff', flexShrink: 0 }} id="dot-overwrite" />
            <div>
              <strong style={{ color: '#262626', fontSize: 14 }}>覆盖已有数据</strong>
              <div style={{ fontSize: 12, color: '#ff4d4f', marginTop: 3 }}>
                {duplicateCount > 0
                  ? `已有编码的 ${duplicateCount} 条将被覆盖更新，请谨慎操作！`
                  : '无重复编码，此选项等效于直接插入'}
              </div>
            </div>
          </div>
        </div>

        {/* 选中效果 JS（radio change 时更新样式） */}
        <script dangerouslySetInnerHTML={{ __html: `
          document.querySelectorAll('input[name="import-mode"]').forEach(function(r) {
            r.addEventListener('change', function() {
              ['skip','overwrite'].forEach(function(m) {
                var card = document.getElementById('card-' + m);
                var dot = document.getElementById('dot-' + m);
                if (r.value === m && r.checked) {
                  card.style.borderColor = '#1677ff';
                  card.style.background = '#e6f4ff';
                  dot.style.borderColor = '#1677ff';
                  dot.style.background = '#1677ff';
                } else {
                  card.style.borderColor = '#d9d9d9';
                  card.style.background = '#fafafa';
                  dot.style.borderColor = '#d9d9d9';
                  dot.style.background = '#fff';
                }
              });
            });
          });
        ` }} />

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
            disabled={loading}
            style={{ height: 34, padding: '0 16px', border: '1px solid #d9d9d9', borderRadius: 4, background: '#fff', color: '#595959', cursor: loading ? 'not-allowed' : 'pointer', fontSize: 13 }}>
            取消
          </button>
          <button
            onClick={() => {
              const selected = (document.querySelector('input[name="import-mode"]:checked') as HTMLInputElement)?.value as 'skip' | 'overwrite' || 'skip';
              onConfirm(selected);
            }}
            disabled={loading}
            style={{ height: 34, padding: '0 20px', border: 'none', borderRadius: 4, background: '#1677ff', color: '#fff', cursor: loading ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600 }}>
            {loading ? '提交中...' : '确认提交'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============ ProgressBar 组件 ============
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

// ============ 校验函数 ============
function validateRow(row: WaybillRow): Record<string, string> {
  const errors: Record<string, string> = {};
  const reqFields = ['sender_name', 'sender_phone', 'sender_address',
    'receiver_name', 'receiver_phone', 'receiver_address', 'weight', 'quantity', 'temp_layer'];

  for (const f of reqFields) {
    const val = String(row[f as keyof WaybillRow] || '').trim();
    if (!val) {
      errors[f] = '不能为空';
    }
  }

  const phoneFields = ['sender_phone', 'receiver_phone'];
  for (const f of phoneFields) {
    const val = String(row[f as keyof WaybillRow] || '').trim();
    if (val && !/^1[3-9]\d{9}$/.test(val) && !/^0\d{2,3}-?\d{7,8}$/.test(val)) {
      errors[f] = '格式错误（手机号11位或固话）';
    }
  }

  const weight = parseFloat(String(row.weight));
  if (row.weight !== '' && (isNaN(weight) || weight <= 0)) {
    errors['weight'] = '必须为正数';
  }

  const qty = parseInt(String(row.quantity));
  if (row.quantity !== '' && (isNaN(qty) || qty <= 0 || !Number.isInteger(qty))) {
    errors['quantity'] = '必须为正整数';
  }

  const temp = String(row.temp_layer || '').trim();
  if (temp && !TEMP_LAYER_OPTIONS.includes(temp as '常温' | '冷藏' | '冷冻')) {
    errors['temp_layer'] = `可选值：${[...TEMP_LAYER_OPTIONS].join('、')}`;
  }

  return errors;
}

// ============ 日期格式化 ============
function fmtDate(v: string | Date | null | undefined): string {
  if (!v) return '-';
  const d = new Date(v);
  if (isNaN(d.getTime())) return '-';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

// ============ 主组件 ============
export default function UniversalImport() {
  // 上传状态
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadProgressText, setUploadProgressText] = useState('');
  const [dragOver, setDragOver] = useState(false);

  // 预览数据
  const [previewData, setPreviewData] = useState<WaybillRow[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [headerHash, setHeaderHash] = useState('');
  const [hasSavedMapping, setHasSavedMapping] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templateMatchNote, setTemplateMatchNote] = useState('');
  const [isManualMapping, setIsManualMapping] = useState(false);
  const [pendingMapping, setPendingMapping] = useState<Record<string, string>>({});

  // 提交状态
  const [submitting, setSubmitting] = useState(false);
  const [submitProgress, setSubmitProgress] = useState(0);
  const [submitProgressText, setSubmitProgressText] = useState('');
  const [submitResult, setSubmitResult] = useState<{ success: number; failed: number } | null>(null);

  // 确认导入弹框
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);

  // 虚拟滚动
  const [scrollTop, setScrollTop] = useState(0);
  const ROW_HEIGHT = 42; // 每行高度（px）
  const BUFFER = 8;      // 上下各多渲染 N 行缓冲
  const [dismissAutoApply, setDismissAutoApply] = useState(false); // 是否已撤销自动应用

  // 运单列表
  const [waybillList, setWaybillList] = useState<Waybill[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listPage, setListPage] = useState(1);
  const [listTotal, setListTotal] = useState(0);
  const [listQuery, setListQuery] = useState({ external_code: '', sender_name: '', sender_phone: '', receiver_name: '', receiver_phone: '', start_date: '', end_date: '' });
  const [selectedWaybillIds, setSelectedWaybillIds] = useState<Set<number>>(new Set());
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);

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

  // 文件上传处理（含真实进度：先解析总行数，再模拟进度条）
  const handleFileUpload = useCallback(async (file: File) => {
    if (!file.name.match(/\.xlsx?$/)) {
      showToast('仅支持 .xlsx 或 .xls 格式', 'error');
      return;
    }
    setUploading(true);
    setUploadProgress(0);
    setUploadProgressText('');
    setSubmitResult(null);
    setPendingMapping({});

    let progressInterval: ReturnType<typeof setInterval> | null = null;

    try {
      // Step 1：快速前端解析，获取总行数
      const XLSX = await import('xlsx');
      const arrayBuf = await file.arrayBuffer();
      const wb = XLSX.read(new Uint8Array(arrayBuf), { type: 'array' });

      if (!wb.SheetNames || wb.SheetNames.length === 0) {
        showToast('Excel 文件中没有工作表', 'error');
        return;
      }

      // 选取数据 sheet（跳过"说明"类 sheet）
      let sheetName = wb.SheetNames[0];
      for (const sn of wb.SheetNames) {
        if (sn.includes('说明') || sn.includes('readme') || sn.includes('guide')) continue;
        sheetName = sn;
        break;
      }

      const ws = wb.Sheets[sheetName];
      const rawData = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as unknown[][];
      const totalRows = Math.max(0, rawData.length - 1);
      const headers = (rawData[0] as string[] || []).map(h => String(h).trim());

      if (totalRows === 0) {
        showToast('Excel 文件中没有有效数据行', 'error');
        return;
      }

      // Step 2：启动模拟进度条，显示"已解析 X/总数 条 (Y%)"
      let simPct = 0;
      progressInterval = setInterval(() => {
        setUploadProgress(prev => {
          if (prev >= 92) return prev;
          const next = prev + Math.ceil((92 - prev) / 12);
          const current = Math.min(Math.round(next * totalRows / 100), totalRows);
          const pct = Math.round(current / totalRows * 100);
          setUploadProgressText(`已解析 ${current}/${totalRows} 条 (${pct}%)`);
          return Math.min(next, 92);
        });
      }, 250);

      // Step 3：上传文件到后端（后端再次解析并校验）
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/waybills/upload', { method: 'POST', body: formData });

      // Step 4：清除定时器，设 100%
      if (progressInterval) clearInterval(progressInterval);
      setUploadProgress(100);
      setUploadProgressText(`已解析 ${totalRows}/${totalRows} 条 (100%)`);

      const json = await res.json();
      if (!res.ok) {
        showToast(json.error || '上传失败', 'error');
        return;
      }

      setHeaders(json.headers || []);
      setMapping(json.mapping || {});
      setHeaderHash(json.headerHash || '');
      setHasSavedMapping(json.hasSavedMapping || false);
      setTemplateName(json.templateName || '');
      setTemplateMatchNote(json.templateMatchNote || '');
      setPendingMapping({});
      setDismissAutoApply(false);
      setIsManualMapping(false);
      setPreviewData(json.rows || []);
      showToast(
        `解析成功，共 ${json.totalCount} 条数据${json.totalErrors > 0 ? `，其中 ${json.totalErrors} 条有错误` : ''}`,
        json.totalErrors > 0 ? 'warning' : 'success'
      );
    } catch (e) {
      showToast('上传失败：' + (e instanceof Error ? e.message : String(e)), 'error');
    } finally {
      if (progressInterval) clearInterval(progressInterval);
      setUploading(false);
      setUploadProgress(0);
      // 延迟清除文本，让用户看到 100%
      setTimeout(() => setUploadProgressText(''), 1200);
    }
  }, []);

  // 手动调整映射后，重新解析数据
  const handleReapplyMapping = useCallback(async (newMapping: Record<string, string>) => {
    if (previewData.length === 0) return;
    setUploading(true);
    setUploadProgress(0);
    try {
      const res = await fetch('/api/waybills/remap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rows: previewData,
          rawHeaders: headers,
          newMapping,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        showToast(json.error || '重新解析失败', 'error');
        return;
      }
      setMapping(newMapping);
      setHeaderHash(json.headerHash || '');
      setHasSavedMapping(json.hasSavedMapping || false);
      setTemplateMatchNote(json.templateMatchNote || '');
      setPendingMapping({});
      setPreviewData(json.rows || []);
      showToast(
        `重新解析完成，共 ${json.totalCount} 条数据${json.totalErrors > 0 ? `，其中 ${json.totalErrors} 条有错误` : ''}`,
        json.totalErrors > 0 ? 'warning' : 'success'
      );
    } catch (e) {
      showToast('重新解析失败：' + (e instanceof Error ? e.message : String(e)), 'error');
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  }, [previewData, headers]);

  // 保存映射为模板
  const handleSaveTemplate = useCallback(async (saveMapping: Record<string, string>) => {
    if (!headerHash) {
      showToast('无法保存：缺少模板标识', 'warning');
      return;
    }
    try {
      const res = await fetch('/api/waybills/mapping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ headerHash, headerColumns: saveMapping }),
      });
      const json = await res.json();
      if (!res.ok) {
        showToast(json.error || '保存模板失败', 'error');
        return;
      }
      setHasSavedMapping(true);
      showToast('映射模板已保存，下次上传相同结构文件将自动应用', 'success');
    } catch (e) {
      showToast('保存模板失败', 'error');
    }
  }, [headerHash]);

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

  // 获取运单列表
  const fetchWaybillList = useCallback(async (page = 1) => {
    setListLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: '10',
        ...(listQuery.external_code && { external_code: listQuery.external_code }),
        ...(listQuery.sender_name && { sender_name: listQuery.sender_name }),
        ...(listQuery.sender_phone && { sender_phone: listQuery.sender_phone }),
        ...(listQuery.receiver_name && { receiver_name: listQuery.receiver_name }),
        ...(listQuery.receiver_phone && { receiver_phone: listQuery.receiver_phone }),
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

  // 提交下单（分批提交 + 真实进度）
  const handleSubmit = useCallback(async (mode: 'skip' | 'overwrite' = 'skip') => {
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
    setSubmitProgressText('正在准备提交...');
    setSubmitResult(null);

    const BATCH_SIZE = 100;
    let totalSuccess = 0;
    let totalFailed = 0;
    let done = 0;
    const total = selectedRows.length;
    const skipDuplicates = mode === 'skip';

    try {
      for (let i = 0; i < selectedRows.length; i += BATCH_SIZE) {
        const batch = selectedRows.slice(i, i + BATCH_SIZE);
        setSubmitProgressText(`正在提交第 ${done + 1} ~ ${Math.min(done + batch.length, total)} 条，共 ${total} 条...`);

        const res = await fetch('/api/waybills/submit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rows: batch, skipDuplicates }),
        });
        const json = await res.json();
        if (!res.ok) {
          showToast(json.error || '提交失败', 'error');
          return;
        }
        totalSuccess += json.success || 0;
        totalFailed += json.failed || 0;
        done += batch.length;
        setSubmitProgress(Math.round((done / total) * 100));
      }

      setSubmitProgress(100);
      setSubmitProgressText(`已完成 ${totalSuccess + totalFailed} / ${total} 条`);
      setSubmitResult({ success: totalSuccess, failed: totalFailed });
      showToast(
        `提交完成：成功 ${totalSuccess} 条${totalFailed > 0 ? `，失败 ${totalFailed} 条` : ''}`,
        totalFailed > 0 ? 'warning' : 'success'
      );
      if (totalSuccess > 0) {
        setPreviewData([]);
        setHeaders([]);
        setMapping({});
        setHeaderHash('');
        setPendingMapping({});
        setConfirmModalOpen(false);
        fetchWaybillList(listPage);
      }
    } catch (e) {
      showToast('提交失败：' + (e instanceof Error ? e.message : String(e)), 'error');
    } finally {
      setSubmitting(false);
      setSubmitProgress(0);
      setSubmitProgressText('');
    }
  }, [previewData, listPage, fetchWaybillList, confirmModalOpen]);

  // 运单列表导出
  const handleListExport = useCallback(async () => {
    if (waybillList.length === 0) {
      showToast('没有可导出的数据，请先查询', 'warning');
      return;
    }
    setExportLoading(true);
    try {
      const XLSX = await import('xlsx');
      const exportData = waybillList.map((row, i) => ({
        '序号': i + 1,
        'ID': row.id,
        '外部编码': row.external_code || '',
        '发件人姓名': row.sender_name,
        '发件人电话': row.sender_phone,
        '发件人地址': row.sender_address,
        '收件人姓名': row.receiver_name,
        '收件人电话': row.receiver_phone,
        '收件人地址': row.receiver_address,
        '重量(kg)': row.weight,
        '件数': row.quantity,
        '温层': row.temp_layer,
        '备注': row.remark || '',
        '状态': row.status === 'submitted' ? '已提交' : row.status,
        '创建时间': fmtDate(row.created_at),
      }));
      const ws = XLSX.utils.json_to_sheet(exportData);
      ws['!cols'] = [
        { wch: 6 }, { wch: 8 }, { wch: 16 }, { wch: 12 }, { wch: 15 }, { wch: 35 },
        { wch: 12 }, { wch: 15 }, { wch: 35 }, { wch: 10 }, { wch: 8 },
        { wch: 10 }, { wch: 20 }, { wch: 10 }, { wch: 22 },
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, '运单列表');
      XLSX.writeFile(wb, `waybill_list_${Date.now()}.xlsx`);
      showToast(`导出成功，共 ${waybillList.length} 条`, 'success');
    } catch (e) {
      showToast('导出失败', 'error');
    } finally {
      setExportLoading(false);
    }
  }, [waybillList]);

  // 导出Excel（前端生成）
  const handleExport = useCallback(async () => {
    if (previewData.length === 0) {
      showToast('没有可导出的数据', 'warning');
      return;
    }
    setExportLoading(true);
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
    } finally {
      setExportLoading(false);
    }
  }, [previewData]);

  useEffect(() => {
    if (activeTab === 'list') fetchWaybillList(1);
  }, [activeTab]);

  // 删除行
  const deleteRow = useCallback((rowIndex: number) => {
    setPreviewData(prev => prev.filter((_, i) => i !== rowIndex));
  }, []);

  // 运单列表勾选逻辑
  const toggleWaybillSelect = useCallback((id: number) => {
    setSelectedWaybillIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAllWaybillSelect = useCallback((checked: boolean) => {
    if (checked) {
      setSelectedWaybillIds(new Set(waybillList.map(w => w.id)));
    } else {
      setSelectedWaybillIds(new Set());
    }
  }, [waybillList]);

  // 批量删除运单
  const handleBatchDelete = useCallback(async () => {
    if (selectedWaybillIds.size === 0) return;
    if (!confirm(`确定删除选中的 ${selectedWaybillIds.size} 条运单吗？删除后不可恢复。`)) return;
    setDeleteLoading(true);
    try {
      const res = await fetch('/api/waybills', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selectedWaybillIds) }),
      });
      const json = await res.json();
      if (res.ok) {
        showToast(`成功删除 ${json.deletedCount} 条运单`, 'success');
        setSelectedWaybillIds(new Set());
        fetchWaybillList(listPage);
      } else {
        showToast(json.error || '删除失败', 'error');
      }
    } finally {
      setDeleteLoading(false);
    }
  }, [selectedWaybillIds, listPage, fetchWaybillList]);

  // 单条删除运单
  const handleSingleDelete = useCallback(async (id: number) => {
    if (!confirm('确定删除该运单吗？')) return;
    setDeleteLoading(true);
    try {
      const res = await fetch('/api/waybills', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [id] }),
      });
      const json = await res.json();
      if (res.ok) {
        showToast('删除成功', 'success');
        setSelectedWaybillIds(prev => { const next = new Set(prev); next.delete(id); return next; });
        fetchWaybillList(listPage);
      } else {
        showToast(json.error || '删除失败', 'error');
      }
    } finally {
      setDeleteLoading(false);
    }
  }, [listPage, fetchWaybillList]);

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

      {/* 确认导入弹框 */}
      {confirmModalOpen && (
        <ConfirmImportModal
          validCount={validCount}
          duplicateCount={previewData.filter(r => r._errors?.['external_code']?.includes('已存在')).length}
          onConfirm={(mode) => {
            setConfirmModalOpen(false);
            handleSubmit(mode);
          }}
          onCancel={() => setConfirmModalOpen(false)}
          loading={submitting}
        />
      )}

      {/* Tab切换 */}
      <div style={{ display: 'flex', borderBottom: '1px solid #e8e8e8', padding: '0 0 0 16px', background: '#fff', flexShrink: 0 }}>
        {[
          { key: 'import', label: '文件上传', icon: 'upload' },
          { key: 'list', label: '运单管理', icon: 'file' },
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
            {/* 上传区（仅无预览数据时显示） */}
            {previewData.length === 0 && (
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
                        <div style={{ fontSize: 14, fontWeight: 600 }}>{uploadProgressText || '正在解析 Excel...'}</div>
                        <div style={{ height: 6, background: '#e8e8e8', borderRadius: 3, marginTop: 12, overflow: 'hidden', maxWidth: 320, margin: '0 auto' }}>
                          <div style={{ height: '100%', width: `${uploadProgress}%`, background: '#00BEBE', transition: 'width 0.4s ease' }} />
                        </div>
                        <div style={{ fontSize: 12, color: '#595959', marginTop: 6 }}>文件已上传，正在解析数据，请稍候...</div>
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
              </div>
            )}

            {/* 映射关系配置面板 */}
            {previewData.length > 0 && (
              <MappingPanel
                headers={headers}
                mapping={mapping}
                pendingMapping={pendingMapping}
                setPendingMapping={setPendingMapping}
                onReapply={handleReapplyMapping}
                onSaveTemplate={handleSaveTemplate}
                hasSavedMapping={hasSavedMapping}
                templateName={templateName}
                templateMatchNote={templateMatchNote}
                onReset={() => {
                  setPreviewData([]);
                  setHeaders([]);
                  setMapping({});
                  setHeaderHash('');
                  setPendingMapping({});
                  setIsManualMapping(false);
                  setSubmitResult(null);
                  setSelectedWaybillIds(new Set());
                  setTemplateMatchNote('');
                  setScrollTop(0);
                  setDismissAutoApply(false);
                }}
              />
            )}

            {/* 自动应用模板横幅 */}
            {previewData.length > 0 && hasSavedMapping && templateMatchNote && !dismissAutoApply && (
              <div style={{
                padding: '10px 14px', borderRadius: 6, background: '#e6f4ff',
                border: '1px solid #91caff', display: 'flex', alignItems: 'center', gap: 8,
                fontSize: 13, color: '#1677ff', marginBottom: 8,
              }}>
                <span style={{ fontSize: 16 }}>🔮</span>
                <span style={{ flex: 1 }}>
                  <strong>已自动应用映射规则</strong>（{templateMatchNote}），数据已按此规则解析
                </span>
                <button
                  onClick={() => setDismissAutoApply(true)}
                  style={{ fontSize: 12, padding: '2px 8px', border: '1px solid #91caff', borderRadius: 4, background: '#fff', color: '#1677ff', cursor: 'pointer' }}>
                  重新选择映射
                </button>
              </div>
            )}

            {/* 预览表格 */}
            {previewData.length > 0 && (
              <div style={{ background: '#fff', borderRadius: 8, border: '1px solid #e8e8e8', overflow: 'hidden' }}>
                {/* 操作栏 */}
                <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#262626' }}>
                    数据预览
                    <span style={{ fontWeight: 400, fontSize: 13, color: '#8c8c8c', marginLeft: 8 }}>
                      共 {previewData.length} 行（含 {invalidCount} 个错误行）
                      {previewData.length > 50 && (
                        <span style={{ marginLeft: 6, color: '#8c8c8c', fontWeight: 400 }}>
                          | 当前显示 {Math.max(1, Math.floor(scrollTop / ROW_HEIGHT) + 1)}–{Math.min(previewData.length, Math.floor(scrollTop / ROW_HEIGHT) + Math.ceil(500 / ROW_HEIGHT))} 行
                        </span>
                      )}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button onClick={addEmptyRow} style={{ height: 30, padding: '0 12px', border: '1px solid #d9d9d9', borderRadius: 4, background: '#fff', cursor: 'pointer', fontSize: 13, color: '#595959', display: 'flex', alignItems: 'center', gap: 4 }}
                      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#00BEBE'; (e.currentTarget as HTMLButtonElement).style.color = '#00BEBE'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#d9d9d9'; (e.currentTarget as HTMLButtonElement).style.color = '#595959'; }}>
                      <Icon name="plus" size={12} /> 新增行
                    </button>
                    <button onClick={handleExport} disabled={exportLoading}
                      style={{ height: 30, padding: '0 12px', border: '1px solid #d9d9d9', borderRadius: 4, background: exportLoading ? '#d9d9d9' : '#fff', cursor: exportLoading ? 'not-allowed' : 'pointer', fontSize: 13, color: exportLoading ? '#8c8c8c' : '#595959', display: 'flex', alignItems: 'center', gap: 4 }}
                      onMouseEnter={e => { if (!exportLoading) { (e.currentTarget as HTMLButtonElement).style.borderColor = '#00BEBE'; (e.currentTarget as HTMLButtonElement).style.color = '#00BEBE'; } }}
                      onMouseLeave={e => { if (!exportLoading) { (e.currentTarget as HTMLButtonElement).style.borderColor = '#d9d9d9'; (e.currentTarget as HTMLButtonElement).style.color = '#595959'; } }}>
                      {exportLoading ? '导出中...' : <><Icon name="download" size={12} /> 导出Excel</>}
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

                {/* 表格（虚拟滚动）：CSS Grid 实现 sticky header + 虚拟 body */}
                {(() => {
                  const containerHeight = 500; // maxHeight
                  const startIdx = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - BUFFER);
                  const visibleCount = Math.ceil(containerHeight / ROW_HEIGHT) + BUFFER * 2;
                  const endIdx = Math.min(previewData.length, startIdx + visibleCount);
                  const visibleRows = previewData.slice(startIdx, endIdx);
                  const totalHeight = previewData.length * ROW_HEIGHT;

                  return (
                    <div
                      style={{ overflowX: 'auto', maxHeight: 500 }}
                      onScroll={e => setScrollTop(e.currentTarget.scrollTop)}
                    >
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: '40px 60px repeat(' + SYSTEM_FIELDS.length + ', minmax(120px, 1fr)) 60px',
                        minWidth: 'max-content',
                        fontSize: 13,
                      }}>
                        {/* 表头行（sticky） */}
                        <div style={{
                          display: 'contents',
                        }}>
                          <div style={{
                            padding: '8px', textAlign: 'center', borderBottom: '2px solid #e8e8e8',
                            borderRight: '1px solid #f0f0f0', fontWeight: 600, color: '#595959',
                            background: '#fafafa', position: 'sticky', top: 0, left: 0, zIndex: 3,
                          }}>
                            <input type="checkbox" checked={allSelected} onChange={toggleAll} style={{ cursor: 'pointer', width: 16, height: 16 }} />
                          </div>
                          <div style={{ padding: '8px', textAlign: 'center', borderBottom: '2px solid #e8e8e8', borderRight: '1px solid #f0f0f0', fontWeight: 600, color: '#595959', background: '#fafafa', position: 'sticky', top: 0, zIndex: 2 }}>行号</div>
                          {SYSTEM_FIELDS.map((f, fi) => (
                            <div key={f.key} style={{ padding: '8px', borderBottom: '2px solid #e8e8e8', borderRight: '1px solid #f0f0f0', fontWeight: 600, color: f.required ? '#cf1322' : '#595959', background: '#fafafa', position: 'sticky', top: 0, zIndex: 2, whiteSpace: 'nowrap' }}>
                              {f.label}{f.required && <span style={{ color: '#ff4d4f', marginLeft: 2 }}>*</span>}
                            </div>
                          ))}
                          <div style={{ padding: '8px', borderBottom: '2px solid #e8e8e8', fontWeight: 600, color: '#595959', background: '#fafafa', position: 'sticky', top: 0, zIndex: 2 }}>操作</div>
                        </div>

                        {/* 虚拟滚动占位（撑满滚动高度） */}
                        <div style={{ gridColumn: '1 / -1', height: totalHeight, position: 'relative' }}>
                          {visibleRows.map((row, vIdx) => {
                            const rowIdx = startIdx + vIdx;
                            const isErr = !row._isValid;
                            return (
                              <div key={rowIdx} style={{
                                display: 'grid',
                                gridTemplateColumns: '40px 60px repeat(' + SYSTEM_FIELDS.length + ', minmax(120px, 1fr)) 60px',
                                minWidth: 'max-content',
                                position: 'absolute', top: rowIdx * ROW_HEIGHT,
                                width: '100%', height: ROW_HEIGHT,
                                background: isErr ? '#fff1f0' : '#fff',
                              }}>
                                <div style={{ padding: '4px 8px', textAlign: 'center', borderBottom: '1px solid #f0f0f0' }}>
                                  <input type="checkbox" checked={row._selected !== false} onChange={() => toggleRow(rowIdx)} style={{ cursor: 'pointer', width: 16, height: 16 }} />
                                </div>
                                <div style={{ padding: '4px 8px', textAlign: 'center', color: '#8c8c8c', borderBottom: '1px solid #f0f0f0', borderRight: '1px solid #f0f0f0', whiteSpace: 'nowrap', lineHeight: ROW_HEIGHT + 'px' }}>{row._rowIndex}</div>
                                {SYSTEM_FIELDS.map(f => (
                                  <div key={f.key} style={{ padding: '2px 4px', borderBottom: '1px solid #f0f0f0', borderRight: '1px solid #f0f0f0' }}>
                                    <EditableCell
                                      value={String(row[f.key as keyof WaybillRow] || '')}
                                      rowIndex={rowIdx}
                                      field={f.key}
                                      onChange={handleCellChange}
                                      error={row._errors?.[f.key]}
                                      options={f.options as readonly string[] | undefined}
                                    />
                                  </div>
                                ))}
                                <div style={{ padding: '4px 8px', borderBottom: '1px solid #f0f0f0', lineHeight: ROW_HEIGHT + 'px' }}>
                                  <button onClick={() => deleteRow(rowIdx)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ff4d4f', fontSize: 16, padding: 4 }} title="删除此行">×</button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* 提交区 */}
                <div style={{ padding: '12px 16px', borderTop: '1px solid #e8e8e8', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                  <div style={{ fontSize: 13, color: '#8c8c8c' }}>
                    已选 <strong style={{ color: invalidCount > 0 ? '#ff4d4f' : '#52c41a' }}>{totalSelected}</strong> 行，其中 {invalidCount > 0 ? <strong style={{ color: '#ff4d4f' }}>{invalidCount} 行有错误</strong> : <strong style={{ color: '#52c41a' }}>全部有效</strong>}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {submitting && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 200 }}>
                        <ProgressBar value={submitProgress} label={submitProgressText || '提交中...'} />
                        <div style={{ fontSize: 12, color: '#8c8c8c', textAlign: 'right' }}>
                          {submitProgressText}
                        </div>
                      </div>
                    )}
                    <button
                      onClick={() => setConfirmModalOpen(true)}
                      disabled={submitting || invalidCount > 0 || totalSelected === 0}
                      style={{
                        height: 36, padding: '0 24px', border: 'none', borderRadius: 4,
                        background: (submitting || invalidCount > 0 || totalSelected === 0) ? '#d9d9d9' : '#1677ff',
                        color: '#fff', cursor: (submitting || invalidCount > 0 || totalSelected === 0) ? 'not-allowed' : 'pointer',
                        fontSize: 14, fontWeight: 600,
                      }}>
                      {submitting ? '提交中...' : '确认导入'}
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
                  { label: '发件人姓名', key: 'sender_name', placeholder: '输入发件人姓名' },
                  { label: '发件人电话', key: 'sender_phone', placeholder: '输入发件人电话' },
                  { label: '收件人姓名', key: 'receiver_name', placeholder: '输入收件人姓名' },
                  { label: '收件人电话', key: 'receiver_phone', placeholder: '输入收件人电话' },
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
              <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
                <button onClick={() => fetchWaybillList(1)} disabled={listLoading}
                  style={{
                    height: 32, padding: '0 16px', border: 'none', borderRadius: 4,
                    background: listLoading ? '#d9d9d9' : '#00BEBE', color: '#fff',
                    cursor: listLoading ? 'not-allowed' : 'pointer', fontSize: 13
                  }}
                  onMouseEnter={e => { if (!listLoading) (e.currentTarget as HTMLButtonElement).style.background = '#00c4c4'; }}
                  onMouseLeave={e => { if (!listLoading) (e.currentTarget as HTMLButtonElement).style.background = '#00BEBE'; }}>
                  {listLoading ? '查询中...' : '查询'}
                </button>
                <button onClick={() => { setListQuery({ external_code: '', sender_name: '', sender_phone: '', receiver_name: '', receiver_phone: '', start_date: '', end_date: '' }); }}
                  style={{ height: 32, padding: '0 16px', border: '1px solid #d9d9d9', borderRadius: 4, background: '#fff', color: '#595959', cursor: 'pointer', fontSize: 13 }}>重置</button>
                <button
                  onClick={handleBatchDelete}
                  disabled={deleteLoading || selectedWaybillIds.size === 0}
                  style={{
                    height: 32, padding: '0 14px', border: selectedWaybillIds.size > 0 ? 'none' : '1px solid #ffccc7', borderRadius: 4,
                    background: selectedWaybillIds.size > 0 ? '#ff4d4f' : '#fff', color: selectedWaybillIds.size > 0 ? '#fff' : '#ff4d4f',
                    cursor: deleteLoading || selectedWaybillIds.size === 0 ? 'not-allowed' : 'pointer',
                    fontSize: 13, display: 'flex', alignItems: 'center', gap: 4,
                    opacity: deleteLoading ? 0.6 : 1,
                  }}
                  onMouseEnter={e => { if (!deleteLoading && selectedWaybillIds.size > 0) (e.currentTarget as HTMLButtonElement).style.background = '#ff7875'; }}
                  onMouseLeave={e => { if (!deleteLoading && selectedWaybillIds.size > 0) (e.currentTarget as HTMLButtonElement).style.background = '#ff4d4f'; }}
                >
                  <Icon name="delete" size={13} />
                  {deleteLoading ? '删除中...' : `删除${selectedWaybillIds.size > 0 ? ` (${selectedWaybillIds.size})` : ''}`}
                </button>
                <button
                  onClick={handleListExport}
                  disabled={exportLoading}
                  style={{
                    height: 32, padding: '0 14px', border: '1px solid #d9d9d9', borderRadius: 4,
                    background: exportLoading ? '#d9d9d9' : '#fff', color: exportLoading ? '#8c8c8c' : '#595959',
                    cursor: exportLoading ? 'not-allowed' : 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 4,
                  }}
                  onMouseEnter={e => { if (!exportLoading) { (e.currentTarget as HTMLButtonElement).style.borderColor = '#1677ff'; (e.currentTarget as HTMLButtonElement).style.color = '#1677ff'; } }}
                  onMouseLeave={e => { if (!exportLoading) { (e.currentTarget as HTMLButtonElement).style.borderColor = '#d9d9d9'; (e.currentTarget as HTMLButtonElement).style.color = '#595959'; } }}>
                  {exportLoading ? '导出中...' : <><Icon name="download" size={13} /> 导出</>}
                </button>
              </div>
            </div>

            {/* 列表 */}
            <div style={{ background: '#fff', borderRadius: 8, border: '1px solid #e8e8e8', overflow: 'hidden' }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0', fontSize: 14, fontWeight: 600, color: '#262626', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  运单列表 <span style={{ fontWeight: 400, color: '#8c8c8c' }}>（共 {listTotal} 条）</span>
                  {selectedWaybillIds.size > 0 && (
                    <span style={{ marginLeft: 12, fontSize: 13, color: '#1677ff' }}>已选 {selectedWaybillIds.size} 条</span>
                  )}
                </div>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: 'max-content', minWidth: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: '#fafafa' }}>
                      <th style={{ padding: '8px 10px', textAlign: 'center', borderBottom: '1px solid #e8e8e8', whiteSpace: 'nowrap', fontWeight: 600, color: '#595959', width: 40 }}>
                        <input type="checkbox"
                          checked={waybillList.length > 0 && selectedWaybillIds.size === waybillList.length}
                          ref={el => { if (el) el.indeterminate = selectedWaybillIds.size > 0 && selectedWaybillIds.size < waybillList.length; }}
                          onChange={e => toggleAllWaybillSelect(e.target.checked)}
                          style={{ cursor: 'pointer', width: 14, height: 14 }} />
                      </th>
                      {['ID', '外部编码', '发件人姓名', '发件人电话', '发件人地址', '收件人姓名', '收件人电话', '收件人地址', '重量(kg)', '件数', '温层', '备注', '状态', '创建时间'].map(h => (
                        <th key={h} style={{ padding: '8px 10px', textAlign: 'left', borderBottom: '1px solid #e8e8e8', whiteSpace: 'nowrap', fontWeight: 600, color: '#595959' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {listLoading ? (
                      <tr><td colSpan={15} style={{ padding: 40, textAlign: 'center', color: '#8c8c8c' }}>加载中...</td></tr>
                    ) : waybillList.length === 0 ? (
                      <tr><td colSpan={15} style={{ padding: 40, textAlign: 'center', color: '#8c8c8c' }}>暂无数据</td></tr>
                    ) : waybillList.map(w => (
                      <tr key={w.id} style={{ borderBottom: '1px solid #f0f0f0', background: selectedWaybillIds.has(w.id) ? '#fff1f0' : '#fff' }}
                        onMouseEnter={e => { if (!selectedWaybillIds.has(w.id)) e.currentTarget.style.background = '#fafafa'; }}
                        onMouseLeave={e => { if (!selectedWaybillIds.has(w.id)) e.currentTarget.style.background = '#fff'; }}>
                        <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                          <input type="checkbox" checked={selectedWaybillIds.has(w.id)}
                            onChange={() => toggleWaybillSelect(w.id)}
                            style={{ cursor: 'pointer', width: 14, height: 14 }} />
                        </td>
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
                        <td style={{ padding: '8px 10px', color: '#8c8c8c', whiteSpace: 'nowrap' }}>{fmtDate(w.created_at)}</td>
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
