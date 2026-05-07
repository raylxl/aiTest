import { NextResponse } from 'next/server';
import sql, { initDB } from '@/lib/db';
import crypto from 'crypto';

// POST /api/waybills/mapping - 保存模板映射
export async function POST(request: Request) {
  try {
    await initDB();

    const body = await request.json();
    const { headerHash, headerColumns } = body as {
      headerHash: string;
      headerColumns: Record<string, string>;
    };

    if (!headerHash || !headerColumns || Object.keys(headerColumns).length === 0) {
      return NextResponse.json({ error: '参数不完整' }, { status: 400 });
    }

    // Upsert
    await sql`
      INSERT INTO template_mappings (header_hash, header_columns, updated_at)
      VALUES (${headerHash}, ${JSON.stringify(headerColumns)}, NOW())
      ON CONFLICT (header_hash) DO UPDATE SET
        header_columns = EXCLUDED.header_columns,
        updated_at = NOW()
    `;

    return NextResponse.json({ ok: true, message: '映射已保存' });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
