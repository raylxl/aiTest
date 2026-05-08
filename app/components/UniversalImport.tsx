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
  value, rowIndex, field, onChange, error, warning, options, onTabNext, totalFields, fieldIndex,
}: {
  value: string; rowIndex: number; field: string;
  onChange: (rowIdx: number, field: string, value: string) => void;
  error?: string; warning?: string; options?: readonly string[];
  onTabNext?: (rowIdx: number, fieldIdx: number, shiftKey: boolean) => void;
  totalFields?: number; fieldIndex?: number;
}) {
  const [editing, setEditing] = useState(false);
  const [editVal, setEditVal] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setEditVal(value); }, [value]);

  const commitEdit = () => {
    setEditing(false);
    if (editVal !== value) onChange(rowIndex, field, editVal);
  };

  // 通用键盘处理：Enter/Tab 提交并跳转，Shift+Tab 后退
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement | HTMLSelectElement>) => {
    if (e.key === 'Enter') {
      commitEdit();
      if (totalFields !== undefined && fieldIndex !== undefined && onTabNext) {
        onTabNext(rowIndex, fieldIndex, false);
      }
    } else if (e.key === 'Tab') {
      e.preventDefault();
      commitEdit();
      if (totalFields !== undefined && fieldIndex !== undefined && onTabNext) {
        onTabNext(rowIndex, fieldIndex, e.shiftKey);
      }
    } else if (e.key === 'Escape') {
      setEditVal(value);
      setEditing(false);
    }
  };

  const hasWarning = !!warning && !error;
  const bg = error ? '#fff1f0' : hasWarning ? '#fffbe6' : value ? '#fff' : '#fafafa';
  const borderColor = error ? '#ffccc7' : hasWarning ? '#ffd591' : 'transparent';
  const textColor = error ? '#ff4d4f' : hasWarning ? '#d46b08' : '#262626';

  if (options) {
    return editing ? (
      <select
        value={editVal} onChange={e => { setEditVal(e.target.value); onChange(rowIndex, field, e.target.value); setEditing(false); }}
        onKeyDown={handleKeyDown}
        autoFocus style={{ width: '100%', height: 32, border: '1px solid #00BEBE', borderRadius: 4, padding: '0 6px', fontSize: 13, outline: 'none', background: '#fff' }}
      >
        <option value="">请选择</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    ) : (
      <div onClick={() => setEditing(true)} style={{
        padding: '0 8px', minHeight: 32, lineHeight: '32px', cursor: 'text',
        background: bg, border: `1px solid ${borderColor}`, borderRadius: 4, fontSize: 13,
        color: textColor,
      }}>
        {value || <span style={{ color: '#bfbfbf' }}>点击选择</span>}
      </div>
    );
  }

  return editing ? (
    <input
      ref={inputRef} value={editVal} onChange={e => setEditVal(e.target.value)}
      onBlur={commitEdit} onKeyDown={handleKeyDown}
      style={{ width: '100%', height: 32, border: '1px solid #00BEBE', borderRadius: 4, padding: '0 6px', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
    />
  ) : (
    <div onClick={() => setEditing(true)} style={{
      padding: '0 8px', minHeight: 32, lineHeight: '32px', cursor: 'text',
      background: bg,
      border: `1px solid ${borderColor}`, borderRadius: 4, fontSize: 13,
      color: textColor, position: 'relative',
    }}>
      {value || <span style={{ color: '#bfbfbf' }}>点击编辑</span>}
      {error && (
        <span style={{ position: 'absolute', bottom: -18, left: 0, fontSize: 11, color: '#ff4d4f', whiteSpace: 'nowrap', background: '#fff', border: '1px solid #ffccc7', borderRadius: 3, padding: '1px 4px', zIndex: 10, cursor: 'default' }} title={`错误：${error}`}>
          {error}
        </span>
      )}
      {hasWarning && (
        <span style={{ position: 'absolute', bottom: -18, left: 0, fontSize: 11, color: '#d46b08', whiteSpace: 'nowrap', background: '#fff', border: '1px solid #ffd591', borderRadius: 3, padding: '1px 4px', zIndex: 10, cursor: 'default' }} title={`警告：${warning}`}>
          ⚠ {warning}
        </span>
      )}
    </div>
  );
}

// ============ MappingPanel 组件 ============
function MappingPanel({
  headers, mapping, pendingMapping, setPendingMapping,
  onReapply, onSaveTemplate, hasSavedMapping, templateName, templateMatchNote, onReset, disabled
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
  disabled?: boolean;
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
              onClick={() => !disabled && onReapply(currentMapping)}
              disabled={disabled}
              style={{ height: 32, padding: '0 16px', border: '1px solid #00BEBE', borderRadius: 4, background: disabled ? '#d9d9d9' : '#00BEBE', color: disabled ? '#8c8c8c' : '#fff', cursor: disabled ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 500 }}
            >
              {disabled ? '⟳ 重新解析中...' : '🔄 重新解析数据'}
            </button>
            <button
              onClick={() => !disabled && onSaveTemplate(currentMapping)}
              disabled={disabled}
              style={{ height: 32, padding: '0 16px', border: '1px solid #d9d9d9', borderRadius: 4, background: disabled ? '#f5f5f5' : '#fff', color: disabled ? '#bfbfbf' : '#595959', cursor: disabled ? 'not-allowed' : 'pointer', fontSize: 13 }}
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
  const [selectedMode, setSelectedMode] = React.useState<'skip' | 'overwrite'>('skip');

  const OptionCard = ({ mode, label, desc, color }: { mode: 'skip' | 'overwrite'; label: string; desc: string; color: string }) => {
    const isActive = selectedMode === mode;
    return (
      <div
        onClick={() => !loading && setSelectedMode(mode)}
        style={{
          display: 'block', padding: '12px 14px', border: `2px solid ${isActive ? '#1677ff' : '#d9d9d9'}`,
          borderRadius: 8, marginBottom: 10, cursor: loading ? 'not-allowed' : 'pointer',
          background: isActive ? '#e6f4ff' : '#fafafa', transition: 'all 0.15s',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 16, height: 16, borderRadius: '50%',
            border: `2px solid ${isActive ? '#1677ff' : '#d9d9d9'}`,
            background: isActive ? '#1677ff' : '#fff',
            flexShrink: 0, transition: 'all 0.15s',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {isActive && <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff' }} />}
          </div>
          <div>
            <strong style={{ color: '#262626', fontSize: 14 }}>{label}</strong>
            <div style={{ fontSize: 12, color, marginTop: 3 }}>{desc}</div>
          </div>
        </div>
      </div>
    );
  };

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

        <OptionCard
          mode="skip"
          label="跳过冲突（推荐）"
          desc={duplicateCount > 0 ? `已有编码的 ${duplicateCount} 条将被跳过，不更新` : '数据库中无重复编码，等效于直接插入'}
          color="#8c8c8c"
        />
        <OptionCard
          mode="overwrite"
          label="覆盖已有数据"
          desc={duplicateCount > 0 ? `已有编码的 ${duplicateCount} 条将被覆盖更新，请谨慎操作！` : '无重复编码，此选项等效于直接插入'}
          color="#ff4d4f"
        />

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
            disabled={loading}
            style={{ height: 34, padding: '0 16px', border: '1px solid #d9d9d9', borderRadius: 4, background: '#fff', color: '#595959', cursor: loading ? 'not-allowed' : 'pointer', fontSize: 13 }}>
            取消
          </button>
          <button
            onClick={() => onConfirm(selectedMode)}
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
  const [rawRows, setRawRows] = useState<unknown[][]>([]); // 原始 Excel 行数据，用于重新映射
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [headerHash, setHeaderHash] = useState('');
  const [hasSavedMapping, setHasSavedMapping] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templateMatchNote, setTemplateMatchNote] = useState('');
  const [isManualMapping, setIsManualMapping] = useState(false);
  const [pendingMapping, setPendingMapping] = useState<Record<string, string>>({});
  const [isGrouped, setIsGrouped] = useState(false); // 是否为分组表头

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
  const TABLE_MIN_HEIGHT = 400; // 表格最小高度（px）
  const TABLE_MAX_HEIGHT = 600; // 表格最大高度（px）
  const [tableHeight, setTableHeight] = useState(TABLE_MIN_HEIGHT);
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLDivElement>(null); // 用于 Tab 导航：指向外层 grid 容器
  const [dismissAutoApply, setDismissAutoApply] = useState(false); // 是否已撤销自动应用

  // Tab/Enter 导航：聚焦到指定行列的单元格
  const focusCell = useCallback((targetRow: number, targetFieldIdx: number) => {
    if (!tableRef.current) return;
    const container = tableRef.current;
    // container 下面结构：div(表头) + div(撑高占位)
    // 占位 div 内每个子 div 是一行，含 EditableCell
    const spacer = container.querySelector(':scope > div:last-child') as HTMLElement | null;
    if (!spacer) return;
    const rowDivs = spacer.querySelectorAll(':scope > div');
    // rowDiv: checkbox | 行号 | SYSTEM_FIELDS×EditableCell | delete
    // EditableCell 在 col index 2 ~ 2+N-1
    const cellIndex = 2 + targetFieldIdx;
    const targetRowDiv = rowDivs[targetRow];
    if (!targetRowDiv) return;
    const cells = targetRowDiv.querySelectorAll(':scope > div');
    const targetCell = cells[cellIndex];
    if (!targetCell) return;
    // 找到 cell 内的 input 或 select 并聚焦，同时触发编辑态
    const input = targetCell.querySelector('input') as HTMLInputElement | null;
    const select = targetCell.querySelector('select') as HTMLSelectElement | null;
    const displayDiv = targetCell.querySelector('div') as HTMLElement | null;
    if (input) {
      input.focus();
      // 选中文本便于直接覆盖
      input.select();
    } else if (select) {
      select.focus();
    } else if (displayDiv) {
      displayDiv.click();
    }
  }, []);

  // onTabNext 回调：计算下一个单元格的行列索引，然后 focusCell
  const handleTabNext = useCallback((rowIdx: number, fieldIdx: number, shiftKey: boolean) => {
    const totalFields = SYSTEM_FIELDS.length;
    let nextFieldIdx: number;
    let nextRowIdx: number;
    if (shiftKey) {
      // Shift+Tab：后退
      if (fieldIdx > 0) {
        nextFieldIdx = fieldIdx - 1;
        nextRowIdx = rowIdx;
      } else {
        nextFieldIdx = totalFields - 1;
        nextRowIdx = Math.max(0, rowIdx - 1);
      }
    } else {
      // Tab：前进
      if (fieldIdx < totalFields - 1) {
        nextFieldIdx = fieldIdx + 1;
        nextRowIdx = rowIdx;
      } else {
        nextFieldIdx = 0;
        nextRowIdx = Math.min(previewData.length - 1, rowIdx + 1);
      }
    }
    focusCell(nextRowIdx, nextFieldIdx);
  }, [focusCell, previewData.length]);

  // 计算所有错误/警告（前置到这里，供 hooks 引用）
  const computedAllErrors: Array<{ row: number; field: string; msg: string }> = [];
  for (const row of previewData) {
    if (row._errors) {
      for (const [f, msg] of Object.entries(row._errors)) {
        const label = SYSTEM_FIELDS.find(sf => sf.key === f)?.label || f;
        computedAllErrors.push({ row: row._rowIndex, field: label, msg });
      }
    }
  }
  const computedAllWarnings: Array<{ row: number; field: string; msg: string }> = [];
  for (const row of previewData) {
    if (row._warnings) {
      for (const [f, msg] of Object.entries(row._warnings)) {
        const label = SYSTEM_FIELDS.find(sf => sf.key === f)?.label || f;
        computedAllWarnings.push({ row: row._rowIndex, field: label, msg });
      }
    }
  }

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

  // 行跳转高亮
  const [highlightedRow, setHighlightedRow] = useState<number | null>(null);
  // 错误面板：有错误时默认展开，用户手动关闭后保持关闭
  const [errorPanelOpen, setErrorPanelOpen] = useState(false);

  // 初始化错误面板状态（有错误时默认展开）
  useEffect(() => {
    if (computedAllErrors.length > 0 || computedAllWarnings.length > 0) setErrorPanelOpen(true);
  }, []); // 仅首次渲染时自动展开

  // 滚动到指定行（通过容器 scrollTo）
  const scrollToRow = useCallback((rowIndex: number) => {
    const container = tableContainerRef.current;
    if (!container) return;
    const targetTop = rowIndex * ROW_HEIGHT;
    const containerTop = container.scrollTop;
    const containerHeight = container.clientHeight;
    if (targetTop < containerTop || targetTop > containerTop + containerHeight - ROW_HEIGHT) {
      container.scrollTo({ top: targetTop - containerHeight / 2 + ROW_HEIGHT / 2, behavior: 'smooth' });
    }
    setHighlightedRow(rowIndex);
    setTimeout(() => setHighlightedRow(null), 1500);
  }, []);

  // 当前激活的 tab
  const [activeTab, setActiveTab] = useState<'import' | 'list'>('import');

  // 全选状态
  const allSelected = previewData.length > 0 && previewData.every(r => r._selected !== false);
  const someSelected = previewData.some(r => r._selected !== false);

  // 所有错误列表（引用前置计算结果）
  const allErrors = computedAllErrors;

  // 所有警告列表（引用前置计算结果）
  const allWarnings = computedAllWarnings;

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
    let fallbackInterval: ReturnType<typeof setInterval> | null = null;
    let uploadDone = false; // 标记上传是否已完成（onprogress是否触发过）

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

      // Step 2：前端解析进度（基于实际数据行数，0→25%）
      // 解析是同步的，在 setTimeout 里用实际总行数做倒计时模拟
      let rowsParsed = 0;
      const ROWS_PER_TICK = Math.max(1, Math.ceil(totalRows / 25)); // 每 tick 解析的行数，25 tick 刚好到 25%
      progressInterval = setInterval(() => {
        rowsParsed = Math.min(rowsParsed + ROWS_PER_TICK, totalRows);
        const pct = Math.round((rowsParsed / totalRows) * 25);
        setUploadProgress(pct);
        setUploadProgressText(`正在解析文件... ${rowsParsed}/${totalRows} 条`);
        if (rowsParsed >= totalRows) {
          clearInterval(progressInterval!);
        }
      }, 60); // 60ms/tick，25 tick ≈ 1.5s 覆盖常见解析耗时

      // Step 3：XHR 真实上传进度（覆盖 25%~92%，服务器处理占 92%~100%）
      const json = await new Promise<Record<string, unknown>>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        const formData = new FormData();
        formData.append('file', file);

        let fallbackTick = 0;

        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            uploadDone = true;
            if (fallbackInterval) { clearInterval(fallbackInterval); fallbackInterval = null; }
            // 上传进度: 25%~92%
            const uploadPct = Math.round((e.loaded / e.total) * 100);
            const displayPct = Math.round(25 + uploadPct * 0.67);
            setUploadProgress(Math.min(displayPct, 92));
            setUploadProgressText(`正在上传... ${displayPct}%`);
          }
        };

        // 兜底：如果 onprogress 没触发（文件小/连接快），用时间模拟（每 100ms +2%）
        fallbackInterval = setInterval(() => {
          if (uploadDone) { clearInterval(fallbackInterval!); fallbackInterval = null; return; }
          fallbackTick++;
          const displayPct = Math.min(25 + fallbackTick * 2, 92);
          setUploadProgress(displayPct);
          setUploadProgressText(`正在上传... ${displayPct}%`);
          if (fallbackTick >= 33) { clearInterval(fallbackInterval!); fallbackInterval = null; }
        }, 100);

        xhr.onload = () => {
          if (progressInterval) { clearInterval(progressInterval); progressInterval = null; }
          if (fallbackInterval) { clearInterval(fallbackInterval); fallbackInterval = null; }
          try {
            const data = JSON.parse(xhr.responseText);
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve(data as Record<string, unknown>);
            } else {
              reject(new Error((data as { error?: string }).error || `上传失败 (${xhr.status})`));
            }
          } catch {
            reject(new Error(xhr.statusText || '解析响应失败'));
          }
        };

        xhr.onerror = () => {
          if (progressInterval) { clearInterval(progressInterval); progressInterval = null; }
          if (fallbackInterval) { clearInterval(fallbackInterval); fallbackInterval = null; }
          reject(new Error('网络错误，上传失败'));
        };

        xhr.open('POST', '/api/waybills/upload');
        xhr.send(formData);
      });

      // Step 4：后端返回后，设 100%
      setUploadProgress(100);
      setUploadProgressText(`上传完成，正在处理...`);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = json as any;
      setHeaders(data.headers || []);
      setMapping(data.mapping || {});
      setHeaderHash(data.headerHash || '');
      setHasSavedMapping(data.hasSavedMapping || false);
      setTemplateName(data.templateName || '');
      setTemplateMatchNote(data.templateMatchNote || '');
      setPendingMapping({});
      setDismissAutoApply(false);
      setIsManualMapping(false);
      setIsGrouped(data.isGrouped || false);
      setPreviewData(data.rows || []);
      // 保存原始行数据（不含表头），用于重新映射
      setRawRows(data.rawRows || []);
      showToast(
        `解析成功，共 ${data.totalCount} 条数据${data.totalErrors > 0 ? `，其中 ${data.totalErrors} 条有错误` : ''}`,
        data.totalErrors > 0 ? 'warning' : 'success'
      );
    } catch (e) {
      showToast('上传失败：' + (e instanceof Error ? e.message : String(e)), 'error');
    } finally {
      if (progressInterval) { clearInterval(progressInterval); progressInterval = null; }
      if (fallbackInterval) { clearInterval(fallbackInterval); fallbackInterval = null; }
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
          rawRows,           // 原始行数据，用新映射重新解析
          rawHeaders: headers,
          newMapping,
          isGrouped,
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
      setIsGrouped(json.isGrouped ?? false);
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
      // 编辑字段时清除该字段的警告（如用户修改了外部编码）
      const warnings = { ...row._warnings };
      if (warnings[field]) delete warnings[field];
      return { ...updated, _errors: errors, _warnings: warnings, _isValid: Object.keys(errors).length === 0 } as WaybillRow;
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
        setRawRows([]);
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

  // 运单列表导出（调 /api/waybills/export 获取全量数据）
  const handleListExport = useCallback(async () => {
    setExportLoading(true);
    try {
      const params = new URLSearchParams();
      if (listQuery.external_code) params.set('external_code', listQuery.external_code);
      if (listQuery.sender_name) params.set('sender_name', listQuery.sender_name);
      if (listQuery.sender_phone) params.set('sender_phone', listQuery.sender_phone);
      if (listQuery.receiver_name) params.set('receiver_name', listQuery.receiver_name);
      if (listQuery.receiver_phone) params.set('receiver_phone', listQuery.receiver_phone);
      if (listQuery.start_date) params.set('start_date', listQuery.start_date);
      if (listQuery.end_date) params.set('end_date', listQuery.end_date);

      const res = await fetch(`/api/waybills/export?${params}`);

      // 先克隆一份，避免读取 body 多次导致消费后无法再读
      const clone = res.clone();
      let blob: Blob;
      try {
        blob = await clone.blob();
      } catch {
        blob = new Blob();
      }

      // 尝试解析错误信息（仅当 HTTP 状态非 200 时）
      if (!res.ok) {
        try {
          const err = await res.json().catch(() => ({ error: '导出失败' }));
          showToast((err as { error?: string }).error || '导出失败', 'error');
        } catch {
          showToast('导出失败', 'error');
        }
        return;
      }

      if (blob.size === 0) {
        showToast('没有符合条件的数据', 'warning');
        return;
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `waybill_list_${Date.now()}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('导出成功', 'success');
    } catch (e) {
      showToast('导出失败', 'error');
    } finally {
      setExportLoading(false);
    }
  }, [listQuery]);

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

  // 动态计算表格高度（基于预览数据量，最多 TABLE_MAX_HEIGHT）
  useEffect(() => {
    if (previewData.length === 0) return;
    // 数据量 < 10 行时，按实际高度展示（最小 TABLE_MIN_HEIGHT）
    // 数据量 >= 10 行时，最多展示 TABLE_MAX_HEIGHT
    const idealHeight = Math.min(previewData.length * ROW_HEIGHT + 80, TABLE_MAX_HEIGHT);
    setTableHeight(Math.max(idealHeight, TABLE_MIN_HEIGHT));
  }, [previewData.length]);

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
      _errors: {}, _warnings: {}, _isValid: false,
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
        @keyframes rowHighlight {
          0%   { box-shadow: inset 0 0 0 2px #ff4d4f, 0 0 0 0 rgba(255,77,79,0.4); }
          50%  { box-shadow: inset 0 0 0 2px #ff4d4f, 0 0 16px 4px rgba(255,77,79,0.5); }
          100% { box-shadow: inset 0 0 0 2px transparent, 0 0 0 0 transparent; }
        }
        @keyframes panelSlideIn {
          from { opacity: 0; transform: translateX(12px); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>

      {toast && <Toast text={toast.text} type={toast.type} onClose={() => setToast(null)} />}

      {/* 确认导入弹框 */}
      {confirmModalOpen && (
        <ConfirmImportModal
          validCount={validCount}
          duplicateCount={previewData.filter(r => r._warnings?.['external_code']?.includes('已存在')).length}
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
                disabled={uploading}
                onSaveTemplate={handleSaveTemplate}
                hasSavedMapping={hasSavedMapping}
                templateName={templateName}
                templateMatchNote={templateMatchNote}
                onReset={() => {
                  setPreviewData([]);
                  setRawRows([]);
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
                  setIsGrouped(false);
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

            {/* 预览表格（表格区 + 右侧错误汇总侧边面板） */}
            {previewData.length > 0 && (
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                {/* 左侧：预览表格主区域 */}
                <div style={{ flex: 1, background: '#fff', borderRadius: 8, border: '1px solid #e8e8e8', overflow: 'hidden', minWidth: 0 }}>
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
                      {allErrors.length > 0 && (
                        <button
                          onClick={() => setErrorPanelOpen(v => !v)}
                          style={{ height: 30, padding: '0 12px', border: '1px solid #ff4d4f', borderRadius: 4, background: errorPanelOpen ? '#fff2f0' : '#fff', cursor: 'pointer', fontSize: 13, color: '#ff4d4f', display: 'flex', alignItems: 'center', gap: 4 }}>
                          {errorPanelOpen ? '✕ 收起面板' : `⚠ 查看错误 (${allErrors.length})`}
                        </button>
                      )}
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

                  {/* 表格（虚拟滚动）：CSS Grid 实现 sticky header + 虚拟 body */}
                  {(() => {
                    const startIdx = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - BUFFER);
                    const visibleCount = Math.ceil(tableHeight / ROW_HEIGHT) + BUFFER * 2;
                    const endIdx = Math.min(previewData.length, startIdx + visibleCount);
                    const visibleRows = previewData.slice(startIdx, endIdx);
                    const totalHeight = previewData.length * ROW_HEIGHT;

                    return (
                      <div
                        ref={tableContainerRef}
                        style={{ overflowX: 'auto', maxHeight: tableHeight }}
                        onScroll={e => setScrollTop(e.currentTarget.scrollTop)}
                      >
                        <div
                          ref={tableRef}
                          style={{
                          display: 'grid',
                          gridTemplateColumns: '40px 60px repeat(' + SYSTEM_FIELDS.length + ', minmax(120px, 1fr)) 60px',
                          minWidth: 'max-content',
                          fontSize: 13,
                        }}>
                          {/* 表头行（sticky） */}
                          <div style={{ display: 'contents' }}>
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
                              const isHighlighted = highlightedRow === rowIdx;
                              return (
                                <div key={rowIdx} style={{
                                  display: 'grid',
                                  gridTemplateColumns: '40px 60px repeat(' + SYSTEM_FIELDS.length + ', minmax(120px, 1fr)) 60px',
                                  minWidth: 'max-content',
                                  position: 'absolute', top: rowIdx * ROW_HEIGHT,
                                  width: '100%', height: ROW_HEIGHT,
                                  background: isHighlighted ? '#fff0f0' : isErr ? '#fff1f0' : '#fff',
                                  ...(isHighlighted ? { animation: 'rowHighlight 1.5s ease-out forwards' } : {}),
                                }}>
                                  <div style={{ padding: '4px 8px', textAlign: 'center', borderBottom: '1px solid #f0f0f0' }}>
                                    <input type="checkbox" checked={row._selected !== false} onChange={() => toggleRow(rowIdx)} style={{ cursor: 'pointer', width: 16, height: 16 }} />
                                  </div>
                                  <div style={{ padding: '4px 8px', textAlign: 'center', color: '#8c8c8c', borderBottom: '1px solid #f0f0f0', borderRight: '1px solid #f0f0f0', whiteSpace: 'nowrap', lineHeight: ROW_HEIGHT + 'px' }}>{row._rowIndex}</div>
                                  {SYSTEM_FIELDS.map((f, fi) => (
                                    <div key={f.key} style={{ padding: '2px 4px', borderBottom: '1px solid #f0f0f0', borderRight: '1px solid #f0f0f0' }}>
                                      <EditableCell
                                        value={String(row[f.key as keyof WaybillRow] || '')}
                                        rowIndex={rowIdx}
                                        field={f.key}
                                        onChange={handleCellChange}
                                        error={row._errors?.[f.key]}
                                        warning={row._warnings?.[f.key]}
                                        options={f.options as readonly string[] | undefined}
                                        onTabNext={handleTabNext}
                                        totalFields={SYSTEM_FIELDS.length}
                                        fieldIndex={fi}
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
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <div style={{ fontSize: 13, color: '#8c8c8c' }}>
                        已选 <strong style={{ color: invalidCount > 0 ? '#ff4d4f' : '#52c41a' }}>{totalSelected}</strong> 行，其中 {invalidCount > 0 ? <strong style={{ color: '#ff4d4f' }}>{invalidCount} 行有错误</strong> : <strong style={{ color: '#52c41a' }}>全部有效</strong>}
                      </div>
                      {invalidCount > 0 && (
                        <button
                          onClick={() => {
                            const firstErrRowIdx = previewData.findIndex(r => !r._isValid);
                            if (firstErrRowIdx !== -1) scrollToRow(firstErrRowIdx);
                          }}
                          style={{ height: 26, padding: '0 10px', border: '1px solid #ff4d4f', borderRadius: 4, background: '#fff', cursor: 'pointer', fontSize: 12, color: '#ff4d4f', display: 'flex', alignItems: 'center', gap: 4 }}>
                          📍 定位首个错误
                        </button>
                      )}
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

                {/* 右侧：错误汇总面板（可折叠侧边栏） */}
                {errorPanelOpen && (allErrors.length > 0 || allWarnings.length > 0) && (
                  <div
                    style={{
                      width: 280, flexShrink: 0,
                      background: '#fff', borderRadius: 8, border: '1px solid #e8e8e8',
                      overflow: 'hidden',
                      display: 'flex', flexDirection: 'column',
                      position: 'sticky', top: 0, maxHeight: tableHeight + 80,
                      animation: 'panelSlideIn 0.25s ease-out',
                    }}
                  >
                    {/* 面板头部 */}
                    <div style={{
                      padding: '10px 14px', borderBottom: '1px solid #f0f0f0',
                      background: '#fafafa', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#262626' }}>
                        📋 校验结果
                        {allErrors.length > 0 && <span style={{ color: '#ff4d4f', marginLeft: 4 }}>{allErrors.length}个错误</span>}
                        {allWarnings.length > 0 && <span style={{ color: '#d46b08', marginLeft: 4 }}>{allWarnings.length}个警告</span>}
                      </span>
                      <button
                        onClick={() => setErrorPanelOpen(false)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8c8c8c', fontSize: 16, padding: 0, lineHeight: 1 }}>
                        ×
                      </button>
                    </div>

                    {/* 错误列表 */}
                    <div style={{ flex: 1, overflow: 'auto', padding: '8px 0' }}>
                      {allErrors.length > 0 && (
                        <div style={{ padding: '0 12px 8px' }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: '#ff4d4f', marginBottom: 6 }}>
                            ❌ 错误（共 {allErrors.length} 个）
                          </div>
                          {allErrors.map((e, i) => {
                            // 找到对应行在 previewData 中的索引
                            const rowIdx = previewData.findIndex(r => r._rowIndex === e.row);
                            return (
                              <div
                                key={i}
                                onClick={() => { if (rowIdx !== -1) scrollToRow(rowIdx); }}
                                style={{
                                  padding: '6px 8px', marginBottom: 4, borderRadius: 4,
                                  background: '#fff2f0', border: '1px solid #ffccc7',
                                  fontSize: 12, color: '#cf1322', cursor: 'pointer',
                                  lineHeight: 1.5,
                                  transition: 'background 0.15s',
                                }}
                                onMouseEnter={e2 => { (e2.currentTarget as HTMLDivElement).style.background = '#ffe7e6'; }}
                                onMouseLeave={e2 => { (e2.currentTarget as HTMLDivElement).style.background = '#fff2f0'; }}
                                title={`点击跳转到第 ${e.row} 行`}
                              >
                                <div><strong>第{e.row}行</strong> · {e.field}</div>
                                <div style={{ color: '#ff4d4f' }}>{e.msg}</div>
                              </div>
                            );
                          })}
                          {allErrors.length > 50 && (
                            <div style={{ fontSize: 11, color: '#8c8c8c', textAlign: 'center', padding: '4px 0' }}>
                              ...还有 {allErrors.length - 50} 个错误
                            </div>
                          )}
                        </div>
                      )}

                      {allWarnings.length > 0 && (
                        <div style={{ padding: '0 12px' }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: '#d46b08', marginBottom: 6 }}>
                            ⚠ 警告（共 {allWarnings.length} 个，不影响提交）
                          </div>
                          {allWarnings.slice(0, 50).map((w, i) => (
                            <div key={i} style={{
                              padding: '5px 8px', marginBottom: 4, borderRadius: 4,
                              background: '#fffbe6', border: '1px solid #ffd591',
                              fontSize: 12, color: '#d46b08', lineHeight: 1.5,
                            }}>
                              <div><strong>第{w.row}行</strong> · {w.field}</div>
                              <div>{w.msg}</div>
                            </div>
                          ))}
                          {allWarnings.length > 50 && (
                            <div style={{ fontSize: 11, color: '#8c8c8c', textAlign: 'center', padding: '4px 0' }}>
                              ...还有 {allWarnings.length - 50} 个警告
                            </div>
                          )}
                        </div>
                      )}
                    </div>
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
