'use client';

import { useState, useEffect, useMemo } from 'react';

// ============ 类型定义 ============
interface FeeItem {
  id: number;
  feeCode: string;
  feeName: string;
  businessDomain: string;
  priceTypes: string[];
  remark: string;
  creator: string;
  createTime: string;
  updater: string;
  updateTime: string;
}

interface FormData {
  feeCode: string;
  feeName: string;
  businessDomain: string;
  priceTypes: string[];
  remark: string;
}

interface QueryForm {
  feeCode: string;
  feeName: string;
  businessDomain: string;
  priceType: string;
}

// ============ 数据映射（API -> 前端字段） ============
function mapRow(r: Record<string, unknown>): FeeItem {
  return {
    id: Number(r.id),
    feeCode: String(r.fee_code),
    feeName: String(r.fee_name),
    businessDomain: String(r.business_domain),
    priceTypes: Array.isArray(r.price_types) ? r.price_types.map(String) : [],
    remark: String(r.remark ?? ''),
    creator: String(r.creator),
    createTime: String(r.create_time),
    updater: String(r.updater),
    updateTime: String(r.update_time),
  };
}

const BUSINESS_DOMAINS = ['运配', '仓储', '干线', '配送'];
const PRICE_TYPES = ['平台价格', '成本价格', '基础价格', '网点价格', '增值服务价格'];

// 当前登录人（Mock）
const CURRENT_USER = '黄霖';

// ============ 主组件 ============
export default function FeeManager() {
  const [data, setData] = useState<FeeItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [query, setQuery] = useState<QueryForm>({ feeCode: '', feeName: '', businessDomain: '', priceType: '' });
  const [modalType, setModalType] = useState<'add' | 'edit' | null>(null);
  const [editRow, setEditRow] = useState<FeeItem | null>(null);
  const [form, setForm] = useState<FormData>({ feeCode: '', feeName: '', businessDomain: '', priceTypes: [], remark: '' });
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({});
  const [msg, setMsg] = useState({ text: '', type: 'success' });
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState('');

  // ============ 加载数据 ============
  const fetchUsers = async () => {
    setLoading(true);
    setFetchError('');
    try {
      const res = await fetch('/api/fees');
      const json = await res.json();
      if (json.error) {
        setFetchError(json.error);
      } else if (json.data) {
        setData(json.data.map(mapRow));
      }
    } catch (e) {
      setFetchError('网络请求失败，请检查网络连接');
    } finally { setLoading(false); }
  };

  useEffect(() => { fetchUsers(); }, []);

  // ============ 查询过滤 ============
  const filtered = useMemo(() => {
    return data.filter(item => {
      if (query.feeCode && !item.feeCode.includes(query.feeCode)) return false;
      if (query.feeName && !item.feeName.includes(query.feeName)) return false;
      if (query.businessDomain && item.businessDomain !== query.businessDomain) return false;
      if (query.priceType && !item.priceTypes.includes(query.priceType)) return false;
      return true;
    });
  }, [data, query]);

  // ============ 提示 ============
  const showMsg = (text: string, type: 'success' | 'error' = 'success') => {
    setMsg({ text, type });
    setTimeout(() => setMsg({ text: '', type: 'success' }), 3000);
  };

  // ============ 复选 ============
  const toggleSelect = (id: number) => {
    const next = new Set(selectedIds);
    next.has(id) ? next.delete(id) : next.delete(id); // 单选
    setSelectedIds(next);
  };

  const toggleAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map(r => r.id)));
    }
  };

  const toggleSelectForBatch = (id: number) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  // ============ 弹框 ============
  const openAdd = () => {
    setEditRow(null);
    setForm({ feeCode: '', feeName: '', businessDomain: '运配', priceTypes: [], remark: '' });
    setErrors({});
    setModalType('add');
  };

  const openEdit = (row: FeeItem) => {
    setEditRow(row);
    setForm({
      feeCode: row.feeCode,
      feeName: row.feeName,
      businessDomain: row.businessDomain,
      priceTypes: [...row.priceTypes],
      remark: row.remark,
    });
    setErrors({});
    setModalType('edit');
  };

  const closeModal = () => { setModalType(null); setEditRow(null); };

  // ============ 校验 ============
  const validate = (): boolean => {
    const errs: Partial<Record<keyof FormData, string>> = {};
    const code = form.feeCode;

    if (!code) {
      errs.feeCode = '费用编号不能为空';
    } else if (!/^\d+$/.test(code)) {
      errs.feeCode = '费用编号只能输入数字';
    } else if (code.length > 8) {
      errs.feeCode = '费用编号最多8位数字';
    } else {
      // 编辑时不允许修改编号，所以检查唯一性时排除自身
      const dup = data.find(r => r.feeCode === code && r.id !== editRow?.id);
      if (dup) errs.feeCode = '费用编号已存在';
    }

    if (!form.feeName) errs.feeName = '费用名称不能为空';
    else if (form.feeName.length > 32) errs.feeName = '费用名称最多32个字符';

    if (!form.businessDomain) errs.businessDomain = '所属业务域不能为空';
    if (form.remark.length > 256) errs.remark = '备注最多256个字符';

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  // ============ 增/改 ============
  const handleSubmit = async () => {
    if (!validate()) return;

    if (modalType === 'add') {
      const res = await fetch('/api/fees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, creator: CURRENT_USER }),
      });
      const json = await res.json();
      if (res.ok) {
        showMsg('✅ 新增成功');
        fetchUsers();
        closeModal();
      } else {
        showMsg('❌ ' + (json.error || '新增失败'), 'error');
      }
    } else if (modalType === 'edit' && editRow) {
      const res = await fetch(`/api/fees/${editRow.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, updater: CURRENT_USER }),
      });
      const json = await res.json();
      if (res.ok) {
        showMsg('✅ 更新成功');
        fetchUsers();
        closeModal();
      } else {
        showMsg('❌ ' + (json.error || '更新失败'), 'error');
      }
    }
  };

  // ============ 删 ============
  const handleDelete = async (id: number) => {
    if (!confirm('确认删除？')) return;
    const res = await fetch(`/api/fees/${id}`, { method: 'DELETE' });
    const json = await res.json();
    if (res.ok) {
      showMsg('✅ 删除成功');
      fetchUsers();
    } else {
      showMsg('❌ ' + (json.error || '删除失败'), 'error');
    }
  };

  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) { showMsg('请先选择要删除的数据', 'error'); return; }
    if (!confirm(`确认删除选中的 ${selectedIds.size} 条数据？`)) return;
    let deleted = 0;
    for (const id of selectedIds) {
      await fetch(`/api/fees/${id}`, { method: 'DELETE' });
      deleted++;
    }
    setSelectedIds(new Set());
    showMsg(`✅ 成功删除 ${deleted} 条数据`);
    fetchUsers();
  };

  // ============ 多选切换 ============
  const togglePriceType = (pt: string) => {
    setForm(f => ({
      ...f,
      priceTypes: f.priceTypes.includes(pt) ? f.priceTypes.filter(p => p !== pt) : [...f.priceTypes, pt],
    }));
  };

  // ============ 渲染 ============
  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">

        {/* ---- 标题栏 ---- */}
        <div className="flex justify-between items-center mb-5">
          <h1 className="text-2xl font-bold text-gray-800">费用类型维护</h1>
          <div className="flex gap-2">
            <button onClick={openAdd} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm font-medium">
              + 新增
            </button>
            <button
              onClick={handleBatchDelete}
              disabled={selectedIds.size === 0}
              className={`px-4 py-2 rounded text-sm font-medium ${selectedIds.size === 0 ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-red-500 text-white hover:bg-red-600'}`}
            >
              批量删除 {selectedIds.size > 0 && `(${selectedIds.size})`}
            </button>
          </div>
        </div>

        {/* ---- 消息提示 ---- */}
        {fetchError && (
          <div className="mb-4 px-4 py-3 rounded text-sm bg-red-50 text-red-700 border border-red-200">
            ⚠️ 数据加载失败：{fetchError}
            <button onClick={fetchUsers} className="ml-3 underline text-red-500">重试</button>
          </div>
        )}
        {msg.text && (
          <div className={`mb-4 px-4 py-2.5 rounded text-sm font-medium ${msg.type === 'error' ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-green-50 text-green-700 border border-green-200'}`}>
            {msg.text}
          </div>
        )}

        {/* ---- 查询区域 ---- */}
        <div className="bg-white rounded shadow mb-4 p-4">
          <div className="flex flex-wrap gap-4 items-end">
            <div className="flex flex-col gap-1 min-w-40">
              <label className="text-xs text-gray-500">费用编号</label>
              <input
                value={query.feeCode}
                onChange={e => setQuery(q => ({ ...q, feeCode: e.target.value }))}
                placeholder="模糊匹配"
                className="border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
            <div className="flex flex-col gap-1 min-w-40">
              <label className="text-xs text-gray-500">费用名称</label>
              <input
                value={query.feeName}
                onChange={e => setQuery(q => ({ ...q, feeName: e.target.value }))}
                placeholder="模糊匹配"
                className="border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
            <div className="flex flex-col gap-1 min-w-40">
              <label className="text-xs text-gray-500">所属业务域</label>
              <select
                value={query.businessDomain}
                onChange={e => setQuery(q => ({ ...q, businessDomain: e.target.value }))}
                className="border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              >
                <option value="">全部</option>
                {BUSINESS_DOMAINS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1 min-w-40">
              <label className="text-xs text-gray-500">所属报价</label>
              <select
                value={query.priceType}
                onChange={e => setQuery(q => ({ ...q, priceType: e.target.value }))}
                className="border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              >
                <option value="">全部</option>
                {PRICE_TYPES.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <button
              onClick={() => setQuery({ feeCode: '', feeName: '', businessDomain: '', priceType: '' })}
              className="px-4 py-1.5 text-sm text-gray-600 border rounded hover:bg-gray-50"
            >
              重置
            </button>
          </div>
        </div>

        {/* ---- 列表 ---- */}
        <div className="bg-white rounded shadow overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-100 border-b">
              <tr>
                <th className="p-3 text-left w-10">
                  <input
                    type="checkbox"
                    checked={filtered.length > 0 && selectedIds.size === filtered.length}
                    onChange={toggleAll}
                    className="w-4 h-4 accent-blue-600"
                  />
                </th>
                <th className="p-3 text-left font-medium text-gray-600">序号</th>
                <th className="p-3 text-left font-medium text-gray-600">费用编号</th>
                <th className="p-3 text-left font-medium text-gray-600">费用名称</th>
                <th className="p-3 text-left font-medium text-gray-600">所属业务域</th>
                <th className="p-3 text-left font-medium text-gray-600">所属报价</th>
                <th className="p-3 text-left font-medium text-gray-600">备注</th>
                <th className="p-3 text-left font-medium text-gray-600">创建人</th>
                <th className="p-3 text-left font-medium text-gray-600">创建时间</th>
                <th className="p-3 text-left font-medium text-gray-600">修改人</th>
                <th className="p-3 text-left font-medium text-gray-600">修改时间</th>
                <th className="p-3 text-center font-medium text-gray-600 w-28">操作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={12} className="p-10 text-center text-gray-400">暂无数据</td></tr>
              ) : (
                filtered.map((row, idx) => (
                  <tr key={row.id} className={`border-t hover:bg-gray-50 ${selectedIds.has(row.id) ? 'bg-blue-50' : ''}`}>
                    <td className="p-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(row.id)}
                        onChange={() => toggleSelectForBatch(row.id)}
                        className="w-4 h-4 accent-blue-600"
                      />
                    </td>
                    <td className="p-3 text-gray-500">{idx + 1}</td>
                    <td className="p-3 font-mono text-blue-600">{row.feeCode}</td>
                    <td className="p-3 font-medium text-gray-800">{row.feeName}</td>
                    <td className="p-3 text-gray-600">{row.businessDomain}</td>
                    <td className="p-3">
                      <div className="flex flex-wrap gap-1">
                        {row.priceTypes.map(pt => (
                          <span key={pt} className="px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">{pt}</span>
                        ))}
                      </div>
                    </td>
                    <td className="p-3 text-gray-500 text-xs max-w-32 truncate" title={row.remark}>{row.remark || '-'}</td>
                    <td className="p-3 text-gray-600">{row.creator}</td>
                    <td className="p-3 text-gray-400 text-xs">{row.createTime}</td>
                    <td className="p-3 text-gray-600">{row.updater}</td>
                    <td className="p-3 text-gray-400 text-xs">{row.updateTime}</td>
                    <td className="p-3 text-center">
                      <button onClick={() => openEdit(row)} className="text-blue-600 hover:underline text-sm mr-3">编辑</button>
                      <button onClick={() => handleDelete(row.id)} className="text-red-600 hover:underline text-sm">删除</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          {filtered.length > 0 && (
            <div className="px-4 py-2.5 border-t text-xs text-gray-400 bg-gray-50">
              共 {filtered.length} 条数据
            </div>
          )}
        </div>

      </div>

      {/* ---- 新增/编辑弹框 ---- */}
      {modalType && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={e => e.target === e.currentTarget && closeModal()}>
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4">
            {/* 弹框头部 */}
            <div className="flex justify-between items-center px-6 py-4 border-b">
              <h3 className="text-lg font-semibold text-gray-800">
                {modalType === 'add' ? '➕ 新增费用类型' : '✏️ 编辑费用类型'}
              </h3>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>

            {/* 弹框内容 */}
            <div className="px-6 py-5 space-y-4">

              {/* 费用编号 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  费用编号 <span className="text-red-500">*</span>
                </label>
                <input
                  value={form.feeCode}
                  onChange={e => setForm(f => ({ ...f, feeCode: e.target.value }))}
                  disabled={modalType === 'edit'}
                  placeholder="只允许输入数字，最多8位"
                  maxLength={8}
                  className={`w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 ${modalType === 'edit' ? 'bg-gray-100 cursor-not-allowed' : ''} ${errors.feeCode ? 'border-red-400' : 'border-gray-300'}`}
                />
                {errors.feeCode && <p className="mt-1 text-xs text-red-500">{errors.feeCode}</p>}
                <p className="mt-1 text-xs text-gray-400">必填，最大8位数字，编辑时不可修改</p>
              </div>

              {/* 费用名称 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  费用名称 <span className="text-red-500">*</span>
                </label>
                <input
                  value={form.feeName}
                  onChange={e => setForm(f => ({ ...f, feeName: e.target.value }))}
                  placeholder="允许输入任意字符，最多32个字符"
                  maxLength={32}
                  className={`w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 ${errors.feeName ? 'border-red-400' : 'border-gray-300'}`}
                />
                {errors.feeName && <p className="mt-1 text-xs text-red-500">{errors.feeName}</p>}
              </div>

              {/* 所属业务域 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  所属业务域 <span className="text-red-500">*</span>
                </label>
                <select
                  value={form.businessDomain}
                  onChange={e => setForm(f => ({ ...f, businessDomain: e.target.value }))}
                  className={`w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 ${errors.businessDomain ? 'border-red-400' : 'border-gray-300'}`}
                >
                  <option value="">请选择</option>
                  {BUSINESS_DOMAINS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
                {errors.businessDomain && <p className="mt-1 text-xs text-red-500">{errors.businessDomain}</p>}
              </div>

              {/* 所属报价（多选） */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">所属报价</label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {PRICE_TYPES.map(pt => (
                    <label key={pt} className={`flex items-center gap-1.5 px-3 py-1.5 rounded border cursor-pointer text-sm transition-colors ${form.priceTypes.includes(pt) ? 'bg-blue-50 border-blue-400 text-blue-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                      <input
                        type="checkbox"
                        checked={form.priceTypes.includes(pt)}
                        onChange={() => togglePriceType(pt)}
                        className="w-3.5 h-3.5 accent-blue-600"
                      />
                      {pt}
                    </label>
                  ))}
                </div>
                <p className="mt-1 text-xs text-gray-400">非必填，支持多选</p>
              </div>

              {/* 备注 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">备注</label>
                <textarea
                  value={form.remark}
                  onChange={e => setForm(f => ({ ...f, remark: e.target.value }))}
                  placeholder="允许输入任意字符，最多256个字符"
                  maxLength={256}
                  rows={3}
                  className={`w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none ${errors.remark ? 'border-red-400' : 'border-gray-300'}`}
                />
                {errors.remark && <p className="mt-1 text-xs text-red-500">{errors.remark}</p>}
                <p className="mt-1 text-xs text-gray-400 text-right">{form.remark.length}/256</p>
              </div>

            </div>

            {/* 弹框底部 */}
            <div className="flex justify-end gap-3 px-6 py-4 border-t bg-gray-50 rounded-b-lg">
              <button onClick={closeModal} className="px-5 py-2 border border-gray-300 rounded text-sm text-gray-600 hover:bg-gray-100">
                取消
              </button>
              <button onClick={handleSubmit} className="px-5 py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700">
                {modalType === 'add' ? '确认新增' : '保存修改'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
