import { NextRequest, NextResponse } from 'next/server';
import { localLogin, validateUsername, validatePassword } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { username, password } = body;

    // 参数校验
    const usernameErr = validateUsername(username);
    if (usernameErr) return NextResponse.json({ error: usernameErr }, { status: 400 });

    const passwordErr = validatePassword(password);
    if (passwordErr) return NextResponse.json({ error: passwordErr }, { status: 400 });

    // 本地演示模式登录
    const result = localLogin(username, password);

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 401 });
    }

    return NextResponse.json({
      ok: true,
      user: result.user,
      message: '登录成功',
    });
  } catch {
    return NextResponse.json({ error: '请求格式错误' }, { status: 400 });
  }
}
