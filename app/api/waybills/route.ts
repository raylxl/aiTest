import { NextResponse } from 'next/server';
import sql, { initDB } from '@/lib/db';
import type { WaybillQuery } from '@/lib/waybill-types';

// GET /api/waybills - 获取运单列表
export async function GET(request: Request) {
  try {
    await initDB();

    const { searchParams } = new URL(request.url);
    const query: WaybillQuery = {
      external_code: searchParams.get('external_code') || '',
      sender_name: searchParams.get('sender_name') || '',
      sender_phone: searchParams.get('sender_phone') || '',
      receiver_name: searchParams.get('receiver_name') || '',
      receiver_phone: searchParams.get('receiver_phone') || '',
      start_date: searchParams.get('start_date') || '',
      end_date: searchParams.get('end_date') || '',
      page: parseInt(searchParams.get('page') || '1'),
      pageSize: parseInt(searchParams.get('pageSize') || '10'),
    };

    const page = Math.max(1, query.page || 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize || 10));
    const offset = (page - 1) * pageSize;

    // 提取非空过滤值
    const ext = query.external_code?.trim() || '';
    const sname = query.sender_name?.trim() || '';
    const sphone = query.sender_phone?.trim() || '';
    const rname = query.receiver_name?.trim() || '';
    const rphone = query.receiver_phone?.trim() || '';
    const sdate = query.start_date?.trim() || '';
    const edate = query.end_date?.trim() || '';

    const endDateFull = edate ? edate + ' 23:59:59' : '';

    // 用 sql 模板标签拼接（保持类型安全）
    const countRows = await sql`
      SELECT COUNT(*) as ct FROM waybills
      WHERE
        (${ext} = '' OR external_code ILIKE ${'%' + ext + '%'})
        AND (${sname} = '' OR sender_name ILIKE ${'%' + sname + '%'})
        AND (${sphone} = '' OR sender_phone ILIKE ${'%' + sphone + '%'})
        AND (${rname} = '' OR receiver_name ILIKE ${'%' + rname + '%'})
        AND (${rphone} = '' OR receiver_phone ILIKE ${'%' + rphone + '%'})
        AND (${sdate} = '' OR created_at >= ${sdate}::date)
        AND (${endDateFull} = '' OR created_at <= ${endDateFull}::timestamp)
    `;
    const total = parseInt(String((countRows[0] as { ct: unknown })?.ct || '0'));

    const dataRows = await sql`
      SELECT * FROM waybills
      WHERE
        (${ext} = '' OR external_code ILIKE ${'%' + ext + '%'})
        AND (${sname} = '' OR sender_name ILIKE ${'%' + sname + '%'})
        AND (${sphone} = '' OR sender_phone ILIKE ${'%' + sphone + '%'})
        AND (${rname} = '' OR receiver_name ILIKE ${'%' + rname + '%'})
        AND (${rphone} = '' OR receiver_phone ILIKE ${'%' + rphone + '%'})
        AND (${sdate} = '' OR created_at >= ${sdate}::date)
        AND (${endDateFull} = '' OR created_at <= ${endDateFull}::timestamp)
      ORDER BY created_at DESC
      LIMIT ${pageSize} OFFSET ${offset}
    `;

    return NextResponse.json({
      data: dataRows,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// DELETE /api/waybills - 批量删除运单
export async function DELETE(request: Request) {
  try {
    await initDB();
    const body = await request.json();
    const { ids } = body as { ids: number[] };

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: '缺少 ids 参数' }, { status: 400 });
    }

    // neon sql 不支持 IN 拼接，用 sql 函数 unsafe 处理
    const { getNeonClient } = await import('@/lib/db');
    const neonSql = getNeonClient();
    const idList = ids.map((id) => String(id)).join(',');
    const result = await neonSql`DELETE FROM waybills WHERE id IN (${neonSql.unsafe(idList)}) RETURNING id` as unknown as Array<{ id: number }>;
    const deletedCount = result.length;

    return NextResponse.json({ success: true, deletedCount });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
