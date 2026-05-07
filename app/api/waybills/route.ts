import { NextResponse } from 'next/server';
import { initDB, getNeonClient } from '@/lib/db';
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

    const neonSql = getNeonClient();
    const esc = (v: string) => v.replace(/'/g, "''");

    const parts: string[] = [];
    if (query.external_code)  parts.push(`external_code ILIKE '${esc(query.external_code)}%'`);
    if (query.sender_name)    parts.push(`sender_name ILIKE '${esc(query.sender_name)}%'`);
    if (query.sender_phone)    parts.push(`sender_phone ILIKE '${esc(query.sender_phone)}%'`);
    if (query.receiver_name)   parts.push(`receiver_name ILIKE '${esc(query.receiver_name)}%'`);
    if (query.receiver_phone) parts.push(`receiver_phone ILIKE '${esc(query.receiver_phone)}%'`);
    if (query.start_date)      parts.push(`created_at >= '${esc(query.start_date)}'`);
    if (query.end_date)       parts.push(`created_at <= '${esc(query.end_date)} 23:59:59'`);
    const whereClause = parts.length > 0 ? 'WHERE ' + parts.join(' AND ') : '';

    const countRows = await neonSql.unsafe(
      `SELECT COUNT(*) as ct FROM waybills ${whereClause}`
    ) as unknown as Array<{ ct: unknown }>;
    const total = parseInt(String(countRows[0]?.ct || '0'));

    const dataRows = await neonSql.unsafe(
      `SELECT * FROM waybills ${whereClause} ORDER BY created_at DESC LIMIT ${pageSize} OFFSET ${offset}`
    ) as unknown as Array<Record<string, unknown>>;

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
