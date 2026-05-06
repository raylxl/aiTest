import { NextResponse } from 'next/server';
import sql, { initDB } from '@/lib/db';

export async function GET() {
  try {
    await sql`CREATE TABLE IF NOT EXISTS fee_types (
      id              SERIAL PRIMARY KEY,
      fee_code        VARCHAR(20)  NOT NULL UNIQUE,
      fee_name        VARCHAR(100) NOT NULL,
      business_domain VARCHAR(50)  NOT NULL,
      price_types     TEXT[]       DEFAULT '{}',
      remark          TEXT         DEFAULT '',
      creator         VARCHAR(50)  NOT NULL,
      create_time     TIMESTAMPTZ  DEFAULT NOW(),
      updater         VARCHAR(50)  NOT NULL DEFAULT '系统',
      update_time     TIMESTAMPTZ  DEFAULT NOW()
    )`;

    const rows = await sql`SELECT * FROM fee_types ORDER BY id DESC`;

    // Dynamic import xlsx to avoid build issues
    const XLSX = await import('xlsx');

    // Map data to sheet rows
    const sheetData = rows.map((r: Record<string, unknown>, idx: number) => ({
      '序号': idx + 1,
      '费用编号': r.fee_code,
      '费用名称': r.fee_name,
      '所属业务域': r.business_domain,
      '所属报价': Array.isArray(r.price_types) ? (r.price_types as unknown[]).join('、') : '',
      '备注': r.remark || '',
      '创建人': r.creator,
      '创建时间': r.create_time ? String(r.create_time).replace('T', ' ').slice(0, 19) : '',
      '修改人': r.updater || '',
      '修改时间': r.update_time ? String(r.update_time).replace('T', ' ').slice(0, 19) : '',
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(sheetData);

    // Column widths
    ws['!cols'] = [
      { wch: 6 },   // 序号
      { wch: 12 },  // 费用编号
      { wch: 20 },  // 费用名称
      { wch: 10 },  // 所属业务域
      { wch: 28 },  // 所属报价
      { wch: 30 },  // 备注
      { wch: 12 },  // 创建人
      { wch: 20 },  // 创建时间
      { wch: 12 },  // 修改人
      { wch: 20 },  // 修改时间
    ];

    XLSX.utils.book_append_sheet(wb, ws, '费用类型');

    const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const uint8 = new Uint8Array(buf);
    const pad = (n: number) => String(n).padStart(2, '0');
    const now = new Date();
    const ts = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;

    return new NextResponse(uint8, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent('费用类型维护_' + ts)}.xlsx`,
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
