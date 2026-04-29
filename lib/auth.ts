/**
 * 认证核心模块
 * 支持两种模式:
 *  1. 本地演示模式 (localStorage) -- DATABASE_URL 未配置时自动启用
 *  2. 真实数据库模式 (Neon PostgreSQL) -- 配置 DATABASE_URL 后启用
 *
 * 用户信息存储:
 *  - 本地模式: localStorage['fee_users'] = JSON数组
 *  - 真实DB: users 表
 *
 * 会话存储: localStorage['fee_session'] = { userId, username, nickname, role, loginTime }
 */

// ============ 类型定义 ============
export interface User {
  id: string;
  username: string;       // 登录账号
  nickname: string;       // 昵称
  passwordHash?: string;  // bcrypt 哈希后的密码
  role: 'admin' | 'user';
  avatar?: string;        // 头像颜色
  createTime: string;
}

export interface Session {
  userId: string;
  username: string;
  nickname: string;
  role: 'admin' | 'user';
  loginTime: string;
}

// ============ 管理员账户 (硬编码) ============
const ADMIN_ACCOUNT = {
  username: 'admin',
  password: '123456',
  nickname: '管理员',
  role: 'admin' as const,
};

// ============ 模式判断 ============
function isDemoMode(): boolean {
  // 未配置 DATABASE_URL 或未安装 bcryptjs 时使用本地演示模式
  const hasDb = typeof process !== 'undefined' && !!process.env.DATABASE_URL;
  const hasBcrypt = false; // 后续可选安装
  return !hasDb || !hasBcrypt;
}

// ============ 本地存储键名 ============
const USERS_KEY = 'fee_users';
const SESSION_KEY = 'fee_session';

// ============ 本地演示模式 ============
function getLocalUsers(): User[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(USERS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function setLocalUsers(users: User[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

// ============ Session 管理 (两种模式共用 localStorage) ============
export function getSession(): Session | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setSession(session: Session | null): void {
  if (typeof window === 'undefined') return;
  if (!session) {
    localStorage.removeItem(SESSION_KEY);
  } else {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  }
}

export function clearSession(): void {
  setSession(null);
}

// ============ 管理员验证 ============
export function validateAdmin(username: string, password: string): User | null {
  if (username === ADMIN_ACCOUNT.username && password === ADMIN_ACCOUNT.password) {
    return {
      id: 'admin-001',
      username: ADMIN_ACCOUNT.username,
      nickname: ADMIN_ACCOUNT.nickname,
      role: ADMIN_ACCOUNT.role,
      avatar: '#e6f4ff',
      createTime: new Date().toISOString(),
    };
  }
  return null;
}

// ============ 用户名校验 ============
export function validateUsername(username: string): string | null {
  if (!username) return '请输入账号';
  if (username.length < 3) return '账号至少3个字符';
  if (username.length > 20) return '账号最多20个字符';
  if (!/^[a-zA-Z0-9_]+$/.test(username)) return '账号只能包含字母、数字和下划线';
  return null;
}

// ============ 密码校验 ============
export function validatePassword(password: string): string | null {
  if (!password) return '请输入密码';
  if (password.length < 6) return '密码至少6个字符';
  if (password.length > 20) return '密码最多20个字符';
  return null;
}

// ============ 昵称校验 ============
export function validateNickname(nickname: string): string | null {
  if (!nickname) return '请输入昵称';
  if (nickname.length < 2) return '昵称至少2个字符';
  if (nickname.length > 16) return '昵称最多16个字符';
  return null;
}

// ============ 头像颜色 ============
const AVATAR_COLORS = [
  '#1663c4', '#52c41a', '#fa8c16', '#f5222d',
  '#722ed1', '#13c2c2', '#faad14', '#eb2f96',
];

export function getAvatarColor(username: string): string {
  let hash = 0;
  for (let i = 0; i < username.length; i++) {
    hash = username.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

// ============ 本地模式用户操作 ============
export function localRegister(username: string, nickname: string, password: string): { ok: true; user: User } | { ok: false; error: string } {
  const users = getLocalUsers();

  if (users.some(u => u.username === username)) {
    return { ok: false, error: '账号已存在' };
  }

  // 演示模式：密码明文存储（真实DB下用bcrypt）
  const newUser: User = {
    id: `user-${Date.now()}`,
    username,
    nickname: nickname || username,
    passwordHash: btoa(password), // base64 演示编码（勿用于生产）
    role: 'user',
    avatar: getAvatarColor(username),
    createTime: new Date().toISOString(),
  };

  users.push(newUser);
  setLocalUsers(users);

  const { passwordHash: _, ...safeUser } = newUser;
  return { ok: true, user: safeUser as User };
}

export function localLogin(username: string, password: string): { ok: true; user: User } | { ok: false; error: string } {
  // 优先验证管理员
  const admin = validateAdmin(username, password);
  if (admin) return { ok: true, user: admin };

  // 验证本地用户
  const users = getLocalUsers();
  const user = users.find(u => u.username === username);
  if (!user) return { ok: false, error: '账号不存在' };

  // 演示模式：base64 验证
  if (atob(user.passwordHash || '') !== password) {
    return { ok: false, error: '密码错误' };
  }

  return { ok: true, user };
}

export function localGetUser(userId: string): User | null {
  if (userId === 'admin-001') {
    return {
      id: 'admin-001',
      username: ADMIN_ACCOUNT.username,
      nickname: ADMIN_ACCOUNT.nickname,
      role: ADMIN_ACCOUNT.role,
      avatar: '#e6f4ff',
      createTime: new Date().toISOString(),
    };
  }
  const users = getLocalUsers();
  const user = users.find(u => u.id === userId);
  if (!user) return null;
  const { passwordHash: _, ...safeUser } = user;
  return safeUser as User;
}
