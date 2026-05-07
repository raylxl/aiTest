'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import type { Waybill, WaybillQuery } from '@/lib/waybill-types';
import Tooltip from './Tooltip';
import ConfirmDialog from './ConfirmDialog'
import Icon from './Icon';

// ============ SVG 图标 ============
// Icon 已提取到 ./Icon.tsx

// ============ 状态映射 ============
const STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  submitted: { label: '已提交', color: '#1677FF', bg: '#e6f4ff' },
  approved: { label: '已审核', color: '#52c41a', bg: '#f6ffed' },
  rejected: { label: '已驳回', color: '#ff4d4f', bg: '#fff2f0' },
};

const TEMP_LAYER_MAP: Record<string, string> = {
  常温: 'rgba(0,190,190,0.1)',
  冷藏: '#e6f7ff',
  冷冻: '#f0f5ff',
};

// ============ 主组件 ============
interface WaybillTableProps {
  currentUserNickname?: string;
  onMessage?: (text: string, type: 'success' | 'error') => void;
}

export default function WaybillTable({ currentUserNickname = '系统', onMessage }: WaybillTableProps) {
  // 数据状态
  const [data, setData] = useState<Waybill[]>([]);
  const [selectedRows, setSelectedRows] = useState<Waybill[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // 确认删除弹窗
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState<{ type: 'delete' | 'batchDelete'; count?: number; item?: Waybill }>({ type: 'delete' });
  const openConfirm = (type: 'delete' | 'batchDelete', count?: number, item?: Waybill) => {
    setConfirmTarget({ type, count, item });
    setConfirmVisible(true);
  };

  // 显示消息
  const showMsg = (text: string, type: 'success' | 'error') => {
    setMsg({ text, type });
    onMessage?.(text, type);
    setTimeout(() => setMsg(null), 3000);
  };

  // 分页
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const pageRef = useRef(page);

  // 同步更新 page state 和 ref
  const updatePage = (updater: number | ((prev: number) => number)) => {
    if (typeof updater === 'function') {
      setPage(prev => { pageRef.current = updater(prev); return pageRef.current; });
    } else {
      pageRef.current = updater;
      setPage(updater);
    }
  };

  // 查询表单
  const [query, setQuery] = useState<WaybillQuery>({
    external_code: '',
    sender_name: '',
    sender_phone: '',
    receiver_name: '',
    receiver_phone: '',
    start_date: '',
    end_date: '',
  });
  const queryRef = useRef<WaybillQuery>(query);

  const updateQuery = (updater: WaybillQuery | ((prev: WaybillQuery) => WaybillQuery)) => {
    if (typeof updater === 'function') {
      setQuery(prev => { queryRef.current = updater(prev); return queryRef.current; });
    } else {
      queryRef.current = updater;
      setQuery(updater);
    }
    updatePage(1);
  };

  // 格式化时间
  const formatDateTime = (dt: string | Date) => {
    if (!dt) return '-';
    const d = new Date(dt);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  };

  // 获取数据
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (queryRef.current.external_code) params.set('external_code', queryRef.current.external_code);
      if (queryRef.current.sender_name) params.set('sender_name', queryRef.current.sender_name);
      if (queryRef.current.sender_phone) params.set('sender_phone', queryRef.current.sender_phone);
      if (queryRef.current.receiver_name) params.set('receiver_name', queryRef.current.receiver_name);
      if (queryRef.current.receiver_phone) params.set('receiver_phone', queryRef.current.receiver_phone);
      if (queryRef.current.start_date) params.set('start_date', queryRef.current.start_date);
      if (queryRef.current.end_date) params.set('end_date', queryRef.current.end_date);
      params.set('page', String(pageRef.current));
      params.set('pageSize', String(pageSize));

      const res = await fetch(`/api/waybills?${params}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '获取数据失败');
      setData(json.data || []);
      setTotal(json.total || 0);
    } catch (e: unknown) {
      showMsg(e instanceof Error ? e.message : '获取数据失败', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // 全选 / 取消全选
  const handleSelectAll = (checked: boolean) => {
    setSelectedRows(checked ? [...data] : []);
  };

  const handleSelectRow = (row: Waybill, checked: boolean) => {
    setSelectedRows(prev => checked ? [...prev, row] : prev.filter(r => r.id !== row.id));
  };

  // 删除单条
  const handleDelete = async () => {
    if (!confirmTarget.item) return;
    try {
      const res = await fetch('/api/waybills', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [confirmTarget.item.id] }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '删除失败');
      showMsg('删除成功', 'success');
      setConfirmVisible(false);
      fetchData();
      setSelectedRows(prev => prev.filter(r => r.id !== confirmTarget.item!.id));
    } catch (e: unknown) {
      showMsg(e instanceof Error ? e.message : '删除失败', 'error');
    }
  };

  // 批量删除
  const handleBatchDelete = async () => {
    if (selectedRows.length === 0) return;
    try {
      const ids = selectedRows.map(r => r.id);
      const res = await fetch('/api/waybills', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '删除失败');
      showMsg(`删除成功 ${json.deletedCount} 条`, 'success');
      setConfirmVisible(false);
      setSelectedRows([]);
      fetchData();
    } catch (e: unknown) {
      showMsg(e instanceof Error ? e.message : '删除失败', 'error');
    }
  };

  // 确认处理
  const handleConfirm = () => {
    if (confirmTarget.type === 'delete') handleDelete();
    else if (confirmTarget.type === 'batchDelete') handleBatchDelete();
  };

  // 导出
  const handleExport = () => {
    setMsg({ text: '正在导出...', type: 'success' });
    onMessage?.('正在导出...', 'success');
    window.open('/api/waybills/export', '_blank');
    setTimeout(() => setMsg(null), 2000);
  };

  // 重置查询
  const handleReset = () => {
    updateQuery({
      external_code: '', sender_name: '', sender_phone: '',
      receiver_name: '', receiver_phone: '', start_date: '', end_date: '',
    });
    fetchData();
  };

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      {/* 消息提示 */}
      {msg && (
        <div style={{
          position: 'fixed', top: 20, right: 24, zIndex: 9999,
          padding: '10px 16px', borderRadius: 6, fontSize: 13,
          background: msg.type === 'success' ? '#f6ffed' : '#fff2f0',
          color: msg.type === 'success' ? '#52c41a' : '#ff4d4f',
          border: `1px solid ${msg.type === 'success' ? '#b7eb8f' : '#ffccc7'}`,
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
          transition: 'opacity 0.3s',
        }}>
          {msg.text}
        </div>
      )}

      {/* 查询区域 */}
      <div style={{ background: '#fff', borderRadius: 4, border: '1px solid #e4edf7', marginBottom: 12, padding: '16px 20px', flexShrink: 0 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
          {[
            { label: '外部编码', key: 'external_code', placeholder: '外部编码' },
            { label: '发件人姓名', key: 'sender_name', placeholder: '发件人姓名' },
            { label: '发件人电话', key: 'sender_phone', placeholder: '发件人电话' },
            { label: '收件人姓名', key: 'receiver_name', placeholder: '收件人姓名' },
            { label: '收件人电话', key: 'receiver_phone', placeholder: '收件人电话' },
          ].map(field => (
            <div key={field.key} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <label style={{ fontSize: 13, color: '#595959', whiteSpace: 'nowrap' }}>{field.label}：</label>
              <input
                value={query[field.key as keyof WaybillQuery] as string}
                onChange={e => updateQuery(prev => ({ ...prev, [field.key]: e.target.value }))}
                placeholder={field.placeholder}
                style={{ height: 30, padding: '0 10px', borderRadius: 4, border: '1px solid #d9d9d9', fontSize: 13, outline: 'none', width: 130, fontFamily: 'inherit', boxSizing: 'border-box', transition: 'border-color 0.15s' }}
                onFocus={e => (e.target.style.borderColor = '#00BEBE')}
                onBlur={e => (e.target.style.borderColor = '#d9d9d9')}
              />
            </div>
          ))}
          {/* 日期范围 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <label style={{ fontSize: 13, color: '#595959', whiteSpace: 'nowrap' }}>创建日期：</label>
            <input
              type="date"
              value={query.start_date || ''}
              onChange={e => updateQuery(prev => ({ ...prev, start_date: e.target.value }))}
              style={{ height: 30, padding: '0 8px', borderRadius: 4, border: '1px solid #d9d9d9', fontSize: 13, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', color: '#262626' }}
              onFocus={e => (e.target.style.borderColor = '#00BEBE')}
              onBlur={e => (e.target.style.borderColor = '#d9d9d9')}
            />
            <span style={{ color: '#8c8c8c', fontSize: 13 }}>至</span>
            <input
              type="date"
              value={query.end_date || ''}
              onChange={e => updateQuery(prev => ({ ...prev, end_date: e.target.value }))}
              style={{ height: 30, padding: '0 8px', borderRadius: 4, border: '1px solid #d9d9d9', fontSize: 13, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', color: '#262626' }}
              onFocus={e => (e.target.style.borderColor = '#00BEBE')}
              onBlur={e => (e.target.style.borderColor = '#d9d9d9')}
            />
          </div>
          {/* 按钮组 */}
          <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
            <button onClick={() => fetchData()} style={{ height: 30, padding: '0 16px', borderRadius: 4, border: 'none', background: '#00BEBE', color: '#fff', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4, fontWeight: 500 }}
              onMouseEnter={e => (e.currentTarget.style.background = '#00d4d4')}
              onMouseLeave={e => (e.currentTarget.style.background = '#00BEBE')}>
              <Icon name="search" size={12} /> 查询
            </button>
            <button onClick={handleReset} style={{ height: 30, padding: '0 16px', borderRadius: 4, border: '1px solid #d9d9d9', background: '#fff', color: '#595959', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#00BEBE'; (e.currentTarget as HTMLButtonElement).style.color = '#00BEBE'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#d9d9d9'; (e.currentTarget as HTMLButtonElement).style.color = '#595959'; }}>
              重置
            </button>
          </div>
        </div>
      </div>

      {/* 工具栏 */}
      <div style={{ background: '#fff', borderRadius: 4, border: '1px solid #e4edf7', padding: '10px 16px', marginBottom: 12, flexShrink: 0, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', width: '100%', boxSizing: 'border-box' }}>
        {selectedRows.length > 0 && (
          <button onClick={() => openConfirm('batchDelete', selectedRows.length)}
            style={{ height: 30, padding: '0 14px', borderRadius: 4, border: '1px solid #FF4D4F', background: '#fff', color: '#FF4D4F', fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'inherit' }}>
            <Icon name="delete" size={12} /> 删除({selectedRows.length})
          </button>
        )}
        <button onClick={handleExport}
          style={{ height: 30, padding: '0 14px', borderRadius: 4, border: '1px solid #d9d9d9', background: '#fff', color: '#595959', fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'inherit' }}>
          <Icon name="download" size={12} /> 导出
        </button>
        <div style={{ fontSize: 13, color: '#8c8c8c', marginLeft: 'auto' }}>
          {selectedRows.length > 0 && <span>已选择 {selectedRows.length} 项</span>}
        </div>
      </div>

      {/* 表格 */}
      <div style={{ background: '#fff', borderRadius: 4, border: '1px solid #e4edf7', flex: 1, overflow: 'hidden', minHeight: 0 }}>
        <div style={{ height: '100%', overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 1200 }}>
          <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
            <tr style={{ background: '#EFF5FF' }}>
              <th style={{ padding: '10px 8px', borderBottom: '1px solid #E8EAED', textAlign: 'center', width: 44 }}>
                <input type="checkbox" checked={data.length > 0 && selectedRows.length === data.length}
                  onChange={e => handleSelectAll(e.target.checked)} style={{ cursor: 'pointer', accentColor: '#1677FF' }} />
              </th>
              <th style={{ padding: '10px 8px', borderBottom: '1px solid #E8EAED', textAlign: 'center', color: '#000', fontWeight: 600, width: 56 }}>序号</th>
              <th style={{ padding: '10px 8px', borderBottom: '1px solid #E8EAED', textAlign: 'left', color: '#000', fontWeight: 600, width: 160 }}>外部编码</th>
              <th style={{ padding: '10px 8px', borderBottom: '1px solid #E8EAED', textAlign: 'left', color: '#000', fontWeight: 600, width: 90 }}>发件人</th>
              <th style={{ padding: '10px 8px', borderBottom: '1px solid #E8EAED', textAlign: 'left', color: '#000', fontWeight: 600, width: 120 }}>发件人电话</th>
              <th style={{ padding: '10px 8px', borderBottom: '1px solid #E8EAED', textAlign: 'left', color: '#000', fontWeight: 600, minWidth: 240 }}>发件人地址</th>
              <th style={{ padding: '10px 8px', borderBottom: '1px solid #E8EAED', textAlign: 'left', color: '#000', fontWeight: 600, width: 90 }}>收件人</th>
              <th style={{ padding: '10px 8px', borderBottom: '1px solid #E8EAED', textAlign: 'left', color: '#000', fontWeight: 600, width: 120 }}>收件人电话</th>
              <th style={{ padding: '10px 8px', borderBottom: '1px solid #E8EAED', textAlign: 'left', color: '#000', fontWeight: 600, minWidth: 240 }}>收件人地址</th>
              <th style={{ padding: '10px 8px', borderBottom: '1px solid #E8EAED', textAlign: 'center', color: '#000', fontWeight: 600, width: 70 }}>重量(kg)</th>
              <th style={{ padding: '10px 8px', borderBottom: '1px solid #E8EAED', textAlign: 'center', color: '#000', fontWeight: 600, width: 60 }}>件数</th>
              <th style={{ padding: '10px 8px', borderBottom: '1px solid #E8EAED', textAlign: 'center', color: '#000', fontWeight: 600, width: 70 }}>温层</th>
              <th style={{ padding: '10px 8px', borderBottom: '1px solid #E8EAED', textAlign: 'center', color: '#000', fontWeight: 600, width: 80 }}>状态</th>
              <th style={{ padding: '10px 8px', borderBottom: '1px solid #E8EAED', textAlign: 'left', color: '#000', fontWeight: 600, minWidth: 160 }}>备注</th>
              <th style={{ padding: '10px 8px', borderBottom: '1px solid #E8EAED', textAlign: 'center', color: '#000', fontWeight: 600, width: 150 }}>创建时间</th>
              <th style={{ padding: '10px 8px', borderBottom: '1px solid #E8EAED', textAlign: 'center', color: '#000', fontWeight: 600, width: 80 }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={16} style={{ padding: 48, textAlign: 'center', color: '#bfbfbf', fontSize: 14 }}>加载中...</td></tr>
            ) : data.length === 0 ? (
              <tr><td colSpan={16} style={{ padding: 48, textAlign: 'center', color: '#bfbfbf', fontSize: 14 }}>暂无数据</td></tr>
            ) : data.map((row, index) => {
              const statusInfo = STATUS_MAP[row.status] || { label: row.status, color: '#8c8c8c', bg: '#f5f5f5' };
              const isEven = index % 2 === 1;
              const isSelected = selectedRows.some(r => r.id === row.id);
              return (
                <tr key={row.id}
                  style={{ background: isSelected ? '#e6f4ff' : isEven ? '#F5F7FA' : '#FFF', cursor: 'pointer', transition: 'background 0.12s' }}
                  onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLTableRowElement).style.background = '#ECF5FF'; }}
                  onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLTableRowElement).style.background = isEven ? '#F5F7FA' : '#FFF'; }}>
                  <td style={{ padding: '10px 8px', borderBottom: '1px solid #E8EAED', textAlign: 'center' }}>
                    <input type="checkbox" checked={isSelected}
                      onChange={e => handleSelectRow(row, e.target.checked)} style={{ cursor: 'pointer', accentColor: '#1677FF' }} />
                  </td>
                  <td style={{ padding: '10px 8px', borderBottom: '1px solid #E8EAED', textAlign: 'center', color: 'rgba(0,0,0,0.45)', fontSize: 12 }}>{index + 1 + (pageRef.current - 1) * pageSize}</td>
                  <td style={{ padding: '10px 8px', borderBottom: '1px solid #E8EAED', textAlign: 'left', fontWeight: 500, color: '#1677FF' }}>
                    <Tooltip content={row.external_code}>{row.external_code || '-'}</Tooltip>
                  </td>
                  <td style={{ padding: '10px 8px', borderBottom: '1px solid #E8EAED', textAlign: 'left', color: 'rgba(0,0,0,0.75)' }}>
                    <Tooltip content={row.sender_name}>{row.sender_name}</Tooltip>
                  </td>
                  <td style={{ padding: '10px 8px', borderBottom: '1px solid #E8EAED', textAlign: 'left', color: 'rgba(0,0,0,0.65)' }}>
                    <Tooltip content={row.sender_phone}>{row.sender_phone}</Tooltip>
                  </td>
                  <td style={{ padding: '10px 8px', borderBottom: '1px solid #E8EAED', textAlign: 'left', color: 'rgba(0,0,0,0.65)' }}>
                    <Tooltip content={row.sender_address}><span style={{ maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>{row.sender_address}</span></Tooltip>
                  </td>
                  <td style={{ padding: '10px 8px', borderBottom: '1px solid #E8EAED', textAlign: 'left', color: 'rgba(0,0,0,0.75)' }}>
                    <Tooltip content={row.receiver_name}>{row.receiver_name}</Tooltip>
                  </td>
                  <td style={{ padding: '10px 8px', borderBottom: '1px solid #E8EAED', textAlign: 'left', color: 'rgba(0,0,0,0.65)' }}>
                    <Tooltip content={row.receiver_phone}>{row.receiver_phone}</Tooltip>
                  </td>
                  <td style={{ padding: '10px 8px', borderBottom: '1px solid #E8EAED', textAlign: 'left', color: 'rgba(0,0,0,0.65)' }}>
                    <Tooltip content={row.receiver_address}><span style={{ maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>{row.receiver_address}</span></Tooltip>
                  </td>
                  <td style={{ padding: '10px 8px', borderBottom: '1px solid #E8EAED', textAlign: 'center', color: 'rgba(0,0,0,0.75)' }}>{row.weight}</td>
                  <td style={{ padding: '10px 8px', borderBottom: '1px solid #E8EAED', textAlign: 'center', color: 'rgba(0,0,0,0.75)' }}>{row.quantity}</td>
                  <td style={{ padding: '10px 8px', borderBottom: '1px solid #E8EAED', textAlign: 'center' }}>
                    <span style={{ padding: '1px 6px', borderRadius: 3, fontSize: 12, background: TEMP_LAYER_MAP[row.temp_layer] || '#f5f5f5', color: '#595959' }}>
                      {row.temp_layer}
                    </span>
                  </td>
                  <td style={{ padding: '10px 8px', borderBottom: '1px solid #E8EAED', textAlign: 'center' }}>
                    <span style={{ padding: '1px 8px', borderRadius: 3, fontSize: 12, background: statusInfo.bg, color: statusInfo.color, fontWeight: 500 }}>
                      {statusInfo.label}
                    </span>
                  </td>
                  <td style={{ padding: '10px 8px', borderBottom: '1px solid #E8EAED', textAlign: 'left', color: row.remark ? 'rgba(0,0,0,0.65)' : '#c0c0c0' }}>
                    <Tooltip content={row.remark || ''}>{row.remark || '-'}</Tooltip>
                  </td>
                  <td style={{ padding: '10px 8px', borderBottom: '1px solid #E8EAED', textAlign: 'center', color: 'rgba(0,0,0,0.45)', fontSize: 12 }}>{formatDateTime(row.created_at)}</td>
                  <td style={{ padding: '10px 8px', borderBottom: '1px solid #E8EAED', textAlign: 'center', whiteSpace: 'nowrap' }}>
                    <button onClick={() => openConfirm('delete', undefined, row)}
                      style={{ border: 'none', background: 'none', color: '#FF4D4F', cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 2, fontFamily: 'inherit', padding: '2px 6px', transition: 'color 0.15s', borderRadius: 3 }}
                      onMouseEnter={e => (e.currentTarget.style.color = '#FF1F1F')}
                      onMouseLeave={e => (e.currentTarget.style.color = '#FF4D4F')}>
                      <Icon name="delete" size={12} />删除
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 分页 */}
      <div style={{ background: '#fff', borderRadius: 4, border: '1px solid #e4edf7', padding: '10px 16px', marginTop: 12, flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontSize: 13, color: '#595959' }}>
          共 <span style={{ color: '#00BEBE', fontWeight: 600 }}>{total}</span> 条
          {selectedRows.length > 0 && <span style={{ color: '#1677FF', marginLeft: 12 }}>已选 {selectedRows.length} 项</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); updatePage(1); }}
            style={{ height: 28, padding: '0 8px', borderRadius: 4, border: '1px solid #d9d9d9', fontSize: 13, fontFamily: 'inherit', color: '#262626', cursor: 'pointer', outline: 'none' }}>
            {[10, 20, 50, 100].map(s => <option key={s} value={s}>{s}条/页</option>)}
          </select>
          <button onClick={() => updatePage(p => Math.max(1, p - 1))} disabled={page <= 1}
            style={{ height: 28, padding: '0 10px', borderRadius: 4, border: '1px solid #d9d9d9', background: page <= 1 ? '#f5f5f5' : '#fff', color: page <= 1 ? '#d9d9d9' : '#595959', fontSize: 13, cursor: page <= 1 ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
            上一页
          </button>
          <span style={{ fontSize: 13, color: '#595959', minWidth: 80, textAlign: 'center' }}>
            第 <span style={{ color: '#00BEBE', fontWeight: 600 }}>{page}</span> / {totalPages || 1} 页
          </span>
          <button onClick={() => updatePage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
            style={{ height: 28, padding: '0 10px', borderRadius: 4, border: '1px solid #d9d9d9', background: page >= totalPages ? '#f5f5f5' : '#fff', color: page >= totalPages ? '#d9d9d9' : '#595959', fontSize: 13, cursor: page >= totalPages ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
            下一页
          </button>
          <span style={{ fontSize: 13, color: '#8c8c8c' }}>跳至</span>
          <input type="number" value={page} onChange={e => { const v = parseInt(e.target.value); if (!isNaN(v)) updatePage(Math.min(totalPages, Math.max(1, v))); }}
            style={{ width: 52, height: 28, padding: '0 8px', borderRadius: 4, border: '1px solid #d9d9d9', fontSize: 13, textAlign: 'center', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
          <span style={{ fontSize: 13, color: '#8c8c8c' }}>页</span>
          <button onClick={() => fetchData()} style={{ height: 28, padding: '0 12px', borderRadius: 4, border: '1px solid #00BEBE', background: '#00BEBE', color: '#fff', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}
            onMouseEnter={e => (e.currentTarget.style.background = '#00d4d4')}
            onMouseLeave={e => (e.currentTarget.style.background = '#00BEBE')}>跳转</button>
        </div>
        </div>
      </div>

      {/* 确认弹窗 */}
      <ConfirmDialog
        visible={confirmVisible}
        title={confirmTarget.type === 'batchDelete' ? '批量删除' : '删除确认'}
        message={
          confirmTarget.type === 'batchDelete'
            ? `确定删除选中的 ${confirmTarget.count} 条运单数据吗？删除后不可恢复！`
            : `确定删除运单「${confirmTarget.item?.external_code || confirmTarget.item?.id}」吗？删除后不可恢复！`
        }
        confirmText="删除"
        cancelText="取消"
        confirmType="danger"
        onConfirm={handleConfirm}
        onCancel={() => setConfirmVisible(false)}
      />
    </div>
  );
}
