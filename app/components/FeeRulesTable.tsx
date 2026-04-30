'use client';

import React, { useState, useCallback, useEffect } from 'react';
import type { FeeRuleItem, FeeRuleFormData, FeeRuleQueryForm } from './types';

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
  { value: 'approved', label: '已审核' }
];

// ============ SVG 图标 ============
function Icon({ name, size = 14 }: { name: string; size?: number }) {
  const paths: Record<string, string> = {
    search: 'M772.188 672.172L579.558 479.586C605.586 442.688 620 398.766 620 352c0-141.16-114.84-256-256-256S108 210.84 108 352s114.84 256 256 256c46.766 0 90.688-14.414 127.586-40.442L672.172 772.188a16 16 0 0 0 22.628 0l77.388-77.388a16 16 0 0 0 0-22.628zM364 352c0-79.4 64.6-144 144-144s144 64.6 144 144-64.6 144-144 144-144-64.6-144-144z',
    plus: 'M480-64v448h-64v64h448v-64h-64V-64h-64v448H544v-64H480z',
    edit: 'M721.7 199.5l-493.2 493.2a32 32 0 0 1-15.7 8.5H192c-17.7 0-32-14.3-32-32v-32c0-5.8 2.1-11.4 6.1-15.7L494.7 58.3c10.6-10.6 25.6-16 40-16h281c15.5 0 30.1 5.4 40 16h1l38.3 38.3a32 32 0 0 1 8.5 15.7v281c0 14.4-5.4 29.4-16 40L721.7 199.5zM688 136.1l-43.6-43.6L592 144l43.6 43.6L688 136.1z',
    delete: 'M864 256H736v-64c0-35.2-28.8-64-64-64H352c-35.2 0-64 28.8-64 64v64H160c-44.2 0-80 35.8-80 80v32c0 17.7 14.3 32 32 32h640c17.7 0 32-14.3 32-32v-32c0-44.2-35.8-80-80-80zm-96-64V64c0-17.7 14.3-32 32-32h320c17.7 0 32 14.3 32 32v128c0 17.7-14.3 32-32 32H800c-17.7 0-32-14.3-32-32z',
    close: 'M810 274l-238 238 238 238L608 810 370 572l238-238-238-238L274 240l238-238L370-2 608 236l238-238z',
    check: 'M384 690.7l462.6-462.6L768 149.3 384 533.3l-192-192L93.3 439.9l98.6 98.6z',
    calendar: 'M896 128H768V64H640v64H384V64H256v64H128c-44.2 0-80 35.8-80 80v640c0 44.2 35.8 80 80 80h768c44.2 0 80-35.8 80-80V208c0-44.2-35.8-80-80-80zm0 720H128V208h128v64h64v-64h384v64h64v-64h128v640z',
  };
  return <svg width={size} height={size} viewBox="0 0 1024 1024" style={{ display: 'inline-block', flexShrink: 0 }}><path fill="currentColor" d={paths[name] || paths.close} /></svg>;
}

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

  // 费用类型列表（从费用类型维护获取）
  const [feeTypes, setFeeTypes] = useState<Array<{ id: number; feeCode: string; feeName: string }>>([]);

  // 显示消息
  const showMsg = (text: string, type: 'success' | 'error') => {
    showMsg(text, type);
    setMsg({ text, type });
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

  // 获取数据
  const fetchData = useCallback(async () => {
    setLoading(true);
    setFetchError('');
    try {
      const params = new URLSearchParams();
      // 费用名称：提取纯费用名称（去掉编号前缀）
      if (query.feeName) {
        const pureFeeName = query.feeName.split(' - ')[1] || query.feeName;
        params.append('feeName', pureFeeName);
      }
      if (query.settlementSubject) params.append('settlementSubject', query.settlementSubject);
      if (query.settlementFlow) params.append('settlementFlow', query.settlementFlow);
      if (query.incomeOrg) params.append('incomeOrg', query.incomeOrg);
      if (query.expenseOrg) params.append('expenseOrg', query.expenseOrg);
      if (query.billNode) params.append('billNode', query.billNode);
      if (query.settlementNode) params.append('settlementNode', query.settlementNode);
      if (query.startDate) params.append('startDate', query.startDate);
      if (query.status) params.append('status', query.status);
      params.append('page', String(page));
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
  }, [query, page, pageSize]);

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

  useEffect(() => { fetchData(); }, [fetchData]);
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
      feeName: row.fee_code ? `${row.fee_code} - ${row.fee_name}` : row.fee_name,
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
        const newStatus = currentRow?.status === 'approved' ? 'approved' : 'pending';
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
    if (!confirm('确定要删除该费用规则吗？')) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/fee-rules/${row.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.error) {
        showMsg(json.error, 'error');
      } else {
        showMsg('删除成功', 'success');
        fetchData();
      }
    } catch {
      showMsg('网络请求失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  // 批量删除
  const handleBatchDelete = async () => {
    if (selectedRows.length === 0) {
      showMsg('请选择要删除的数据', 'error');
      return;
    }
    if (!confirm(`确定要删除选中的 ${selectedRows.length} 条数据吗？`)) return;
    setLoading(true);
    try {
      const res = await fetch('/api/fee-rules/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', ids: selectedRows.map(r => r.id), updater: currentUserNickname })
      });
      const json = await res.json();
      if (json.error) {
        showMsg(json.error, 'error');
      } else {
        showMsg(json.message, 'success');
        setSelectedRows([]);
        fetchData();
      }
    } catch {
      showMsg('网络请求失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  // 批量审核通过
  const handleBatchApprove = async () => {
    const unapprovedRows = selectedRows.filter(r => r.status === 'pending');
    if (unapprovedRows.length === 0) {
      showMsg('请选择未审核的数据', 'error');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/fee-rules/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve', ids: unapprovedRows.map(r => r.id), updater: currentUserNickname })
      });
      const json = await res.json();
      if (json.error) {
        showMsg(json.error, 'error');
      } else {
        showMsg(json.message, 'success');
        setSelectedRows([]);
        fetchData();
      }
    } catch {
      showMsg('网络请求失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  // 批量审核不通过
  const handleBatchReject = async () => {
    const unapprovedRows = selectedRows.filter(r => r.status === 'pending');
    if (unapprovedRows.length === 0) {
      showMsg('请选择未审核的数据', 'error');
      return;
    }
    if (!confirm(`确定要对选中的 ${unapprovedRows.length} 条数据进行审核不通过操作吗？`)) return;
    setLoading(true);
    try {
      const res = await fetch('/api/fee-rules/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reject', ids: unapprovedRows.map(r => r.id), updater: currentUserNickname })
      });
      const json = await res.json();
      if (json.error) {
        showMsg(json.error, 'error');
      } else {
        showMsg(json.message, 'success');
        setSelectedRows([]);
        fetchData();
      }
    } catch {
      showMsg('网络请求失败', 'error');
    } finally {
      setLoading(false);
    }
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
    return (
      <span style={{
        padding: '2px 8px',
        borderRadius: 4,
        fontSize: 12,
        background: status === 'approved' ? '#f6ffed' : '#fffbe6',
        color: status === 'approved' ? '#52c41a' : '#faad14',
        border: `1px solid ${status === 'approved' ? '#b7eb8f' : '#ffe58f'}`
      }}>
        {status === 'approved' ? '已审核' : '未审核'}
      </span>
    );
  };

  return (
    <div style={{ padding: 16, flex: 1, overflow: 'auto' }}>
      {/* 标题栏 */}
      <div style={{ padding: '14px 16px 12px', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#262626', marginBottom: 2 }}>费用规则维护</div>
          <div style={{ fontSize: 12, color: '#8c8c8c' }}>管理系统中的费用规则配置，支持新增、编辑、删除及批量审核操作</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <button onClick={fetchData} style={{ height: 30, padding: '0 14px', border: '1px solid #d9d9d9', borderRadius: 4, background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, color: '#595959', transition: 'all 0.15s', fontFamily: 'inherit' }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#1663c4'; (e.currentTarget as HTMLButtonElement).style.color = '#1663c4'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#d9d9d9'; (e.currentTarget as HTMLButtonElement).style.color = '#595959'; }}>
            <Icon name="search" size={13} /><span>刷新</span>
          </button>
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
      <div style={{ marginBottom: 16, padding: 16, background: '#fafafa', borderRadius: 4, border: '1px solid #e8e8e8' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          {/* 费用名称 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, color: '#595959', whiteSpace: 'nowrap' }}>费用名称：</span>
            <select value={query.feeName} onChange={e => setQuery(q => ({ ...q, feeName: e.target.value }))}
              style={{ height: 32, padding: '0 12px', borderRadius: 4, border: '1px solid #d9d9d9', fontSize: 13, minWidth: 140, outline: 'none' }}>
              <option value="">全部</option>
              {feeTypes.map(v => <option key={v.id} value={v.feeName}>{v.feeCode} - {v.feeName}</option>)}
            </select>
          </div>
          {/* 结算主体 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, color: '#595959', whiteSpace: 'nowrap' }}>结算主体：</span>
            <select value={query.settlementSubject} onChange={e => setQuery(q => ({ ...q, settlementSubject: e.target.value }))}
              style={{ height: 32, padding: '0 12px', borderRadius: 4, border: '1px solid #d9d9d9', fontSize: 13, minWidth: 100, outline: 'none' }}>
              <option value="">全部</option>
              {SETTLEMENT_SUBJECTS.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
          {/* 结算流向 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, color: '#595959', whiteSpace: 'nowrap' }}>结算流向：</span>
            <select value={query.settlementFlow} onChange={e => setQuery(q => ({ ...q, settlementFlow: e.target.value }))}
              style={{ height: 32, padding: '0 12px', borderRadius: 4, border: '1px solid #d9d9d9', fontSize: 13, minWidth: 140, outline: 'none' }}>
              <option value="">全部</option>
              {SETTLEMENT_FLOWS.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
          {/* 收入机构 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, color: '#595959', whiteSpace: 'nowrap' }}>收入机构：</span>
            <select value={query.incomeOrg} onChange={e => setQuery(q => ({ ...q, incomeOrg: e.target.value }))}
              style={{ height: 32, padding: '0 12px', borderRadius: 4, border: '1px solid #d9d9d9', fontSize: 13, minWidth: 140, outline: 'none' }}>
              <option value="">全部</option>
              {ORG_OPTIONS.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
          {/* 支出机构 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, color: '#595959', whiteSpace: 'nowrap' }}>支出机构：</span>
            <select value={query.expenseOrg} onChange={e => setQuery(q => ({ ...q, expenseOrg: e.target.value }))}
              style={{ height: 32, padding: '0 12px', borderRadius: 4, border: '1px solid #d9d9d9', fontSize: 13, minWidth: 140, outline: 'none' }}>
              <option value="">全部</option>
              {ORG_OPTIONS.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
          {/* 账单节点 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, color: '#595959', whiteSpace: 'nowrap' }}>账单节点：</span>
            <select value={query.billNode} onChange={e => setQuery(q => ({ ...q, billNode: e.target.value }))}
              style={{ height: 32, padding: '0 12px', borderRadius: 4, border: '1px solid #d9d9d9', fontSize: 13, minWidth: 120, outline: 'none' }}>
              <option value="">全部</option>
              {BILL_NODES.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
          {/* 结算节点 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, color: '#595959', whiteSpace: 'nowrap' }}>结算节点：</span>
            <select value={query.settlementNode} onChange={e => setQuery(q => ({ ...q, settlementNode: e.target.value }))}
              style={{ height: 32, padding: '0 12px', borderRadius: 4, border: '1px solid #d9d9d9', fontSize: 13, minWidth: 120, outline: 'none' }}>
              <option value="">全部</option>
              {BILL_NODES.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
          {/* 生效日期 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, color: '#595959', whiteSpace: 'nowrap' }}>生效日期：</span>
            <input type="date" value={query.startDate} onChange={e => setQuery(q => ({ ...q, startDate: e.target.value }))}
              style={{ height: 32, padding: '0 8px', borderRadius: 4, border: '1px solid #d9d9d9', fontSize: 13, outline: 'none' }} />
          </div>
          {/* 状态 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, color: '#595959', whiteSpace: 'nowrap' }}>状态：</span>
            <select value={query.status} onChange={e => setQuery(q => ({ ...q, status: e.target.value }))}
              style={{ height: 32, padding: '0 12px', borderRadius: 4, border: '1px solid #d9d9d9', fontSize: 13, minWidth: 100, outline: 'none' }}>
              <option value="">全部</option>
              {STATUS_OPTIONS.map(v => <option key={v.value} value={v.value}>{v.label}</option>)}
            </select>
          </div>
          {/* 查询按钮 */}
          <button onClick={() => { setPage(1); fetchData(); }}
            style={{ height: 32, padding: '0 16px', borderRadius: 4, border: 'none', background: '#1663c4', color: '#fff', fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon name="search" size={13} /> 查询
          </button>
          <button onClick={() => setQuery({ feeName: '', settlementSubject: '', settlementFlow: '', incomeOrg: '', expenseOrg: '', billNode: '', settlementNode: '', startDate: '', status: '' })}
            style={{ height: 32, padding: '0 16px', borderRadius: 4, border: '1px solid #d9d9d9', background: '#fff', color: '#595959', fontSize: 13, cursor: 'pointer' }}>
            重置
          </button>
        </div>
      </div>

      {/* 工具栏 */}
      <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={handleAdd}
            style={{ height: 32, padding: '0 16px', borderRadius: 4, border: 'none', background: '#1663c4', color: '#fff', fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon name="plus" size={13} /> 新增
          </button>
          <button onClick={handleBatchDelete}
            style={{ height: 32, padding: '0 16px', borderRadius: 4, border: '1px solid #ff4d4f', background: '#fff', color: '#ff4d4f', fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon name="delete" size={13} /> 删除
          </button>
          <button onClick={handleBatchApprove}
            style={{ height: 32, padding: '0 16px', borderRadius: 4, border: '1px solid #52c41a', background: '#fff', color: '#52c41a', fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon name="check" size={13} /> 审核通过
          </button>
          <button onClick={handleBatchReject}
            style={{ height: 32, padding: '0 16px', borderRadius: 4, border: '1px solid #faad14', background: '#fff', color: '#faad14', fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            审核不通过
          </button>
        </div>
        <div style={{ fontSize: 13, color: '#8c8c8c' }}>
          {selectedRows.length > 0 && <span>已选择 {selectedRows.length} 项</span>}
        </div>
      </div>

      {/* 数据表格 */}
      <div style={{ border: '1px solid #e8e8e8', borderRadius: 4, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#fafafa' }}>
              <th style={{ padding: '12px 8px', textAlign: 'left', borderBottom: '1px solid #e8e8e8', width: 40 }}>
                <input type="checkbox" checked={data.length > 0 && selectedRows.length === data.length}
                  onChange={e => handleSelectAll(e.target.checked)} style={{ cursor: 'pointer' }} />
              </th>
              <th style={{ padding: '12px 8px', textAlign: 'left', borderBottom: '1px solid #e8e8e8', width: 50 }}>序号</th>
              <th style={{ padding: '12px 8px', textAlign: 'left', borderBottom: '1px solid #e8e8e8' }}>费用名称</th>
              <th style={{ padding: '12px 8px', textAlign: 'left', borderBottom: '1px solid #e8e8e8' }}>结算主体</th>
              <th style={{ padding: '12px 8px', textAlign: 'left', borderBottom: '1px solid #e8e8e8' }}>结算流向</th>
              <th style={{ padding: '12px 8px', textAlign: 'left', borderBottom: '1px solid #e8e8e8' }}>收入机构</th>
              <th style={{ padding: '12px 8px', textAlign: 'left', borderBottom: '1px solid #e8e8e8' }}>支出机构</th>
              <th style={{ padding: '12px 8px', textAlign: 'left', borderBottom: '1px solid #e8e8e8' }}>账单节点</th>
              <th style={{ padding: '12px 8px', textAlign: 'left', borderBottom: '1px solid #e8e8e8' }}>结算节点</th>
              <th style={{ padding: '12px 8px', textAlign: 'left', borderBottom: '1px solid #e8e8e8' }}>生效日期</th>
              <th style={{ padding: '12px 8px', textAlign: 'left', borderBottom: '1px solid #e8e8e8' }}>失效日期</th>
              <th style={{ padding: '12px 8px', textAlign: 'left', borderBottom: '1px solid #e8e8e8' }}>备注</th>
              <th style={{ padding: '12px 8px', textAlign: 'left', borderBottom: '1px solid #e8e8e8' }}>审核状态</th>
              <th style={{ padding: '12px 8px', textAlign: 'left', borderBottom: '1px solid #e8e8e8' }}>创建人</th>
              <th style={{ padding: '12px 8px', textAlign: 'left', borderBottom: '1px solid #e8e8e8' }}>创建时间</th>
              <th style={{ padding: '12px 8px', textAlign: 'left', borderBottom: '1px solid #e8e8e8' }}>修改人</th>
              <th style={{ padding: '12px 8px', textAlign: 'left', borderBottom: '1px solid #e8e8e8' }}>修改时间</th>
              <th style={{ padding: '12px 8px', textAlign: 'left', borderBottom: '1px solid #e8e8e8' }}>审核人</th>
              <th style={{ padding: '12px 8px', textAlign: 'left', borderBottom: '1px solid #e8e8e8' }}>审核时间</th>
              <th style={{ padding: '12px 8px', textAlign: 'left', borderBottom: '1px solid #e8e8e8' }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={16} style={{ padding: 40, textAlign: 'center', color: '#8c8c8c' }}>加载中...</td></tr>
            ) : data.length === 0 ? (
              <tr><td colSpan={16} style={{ padding: 40, textAlign: 'center', color: '#8c8c8c' }}>暂无数据</td></tr>
            ) : data.map((row, index) => (
              <tr key={row.id} style={{ background: selectedRows.some(r => r.id === row.id) ? '#e6f4ff' : '#fff' }}>
                <td style={{ padding: '12px 8px', borderBottom: '1px solid #e8e8e8' }}>
                  <input type="checkbox" checked={selectedRows.some(r => r.id === row.id)}
                    onChange={e => handleSelectRow(row, e.target.checked)} style={{ cursor: 'pointer' }} />
                </td>
                <td style={{ padding: '12px 8px', borderBottom: '1px solid #e8e8e8' }}>{index + 1 + (page - 1) * pageSize}</td>
                <td style={{ padding: '12px 8px', borderBottom: '1px solid #e8e8e8' }}>
                {row.fee_code ? `${row.fee_code} - ${row.fee_name}` : row.fee_name}
              </td>
                <td style={{ padding: '12px 8px', borderBottom: '1px solid #e8e8e8' }}>{row.settlement_subject}</td>
                <td style={{ padding: '12px 8px', borderBottom: '1px solid #e8e8e8' }}>{row.settlement_flow}</td>
                <td style={{ padding: '12px 8px', borderBottom: '1px solid #e8e8e8' }}>{row.income_org}</td>
                <td style={{ padding: '12px 8px', borderBottom: '1px solid #e8e8e8' }}>{row.expense_org}</td>
                <td style={{ padding: '12px 8px', borderBottom: '1px solid #e8e8e8' }}>{row.bill_node}</td>
                <td style={{ padding: '12px 8px', borderBottom: '1px solid #e8e8e8' }}>{row.settlement_node}</td>
                <td style={{ padding: '12px 8px', borderBottom: '1px solid #e8e8e8' }}>{row.start_date ? row.start_date.split('T')[0] : '-'}</td>
                <td style={{ padding: '12px 8px', borderBottom: '1px solid #e8e8e8' }}>{row.end_date ? row.end_date.split('T')[0] : '-'}</td>
                <td style={{ padding: '12px 8px', borderBottom: '1px solid #e8e8e8', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.remark || '-'}</td>
                <td style={{ padding: '12px 8px', borderBottom: '1px solid #e8e8e8' }}>{renderStatus(row.status)}</td>
                <td style={{ padding: '12px 8px', borderBottom: '1px solid #e8e8e8' }}>{row.creator}</td>
                <td style={{ padding: '12px 8px', borderBottom: '1px solid #e8e8e8' }}>{formatDateTime(row.create_time)}</td>
                <td style={{ padding: '12px 8px', borderBottom: '1px solid #e8e8e8' }}>{row.updater && row.updater !== row.creator ? row.updater : '-'}</td>
                <td style={{ padding: '12px 8px', borderBottom: '1px solid #e8e8e8' }}>{row.updater && row.updater !== row.creator && row.update_time ? formatDateTime(row.update_time) : '-'}</td>
                <td style={{ padding: '12px 8px', borderBottom: '1px solid #e8e8e8' }}>{row.audit_person || '-'}</td>
                <td style={{ padding: '12px 8px', borderBottom: '1px solid #e8e8e8' }}>{row.audit_time ? formatDateTime(row.audit_time) : '-'}</td>
                <td style={{ padding: '12px 8px', borderBottom: '1px solid #e8e8e8' }}>
                  <button onClick={() => handleEdit(row)} style={{ padding: '4px 8px', border: '1px solid #1663c4', borderRadius: 4, background: '#fff', color: '#1663c4', fontSize: 12, cursor: 'pointer', marginRight: 4 }}>编辑</button>
                  <button onClick={() => handleDelete(row)} style={{ padding: '4px 8px', border: '1px solid #ff4d4f', borderRadius: 4, background: '#fff', color: '#ff4d4f', fontSize: 12, cursor: 'pointer' }}>删除</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 分页 */}
      <div style={{ marginTop: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 13, color: '#595959' }}>
          共 {total} 条记录，每页
          <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}
            style={{ margin: '0 8px', height: 28, padding: '0 8px', borderRadius: 4, border: '1px solid #d9d9d9', fontSize: 13 }}>
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={50}>50</option>
          </select>
          条
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
            style={{ padding: '4px 12px', borderRadius: 4, border: '1px solid #d9d9d9', background: '#fff', fontSize: 13, cursor: page === 1 ? 'not-allowed' : 'pointer', color: page === 1 ? '#d9d9d9' : '#595959' }}>上一页</button>
          <span style={{ padding: '4px 12px', fontSize: 13 }}>第 {page} / {Math.ceil(total / pageSize) || 1} 页</span>
          <button onClick={() => setPage(p => Math.min(Math.ceil(total / pageSize) || 1, p + 1))} disabled={page >= Math.ceil(total / pageSize) || total === 0}
            style={{ padding: '4px 12px', borderRadius: 4, border: '1px solid #d9d9d9', background: '#fff', fontSize: 13, cursor: page >= Math.ceil(total / pageSize) || total === 0 ? 'not-allowed' : 'pointer', color: page >= Math.ceil(total / pageSize) || total === 0 ? '#d9d9d9' : '#595959' }}>下一页</button>
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
                    {feeTypes.map(v => <option key={v.id} value={v.feeName}>{v.feeCode} - {v.feeName}</option>)}
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
                style={{ padding: '8px 24px', borderRadius: 4, border: 'none', background: loading ? '#73b3ff' : '#1663c4', fontSize: 13, cursor: loading ? 'not-allowed' : 'pointer', color: '#fff' }}>
                {loading ? '提交中...' : '确定'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
