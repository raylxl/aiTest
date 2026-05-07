'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import type { FeeRuleItem, FeeRuleFormData, FeeRuleQueryForm } from './types';
import Tooltip from './Tooltip';
import ConfirmDialog from './ConfirmDialog'
import Icon from './Icon';

// ============ 常量定义 ============
const SETTLEMENT_SUBJECTS = ['寄方', '派方', '中转'];

const SETTLEMENT_FLOWS = [
  '总部收中心', '中心收网点', '总部收网点', '一级网点收二级网点',
  '总部付中心', '中心付网点', '总部付网点', '一级网点付二级网点',
  '寄件中心付派件中心', '寄件中心付中转中心', '中转中心付中转中心',
  '中心付中心', '一级网点收一级网点'
];

const ORG_OPTIONS = [
  '总部', '寄件财务中心', '寄件网点', '寄件一级网点', '寄件二级网点',
  '中转财务中心', '派件财务中心', '目的网点', '目的一级网点', '目的二级网点', '上一站'
];

const BILL_NODES = ['开单', '揽收网点扫描', '中转中心扫描', '派件网点扫描', '到货', '签收'];

const STATUS_OPTIONS = [
  { value: 'pending', label: '未审核' },
  { value: 'approved', label: '已审核' },
  { value: 'rejected', label: '审核驳回' }
];

// ============ SVG 图标 ============
// Icon 已提取到 ./Icon.tsx

// ============ 主组件 ============
interface FeeRulesTableProps {
  currentUserNickname: string;
  onMessage: (text: string, type: 'success' | 'error') => void;
}

export default function FeeRulesTable({ currentUserNickname, onMessage }: FeeRulesTableProps) {
  // 数据状态
  const [data, setData] = useState<FeeRuleItem[]>([]);
  const [selectedRows, setSelectedRows] = useState<FeeRuleItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState('');
  const [msg, setMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // 确认删除弹窗
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState<{ type: 'delete' | 'batchDelete' | 'approve' | 'reject'; count?: number; item?: FeeRuleItem }>({ type: 'delete' });
  const openConfirm = (type: 'delete' | 'batchDelete' | 'approve' | 'reject', count?: number, item?: FeeRuleItem) => { setConfirmTarget({ type, count, item }); setConfirmVisible(true); };

  // 费用类型列表（从费用类型维护获取）
  const [feeTypes, setFeeTypes] = useState<Array<{ id: number; feeCode: string; feeName: string }>>([]);

  // 显示消息
  const showMsg = (text: string, type: 'success' | 'error') => {
    setMsg({ text, type });
    onMessage(text, type);
    setTimeout(() => setMsg(null), 3000);
  };

  // 分页
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);

  // 查询表单
  const [query, setQuery] = useState<FeeRuleQueryForm>({
    feeName: '', settlementSubject: '', settlementFlow: '',
    incomeOrg: '', expenseOrg: '', billNode: '', settlementNode: '', startDate: '', status: ''
  });
  // 用 ref 保存最新查询条件，避免闭包陷阱
  const queryRef = useRef<FeeRuleQueryForm>(query);
  const pageRef = useRef(page);

  // 同步更新 state 和 ref（避免 setQuery 异步 + fetchData 闭包陷阱）
  const updateQuery = (updater: FeeRuleQueryForm | ((prev: FeeRuleQueryForm) => FeeRuleQueryForm)) => {
    if (typeof updater === 'function') {
      setQuery(prev => { queryRef.current = updater(prev); return queryRef.current; });
    } else {
      queryRef.current = updater;
      setQuery(updater);
    }
  };

  // 同步更新 page state 和 ref
  const updatePage = (updater: number | ((prev: number) => number)) => {
    if (typeof updater === 'function') {
      setPage(prev => { pageRef.current = updater(prev); return pageRef.current; });
    } else {
      pageRef.current = updater;
      setPage(updater);
    }
  };

  // 弹框
  const [dialogVisible, setDialogVisible] = useState(false);
  const [dialogTitle, setDialogTitle] = useState('新增费用规则');
  const [editRow, setEditRow] = useState<FeeRuleItem | null>(null);

  // 表单数据
  const [form, setForm] = useState<FeeRuleFormData>({
    feeName: '', settlementSubject: '', settlementFlow: '',
    incomeOrg: '', expenseOrg: '', billNode: '', settlementNode: '',
    startDate: '', endDate: '', remark: ''
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  // 导入导出状态
  const [importModalVisible, setImportModalVisible] = useState(false);
  const [importPreview, setImportPreview] = useState<{
    total: number; validCount: number; errorCount: number;
    preview: Array<{ row: number; fee_name: string; fee_code: string; settlement_subject: string; settlement_flow: string; income_org: string; expense_org: string; bill_node: string; settlement_node: string; start_date: string; end_date: string; remark: string; errors: string[] }>;
    allRows: Array<{ fee_name: string; fee_code: string; settlement_subject: string; settlement_flow: string; income_org: string; expense_org: string; bill_node: string; settlement_node: string; start_date: string; end_date: string; remark: string }>;
  } | null>(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ inserted: number; errors: string[] } | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleExport = () => {
    setMsg({ text: '正在导出...', type: 'success' });
    onMessage('正在导出...', 'success');
    window.open('/api/fee-rules/export', '_blank');
    setTimeout(() => setMsg(null), 2000);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportLoading(true);
    setImportResult(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/fee-rules/import', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok) { onMessage(json.error || '解析失败', 'error'); return; }
      setImportPreview(json);
      setImportModalVisible(true);
    } catch { onMessage('文件解析失败', 'error'); }
    finally { setImportLoading(false); if (fileInputRef.current) fileInputRef.current.value = ''; }
  };

  const handleImportConfirm = async () => {
    if (!importPreview) return;
    setImporting(true);
    try {
      const validRows = importPreview.allRows
        .filter(r => r.fee_name && r.settlement_subject && r.settlement_flow && r.income_org && r.expense_org && r.bill_node && r.settlement_node && r.start_date)
        .map(r => ({ fee_name: r.fee_name, fee_code: r.fee_code, settlement_subject: r.settlement_subject, settlement_flow: r.settlement_flow, income_org: r.income_org, expense_org: r.expense_org, bill_node: r.bill_node, settlement_node: r.settlement_node, start_date: r.start_date, end_date: r.end_date, remark: r.remark }));
      const res = await fetch('/api/fee-rules/import', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: validRows, creator: currentUserNickname }),
      });
      const json = await res.json();
      if (!res.ok) { onMessage(json.error || '导入失败', 'error'); return; }
      setImportResult(json);
      if (json.inserted > 0) { fetchData(); setTimeout(() => setImportModalVisible(false), 2000); }
    } catch { onMessage('导入失败', 'error'); }
    finally { setImporting(false); }
  };

  // 获取数据
  const fetchData = useCallback(async (queryOverrides?: Partial<FeeRuleQueryForm>, pageOverride?: number) => {
    setLoading(true);
    setFetchError('');
    // 优先使用 overrides，否则用 ref（避免闭包陷阱），最后用初始值
    const q = queryOverrides
      ? { ...queryRef.current, ...queryOverrides }
      : { ...queryRef.current };
    const p = pageOverride ?? pageRef.current;
    try {
      const params = new URLSearchParams();
      if (q.feeName) params.append('feeName', q.feeName);
      if (q.settlementSubject) params.append('settlementSubject', q.settlementSubject);
      if (q.settlementFlow) params.append('settlementFlow', q.settlementFlow);
      if (q.incomeOrg) params.append('incomeOrg', q.incomeOrg);
      if (q.expenseOrg) params.append('expenseOrg', q.expenseOrg);
      if (q.billNode) params.append('billNode', q.billNode);
      if (q.settlementNode) params.append('settlementNode', q.settlementNode);
      if (q.startDate) params.append('startDate', q.startDate);
      if (q.status) params.append('status', q.status);
      params.append('page', String(p));
      params.append('pageSize', String(pageSize));

      const res = await fetch(`/api/fee-rules?${params.toString()}`);
      const json = await res.json();
      if (json.error) {
        setFetchError(json.error);
      } else {
        setData(json.data || []);
        setTotal(json.total || 0);
      }
    } catch {
      setFetchError('网络请求失败');
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageSize]); // query/page 通过 ref 访问，不再作为依赖

  // 获取费用类型列表
  const fetchFeeTypes = useCallback(async () => {
    try {
      const res = await fetch('/api/fees');
      const json = await res.json();
      if (json.data) {
        setFeeTypes(json.data.map((item: { id: number; fee_code: string; fee_name: string }) => ({
          id: item.id,
          feeCode: item.fee_code,
          feeName: item.fee_name
        })));
      }
    } catch {
      console.error('获取费用类型失败');
    }
  }, []);

  // mount 时自动加载一次
  useEffect(() => { fetchData(); }, []);
  // 查询条件/分页变化时由查询按钮触发，不再自动查询
  useEffect(() => { fetchFeeTypes(); }, [fetchFeeTypes]);

  // 重置表单
  const resetForm = () => {
    setForm({
      feeName: '', settlementSubject: '', settlementFlow: '',
      incomeOrg: '', expenseOrg: '', billNode: '', settlementNode: '',
      startDate: '', endDate: '', remark: ''
    });
    setErrors({});
  };

  // 打开新增弹框
  const handleAdd = () => {
    resetForm();
    setEditRow(null);
    setDialogTitle('新增费用规则');
    setDialogVisible(true);
  };

  // 打开编辑弹框
  const handleEdit = (row: FeeRuleItem) => {
    // 将 ISO 日期格式转换为 YYYY-MM-DD 格式
    const formatDateForInput = (dateStr: string) => {
      if (!dateStr) return '';
      return dateStr.split('T')[0];
    };

    setEditRow(row);
    setForm({
      feeName: row.fee_name,
      settlementSubject: row.settlement_subject,
      settlementFlow: row.settlement_flow,
      incomeOrg: row.income_org,
      expenseOrg: row.expense_org,
      billNode: row.bill_node,
      settlementNode: row.settlement_node,
      startDate: formatDateForInput(row.start_date),
      endDate: formatDateForInput(row.end_date),
      remark: row.remark || ''
    });
    setDialogTitle('编辑费用规则');
    setErrors({});
    setDialogVisible(true);
  };

  // 校验表单
  const validateForm = (): boolean => {
    const errs: Record<string, string> = {};
    if (!form.feeName) errs.feeName = '请选择费用名称';
    if (!form.settlementSubject) errs.settlementSubject = '请选择结算主体';
    if (!form.settlementFlow) errs.settlementFlow = '请选择结算流向';
    if (!form.incomeOrg) errs.incomeOrg = '请选择收入机构';
    if (!form.expenseOrg) errs.expenseOrg = '请选择支出机构';
    if (!form.billNode) errs.billNode = '请选择账单节点';
    if (!form.settlementNode) errs.settlementNode = '请选择结算节点';
    if (!form.startDate) errs.startDate = '请选择开始时间';
    if (!form.endDate) errs.endDate = '请选择结束时间';
    if (form.startDate && form.endDate && new Date(form.endDate) < new Date(form.startDate)) {
      errs.endDate = '结束时间必须大于等于开始时间';
    }
    // 备注已有 maxLength=256 限制，无需后端校验
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  // 提交表单
  const handleSubmit = async () => {
    if (!validateForm()) return;
    setLoading(true);
    try {
      const payload = {
        ...form,
        creator: currentUserNickname,
        updater: currentUserNickname
      };

      let res: Response;
      if (editRow) {
        // 编辑
        const currentRow = data.find(r => r.id === editRow.id);
        const newStatus = currentRow?.status === 'approved' ? 'approved' : 'pending'; // rejected → pending（可重新提交审核）
        res = await fetch(`/api/fee-rules/${editRow.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...payload, status: newStatus })
        });
      } else {
        // 新增
        res = await fetch('/api/fee-rules', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      }

      const json = await res.json();
      if (json.error) {
        showMsg(json.error, 'error');
      } else {
        showMsg(editRow ? '编辑成功' : '新增成功', 'success');
        setDialogVisible(false);
        fetchData();
      }
    } catch {
      showMsg('网络请求失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  // 删除单条
  const handleDelete = async (row: FeeRuleItem) => {
    openConfirm('delete', undefined, row);
  };

  const doConfirmDelete = async () => {
    if (confirmTarget.type === 'delete' && confirmTarget.item) {
      setLoading(true);
      try {
        const res = await fetch(`/api/fee-rules/${confirmTarget.item.id}`, { method: 'DELETE' });
        const json = await res.json();
        if (json.error) showMsg(json.error, 'error');
        else { showMsg('删除成功', 'success'); fetchData(); }
      } catch { showMsg('网络请求失败', 'error'); }
      finally { setLoading(false); }
    } else if (confirmTarget.type === 'batchDelete') {
      setLoading(true);
      try {
        const res = await fetch('/api/fee-rules/batch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'delete', ids: selectedRows.map(r => r.id), updater: currentUserNickname }) });
        const json = await res.json();
        if (json.error) showMsg(json.error, 'error');
        else { showMsg(json.message, 'success'); setSelectedRows([]); fetchData(); }
      } catch { showMsg('网络请求失败', 'error'); }
      finally { setLoading(false); }
    } else if (confirmTarget.type === 'approve') {
      const unapprovedRows = selectedRows.filter(r => r.status === 'pending');
      if (unapprovedRows.length === 0) { setConfirmVisible(false); showMsg('请选择未审核的数据', 'error'); return; }
      setLoading(true);
      try {
        const res = await fetch('/api/fee-rules/batch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'approve', ids: unapprovedRows.map(r => r.id), updater: currentUserNickname }) });
        const json = await res.json();
        if (json.error) showMsg(json.error, 'error');
        else { showMsg(json.message, 'success'); setSelectedRows([]); fetchData(); }
      } catch { showMsg('网络请求失败', 'error'); }
      finally { setLoading(false); }
    } else if (confirmTarget.type === 'reject') {
      const unapprovedRows = selectedRows.filter(r => r.status === 'pending');
      if (unapprovedRows.length === 0) { setConfirmVisible(false); showMsg('请选择未审核的数据', 'error'); return; }
      setLoading(true);
      try {
        const res = await fetch('/api/fee-rules/batch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'reject', ids: unapprovedRows.map(r => r.id), updater: currentUserNickname }) });
        const json = await res.json();
        if (json.error) showMsg(json.error, 'error');
        else { showMsg(json.message, 'success'); setSelectedRows([]); fetchData(); }
      } catch { showMsg('网络请求失败', 'error'); }
      finally { setLoading(false); }
    }
    setConfirmVisible(false);
  };

  // 批量删除
  const handleBatchDelete = async () => {
    if (selectedRows.length === 0) { showMsg('请选择要删除的数据', 'error'); return; }
    openConfirm('batchDelete');
  };

  // 批量审核通过
  const handleBatchApprove = async () => {
    const unapprovedRows = selectedRows.filter(r => r.status === 'pending');
    if (unapprovedRows.length === 0) { showMsg('请选择未审核的数据', 'error'); return; }
    openConfirm('approve');
  };

  // 批量审核驳回
  const handleBatchReject = async () => {
    const unapprovedRows = selectedRows.filter(r => r.status === 'pending');
    if (unapprovedRows.length === 0) { showMsg('请选择未审核的数据', 'error'); return; }
    openConfirm('reject');
  };

  // 选择行
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedRows([...data]);
    } else {
      setSelectedRows([]);
    }
  };

  const handleSelectRow = (row: FeeRuleItem, checked: boolean) => {
    if (checked) {
      setSelectedRows(prev => [...prev.filter(r => r.id !== row.id), row]);
    } else {
      setSelectedRows(prev => prev.filter(r => r.id !== row.id));
    }
  };

  // 格式化日期
  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-';
    return dateStr.split('T')[0];
  };

  // 格式化日期时间（包含时分秒）
  const formatDateTime = (dateStr: string) => {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const seconds = String(d.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  };

  // 渲染状态标签
  const renderStatus = (status: string) => {
    const config: Record<string, { bg: string; color: string; border: string; label: string }> = {
      approved: { bg: '#f6ffed', color: '#52c41a', border: '#b7eb8f', label: '已审核' },
      pending: { bg: '#fffbe6', color: '#faad14', border: '#ffe58f', label: '未审核' },
      rejected: { bg: '#fff2f0', color: '#ff4d4f', border: '#ffccc7', label: '审核驳回' },
    };
    const c = config[status] || config.pending;
    return (
      <span style={{
        padding: '2px 8px',
        borderRadius: 4,
        fontSize: 12,
        background: c.bg,
        color: c.color,
        border: `1px solid ${c.border}`,
        display: 'inline-block',
      }}>
        {c.label}
      </span>
    );
  };

  return (
    <div style={{ padding: 16, flex: 1, overflow: 'auto' }}>
      {/* 标题栏 */}
      <div style={{ padding: '14px 16px 12px', borderBottom: '1px solid #E8EAED', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#262626', marginBottom: 2 }}>费用规则维护</div>
          <div style={{ fontSize: 12, color: '#8c8c8c' }}>管理系统中的费用规则配置，支持新增、编辑、删除及批量审核操作</div>
        </div>
      </div>

      {/* 消息提示 */}
      {msg && (
        <div style={{ margin: '10px 16px 0', padding: '8px 12px', borderRadius: 4, fontSize: 13,
          background: msg.type === 'success' ? '#f6ffed' : '#fff2f0',
          color: msg.type === 'success' ? '#52c41a' : '#ff4d4f',
          border: `1px solid ${msg.type === 'success' ? '#b7eb8f' : '#ffccc7'}`, flexShrink: 0,
        }}>{msg.text}</div>
      )}

      {/* 查询表单 */}
      <div style={{ padding: '12px 16px', background: '#F5F7FA', borderBottom: '1px solid #E8EAED' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          {/* 费用名称 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, color: '#595959', whiteSpace: 'nowrap' }}>费用名称：</span>
            <select value={query.feeName} onChange={e => updateQuery(q => ({ ...q, feeName: e.target.value }))}
              style={{ height: 32, padding: '0 12px', borderRadius: 4, border: '1px solid #d9d9d9', fontSize: 13, minWidth: 140, outline: 'none' }}>
              <option value="">全部</option>
              {feeTypes.map(v => <option key={v.id} value={v.feeName}>{v.feeName} - {v.feeCode}</option>)}
            </select>
          </div>
          {/* 结算主体 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, color: '#595959', whiteSpace: 'nowrap' }}>结算主体：</span>
            <select value={query.settlementSubject} onChange={e => updateQuery(q => ({ ...q, settlementSubject: e.target.value }))}
              style={{ height: 32, padding: '0 12px', borderRadius: 4, border: '1px solid #d9d9d9', fontSize: 13, minWidth: 100, outline: 'none' }}>
              <option value="">全部</option>
              {SETTLEMENT_SUBJECTS.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
          {/* 结算流向 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, color: '#595959', whiteSpace: 'nowrap' }}>结算流向：</span>
            <select value={query.settlementFlow} onChange={e => updateQuery(q => ({ ...q, settlementFlow: e.target.value }))}
              style={{ height: 32, padding: '0 12px', borderRadius: 4, border: '1px solid #d9d9d9', fontSize: 13, minWidth: 140, outline: 'none' }}>
              <option value="">全部</option>
              {SETTLEMENT_FLOWS.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
          {/* 收入机构 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, color: '#595959', whiteSpace: 'nowrap' }}>收入机构：</span>
            <select value={query.incomeOrg} onChange={e => updateQuery(q => ({ ...q, incomeOrg: e.target.value }))}
              style={{ height: 32, padding: '0 12px', borderRadius: 4, border: '1px solid #d9d9d9', fontSize: 13, minWidth: 140, outline: 'none' }}>
              <option value="">全部</option>
              {ORG_OPTIONS.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
          {/* 支出机构 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, color: '#595959', whiteSpace: 'nowrap' }}>支出机构：</span>
            <select value={query.expenseOrg} onChange={e => updateQuery(q => ({ ...q, expenseOrg: e.target.value }))}
              style={{ height: 32, padding: '0 12px', borderRadius: 4, border: '1px solid #d9d9d9', fontSize: 13, minWidth: 140, outline: 'none' }}>
              <option value="">全部</option>
              {ORG_OPTIONS.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
          {/* 账单节点 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, color: '#595959', whiteSpace: 'nowrap' }}>账单节点：</span>
            <select value={query.billNode} onChange={e => updateQuery(q => ({ ...q, billNode: e.target.value }))}
              style={{ height: 32, padding: '0 12px', borderRadius: 4, border: '1px solid #d9d9d9', fontSize: 13, minWidth: 120, outline: 'none' }}>
              <option value="">全部</option>
              {BILL_NODES.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
          {/* 结算节点 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, color: '#595959', whiteSpace: 'nowrap' }}>结算节点：</span>
            <select value={query.settlementNode} onChange={e => updateQuery(q => ({ ...q, settlementNode: e.target.value }))}
              style={{ height: 32, padding: '0 12px', borderRadius: 4, border: '1px solid #d9d9d9', fontSize: 13, minWidth: 120, outline: 'none' }}>
              <option value="">全部</option>
              {BILL_NODES.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
          {/* 生效日期 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, color: '#595959', whiteSpace: 'nowrap' }}>生效日期：</span>
            <input type="date" value={query.startDate} onChange={e => updateQuery(q => ({ ...q, startDate: e.target.value }))}
              style={{ height: 32, padding: '0 8px', borderRadius: 4, border: '1px solid #d9d9d9', fontSize: 13, outline: 'none' }} />
          </div>
          {/* 状态 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, color: '#595959', whiteSpace: 'nowrap' }}>状态：</span>
            <select value={query.status} onChange={e => updateQuery(q => ({ ...q, status: e.target.value }))}
              style={{ height: 32, padding: '0 12px', borderRadius: 4, border: '1px solid #d9d9d9', fontSize: 13, minWidth: 100, outline: 'none' }}>
              <option value="">全部</option>
              {STATUS_OPTIONS.map(v => <option key={v.value} value={v.value}>{v.label}</option>)}
            </select>
          </div>
          {/* 查询按钮 */}
          <button onClick={() => { updatePage(1); fetchData(); }}
            style={{ height: 32, padding: '0 16px', borderRadius: 4, border: 'none', background: '#1677FF', color: '#fff', fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon name="search" size={13} /> 查询
          </button>
          <button onClick={() => { const empty = { feeName: '', settlementSubject: '', settlementFlow: '', incomeOrg: '', expenseOrg: '', billNode: '', settlementNode: '', startDate: '', status: '' }; setQuery(empty); fetchData(empty, 1); }}
            style={{ height: 32, padding: '0 16px', borderRadius: 4, border: '1px solid #d9d9d9', background: '#fff', color: '#595959', fontSize: 13, cursor: 'pointer' }}>
            重置
          </button>
        </div>
      </div>

      {/* 工具栏 */}
      <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'nowrap', flexShrink: 0 }}>
          <button onClick={handleAdd}
            style={{ height: 32, padding: '0 16px', borderRadius: 4, border: 'none', background: '#1677FF', color: '#fff', fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon name="plus" size={13} /> 新增
          </button>
          <button onClick={handleBatchApprove}
            style={{ height: 32, padding: '0 16px', borderRadius: 4, border: '1px solid #52c41a', background: '#fff', color: '#52c41a', fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon name="check" size={13} /> 审核通过
          </button>
          <button onClick={handleBatchReject}
            style={{ height: 32, padding: '0 16px', borderRadius: 4, border: '1px solid #FF4D4F', background: '#fff', color: '#FF4D4F', fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            审核驳回
          </button>
          <button onClick={handleBatchDelete}
            style={{ height: 32, padding: '0 16px', borderRadius: 4, border: '1px solid #FF4D4F', background: '#fff', color: '#FF4D4F', fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon name="delete" size={13} /> 删除
          </button>
          <button onClick={() => window.open('/api/fee-rules/template', '_blank')}
            style={{ height: 32, padding: '0 10px', borderRadius: 4, border: '1px solid #d9d9d9', background: '#fff', color: '#595959', fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            模版下载
          </button>
          <button onClick={() => fileInputRef.current?.click()} disabled={importLoading}
            style={{ height: 32, padding: '0 12px', borderRadius: 4, border: '1px solid #d9d9d9', background: '#fff', color: importLoading ? '#bfbfbf' : '#595959', fontSize: 13, cursor: importLoading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon name="upload" size={13} /> {importLoading ? '解析中...' : '导入'}
          </button>
          <button onClick={handleExport}
            style={{ height: 32, padding: '0 12px', borderRadius: 4, border: '1px solid #d9d9d9', background: '#fff', color: '#595959', fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon name="download" size={13} /> 导出
          </button>
        </div>
        <div style={{ fontSize: 13, color: '#8c8c8c' }}>
          {selectedRows.length > 0 && <span>已选择 {selectedRows.length} 项</span>}
        </div>
      </div>

      {/* 数据表格 */}
      <div style={{ overflowX: 'auto', flex: 1, minHeight: 0 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 1100, border: '1px solid #E8EAED', borderRadius: 4, overflow: 'hidden' }}>
          <thead>
            <tr style={{ background: '#EFF5FF' }}>
              <th style={{ padding: '10px 12px', borderBottom: '1px solid #E8EAED', textAlign: 'center', width: 48 }}>
                <input type="checkbox" checked={data.length > 0 && selectedRows.length === data.length}
                  onChange={e => handleSelectAll(e.target.checked)} style={{ cursor: 'pointer', accentColor: '#1677FF' }} />
              </th>
              <th style={{ padding: '10px 12px', borderBottom: '1px solid #E8EAED', textAlign: 'center', color: '#000', fontWeight: 600, width: 56, whiteSpace: 'nowrap' }}>序号</th>
              <th style={{ padding: '10px 12px', borderBottom: '1px solid #E8EAED', textAlign: 'left', color: '#000', fontWeight: 600, whiteSpace: 'nowrap' }}>费用名称</th>
              <th style={{ padding: '10px 12px', borderBottom: '1px solid #E8EAED', textAlign: 'left', color: '#000', fontWeight: 600, whiteSpace: 'nowrap' }}>结算主体</th>
              <th style={{ padding: '10px 12px', borderBottom: '1px solid #E8EAED', textAlign: 'left', color: '#000', fontWeight: 600, whiteSpace: 'nowrap' }}>结算流向</th>
              <th style={{ padding: '10px 12px', borderBottom: '1px solid #E8EAED', textAlign: 'left', color: '#000', fontWeight: 600, whiteSpace: 'nowrap' }}>收入机构</th>
              <th style={{ padding: '10px 12px', borderBottom: '1px solid #E8EAED', textAlign: 'left', color: '#000', fontWeight: 600, whiteSpace: 'nowrap' }}>支出机构</th>
              <th style={{ padding: '10px 12px', borderBottom: '1px solid #E8EAED', textAlign: 'left', color: '#000', fontWeight: 600, whiteSpace: 'nowrap' }}>账单节点</th>
              <th style={{ padding: '10px 12px', borderBottom: '1px solid #E8EAED', textAlign: 'left', color: '#000', fontWeight: 600, whiteSpace: 'nowrap' }}>结算节点</th>
              <th style={{ padding: '10px 12px', borderBottom: '1px solid #E8EAED', textAlign: 'left', color: '#000', fontWeight: 600, whiteSpace: 'nowrap' }}>生效日期</th>
              <th style={{ padding: '10px 12px', borderBottom: '1px solid #E8EAED', textAlign: 'left', color: '#000', fontWeight: 600, whiteSpace: 'nowrap' }}>失效日期</th>
              <th style={{ padding: '10px 12px', borderBottom: '1px solid #E8EAED', textAlign: 'left', color: '#000', fontWeight: 600, whiteSpace: 'nowrap' }}>备注</th>
              <th style={{ padding: '10px 12px', borderBottom: '1px solid #E8EAED', textAlign: 'center', color: '#000', fontWeight: 600, whiteSpace: 'nowrap' }}>审核状态</th>
              <th style={{ padding: '10px 12px', borderBottom: '1px solid #E8EAED', textAlign: 'center', color: '#000', fontWeight: 600, whiteSpace: 'nowrap' }}>创建人</th>
              <th style={{ padding: '10px 12px', borderBottom: '1px solid #E8EAED', textAlign: 'center', color: '#000', fontWeight: 600, whiteSpace: 'nowrap' }}>创建时间</th>
              <th style={{ padding: '10px 12px', borderBottom: '1px solid #E8EAED', textAlign: 'center', color: '#000', fontWeight: 600, whiteSpace: 'nowrap' }}>修改人</th>
              <th style={{ padding: '10px 12px', borderBottom: '1px solid #E8EAED', textAlign: 'center', color: '#000', fontWeight: 600, whiteSpace: 'nowrap' }}>修改时间</th>
              <th style={{ padding: '10px 12px', borderBottom: '1px solid #E8EAED', textAlign: 'center', color: '#000', fontWeight: 600, whiteSpace: 'nowrap' }}>审核人</th>
              <th style={{ padding: '10px 12px', borderBottom: '1px solid #E8EAED', textAlign: 'center', color: '#000', fontWeight: 600, whiteSpace: 'nowrap' }}>审核时间</th>
              <th style={{ padding: '10px 12px', borderBottom: '1px solid #E8EAED', textAlign: 'center', color: '#000', fontWeight: 600, whiteSpace: 'nowrap' }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={19} style={{ padding: 48, textAlign: 'center', color: '#bfbfbf', fontSize: 14 }}>加载中...</td></tr>
            ) : data.length === 0 ? (
              <tr><td colSpan={19} style={{ padding: 48, textAlign: 'center', color: '#bfbfbf', fontSize: 14 }}>暂无数据</td></tr>
            ) : data.map((row, index) => {
              const isEven = index % 2 === 1;
              return (
              <tr key={row.id}
                style={{ background: isEven ? '#F5F7FA' : '#FFF', cursor: 'pointer', transition: 'background 0.15s' }}
                onMouseEnter={e => (e.currentTarget.style.background = '#ECF5FF')}
                onMouseLeave={e => (e.currentTarget.style.background = isEven ? '#F5F7FA' : '#FFF')}>
                <td style={{ padding: '10px 12px', borderBottom: '1px solid #E8EAED', textAlign: 'center' }}>
                  <input type="checkbox" checked={selectedRows.some(r => r.id === row.id)}
                    onChange={e => handleSelectRow(row, e.target.checked)} style={{ cursor: 'pointer', accentColor: '#1677FF' }} />
                </td>
                <td style={{ padding: '10px 12px', borderBottom: '1px solid #E8EAED', textAlign: 'center', color: 'rgba(0,0,0,0.45)', maxWidth: 56, overflow: 'hidden' }}><Tooltip content={String(index + 1 + (page - 1) * pageSize)}>{index + 1 + (page - 1) * pageSize}</Tooltip></td>
                <td style={{ padding: '10px 12px', borderBottom: '1px solid #E8EAED', textAlign: 'left', fontWeight: 500, color: 'rgba(0,0,0,0.8)', maxWidth: 200, overflow: 'hidden' }}><Tooltip content={row.fee_name}>{row.fee_name}</Tooltip></td>
                <td style={{ padding: '10px 12px', borderBottom: '1px solid #E8EAED', textAlign: 'left', maxWidth: 150, overflow: 'hidden' }}><Tooltip content={row.settlement_subject}>{row.settlement_subject}</Tooltip></td>
                <td style={{ padding: '10px 12px', borderBottom: '1px solid #E8EAED', textAlign: 'left', maxWidth: 100, overflow: 'hidden' }}><Tooltip content={row.settlement_flow}>{row.settlement_flow}</Tooltip></td>
                <td style={{ padding: '10px 12px', borderBottom: '1px solid #E8EAED', textAlign: 'left', maxWidth: 120, overflow: 'hidden' }}><Tooltip content={row.income_org}>{row.income_org}</Tooltip></td>
                <td style={{ padding: '10px 12px', borderBottom: '1px solid #E8EAED', textAlign: 'left', maxWidth: 120, overflow: 'hidden' }}><Tooltip content={row.expense_org}>{row.expense_org}</Tooltip></td>
                <td style={{ padding: '10px 12px', borderBottom: '1px solid #E8EAED', textAlign: 'left', maxWidth: 100, overflow: 'hidden' }}><Tooltip content={row.bill_node}>{row.bill_node}</Tooltip></td>
                <td style={{ padding: '10px 12px', borderBottom: '1px solid #E8EAED', textAlign: 'left', maxWidth: 100, overflow: 'hidden' }}><Tooltip content={row.settlement_node}>{row.settlement_node}</Tooltip></td>
                <td style={{ padding: '10px 12px', borderBottom: '1px solid #E8EAED', textAlign: 'left', maxWidth: 100, overflow: 'hidden' }}><Tooltip content={row.start_date ? row.start_date.split('T')[0] : '-'}>{row.start_date ? row.start_date.split('T')[0] : '-'}</Tooltip></td>
                <td style={{ padding: '10px 12px', borderBottom: '1px solid #E8EAED', textAlign: 'left', maxWidth: 100, overflow: 'hidden' }}><Tooltip content={row.end_date ? row.end_date.split('T')[0] : '-'}>{row.end_date ? row.end_date.split('T')[0] : '-'}</Tooltip></td>
                <td style={{ padding: '10px 12px', borderBottom: '1px solid #E8EAED', textAlign: 'left', color: row.remark ? 'rgba(0,0,0,0.65)' : '#c0c0c0', maxWidth: 200, overflow: 'hidden' }}><Tooltip content={row.remark || ''}>{row.remark || '-'}</Tooltip></td>
                <td style={{ padding: '10px 12px', borderBottom: '1px solid #E8EAED', textAlign: 'center', maxWidth: 80, overflow: 'hidden' }}><Tooltip content={row.status === 'approved' ? '已审核' : '未审核'}>{renderStatus(row.status)}</Tooltip></td>
                <td style={{ padding: '10px 12px', borderBottom: '1px solid #E8EAED', textAlign: 'center', color: 'rgba(0,0,0,0.65)', maxWidth: 90, overflow: 'hidden' }}><Tooltip content={row.creator}>{row.creator}</Tooltip></td>
                <td style={{ padding: '10px 12px', borderBottom: '1px solid #E8EAED', textAlign: 'center', color: 'rgba(0,0,0,0.45)', fontSize: 12, maxWidth: 150, overflow: 'hidden' }}><Tooltip content={formatDateTime(row.create_time)}>{formatDateTime(row.create_time)}</Tooltip></td>
                <td style={{ padding: '10px 12px', borderBottom: '1px solid #E8EAED', textAlign: 'center', color: row.updater && row.updater !== row.creator ? 'rgba(0,0,0,0.65)' : '#c0c0c0', maxWidth: 90, overflow: 'hidden' }}><Tooltip content={row.updater && row.updater !== row.creator ? row.updater : ''}>{row.updater && row.updater !== row.creator ? row.updater : '-'}</Tooltip></td>
                <td style={{ padding: '10px 12px', borderBottom: '1px solid #E8EAED', textAlign: 'center', color: 'rgba(0,0,0,0.45)', fontSize: 12, maxWidth: 150, overflow: 'hidden' }}><Tooltip content={row.updater && row.updater !== row.creator && row.update_time ? formatDateTime(row.update_time) : ''}>{row.updater && row.updater !== row.creator && row.update_time ? formatDateTime(row.update_time) : '-'}</Tooltip></td>
                <td style={{ padding: '10px 12px', borderBottom: '1px solid #E8EAED', textAlign: 'center', color: 'rgba(0,0,0,0.65)', maxWidth: 90, overflow: 'hidden' }}><Tooltip content={row.audit_person || ''}>{row.audit_person || '-'}</Tooltip></td>
                <td style={{ padding: '10px 12px', borderBottom: '1px solid #E8EAED', textAlign: 'center', color: 'rgba(0,0,0,0.45)', fontSize: 12, maxWidth: 150, overflow: 'hidden' }}><Tooltip content={row.audit_time ? formatDateTime(row.audit_time) : ''}>{row.audit_time ? formatDateTime(row.audit_time) : '-'}</Tooltip></td>
                <td style={{ padding: '10px 12px', borderBottom: '1px solid #E8EAED', textAlign: 'center', whiteSpace: 'nowrap' }}>
                  <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                    <button onClick={() => handleEdit(row)} style={{ border: 'none', background: 'none', color: '#1677FF', cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 2, fontFamily: 'inherit', padding: '2px 4px', transition: 'color 0.15s', borderRadius: 3 }}
                      onMouseEnter={e => (e.currentTarget.style.color = '#4080FF')}
                      onMouseLeave={e => (e.currentTarget.style.color = '#1677FF')}>
                      <Icon name="edit" size={12} />编辑
                    </button>
                    <button onClick={() => handleDelete(row)} style={{ border: 'none', background: 'none', color: '#FF4D4F', cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 2, fontFamily: 'inherit', padding: '2px 4px', transition: 'color 0.15s', borderRadius: 3 }}
                      onMouseEnter={e => (e.currentTarget.style.color = '#FF1F1F')}
                      onMouseLeave={e => (e.currentTarget.style.color = '#FF4D4F')}>
                      <Icon name="delete" size={12} />删除
                    </button>
                  </div>
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 分页 */}
      <div style={{ padding: '10px 16px', borderTop: '1px solid #E8EAED', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#F5F7FA', flexShrink: 0, flexWrap: 'wrap', gap: 8 }}>
        <span style={{ fontSize: 13, color: '#8c8c8c' }}>共 <strong style={{ color: '#262626' }}>{total}</strong> 条{selectedRows.length > 0 && <>, 已选中 <strong style={{ color: '#1677FF' }}>{selectedRows.length}</strong> 项</>}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); updatePage(1); }}
            style={{ height: 26, padding: '0 20px 0 8px', border: '1px solid #d9d9d9', borderRadius: 4, fontSize: 13, outline: 'none', background: '#fff', fontFamily: 'inherit', cursor: 'pointer', appearance: 'none', backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1024 1024'%3E%3Cpath fill='%23bfbfbf' d='M192 320l320 320 320-320z'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 6px center', backgroundSize: 8, boxSizing: 'border-box' }}>
            <option value={10}>10 条/页</option>
            <option value={20}>20 条/页</option>
            <option value={50}>50 条/页</option>
            <option value={100}>100 条/页</option>
          </select>
          <button onClick={() => updatePage(p => Math.max(1, p - 1))} disabled={page <= 1} style={{ height: 26, width: 26, border: '1px solid #d9d9d9', borderRadius: 4, background: '#fff', cursor: page <= 1 ? 'not-allowed' : 'pointer', color: page <= 1 ? '#d9d9d9' : '#595959', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit', transition: 'all 0.15s', transform: 'rotate(180deg)' }}
            onMouseEnter={e => { if (page > 1) { (e.currentTarget as HTMLButtonElement).style.borderColor = '#1677FF'; (e.currentTarget as HTMLButtonElement).style.color = '#1677FF'; } }}
            onMouseLeave={e => { if (page > 1) { (e.currentTarget as HTMLButtonElement).style.borderColor = '#d9d9d9'; (e.currentTarget as HTMLButtonElement).style.color = '#595959'; } }}>
            <Icon name="right" size={10} />
          </button>
          {Array.from({ length: Math.min(5, Math.max(1, Math.ceil(total / pageSize))) }, (_, i) => {
            const totalPages = Math.max(1, Math.ceil(total / pageSize));
            const start = Math.max(1, Math.min(totalPages - 4, page - 2));
            const p = start + i;
            return p <= totalPages ? (
              <button key={p} onClick={() => updatePage(p)} style={{
                height: 26, width: 26, border: `1px solid ${p === page ? '#1677FF' : '#d9d9d9'}`,
                borderRadius: 4, background: p === page ? '#1677FF' : '#fff',
                color: p === page ? '#fff' : '#595959', fontSize: 12,
                cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s'
              }}>{p}</button>
            ) : null;
          })}
          <button onClick={() => updatePage(p => Math.min(Math.max(1, Math.ceil(total / pageSize)), p + 1))} disabled={page >= Math.max(1, Math.ceil(total / pageSize))} style={{ height: 26, width: 26, border: '1px solid #d9d9d9', borderRadius: 4, background: '#fff', cursor: page >= Math.max(1, Math.ceil(total / pageSize)) ? 'not-allowed' : 'pointer', color: page >= Math.max(1, Math.ceil(total / pageSize)) ? '#d9d9d9' : '#595959', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit', transition: 'all 0.15s' }}
            onMouseEnter={e => { if (page < Math.max(1, Math.ceil(total / pageSize))) { (e.currentTarget as HTMLButtonElement).style.borderColor = '#1677FF'; (e.currentTarget as HTMLButtonElement).style.color = '#1677FF'; } }}
            onMouseLeave={e => { if (page < Math.max(1, Math.ceil(total / pageSize))) { (e.currentTarget as HTMLButtonElement).style.borderColor = '#d9d9d9'; (e.currentTarget as HTMLButtonElement).style.color = '#595959'; } }}>
            <Icon name="right" size={10} />
          </button>
          <span style={{ fontSize: 12, color: '#8c8c8c', marginLeft: 4 }}>跳至<input type="text" onKeyDown={e => { if (e.key === 'Enter') { const v = parseInt((e.target as HTMLInputElement).value); if (v >= 1 && v <= Math.max(1, Math.ceil(total / pageSize))) updatePage(v); (e.target as HTMLInputElement).value = ''; } }} onBlur={e => { const v = parseInt((e.target as HTMLInputElement).value); if (v >= 1 && v <= Math.max(1, Math.ceil(total / pageSize))) updatePage(v); (e.target as HTMLInputElement).value = ''; }} style={{ width: 38, height: 26, padding: '0 4px', border: '1px solid #d9d9d9', borderRadius: 4, fontSize: 12, textAlign: 'center', outline: 'none', marginLeft: 4 }} />页</span>
        </div>
      </div>

      {/* 新增/编辑弹框 */}
      {dialogVisible && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', borderRadius: 8, width: 560, maxHeight: '90vh', overflow: 'auto', boxShadow: '0 8px 24px rgba(0,0,0,0.2)' }}>
            {/* 弹框头部 */}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #e8e8e8', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, background: '#fff', zIndex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{dialogTitle}</div>
              <button onClick={() => setDialogVisible(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
                <Icon name="close" size={16} />
              </button>
            </div>
            {/* 弹框内容 */}
            <div style={{ padding: 20 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                {/* 费用名称 */}
                <div>
                  <div style={{ marginBottom: 6, fontSize: 13, color: '#595959' }}>费用名称 <span style={{ color: '#ff4d4f' }}>*</span></div>
                  <select value={form.feeName} onChange={e => setForm(f => ({ ...f, feeName: e.target.value }))}
                    style={{ width: '100%', height: 32, padding: '0 12px', borderRadius: 4, border: `1px solid ${errors.feeName ? '#ff4d4f' : '#d9d9d9'}`, fontSize: 13, outline: 'none' }}>
                    <option value="">请选择</option>
                    {feeTypes.map(v => <option key={v.id} value={v.feeName}>{v.feeName} - {v.feeCode}</option>)}
                  </select>
                  {errors.feeName && <div style={{ fontSize: 12, color: '#ff4d4f', marginTop: 4 }}>{errors.feeName}</div>}
                </div>
                {/* 结算主体 */}
                <div>
                  <div style={{ marginBottom: 6, fontSize: 13, color: '#595959' }}>结算主体 <span style={{ color: '#ff4d4f' }}>*</span></div>
                  <select value={form.settlementSubject} onChange={e => setForm(f => ({ ...f, settlementSubject: e.target.value }))}
                    style={{ width: '100%', height: 32, padding: '0 12px', borderRadius: 4, border: `1px solid ${errors.settlementSubject ? '#ff4d4f' : '#d9d9d9'}`, fontSize: 13, outline: 'none' }}>
                    <option value="">请选择</option>
                    {SETTLEMENT_SUBJECTS.map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                  {errors.settlementSubject && <div style={{ fontSize: 12, color: '#ff4d4f', marginTop: 4 }}>{errors.settlementSubject}</div>}
                </div>
                {/* 结算流向 */}
                <div>
                  <div style={{ marginBottom: 6, fontSize: 13, color: '#595959' }}>结算流向 <span style={{ color: '#ff4d4f' }}>*</span></div>
                  <select value={form.settlementFlow} onChange={e => setForm(f => ({ ...f, settlementFlow: e.target.value }))}
                    style={{ width: '100%', height: 32, padding: '0 12px', borderRadius: 4, border: `1px solid ${errors.settlementFlow ? '#ff4d4f' : '#d9d9d9'}`, fontSize: 13, outline: 'none' }}>
                    <option value="">请选择</option>
                    {SETTLEMENT_FLOWS.map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                  {errors.settlementFlow && <div style={{ fontSize: 12, color: '#ff4d4f', marginTop: 4 }}>{errors.settlementFlow}</div>}
                </div>
                {/* 收入机构 */}
                <div>
                  <div style={{ marginBottom: 6, fontSize: 13, color: '#595959' }}>收入机构 <span style={{ color: '#ff4d4f' }}>*</span></div>
                  <select value={form.incomeOrg} onChange={e => setForm(f => ({ ...f, incomeOrg: e.target.value }))}
                    style={{ width: '100%', height: 32, padding: '0 12px', borderRadius: 4, border: `1px solid ${errors.incomeOrg ? '#ff4d4f' : '#d9d9d9'}`, fontSize: 13, outline: 'none' }}>
                    <option value="">请选择</option>
                    {ORG_OPTIONS.map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                  {errors.incomeOrg && <div style={{ fontSize: 12, color: '#ff4d4f', marginTop: 4 }}>{errors.incomeOrg}</div>}
                </div>
                {/* 支出机构 */}
                <div>
                  <div style={{ marginBottom: 6, fontSize: 13, color: '#595959' }}>支出机构 <span style={{ color: '#ff4d4f' }}>*</span></div>
                  <select value={form.expenseOrg} onChange={e => setForm(f => ({ ...f, expenseOrg: e.target.value }))}
                    style={{ width: '100%', height: 32, padding: '0 12px', borderRadius: 4, border: `1px solid ${errors.expenseOrg ? '#ff4d4f' : '#d9d9d9'}`, fontSize: 13, outline: 'none' }}>
                    <option value="">请选择</option>
                    {ORG_OPTIONS.map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                  {errors.expenseOrg && <div style={{ fontSize: 12, color: '#ff4d4f', marginTop: 4 }}>{errors.expenseOrg}</div>}
                </div>
                {/* 账单节点 */}
                <div>
                  <div style={{ marginBottom: 6, fontSize: 13, color: '#595959' }}>账单节点 <span style={{ color: '#ff4d4f' }}>*</span></div>
                  <select value={form.billNode} onChange={e => setForm(f => ({ ...f, billNode: e.target.value }))}
                    style={{ width: '100%', height: 32, padding: '0 12px', borderRadius: 4, border: `1px solid ${errors.billNode ? '#ff4d4f' : '#d9d9d9'}`, fontSize: 13, outline: 'none' }}>
                    <option value="">请选择</option>
                    {BILL_NODES.map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                  {errors.billNode && <div style={{ fontSize: 12, color: '#ff4d4f', marginTop: 4 }}>{errors.billNode}</div>}
                </div>
                {/* 结算节点 */}
                <div>
                  <div style={{ marginBottom: 6, fontSize: 13, color: '#595959' }}>结算节点 <span style={{ color: '#ff4d4f' }}>*</span></div>
                  <select value={form.settlementNode} onChange={e => setForm(f => ({ ...f, settlementNode: e.target.value }))}
                    style={{ width: '100%', height: 32, padding: '0 12px', borderRadius: 4, border: `1px solid ${errors.settlementNode ? '#ff4d4f' : '#d9d9d9'}`, fontSize: 13, outline: 'none' }}>
                    <option value="">请选择</option>
                    {BILL_NODES.map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                  {errors.settlementNode && <div style={{ fontSize: 12, color: '#ff4d4f', marginTop: 4 }}>{errors.settlementNode}</div>}
                </div>
                {/* 开始时间 */}
                <div>
                  <div style={{ marginBottom: 6, fontSize: 13, color: '#595959' }}>开始时间 <span style={{ color: '#ff4d4f' }}>*</span></div>
                  <input type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))}
                    style={{ width: '100%', height: 32, padding: '0 12px', borderRadius: 4, border: `1px solid ${errors.startDate ? '#ff4d4f' : '#d9d9d9'}`, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
                  {errors.startDate && <div style={{ fontSize: 12, color: '#ff4d4f', marginTop: 4 }}>{errors.startDate}</div>}
                </div>
                {/* 结束时间 */}
                <div>
                  <div style={{ marginBottom: 6, fontSize: 13, color: '#595959' }}>结束时间 <span style={{ color: '#ff4d4f' }}>*</span></div>
                  <input type="date" value={form.endDate} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))}
                    style={{ width: '100%', height: 32, padding: '0 12px', borderRadius: 4, border: `1px solid ${errors.endDate ? '#ff4d4f' : '#d9d9d9'}`, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
                  {errors.endDate && <div style={{ fontSize: 12, color: '#ff4d4f', marginTop: 4 }}>{errors.endDate}</div>}
                </div>
              </div>
              {/* 备注 */}
              <div style={{ marginTop: 16 }}>
                <div style={{ marginBottom: 6, fontSize: 13, color: '#595959' }}>备注</div>
                <div style={{ position: 'relative' }}>
                  <textarea value={form.remark} onChange={e => setForm(f => ({ ...f, remark: e.target.value }))} rows={3}
                    maxLength={256}
                    style={{ width: '100%', padding: '8px 12px', paddingBottom: 24, borderRadius: 4, border: `1px solid ${errors.remark ? '#ff4d4f' : '#d9d9d9'}`, fontSize: 13, outline: 'none', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }}
                    placeholder="最多256个字符" />
                  <span style={{ position: 'absolute', bottom: 6, right: 10, fontSize: 12, color: '#bfbfbf', pointerEvents: 'none' }}>{form.remark.length}/256</span>
                </div>
                {errors.remark && <div style={{ fontSize: 12, color: '#ff4d4f', marginTop: 4 }}>{errors.remark}</div>}
              </div>
            </div>
            {/* 弹框底部 */}
            <div style={{ padding: '16px 20px', borderTop: '1px solid #e8e8e8', display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
              <button onClick={() => setDialogVisible(false)}
                style={{ padding: '8px 24px', borderRadius: 4, border: '1px solid #d9d9d9', background: '#fff', fontSize: 13, cursor: 'pointer', color: '#595959' }}>
                取消
              </button>
              <button onClick={handleSubmit} disabled={loading}
                style={{ padding: '8px 24px', borderRadius: 4, border: 'none', background: loading ? '#73b3ff' : '#1677FF', fontSize: 13, cursor: loading ? 'not-allowed' : 'pointer', color: '#fff' }}>
                {loading ? '提交中...' : '确定'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 隐藏文件上传 */}
      <input ref={fileInputRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={handleFileChange} />

      {/* 导入预览弹框 */}
      {importModalVisible && importPreview && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100 }}>
          <div style={{ background: '#fff', borderRadius: 4, width: 1100, maxHeight: '88vh', display: 'flex', flexDirection: 'column', boxShadow: '0 6px 16px rgba(0,0,0,0.15)', overflow: 'hidden' }}>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid #E8EAED', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>
                <Icon name="upload" size={15} /> 导入预览
              </div>
              <button onClick={() => { setImportModalVisible(false); setImportPreview(null); setImportResult(null); }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
                <Icon name="close" size={16} />
              </button>
            </div>

            {!importResult && (
              <div style={{ padding: '10px 16px', borderBottom: '1px solid #E8EAED', display: 'flex', gap: 24, alignItems: 'center', flexShrink: 0, background: '#F5F7FA' }}>
                <span style={{ fontSize: 13 }}>共 <strong>{importPreview.total}</strong> 条</span>
                <span style={{ color: '#52c41a' }}>有效 <strong>{importPreview.validCount}</strong> 条</span>
                {importPreview.errorCount > 0 && <span style={{ color: '#ff4d4f' }}>有误 <strong>{importPreview.errorCount}</strong> 条</span>}
                <span style={{ fontSize: 12, color: '#8c8c8c' }}>仅前 20 条预览</span>
              </div>
            )}

            {importResult && (
              <div style={{ padding: '12px 16px', borderBottom: '1px solid #E8EAED', flexShrink: 0 }}>
                <div style={{ color: '#52c41a', fontSize: 13 }}>✓ 成功导入 <strong>{importResult.inserted}</strong> 条</div>
                {importResult.errors.length > 0 && (
                  <div style={{ fontSize: 12, color: '#ff4d4f', maxHeight: 80, overflowY: 'auto', marginTop: 8 }}>
                    {importResult.errors.map((err, i) => <div key={i}>• {err}</div>)}
                  </div>
                )}
              </div>
            )}

            {!importResult && (
              <div style={{ overflow: 'auto', flex: 1, minHeight: 0 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 900, border: '1px solid #E8EAED', borderRadius: 4, overflow: 'hidden' }}>
                  <thead>
                    <tr style={{ background: '#EFF5FF', position: 'sticky', top: 0, zIndex: 1 }}>
                      <th style={{ padding: '8px 6px', borderBottom: '1px solid #E8EAED', textAlign: 'center', color: '#000', fontWeight: 600, width: 50 }}>行号</th>
                      <th style={{ padding: '8px 6px', borderBottom: '1px solid #E8EAED', textAlign: 'center', color: '#000', fontWeight: 600, width: 60 }}>状态</th>
                      <th style={{ padding: '8px 6px', borderBottom: '1px solid #E8EAED', textAlign: 'left', color: '#000', fontWeight: 600, width: 160 }}>费用名称</th>
                      <th style={{ padding: '8px 6px', borderBottom: '1px solid #E8EAED', textAlign: 'left', color: '#000', fontWeight: 600, width: 80 }}>结算主体</th>
                      <th style={{ padding: '8px 6px', borderBottom: '1px solid #E8EAED', textAlign: 'left', color: '#000', fontWeight: 600, width: 130 }}>结算流向</th>
                      <th style={{ padding: '8px 6px', borderBottom: '1px solid #E8EAED', textAlign: 'left', color: '#000', fontWeight: 600, width: 100 }}>收入机构</th>
                      <th style={{ padding: '8px 6px', borderBottom: '1px solid #E8EAED', textAlign: 'left', color: '#000', fontWeight: 600, width: 100 }}>支出机构</th>
                      <th style={{ padding: '8px 6px', borderBottom: '1px solid #E8EAED', textAlign: 'left', color: '#000', fontWeight: 600, width: 90 }}>账单节点</th>
                      <th style={{ padding: '8px 6px', borderBottom: '1px solid #E8EAED', textAlign: 'left', color: '#000', fontWeight: 600, width: 90 }}>结算节点</th>
                      <th style={{ padding: '8px 6px', borderBottom: '1px solid #E8EAED', textAlign: 'left', color: '#000', fontWeight: 600, width: 80 }}>生效日期</th>
                      <th style={{ padding: '8px 6px', borderBottom: '1px solid #E8EAED', textAlign: 'left', color: '#000', fontWeight: 600, width: 200 }}>错误信息</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importPreview.preview.map((row, idx) => {
                      const hasError = row.errors.length > 0;
                      const isEven = idx % 2 === 1;
                      return (
                        <tr key={idx} style={{ background: hasError ? '#fff1f0' : (isEven ? '#F5F7FA' : '#FFF') }}>
                          <td style={{ padding: '7px 6px', borderBottom: '1px solid #E8EAED', textAlign: 'center', color: 'rgba(0,0,0,0.45)' }}>{row.row}</td>
                          <td style={{ padding: '7px 6px', borderBottom: '1px solid #E8EAED', textAlign: 'center' }}>
                            {hasError ? <span style={{ color: '#FF4D4F', fontSize: 11 }}>✗</span> : <span style={{ color: '#52c41a', fontSize: 11 }}>✓</span>}
                          </td>
                          <td style={{ padding: '7px 6px', borderBottom: '1px solid #E8EAED', textAlign: 'left', fontSize: 12 }}><Tooltip content={row.fee_name}>{row.fee_name || '-'}</Tooltip></td>
                          <td style={{ padding: '7px 6px', borderBottom: '1px solid #E8EAED', textAlign: 'left', fontSize: 12 }}>{row.settlement_subject || '-'}</td>
                          <td style={{ padding: '7px 6px', borderBottom: '1px solid #E8EAED', textAlign: 'left', fontSize: 12 }}><Tooltip content={row.settlement_flow}>{row.settlement_flow || '-'}</Tooltip></td>
                          <td style={{ padding: '7px 6px', borderBottom: '1px solid #E8EAED', textAlign: 'left', fontSize: 12 }}>{row.income_org || '-'}</td>
                          <td style={{ padding: '7px 6px', borderBottom: '1px solid #E8EAED', textAlign: 'left', fontSize: 12 }}>{row.expense_org || '-'}</td>
                          <td style={{ padding: '7px 6px', borderBottom: '1px solid #E8EAED', textAlign: 'left', fontSize: 12 }}>{row.bill_node || '-'}</td>
                          <td style={{ padding: '7px 6px', borderBottom: '1px solid #E8EAED', textAlign: 'left', fontSize: 12 }}>{row.settlement_node || '-'}</td>
                          <td style={{ padding: '7px 6px', borderBottom: '1px solid #E8EAED', textAlign: 'left', fontSize: 12 }}>{row.start_date || '-'}</td>
                          <td style={{ padding: '7px 6px', borderBottom: '1px solid #E8EAED', textAlign: 'left', color: '#FF4D4F', fontSize: 11, maxWidth: 200 }}>
                            {hasError ? <Tooltip content={row.errors.join('；')} maxWidth={220}>{row.errors.join('；')}</Tooltip> : '-'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <div style={{ padding: '10px 16px', borderTop: '1px solid #E8EAED', display: 'flex', justifyContent: 'flex-end', gap: 8, flexShrink: 0 }}>
              {!importResult ? (
                <>
                  <button onClick={() => { setImportModalVisible(false); setImportPreview(null); }}
                    style={{ padding: '8px 20px', border: '1px solid #d9d9d9', borderRadius: 4, background: '#fff', fontSize: 13, cursor: 'pointer', color: '#595959' }}>取消</button>
                  <button onClick={handleImportConfirm} disabled={importing || importPreview.validCount === 0}
                    style={{ padding: '8px 24px', border: 'none', borderRadius: 4, background: importing || importPreview.validCount === 0 ? '#a0cfff' : '#1677FF', color: '#fff', fontSize: 13, cursor: importing || importPreview.validCount === 0 ? 'not-allowed' : 'pointer' }}>
                    {importing ? '导入中...' : `确认导入 (${importPreview.validCount} 条)`}
                  </button>
                </>
              ) : (
                <button onClick={() => { setImportModalVisible(false); setImportPreview(null); setImportResult(null); }}
                  style={{ padding: '8px 24px', border: 'none', borderRadius: 4, background: '#1677FF', color: '#fff', fontSize: 13, cursor: 'pointer' }}>关闭</button>
              )}
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        visible={confirmVisible}
        title={
          confirmTarget.type === 'delete' ? '删除确认' :
          confirmTarget.type === 'batchDelete' ? '批量删除' :
          confirmTarget.type === 'approve' ? '审核通过确认' :
          '审核驳回确认'
        }
        message={
          confirmTarget.type === 'delete' ? (
            <>确定删除费用规则 <strong style={{ color: '#262626' }}>「{confirmTarget.item?.fee_name}」</strong> 吗？<br /><span style={{ color: '#8c8c8c', fontSize: 13 }}>删除后数据无法恢复，请谨慎操作。</span></>
          ) : confirmTarget.type === 'batchDelete' ? (
            <>确定删除选中的 <strong style={{ color: '#ff4d4f' }}>{selectedRows.length}</strong> 条数据吗？<br /><span style={{ color: '#8c8c8c', fontSize: 13 }}>删除后数据无法恢复，请谨慎操作。</span></>
          ) : confirmTarget.type === 'approve' ? (
            <>确定对选中的 <strong style={{ color: '#1677FF' }}>{selectedRows.filter(r => r.status === 'pending').length}</strong> 条数据进行审核通过操作吗？</>
          ) : (
            <>确定对选中的 <strong style={{ color: '#FF4D4F' }}>{selectedRows.filter(r => r.status === 'pending').length}</strong> 条数据进行审核驳回操作吗？<br /><span style={{ color: '#8c8c8c', fontSize: 13 }}>驳回后数据将保留，可重新编辑后提交审核。</span></>
          )
        }
        confirmText={
          confirmTarget.type === 'delete' ? '删除' :
          confirmTarget.type === 'batchDelete' ? '删除' :
          '确定'
        }
        cancelText="取消"
        confirmType={confirmTarget.type === 'reject' ? 'primary' : 'danger'}
        onConfirm={doConfirmDelete}
        onCancel={() => setConfirmVisible(false)}
      />
    </div>
  );
}
