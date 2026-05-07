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
      receiver_name: searchParams.get('receiver_name') || '',
      start_date: searchParams.get('start_date') || '',
      end_date: searchParams.get('end_date') || '',
      page: parseInt(searchParams.get('page') || '1'),
      pageSize: parseInt(searchParams.get('pageSize') || '10'),
    };

    const page = Math.max(1, query.page || 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize || 10));
    const offset = (page - 1) * pageSize;

    // 用模板标签逐一构建查询
    let total = 0;
    let data: Array<Record<string, unknown>> = [];

    if (!query.external_code && !query.receiver_name && !query.start_date && !query.end_date) {
      // 无过滤条件
      const countRows = await sql`SELECT COUNT(*) as ct FROM waybills`;
      total = parseInt(String(countRows[0]?.ct || '0'));
      data = await sql`SELECT * FROM waybills ORDER BY created_at DESC LIMIT ${pageSize} OFFSET ${offset}` as Array<Record<string, unknown>>;
    } else if (query.external_code && !query.receiver_name && !query.start_date && !query.end_date) {
      const countRows = await sql`SELECT COUNT(*) as ct FROM waybills WHERE external_code ILIKE ${'%' + query.external_code + '%'}`;
      total = parseInt(String(countRows[0]?.ct || '0'));
      data = await sql`SELECT * FROM waybills WHERE external_code ILIKE ${'%' + query.external_code + '%'} ORDER BY created_at DESC LIMIT ${pageSize} OFFSET ${offset}` as Array<Record<string, unknown>>;
    } else if (!query.external_code && query.receiver_name && !query.start_date && !query.end_date) {
      const countRows = await sql`SELECT COUNT(*) as ct FROM waybills WHERE receiver_name ILIKE ${'%' + query.receiver_name + '%'}`;
      total = parseInt(String(countRows[0]?.ct || '0'));
      data = await sql`SELECT * FROM waybills WHERE receiver_name ILIKE ${'%' + query.receiver_name + '%'} ORDER BY created_at DESC LIMIT ${pageSize} OFFSET ${offset}` as Array<Record<string, unknown>>;
    } else if (query.start_date && !query.end_date) {
      const countRows = await sql`SELECT COUNT(*) as ct FROM waybills WHERE created_at >= ${query.start_date}`;
      total = parseInt(String(countRows[0]?.ct || '0'));
      data = await sql`SELECT * FROM waybills WHERE created_at >= ${query.start_date} ORDER BY created_at DESC LIMIT ${pageSize} OFFSET ${offset}` as Array<Record<string, unknown>>;
    } else if (!query.start_date && query.end_date) {
      const countRows = await sql`SELECT COUNT(*) as ct FROM waybills WHERE created_at <= ${query.end_date + ' 23:59:59'}`;
      total = parseInt(String(countRows[0]?.ct || '0'));
      data = await sql`SELECT * FROM waybills WHERE created_at <= ${query.end_date + ' 23:59:59'} ORDER BY created_at DESC LIMIT ${pageSize} OFFSET ${offset}` as Array<Record<string, unknown>>;
    } else if (query.start_date && query.end_date) {
      const countRows = await sql`SELECT COUNT(*) as ct FROM waybills WHERE created_at >= ${query.start_date} AND created_at <= ${query.end_date + ' 23:59:59'}`;
      total = parseInt(String(countRows[0]?.ct || '0'));
      data = await sql`SELECT * FROM waybills WHERE created_at >= ${query.start_date} AND created_at <= ${query.end_date + ' 23:59:59'} ORDER BY created_at DESC LIMIT ${pageSize} OFFSET ${offset}` as Array<Record<string, unknown>>;
    } else {
      // 兜底：返回全量
      const countRows = await sql`SELECT COUNT(*) as ct FROM waybills`;
      total = parseInt(String(countRows[0]?.ct || '0'));
      data = await sql`SELECT * FROM waybills ORDER BY created_at DESC LIMIT ${pageSize} OFFSET ${offset}` as Array<Record<string, unknown>>;
    }

    return NextResponse.json({
      data,
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

    // 使用 neon 客户端的模板标签 + unsafe() 处理 IN 子句
    const neonSql = getNeonClient();
    const idList = ids.map((id) => String(id)).join(',');
    const result = await neonSql`DELETE FROM waybills WHERE id IN (${neonSql.unsafe(idList)}) RETURNING id` as Array<{ id: number }>;
    const deletedCount = result.length;

    return NextResponse.json({ success: true, deletedCount });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
