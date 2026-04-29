import { NextResponse } from 'next/server';
import sql from '@/lib/db';

// GET /api/fees/[id]
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const rows = await sql`SELECT * FROM fee_types WHERE id = ${id}`;
    if (rows.length === 0) return NextResponse.json({ error: '记录不存在' }, { status: 404 });
    return NextResponse.json({ data: rows[0] });
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// PUT /api/fees/[id]
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const fee_name = body.feeName ?? body.fee_name ?? '';
  const business_domain = body.businessDomain ?? body.business_domain ?? '';
  const price_types = body.priceTypes ?? body.price_types ?? [];
  const remark = body.remark ?? '';
  const updater = body.updater ?? '未知';

  if (!fee_name || !business_domain) {
    return NextResponse.json({ error: '费用名称和所属业务域不能为空' }, { status: 400 });
  }
  if (fee_name.length > 32) {
    return NextResponse.json({ error: '费用名称最多32个字符' }, { status: 400 });
  }
  if (remark && remark.length > 256) {
    return NextResponse.json({ error: '备注最多256个字符' }, { status: 400 });
  }

  try {
    const rows = await sql`
      UPDATE fee_types
      SET fee_name=${fee_name}, business_domain=${business_domain},
          price_types=${price_types}, remark=${remark},
          updater=${updater}, update_time=NOW()
      WHERE id=${id}
      RETURNING *
    `;
    if (rows.length === 0) return NextResponse.json({ error: '记录不存在' }, { status: 404 });
    return NextResponse.json({ data: rows[0] });
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// DELETE /api/fees/[id]
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const rows = await sql`DELETE FROM fee_types WHERE id=${id} RETURNING *`;
    if (rows.length === 0) return NextResponse.json({ error: '记录不存在' }, { status: 404 });
    return NextResponse.json({ message: '删除成功', data: rows[0] });
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
