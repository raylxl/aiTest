'use client';

import React, { useMemo, useState, useRef, useCallback, useEffect } from 'react';
import type { FeeItem, QueryForm } from './types';
import Tooltip from './Tooltip';
import ConfirmDialog from './ConfirmDialog';
import Icon from './Icon';

// ============ 拖拽上传区域 ============
function DragDropZone({
  children, onFile, dragOver, setDragOver, disabled,
}: {
  children: React.ReactNode;
  onFile: (f: File) => void;
  dragOver: boolean;
  setDragOver: (v: boolean) => void;
  disabled: boolean;
}) {
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) onFile(file);
  }, [onFile, setDragOver]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) setDragOver(true);
  }, [disabled, setDragOver]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }, [setDragOver]);

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onClick={() => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.xlsx,.xls';
        input.onchange = () => { if (input.files?.[0]) onFile(input.files[0]); };
        input.click();
      }}
      style={{
        border: `2px dashed ${dragOver ? '#1677FF' : '#d9d9d9'}`,
        borderRadius: 8,
        padding: '32px 20px',
        textAlign: 'center',
        cursor: disabled ? 'not-allowed' : 'pointer',
        background: dragOver ? '#e6f4ff' : '#fafafa',
        transition: 'all 0.2s',
        userSelect: 'none',
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {children}
    </div>
  );
}

// ============ 映射面板 ============
const SYSTEM_FIELDS = [
  { key: 'fee_code', label: '费用编号', required: true },
  { key: 'fee_name', label: '费用名称', required: true },
  { key: 'business_domain', label: '所属业务域', required: true },
  { key: 'price_types', label: '所属报价', required: false },
  { key: 'remark', label: '备注', required: false },
  { key: 'creator', label: '创建人', required: false },
];

function MappingPanel({
  headers, pendingMapping, setPendingMapping, fieldLabelMap,
  onSaveTemplate, savedMappingCount,
}: {
  headers: string[];
  pendingMapping: Record<string, string>;
  setPendingMapping: (m: Record<string, string>) => void;
  fieldLabelMap: Record<string, string>;
  onSaveTemplate: () => void;
  savedMappingCount: number;
}) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div style={{ border: '1px solid #d9d9d9', borderRadius: 8, background: '#fff', marginTop: 12 }}>
      <div
        onClick={() => setCollapsed(c => !c)}
        style={{
          padding: '10px 16px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', borderBottom: collapsed ? 'none' : '1px solid #f0f0f0', userSelect: 'none',
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 600, color: '#262626', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: '#1677FF', fontSize: 16 }}>🔗</span>
          映射关系配置
          {savedMappingCount > 0 && (
            <span style={{ fontSize: 12, padding: '2px 8px', background: '#f6ffed', color: '#52c41a', borderRadius: 4, fontWeight: 400 }}>
              已保存 {savedMappingCount} 个模板
            </span>
          )}
        </div>
        <span style={{ color: '#8c8c8c', fontSize: 14 }}>{collapsed ? '▶' : '▼'}</span>
      </div>

      {!collapsed && (
        <div style={{ padding: '12px 16px' }}>
          <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 10 }}>
            请确认每个 Excel 列名对应的系统字段。如需调整，请在下方下拉框中选择正确的字段映射。
          </div>
          <div style={{ overflow: 'auto', maxHeight: 260, border: '1px solid #f0f0f0', borderRadius: 6 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#fafafa' }}>
                  <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: '#595959', borderBottom: '1px solid #e8e8e8', whiteSpace: 'nowrap' }}>Excel 列名</th>
                  <th style={{ padding: '8px 12px', width: 36, textAlign: 'center', color: '#d9d9d9', borderBottom: '1px solid #e8e8e8' }}>→</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: '#595959', borderBottom: '1px solid #e8e8e8', whiteSpace: 'nowrap' }}>映射到系统字段</th>
                </tr>
              </thead>
              <tbody>
                {headers.map((col, idx) => {
                  const currentMap = pendingMapping[col] || '';
                  const isRequired = SYSTEM_FIELDS.find(f => f.key === currentMap)?.required;
                  return (
                    <tr key={idx} style={{ borderBottom: idx < headers.length - 1 ? '1px solid #f5f5f5' : 'none' }}>
                      <td style={{ padding: '6px 12px', color: '#262626', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'monospace', fontSize: 12 }}>
                        {col}
                      </td>
                      <td style={{ padding: '6px 12px', textAlign: 'center', color: '#d9d9d9' }}>→</td>
                      <td style={{ padding: '4px 12px' }}>
                        <select
                          value={currentMap}
                          onChange={e => setPendingMapping({ ...pendingMapping, [col]: e.target.value })}
                          style={{
                            height: 30, padding: '0 8px', border: `1px solid ${currentMap ? '#d9d9d9' : '#ff4d4f'}`,
                            borderRadius: 4, fontSize: 13, outline: 'none', width: '100%', minWidth: 140,
                            background: '#fff', cursor: 'pointer', color: currentMap ? '#262626' : '#ff4d4f',
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
              onClick={onSaveTemplate}
              disabled={headers.length === 0}
              style={{
                height: 32, padding: '0 16px', border: '1px solid #d9d9d9', borderRadius: 4,
                background: headers.length === 0 ? '#f5f5f5' : '#fff', color: headers.length === 0 ? '#bfbfbf' : '#595959',
                cursor: headers.length === 0 ? 'not-allowed' : 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              <span>💾</span> 保存为模板
            </button>
            <div style={{ fontSize: 12, color: '#8c8c8c', lineHeight: '32px' }}>
              保存后，下次上传相同结构的文件将自动应用映射
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============ 进度条 ============
function ProgressBar({ value, label }: { value: number; label: string }) {
  return (
    <div style={{ minWidth: 220 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#595959', marginBottom: 4 }}>
        <span>{label}</span>
        <span style={{ fontWeight: 600, color: '#1677FF' }}>{value}%</span>
      </div>
      <div style={{ height: 6, background: '#f0f0f0', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${value}%`, background: 'linear-gradient(90deg, #1677FF, #4096ff)', borderRadius: 3, transition: 'width 0.3s' }} />
      </div>
    </div>
  );
}

interface FeeTableProps {
  data: FeeItem[];
  setData: React.Dispatch<React.SetStateAction<FeeItem[]>>;
  selectedRows: FeeItem[];
  setSelectedRows: React.Dispatch<React.SetStateAction<FeeItem[]>>;
  query: QueryForm;
  setQuery: React.Dispatch<React.SetStateAction<QueryForm>>;
  dialogVisible: boolean;
  setDialogVisible: React.Dispatch<React.SetStateAction<boolean>>;
  dialogTitle: string;
  setDialogTitle: React.Dispatch<React.SetStateAction<string>>;
  editRow: FeeItem | null;
  setEditRow: React.Dispatch<React.SetStateAction<FeeItem | null>>;
  form: { feeCode: string; feeName: string; businessDomain: string; priceTypes: string[]; remark: string };
  setForm: React.Dispatch<React.SetStateAction<{ feeCode: string; feeName: string; businessDomain: string; priceTypes: string[]; remark: string }>>;
  errors: Record<string, string>;
  setErrors: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  loading: boolean;
  setLoading: React.Dispatch<React.SetStateAction<boolean>>;
  fetchError: string;
  setFetchError: React.Dispatch<React.SetStateAction<string>>;
  msg: { text: string; type: string } | null;
  setMsg: React.Dispatch<React.SetStateAction<{ text: string; type: string } | null>>;
  page: number;
  setPage: React.Dispatch<React.SetStateAction<number>>;
  pageSize: number;
  setPageSize: React.Dispatch<React.SetStateAction<number>>;
  currentUserNickname: string;
  onMessage: (text: string, type: string) => void;
  fetchData: () => void;
}

const BUSINESS_DOMAINS = ['运配', '仓储', '干线', '配送'];
const PRICE_TYPES = ['平台价格', '成本价格', '基础价格', '网点价格', '增值服务价格'];

// ============== 单元格编辑相关 ==============

type EditableField = 'feeName' | 'businessDomain' | 'priceTypes' | 'remark';

// 校验单元格值，返回错误信息（空字符串=无错）
function validateCell(
  field: EditableField,
  value: unknown,
  allData: FeeItem[],
  currentId: number,
  pendingChanges: Map<number, Partial<FeeItem>>
): string {
  const strVal = typeof value === 'string' ? value : '';
  const arrVal = Array.isArray(value) ? value : [];

  if (field === 'feeName') {
    if (!strVal.trim()) return '费用名称不能为空';
    if (strVal.length > 32) return '最多32字符';
    return '';
  }
  if (field === 'businessDomain') {
    if (!strVal) return '请选择业务域';
    if (!BUSINESS_DOMAINS.includes(strVal)) return '业务域选项无效';
    return '';
  }
  if (field === 'priceTypes') {
    return ''; // priceTypes 非必填
  }
  if (field === 'remark') {
    if (strVal.length > 256) return '最多256字符';
    return '';
  }
  return '';
}

// 行级是否有错
function rowHasErrors(rowId: number, cellErrors: Map<string, string>): boolean {
  return ['feeName', 'businessDomain', 'remark'].some(f =>
    cellErrors.has(`${rowId}-${f}`)
  );
}

// ============== 可编辑单元格组件 ==============

interface EditableCellProps {
  field: EditableField;
  rowId: number;
  value: string | string[];
  displayValue: string | React.ReactNode;
  cellErrors: Map<string, string>;
  onChange: (rowId: number, field: EditableField, value: string | string[]) => void;
  onBlur: (rowId: number, field: EditableField, value: string | string[]) => void;
  onKeyDown: (e: React.KeyboardEvent, rowId: number, field: EditableField) => void;
  allData: FeeItem[];
  pendingChanges: Map<number, Partial<FeeItem>>;
}

function EditableCell({
  field, rowId, value, displayValue, cellErrors,
  onChange, onBlur, onKeyDown, allData, pendingChanges,
}: EditableCellProps) {
  const errKey = `${rowId}-${field}`;
  const hasError = cellErrors.has(errKey);
  const errorMsg = cellErrors.get(errKey) || '';

  const baseStyle: React.CSSProperties = {
    width: '100%',
    height: '100%',
    minHeight: 28,
    padding: '4px 8px',
    border: `1px solid ${hasError ? '#ff4d4f' : '#1677FF'}`,
    borderRadius: 3,
    fontSize: 13,
    outline: 'none',
    background: '#fff',
    color: '#262626',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
    boxShadow: hasError ? '0 0 0 2px rgba(255,77,79,0.15)' : '0 0 0 2px rgba(22,119,255,0.15)',
    transition: 'border-color 0.15s',
  };

  const renderControl = () => {
    if (field === 'feeName') {
      return (
        <input
          value={value as string}
          onChange={e => onChange(rowId, 'feeName', e.target.value)}
          onBlur={e => onBlur(rowId, 'feeName', e.target.value)}
          onKeyDown={e => onKeyDown(e, rowId, 'feeName')}
          maxLength={32}
          style={baseStyle}
        />
      );
    }
    if (field === 'businessDomain') {
      return (
        <select
          value={value as string}
          onChange={e => onChange(rowId, 'businessDomain', e.target.value)}
          onBlur={e => onBlur(rowId, 'businessDomain', e.target.value)}
          onKeyDown={e => onKeyDown(e, rowId, 'businessDomain')}
          style={{ ...baseStyle, cursor: 'pointer' }}
        >
          <option value="">请选择</option>
          {BUSINESS_DOMAINS.map(d => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
      );
    }
    if (field === 'priceTypes') {
      const selected = Array.isArray(value) ? value : [];
      return (
        <div
          onBlur={() => onBlur(rowId, 'priceTypes', selected)}
          style={{
            ...baseStyle,
            padding: '4px 8px',
            display: 'flex',
            flexWrap: 'wrap',
            gap: 4,
            alignItems: 'center',
            minHeight: 34,
            cursor: 'default',
          }}
          onKeyDown={e => onKeyDown(e, rowId, 'priceTypes')}
          tabIndex={-1}
        >
          {PRICE_TYPES.map(pt => (
            <label
              key={pt}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 3,
                padding: '2px 6px',
                borderRadius: 3,
                border: `1px solid ${selected.includes(pt) ? '#1677FF' : '#d9d9d9'}`,
                cursor: 'pointer',
                fontSize: 12,
                color: selected.includes(pt) ? '#1677FF' : '#595959',
                background: selected.includes(pt) ? '#e6f4ff' : '#fff',
                whiteSpace: 'nowrap',
                userSelect: 'none',
                transition: 'all 0.15s',
              }}
              onClick={e => {
                e.stopPropagation();
                const next = selected.includes(pt)
                  ? selected.filter(p => p !== pt)
                  : [...selected, pt];
                onChange(rowId, 'priceTypes', next);
              }}
            >
              <input type="checkbox" checked={selected.includes(pt)} onChange={() => {}} style={{ display: 'none' }} />
              {pt}
            </label>
          ))}
        </div>
      );
    }
    if (field === 'remark') {
      return (
        <textarea
          value={value as string}
          onChange={e => onChange(rowId, 'remark', e.target.value)}
          onBlur={e => onBlur(rowId, 'remark', e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Tab') { e.preventDefault(); onKeyDown(e, rowId, 'remark'); }
          }}
          maxLength={256}
          rows={2}
          style={{ ...baseStyle, resize: 'vertical', lineHeight: 1.5 }}
        />
      );
    }
    return null;
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: 41, padding: '4px 0' }}>
      {renderControl()}
      {hasError && (
        <div style={{
          fontSize: 11, color: '#ff4d4f', marginTop: 2,
          display: 'flex', alignItems: 'center', gap: 3,
          lineHeight: 1.2,
        }}>
          <span style={{ color: '#ff4d4f', flexShrink: 0 }}>✗</span>
          <span>{errorMsg}</span>
        </div>
      )}
    </div>
  );
}

const domainColor: Record<string, string> = {
  '运配': '#1677FF', '仓储': '#52c41a', '干线': '#fa8c16', '配送': '#f5222d'
};

// Icon 已提取到 ./Icon.tsx

export default function FeeTable({
  data, setData, selectedRows, setSelectedRows, query, setQuery,
  dialogVisible, setDialogVisible, dialogTitle, setDialogTitle,
  editRow, setEditRow, form, setForm, errors, setErrors,
  loading, setLoading, fetchError, setFetchError,
  msg, setMsg, page, setPage, pageSize, setPageSize,
  currentUserNickname, onMessage, fetchData,
}: FeeTableProps) {

  const showMsg = (text: string, type: string) => {
    onMessage(text, type);
    setTimeout(() => setMsg(null), 3000);
  };

  const filtered = useMemo(() => {
    return data.filter(item => {
      if (query.feeCode && !item.feeCode.includes(query.feeCode)) return false;
      if (query.feeName && !item.feeName.includes(query.feeName)) return false;
      if (query.businessDomain && item.businessDomain !== query.businessDomain) return false;
      if (query.priceType && !item.priceTypes.includes(query.priceType)) return false;
      return true;
    });
  }, [data, query]);

  const paginatedData = useMemo(() => filtered.slice((page - 1) * pageSize, page * pageSize), [filtered, page, pageSize]);

  const handleReset = () => { setQuery({ feeCode: '', feeName: '', businessDomain: '', priceType: '' }); setPage(1); fetchData(); };

  const openAdd = () => {
    setEditRow(null); setDialogTitle('新增费用类型');
    setForm({ feeCode: '', feeName: '', businessDomain: '运配', priceTypes: [], remark: '' });
    setErrors({}); setDialogVisible(true);
  };

  const openEdit = (row: FeeItem) => {
    setEditRow(row); setDialogTitle('编辑费用类型');
    setForm({ feeCode: row.feeCode, feeName: row.feeName, businessDomain: row.businessDomain, priceTypes: [...row.priceTypes], remark: row.remark });
    setErrors({}); setDialogVisible(true);
  };

  const [detailVisible, setDetailVisible] = useState(false);

  // 确认删除弹窗
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState<{ type: 'single' | 'batch'; item?: FeeItem }>({ type: 'single' });
  const openConfirm = (type: 'single' | 'batch', item?: FeeItem) => { setConfirmTarget({ type, item }); setConfirmVisible(true); };

  const [detailRow, setDetailRow] = useState<FeeItem | null>(null);
  const openDetail = (row: FeeItem) => { setDetailRow(row); setDetailVisible(true); };

  // ========== 考点4：在线编辑相关状态 ==========
  const [editMode, setEditMode] = useState(false);
  // 当前正在编辑的单元格：rowId + field
  const [editingCell, setEditingCell] = useState<{ rowId: number; field: EditableField } | null>(null);
  // 待保存的变更：rowId → { field: newValue }
  const [pendingChanges, setPendingChanges] = useState<Map<number, Partial<FeeItem>>>(new Map());
  // 单元格级错误：key = `${rowId}-${field}`
  const [cellErrors, setCellErrors] = useState<Map<string, string>>(new Map());
  const [savingInline, setSavingInline] = useState(false);
  // 编辑模式下行高亮（有过变更的行）
  const pendingRowIds = useMemo(() => new Set(pendingChanges.keys()), [pendingChanges]);

  // 激活单元格编辑
  const activateCell = useCallback((rowId: number, field: EditableField) => {
    if (!editMode) return;
    setEditingCell({ rowId, field });
    setCellErrors(prev => {
      const next = new Map(prev);
      // 清除该单元格的错误
      next.delete(`${rowId}-${field}`);
      return next;
    });
  }, [editMode]);

  // 单元格值变更（实时预览）
  const handleCellChange = useCallback((rowId: number, field: EditableField, value: string | string[]) => {
    // 更新 pendingChanges（不触发校验，blur 时校验）
    setPendingChanges(prev => {
      const next = new Map(prev);
      const existing = next.get(rowId) || {};
      next.set(rowId, { ...existing, [field]: value });
      return next;
    });
  }, []);

  // 单元格失焦：校验 + 保存
  const handleCellBlur = useCallback(async (rowId: number, field: EditableField, value: string | string[]) => {
    if (editingCell?.rowId !== rowId || editingCell?.field !== field) return;

    const dataCopy = data.map(r => {
      const pending = pendingChanges.get(r.id);
      if (r.id === rowId && pending) {
        return { ...r, ...pending };
      }
      return r;
    });

    const err = validateCell(field, value, dataCopy, rowId, pendingChanges);
    const errKey = `${rowId}-${field}`;

    if (err) {
      setCellErrors(prev => { const next = new Map(prev); next.set(errKey, err); return next; });
    } else {
      setCellErrors(prev => { const next = new Map(prev); next.delete(errKey); return next; });
    }

    // 立即提交到服务器
    if (!err) {
      setSavingInline(true);
      try {
        // 从 pendingChanges 取出完整行数据
        const pending = pendingChanges.get(rowId) || {};
        const baseRow = data.find(r => r.id === rowId);
        if (!baseRow) { setSavingInline(false); return; }

        const payload = {
          feeName: (field === 'feeName' ? value : (pending.feeName ?? baseRow.feeName)) as string,
          businessDomain: (field === 'businessDomain' ? value : (pending.businessDomain ?? baseRow.businessDomain)) as string,
          priceTypes: field === 'priceTypes' ? (value as string[]) : (pending.priceTypes ?? baseRow.priceTypes),
          remark: (field === 'remark' ? value : (pending.remark ?? baseRow.remark)) as string,
        };

        const res = await fetch(`/api/fees/${rowId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (res.ok) {
          // 清除 pending
          setPendingChanges(prev => {
            const next = new Map(prev);
            const existing = next.get(rowId) || {};
            const remaining = { ...existing };
            delete remaining[field];
            if (Object.keys(remaining).length === 0) { next.delete(rowId); }
            else { next.set(rowId, remaining); }
            return next;
          });
          showMsg(`${field === 'feeName' ? '费用名称' : field === 'businessDomain' ? '业务域' : field === 'priceTypes' ? '报价' : '备注'}已保存`, 'success');
          fetchData();
        } else {
          const json = await res.json();
          setCellErrors(prev => { const next = new Map(prev); next.set(errKey, json.error || '保存失败'); return next; });
          showMsg(json.error || '保存失败', 'error');
        }
      } finally {
        setSavingInline(false);
      }
    }

    setEditingCell(null);
  }, [editingCell, data, pendingChanges, fetchData, showMsg]);

  // Tab/Enter 键盘导航
  const EDITABLE_FIELDS: EditableField[] = ['feeName', 'businessDomain', 'priceTypes', 'remark'];
  const handleCellKeyDown = useCallback((
    e: React.KeyboardEvent, rowId: number, field: EditableField
  ) => {
    const fieldIdx = EDITABLE_FIELDS.indexOf(field);
    const currentRowIdx = paginatedData.findIndex(r => r.id === rowId);

    if (e.key === 'Tab') {
      e.preventDefault();
      const nextField = EDITABLE_FIELDS[fieldIdx + 1];
      if (nextField) {
        setEditingCell({ rowId, field: nextField });
      } else {
        // 跳到下一行第一列
        const nextRow = paginatedData[currentRowIdx + 1];
        if (nextRow) {
          setEditingCell({ rowId: nextRow.id, field: EDITABLE_FIELDS[0] });
        }
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      // Enter = 保存 + 跳到下一行同列
      const nextRow = paginatedData[currentRowIdx + 1];
      if (nextRow) {
        setEditingCell({ rowId: nextRow.id, field });
      }
    } else if (e.key === 'Escape') {
      setEditingCell(null);
    }
  }, [paginatedData]);

  // 切换编辑模式
  const toggleEditMode = useCallback(() => {
    if (editMode) {
      // 退出编辑模式，清空所有编辑状态
      setEditMode(false);
      setEditingCell(null);
      setPendingChanges(new Map());
      setCellErrors(new Map());
    } else {
      setEditMode(true);
    }
  }, [editMode]);

  // 获取单元格实际显示值（考虑 pendingChanges）
  const getCellValue = (row: FeeItem, field: EditableField): string | string[] => {
    const pending = pendingChanges.get(row.id);
    if (pending && field in pending) {
      return (pending as Record<string, unknown>)[field] as string | string[];
    }
    if (field === 'feeName') return row.feeName;
    if (field === 'businessDomain') return row.businessDomain;
    if (field === 'priceTypes') return row.priceTypes;
    if (field === 'remark') return row.remark;
    return '';
  };

  // Import/Export state
  const [importModalVisible, setImportModalVisible] = useState(false);
  const [importPreview, setImportPreview] = useState<{
    total: number;
    validCount: number;
    errorCount: number;
    preview: Array<{ row: number; fee_code: string; fee_name: string; business_domain: string; price_types: string[]; remark: string; creator: string; errors: string[] }>;
    allRows: Array<{ row: number; fee_code: string; fee_name: string; business_domain: string; price_types: string[]; remark: string; creator: string }>;
  } | null>(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ inserted: number; skipped: number; errors: string[] } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [importHeaders, setImportHeaders] = useState<string[]>([]);
  const [headerHash, setHeaderHash] = useState('');
  const [fieldLabelMap, setFieldLabelMap] = useState<Record<string, string>>({});
  const [pendingMapping, setPendingMapping] = useState<Record<string, string>>({});
  const [savedMappingCount, setSavedMappingCount] = useState(0);
  const [importProgress, setImportProgress] = useState(0);
  const [importProgressText, setImportProgressText] = useState('');
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleExport = () => {
    showMsg('正在导出...', 'info');
    window.open('/api/fees/export', '_blank');
    setTimeout(() => setMsg(null), 2000);
  };

  // 加载已保存的映射模板数量
  useEffect(() => {
    try {
      const saved = localStorage.getItem('fee_import_templates');
      const templates = saved ? JSON.parse(saved) : {};
      setSavedMappingCount(Object.keys(templates).length);
    } catch { setSavedMappingCount(0); }
  }, []);

  // 从 localStorage 查找匹配的已保存模板
  const findSavedTemplate = (hash: string): Record<string, string> | null => {
    try {
      const saved = localStorage.getItem('fee_import_templates');
      if (!saved) return null;
      const templates = JSON.parse(saved);
      return templates[hash] || null;
    } catch { return null; }
  };

  // 保存模板到 localStorage
  const handleSaveTemplate = useCallback((hash: string, mapping: Record<string, string>) => {
    try {
      const saved = localStorage.getItem('fee_import_templates');
      const templates = saved ? JSON.parse(saved) : {};
      templates[hash] = mapping;
      localStorage.setItem('fee_import_templates', JSON.stringify(templates));
      setSavedMappingCount(Object.keys(templates).length);
      showMsg('模板已保存，下次上传相同结构文件将自动应用映射', 'success');
    } catch {
      showMsg('模板保存失败', 'error');
    }
  }, []);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await doParseFile(file);
  };

  const doParseFile = async (file: File) => {
    setImportLoading(true);
    setImportResult(null);
    setPendingMapping({});
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/fees/import', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok) {
        showMsg(json.error || '解析失败', 'error');
        return;
      }

      // 模板记忆：检查是否有已保存的映射
      const hash = json.headerHash || '';
      const savedMapping = hash ? findSavedTemplate(hash) : null;

      // 构建列名→字段映射（从 API 返回的 fieldLabelMap）
      const mapping: Record<string, string> = {};
      const rawLabelMap = json.fieldLabelMap || {};
      for (const [field, label] of Object.entries(rawLabelMap as Record<string, string>)) {
        mapping[label as string] = field;
      }

      setHeaderHash(hash);
      setFieldLabelMap(json.fieldLabelMap || {});
      setImportHeaders(Object.keys(mapping));
      setPendingMapping(savedMapping || mapping);
      setImportPreview(json);
      setImportModalVisible(true);

      // 提示模板匹配情况
      if (savedMapping) {
        showMsg(`检测到已保存模板，自动应用映射（${Object.keys(savedMapping).length} 个字段）`, 'info');
      } else {
        showMsg(`解析成功，共 ${json.total} 条数据${json.errorCount > 0 ? `，其中 ${json.errorCount} 条有误` : ''}`, json.errorCount > 0 ? 'warning' : 'success');
      }
    } catch {
      showMsg('文件解析失败', 'error');
    } finally {
      setImportLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // 拖拽上传
  const handleDropFile = useCallback((file: File) => {
    doParseFile(file);
  }, []);

  // 确认导入（支持大批量分批 + 真实进度）
  const handleImportConfirm = async (action: 'insert' | 'skip') => {
    if (!importPreview) return;
    setImporting(true);
    setImportProgress(0);
    setImportProgressText('正在准备数据...');
    setImportResult(null);

    try {
      const validRows = importPreview.allRows
        .filter(r => r.fee_code && r.fee_name && r.business_domain)
        .map((r, idx) => ({ fee_code: r.fee_code, fee_name: r.fee_name, business_domain: r.business_domain, price_types: r.price_types, remark: r.remark, creator: r.creator || currentUserNickname, _submitIdx: r.row ?? idx + 2 }));

      const total = validRows.length;
      const BATCH_SIZE = 100;
      let inserted = 0;
      let skipped = 0;
      const allErrors: string[] = [];

      for (let i = 0; i < validRows.length; i += BATCH_SIZE) {
        const batch = validRows.slice(i, i + BATCH_SIZE);
        const batchNum = Math.floor(i / BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(total / BATCH_SIZE);
        setImportProgressText(`正在导入第 ${i + 1} ~ ${Math.min(i + BATCH_SIZE, total)} 条（共 ${total} 条，第 ${batchNum}/${totalBatches} 批）...`);
        setImportProgress(Math.round((i / total) * 100));

        const res = await fetch('/api/fees/import', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rows: batch, action, creator: currentUserNickname }),
        });
        const json = await res.json();
        if (!res.ok) {
          showMsg(json.error || '导入失败', 'error');
          return;
        }
        inserted += json.inserted || 0;
        skipped += json.skipped || 0;
        if (json.errors?.length) allErrors.push(...json.errors);
      }

      setImportProgress(100);
      setImportProgressText(`已完成 ${inserted + skipped} / ${total} 条`);
      setImportResult({ inserted, skipped, errors: allErrors });

      if (inserted > 0) {
        fetchData();
        setTimeout(() => setImportModalVisible(false), 2500);
      }
    } catch {
      showMsg('导入失败', 'error');
    } finally {
      setImporting(false);
      setImportProgress(0);
      setImportProgressText('');
    }
  };

  const togglePriceType = (pt: string) => {
    setForm(f => ({ ...f, priceTypes: f.priceTypes.includes(pt) ? f.priceTypes.filter(p => p !== pt) : [...f.priceTypes, pt] }));
  };

  const handleSubmit = async () => {
    const errs: Record<string, string> = {};
    if (!form.feeCode) errs.feeCode = '请输入费用编号';
    else if (!/^\d+$/.test(form.feeCode)) errs.feeCode = '只能输入数字';
    else if (form.feeCode.length > 8) errs.feeCode = '最多8位';
    else if (!editRow && data.some(r => r.feeCode === form.feeCode)) errs.feeCode = '编号已存在';
    if (!form.feeName) errs.feeName = '请输入费用名称';
    else if (form.feeName.length > 32) errs.feeName = '最多32字符';
    if (!form.businessDomain) errs.businessDomain = '请选择所属业务域';
    if (form.remark.length > 256) errs.remark = '最多256字符';
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    setLoading(true);
    try {
      if (editRow) {
        const res = await fetch(`/api/fees/${editRow.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, updater: currentUserNickname }) });
        const json = await res.json();
        if (res.ok) { showMsg('保存成功', 'success'); setDialogVisible(false); fetchData(); }
        else showMsg(json.error || '保存失败', 'error');
      } else {
        const res = await fetch('/api/fees', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, creator: currentUserNickname }) });
        const json = await res.json();
        if (res.ok) { showMsg('新增成功', 'success'); setDialogVisible(false); fetchData(); }
        else showMsg(json.error || '新增失败', 'error');
      }
    } finally { setLoading(false); }
  };

  const handleDelete = (row: FeeItem) => {
    openConfirm('single', row);
  };

  const doConfirmDelete = () => {
    if (confirmTarget.type === 'single' && confirmTarget.item) {
      fetch(`/api/fees/${confirmTarget.item.id}`, { method: 'DELETE' }).then(res => {
        if (res.ok) { showMsg('删除成功', 'success'); fetchData(); }
        else showMsg('删除失败', 'error');
      });
    } else if (confirmTarget.type === 'batch') {
      Promise.all(selectedRows.map(r => fetch(`/api/fees/${r.id}`, { method: 'DELETE' }))).then(() => {
        showMsg(`成功删除 ${selectedRows.length} 条数据`, 'success');
        setSelectedRows([]); fetchData();
      });
    }
    setConfirmVisible(false);
  };

  const handleBatchDelete = () => {
    if (selectedRows.length === 0) { showMsg('请先选择数据', 'warning'); return; }
    openConfirm('batch');
  };

  const handleSelectChange = (e: React.ChangeEvent<HTMLInputElement>, row: FeeItem) => {
    if (e.target.checked) setSelectedRows(prev => [...prev, row]);
    else setSelectedRows(prev => prev.filter(r => r.id !== row.id));
  };

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) setSelectedRows(paginatedData);
    else setSelectedRows([]);
  };

  return (
    <>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
      `}</style>
    <div style={{ padding: '0 0 0', flex: 1, overflow: 'auto' }}>
      {/* 标题栏 */}
      <div style={{ padding: '16px 16px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 600, color: 'rgba(0,0,0,0.8)', marginBottom: 4 }}>费用类型维护</div>
          <div style={{ fontSize: 13, color: 'rgba(0,0,0,0.45)' }}>管理系统中的费用类型配置，支持新增、编辑、删除及批量操作</div>
        </div>
      </div>

      {/* 消息提示 */}
      {msg && (
        <div style={{ margin: '10px 16px 0', padding: '8px 12px', borderRadius: 4, fontSize: 13,
          background: msg.type === 'success' ? '#f6ffed' : msg.type === 'error' ? '#fff2f0' : '#fffbe6',
          color: msg.type === 'success' ? '#52c41a' : msg.type === 'error' ? '#ff4d4f' : '#fa8c16',
          border: `1px solid ${msg.type === 'success' ? '#b7eb8f' : msg.type === 'error' ? '#ffccc7' : '#ffe58f'}`, flexShrink: 0,
        }}>{msg.text}</div>
      )}

      {/* 查询区域 */}
      <div style={{ padding: '12px 16px', background: '#F5F7FA', borderBottom: '1px solid #E8EAED' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, color: '#595959', whiteSpace: 'nowrap' }}>费用编号：</span>
            <input value={query.feeCode} onChange={e => { setQuery(q => ({ ...q, feeCode: e.target.value })); }} placeholder="模糊匹配"
              style={{ width: 140, height: 32, padding: '0 10px', border: '1px solid #d9d9d9', borderRadius: 4, fontSize: 13, outline: 'none' }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, color: '#595959', whiteSpace: 'nowrap' }}>费用名称：</span>
            <input value={query.feeName} onChange={e => { setQuery(q => ({ ...q, feeName: e.target.value })); }} placeholder="模糊匹配"
              style={{ width: 140, height: 32, padding: '0 10px', border: '1px solid #d9d9d9', borderRadius: 4, fontSize: 13, outline: 'none' }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, color: '#595959', whiteSpace: 'nowrap' }}>所属业务域：</span>
            <select value={query.businessDomain} onChange={e => { setQuery(q => ({ ...q, businessDomain: e.target.value })); }}
              style={{ height: 32, padding: '0 12px', border: '1px solid #d9d9d9', borderRadius: 4, fontSize: 13, minWidth: 100, outline: 'none' }}>
              <option value="">全部</option>
              {BUSINESS_DOMAINS.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, color: '#595959', whiteSpace: 'nowrap' }}>所属报价：</span>
            <select value={query.priceType} onChange={e => { setQuery(q => ({ ...q, priceType: e.target.value })); }}
              style={{ height: 32, padding: '0 12px', border: '1px solid #d9d9d9', borderRadius: 4, fontSize: 13, minWidth: 100, outline: 'none' }}>
              <option value="">全部</option>
              {PRICE_TYPES.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => { setPage(1); fetchData(); }} style={{ height: 32, padding: '0 16px', borderRadius: 4, border: 'none', background: '#1677FF', color: '#fff', fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'inherit' }}>
              <Icon name="search" size={13} /> 查询
            </button>
            <button onClick={handleReset} style={{ height: 32, padding: '0 16px', border: '1px solid #d9d9d9', borderRadius: 4, background: '#fff', color: '#595959', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
              重置
            </button>
          </div>
        </div>
      </div>

      {/* 工具栏 */}
      <div style={{ padding: '10px 16px', borderBottom: '1px solid #E8EAED', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0, background: '#fff', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'nowrap', flexShrink: 0 }}>
          {/* 考点4：编辑模式切换 */}
          <button
            onClick={toggleEditMode}
            style={{
              height: 32, padding: '0 14px', borderRadius: 4,
              border: `1px solid ${editMode ? '#1677FF' : '#d9d9d9'}`,
              background: editMode ? '#1677FF' : '#fff',
              color: editMode ? '#fff' : '#595959',
              fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
              fontFamily: 'inherit', fontWeight: editMode ? 600 : 400,
              transition: 'all 0.15s',
              boxShadow: editMode ? '0 2px 0 rgba(22,99,196,0.15)' : 'none',
            }}
          >
            <span style={{ fontSize: 14 }}>{editMode ? '✓' : '✎'}</span>
            {editMode ? '退出编辑' : '在线编辑'}
          </button>
          <div style={{ width: 1, height: 20, background: '#e8e8e8', flexShrink: 0 }} />
          <button onClick={openAdd}
            style={{ height: 32, padding: '0 16px', borderRadius: 4, border: 'none', background: '#1677FF', color: '#fff', fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon name="plus" size={13} /> 新增
          </button>
          <button onClick={handleBatchDelete} disabled={selectedRows.length === 0}
            style={{ height: 32, padding: '0 16px', borderRadius: 4, border: `1px solid ${selectedRows.length > 0 ? '#FF4D4F' : '#d9d9d9'}`, background: selectedRows.length > 0 ? '#FF4D4F' : '#fff', color: selectedRows.length > 0 ? '#fff' : '#bfbfbf', fontSize: 13, cursor: selectedRows.length > 0 ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon name="delete" size={13} /> {selectedRows.length > 0 ? `删除 (${selectedRows.length})` : '删除'}
          </button>
          <button onClick={() => window.open('/api/fees/template', '_blank')}
            style={{ height: 32, padding: '0 10px', borderRadius: 4, border: '1px solid #d9d9d9', background: '#fff', color: '#595959', fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            模版下载
          </button>
          <DragDropZone onFile={handleDropFile} dragOver={dragOver} setDragOver={setDragOver} disabled={importLoading}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: importLoading ? '#bfbfbf' : '#595959', fontSize: 13, justifyContent: 'center' }}>
              {importLoading ? (
                <>
                  <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⟳</span>
                  解析中...
                </>
              ) : (
                <>
                  <Icon name="upload" size={13} />
                  <span>导入</span>
                </>
              )}
            </div>
            {importLoading && (
              <div style={{ height: 3, background: '#e8e8e8', borderRadius: 2, marginTop: 8, overflow: 'hidden' }}>
                <div style={{ height: '100%', background: '#1677FF', width: '60%', borderRadius: 2, animation: 'pulse 1.5s ease-in-out infinite' }} />
              </div>
            )}
          </DragDropZone>
          <button
            onClick={() => {
              if (pendingChanges.size > 0) {
                showMsg('有未保存的变更，请先保存后再导出', 'warning');
                return;
              }
              handleExport();
            }}
            style={{ height: 32, padding: '0 12px', borderRadius: 4, border: '1px solid #d9d9d9', background: '#fff', color: '#595959', fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon name="download" size={13} /> 导出
          </button>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {editMode && pendingChanges.size > 0 && (
            <span style={{ fontSize: 12, color: '#fa8c16', display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#fa8c16', display: 'inline-block' }} />
              {pendingChanges.size} 条待保存
            </span>
          )}
          {savingInline && (
            <span style={{ fontSize: 12, color: '#1677FF', display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⟳</span>
              保存中...
            </span>
          )}
          <span style={{ fontSize: 13, color: '#8c8c8c' }}>
            {selectedRows.length > 0 && <span>已选择 {selectedRows.length} 项</span>}
          </span>
        </div>
      </div>

      {/* 考点4：编辑模式提示栏 */}
      {editMode && (
        <div style={{
          padding: '8px 16px', background: '#e6f4ff', borderBottom: '1px solid #91caff',
          fontSize: 13, color: '#1677FF', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
        }}>
          <span style={{ fontWeight: 600 }}>⚡ 在线编辑模式</span>
          <span>点击单元格即可编辑，</span>
          <kbd style={{ background: '#fff', border: '1px solid #91caff', borderRadius: 3, padding: '0 5px', fontSize: 12, fontFamily: 'monospace' }}>Tab</kbd>
          <span>跳至下一列，</span>
          <kbd style={{ background: '#fff', border: '1px solid #91caff', borderRadius: 3, padding: '0 5px', fontSize: 12, fontFamily: 'monospace' }}>Enter</kbd>
          <span>保存并跳转下一行，</span>
          <kbd style={{ background: '#fff', border: '1px solid #91caff', borderRadius: 3, padding: '0 5px', fontSize: 12, fontFamily: 'monospace' }}>Esc</kbd>
          <span>取消编辑</span>
          <span style={{ marginLeft: 8, color: '#8c8c8c' }}>费用编号不可编辑，修改后自动保存</span>
        </div>
      )}

      {/* 表格 — 鲸天系统样式：白底阴影容器，考点4：表头固定 + 横向滚动 */}
      <div style={{
        overflowX: 'auto', flex: 1, minHeight: 0,
        background: '#fff',
        boxShadow: '0px 12px 32px 4px rgba(0,0,0,.04), 0px 8px 20px rgba(0,0,0,.08)',
        margin: '0 16px 16px', borderRadius: 4, overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
      }}>
        {fetchError ? (
          <div style={{ padding: '48px 24px', textAlign: 'center' }}>
            <div style={{ fontSize: 15, color: '#ff4d4f', marginBottom: 8 }}>数据加载失败</div>
            <div style={{ fontSize: 13, color: '#8c8c8c', marginBottom: 16 }}>{fetchError}</div>
            <button onClick={fetchData} style={{ padding: '6px 20px', border: 'none', borderRadius: 4, background: '#1677FF', color: '#fff', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' }}>重试</button>
          </div>
        ) : (
          <div style={{ overflowX: 'auto', overflowY: 'auto', flex: 1, minHeight: 0, position: 'relative' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, minWidth: 1100, border: '1px solid #E8EAED', borderRadius: 4, tableLayout: 'fixed' }}>
            {/* 表头固定 */}
            <thead>
              <tr style={{ background: '#EFF5FF', position: 'sticky', top: 0, zIndex: 10 }}>
                <th style={{ padding: '10px 12px', borderBottom: '1px solid #E8EAED', textAlign: 'center', width: 48, zIndex: 11, position: 'sticky', left: 0, background: '#EFF5FF' }}><input type="checkbox" checked={paginatedData.length > 0 && selectedRows.length === paginatedData.length} onChange={handleSelectAll} style={{ width: 15, height: 15, accentColor: '#1677FF', cursor: 'pointer' }} /></th>
                <th style={{ padding: '10px 12px', borderBottom: '1px solid #E8EAED', textAlign: 'center', color: '#000', fontWeight: 600, width: 56, whiteSpace: 'nowrap', position: 'sticky', left: 48, zIndex: 11, background: '#EFF5FF' }}>序号</th>
                <th style={{ padding: '10px 12px', borderBottom: '1px solid #E8EAED', textAlign: 'left', color: '#000', fontWeight: 600, width: 110, whiteSpace: 'nowrap' }}>费用编号</th>
                <th style={{ padding: '10px 12px', borderBottom: '1px solid #E8EAED', textAlign: 'left', color: '#000', fontWeight: 600, width: 160, whiteSpace: 'nowrap' }}>费用名称</th>
                <th style={{ padding: '10px 12px', borderBottom: '1px solid #E8EAED', textAlign: 'center', color: '#000', fontWeight: 600, width: 100, whiteSpace: 'nowrap' }}>所属业务域</th>
                <th style={{ padding: '10px 12px', borderBottom: '1px solid #E8EAED', textAlign: 'left', color: '#000', fontWeight: 600, width: 260, whiteSpace: 'nowrap' }}>所属报价</th>
                <th style={{ padding: '10px 12px', borderBottom: '1px solid #E8EAED', textAlign: 'left', color: '#000', fontWeight: 600, whiteSpace: 'nowrap' }}>备注</th>
                <th style={{ padding: '10px 12px', borderBottom: '1px solid #E8EAED', textAlign: 'center', color: '#000', fontWeight: 600, width: 90, whiteSpace: 'nowrap' }}>创建人</th>
                <th style={{ padding: '10px 12px', borderBottom: '1px solid #E8EAED', textAlign: 'center', color: '#000', fontWeight: 600, width: 150, whiteSpace: 'nowrap' }}>创建时间</th>
                <th style={{ padding: '10px 12px', borderBottom: '1px solid #E8EAED', textAlign: 'center', color: '#000', fontWeight: 600, width: 90, whiteSpace: 'nowrap' }}>修改人</th>
                <th style={{ padding: '10px 12px', borderBottom: '1px solid #E8EAED', textAlign: 'center', color: '#000', fontWeight: 600, width: 150, whiteSpace: 'nowrap' }}>修改时间</th>
                <th style={{ padding: '10px 12px', borderBottom: '1px solid #E8EAED', textAlign: 'center', color: '#000', fontWeight: 600, width: editMode ? 130 : 120, whiteSpace: 'nowrap' }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {paginatedData.length === 0 ? (
                <tr><td colSpan={12} style={{ padding: '48px 0', textAlign: 'center', color: '#bfbfbf', fontSize: 14 }}>暂无数据</td></tr>
              ) : (
                paginatedData.map((row, idx) => {
                  const isEven = idx % 2 === 1;
                  const hasPending = pendingRowIds.has(row.id);
                  const hasRowError = rowHasErrors(row.id, cellErrors);
                  const rowBg = hasRowError ? '#fff1f0' : (hasPending ? '#fffbe6' : (isEven ? '#F5F7FA' : '#FFF'));
                  return (
                  <tr key={row.id}
                    style={{
                      height: 41, background: rowBg,
                      cursor: editMode ? 'pointer' : 'pointer',
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={e => {
                      const cur = e.currentTarget.style.background;
                      if (!hasRowError && !hasPending) {
                        e.currentTarget.style.background = '#ECF5FF';
                      }
                    }}
                    onMouseLeave={e => {
                      if (!hasRowError && !hasPending) {
                        e.currentTarget.style.background = isEven ? '#F5F7FA' : '#FFF';
                      } else {
                        e.currentTarget.style.background = rowBg;
                      }
                    }}
                    onDoubleClick={() => !editMode && openDetail(row)}>
                    <td style={{ padding: '10px 12px', borderBottom: '1px solid #E8EAED', textAlign: 'center', height: 41, verticalAlign: 'middle' }}><input type="checkbox" checked={selectedRows.some(r => r.id === row.id)} onChange={e => handleSelectChange(e, row)} style={{ width: 15, height: 15, accentColor: '#1677FF', cursor: 'pointer' }} /></td>
                    <td style={{ padding: '10px 12px', borderBottom: '1px solid #E8EAED', textAlign: 'center', color: 'rgba(0,0,0,0.45)', height: 41, verticalAlign: 'middle' }}>{(page - 1) * pageSize + idx + 1}</td>

                    {/* 费用编号（不可编辑） */}
                    <td style={{ padding: '10px 12px', borderBottom: '1px solid #E8EAED', textAlign: 'left', height: 41, verticalAlign: 'middle', maxWidth: 110, overflow: 'hidden' }}>
                      <Tooltip content={row.feeCode}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          {hasPending && editMode && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#fa8c16', flexShrink: 0, display: 'inline-block' }} title="有未保存变更" />}
                          <code style={{ color: '#1677FF', fontFamily: 'monospace', fontSize: 12 }}>{row.feeCode}</code>
                        </div>
                      </Tooltip>
                    </td>

                    {/* 费用名称（可编辑） */}
                    <td
                      style={{
                        padding: '4px 12px', borderBottom: '1px solid #E8EAED',
                        textAlign: 'left', height: 41, verticalAlign: 'middle',
                        maxWidth: 140, overflow: 'hidden',
                        background: editingCell?.rowId === row.id && editingCell?.field === 'feeName' ? '#fff' : 'transparent',
                        boxShadow: editingCell?.rowId === row.id && editingCell?.field === 'feeName' ? 'inset 0 0 0 1px #1677FF' : 'none',
                      }}
                      onClick={() => activateCell(row.id, 'feeName')}
                    >
                      {editingCell?.rowId === row.id && editingCell?.field === 'feeName' ? (
                        <EditableCell
                          field="feeName" rowId={row.id}
                          value={getCellValue(row, 'feeName') as string}
                          displayValue={getCellValue(row, 'feeName')}
                          cellErrors={cellErrors}
                          onChange={handleCellChange}
                          onBlur={handleCellBlur}
                          onKeyDown={handleCellKeyDown}
                          allData={data}
                          pendingChanges={pendingChanges}
                        />
                      ) : (
                        <Tooltip content={hasRowError && cellErrors.has(`${row.id}-feeName`) ? cellErrors.get(`${row.id}-feeName`)! : (getCellValue(row, 'feeName') as string)}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            {editMode && <span style={{ fontSize: 11, color: '#1677FF', opacity: 0.6 }}>✎</span>}
                            <span style={{ fontWeight: 500, color: 'rgba(0,0,0,0.8)' }}>{getCellValue(row, 'feeName') as string}</span>
                          </div>
                        </Tooltip>
                      )}
                    </td>

                    {/* 所属业务域（可编辑） */}
                    <td
                      style={{
                        padding: '4px 12px', borderBottom: '1px solid #E8EAED',
                        textAlign: 'center', height: 41, verticalAlign: 'middle',
                        maxWidth: 100, overflow: 'hidden',
                        background: editingCell?.rowId === row.id && editingCell?.field === 'businessDomain' ? '#fff' : 'transparent',
                        boxShadow: editingCell?.rowId === row.id && editingCell?.field === 'businessDomain' ? 'inset 0 0 0 1px #1677FF' : 'none',
                      }}
                      onClick={() => activateCell(row.id, 'businessDomain')}
                    >
                      {editingCell?.rowId === row.id && editingCell?.field === 'businessDomain' ? (
                        <EditableCell
                          field="businessDomain" rowId={row.id}
                          value={getCellValue(row, 'businessDomain') as string}
                          displayValue={getCellValue(row, 'businessDomain')}
                          cellErrors={cellErrors}
                          onChange={handleCellChange}
                          onBlur={handleCellBlur}
                          onKeyDown={handleCellKeyDown}
                          allData={data}
                          pendingChanges={pendingChanges}
                        />
                      ) : (
                        <Tooltip content={getCellValue(row, 'businessDomain') as string}>
                          <span style={{ display: 'inline-block', padding: '1px 8px', borderRadius: 2, fontSize: 12, color: domainColor[getCellValue(row, 'businessDomain') as string] || '#1677FF', background: (domainColor[getCellValue(row, 'businessDomain') as string] || '#1677FF') + '1a' }}>
                            {getCellValue(row, 'businessDomain') as string}
                          </span>
                        </Tooltip>
                      )}
                    </td>

                    {/* 所属报价（可编辑） */}
                    <td
                      style={{
                        padding: '4px 12px', borderBottom: '1px solid #E8EAED',
                        textAlign: 'left', height: 41, verticalAlign: 'middle',
                        maxWidth: 240, overflow: 'hidden',
                        background: editingCell?.rowId === row.id && editingCell?.field === 'priceTypes' ? '#fff' : 'transparent',
                        boxShadow: editingCell?.rowId === row.id && editingCell?.field === 'priceTypes' ? 'inset 0 0 0 1px #1677FF' : 'none',
                      }}
                      onClick={() => activateCell(row.id, 'priceTypes')}
                    >
                      {editingCell?.rowId === row.id && editingCell?.field === 'priceTypes' ? (
                        <EditableCell
                          field="priceTypes" rowId={row.id}
                          value={getCellValue(row, 'priceTypes') as string[]}
                          displayValue={getCellValue(row, 'priceTypes')}
                          cellErrors={cellErrors}
                          onChange={handleCellChange}
                          onBlur={handleCellBlur}
                          onKeyDown={handleCellKeyDown}
                          allData={data}
                          pendingChanges={pendingChanges}
                        />
                      ) : (
                        <Tooltip content={(getCellValue(row, 'priceTypes') as string[]).join('、') || '暂无'}>
                          {(getCellValue(row, 'priceTypes') as string[]).length === 0 ? (
                            <span style={{ color: '#c0c0c0', fontSize: 12 }}>—</span>
                          ) : (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                              {(getCellValue(row, 'priceTypes') as string[]).map(pt => (
                                <span key={pt} style={{ display: 'inline-block', padding: '2px 6px', borderRadius: 2, fontSize: 12, background: '#f5f5f5', color: 'rgba(0,0,0,0.65)' }}>{pt}</span>
                              ))}
                            </div>
                          )}
                        </Tooltip>
                      )}
                    </td>

                    {/* 备注（可编辑） */}
                    <td
                      style={{
                        padding: '4px 12px', borderBottom: '1px solid #E8EAED',
                        textAlign: 'left', height: 41, verticalAlign: 'middle',
                        maxWidth: 200, overflow: 'hidden',
                        background: editingCell?.rowId === row.id && editingCell?.field === 'remark' ? '#fff' : 'transparent',
                        boxShadow: editingCell?.rowId === row.id && editingCell?.field === 'remark' ? 'inset 0 0 0 1px #1677FF' : 'none',
                      }}
                      onClick={() => activateCell(row.id, 'remark')}
                    >
                      {editingCell?.rowId === row.id && editingCell?.field === 'remark' ? (
                        <EditableCell
                          field="remark" rowId={row.id}
                          value={getCellValue(row, 'remark') as string}
                          displayValue={getCellValue(row, 'remark')}
                          cellErrors={cellErrors}
                          onChange={handleCellChange}
                          onBlur={handleCellBlur}
                          onKeyDown={handleCellKeyDown}
                          allData={data}
                          pendingChanges={pendingChanges}
                        />
                      ) : (
                        <Tooltip content={(getCellValue(row, 'remark') as string) || ''}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            {editMode && <span style={{ fontSize: 11, color: '#1677FF', opacity: 0.6 }}>✎</span>}
                            <span style={{ color: getCellValue(row, 'remark') ? 'rgba(0,0,0,0.65)' : '#c0c0c0' }}>
                              {(getCellValue(row, 'remark') as string) || '-'}
                            </span>
                          </div>
                        </Tooltip>
                      )}
                    </td>

                    <td style={{ padding: '10px 12px', borderBottom: '1px solid #E8EAED', textAlign: 'center', color: 'rgba(0,0,0,0.65)', height: 41, verticalAlign: 'middle', maxWidth: 90, overflow: 'hidden' }}><Tooltip content={row.creator}>{row.creator}</Tooltip></td>
                    <td style={{ padding: '10px 12px', borderBottom: '1px solid #E8EAED', textAlign: 'center', color: 'rgba(0,0,0,0.45)', fontSize: 13, height: 41, verticalAlign: 'middle', maxWidth: 150, overflow: 'hidden' }}><Tooltip content={row.createTime}>{row.createTime}</Tooltip></td>
                    <td style={{ padding: '10px 12px', borderBottom: '1px solid #E8EAED', textAlign: 'center', color: row.updater ? 'rgba(0,0,0,0.65)' : '#c0c0c0', height: 41, verticalAlign: 'middle', maxWidth: 90, overflow: 'hidden' }}><Tooltip content={row.updater || ''}>{row.updater || '-'}</Tooltip></td>
                    <td style={{ padding: '10px 12px', borderBottom: '1px solid #E8EAED', textAlign: 'center', color: 'rgba(0,0,0,0.45)', fontSize: 13, height: 41, verticalAlign: 'middle', maxWidth: 150, overflow: 'hidden' }}><Tooltip content={row.updateTime || ''}>{row.updateTime || '-'}</Tooltip></td>
                    <td style={{ padding: '10px 12px', borderBottom: '1px solid #E8EAED', textAlign: 'center', height: 41, verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                      {!editMode ? (
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                        <button onClick={() => openEdit(row)} style={{ border: 'none', background: 'none', color: '#1677FF', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', gap: 2, fontFamily: 'inherit', padding: '0', fontWeight: 500, transition: 'color 0.15s' }}
                          onMouseEnter={e => (e.currentTarget.style.color = '#4080FF')}
                          onMouseLeave={e => (e.currentTarget.style.color = '#1677FF')}>
                          编辑
                        </button>
                        <button onClick={() => handleDelete(row)} style={{ border: 'none', background: 'none', color: '#FF4D4F', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', gap: 2, fontFamily: 'inherit', padding: '0', fontWeight: 500, transition: 'color 0.15s' }}
                          onMouseEnter={e => (e.currentTarget.style.color = '#FF1F1F')}
                          onMouseLeave={e => (e.currentTarget.style.color = '#FF4D4F')}>
                          删除
                        </button>
                      </div>
                      ) : (
                        <span style={{ fontSize: 12, color: '#1677FF' }}>双击单元格编辑</span>
                      )}
                    </td>
                  </tr>
                  );
                })
              )}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {/* 分页 */}
      <div style={{ padding: '12px 16px', borderTop: '1px solid #E8EAED', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff', flexShrink: 0, flexWrap: 'wrap', gap: 8 }}>
        <span style={{ fontSize: 13, color: 'rgba(0,0,0,0.45)' }}>共 <strong style={{ color: 'rgba(0,0,0,0.8)' }}>{filtered.length}</strong> 条{selectedRows.length > 0 && <>, 已选中 <strong style={{ color: '#1677FF' }}>{selectedRows.length}</strong> 项</>}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}
            style={{ height: 28, padding: '0 22px 0 8px', border: '1px solid #dcdfe6', borderRadius: 4, fontSize: 13, outline: 'none', background: '#fff', fontFamily: 'inherit', cursor: 'pointer', appearance: 'none', backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1024 1024'%3E%3Cpath fill='%23c0c4cc' d='M192 320l320 320 320-320z'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 6px center', backgroundSize: 8, boxSizing: 'border-box' }}>
            {[10, 20, 50, 100].map(s => <option key={s} value={s}>{s} 条/页</option>)}
          </select>
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} style={{ height: 28, width: 28, border: '1px solid #dcdfe6', borderRadius: 4, background: '#fff', cursor: page <= 1 ? 'not-allowed' : 'pointer', color: page <= 1 ? '#c0c4cc' : 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit', transition: 'all 0.15s', transform: 'rotate(180deg)' }}
            onMouseEnter={e => { if (page > 1) { (e.currentTarget as HTMLButtonElement).style.borderColor = '#1677FF'; (e.currentTarget as HTMLButtonElement).style.color = '#1677FF'; } }}
            onMouseLeave={e => { if (page > 1) { (e.currentTarget as HTMLButtonElement).style.borderColor = '#dcdfe6'; (e.currentTarget as HTMLButtonElement).style.color = 'rgba(0,0,0,0.65)'; } }}>
            <Icon name="right" size={10} />
          </button>
          {Array.from({ length: Math.min(5, Math.max(1, Math.ceil(filtered.length / pageSize))) }, (_, i) => {
            const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
            const start = Math.max(1, Math.min(totalPages - 4, page - 2));
            const p = start + i;
            return p <= totalPages ? (
              <button key={p} onClick={() => setPage(p)} style={{
                height: 28, width: 28, border: `1px solid ${p === page ? '#1677FF' : '#dcdfe6'}`,
                borderRadius: 4, background: p === page ? '#1677FF' : '#fff',
                color: p === page ? '#fff' : 'rgba(0,0,0,0.65)', cursor: 'pointer',
                fontSize: 13, fontWeight: p === page ? 600 : 400, fontFamily: 'inherit', transition: 'all 0.15s',
              }}>{p}</button>
            ) : null;
          })}
          <button onClick={() => setPage(p => Math.min(Math.ceil(filtered.length / pageSize), p + 1))} disabled={page >= Math.ceil(filtered.length / pageSize)} style={{ height: 28, width: 28, border: '1px solid #dcdfe6', borderRadius: 4, background: '#fff', cursor: page >= Math.ceil(filtered.length / pageSize) ? 'not-allowed' : 'pointer', color: page >= Math.ceil(filtered.length / pageSize) ? '#c0c4cc' : 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit', transition: 'all 0.15s' }}
            onMouseEnter={e => { if (page < Math.ceil(filtered.length / pageSize)) { (e.currentTarget as HTMLButtonElement).style.borderColor = '#1677FF'; (e.currentTarget as HTMLButtonElement).style.color = '#1677FF'; } }}
            onMouseLeave={e => { if (page < Math.ceil(filtered.length / pageSize)) { (e.currentTarget as HTMLButtonElement).style.borderColor = '#dcdfe6'; (e.currentTarget as HTMLButtonElement).style.color = 'rgba(0,0,0,0.65)'; } }}>
            <Icon name="right" size={10} />
          </button>
          <span style={{ fontSize: 13, color: 'rgba(0,0,0,0.45)' }}>跳至<input value={page} onChange={e => { const v = parseInt(e.target.value); if (!isNaN(v) && v >= 1 && v <= Math.ceil(filtered.length / pageSize)) setPage(v); }}
            style={{ width: 40, height: 28, margin: '0 4px', padding: '0 4px', border: '1px solid #dcdfe6', borderRadius: 4, textAlign: 'center', fontSize: 13, outline: 'none', fontFamily: 'inherit', color: 'rgba(0,0,0,0.8)', boxSizing: 'border-box' }} />页</span>
        </div>
      </div>

      {/* 详情弹框 */}
      {detailVisible && detailRow && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', borderRadius: 4, width: 520, maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 6px 16px rgba(0,0,0,0.15)', overflow: 'hidden' }}>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid #E8EAED', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 600, color: '#262626' }}>
                <span style={{ color: '#1677FF', display: 'flex' }}><Icon name="search" size={15} /></span>
                费用类型详情
              </div>
              <button onClick={() => setDetailVisible(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex' }}>
                <Icon name="close" size={15} />
              </button>
            </div>
            <div style={{ padding: 20, overflowY: 'auto', flex: 1 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div style={{ padding: '10px 12px', background: '#F5F7FA', borderRadius: 4, border: '1px solid #E8EAED' }}>
                  <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 4 }}>费用编号</div>
                  <div style={{ fontSize: 13, color: '#262626', fontFamily: 'monospace' }}>{detailRow.feeCode || '-'}</div>
                </div>
                <div style={{ padding: '10px 12px', background: '#F5F7FA', borderRadius: 4, border: '1px solid #E8EAED' }}>
                  <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 4 }}>所属业务域</div>
                  <div style={{ display: 'inline-block', padding: '1px 8px', borderRadius: 2, fontSize: 12, color: domainColor[detailRow.businessDomain] || '#1677FF', background: (domainColor[detailRow.businessDomain] || '#1677FF') + '1a' }}>{detailRow.businessDomain || '-'}</div>
                </div>
                <div style={{ gridColumn: '1 / -1', padding: '10px 12px', background: '#F5F7FA', borderRadius: 4, border: '1px solid #E8EAED' }}>
                  <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 4 }}>费用名称</div>
                  <div style={{ fontSize: 13, color: '#262626', fontWeight: 500 }}>{detailRow.feeName || '-'}</div>
                </div>
                <div style={{ gridColumn: '1 / -1', padding: '10px 12px', background: '#F5F7FA', borderRadius: 4, border: '1px solid #E8EAED' }}>
                  <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 6 }}>所属报价</div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {detailRow.priceTypes.length === 0
                      ? <span style={{ fontSize: 13, color: '#c0c0c0' }}>-</span>
                      : detailRow.priceTypes.map(pt => (
                        <span key={pt} style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 2, fontSize: 12, background: '#e6f4ff', color: '#1677FF', border: '1px solid #91caff' }}>{pt}</span>
                      ))
                    }
                  </div>
                </div>
                <div style={{ gridColumn: '1 / -1', padding: '10px 12px', background: '#F5F7FA', borderRadius: 4, border: '1px solid #E8EAED' }}>
                  <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 4 }}>备注</div>
                  <div style={{ fontSize: 13, color: '#595959', lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{detailRow.remark || '-'}</div>
                </div>
                <div style={{ padding: '10px 12px', background: '#F5F7FA', borderRadius: 4, border: '1px solid #E8EAED' }}>
                  <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 4 }}>创建人</div>
                  <div style={{ fontSize: 13, color: '#595959' }}>{detailRow.creator || '-'}</div>
                </div>
                <div style={{ padding: '10px 12px', background: '#F5F7FA', borderRadius: 4, border: '1px solid #E8EAED' }}>
                  <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 4 }}>创建时间</div>
                  <div style={{ fontSize: 13, color: '#8c8c8c' }}>{detailRow.createTime || '-'}</div>
                </div>
                <div style={{ padding: '10px 12px', background: '#F5F7FA', borderRadius: 4, border: '1px solid #E8EAED' }}>
                  <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 4 }}>修改人</div>
                  <div style={{ fontSize: 13, color: '#595959' }}>{detailRow.updater || '-'}</div>
                </div>
                <div style={{ padding: '10px 12px', background: '#F5F7FA', borderRadius: 4, border: '1px solid #E8EAED' }}>
                  <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 4 }}>修改时间</div>
                  <div style={{ fontSize: 13, color: '#8c8c8c' }}>{detailRow.updateTime || '-'}</div>
                </div>
              </div>
            </div>
            <div style={{ padding: '10px 16px', borderTop: '1px solid #E8EAED', display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
              <button onClick={() => { setDetailVisible(false); openEdit(detailRow); }} style={{ height: 30, padding: '0 24px', border: 'none', borderRadius: 4, background: '#1677FF', color: '#fff', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit', transition: 'background 0.15s', boxShadow: '0 2px 0 rgba(22,99,196,0.1)' }}
                onMouseEnter={e => (e.currentTarget.style.background = '#3880d0')}
                onMouseLeave={e => (e.currentTarget.style.background = '#1677FF')}>编辑</button>
            </div>
          </div>
        </div>
      )}

      {/* 新增/编辑弹框 */}
      {dialogVisible && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', borderRadius: 4, width: 560, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 6px 16px rgba(0,0,0,0.15)', overflow: 'hidden' }}>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid #E8EAED', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 600, color: '#262626' }}>
                <span style={{ color: '#1677FF', display: 'flex' }}>{editRow ? <Icon name="edit" size={15} /> : <Icon name="plus" size={15} />}</span>
                {dialogTitle}
              </div>
              <button onClick={() => setDialogVisible(false)} style={{ background: 'none', border: 'none', color: '#8c8c8c', fontSize: 18, cursor: 'pointer', lineHeight: 1, padding: '2px', borderRadius: 3, transition: 'all 0.15s' }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#595959'; (e.currentTarget as HTMLButtonElement).style.background = '#f5f5f5'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = '#8c8c8c'; (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}>
                <Icon name="close" size={16} />
              </button>
            </div>
            <div style={{ padding: '16px 16px 0', overflow: 'auto', flex: 1 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 12px' }}>
                <div style={{ marginBottom: 14 }}>
                  <div style={{ marginBottom: 4, fontSize: 13, color: '#595959' }}>费用编号 <span style={{ color: '#ff4d4f' }}>*</span></div>
                  <input value={form.feeCode} onChange={e => setForm(f => ({ ...f, feeCode: e.target.value }))} disabled={!!editRow} placeholder="只允许输入数字，最多8位" maxLength={8}
                    style={{ width: '100%', height: 30, padding: '0 10px', borderRadius: 4, border: `1px solid ${errors.feeCode ? '#ff4d4f' : '#d9d9d9'}`, fontSize: 13, outline: 'none', background: editRow ? '#f5f5f5' : '#fff', color: editRow ? '#bfbfbf' : '#595959', fontFamily: 'inherit', transition: 'border-color 0.15s', boxSizing: 'border-box' }}
                    onFocus={e => { if (!editRow) e.target.style.borderColor = errors.feeCode ? '#ff4d4f' : '#1677FF'; }}
                    onBlur={e => { if (!editRow) e.target.style.borderColor = errors.feeCode ? '#ff4d4f' : '#d9d9d9'; }} />
                  {errors.feeCode && <div style={{ fontSize: 12, color: '#ff4d4f', marginTop: 4 }}>{errors.feeCode}</div>}
                </div>
                <div style={{ marginBottom: 14 }}>
                  <div style={{ marginBottom: 4, fontSize: 13, color: '#595959' }}>费用名称 <span style={{ color: '#ff4d4f' }}>*</span></div>
                  <input value={form.feeName} onChange={e => setForm(f => ({ ...f, feeName: e.target.value }))} placeholder="请输入费用名称" maxLength={32}
                    style={{ width: '100%', height: 30, padding: '0 10px', borderRadius: 4, border: `1px solid ${errors.feeName ? '#ff4d4f' : '#d9d9d9'}`, fontSize: 13, outline: 'none', color: '#595959', background: '#fff', fontFamily: 'inherit', transition: 'border-color 0.15s', boxSizing: 'border-box' }}
                    onFocus={e => (e.target.style.borderColor = errors.feeName ? '#ff4d4f' : '#1677FF')}
                    onBlur={e => (e.target.style.borderColor = errors.feeName ? '#ff4d4f' : '#d9d9d9')} />
                  {errors.feeName && <div style={{ fontSize: 12, color: '#ff4d4f', marginTop: 4 }}>{errors.feeName}</div>}
                </div>
              </div>
              <div style={{ marginBottom: 14 }}>
                <div style={{ marginBottom: 4, fontSize: 13, color: '#595959' }}>所属业务域 <span style={{ color: '#ff4d4f' }}>*</span></div>
                <select value={form.businessDomain} onChange={e => setForm(f => ({ ...f, businessDomain: e.target.value }))}
                  style={{ width: '100%', height: 30, padding: '0 10px', borderRadius: 4, border: `1px solid ${errors.businessDomain ? '#ff4d4f' : '#d9d9d9'}`, fontSize: 13, outline: 'none', color: '#595959', background: '#fff', fontFamily: 'inherit', cursor: 'pointer', transition: 'border-color 0.15s', boxSizing: 'border-box' }}
                  onFocus={e => (e.target.style.borderColor = errors.businessDomain ? '#ff4d4f' : '#1677FF')}
                  onBlur={e => (e.target.style.borderColor = errors.businessDomain ? '#ff4d4f' : '#d9d9d9')}>
                  <option value="">请选择</option>
                  {BUSINESS_DOMAINS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
                {errors.businessDomain && <div style={{ fontSize: 12, color: '#ff4d4f', marginTop: 4 }}>{errors.businessDomain}</div>}
              </div>
              <div style={{ marginBottom: 14 }}>
                <div style={{ marginBottom: 6, fontSize: 13, color: '#595959' }}>所属报价 <span style={{ fontWeight: 400, color: '#8c8c8c', fontSize: 12 }}>（非必填，支持多选）</span></div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {PRICE_TYPES.map(pt => (
                    <label key={pt} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 4, border: `1px solid ${form.priceTypes.includes(pt) ? '#1677FF' : '#d9d9d9'}`, cursor: 'pointer', fontSize: 13, transition: 'all 0.15s', color: form.priceTypes.includes(pt) ? '#1677FF' : '#595959', background: form.priceTypes.includes(pt) ? '#e6f4ff' : '#fff', userSelect: 'none' }}>
                      <input type="checkbox" checked={form.priceTypes.includes(pt)} onChange={() => togglePriceType(pt)} style={{ width: 13, height: 13, accentColor: '#1677FF' }} />
                      {pt}
                    </label>
                  ))}
                </div>
              </div>
              <div style={{ marginBottom: 14 }}>
                <div style={{ marginBottom: 4, fontSize: 13, color: '#595959' }}>备注 <span style={{ fontWeight: 400, color: '#8c8c8c', fontSize: 12 }}>（选填，最多256字）</span></div>
                <div style={{ position: 'relative' }}>
                  <textarea value={form.remark} onChange={e => setForm(f => ({ ...f, remark: e.target.value }))} placeholder="请输入备注信息" maxLength={256} rows={3}
                    style={{ width: '100%', padding: '6px 10px', borderRadius: 4, border: `1px solid ${errors.remark ? '#ff4d4f' : '#d9d9d9'}`, fontSize: 13, outline: 'none', color: '#595959', resize: 'none', fontFamily: 'inherit', background: '#fff', transition: 'border-color 0.15s', boxSizing: 'border-box' }}
                    onFocus={e => (e.target.style.borderColor = errors.remark ? '#ff4d4f' : '#1677FF')}
                    onBlur={e => (e.target.style.borderColor = errors.remark ? '#ff4d4f' : '#d9d9d9')} />
                  <span style={{ position: 'absolute', bottom: 6, right: 10, fontSize: 12, color: '#bfbfbf' }}>{form.remark.length}/256</span>
                </div>
                {errors.remark && <div style={{ fontSize: 12, color: '#ff4d4f', marginTop: 4 }}>{errors.remark}</div>}
              </div>
            </div>
            <div style={{ padding: '10px 16px', borderTop: '1px solid #E8EAED', display: 'flex', justifyContent: 'flex-end', gap: 8, flexShrink: 0 }}>
              <button onClick={() => setDialogVisible(false)} style={{ height: 30, padding: '0 20px', border: '1px solid #d9d9d9', borderRadius: 4, background: '#fff', cursor: 'pointer', fontSize: 13, color: '#595959', fontFamily: 'inherit', transition: 'all 0.15s' }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#1677FF'; (e.currentTarget as HTMLButtonElement).style.color = '#1677FF'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#d9d9d9'; (e.currentTarget as HTMLButtonElement).style.color = '#595959'; }}>取消</button>
              <button onClick={handleSubmit} disabled={loading} style={{ height: 30, padding: '0 20px', border: 'none', borderRadius: 4, background: loading ? '#73b3ff' : '#1677FF', color: '#fff', cursor: loading ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 500, fontFamily: 'inherit', minWidth: 90, transition: 'background 0.15s', boxShadow: '0 2px 0 rgba(22,99,196,0.1)' }}
                onMouseEnter={e => { if (!loading) (e.currentTarget as HTMLButtonElement).style.background = '#3880d0'; }}
                onMouseLeave={e => { if (!loading) (e.currentTarget as HTMLButtonElement).style.background = '#1677FF'; }}>
                {loading ? '提交中...' : (editRow ? '保存修改' : '确认新增')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 隐藏的文件上传 input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      {/* 导入预览弹框 */}
      {importModalVisible && importPreview && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100 }}>
          <div style={{ background: '#fff', borderRadius: 4, width: 960, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 6px 16px rgba(0,0,0,0.15)', overflow: 'hidden' }}>
            {/* 标题栏 */}
            <div style={{ padding: '14px 16px', borderBottom: '1px solid #E8EAED', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 600, color: '#262626' }}>
                <span style={{ color: '#1677FF', display: 'flex' }}><Icon name="upload" size={15} /></span>
                导入预览
                {headerHash && (
                  <span style={{ fontSize: 12, fontWeight: 400, color: '#8c8c8c', marginLeft: 4 }}>
                    模板识别码：{headerHash}
                  </span>
                )}
              </div>
              <button onClick={() => { setImportModalVisible(false); setImportPreview(null); setImportResult(null); setPendingMapping({}); setImportHeaders([]); }} style={{ background: 'none', border: 'none', color: '#8c8c8c', fontSize: 18, cursor: 'pointer', lineHeight: 1, padding: '2px', borderRadius: 3, transition: 'all 0.15s' }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#595959'; (e.currentTarget as HTMLButtonElement).style.background = '#f5f5f5'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = '#8c8c8c'; (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}>
                <Icon name="close" size={16} />
              </button>
            </div>

            {/* 统计信息 */}
            {!importResult && (
              <div style={{ padding: '10px 16px', borderBottom: '1px solid #E8EAED', display: 'flex', gap: 24, alignItems: 'center', flexShrink: 0, background: '#F5F7FA', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', gap: 16, fontSize: 13 }}>
                  <span>共 <strong style={{ color: '#262626' }}>{importPreview.total}</strong> 条数据</span>
                  <span style={{ color: '#52c41a' }}>✓ 有效 <strong>{importPreview.validCount}</strong> 条</span>
                  {importPreview.errorCount > 0 && <span style={{ color: '#ff4d4f' }}>✗ 有误 <strong>{importPreview.errorCount}</strong> 条</span>}
                </div>
                <div style={{ fontSize: 12, color: '#8c8c8c' }}>仅前 20 条预览，完整数据将在确认后导入</div>
              </div>
            )}

            {/* 映射配置面板 */}
            {!importResult && importHeaders.length > 0 && (
              <div style={{ padding: '8px 16px 0', flexShrink: 0 }}>
                <MappingPanel
                  headers={importHeaders}
                  pendingMapping={pendingMapping}
                  setPendingMapping={setPendingMapping}
                  fieldLabelMap={fieldLabelMap}
                  onSaveTemplate={() => handleSaveTemplate(headerHash, pendingMapping)}
                  savedMappingCount={savedMappingCount}
                />
              </div>
            )}

            {/* 导入结果 */}
            {importResult && (
              <div style={{ padding: '12px 16px', borderBottom: '1px solid #E8EAED', flexShrink: 0 }}>
                <div style={{ display: 'flex', gap: 16, fontSize: 13, marginBottom: importResult.errors.length > 0 ? 8 : 0 }}>
                  <span style={{ color: '#52c41a' }}>✓ 成功导入 <strong>{importResult.inserted}</strong> 条</span>
                  {importResult.skipped > 0 && <span style={{ color: '#fa8c16' }}>⚠ 跳过 <strong>{importResult.skipped}</strong> 条（编号已存在）</span>}
                </div>
                {importResult.errors.length > 0 && (
                  <div style={{ fontSize: 12, color: '#ff4d4f', maxHeight: 80, overflowY: 'auto', padding: '4px 0' }}>
                    {importResult.errors.map((err, i) => <div key={i}>• {err}</div>)}
                  </div>
                )}
              </div>
            )}

            {/* 预览表格 */}
            {!importResult && (
              <div style={{ overflow: 'auto', flex: 1, minHeight: 0 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 800, border: '1px solid #E8EAED', borderRadius: 4, overflow: 'hidden' }}>
                  <thead>
                    <tr style={{ background: '#EFF5FF', position: 'sticky', top: 0, zIndex: 1 }}>
                      <th style={{ padding: '8px 6px', borderBottom: '1px solid #E8EAED', textAlign: 'center', color: '#000', fontWeight: 600, width: 50 }}>行号</th>
                      <th style={{ padding: '8px 6px', borderBottom: '1px solid #E8EAED', textAlign: 'center', color: '#000', fontWeight: 600, width: 80 }}>校验状态</th>
                      <th style={{ padding: '8px 6px', borderBottom: '1px solid #E8EAED', textAlign: 'left', color: '#000', fontWeight: 600, width: 90 }}>费用编号</th>
                      <th style={{ padding: '8px 6px', borderBottom: '1px solid #E8EAED', textAlign: 'left', color: '#000', fontWeight: 600, width: 130 }}>费用名称</th>
                      <th style={{ padding: '8px 6px', borderBottom: '1px solid #E8EAED', textAlign: 'center', color: '#000', fontWeight: 600, width: 90 }}>所属业务域</th>
                      <th style={{ padding: '8px 6px', borderBottom: '1px solid #E8EAED', textAlign: 'left', color: '#000', fontWeight: 600, width: 200 }}>所属报价</th>
                      <th style={{ padding: '8px 6px', borderBottom: '1px solid #E8EAED', textAlign: 'left', color: '#000', fontWeight: 600 }}>错误信息</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importPreview.preview.map((row, idx) => {
                      const hasError = row.errors.length > 0;
                      const isEven = idx % 2 === 1;
                      return (
                        <tr key={idx} style={{ background: hasError ? '#fff1f0' : (isEven ? '#F5F7FA' : '#FFF'), transition: 'background 0.15s' }}>
                          <td style={{ padding: '7px 6px', borderBottom: '1px solid #E8EAED', textAlign: 'center', color: 'rgba(0,0,0,0.45)' }}>{row.row}</td>
                          <td style={{ padding: '7px 6px', borderBottom: '1px solid #E8EAED', textAlign: 'center' }}>
                            {hasError
                              ? <span style={{ color: '#FF4D4F', fontSize: 11 }}>✗ 有误</span>
                              : <span style={{ color: '#52c41a', fontSize: 11 }}>✓ 有效</span>}
                          </td>
                          <td style={{ padding: '7px 6px', borderBottom: '1px solid #E8EAED', textAlign: 'left', fontFamily: 'monospace', fontSize: 12, color: '#1677FF' }}>{row.fee_code || '-'}</td>
                          <td style={{ padding: '7px 6px', borderBottom: '1px solid #E8EAED', textAlign: 'left', color: 'rgba(0,0,0,0.8)' }}><Tooltip content={row.fee_name}>{row.fee_name || '-'}</Tooltip></td>
                          <td style={{ padding: '7px 6px', borderBottom: '1px solid #E8EAED', textAlign: 'center' }}>
                            {row.business_domain
                              ? <span style={{ display: 'inline-block', padding: '1px 6px', borderRadius: 2, fontSize: 11, color: domainColor[row.business_domain] || '#1677FF', background: (domainColor[row.business_domain] || '#1677FF') + '1a' }}>{row.business_domain}</span>
                              : <span style={{ color: '#c0c0c0' }}>-</span>}
                          </td>
                          <td style={{ padding: '7px 6px', borderBottom: '1px solid #E8EAED', textAlign: 'left' }}>
                            {row.price_types && row.price_types.length > 0
                              ? row.price_types.map(pt => <span key={pt} style={{ display: 'inline-block', padding: '1px 4px', borderRadius: 2, fontSize: 10, background: '#f5f5f5', color: 'rgba(0,0,0,0.65)', marginRight: 3 }}>{pt}</span>)
                              : <span style={{ color: '#c0c0c0' }}>-</span>}
                          </td>
                          <td style={{ padding: '7px 6px', borderBottom: '1px solid #E8EAED', textAlign: 'left', color: '#FF4D4F', fontSize: 11, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {hasError ? <Tooltip content={row.errors.join('；')} maxWidth={220}>{row.errors.join('；')}</Tooltip> : '-'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* 底部操作栏 */}
            <div style={{ padding: '10px 16px', borderTop: '1px solid #E8EAED', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0, flexWrap: 'wrap', gap: 8 }}>
              {!importResult ? (
                <>
                  <div style={{ fontSize: 12, color: '#8c8c8c' }}>
                    提示：编号已存在时，<strong style={{ color: '#fa8c16' }}>跳过</strong>保留原数据，<strong style={{ color: '#ff4d4f' }}>覆盖</strong>则覆盖更新
                    {importPreview.total > 500 && (
                      <span style={{ color: '#1677FF', marginLeft: 8 }}>
                        数据量较大（{importPreview.total} 条），将分批导入
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    {importing && (
                      <ProgressBar value={importProgress} label={importProgressText || '导入中...'} />
                    )}
                    <button onClick={() => { setImportModalVisible(false); setImportPreview(null); setPendingMapping({}); setImportHeaders([]); }} style={{ height: 30, padding: '0 20px', border: '1px solid #d9d9d9', borderRadius: 4, background: '#fff', cursor: 'pointer', fontSize: 13, color: '#595959', fontFamily: 'inherit', transition: 'all 0.15s' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#1677FF'; (e.currentTarget as HTMLButtonElement).style.color = '#1677FF'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#d9d9d9'; (e.currentTarget as HTMLButtonElement).style.color = '#595959'; }}>
                      取消
                    </button>
                    <button onClick={() => handleImportConfirm('skip')} disabled={importing || importPreview.validCount === 0} style={{ height: 30, padding: '0 20px', border: '1px solid #fa8c16', borderRadius: 4, background: importing || importPreview.validCount === 0 ? '#f5f5f5' : '#fa8c16', color: importing || importPreview.validCount === 0 ? '#bfbfbf' : '#fff', cursor: importing || importPreview.validCount === 0 ? 'not-allowed' : 'pointer', fontSize: 13, fontFamily: 'inherit', transition: 'all 0.15s' }}
                      onMouseEnter={e => { if (!importing && importPreview.validCount > 0) (e.currentTarget as HTMLButtonElement).style.background = '#f59e00'; }}
                      onMouseLeave={e => { if (!importing && importPreview.validCount > 0) (e.currentTarget as HTMLButtonElement).style.background = '#fa8c16'; }}>
                      {importing ? '导入中...' : `跳过冲突 (${importPreview.validCount} 条)`}
                    </button>
                    <button onClick={() => handleImportConfirm('insert')} disabled={importing || importPreview.validCount === 0} style={{ height: 30, padding: '0 20px', border: 'none', borderRadius: 4, background: importing || importPreview.validCount === 0 ? '#a0cfff' : '#1677FF', color: '#fff', cursor: importing || importPreview.validCount === 0 ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 500, fontFamily: 'inherit', transition: 'all 0.15s', boxShadow: '0 2px 0 rgba(22,99,196,0.1)' }}
                      onMouseEnter={e => { if (!importing && importPreview.validCount > 0) (e.currentTarget as HTMLButtonElement).style.background = '#3880d0'; }}
                      onMouseLeave={e => { if (!importing && importPreview.validCount > 0) (e.currentTarget as HTMLButtonElement).style.background = '#1677FF'; }}>
                      {importing ? '导入中...' : `确认导入 (${importPreview.validCount} 条)`}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div />
                  <button onClick={() => { setImportModalVisible(false); setImportPreview(null); setImportResult(null); setPendingMapping({}); setImportHeaders([]); }} style={{ height: 30, padding: '0 24px', border: 'none', borderRadius: 4, background: '#1677FF', color: '#fff', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit', transition: 'background 0.15s', boxShadow: '0 2px 0 rgba(22,99,196,0.1)' }}
                    onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = '#3880d0'}
                    onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = '#1677FF'}>
                    关闭
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        visible={confirmVisible}
        title={confirmTarget.type === 'batch' ? '批量删除' : '删除确认'}
        message={
          confirmTarget.type === 'batch'
            ? <>确定删除选中的 <strong style={{ color: '#ff4d4f' }}>{selectedRows.length}</strong> 条数据吗？<br /><span style={{ color: '#8c8c8c', fontSize: 13 }}>删除后数据无法恢复，请谨慎操作。</span></>
            : <>确定删除费用类型 <strong style={{ color: '#262626' }}>「{confirmTarget.item?.feeName}」</strong> 吗？<br /><span style={{ color: '#8c8c8c', fontSize: 13 }}>删除后数据无法恢复，请谨慎操作。</span></>
        }
        confirmText="删除"
        cancelText="取消"
        confirmType="danger"
        onConfirm={doConfirmDelete}
        onCancel={() => setConfirmVisible(false)}
      />
    </div>
    </>
  );
}
