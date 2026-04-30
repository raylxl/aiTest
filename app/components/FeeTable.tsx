'use client';

import React, { useMemo } from 'react';
import type { FeeItem, QueryForm } from './types';

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

const domainColor: Record<string, string> = {
  '运配': '#1663c4', '仓储': '#52c41a', '干线': '#fa8c16', '配送': '#f5222d'
};

function IconCat({ name, size = 14 }: { name: string; size?: number }) {
  const paths: Record<string, string> = {
    refresh: 'M724 218.3V141c0-6.7-7.7-10.4-12.9-6.3L260.3 486.8a31.75 31.75 0 0 0 50.3l450.8 352.1c5.3 3.1 12.9.4 12.9-6.3v-77.3a304 304 0 0 1 273-298.2c91.3-12.5 160 60.4 160 144 0 54.7-29.1 99.5-72.1 126.6-6.4 4-8.5 12.2-4.5 18.1l66.8 92.8c4 5.5 12 6.9 17.8 3.1a144 144 0 0 0 96.1-134.4c3.7-54.4-27.3-105.4-71.4-126C771.5 251.5 748 218.3 724 218.3z',
    delete: 'M864 256H736v-64c0-35.2-28.8-64-64-64H352c-35.2 0-64 28.8-64 64v64H160c-44.2 0-80 35.8-80 80v32c0 17.7 14.3 32 32 32h640c17.7 0 32-14.3 32-32v-32c0-44.2-35.8-80-80-80zm-96-64V64c0-17.7 14.3-32 32-32h320c17.7 0 32 14.3 32 32v128c0 17.7-14.3 32-32 32H800c-17.7 0-32-14.3-32-32z',
    edit: 'M721.7 199.5l-493.2 493.2a32 32 0 0 1-15.7 8.5H192c-17.7 0-32-14.3-32-32v-32c0-5.8 2.1-11.4 6.1-15.7L494.7 58.3c10.6-10.6 25.6-16 40-16h281c15.5 0 30.1 5.4 40 16h1l38.3 38.3a32 32 0 0 1 8.5 15.7v281c0 14.4-5.4 29.4-16 40L721.7 199.5zM688 136.1l-43.6-43.6L592 144l43.6 43.6L688 136.1z',
    plus: 'M480-64v448h-64v64h448v-64h-64V-64h-64v448H544v-64H480z',
    close: 'M810 274l-238 238 238 238L608 810 370 572l238-238-238-238L274 240l238-238L370-2 608 236l238-238z',
    search: 'M772.188 672.172L579.558 479.586C605.586 442.688 620 398.766 620 352c0-141.16-114.84-256-256-256S108 210.84 108 352s114.84 256 256 256c46.766 0 90.688-14.414 127.586-40.442L672.172 772.188a16 16 0 0 0 22.628 0l77.388-77.388a16 16 0 0 0 0-22.628zM364 352c0-79.4 64.6-144 144-144s144 64.6 144 144-64.6 144-144 144-144-64.6-144-144z',
    right: 'M384 160l320 352-320 352z',
    info: 'M448 768a64 64 0 1 0 128 0 64 64 0 0 0-128 0zm0-224a64 64 0 1 0 0-128 64 64 0 0 0 0 128zM512-64h256v64H512v-64z',
  };
  return (
    <svg width={size} height={size} viewBox="0 0 1024 1024" style={{ display: 'inline-block', flexShrink: 0 }}>
      <path fill="currentColor" d={paths[name] || ''} />
    </svg>
  );
}

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

  const handleReset = () => { setQuery({ feeCode: '', feeName: '', businessDomain: '', priceType: '' }); setPage(1); };

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
    if (!confirm(`确定删除「${row.feeName}」吗？`)) return;
    fetch(`/api/fees/${row.id}`, { method: 'DELETE' }).then(res => {
      if (res.ok) { showMsg('删除成功', 'success'); fetchData(); }
      else showMsg('删除失败', 'error');
    });
  };

  const handleBatchDelete = () => {
    if (selectedRows.length === 0) { showMsg('请先选择数据', 'warning'); return; }
    if (!confirm(`确定删除选中的 ${selectedRows.length} 条数据吗？`)) return;
    Promise.all(selectedRows.map(r => fetch(`/api/fees/${r.id}`, { method: 'DELETE' }))).then(() => {
      showMsg(`成功删除 ${selectedRows.length} 条数据`, 'success');
      setSelectedRows([]); fetchData();
    });
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
      {/* 标题栏 */}
      <div style={{ padding: '14px 16px 12px', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#262626', marginBottom: 2 }}>费用类型维护</div>
          <div style={{ fontSize: 12, color: '#8c8c8c' }}>管理系统中的费用类型配置，支持新增、编辑、删除及批量操作</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <button onClick={fetchData} style={{ height: 30, padding: '0 14px', border: '1px solid #d9d9d9', borderRadius: 4, background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, color: '#595959', transition: 'all 0.15s', fontFamily: 'inherit' }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#1663c4'; (e.currentTarget as HTMLButtonElement).style.color = '#1663c4'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#d9d9d9'; (e.currentTarget as HTMLButtonElement).style.color = '#595959'; }}>
            <IconCat name="refresh" size={13} /><span>刷新</span>
          </button>
          <button onClick={handleBatchDelete} disabled={selectedRows.length === 0} style={{
            height: 30, padding: '0 14px', border: `1px solid ${selectedRows.length > 0 ? '#ff4d4f' : '#d9d9d9'}`,
            borderRadius: 4, background: selectedRows.length > 0 ? '#ff4d4f' : '#fff',
            color: selectedRows.length > 0 ? '#fff' : '#d0d0d0', cursor: selectedRows.length > 0 ? 'pointer' : 'not-allowed',
            display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, fontFamily: 'inherit', transition: 'all 0.15s',
          }}>
            <IconCat name="delete" size={13} /><span>批量删除{selectedRows.length > 0 ? ` (${selectedRows.length})` : ''}</span>
          </button>
          <button onClick={openAdd} style={{ height: 30, padding: '0 14px', border: 'none', borderRadius: 4, background: '#1663c4', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, fontWeight: 500, fontFamily: 'inherit', transition: 'all 0.15s', boxShadow: '0 2px 0 rgba(22,99,196,0.1)' }}
            onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = '#3880d0'}
            onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = '#1663c4'}>
            <IconCat name="plus" size={13} /><span>新增</span>
          </button>
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
      <div style={{ padding: '12px 16px', background: '#fafafa', borderBottom: '1px solid #f0f0f0', display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap', flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 4 }}>费用编号</div>
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: '#bfbfbf', pointerEvents: 'none' }}><IconCat name="search" size={13} /></span>
            <input value={query.feeCode} onChange={e => { setQuery(q => ({ ...q, feeCode: e.target.value })); setPage(1); }} placeholder="模糊匹配"
              style={{ width: 140, height: 30, padding: '0 8px 0 28px', border: '1px solid #d9d9d9', borderRadius: 4, fontSize: 13, outline: 'none', color: '#595959', background: '#fff', fontFamily: 'inherit', transition: 'border-color 0.15s', boxSizing: 'border-box' }}
              onFocus={e => (e.target.style.borderColor = '#1663c4')}
              onBlur={e => (e.target.style.borderColor = '#d9d9d9')} />
          </div>
        </div>
        <div>
          <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 4 }}>费用名称</div>
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: '#bfbfbf', pointerEvents: 'none' }}><IconCat name="search" size={13} /></span>
            <input value={query.feeName} onChange={e => { setQuery(q => ({ ...q, feeName: e.target.value })); setPage(1); }} placeholder="模糊匹配"
              style={{ width: 140, height: 30, padding: '0 8px 0 28px', border: '1px solid #d9d9d9', borderRadius: 4, fontSize: 13, outline: 'none', color: '#595959', background: '#fff', fontFamily: 'inherit', transition: 'border-color 0.15s', boxSizing: 'border-box' }}
              onFocus={e => (e.target.style.borderColor = '#1663c4')}
              onBlur={e => (e.target.style.borderColor = '#d9d9d9')} />
          </div>
        </div>
        <div>
          <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 4 }}>所属业务域</div>
          <select value={query.businessDomain} onChange={e => { setQuery(q => ({ ...q, businessDomain: e.target.value })); setPage(1); }}
            style={{ height: 30, padding: '0 24px 0 10px', border: '1px solid #d9d9d9', borderRadius: 4, fontSize: 13, outline: 'none', color: '#595959', background: '#fff', fontFamily: 'inherit', cursor: 'pointer', appearance: 'none', backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1024 1024'%3E%3Cpath fill='%23bfbfbf' d='M192 320l320 320 320-320z'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center', backgroundSize: 9, transition: 'border-color 0.15s', boxSizing: 'border-box' }}
            onFocus={e => (e.target.style.borderColor = '#1663c4')}
            onBlur={e => (e.target.style.borderColor = '#d9d9d9')}>
            <option value="">全部</option>
            {BUSINESS_DOMAINS.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <div>
          <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 4 }}>所属报价</div>
          <select value={query.priceType} onChange={e => { setQuery(q => ({ ...q, priceType: e.target.value })); setPage(1); }}
            style={{ height: 30, padding: '0 24px 0 10px', border: '1px solid #d9d9d9', borderRadius: 4, fontSize: 13, outline: 'none', color: '#595959', background: '#fff', fontFamily: 'inherit', cursor: 'pointer', appearance: 'none', backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1024 1024'%3E%3Cpath fill='%23bfbfbf' d='M192 320l320 320 320-320z'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center', backgroundSize: 9, transition: 'border-color 0.15s', boxSizing: 'border-box' }}
            onFocus={e => (e.target.style.borderColor = '#1663c4')}
            onBlur={e => (e.target.style.borderColor = '#d9d9d9')}>
            <option value="">全部</option>
            {PRICE_TYPES.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setPage(1)} style={{ height: 30, padding: '0 14px', border: 'none', borderRadius: 4, background: '#1663c4', color: '#fff', cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'inherit', transition: 'background 0.15s' }}
            onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = '#3880d0'}
            onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = '#1663c4'}>
            <IconCat name="search" size={13} /><span>查询</span>
          </button>
          <button onClick={handleReset} style={{ height: 30, padding: '0 14px', border: '1px solid #d9d9d9', borderRadius: 4, background: '#fff', cursor: 'pointer', fontSize: 13, color: '#595959', display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'inherit', transition: 'all 0.15s' }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#1663c4'; (e.currentTarget as HTMLButtonElement).style.color = '#1663c4'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#d9d9d9'; (e.currentTarget as HTMLButtonElement).style.color = '#595959'; }}>
            <IconCat name="refresh" size={13} /><span>重置</span>
          </button>
        </div>
      </div>

      {/* 已选提示 */}
      {selectedRows.length > 0 && (
        <div style={{ margin: '10px 16px 0', padding: '8px 12px', background: '#e6f4ff', borderRadius: 4, display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#1663c4', flexShrink: 0 }}>
          <IconCat name="info" size={13} />
          <span>已选择 <strong>{selectedRows.length}</strong> 项</span>
          <button onClick={() => setSelectedRows([])} style={{ background: 'none', border: 'none', color: '#1663c4', cursor: 'pointer', fontSize: 13, textDecoration: 'underline', padding: 0, fontFamily: 'inherit' }}>清空选择</button>
        </div>
      )}

      {/* 表格 */}
      <div style={{ overflowX: 'auto', flex: 1, minHeight: 0 }}>
        {fetchError ? (
          <div style={{ padding: '48px 24px', textAlign: 'center' }}>
            <div style={{ fontSize: 15, color: '#ff4d4f', marginBottom: 8 }}>数据加载失败</div>
            <div style={{ fontSize: 13, color: '#8c8c8c', marginBottom: 16 }}>{fetchError}</div>
            <button onClick={fetchData} style={{ padding: '6px 20px', border: 'none', borderRadius: 4, background: '#1663c4', color: '#fff', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' }}>重试</button>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 1100 }}>
            <thead>
              <tr style={{ background: '#fafafa' }}>
                <th style={{ padding: '10px 8px', borderBottom: '1px solid #f0f0f0', textAlign: 'center', width: 48 }}><input type="checkbox" checked={paginatedData.length > 0 && selectedRows.length === paginatedData.length} onChange={handleSelectAll} style={{ width: 15, height: 15, accentColor: '#1663c4', cursor: 'pointer' }} /></th>
                <th style={{ padding: '10px 8px', borderBottom: '1px solid #f0f0f0', textAlign: 'center', color: '#595959', fontWeight: 600, width: 56 }}>序号</th>
                <th style={{ padding: '10px 8px', borderBottom: '1px solid #f0f0f0', textAlign: 'left', color: '#595959', fontWeight: 600, width: 110 }}>费用编号</th>
                <th style={{ padding: '10px 8px', borderBottom: '1px solid #f0f0f0', textAlign: 'left', color: '#595959', fontWeight: 600, width: 140 }}>费用名称</th>
                <th style={{ padding: '10px 8px', borderBottom: '1px solid #f0f0f0', textAlign: 'center', color: '#595959', fontWeight: 600, width: 100 }}>所属业务域</th>
                <th style={{ padding: '10px 8px', borderBottom: '1px solid #f0f0f0', textAlign: 'left', color: '#595959', fontWeight: 600, width: 240 }}>所属报价</th>
                <th style={{ padding: '10px 8px', borderBottom: '1px solid #f0f0f0', textAlign: 'left', color: '#595959', fontWeight: 600 }}>备注</th>
                <th style={{ padding: '10px 8px', borderBottom: '1px solid #f0f0f0', textAlign: 'center', color: '#595959', fontWeight: 600, width: 90 }}>创建人</th>
                <th style={{ padding: '10px 8px', borderBottom: '1px solid #f0f0f0', textAlign: 'center', color: '#595959', fontWeight: 600, width: 150 }}>创建时间</th>
                <th style={{ padding: '10px 8px', borderBottom: '1px solid #f0f0f0', textAlign: 'center', color: '#595959', fontWeight: 600, width: 90 }}>修改人</th>
                <th style={{ padding: '10px 8px', borderBottom: '1px solid #f0f0f0', textAlign: 'center', color: '#595959', fontWeight: 600, width: 150 }}>修改时间</th>
                <th style={{ padding: '10px 8px', borderBottom: '1px solid #f0f0f0', textAlign: 'center', color: '#595959', fontWeight: 600, width: 120 }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {paginatedData.length === 0 ? (
                <tr><td colSpan={12} style={{ padding: '48px 0', textAlign: 'center', color: '#bfbfbf', fontSize: 14 }}>暂无数据</td></tr>
              ) : (
                paginatedData.map((row, idx) => (
                  <tr key={row.id} style={{ background: idx % 2 === 1 ? '#fafafa' : '#fff', cursor: 'pointer', transition: 'background 0.1s' }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#f5f5f5')}
                    onMouseLeave={e => (e.currentTarget.style.background = idx % 2 === 1 ? '#fafafa' : '#fff')}>
                    <td style={{ padding: '10px 8px', borderBottom: '1px solid #f0f0f0', textAlign: 'center' }}><input type="checkbox" checked={selectedRows.some(r => r.id === row.id)} onChange={e => handleSelectChange(e, row)} style={{ width: 15, height: 15, accentColor: '#1663c4', cursor: 'pointer' }} /></td>
                    <td style={{ padding: '10px 8px', borderBottom: '1px solid #f0f0f0', textAlign: 'center', color: '#8c8c8c' }}>{(page - 1) * pageSize + idx + 1}</td>
                    <td style={{ padding: '10px 8px', borderBottom: '1px solid #f0f0f0', textAlign: 'left' }}><code style={{ color: '#1663c4', fontFamily: 'monospace', fontSize: 12 }}>{row.feeCode}</code></td>
                    <td style={{ padding: '10px 8px', borderBottom: '1px solid #f0f0f0', textAlign: 'left', fontWeight: 500, color: '#262626' }}>{row.feeName}</td>
                    <td style={{ padding: '10px 8px', borderBottom: '1px solid #f0f0f0', textAlign: 'center' }}><span style={{ display: 'inline-block', padding: '1px 8px', borderRadius: 2, fontSize: 12, color: domainColor[row.businessDomain] || '#1663c4', background: (domainColor[row.businessDomain] || '#1663c4') + '1a' }}>{row.businessDomain}</span></td>
                    <td style={{ padding: '10px 8px', borderBottom: '1px solid #f0f0f0', textAlign: 'left' }}>
                      {row.priceTypes.length === 0 ? <span style={{ color: '#c0c0c0' }}>-</span> : (
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          {row.priceTypes.map(pt => <span key={pt} style={{ display: 'inline-block', padding: '1px 6px', borderRadius: 2, fontSize: 11, background: '#f5f5f5', color: '#595959' }}>{pt}</span>)}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '10px 8px', borderBottom: '1px solid #f0f0f0', textAlign: 'left', color: row.remark ? '#595959' : '#c0c0c0', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={row.remark}>{row.remark || '-'}</td>
                    <td style={{ padding: '10px 8px', borderBottom: '1px solid #f0f0f0', textAlign: 'center', color: '#595959' }}>{row.creator}</td>
                    <td style={{ padding: '10px 8px', borderBottom: '1px solid #f0f0f0', textAlign: 'center', color: '#8c8c8c', fontSize: 12 }}>{row.createTime}</td>
                    <td style={{ padding: '10px 8px', borderBottom: '1px solid #f0f0f0', textAlign: 'center', color: row.updater ? '#595959' : '#c0c0c0' }}>{row.updater || '-'}</td>
                    <td style={{ padding: '10px 8px', borderBottom: '1px solid #f0f0f0', textAlign: 'center', color: '#8c8c8c', fontSize: 12 }}>{row.updateTime || '-'}</td>
                    <td style={{ padding: '10px 8px', borderBottom: '1px solid #f0f0f0', textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                        <button onClick={() => openEdit(row)} style={{ border: 'none', background: 'none', color: '#1663c4', cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 2, fontFamily: 'inherit', padding: '2px 4px', transition: 'background 0.15s', borderRadius: 3 }}
                          onMouseEnter={e => (e.currentTarget.style.background = '#e6f4ff')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                          <IconCat name="edit" size={12} />编辑
                        </button>
                        <button onClick={() => handleDelete(row)} style={{ border: 'none', background: 'none', color: '#ff4d4f', cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 2, fontFamily: 'inherit', padding: '2px 4px', transition: 'background 0.15s', borderRadius: 3 }}
                          onMouseEnter={e => (e.currentTarget.style.background = '#fff1f0')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                          <IconCat name="delete" size={12} />删除
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* 分页 */}
      <div style={{ padding: '10px 16px', borderTop: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fafafa', flexShrink: 0, flexWrap: 'wrap', gap: 8 }}>
        <span style={{ fontSize: 13, color: '#8c8c8c' }}>共 <strong style={{ color: '#262626' }}>{filtered.length}</strong> 条{selectedRows.length > 0 && <>, 已选中 <strong style={{ color: '#1663c4' }}>{selectedRows.length}</strong> 项</>}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}
            style={{ height: 26, padding: '0 20px 0 8px', border: '1px solid #d9d9d9', borderRadius: 4, fontSize: 13, outline: 'none', background: '#fff', fontFamily: 'inherit', cursor: 'pointer', appearance: 'none', backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1024 1024'%3E%3Cpath fill='%23bfbfbf' d='M192 320l320 320 320-320z'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 6px center', backgroundSize: 8, boxSizing: 'border-box' }}>
            {[10, 20, 50, 100].map(s => <option key={s} value={s}>{s} 条/页</option>)}
          </select>
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} style={{ height: 26, width: 26, border: '1px solid #d9d9d9', borderRadius: 4, background: '#fff', cursor: page <= 1 ? 'not-allowed' : 'pointer', color: page <= 1 ? '#d9d9d9' : '#595959', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit', transition: 'all 0.15s', transform: 'rotate(180deg)' }}
            onMouseEnter={e => { if (page > 1) { (e.currentTarget as HTMLButtonElement).style.borderColor = '#1663c4'; (e.currentTarget as HTMLButtonElement).style.color = '#1663c4'; } }}
            onMouseLeave={e => { if (page > 1) { (e.currentTarget as HTMLButtonElement).style.borderColor = '#d9d9d9'; (e.currentTarget as HTMLButtonElement).style.color = '#595959'; } }}>
            <IconCat name="right" size={10} />
          </button>
          {Array.from({ length: Math.min(5, Math.max(1, Math.ceil(filtered.length / pageSize))) }, (_, i) => {
            const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
            const start = Math.max(1, Math.min(totalPages - 4, page - 2));
            const p = start + i;
            return p <= totalPages ? (
              <button key={p} onClick={() => setPage(p)} style={{
                height: 26, width: 26, border: `1px solid ${p === page ? '#1663c4' : '#d9d9d9'}`,
                borderRadius: 4, background: p === page ? '#1663c4' : '#fff',
                color: p === page ? '#fff' : '#595959', cursor: 'pointer',
                fontSize: 13, fontWeight: p === page ? 600 : 400, fontFamily: 'inherit', transition: 'all 0.15s',
              }}>{p}</button>
            ) : null;
          })}
          <button onClick={() => setPage(p => Math.min(Math.ceil(filtered.length / pageSize), p + 1))} disabled={page >= Math.ceil(filtered.length / pageSize)} style={{ height: 26, width: 26, border: '1px solid #d9d9d9', borderRadius: 4, background: '#fff', cursor: page >= Math.ceil(filtered.length / pageSize) ? 'not-allowed' : 'pointer', color: page >= Math.ceil(filtered.length / pageSize) ? '#d9d9d9' : '#595959', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit', transition: 'all 0.15s' }}
            onMouseEnter={e => { if (page < Math.ceil(filtered.length / pageSize)) { (e.currentTarget as HTMLButtonElement).style.borderColor = '#1663c4'; (e.currentTarget as HTMLButtonElement).style.color = '#1663c4'; } }}
            onMouseLeave={e => { if (page < Math.ceil(filtered.length / pageSize)) { (e.currentTarget as HTMLButtonElement).style.borderColor = '#d9d9d9'; (e.currentTarget as HTMLButtonElement).style.color = '#595959'; } }}>
            <IconCat name="right" size={10} />
          </button>
          <span style={{ fontSize: 13, color: '#8c8c8c' }}>跳至<input value={page} onChange={e => { const v = parseInt(e.target.value); if (!isNaN(v) && v >= 1 && v <= Math.ceil(filtered.length / pageSize)) setPage(v); }}
            style={{ width: 38, height: 26, margin: '0 4px', padding: '0 4px', border: '1px solid #d9d9d9', borderRadius: 4, textAlign: 'center', fontSize: 13, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />页</span>
        </div>
      </div>

      {/* 新增/编辑弹框 */}
      {dialogVisible && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', borderRadius: 4, width: 560, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 6px 16px rgba(0,0,0,0.15)', overflow: 'hidden' }}>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 600, color: '#262626' }}>
                <span style={{ color: '#1663c4', display: 'flex' }}>{editRow ? <IconCat name="edit" size={15} /> : <IconCat name="plus" size={15} />}</span>
                {dialogTitle}
              </div>
              <button onClick={() => setDialogVisible(false)} style={{ background: 'none', border: 'none', color: '#8c8c8c', fontSize: 18, cursor: 'pointer', lineHeight: 1, padding: '2px', borderRadius: 3, transition: 'all 0.15s' }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#595959'; (e.currentTarget as HTMLButtonElement).style.background = '#f5f5f5'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = '#8c8c8c'; (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}>
                <IconCat name="close" size={16} />
              </button>
            </div>
            <div style={{ padding: '16px 16px 0', overflow: 'auto', flex: 1 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 12px' }}>
                <div style={{ marginBottom: 14 }}>
                  <div style={{ marginBottom: 4, fontSize: 13, color: '#595959' }}>费用编号 <span style={{ color: '#ff4d4f' }}>*</span></div>
                  <input value={form.feeCode} onChange={e => setForm(f => ({ ...f, feeCode: e.target.value }))} disabled={!!editRow} placeholder="只允许输入数字，最多8位" maxLength={8}
                    style={{ width: '100%', height: 30, padding: '0 10px', borderRadius: 4, border: `1px solid ${errors.feeCode ? '#ff4d4f' : '#d9d9d9'}`, fontSize: 13, outline: 'none', background: editRow ? '#f5f5f5' : '#fff', color: editRow ? '#bfbfbf' : '#595959', fontFamily: 'inherit', transition: 'border-color 0.15s', boxSizing: 'border-box' }}
                    onFocus={e => { if (!editRow) e.target.style.borderColor = errors.feeCode ? '#ff4d4f' : '#1663c4'; }}
                    onBlur={e => { if (!editRow) e.target.style.borderColor = errors.feeCode ? '#ff4d4f' : '#d9d9d9'; }} />
                  {errors.feeCode && <div style={{ fontSize: 12, color: '#ff4d4f', marginTop: 4 }}>{errors.feeCode}</div>}
                </div>
                <div style={{ marginBottom: 14 }}>
                  <div style={{ marginBottom: 4, fontSize: 13, color: '#595959' }}>费用名称 <span style={{ color: '#ff4d4f' }}>*</span></div>
                  <input value={form.feeName} onChange={e => setForm(f => ({ ...f, feeName: e.target.value }))} placeholder="请输入费用名称" maxLength={32}
                    style={{ width: '100%', height: 30, padding: '0 10px', borderRadius: 4, border: `1px solid ${errors.feeName ? '#ff4d4f' : '#d9d9d9'}`, fontSize: 13, outline: 'none', color: '#595959', background: '#fff', fontFamily: 'inherit', transition: 'border-color 0.15s', boxSizing: 'border-box' }}
                    onFocus={e => (e.target.style.borderColor = errors.feeName ? '#ff4d4f' : '#1663c4')}
                    onBlur={e => (e.target.style.borderColor = errors.feeName ? '#ff4d4f' : '#d9d9d9')} />
                  {errors.feeName && <div style={{ fontSize: 12, color: '#ff4d4f', marginTop: 4 }}>{errors.feeName}</div>}
                </div>
              </div>
              <div style={{ marginBottom: 14 }}>
                <div style={{ marginBottom: 4, fontSize: 13, color: '#595959' }}>所属业务域 <span style={{ color: '#ff4d4f' }}>*</span></div>
                <select value={form.businessDomain} onChange={e => setForm(f => ({ ...f, businessDomain: e.target.value }))}
                  style={{ width: '100%', height: 30, padding: '0 10px', borderRadius: 4, border: `1px solid ${errors.businessDomain ? '#ff4d4f' : '#d9d9d9'}`, fontSize: 13, outline: 'none', color: '#595959', background: '#fff', fontFamily: 'inherit', cursor: 'pointer', transition: 'border-color 0.15s', boxSizing: 'border-box' }}
                  onFocus={e => (e.target.style.borderColor = errors.businessDomain ? '#ff4d4f' : '#1663c4')}
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
                    <label key={pt} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 4, border: `1px solid ${form.priceTypes.includes(pt) ? '#1663c4' : '#d9d9d9'}`, cursor: 'pointer', fontSize: 13, transition: 'all 0.15s', color: form.priceTypes.includes(pt) ? '#1663c4' : '#595959', background: form.priceTypes.includes(pt) ? '#e6f4ff' : '#fff', userSelect: 'none' }}>
                      <input type="checkbox" checked={form.priceTypes.includes(pt)} onChange={() => togglePriceType(pt)} style={{ width: 13, height: 13, accentColor: '#1663c4' }} />
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
                    onFocus={e => (e.target.style.borderColor = errors.remark ? '#ff4d4f' : '#1663c4')}
                    onBlur={e => (e.target.style.borderColor = errors.remark ? '#ff4d4f' : '#d9d9d9')} />
                  <span style={{ position: 'absolute', bottom: 6, right: 10, fontSize: 12, color: '#bfbfbf' }}>{form.remark.length}/256</span>
                </div>
                {errors.remark && <div style={{ fontSize: 12, color: '#ff4d4f', marginTop: 4 }}>{errors.remark}</div>}
              </div>
            </div>
            <div style={{ padding: '10px 16px', borderTop: '1px solid #f0f0f0', display: 'flex', justifyContent: 'flex-end', gap: 8, flexShrink: 0 }}>
              <button onClick={() => setDialogVisible(false)} style={{ height: 30, padding: '0 20px', border: '1px solid #d9d9d9', borderRadius: 4, background: '#fff', cursor: 'pointer', fontSize: 13, color: '#595959', fontFamily: 'inherit', transition: 'all 0.15s' }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#1663c4'; (e.currentTarget as HTMLButtonElement).style.color = '#1663c4'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#d9d9d9'; (e.currentTarget as HTMLButtonElement).style.color = '#595959'; }}>取消</button>
              <button onClick={handleSubmit} disabled={loading} style={{ height: 30, padding: '0 20px', border: 'none', borderRadius: 4, background: loading ? '#73b3ff' : '#1663c4', color: '#fff', cursor: loading ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 500, fontFamily: 'inherit', minWidth: 90, transition: 'background 0.15s', boxShadow: '0 2px 0 rgba(22,99,196,0.1)' }}
                onMouseEnter={e => { if (!loading) (e.currentTarget as HTMLButtonElement).style.background = '#3880d0'; }}
                onMouseLeave={e => { if (!loading) (e.currentTarget as HTMLButtonElement).style.background = '#1663c4'; }}>
                {loading ? '提交中...' : (editRow ? '保存修改' : '确认新增')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
