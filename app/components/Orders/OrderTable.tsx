'use client';

import { useState, useCallback, useMemo, useRef } from 'react';
import type { ParsedOrder } from '@/types/rule';
import VirtualList from '../Common/VirtualList';

interface OrderTableProps {
  orders: ParsedOrder[];
  onOrdersChange?: (orders: ParsedOrder[]) => void; // 数据变更回调（编辑/新增时触发）
  onEdit?: (index: number, order: ParsedOrder) => void;
  onDelete?: (index: number) => void;
  selectable?: boolean;
  selectedIndices?: number[];
  onSelectionChange?: (indices: number[]) => void;
  useVirtualScroll?: boolean;
  virtualHeight?: number;
  duplicateNos?: string[];
}

// 可编辑字段配置
const EDITABLE_FIELDS = [
  { key: 'orderNo' as const, label: '外部编码', type: 'text' },
  { key: 'storeName' as const, label: '收货门店', type: 'text', group: 'A' },
  { key: 'receiverName' as const, label: '收件人姓名', type: 'text', group: 'B' },
  { key: 'receiverPhone' as const, label: '收件人电话', type: 'text', group: 'B' },
  { key: 'receiverAddress' as const, label: '收件人地址', type: 'text', group: 'B' },
  { key: 'itemCode' as const, label: 'SKU物品编码', type: 'text', required: true },
  { key: 'itemName' as const, label: 'SKU物品名称', type: 'text', required: true },
  { key: 'quantity' as const, label: 'SKU发货数量', type: 'number', required: true },
  { key: 'specification' as const, label: 'SKU规格型号', type: 'text' },
  { key: 'remark' as const, label: '备注', type: 'text' },
] as const;

type EditableKey = typeof EDITABLE_FIELDS[number]['key'];

// 判断字段是否有错误
function getFieldError(order: ParsedOrder, fieldKey: EditableKey): string | null {
  if (!order.isValid && order.validationErrors?.length) {
    const errors = order.validationErrors;
    switch (fieldKey) {
      case 'storeName':
        return errors.some(e => e.includes('收货门店') || e.includes('A组')) ? errors[0] : null;
      case 'receiverName':
      case 'receiverPhone':
      case 'receiverAddress':
        return errors.some(e =>
          e.includes(fieldKey === 'receiverName' ? '收件人姓名' :
            fieldKey === 'receiverPhone' ? '收件人电话' : '收件人地址') ||
          e.includes('B组') || e.includes('收件人')
        ) ? errors[0] : null;
      case 'itemCode':
        return errors.some(e => e.includes('SKU') && (e.includes('编码') || e.includes('物品编码'))) ? errors[0] : null;
      case 'itemName':
        return errors.some(e => e.includes('SKU') && (e.includes('名称') || e.includes('物品名称'))) ? errors[0] : null;
      case 'quantity':
        return errors.some(e => e.includes('数量') || e.includes('正数')) ? errors[0] : null;
      default:
        return null;
    }
  }
  return null;
}

export default function OrderTable({
  orders,
  onOrdersChange,
  onEdit,
  onDelete,
  selectable = false,
  selectedIndices = [],
  onSelectionChange,
  useVirtualScroll = false,
  virtualHeight = 500,
  duplicateNos = [],
}: OrderTableProps) {
  const duplicateSet = useMemo(() => new Set(duplicateNos), [duplicateNos]);
  const [sortField, setSortField] = useState<keyof ParsedOrder | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  // 行内编辑状态: { rowIndex: { fieldName: editing } }
  const [editingCell, setEditingCell] = useState<{ row: number | null; field: EditableKey | null }>({ row: null, field: null });
  const editInputRef = useRef<HTMLInputElement>(null);

  const sortedOrders = useMemo(() => {
    if (!sortField) return orders;
    return [...orders].sort((a, b) => {
      const aVal = a[sortField] ?? '';
      const bVal = b[sortField] ?? '';
      const compare = String(aVal).localeCompare(String(bVal), 'zh-CN');
      return sortDirection === 'asc' ? compare : -compare;
    });
  }, [orders, sortField, sortDirection]);

  const handleSort = useCallback((field: keyof ParsedOrder) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  }, [sortField]);

  const toggleSelect = useCallback((index: number) => {
    if (!onSelectionChange) return;
    const newSelection = selectedIndices.includes(index)
      ? selectedIndices.filter(i => i !== index)
      : [...selectedIndices, index];
    onSelectionChange(newSelection);
  }, [selectedIndices, onSelectionChange]);

  const toggleSelectAll = useCallback(() => {
    if (!onSelectionChange) return;
    if (selectedIndices.length === orders.length) {
      onSelectionChange([]);
    } else {
      onSelectionChange(orders.map((_, i) => i));
    }
  }, [orders, selectedIndices, onSelectionChange]);

  // 更新单个单元格值
  const handleCellUpdate = useCallback((rowIndex: number, field: EditableKey, value: string | number) => {
    if (!onOrdersChange) return;
    // 构建新数组并调用 onOrdersChange 回调
    const updated = [...orders];
    updated[rowIndex] = { ...updated[rowIndex], [field]: value };
    // 清除旧错误，让父组件重新校验
    delete (updated[rowIndex] as any).isValid;
    delete (updated[rowIndex] as any).validationErrors;
    onOrdersChange(updated);
    setEditingCell({ row: null, field: null });
  }, [onOrdersChange, orders]);

  // 新增空行
  const handleAddRow = useCallback(() => {
    if (!onOrdersChange) return;
    const newOrder: ParsedOrder = {
      orderNo: '',
      storeName: '',
      receiverName: '',
      receiverPhone: '',
      receiverAddress: '',
      itemCode: '',
      itemName: '',
      quantity: 0,
      specification: '',
      remark: '',
      isValid: false,
      validationErrors: ['请填写完整信息'],
    };
    onOrdersChange([...orders, newOrder]);
  }, [onOrdersChange, orders]);

  const headers = [
    { key: 'index', label: '序号', width: 'w-14' },
    { key: 'orderNo', label: '外部编码', width: 'w-28' },
    { key: 'storeName', label: '收货门店', width: 'w-28' },
    { key: 'receiverName', label: '收件人', width: 'w-24' },
    { key: 'receiverPhone', label: '电话', width: 'w-28' },
    { key: 'itemCode', label: 'SKU物品编码', width: 'w-28' },
    { key: 'itemName', label: 'SKU物品名称', width: 'w-32' },
    { key: 'quantity', label: 'SKU发货数量', width: 'w-22' },
    { key: 'specification', label: 'SKU规格型号', width: 'w-26' },
    { key: 'remark', label: '备注', width: 'w-28' },
    { key: 'actions', label: '操作', width: 'w-20' },
  ];

  // 渲染可编辑单元格
  const renderEditableCell = (
    order: ParsedOrder,
    index: number,
    field: EditableKey,
    displayValue: any,
    className: string = ''
  ) => {
    const isEditing = editingCell.row === index && editingCell.field === field;
    const error = getFieldError(order, field);
    const hasError = !!error;

    if (isEditing && onOrdersChange) {
      setTimeout(() => editInputRef.current?.focus(), 0);
      return (
        <td className={`px-2 py-1 ${className}`}>
          <input
            ref={editInputRef}
            type={EDITABLE_FIELDS.find(f => f.key === field)?.type || 'text'}
            defaultValue={displayValue ?? ''}
            className="w-full px-1.5 py-0.5 text-sm border border-[#0fc6c2] rounded outline-none focus:ring-1 focus:ring-[#0fc6c2]"
            onBlur={(e) => handleCellUpdate(index, field, e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCellUpdate(index, field, (e.target as HTMLInputElement).value);
              if (e.key === 'Escape') setEditingCell({ row: null, field: null });
            }}
          />
        </td>
      );
    }

    return (
      <td
        className={`px-4 py-3 text-sm cursor-pointer hover:bg-blue-50 transition-colors ${className} ${
          hasError ? 'bg-red-50 border-b-2 border-red-400' : ''
        }`}
        onClick={() => onOrdersChange && setEditingCell({ row: index, field })}
        title={hasError ? error : '点击编辑'}
      >
        <span className={hasError ? 'text-red-600 font-medium' : ''}>
          {displayValue ?? (hasError ? '⚠ 缺失' : '-')}
        </span>
        {hasError && <div className="text-xs text-red-400 mt-0.5 truncate">{error}</div>}
      </td>
    );
  };

  const renderRow = useCallback((order: ParsedOrder, index: number) => {
    const isSelected = selectedIndices.includes(index);
    const isDuplicate = order.orderNo ? duplicateSet.has(order.orderNo) : false;

    return (
      <tr
        key={index}
        className={`border-b border-gray-200 hover:bg-gray-50 ${
          isSelected ? 'bg-[#0fc6c2]/5' : ''
        } ${!order.isValid ? 'bg-red-50/30' : ''} ${isDuplicate && order.isValid ? 'bg-yellow-50' : ''}`}
      >
        {selectable && (
          <td className="px-4 py-3 w-10">
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => toggleSelect(index)}
              className="w-4 h-4 text-[#0fc6c2] border-gray-300 rounded focus:ring-[#0fc6c2]"
            />
          </td>
        )}
        <td className="px-4 py-3 text-sm text-gray-500 w-14">{index + 1}</td>

        {/* 外部编码 */}
        {renderEditableCell(order, index, 'orderNo', order.orderNo, `w-28 ${isDuplicate ? 'text-yellow-700 font-medium' : 'text-gray-900'}`)}

        {/* 收货门店 (A组) */}
        {renderEditableCell(order, index, 'storeName', order.storeName, 'w-28')}
        {/* 收件人姓名 (B组) */}
        {renderEditableCell(order, index, 'receiverName', order.receiverName, 'w-24')}
        {/* 收件人电话 (B组) */}
        {renderEditableCell(order, index, 'receiverPhone', order.receiverPhone, 'w-28')}
        {/* SKU编码 */}
        {renderEditableCell(order, index, 'itemCode', order.itemCode, 'w-28 font-mono')}
        {/* SKU名称 */}
        {renderEditableCell(order, index, 'itemName', order.itemName, 'w-32')}
        {/* 发货数量 */}
        {renderEditableCell(order, index, 'quantity', order.quantity ?? '', 'w-22 font-medium')}
        {/* 规格型号 */}
        {renderEditableCell(order, index, 'specification', order.specification, 'w-26')}
        {/* 备注 */}
        {renderEditableCell(order, index, 'remark', order.remark, 'w-28')}

        <td className="px-4 py-3 text-sm w-20">
          <div className="flex gap-2">
            {onDelete && (
              <button
                onClick={() => onDelete(index)}
                className="text-red-500 hover:text-red-700"
              >
                删除
              </button>
            )}
          </div>
        </td>
      </tr>
    );
  }, [selectedIndices, selectable, onDelete, toggleSelect, duplicateSet, editingCell, onOrdersChange]);

  // 虚拟列表渲染单行（简化版）
  const renderVirtualRow = useCallback((order: ParsedOrder, index: number) => {
    const isDuplicate = order.orderNo ? duplicateSet.has(order.orderNo) : false;
    return (
      <div className={`flex items-center border-b border-gray-200 hover:bg-gray-50 h-[48px] ${!order.isValid ? 'bg-red-50/30' : ''} ${isDuplicate && order.isValid ? 'bg-yellow-50' : ''}`}>
        {selectable && (
          <div className="px-4 w-10">
            <input type="checkbox" checked={selectedIndices.includes(index)} onChange={() => toggleSelect(index)}
              className="w-4 h-4 text-[#0fc6c2] border-gray-300 rounded" />
          </div>
        )}
        <div className="px-4 text-sm text-gray-500 w-14">{index + 1}</div>
        <div className={`px-4 text-sm w-28 truncate ${isDuplicate ? 'text-yellow-700 font-medium' : 'text-gray-900'}`} title={order.orderNo}>
          {order.orderNo || '-'}</div>
        <div className="px-4 text-sm w-28 truncate" title={order.storeName}>{order.storeName || '-'}</div>
        <div className="px-4 text-sm w-24 truncate">{order.receiverName || '-'}</div>
        <div className="px-4 text-sm w-28 truncate">{order.receiverPhone || '-'}</div>
        <div className="px-4 text-sm w-28 font-mono truncate">{order.itemCode || '-'}</div>
        <div className="px-4 text-sm w-32 truncate">{order.itemName || '-'}</div>
        <div className={`px-4 text-sm w-22 font-medium ${!order.quantity || order.quantity <= 0 ? 'text-red-600' : ''}`}>
          {order.quantity ?? '-'}
        </div>
        <div className="px-4 text-sm w-26 truncate" title={order.specification}>{order.specification || '-'}</div>
        <div className="px-4 text-sm w-28 truncate" title={order.remark}>{order.remark || '-'}</div>
        <div className="px-4 text-sm w-20 flex gap-2">
          {onDelete && (<button onClick={() => onDelete(index)} className="text-red-500">删除</button>)}
        </div>
      </div>
    );
  }, [selectedIndices, selectable, onDelete, toggleSelect, duplicateSet]);

  if (orders.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
        <svg className="w-12 h-12 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <p className="text-gray-500 mb-4">暂无数据</p>
        {onOrdersChange && (
          <button
            onClick={handleAddRow}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-sm bg-[#0fc6c2] text-white rounded-lg hover:bg-[#0aa8a4]"
          >
            + 新增行
          </button>
        )}
      </div>
    );
  }

  const errorCount = orders.filter(o => !o.isValid).length;

  // 使用虚拟滚动
  if (useVirtualScroll && sortedOrders.length > 100) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-3 sm:px-4 py-2 sm:py-3 bg-gray-50 border-b border-gray-200 flex flex-col xs:flex-row justify-between items-start xs:items-center gap-2">
          <span className="text-xs sm:text-sm text-gray-600">
            共 <span className="font-medium text-[#0fc6c2]">{orders.length}</span> 条记录
            {selectedIndices.length > 0 && (
              <span className="ml-2">，已选 <span className="font-medium text-[#0fc6c2]">{selectedIndices.length}</span> 条</span>
            )}
          </span>
          <div className="flex gap-1 sm:gap-2 flex-wrap items-center">
            {errorCount > 0 && (
              <span className="text-xs sm:text-sm text-red-500 font-medium">
                ⚠ {errorCount} 条有误
              </span>
            )}
            {duplicateNos.length > 0 && (
              <span className="text-xs sm:text-sm text-yellow-600">
                ⚠{duplicateNos.length} 重复
              </span>
            )}
            {onOrdersChange && (
              <button onClick={handleAddRow}
                className="text-xs px-2 py-1 bg-[#0fc6c2] text-white rounded hover:bg-[#0aa8a4]">
                + 新增行
              </button>
            )}
            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded">虚拟滚动</span>
          </div>
        </div>

        <div className="flex items-center bg-gray-50 border-b border-gray-200 h-[48px]">
          {selectable && (
            <div className="px-4 w-10">
              <input type="checkbox" checked={selectedIndices.length === orders.length} onChange={toggleSelectAll}
                className="w-4 h-4 text-[#0fc6c2] border-gray-300 rounded" />
            </div>
          )}
          {headers.map((header) => (
            <div key={header.key}
              className={`px-4 text-xs font-medium text-gray-500 uppercase tracking-wider ${header.width} ${
                header.key !== 'index' && header.key !== 'actions' ? 'cursor-pointer hover:text-gray-700' : ''
              }`}
              onClick={() => header.key !== 'index' && header.key !== 'actions' && handleSort(header.key as keyof ParsedOrder)}
            >
              <div className="flex items-center gap-1">
                {header.label}
                {sortField === header.key && (
                  <span className="text-[#0fc6c2]">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="overflow-x-auto">
          <div className="min-w-[800px]">
            <VirtualList items={sortedOrders} itemHeight={48} height={virtualHeight} renderItem={renderVirtualRow} overscan={10} />
          </div>
        </div>
      </div>
    );
  }

  // 普通表格
  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="px-3 sm:px-4 py-2 sm:py-3 bg-gray-50 border-b border-gray-200 flex flex-col xs:flex-row justify-between items-start xs:items-center gap-2">
        <span className="text-xs sm:text-sm text-gray-600">
          共 <span className="font-medium text-[#0fc6c2]">{orders.length}</span> 条记录
          {selectedIndices.length > 0 && (
            <span className="ml-2">，已选 <span className="font-medium text-[#0fc6c2]">{selectedIndices.length}</span> 条</span>
          )}
        </span>
        <div className="flex gap-1 sm:gap-2 flex-wrap items-center">
          {errorCount > 0 && (
            <button
              onClick={() => {
                // 展开所有错误详情
                const allErrors: string[] = [];
                orders.forEach((o, i) => {
                  if (!o.isValid && o.validationErrors?.length) {
                    o.validationErrors.forEach(e => allErrors.push(`第${i+1}行: ${e}`));
                  }
                });
                alert(allErrors.join('\n'));
              }}
              className="text-xs sm:text-sm text-red-500 font-medium hover:text-red-700 cursor-pointer"
              title="点击查看所有错误详情"
            >
              ⚠ {errorCount} 条有误（点击查看）
            </button>
          )}
          {duplicateNos.length > 0 && (
            <span className="text-xs sm:text-sm text-yellow-600">⚠{duplicateNos.length} 重复</span>
          )}
          {onOrdersChange && (
            <button onClick={handleAddRow}
              className="text-xs px-2 py-1 bg-[#0fc6c2] text-white rounded hover:bg-[#0aa8a4]">
              + 新增行
            </button>
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[800px]">
          <thead className="bg-gray-50">
            <tr>
              {selectable && (
                <th className="px-4 py-3 w-10">
                  <input type="checkbox" checked={selectedIndices.length === orders.length} onChange={toggleSelectAll}
                    className="w-4 h-4 text-[#0fc6c2] border-gray-300 rounded" />
                </th>
              )}
              {headers.map((header) => (
                <th key={header.key}
                  className={`px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider ${header.width} ${
                    header.key !== 'index' && header.key !== 'actions' ? 'cursor-pointer hover:text-gray-700' : ''
                  }`}
                  onClick={() => header.key !== 'index' && header.key !== 'actions' && handleSort(header.key as keyof ParsedOrder)}
                >
                  <div className="flex items-center gap-1">
                    {header.label}
                    {sortField === header.key && (
                      <span className="text-[#0fc6c2]">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {sortedOrders.map((order, idx) => {
              const originalIndex = orders.indexOf(order);
              return renderRow(order, originalIndex >= 0 ? originalIndex : idx);
            })}
          </tbody>
        </table>
      </div>

      {/* 错误汇总面板 */}
      {errorCount > 0 && (
        <div className="px-4 py-3 bg-red-50 border-t border-red-200">
          <details open>
            <summary className="text-sm font-medium text-red-700 cursor-pointer select-none">
              错误详情（{errorCount}条记录有误）— 点击展开/折叠
            </summary>
            <ul className="mt-2 space-y-1 max-h-40 overflow-y-auto text-xs text-red-600">
              {orders.map((o, i) =>
                !o.isValid && o.validationErrors?.length ? (
                  <li key={i}>
                    <strong>第{i+1}行</strong>:
                    {o.validationErrors.map((err, ei) => (
                      <span key={ei} className="ml-1">• {err}</span>
                    ))}
                    {o.orderNo && duplicateSet.has(o.orderNo) && <span className="ml-2 text-yellow-600">(同时重复)</span>}
                  </li>
                ) : null
              )}
            </ul>
          </details>
        </div>
      )}
    </div>
  );
}
