import { NextResponse } from 'next/server';
import sql, { initDB, getNeonClient } from '@/lib/db';
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

    // SQL 注入防护：LIKE 值转义单引号
    const like = (v: string) => v.replace(/'/g, "''") + '%';

    // 收集有值的条件（避免空值传给 PG 导致类型强转错误）
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (query.external_code) {
      params.push(like(query.external_code.trim()));
      conditions.push(`external_code ILIKE $${params.length}`);
    }
    if (query.sender_name) {
      params.push(like(query.sender_name.trim()));
      conditions.push(`sender_name ILIKE $${params.length}`);
    }
    if (query.sender_phone) {
      params.push(like(query.sender_phone.trim()));
      conditions.push(`sender_phone ILIKE $${params.length}`);
    }
    if (query.receiver_name) {
      params.push(like(query.receiver_name.trim()));
      conditions.push(`receiver_name ILIKE $${params.length}`);
    }
    if (query.receiver_phone) {
      params.push(like(query.receiver_phone.trim()));
      conditions.push(`receiver_phone ILIKE $${params.length}`);
    }
    if (query.start_date) {
      params.push(query.start_date.trim());
      conditions.push(`created_at >= $${params.length}::date`);
    }
    if (query.end_date) {
      params.push(query.end_date.trim() + ' 23:59:59');
      conditions.push(`created_at <= $${params.length}::timestamp`);
    }

    const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : 'WHERE 1=1';
    const countSql = `SELECT COUNT(*) as ct FROM waybills ${whereClause}`;
    const dataSql = `SELECT * FROM waybills ${whereClause} ORDER BY created_at DESC LIMIT ${pageSize} OFFSET ${offset}`;

    // 用 getNeonClient() 的 .query() 方法做参数化查询
    const neonSql = getNeonClient();
    const countResult = await neonSql.query(countSql, params) as unknown as Array<{ ct: unknown }>;
    const total = parseInt(String(countResult[0]?.ct || '0'));

    const dataResult = await neonSql.query(dataSql, params) as unknown as Array<Record<string, unknown>>;

    return NextResponse.json({
      data: dataResult,
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
