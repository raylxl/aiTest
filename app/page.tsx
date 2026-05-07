'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { getSession, setSession, clearSession, validateUsername, validatePassword, validateNickname, getAvatarColor, type Session } from '@/lib/auth';
import type { FeeItem, QueryForm, MenuItem } from './components/types';
import FeeTable from './components/FeeTable';
import Icon from './components/Icon';
import FeeRulesTable from './components/FeeRulesTable';
import WaybillTable from './components/WaybillTable';
import UniversalImport from './components/UniversalImport';

// ============ 招财猫占位页 ============
function MenuPlaceholder({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      minHeight: 400, position: 'relative', overflow: 'hidden',
      background: 'radial-gradient(ellipse at center, #f0f5ff 0%, #e8f0fe 50%, #eff2f5 100%)',
    }}>
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 50% 55%, rgba(0,190,190,0.08) 0%, transparent 65%)', pointerEvents: 'none' }} />
      {/* 旋转金币 */}
      {[...Array(8)].map((_, i) => (
        <div key={`coin-${i}`} style={{
          position: 'absolute',
          width: 36, height: 36, borderRadius: '50%', border: '3px solid #faad14',
          background: 'linear-gradient(135deg, #fffbe6 0%, #ffe566 50%, #faad14 100%)',
          boxShadow: '0 2px 8px rgba(250,173,20,0.3)',
          left: `${50 + 38 * Math.cos((i * 45) * Math.PI / 180)}%`,
          top: `${55 + 38 * Math.sin((i * 45) * Math.PI / 180)}%`,
          animation: `coinPulse 3s ease-in-out ${i * 0.3}s infinite`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1,
        }}>
          <span style={{ fontSize: 14, fontWeight: 800, color: '#d48806', fontFamily: 'serif' }}>福</span>
        </div>
      ))}
      {/* 招财猫 */}
      <div style={{ position: 'relative', width: 200, height: 240, animation: 'catFloat 3s ease-in-out infinite', zIndex: 2 }}>
        {/* 头 */}
        <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', width: 140, height: 120, borderRadius: '50% 50% 45% 45%', background: 'linear-gradient(145deg, #fff9f0 0%, #ffe5c0 60%, #ffd080 100%)', border: '3px solid #e8a830', boxShadow: '0 4px 16px rgba(232,168,48,0.25)', zIndex: 3 }}>
          {[-1, 1].map(s => <div key={s} style={{ position: 'absolute', top: -12, [s === -1 ? 'left' : 'right']: 10, width: 0, height: 0, borderLeft: '18px solid transparent', borderRight: '18px solid transparent', borderBottom: `30px solid #ffe5c0` }} />)}
          {[-1, 1].map(s => <div key={s} style={{ position: 'absolute', top: 40, [s === -1 ? 'left' : 'right']: 28, width: 20, height: 22, borderRadius: '50%', background: '#1a1a1a', overflow: 'hidden' }}><div style={{ position: 'absolute', top: 3, [s === -1 ? 'right' : 'left']: 3, width: 8, height: 8, borderRadius: '50%', background: '#fff' }} /></div>)}
          <div style={{ position: 'absolute', top: 68, left: '50%', transform: 'translateX(-50%)', width: 12, height: 10, borderRadius: '50% 50% 40% 40%', background: '#e87070' }} />
          <div style={{ position: 'absolute', top: 76, left: '50%', transform: 'translateX(-50%)', width: 24, height: 12, borderRadius: '0 0 12px 12px', borderLeft: '2px solid #e87070', borderRight: '2px solid #e87070', borderBottom: '2px solid #e87070', background: 'transparent' }} />
          {[-1, 1].map(s => <div key={s} style={{ position: 'absolute', top: 72, [s === -1 ? 'left' : 'right']: 4, width: 28, height: 2, borderRadius: 1, background: '#d4a030', transform: `rotate(${s * 15}deg)` }} />)}
        </div>
        {/* 项圈+铃铛 */}
        <div style={{ position: 'absolute', top: 110, left: '50%', transform: 'translateX(-50%)', width: 120, height: 16, borderRadius: 8, background: '#e74c3c', zIndex: 4, boxShadow: '0 2px 6px rgba(231,76,60,0.3)' }} />
        <div style={{ position: 'absolute', top: 115, left: '50%', transform: 'translateX(-50%)', width: 14, height: 14, borderRadius: '50%', background: '#ffd700', border: '2px solid #e8a830', boxShadow: '0 0 8px rgba(255,215,0,0.5)', zIndex: 5, animation: 'bellRing 1s ease-in-out infinite' }} />
        {/* 身体 */}
        <div style={{ position: 'absolute', top: 115, left: '50%', transform: 'translateX(-50%)', width: 160, height: 130, borderRadius: '20px 20px 40px 40px', background: 'linear-gradient(145deg, #fff9f0 0%, #ffe5c0 100%)', border: '3px solid #e8a830', boxShadow: '0 4px 12px rgba(232,168,48,0.2)', zIndex: 2 }}>
          <div style={{ position: 'absolute', top: 15, left: '50%', transform: 'translateX(-50%)', width: 100, height: 90, borderRadius: '50% 50% 40px 40px', background: '#fff5e0', border: '2px solid #e8a830' }} />
          <div style={{ position: 'absolute', top: 30, left: '50%', transform: 'translateX(-50%)', fontSize: 18, fontWeight: 800, color: '#c0392b', fontFamily: '"SimSun", serif', letterSpacing: 2, whiteSpace: 'nowrap', textShadow: '0 1px 2px rgba(0,0,0,0.1)' }}>招财进宝</div>
        </div>
        {/* 左臂（摆动） */}
        <div style={{ position: 'absolute', top: 125, left: -5, width: 50, height: 55, borderRadius: '25px 10px 10px 25px', background: 'linear-gradient(145deg, #ffe5c0 0%, #ffd080 100%)', border: '3px solid #e8a830', transformOrigin: 'top right', animation: 'leftArmWave 0.8s ease-in-out infinite', zIndex: 1 }}>
          <div style={{ position: 'absolute', bottom: 8, left: 5, width: 18, height: 14, borderRadius: '50%', background: '#ffb3b3' }} />
        </div>
        {/* 右臂（举起） */}
        <div style={{ position: 'absolute', top: 120, right: -5, width: 50, height: 60, borderRadius: '10px 25px 25px 10px', background: 'linear-gradient(145deg, #ffe5c0 0%, #ffd080 100%)', border: '3px solid #e8a830', transform: 'rotate(-25deg)', transformOrigin: 'top left', animation: 'rightArmUp 0.8s ease-in-out infinite', zIndex: 5 }}>
          <div style={{ position: 'absolute', bottom: 8, right: 5, width: 18, height: 14, borderRadius: '50%', background: '#ffb3b3' }} />
        </div>
        {/* 金币撒出 */}
        <div style={{ position: 'absolute', top: 60, right: -25, width: 22, height: 22, borderRadius: '50%', background: 'linear-gradient(135deg, #ffe566 0%, #faad14 100%)', border: '2px solid #d48806', boxShadow: '0 2px 6px rgba(250,173,20,0.4)', animation: 'coinThrow 2s ease-in-out infinite', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: 10, fontWeight: 800, color: '#c0392b', fontFamily: 'serif' }}>福</span>
        </div>
        <div style={{ position: 'absolute', top: 85, right: -35, width: 18, height: 18, borderRadius: '50%', background: 'linear-gradient(135deg, #ffe566 0%, #faad14 100%)', border: '2px solid #d48806', animation: 'coinThrow2 2s ease-in-out 0.4s infinite', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: 8, fontWeight: 800, color: '#c0392b', fontFamily: 'serif' }}>宝</span>
        </div>
      </div>
      {/* 标题 */}
      <div style={{ textAlign: 'center', marginTop: 32, zIndex: 2 }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: '#00BEBE', letterSpacing: 4, marginBottom: 8, textShadow: '0 2px 8px rgba(0,190,190,0.2)' }}>{title}</div>
        {subtitle && <div style={{ fontSize: 13, color: '#8c8c8c', letterSpacing: 1 }}>{subtitle}</div>}
      </div>
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 4, background: 'linear-gradient(90deg, transparent, #ffd700, #ffd700, transparent)', opacity: 0.6 }} />
      <style>{`
        @keyframes catFloat { 0%, 100% { transform: translateY(0px); } 50% { transform: translateY(-12px); } }
        @keyframes leftArmWave { 0%, 100% { transform: rotate(0deg); } 50% { transform: rotate(-35deg); } }
        @keyframes rightArmUp { 0%, 100% { transform: rotate(-25deg); } 50% { transform: rotate(-55deg); } }
        @keyframes coinThrow { 0% { opacity: 0; transform: translate(0,0) scale(0.5); } 20% { opacity: 1; transform: translate(10px,-20px) scale(1); } 80% { opacity: 1; transform: translate(30px,-60px) scale(1); } 100% { opacity: 0; transform: translate(40px,-80px) scale(0.5); } }
        @keyframes coinThrow2 { 0% { opacity: 0; transform: translate(0,0) scale(0.5); } 20% { opacity: 1; transform: translate(-5px,-25px) scale(1); } 80% { opacity: 1; transform: translate(-20px,-65px) scale(1); } 100% { opacity: 0; transform: translate(-30px,-85px) scale(0.5); } }
        @keyframes bellRing { 0%, 100% { transform: translateX(-50%) rotate(0deg); } 25% { transform: translateX(-50%) rotate(10deg); } 75% { transform: translateX(-50%) rotate(-10deg); } }
        @keyframes coinPulse { 0%, 100% { opacity: 0.3; transform: scale(0.9); } 50% { opacity: 0.8; transform: scale(1.1); } }
      `}</style>
    </div>
  );
}

// ============ 菜单名称映射 ============
const MENU_ITEM_MAP: Record<string, { title: string; subtitle?: string }> = {
  home: { title: '首页', subtitle: '欢迎使用中通冷链管理系统' },
  fence: { title: '网点围栏管理' }, 'fence-audit': { title: '围栏审核管理' }, 'outlet-new': { title: '新营业网点' }, 'sales-fence': { title: '业务员围栏' }, 'biz-config': { title: '业务配置' }, 'biz-dict': { title: '业务字典' },
  'base-price': { title: '基础报价' }, 'price-manage': { title: '价格管理' }, 'trans-ops': { title: '运营运输管理' }, 'freight-bill': { title: '账单管理' }, 'ops-manage': { title: '运营操作管理' }, handover: { title: '出港交接单' }, 'it-center': { title: 'IT管理中心' }, 'data-monitor': { title: '数据监控' }, 'cl-report': { title: '仓链报表' }, 'ty-bigdata': { title: '天易大数据平台' }, 'base-quote': { title: '基础报价' }, 'price-ctrl': { title: '价格管理' },
  attend: { title: '考勤管理' }, 'attend-stat': { title: '考勤统计' }, replenish: { title: '补卡申请' }, leave: { title: '请假申请' }, field: { title: '外勤管理' },
  'pda-ops': { title: 'PDA操作管理' }, 'service-quality': { title: '服务质量' }, 'cl-refactor': { title: '仓链重构' }, 'cl-app': { title: '中通冷链业务员APP（鲸小宝）' },
  oms: { title: 'OMS订单中心' }, workbench: { title: '工作台' }, 'quality-platform': { title: '服务质量平台' }, 'test-007': { title: '测试007' }, 'test-sub2': { title: '测试二级目录2' },
  warehouse: { title: '仓储中心' }, project: { title: '项目管理' }, 'finance-platform': { title: '财务中台' }, 'more-tenant': { title: '更多租户' }, 'data-alert': { title: '数据预警' },
  'user-center': { title: '用户中心' }, 'app-set': { title: '应用设置' }, 'app-btn': { title: '应用按钮' }, 'menu-ctrl': { title: '菜单管理' }, tenant: { title: '租户管理' }, 'tenant-id': { title: '租户身份' }, org: { title: '组织管理' }, role: { title: '角色管理' }, staff: { title: '员工管理' }, 'user-ctrl': { title: '用户管理' }, post: { title: '岗位管理' }, 'post-role': { title: '岗位角色权限管理' }, 'task-center': { title: '任务中心' }, 'export-tpl': { title: '导出模板设置' }, 'export-task': { title: '导出任务' }, 'ext-test': { title: '外链测试' },
  base: { title: '基础管理' }, 'net-freight': { title: '网络货运' }, 'freight-finance': { title: '货运财务管理' }, waybill: { title: '运单管理' }, 'cl-price': { title: '仓链报价管理' }, 'smart-office': { title: '智能办公' }, 'biz-center': { title: '经营管理中心' }, 'cl-workbench': { title: '仓链重构' }, 'freight-net': { title: '网络货运' }, system: { title: '系统管理' },
  'fee-rules': { title: '费用规则维护' },
  'ai-exam-20260507': { title: '20260507' },
  'universal-import': { title: '万能导入' },
};

// ============ SVG 图标 ============
// Icon 已提取到 ./components/Icon.tsx

// ============ 菜单数据 ============
const MENU_DATA: MenuItem[] = [
  { key: 'home', label: '首页', icon: 'home' },
  { key: 'cl-finance', label: '冷链财务管理', icon: 'wallet', children: [
    { key: 'cl-finance-base', label: '基础数据', icon: 'office', children: [
      { key: 'fee-type-cc', label: '费用类型维护', icon: 'priceTag' },
      { key: 'fee-rules', label: '费用规则维护', icon: 'priceTag' },
    ]},
  ]},
  { key: 'waybill', label: '已导入运单', icon: 'truck' },
  { key: 'ai-exam', label: 'AI考试', icon: 'exam', children: [
    { key: 'ai-exam-20260507', label: '20260507', icon: 'document', children: [
      { key: 'universal-import', label: '万能导入', icon: 'upload' },
    ]},
  ]},
  { key: 'system', label: '系统管理', icon: 'setting', children: [
    { key: 'user-center', label: '用户中心' }, { key: 'app-set', label: '应用设置' }, { key: 'app-btn', label: '应用按钮' },
    { key: 'menu-ctrl', label: '菜单管理' }, { key: 'tenant', label: '租户管理' }, { key: 'tenant-id', label: '租户身份' },
    { key: 'org', label: '组织管理' }, { key: 'role', label: '角色管理' }, { key: 'staff', label: '员工管理' },
    { key: 'user-ctrl', label: '用户管理' }, { key: 'post', label: '岗位管理' }, { key: 'post-role', label: '岗位角色权限管理' },
    { key: 'task-center', label: '任务中心' }, { key: 'export-tpl', label: '导出模板设置' }, { key: 'export-task', label: '导出任务' },
    { key: 'ext-test', label: '外链测试' },
  ]},
];

// 隐藏的菜单项（不在侧边栏展示，但数据保留方便后续恢复）
const HIDDEN_MENUS = [
  'base', 'biz-center', 'oms', 'cl-workbench', 'warehouse', 'cl-bill', 'freight-net', 'data-alert',
];

// ============ 菜单项组件 ============
function MenuItemEl({ item, activeMenu, collapsed, expandedKeys, depth = 0, onSelect, onToggle }: {
  item: MenuItem; activeMenu: string; collapsed: boolean; expandedKeys: Set<string>;
  depth?: number; onSelect: (key: string) => void; onToggle: (key: string) => void;
}) {
  const hasChildren = item.children && item.children.length > 0;
  const isActive = activeMenu === item.key;
  const isExpanded = expandedKeys.has(item.key);
  const paddingLeft = depth === 0 ? 16 : depth === 1 ? 32 : 44;
  const fontSize = 13;
  const itemHeight = 40;

  const itemStyle = (extra?: Record<string, string>) => ({
    height: itemHeight, display: 'flex', alignItems: 'center',
    padding: `0 16px 0 ${paddingLeft}px`, cursor: 'pointer', fontSize,
    fontWeight: isActive || isExpanded ? 500 : 400,
    color: isActive ? '#fff' : depth === 0 ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.65)',
    background: isActive ? 'linear-gradient(to right, rgba(0,185,185,0.35), rgba(0,0,0,0))' : 'transparent',
    borderLeft: isActive ? '3px solid rgb(0,185,185)' : '3px solid transparent',
    transition: 'background 0.12s', whiteSpace: 'nowrap' as const, overflow: 'hidden' as const,
    ...extra,
  });

  if (depth === 0) {
    if (!hasChildren) {
      return (
        <div onClick={() => onSelect(item.key)} style={itemStyle()} onMouseEnter={e => { if (!isActive) { const s = e.currentTarget.style; s.background = 'rgba(255,255,255,0.08)'; } }} onMouseLeave={e => { if (!isActive) { const s = e.currentTarget.style; s.background = 'transparent'; } }}>
          {item.icon && <span style={{ marginRight: 8, color: isActive ? 'rgb(0,185,185)' : '#8c8c8c', flexShrink: 0 }}><Icon name={item.icon} size={14} /></span>}
          {!collapsed && <span>{item.label}</span>}
        </div>
      );
    }
    return (
      <div>
        <div onClick={() => onToggle(item.key)} style={itemStyle()} onMouseEnter={e => { if (!isActive && !isExpanded) { const s = e.currentTarget.style; s.background = 'rgba(255,255,255,0.08)'; } }} onMouseLeave={e => { if (!isActive && !isExpanded) { const s = e.currentTarget.style; s.background = 'transparent'; } }}>
          {item.icon && <span style={{ marginRight: 8, color: isActive || isExpanded ? 'rgb(0,185,185)' : '#8c8c8c', flexShrink: 0 }}><Icon name={item.icon} size={14} /></span>}
          {!collapsed && <><span style={{ flex: 1 }}>{item.label}</span><span style={{ fontSize: 10, color: isExpanded ? 'rgb(0,185,185)' : '#bfbfbf', marginLeft: 4, transition: 'transform 0.15s', transform: isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)', display: 'inline-block', width: 10, textAlign: 'center' }}>▼</span></>}
        </div>
        {!collapsed && isExpanded && item.children && (
          <div style={{ background: '#00203a' }}>
            {item.children.map(child => <MenuItemEl key={child.key} item={child} activeMenu={activeMenu} collapsed={collapsed} expandedKeys={expandedKeys} depth={1} onSelect={onSelect} onToggle={onToggle} />)}
          </div>
        )}
      </div>
    );
  }

  if (!hasChildren) {
    return (
      <div onClick={() => onSelect(item.key)} style={itemStyle({ borderLeft: isActive ? '3px solid rgb(0,185,185)' : '3px solid transparent' })} onMouseEnter={e => { if (!isActive) { const s = e.currentTarget.style; s.background = 'rgba(255,255,255,0.06)'; } }} onMouseLeave={e => { if (!isActive) { const s = e.currentTarget.style; s.background = 'transparent'; } }}>
        {item.icon && <span style={{ marginRight: 8, color: isActive ? 'rgb(0,185,185)' : '#8c8c8c', flexShrink: 0 }}><Icon name={item.icon} size={13} /></span>}
        <span>{item.label}</span>
      </div>
    );
  }

  return (
    <div>
      <div onClick={() => onToggle(item.key)} style={itemStyle()} onMouseEnter={e => { if (!isActive && !isExpanded) { const s = e.currentTarget.style; s.background = 'rgba(255,255,255,0.06)'; } }} onMouseLeave={e => { if (!isActive && !isExpanded) { const s = e.currentTarget.style; s.background = 'transparent'; } }}>
        {item.icon && <span style={{ marginRight: 8, color: isActive || isExpanded ? 'rgb(0,185,185)' : 'rgba(255,255,255,0.5)', flexShrink: 0 }}><Icon name={item.icon} size={13} /></span>}
        <span style={{ flex: 1 }}>{item.label}</span>
        <span style={{ fontSize: 10, color: isExpanded ? 'rgb(0,185,185)' : 'rgba(255,255,255,0.35)', marginLeft: 4, transition: 'transform 0.15s', transform: isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)', display: 'inline-block', width: 10, textAlign: 'center' }}>▼</span>
      </div>
        {!collapsed && isExpanded && item.children && (
          <div style={{ background: '#001a2e' }}>
          {item.children.map(child => <MenuItemEl key={child.key} item={child} activeMenu={activeMenu} collapsed={collapsed} expandedKeys={expandedKeys} depth={2} onSelect={onSelect} onToggle={onToggle} />)}
        </div>
      )}
    </div>
  );
}

// ============ 主组件 ============
export default function FeeManager() {
  const [collapsed, setCollapsed] = useState(false);
  const [activeMenu, setActiveMenu] = useState('universal-import');
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set(['cl-finance', 'cl-finance-base', 'ai-exam', 'ai-exam-20260507']));
  const [data, setData] = useState<FeeItem[]>([]);
  const [selectedRows, setSelectedRows] = useState<FeeItem[]>([]);
  const [query, setQuery] = useState<QueryForm>({ feeCode: '', feeName: '', businessDomain: '', priceType: '' });
  const [dialogVisible, setDialogVisible] = useState(false);
  const [dialogTitle, setDialogTitle] = useState('新增费用类型');
  const [editRow, setEditRow] = useState<FeeItem | null>(null);
  const [form, setForm] = useState<{ feeCode: string; feeName: string; businessDomain: string; priceTypes: string[]; remark: string }>({ feeCode: '', feeName: '', businessDomain: '运配', priceTypes: [], remark: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState('');
  const [msg, setMsg] = useState<{ text: string; type: string } | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [userDropdown, setUserDropdown] = useState(false);
  const [currentUser, setCurrentUser] = useState<Session | null>(null);
  const [loginModalVisible, setLoginModalVisible] = useState(false);
  const [registerModalVisible, setRegisterModalVisible] = useState(false);
  const [authMsg, setAuthMsg] = useState<{ text: string; type: string } | null>(null);
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [registerForm, setRegisterForm] = useState({ username: '', nickname: '', password: '', confirmPassword: '' });
  const [authErrors, setAuthErrors] = useState<Record<string, string>>({});
  const [authLoading, setAuthLoading] = useState(false);
  const authDropdownRef = useRef<HTMLDivElement>(null);

  // 动态更新页签标题
  useEffect(() => {
    const title = MENU_ITEM_MAP[activeMenu]?.title || '首页';
    document.title = title;
  }, [activeMenu]);

  const fetchData = useCallback(async () => {
    setLoading(true); setFetchError('');
    try {
      const res = await fetch('/api/fees');
      const json = await res.json();
      if (json.error) setFetchError(json.error);
      else if (json.data) setData(json.data.map((r: Record<string, unknown>) => ({ id: Number(r.id), feeCode: String(r.fee_code), feeName: String(r.fee_name), businessDomain: String(r.business_domain), priceTypes: Array.isArray(r.price_types) ? (r.price_types as unknown[]).map(String) : [], remark: String(r.remark ?? ''), creator: String(r.creator), createTime: String(r.create_time), updater: String(r.updater), updateTime: String(r.update_time) })));
    } catch { setFetchError('网络请求失败'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { const s = getSession(); setCurrentUser(s); fetchData(); }, [fetchData]);

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (authDropdownRef.current && !authDropdownRef.current.contains(e.target as Node)) setUserDropdown(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleLogout = () => { clearSession(); setCurrentUser(null); setUserDropdown(false); };

  const handleLoginSubmit = async () => {
    const errs: Record<string, string> = {};
    const uErr = validateUsername(loginForm.username);
    const pErr = validatePassword(loginForm.password);
    if (uErr) errs.username = uErr;
    if (pErr) errs.password = pErr;
    setAuthErrors(errs);
    if (Object.keys(errs).length > 0) return;
    setAuthLoading(true);
    try {
      const res = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(loginForm) });
      const json = await res.json();
      if (res.ok && json.ok) {
        const session: Session = { userId: json.user.id, username: json.user.username, nickname: json.user.nickname, role: json.user.role, loginTime: new Date().toISOString() };
        setSession(session); setCurrentUser(session); setLoginModalVisible(false);
        setAuthMsg({ text: `欢迎回来，${session.nickname}！`, type: 'success' });
        setTimeout(() => setAuthMsg(null), 3000);
        setLoginForm({ username: '', password: '' }); setAuthErrors({});
      } else {
        setAuthMsg({ text: json.error || '登录失败', type: 'error' });
        setTimeout(() => setAuthMsg(null), 3000);
      }
    } finally { setAuthLoading(false); }
  };

  const handleRegisterSubmit = async () => {
    const errs: Record<string, string> = {};
    const uErr = validateUsername(registerForm.username);
    const nErr = validateNickname(registerForm.nickname);
    const pErr = validatePassword(registerForm.password);
    if (uErr) errs.username = uErr;
    if (nErr) errs.nickname = nErr;
    if (pErr) errs.password = pErr;
    if (registerForm.password !== registerForm.confirmPassword) errs.confirmPassword = '两次密码不一致';
    setAuthErrors(errs);
    if (Object.keys(errs).length > 0) return;
    setAuthLoading(true);
    try {
      const res = await fetch('/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: registerForm.username, nickname: registerForm.nickname || registerForm.username, password: registerForm.password }) });
      const json = await res.json();
      if (res.ok && json.ok) {
        const session: Session = { userId: json.user.id, username: json.user.username, nickname: json.user.nickname, role: json.user.role, loginTime: new Date().toISOString() };
        setSession(session); setCurrentUser(session); setRegisterModalVisible(false);
        setAuthMsg({ text: `注册成功，欢迎 ${session.nickname}！`, type: 'success' });
        setTimeout(() => setAuthMsg(null), 3000);
        setRegisterForm({ username: '', nickname: '', password: '', confirmPassword: '' }); setAuthErrors({});
      } else {
        setAuthMsg({ text: json.error || '注册失败', type: 'error' });
        setTimeout(() => setAuthMsg(null), 3000);
      }
    } finally { setAuthLoading(false); }
  };

  const handleToggle = (key: string) => {
    setExpandedKeys(prev => { const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  };

  const handleSelect = (key: string) => {
    setActiveMenu(key);
    for (const menu of MENU_DATA) {
      if (menu.children) {
        for (const child of menu.children) {
          if (child.key === key) setExpandedKeys(prev => new Set([...prev, menu.key]));
          if (child.children) for (const gc of child.children) {
            if (gc.key === key) setExpandedKeys(prev => new Set([...prev, menu.key, child.key]));
          }
        }
      }
    }
  };

  const currentNickname = currentUser?.nickname || '匿名用户';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", sans-serif', background: 'rgb(243,249,254)' }}>
      {/* 顶部导航 — 鲸天系统渐变顶栏 */}
      <header style={{ background: 'linear-gradient(90deg, rgb(1,190,190) 0%, rgb(0,77,114) 100%)', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', boxShadow: '0 1px 4px rgba(0,21,41,.25)', flexShrink: 0, position: 'relative', zIndex: 200 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={() => setCollapsed(!collapsed)} title={collapsed ? '展开菜单' : '折叠菜单'}
            style={{ background: 'none', border: 'none', color: '#fff', fontSize: 16, cursor: 'pointer', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 4, transition: 'background 0.15s' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.15)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              {collapsed
                ? <path d="M1 2.5h14v1.5H1V2.5zm0 5h14v1.5H1v-1.5zm0 5h14v1.5H1v-1.5z" />
                : <><path d="M0 2.5h1.5v11H0V2.5zm14.5 0v11H16V2.5h-1.5zm-7.25 0h7.25v1.5H7.25V2.5zm0 5h7.25v1.5H7.25V7.5zm0 5h4.5v1.5H7.25v-1.5z" /></>}
            </svg>
          </button>
          {/* 鲸鱼 Logo */}
          <svg width="26" height="26" viewBox="0 0 64 64" fill="none">
            <ellipse cx="32" cy="38" rx="26" ry="18" fill="rgba(255,255,255,0.9)"/>
            <ellipse cx="32" cy="38" rx="20" ry="14" fill="#00BEBE"/>
            <circle cx="24" cy="34" r="3" fill="rgba(255,255,255,0.9)"/>
            <circle cx="23" cy="33" r="1.5" fill="#00BEBE"/>
            <path d="M8 34 Q2 26 10 22 Q18 18 24 26" fill="rgba(255,255,255,0.85)"/>
            <path d="M48 28 Q56 22 58 30 Q58 36 52 32" fill="rgba(255,255,255,0.85)"/>
            <path d="M12 44 Q6 50 12 54 Q20 58 30 54 Q40 58 48 54 Q56 50 50 44" fill="rgba(255,255,255,0.9)"/>
          </svg>
          <span style={{ color: '#fff', fontSize: 14, fontWeight: 600, letterSpacing: 0.5, userSelect: 'none', whiteSpace: 'nowrap' }}>中通冷链</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <button title="消息通知" style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 4, position: 'relative', transition: 'background 0.15s' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.15)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
            <Icon name="bell" size={16} />
            <span style={{ position: 'absolute', top: 5, right: 5, width: 8, height: 8, borderRadius: '50%', background: '#ff4d4f', border: '1.5px solid #1a488a' }} />
          </button>
          <button title="系统设置" style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 4, transition: 'background 0.15s' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.15)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
            <Icon name="gear" size={16} />
          </button>
          <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.3)', margin: '0 4px' }} />
          {currentUser ? (
            <div style={{ position: 'relative' }} ref={authDropdownRef}>
              <div onClick={() => setUserDropdown(!userDropdown)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', padding: '0 8px', borderRadius: 4, height: 32, transition: 'background 0.15s' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.15)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                <div style={{ width: 24, height: 24, borderRadius: '50%', background: currentUser.role === 'admin' ? '#e6f4ff' : getAvatarColor(currentUser.username), color: '#00BEBE', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600, flexShrink: 0 }}>{currentUser.nickname[0].toUpperCase()}</div>
                <span style={{ color: '#fff', fontSize: 13 }}>{currentUser.nickname}</span>
                <Icon name="arrowDown" size={9} />
              </div>
              {userDropdown && (
                <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, background: '#fff', borderRadius: 4, boxShadow: '0 6px 16px rgba(0,0,0,0.15)', border: '1px solid #f0f0f0', minWidth: 180, zIndex: 1000, overflow: 'hidden' }}>
                  <div style={{ padding: '10px 16px', borderBottom: '1px solid #f0f0f0' }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#262626' }}>{currentUser.nickname}</div>
                    <div style={{ fontSize: 12, color: '#8c8c8c', marginTop: 2 }}>@{currentUser.username}</div>
                    <div style={{ marginTop: 4 }}><span style={{ fontSize: 11, padding: '1px 6px', borderRadius: 2, background: currentUser.role === 'admin' ? '#e6f4ff' : '#f5f5f5', color: currentUser.role === 'admin' ? '#00BEBE' : '#595959' }}>{currentUser.role === 'admin' ? '管理员' : '普通用户'}</span></div>
                  </div>
                  {['个人信息', '修改密码'].map(item => (
                    <div key={item} style={{ padding: '9px 16px', fontSize: 13, color: '#262626', cursor: 'pointer', transition: 'background 0.15s' }} onMouseEnter={e => (e.currentTarget.style.background = '#f5f5f5')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>{item}</div>
                  ))}
                  <div style={{ borderTop: '1px solid #f0f0f0' }}>
                    <div onClick={handleLogout} style={{ padding: '9px 16px', fontSize: 13, color: '#ff4d4f', cursor: 'pointer', transition: 'background 0.15s' }} onMouseEnter={e => (e.currentTarget.style.background = '#fff1f0')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>退出登录</div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <button onClick={() => setLoginModalVisible(true)} style={{ height: 28, padding: '0 12px', border: '1px solid rgba(255,255,255,0.5)', borderRadius: 4, background: 'rgba(255,255,255,0.1)', color: '#fff', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit', transition: 'all 0.15s', fontWeight: 500 }}
                onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.background = 'rgba(255,255,255,0.2)'; b.style.borderColor = '#fff'; }}
                onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.background = 'rgba(255,255,255,0.1)'; b.style.borderColor = 'rgba(255,255,255,0.5)'; }}>登录</button>
              <button onClick={() => setRegisterModalVisible(true)} style={{ height: 28, padding: '0 12px', border: 'none', borderRadius: 4, background: '#fff', color: '#00BEBE', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit', transition: 'all 0.15s', fontWeight: 600 }}
                onMouseEnter={e => (e.currentTarget.style.background = '#f0f0f0')}
                onMouseLeave={e => (e.currentTarget.style.background = '#fff')}>注册</button>
            </div>
          )}
        </div>
      </header>

      {/* 主体 */}
      <div style={{ display: 'flex', flex: 1, overflowX: 'auto', overflowY: 'hidden' }}>
        {/* 侧边栏 */}
        <aside style={{ background: '#00263c', borderRight: '1px solid #004466', width: collapsed ? 60 : 220, overflowY: 'auto', overflowX: 'hidden', flexShrink: 0, transition: 'width 0.2s ease', display: 'flex', flexDirection: 'column' }}>
          {collapsed ? (
            <div style={{ padding: '8px 0' }}>
              {MENU_DATA.map(item => (
                <div key={item.key} onClick={() => { if (item.children) { setCollapsed(false); setExpandedKeys(prev => new Set([...prev, item.key])); } handleSelect(item.key); }} title={item.label}
                  style={{ height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: activeMenu === item.key ? '#fff' : 'rgba(255,255,255,0.9)', transition: 'background 0.12s', background: activeMenu === item.key ? 'rgba(0,190,190,0.3)' : 'transparent' }}
                  onMouseEnter={e => { if (activeMenu !== item.key) (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.08)'; }}
                  onMouseLeave={e => { if (activeMenu !== item.key) (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}>
                  {item.icon ? <Icon name={item.icon} size={16} /> : <span style={{ fontSize: 12 }}>{item.label[0]}</span>}
                </div>
              ))}
            </div>
          ) : (
            <div style={{ padding: '4px 0' }}>
              {MENU_DATA.map(item => <MenuItemEl key={item.key} item={item} activeMenu={activeMenu} collapsed={collapsed} expandedKeys={expandedKeys} onSelect={handleSelect} onToggle={handleToggle} />)}
            </div>
          )}
        </aside>

        {/* 主内容区 */}
        <main style={{ flex: 1, overflow: 'auto', padding: '12px 16px 20px', display: 'flex', flexDirection: 'column', gap: 0, minWidth: 0 }}>
          {/* 面包屑 */}
          <div style={{ fontSize: 13, color: '#8c8c8c', display: 'flex', alignItems: 'center', gap: 4, marginBottom: 12, flexShrink: 0 }}>
            <a href="#" style={{ color: '#8c8c8c', textDecoration: 'none' }}>首页</a>
            <span style={{ color: '#d9d9d9', fontSize: 12 }}>/</span>
            {activeMenu === 'ai-exam' ? (
              <><a href="#" style={{ color: '#8c8c8c', textDecoration: 'none' }}>首页</a><span style={{ color: '#d9d9d9', fontSize: 12 }}>/</span><span style={{ color: '#262626' }}>AI考试</span></>
            ) : activeMenu === 'ai-exam-20260507' ? (
              <><a href="#" style={{ color: '#8c8c8c', textDecoration: 'none' }}>首页</a><span style={{ color: '#d9d9d9', fontSize: 12 }}>/</span><a href="#" style={{ color: '#8c8c8c', textDecoration: 'none' }}>AI考试</a><span style={{ color: '#d9d9d9', fontSize: 12 }}>/</span><span style={{ color: '#262626' }}>20260507</span></>
            ) : activeMenu === 'universal-import' ? (
              <><a href="#" style={{ color: '#8c8c8c', textDecoration: 'none' }}>首页</a><span style={{ color: '#d9d9d9', fontSize: 12 }}>/</span><a href="#" style={{ color: '#8c8c8c', textDecoration: 'none' }}>AI考试</a><span style={{ color: '#d9d9d9', fontSize: 12 }}>/</span><a href="#" style={{ color: '#8c8c8c', textDecoration: 'none' }}>20260507</a><span style={{ color: '#d9d9d9', fontSize: 12 }}>/</span><span style={{ color: '#262626' }}>万能导入</span></>
            ) : activeMenu === 'fee-type-cc' ? (
              <><a href="#" style={{ color: '#8c8c8c', textDecoration: 'none' }}>冷链财务管理</a><span style={{ color: '#d9d9d9', fontSize: 12 }}>/</span><a href="#" style={{ color: '#8c8c8c', textDecoration: 'none' }}>基础数据</a><span style={{ color: '#d9d9d9', fontSize: 12 }}>/</span><span style={{ color: '#262626' }}>费用类型维护</span></>
            ) : activeMenu === 'fee-rules' ? (
              <><a href="#" style={{ color: '#8c8c8c', textDecoration: 'none' }}>冷链财务管理</a><span style={{ color: '#d9d9d9', fontSize: 12 }}>/</span><a href="#" style={{ color: '#8c8c8c', textDecoration: 'none' }}>基础数据</a><span style={{ color: '#d9d9d9', fontSize: 12 }}>/</span><span style={{ color: '#262626' }}>费用规则维护</span></>
            ) : activeMenu === 'waybill' ? (
              <><a href="#" style={{ color: '#8c8c8c', textDecoration: 'none' }}>首页</a><span style={{ color: '#d9d9d9', fontSize: 12 }}>/</span><span style={{ color: '#262626' }}>已导入运单</span></>
            ) : <span style={{ color: '#262626' }}>{MENU_ITEM_MAP[activeMenu]?.title || activeMenu}</span>}
          </div>

          {/* 内容卡片 */}
          <div style={{ background: '#fff', borderRadius: 4, flex: 1, border: '1px solid #e4edf7', overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
            {activeMenu === 'fee-type-cc' ? (
              <FeeTable
                data={data} setData={setData} selectedRows={selectedRows} setSelectedRows={setSelectedRows}
                query={query} setQuery={setQuery} dialogVisible={dialogVisible} setDialogVisible={setDialogVisible}
                dialogTitle={dialogTitle} setDialogTitle={setDialogTitle} editRow={editRow} setEditRow={setEditRow}
                form={form} setForm={setForm} errors={errors} setErrors={setErrors}
                loading={loading} setLoading={setLoading} fetchError={fetchError} setFetchError={setFetchError}
                msg={msg} setMsg={setMsg} page={page} setPage={setPage} pageSize={pageSize} setPageSize={setPageSize}
                currentUserNickname={currentNickname} onMessage={(t, y) => { setMsg({ text: t, type: y }); setTimeout(() => setMsg(null), 3000); }}
                fetchData={fetchData}
              />
            ) : activeMenu === 'ai-exam' ? (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 400, padding: '40px 20px', background: 'radial-gradient(ellipse at center, #f0f5ff 0%, #e8f0fe 50%, #eff2f5 100%)' }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>
                  <svg width="64" height="64" viewBox="0 0 1024 1024" fill="none">
                    <circle cx="512" cy="512" r="480" fill="#e8f4fd" />
                    <text x="512" y="580" textAnchor="middle" fontSize="280" fill="#1677ff" fontWeight="bold">AI</text>
                  </svg>
                </div>
                <div style={{ fontSize: 22, fontWeight: 700, color: '#1677ff', marginBottom: 8 }}>AI 考试</div>
                <div style={{ fontSize: 14, color: '#8c8c8c', marginBottom: 32, textAlign: 'center' }}>
                  <div>完整前后端 + 数据库应用部署</div>
                  <div style={{ marginTop: 4 }}>指定平台：Vercel</div>
                </div>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 32 }}>
                  {[
                    { tag: '前后端 + 数据库', color: '#1677ff', bg: '#e6f4ff' },
                    { tag: 'Vercel 部署', color: '#fa541c', bg: '#fff2e8' },
                    { tag: '导入导出 Excel', color: '#52c41a', bg: '#f6ffed' },
                    { tag: 'GitHub / Gitee', color: '#722ed1', bg: '#f9f0ff' },
                  ].map(t => (
                    <span key={t.tag} style={{ padding: '4px 12px', borderRadius: 4, fontSize: 13, fontWeight: 500, color: t.color, background: t.bg, border: `1px solid ${t.color}33` }}>{t.tag}</span>
                  ))}
                </div>
                <div style={{ fontSize: 13, color: '#bfbfbf' }}>节后开考，冲刺备考中 💪</div>
              </div>
            ) : activeMenu === 'ai-exam-20260507' ? (
              <MenuPlaceholder title="20260507" subtitle="AI考试" />
            ) : activeMenu === 'universal-import' ? (
              <UniversalImport />
            ) : activeMenu === 'fee-rules' ? (
              <FeeRulesTable
                currentUserNickname={currentNickname}
                onMessage={(t, y) => { setMsg({ text: t, type: y }); setTimeout(() => setMsg(null), 3000); }}
              />
            ) : activeMenu === 'waybill' ? (
              <WaybillTable
                currentUserNickname={currentNickname}
                onMessage={(t, y) => { setMsg({ text: t, type: y }); setTimeout(() => setMsg(null), 3000); }}
              />
            ) : (
              <MenuPlaceholder title={MENU_ITEM_MAP[activeMenu]?.title || activeMenu} subtitle={MENU_ITEM_MAP[activeMenu]?.subtitle} />
            )}
          </div>
        </main>
      </div>

      {/* 登录弹框 */}
      {loginModalVisible && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={e => { if (e.target === e.currentTarget) setLoginModalVisible(false); }}>
          <div style={{ background: '#fff', borderRadius: 8, width: 400, boxShadow: '0 8px 24px rgba(0,0,0,0.2)', overflow: 'hidden' }}>
            <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #f0f0f0', background: '#00BEBE', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div><div style={{ fontSize: 16, fontWeight: 600, color: '#fff' }}>用户登录</div><div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 2 }}>中通冷链 - 费用管理系统</div></div>
              <button onClick={() => setLoginModalVisible(false)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.8)', fontSize: 18, cursor: 'pointer', padding: 4, lineHeight: 1 }}
                onMouseEnter={e => (e.currentTarget.style.color = '#fff')} onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.8)')}><Icon name="close" size={16} /></button>
            </div>
            {authMsg && <div style={{ margin: '12px 24px 0', padding: '8px 12px', borderRadius: 4, fontSize: 13, background: authMsg.type === 'success' ? '#f6ffed' : '#fff2f0', color: authMsg.type === 'success' ? '#52c41a' : '#ff4d4f', border: `1px solid ${authMsg.type === 'success' ? '#b7eb8f' : '#ffccc7'}` }}>{authMsg.text}</div>}
            <div style={{ padding: '20px 24px 24px' }}>
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 13, color: '#595959', marginBottom: 6, fontWeight: 500 }}>账号</div>
                <input value={loginForm.username} onChange={e => setLoginForm(f => ({ ...f, username: e.target.value }))} onKeyDown={e => e.key === 'Enter' && handleLoginSubmit()} placeholder="请输入账号" autoFocus
                  style={{ width: '100%', height: 36, padding: '0 12px', borderRadius: 4, border: `1px solid ${authErrors.username ? '#ff4d4f' : '#d9d9d9'}`, fontSize: 13, outline: 'none', color: '#262626', background: '#fff', fontFamily: 'inherit', boxSizing: 'border-box', transition: 'border-color 0.15s' }}
                  onFocus={e => (e.target.style.borderColor = authErrors.username ? '#ff4d4f' : '#00BEBE')}
                  onBlur={e => (e.target.style.borderColor = authErrors.username ? '#ff4d4f' : '#d9d9d9')} />
                {authErrors.username && <div style={{ fontSize: 12, color: '#ff4d4f', marginTop: 4 }}>{authErrors.username}</div>}
              </div>
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 13, color: '#595959', marginBottom: 6, fontWeight: 500 }}>密码</div>
                <input type="password" value={loginForm.password} onChange={e => setLoginForm(f => ({ ...f, password: e.target.value }))} onKeyDown={e => e.key === 'Enter' && handleLoginSubmit()} placeholder="请输入密码"
                  style={{ width: '100%', height: 36, padding: '0 12px', borderRadius: 4, border: `1px solid ${authErrors.password ? '#ff4d4f' : '#d9d9d9'}`, fontSize: 13, outline: 'none', color: '#262626', background: '#fff', fontFamily: 'inherit', boxSizing: 'border-box', transition: 'border-color 0.15s' }}
                  onFocus={e => (e.target.style.borderColor = authErrors.password ? '#ff4d4f' : '#00BEBE')}
                  onBlur={e => (e.target.style.borderColor = authErrors.password ? '#ff4d4f' : '#d9d9d9')} />
                {authErrors.password && <div style={{ fontSize: 12, color: '#ff4d4f', marginTop: 4 }}>{authErrors.password}</div>}
              </div>
              <div style={{ marginBottom: 16, padding: '8px 12px', background: '#f5f5f5', borderRadius: 4, fontSize: 12, color: '#8c8c8c' }}><div>管理员账号: <strong style={{ color: '#00BEBE' }}>admin</strong> &nbsp;密码: <strong style={{ color: '#00BEBE' }}>123456</strong></div></div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setLoginModalVisible(false)} style={{ flex: 1, height: 36, border: '1px solid #d9d9d9', borderRadius: 4, background: '#fff', cursor: 'pointer', fontSize: 13, color: '#595959', fontFamily: 'inherit', transition: 'all 0.15s' }}
                  onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor = '#00BEBE'; b.style.color = '#00BEBE'; }}
                  onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor = '#d9d9d9'; b.style.color = '#595959'; }}>取消</button>
                <button onClick={handleLoginSubmit} disabled={authLoading} style={{ flex: 2, height: 36, border: 'none', borderRadius: 4, background: authLoading ? '#80d8d8' : '#00BEBE', color: '#fff', cursor: authLoading ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', transition: 'background 0.15s', boxShadow: '0 2px 0 rgba(0,190,190,0.1)' }}
                  onMouseEnter={e => { if (!authLoading) (e.currentTarget as HTMLButtonElement).style.background = '#00d4d4'; }}
                  onMouseLeave={e => { if (!authLoading) (e.currentTarget as HTMLButtonElement).style.background = '#00BEBE'; }}>
                  {authLoading ? '登录中...' : '登录'}
                </button>
              </div>
              <div style={{ textAlign: 'center', marginTop: 16, fontSize: 13, color: '#8c8c8c' }}>还没有账号？{' '}<span onClick={() => { setLoginModalVisible(false); setRegisterModalVisible(true); }} style={{ color: '#00BEBE', cursor: 'pointer', fontWeight: 500 }}>立即注册</span></div>
            </div>
          </div>
        </div>
      )}

      {/* 注册弹框 */}
      {registerModalVisible && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={e => { if (e.target === e.currentTarget) setRegisterModalVisible(false); }}>
          <div style={{ background: '#fff', borderRadius: 8, width: 420, boxShadow: '0 8px 24px rgba(0,0,0,0.2)', overflow: 'hidden' }}>
            <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #f0f0f0', background: '#00BEBE', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div><div style={{ fontSize: 16, fontWeight: 600, color: '#fff' }}>用户注册</div><div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 2 }}>创建您的费用管理系统账号</div></div>
              <button onClick={() => setRegisterModalVisible(false)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.8)', fontSize: 18, cursor: 'pointer', padding: 4, lineHeight: 1 }}
                onMouseEnter={e => (e.currentTarget.style.color = '#fff')} onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.8)')}><Icon name="close" size={16} /></button>
            </div>
            {authMsg && <div style={{ margin: '12px 24px 0', padding: '8px 12px', borderRadius: 4, fontSize: 13, background: authMsg.type === 'success' ? '#f6ffed' : '#fff2f0', color: authMsg.type === 'success' ? '#52c41a' : '#ff4d4f', border: `1px solid ${authMsg.type === 'success' ? '#b7eb8f' : '#ffccc7'}` }}>{authMsg.text}</div>}
            <div style={{ padding: '20px 24px 24px' }}>
              {[['账号', 'username', registerForm.username, (v: string) => setRegisterForm(f => ({ ...f, username: v })), '3-20位字母、数字、下划线', authErrors.username],
                ['昵称', 'nickname', registerForm.nickname, (v: string) => setRegisterForm(f => ({ ...f, nickname: v })), '选填，不填则默认使用账号名', authErrors.nickname],
                ['密码', 'password', registerForm.password, (v: string) => setRegisterForm(f => ({ ...f, password: v })), '6-20位字符', authErrors.password],
                ['确认密码', 'confirmPassword', registerForm.confirmPassword, (v: string) => setRegisterForm(f => ({ ...f, confirmPassword: v })), '请再次输入密码', authErrors.confirmPassword],
              ].map(([label, field, value, setter, placeholder, err]) => (
                <div key={field as string} style={{ marginBottom: field === 'confirmPassword' ? 20 : 14 }}>
                  <div style={{ fontSize: 13, color: '#595959', marginBottom: 6, fontWeight: 500 }}>{label as string}{['账号', '密码', '确认密码'].includes(label as string) ? ' ' : ''}<span style={{ color: '#ff4d4f' }}>*</span></div>
                  <input type={field === 'password' || field === 'confirmPassword' ? 'password' : 'text'} value={value as string} onChange={e => (setter as (v: string) => void)(e.target.value)}
                    onKeyDown={field === 'confirmPassword' ? (e: React.KeyboardEvent) => { if (e.key === 'Enter') handleRegisterSubmit(); } : undefined}
                    placeholder={placeholder as string} autoFocus={field === 'username'}
                    style={{ width: '100%', height: 34, padding: '0 12px', borderRadius: 4, border: `1px solid ${err ? '#ff4d4f' : '#d9d9d9'}`, fontSize: 13, outline: 'none', color: '#262626', background: '#fff', fontFamily: 'inherit', boxSizing: 'border-box', transition: 'border-color 0.15s' }}
                    onFocus={e => (e.target.style.borderColor = err ? '#ff4d4f' : '#00BEBE')}
                    onBlur={e => (e.target.style.borderColor = err ? '#ff4d4f' : '#d9d9d9')} />
                  {err && <div style={{ fontSize: 12, color: '#ff4d4f', marginTop: 4 }}>{err as string}</div>}
                </div>
              ))}
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setRegisterModalVisible(false)} style={{ flex: 1, height: 36, border: '1px solid #d9d9d9', borderRadius: 4, background: '#fff', cursor: 'pointer', fontSize: 13, color: '#595959', fontFamily: 'inherit', transition: 'all 0.15s' }}
                  onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor = '#00BEBE'; b.style.color = '#00BEBE'; }}
                  onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor = '#d9d9d9'; b.style.color = '#595959'; }}>取消</button>
                <button onClick={handleRegisterSubmit} disabled={authLoading} style={{ flex: 2, height: 36, border: 'none', borderRadius: 4, background: authLoading ? '#80d8d8' : '#00BEBE', color: '#fff', cursor: authLoading ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', transition: 'background 0.15s', boxShadow: '0 2px 0 rgba(0,190,190,0.1)' }}
                  onMouseEnter={e => { if (!authLoading) (e.currentTarget as HTMLButtonElement).style.background = '#00d4d4'; }}
                  onMouseLeave={e => { if (!authLoading) (e.currentTarget as HTMLButtonElement).style.background = '#00BEBE'; }}>
                  {authLoading ? '注册中...' : '注册'}
                </button>
              </div>
              <div style={{ textAlign: 'center', marginTop: 16, fontSize: 13, color: '#8c8c8c' }}>已有账号？{' '}<span onClick={() => { setRegisterModalVisible(false); setLoginModalVisible(true); }} style={{ color: '#00BEBE', cursor: 'pointer', fontWeight: 500 }}>立即登录</span></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
