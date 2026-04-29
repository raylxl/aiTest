import { NextRequest, NextResponse } from 'next/server';
import { localGetUser } from '@/lib/auth';

export async function GET(req: NextRequest) {
  // 从请求头获取 userId（由客户端传递）
  const userId = req.nextUrl.searchParams.get('userId');

  if (!userId) {
    return NextResponse.json({ error: '未登录' }, { status: 401 });
  }

  const user = localGetUser(userId);

  if (!user) {
    return NextResponse.json({ error: '用户不存在' }, { status: 404 });
  }

  return NextResponse.json({ ok: true, user });
}
