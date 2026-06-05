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
}: OrderTableProps) {
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
    { key: 'index', label: '序号', width: 'w-16' },
    { key: 'orderNo', label: '运单号', width: 'w-32' },
    { key: 'receiverName', label: '收货人', width: 'w-24' },
    { key: 'receiverPhone', label: '电话', width: 'w-28' },
    { key: 'receiverAddress', label: '收货地址', width: 'w-48' },
    { key: 'itemName', label: '物品名称', width: 'w-32' },
    { key: 'itemCode', label: '物品编码', width: 'w-28' },
    { key: 'quantity', label: '数量', width: 'w-20' },
    { key: 'unit', label: '单位', width: 'w-16' },
    { key: 'actions', label: '操作', width: 'w-24' },
  ];

  const renderRow = useCallback((order: ParsedOrder, index: number) => {
    const isSelected = selectedIndices.includes(index);
    
    return (
      <tr
        className={`border-b border-gray-200 hover:bg-gray-50 ${
          isSelected ? 'bg-[#0fc6c2]/5' : ''
        } ${!order.isValid ? 'bg-red-50' : ''}`}
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
        <td className="px-4 py-3 text-sm text-gray-500 w-16">{index + 1}</td>
        <td className="px-4 py-3 text-sm text-gray-900 w-32">{order.orderNo || '-'}</td>
        <td className="px-4 py-3 text-sm text-gray-900 w-24">{order.receiverName || '-'}</td>
        <td className="px-4 py-3 text-sm text-gray-500 w-28">{order.receiverPhone || '-'}</td>
        <td className="px-4 py-3 text-sm text-gray-500 w-48 truncate" title={order.receiverAddress}>
          {order.receiverAddress || '-'}
        </td>
        <td className="px-4 py-3 text-sm text-gray-900 w-32">{order.itemName || '-'}</td>
        <td className="px-4 py-3 text-sm text-gray-500 w-28">{order.itemCode || '-'}</td>
        <td className="px-4 py-3 text-sm text-gray-900 w-20">{order.quantity ?? '-'}</td>
        <td className="px-4 py-3 text-sm text-gray-500 w-16">{order.unit || '-'}</td>
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
  }, [selectedIndices, selectable, onEdit, onDelete, toggleSelect]);

  // 虚拟列表渲染单行
  const renderVirtualRow = useCallback((order: ParsedOrder, index: number) => {
    return (
      <div className="flex items-center border-b border-gray-200 hover:bg-gray-50 h-[48px]">
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
        <div className="px-4 text-sm text-gray-500 w-16">{index + 1}</div>
        <div className="px-4 text-sm text-gray-900 w-32">{order.orderNo || '-'}</div>
        <div className="px-4 text-sm text-gray-900 w-24">{order.receiverName || '-'}</div>
        <div className="px-4 text-sm text-gray-500 w-28">{order.receiverPhone || '-'}</div>
        <div className="px-4 text-sm text-gray-500 w-48 truncate" title={order.receiverAddress}>
          {order.receiverAddress || '-'}
        </div>
        <div className="px-4 text-sm text-gray-900 w-32">{order.itemName || '-'}</div>
        <div className="px-4 text-sm text-gray-500 w-28">{order.itemCode || '-'}</div>
        <div className="px-4 text-sm text-gray-900 w-20">{order.quantity ?? '-'}</div>
        <div className="px-4 text-sm text-gray-500 w-16">{order.unit || '-'}</div>
        <div className="px-4 text-sm w-24">
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
        </div>
      </div>
    );
  }, [selectedIndices, selectable, onEdit, onDelete, toggleSelect]);

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
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex justify-between items-center">
          <span className="text-sm text-gray-600">
            共 <span className="font-medium text-[#0fc6c2]">{orders.length}</span> 条记录
            {selectedIndices.length > 0 && (
              <span className="ml-2">
                ，已选择 <span className="font-medium text-[#0fc6c2]">{selectedIndices.length}</span> 条
              </span>
            )}
          </span>
          <div className="flex gap-2">
            {orders.filter(o => !o.isValid).length > 0 && (
              <span className="text-sm text-red-500">
                {orders.filter(o => !o.isValid).length} 条数据有误
              </span>
            )}
            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded">
              虚拟滚动模式
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

        {/* 虚拟列表 */}
        <VirtualList
          items={sortedOrders}
          itemHeight={48}
          height={virtualHeight}
          renderItem={renderVirtualRow}
          overscan={10}
        />
      </div>
    );
  }

  // 普通表格
  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      {/* 统计信息 */}
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex justify-between items-center">
        <span className="text-sm text-gray-600">
          共 <span className="font-medium text-[#0fc6c2]">{orders.length}</span> 条记录
          {selectedIndices.length > 0 && (
            <span className="ml-2">
              ，已选择 <span className="font-medium text-[#0fc6c2]">{selectedIndices.length}</span> 条
            </span>
          )}
        </span>
        <div className="flex gap-2">
          {orders.filter(o => !o.isValid).length > 0 && (
            <span className="text-sm text-red-500">
              {orders.filter(o => !o.isValid).length} 条数据有误
            </span>
          )}
        </div>
      </div>

      {/* 表格 */}
      <div className="overflow-x-auto">
        <table className="w-full">
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
