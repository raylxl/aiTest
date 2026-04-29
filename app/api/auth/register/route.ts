import { NextRequest, NextResponse } from 'next/server';
import { localRegister, validateUsername, validatePassword, validateNickname } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { username, nickname, password } = body;

    // 参数校验
    const usernameErr = validateUsername(username);
    if (usernameErr) return NextResponse.json({ error: usernameErr }, { status: 400 });

    const nicknameErr = validateNickname(nickname ?? '');
    if (nicknameErr) return NextResponse.json({ error: nicknameErr }, { status: 400 });

    const passwordErr = validatePassword(password);
    if (passwordErr) return NextResponse.json({ error: passwordErr }, { status: 400 });

    // 本地演示模式注册
    const result = localRegister(username, nickname ?? username, password);

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 409 });
    }

    return NextResponse.json({
      ok: true,
      user: result.user,
      message: '注册成功',
    });
  } catch {
    return NextResponse.json({ error: '请求格式错误' }, { status: 400 });
  }
}
