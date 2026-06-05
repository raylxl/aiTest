'use client';

import { useState, useCallback, useMemo } from 'react';
import type { ParsedOrder } from '@/types/rule';
import VirtualList from '../Common/VirtualList';

interface OrderTableProps {
  orders: ParsedOrder[];
  onEdit?: (index: number, order: ParsedOrder) => void;
  onDelete?: (index: number) => void;
  selectable?: boolean;
  selectedIndices?: number[];
  onSelectionChange?: (indices: number[]) => void;
  useVirtualScroll?: boolean; // 是否使用虚拟滚动
  virtualHeight?: number; // 虚拟列表高度
  duplicateNos?: string[]; // 重复运单号列表（高亮用）
}

export default function OrderTable({
  orders,
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

  // 使用useMemo优化排序
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

  const headers = [
    { key: 'index', label: '序号', width: 'w-14' },
    { key: 'orderNo', label: '外部编码', width: 'w-28' },
    { key: 'storeName', label: '收货门店', width: 'w-28' },
    { key: 'receiverName', label: '收件人', width: 'w-24' },
    { key: 'receiverPhone', label: '电话', width: 'w-28' },
    { key: 'itemCode', label: 'SKU编码', width: 'w-28' },
    { key: 'itemName', label: 'SKU名称', width: 'w-32' },
    { key: 'quantity', label: '发货数量', width: 'w-22' },
    { key: 'specification', label: '规格型号', width: 'w-26' },
    { key: 'remark', label: '备注', width: 'w-28' },
    { key: 'actions', label: '操作', width: 'w-20' },
  ];

  const renderRow = useCallback((order: ParsedOrder, index: number) => {
    const isSelected = selectedIndices.includes(index);
    const isDuplicate = order.orderNo ? duplicateSet.has(order.orderNo) : false;
    
    return (
      <tr
        key={index}
        className={`border-b border-gray-200 hover:bg-gray-50 ${
          isSelected ? 'bg-[#0fc6c2]/5' : ''
        } ${!order.isValid ? 'bg-red-50' : ''} ${isDuplicate && order.isValid ? 'bg-yellow-50' : ''}`}
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
        <td className={`px-4 py-3 text-sm w-28 font-medium ${isDuplicate ? 'text-yellow-700' : 'text-gray-900'}`}>
          {order.orderNo || '-'}
          {isDuplicate && <span className="ml-1 text-xs bg-yellow-200 text-yellow-800 px-1 rounded">重复</span>}
        </td>
        <td className="px-4 py-3 text-sm w-28" title={order.storeName}>
          {order.storeName ? (
            <span className="inline-flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-[#0fc6c2] shrink-0"></span>
              <span className="truncate max-w-[120px]">{order.storeName}</span>
            </span>
          ) : '-'}
        </td>
        <td className="px-4 py-3 text-sm text-gray-900 w-24">{order.receiverName || '-'}</td>
        <td className="px-4 py-3 text-sm text-gray-500 w-28">{order.receiverPhone || '-'}</td>
        <td className="px-4 py-3 text-sm text-gray-500 w-28 font-mono">{order.itemCode || '-'}</td>
        <td className="px-4 py-3 text-sm text-gray-900 w-32">{order.itemName || '-'}</td>
        <td className={`px-4 py-3 text-sm w-22 font-medium ${!order.quantity || order.quantity <= 0 ? 'text-red-600' : 'text-gray-900'}`}>
          {order.quantity ?? '-'}
          {!order.quantity && <span className="ml-1 text-xs text-red-400">缺</span>}
        </td>
        <td className="px-4 py-3 text-sm text-gray-500 w-26 truncate" title={order.specification}>
          {order.specification || '-'}
        </td>
        <td className="px-4 py-3 text-sm text-gray-400 w-28 truncate" title={order.remark}>
          {order.remark || '-'}
        </td>
        <td className="px-4 py-3 text-sm w-24">
          <div className="flex gap-2">
            {onEdit && (
              <button
                onClick={() => onEdit(index, order)}
                className="text-[#0fc6c2] hover:text-[#0aa8a4]"
              >
                编辑
              </button>
            )}
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
  }, [selectedIndices, selectable, onEdit, onDelete, toggleSelect, duplicateSet]);

  // 虚拟列表渲染单行
  const renderVirtualRow = useCallback((order: ParsedOrder, index: number) => {
    const isDuplicate = order.orderNo ? duplicateSet.has(order.orderNo) : false;
    return (
      <div className={`flex items-center border-b border-gray-200 hover:bg-gray-50 h-[48px] ${!order.isValid ? 'bg-red-50' : ''} ${isDuplicate && order.isValid ? 'bg-yellow-50' : ''}`}>
        {selectable && (
          <div className="px-4 w-10">
            <input
              type="checkbox"
              checked={selectedIndices.includes(index)}
              onChange={() => toggleSelect(index)}
              className="w-4 h-4 text-[#0fc6c2] border-gray-300 rounded focus:ring-[#0fc6c2]"
            />
          </div>
        )}
        <div className="px-4 text-sm text-gray-500 w-14">{index + 1}</div>
        <div className={`px-4 text-sm w-28 flex items-center gap-1 truncate ${isDuplicate ? 'text-yellow-700 font-medium' : 'text-gray-900'}`}>
          {order.orderNo || '-'}
          {isDuplicate && <span className="text-xs bg-yellow-200 text-yellow-800 px-1 rounded shrink-0">重复</span>}
        </div>
        <div className="px-4 text-sm w-28 truncate" title={order.storeName}>
          {order.storeName ? (
            <span className="inline-flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-[#0fc6c2] shrink-0"></span>
              <span className="truncate">{order.storeName}</span>
            </span>
          ) : '-'}
        </div>
        <div className="px-4 text-sm text-gray-900 w-24 truncate">{order.receiverName || '-'}</div>
        <div className="px-4 text-sm text-gray-500 w-28">{order.receiverPhone || '-'}</div>
        <div className="px-4 text-sm text-gray-500 w-28 font-mono truncate">{order.itemCode || '-'}</div>
        <div className="px-4 text-sm text-gray-900 w-32 truncate">{order.itemName || '-'}</div>
        <div className={`px-4 text-sm w-22 font-medium ${!order.quantity || order.quantity <= 0 ? 'text-red-600' : 'text-gray-900'}`}>
          {order.quantity ?? '-'}
          {!order.quantity && <span className="ml-1 text-xs text-red-400">缺</span>}
        </div>
        <div className="px-4 text-sm text-gray-500 w-26 truncate" title={order.specification}>
          {order.specification || '-'}
        </div>
        <div className="px-4 text-sm text-gray-400 w-28 truncate" title={order.remark}>
          {order.remark || '-'}
        </div>
        <div className="px-4 text-sm w-20">
          <div className="flex gap-2">
            {onEdit && (
              <button onClick={() => onEdit(index, order)} className="text-[#0fc6c2] hover:text-[#0aa8a4]">编辑</button>
            )}
            {onDelete && (
              <button onClick={() => onDelete(index)} className="text-red-500 hover:text-red-700">删除</button>
            )}
          </div>
        </div>
      </div>
    );
  }, [selectedIndices, selectable, onEdit, onDelete, toggleSelect, duplicateSet]);

  if (orders.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
        <svg className="w-12 h-12 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <p className="text-gray-500">暂无数据</p>
      </div>
    );
  }

  // 使用虚拟滚动
  if (useVirtualScroll && sortedOrders.length > 100) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {/* 统计信息 */}
        <div className="px-3 sm:px-4 py-2 sm:py-3 bg-gray-50 border-b border-gray-200 flex flex-col xs:flex-row justify-between items-start xs:items-center gap-2">
          <span className="text-xs sm:text-sm text-gray-600">
            共 <span className="font-medium text-[#0fc6c2]">{orders.length}</span> 条记录
            {selectedIndices.length > 0 && (
              <span className="ml-2">，已选 <span className="font-medium text-[#0fc6c2]">{selectedIndices.length}</span> 条</span>
            )}
          </span>
        <div className="flex gap-1 sm:gap-2 flex-wrap">
          {orders.filter(o => !o.isValid).length > 0 && (
            <span className="text-xs sm:text-sm text-red-500">
              {orders.filter(o => !o.isValid).length} 条有误
            </span>
          )}
          {duplicateNos.length > 0 && (
            <span className="text-xs sm:text-sm text-yellow-600">
              ⚠️{duplicateNos.length} 重复
            </span>
          )}
          <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded">
            虚拟滚动
          </span>
        </div>
        </div>

        {/* 表头 */}
        <div className="flex items-center bg-gray-50 border-b border-gray-200 h-[48px]">
          {selectable && (
            <div className="px-4 w-10">
              <input
                type="checkbox"
                checked={selectedIndices.length === orders.length}
                onChange={toggleSelectAll}
                className="w-4 h-4 text-[#0fc6c2] border-gray-300 rounded focus:ring-[#0fc6c2]"
              />
            </div>
          )}
          {headers.map((header) => (
            <div
              key={header.key}
              className={`px-4 text-xs font-medium text-gray-500 uppercase tracking-wider ${header.width} ${
                header.key !== 'index' && header.key !== 'actions' ? 'cursor-pointer hover:text-gray-700' : ''
              }`}
              onClick={() => header.key !== 'index' && header.key !== 'actions' && handleSort(header.key as keyof ParsedOrder)}
            >
              <div className="flex items-center gap-1">
                {header.label}
                {sortField === header.key && (
                  <span className="text-[#0fc6c2]">
                    {sortDirection === 'asc' ? '↑' : '↓'}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* 虚拟列表 - 最小宽度确保横向滚动 */}
        <div className="overflow-x-auto">
          <div className="min-w-[800px]">
        <VirtualList
          items={sortedOrders}
          itemHeight={48}
          height={virtualHeight}
          renderItem={renderVirtualRow}
          overscan={10}
        />
          </div>
        </div>
      </div>
    );
  }

  // 普通表格
  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      {/* 统计信息 - 响应式 */}
      <div className="px-3 sm:px-4 py-2 sm:py-3 bg-gray-50 border-b border-gray-200 flex flex-col xs:flex-row justify-between items-start xs:items-center gap-2">
        <span className="text-xs sm:text-sm text-gray-600">
          共 <span className="font-medium text-[#0fc6c2]">{orders.length}</span> 条记录
          {selectedIndices.length > 0 && (
            <span className="ml-2">，已选 <span className="font-medium text-[#0fc6c2]">{selectedIndices.length}</span> 条</span>
            )}
        </span>
        <div className="flex gap-1 sm:gap-2 flex-wrap">
          {orders.filter(o => !o.isValid).length > 0 && (
            <span className="text-xs sm:text-sm text-red-500">
              {orders.filter(o => !o.isValid).length} 条有误
            </span>
          )}
          {duplicateNos.length > 0 && (
            <span className="text-xs sm:text-sm text-yellow-600">
              ⚠️{duplicateNos.length} 重复
            </span>
          )}
        </div>
      </div>
      {/* 表格横向滚动容器 - 最小宽度保证列不塌陷 */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[800px]">
          <thead className="bg-gray-50">
            <tr>
              {selectable && (
                <th className="px-4 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={selectedIndices.length === orders.length}
                    onChange={toggleSelectAll}
                    className="w-4 h-4 text-[#0fc6c2] border-gray-300 rounded focus:ring-[#0fc6c2]"
                  />
                </th>
              )}
              {headers.map((header) => (
                <th
                  key={header.key}
                  className={`px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider ${header.width} ${
                    header.key !== 'index' && header.key !== 'actions' ? 'cursor-pointer hover:text-gray-700' : ''
                  }`}
                  onClick={() => header.key !== 'index' && header.key !== 'actions' && handleSort(header.key as keyof ParsedOrder)}
                >
                  <div className="flex items-center gap-1">
                    {header.label}
                    {sortField === header.key && (
                      <span className="text-[#0fc6c2]">
                        {sortDirection === 'asc' ? '↑' : '↓'}
                      </span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {sortedOrders.map((order, idx) => {
              const originalIndex = orders.indexOf(order);
              return renderRow(order, originalIndex);
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
