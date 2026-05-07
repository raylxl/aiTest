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
