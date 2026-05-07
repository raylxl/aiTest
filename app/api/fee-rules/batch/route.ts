import { NextResponse } from 'next/server';
import sql from '@/lib/db';

// POST /api/fee-rules/batch - 批量操作
export async function POST(request: Request) {
  const body = await request.json();
  const { action, ids } = body;

  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: '请选择要操作的数据' }, { status: 400 });
  }

  const updater = body.updater || '系统';

  try {
    if (action === 'delete') {
      // 批量删除
      const rows: Record<string, unknown>[] = [];
      for (const id of ids) {
        const deleted = await sql<Record<string, unknown>>`DELETE FROM fee_rules WHERE id = ${id} RETURNING *`;
        if (deleted.length > 0) rows.push(...deleted);
      }
      return NextResponse.json({ message: `成功删除 ${rows.length} 条记录`, data: rows });
    }

    if (action === 'approve') {
      // 批量审核通过
      const rows: Record<string, unknown>[] = [];
      for (const id of ids) {
        const updated = await sql<Record<string, unknown>>`
          UPDATE fee_rules SET status='approved', updater=${updater}, update_time=NOW(), audit_person=${updater}, audit_time=NOW()
          WHERE id = ${id} AND status='pending' RETURNING *
        `;
        if (updated.length > 0) rows.push(...updated);
      }
      return NextResponse.json({ message: `成功审核 ${rows.length} 条记录`, data: rows });
    }

    if (action === 'reject') {
      // 批量审核驳回（标记状态为 rejected）
      const rows: Record<string, unknown>[] = [];
      for (const id of ids) {
        const updated = await sql<Record<string, unknown>>`
          UPDATE fee_rules SET status='rejected', updater=${updater}, update_time=NOW(), audit_person=${updater}, audit_time=NOW()
          WHERE id = ${id} AND status='pending' RETURNING *
        `;
        if (updated.length > 0) rows.push(...updated);
      }
      return NextResponse.json({ message: `审核驳回，${rows.length} 条记录已标记为驳回状态`, data: rows });
    }

    return NextResponse.json({ error: '未知操作' }, { status: 400 });
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
