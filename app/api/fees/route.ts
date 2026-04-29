import { NextResponse } from 'next/server';
import sql, { initDB } from '@/lib/db';

// 自动建表（首次访问时自动执行，已存在则忽略）
async function ensureTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS fee_types (
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
    )
  `;
}

// GET /api/fees           → 获取列表（首次自动建表）
// GET /api/fees?action=init → 手动初始化表
// POST /api/fees          → 新增
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  if (searchParams.get('action') === 'init') {
    await ensureTable();
    return NextResponse.json({ message: '数据表初始化成功' });
  }

  try {
    await ensureTable(); // 首次访问自动建表
    const rows = await sql`SELECT * FROM fee_types ORDER BY id DESC`;
    return NextResponse.json({ data: rows });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST /api/fees
export async function POST(request: Request) {
  const body = await request.json();
  // 兼容前端 camelCase 和直接用下划线两种格式
  const fee_code = body.feeCode ?? body.fee_code ?? '';
  const fee_name = body.feeName ?? body.fee_name ?? '';
  const business_domain = body.businessDomain ?? body.business_domain ?? '';
  const price_types = body.priceTypes ?? body.price_types ?? [];
  const remark = body.remark ?? '';
  const creator = body.creator ?? '未知';

  if (!fee_code || !fee_name || !business_domain) {
    return NextResponse.json({ error: '费用编号、费用名称、所属业务域不能为空' }, { status: 400 });
  }
  if (!/^\d+$/.test(fee_code)) {
    return NextResponse.json({ error: '费用编号只能输入数字' }, { status: 400 });
  }
  if (fee_code.length > 8) {
    return NextResponse.json({ error: '费用编号最多8位数字' }, { status: 400 });
  }
  if (fee_name.length > 32) {
    return NextResponse.json({ error: '费用名称最多32个字符' }, { status: 400 });
  }
  if (remark && remark.length > 256) {
    return NextResponse.json({ error: '备注最多256个字符' }, { status: 400 });
  }

  try {
    const exist = await sql`SELECT id FROM fee_types WHERE fee_code = ${fee_code}`;
    if (exist.length > 0) {
      return NextResponse.json({ error: '费用编号已存在' }, { status: 400 });
    }

    const rows = await sql`
      INSERT INTO fee_types (fee_code, fee_name, business_domain, price_types, remark, creator, updater)
      VALUES (${fee_code}, ${fee_name}, ${business_domain}, ${price_types}, ${remark}, ${creator}, ${creator})
      RETURNING *
    `;
    return NextResponse.json({ data: rows[0] }, { status: 201 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
