import { NextResponse } from 'next/server';
import sql from '@/lib/db';

// GET /api/fee-rules/[id]
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const rows = await sql`SELECT * FROM fee_rules WHERE id = ${id}`;
    if (rows.length === 0) return NextResponse.json({ error: '记录不存在' }, { status: 404 });
    return NextResponse.json({ data: rows[0] });
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// PUT /api/fee-rules/[id]
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();

  const fee_name = body.feeName || body.fee_name || '';
  const settlement_subject = body.settlementSubject || body.settlement_subject || '';
  const settlement_flow = body.settlementFlow || body.settlement_flow || '';
  const income_org = body.incomeOrg || body.income_org || '';
  const expense_org = body.expenseOrg || body.expense_org || '';
  const bill_node = body.billNode || body.bill_node || '';
  const settlement_node = body.settlementNode || body.settlement_node || '';
  const start_date = body.startDate || body.start_date || '';
  const end_date = body.endDate || body.end_date || '';
  const remark = body.remark || '';
  const status = body.status || '';
  const updater = body.updater || '系统';

  // 必填校验
  if (!fee_name) return NextResponse.json({ error: '费用名称不能为空' }, { status: 400 });
  if (!settlement_subject) return NextResponse.json({ error: '结算主体不能为空' }, { status: 400 });
  if (!settlement_flow) return NextResponse.json({ error: '结算流向不能为空' }, { status: 400 });
  if (!income_org) return NextResponse.json({ error: '收入机构不能为空' }, { status: 400 });
  if (!expense_org) return NextResponse.json({ error: '支出机构不能为空' }, { status: 400 });
  if (!bill_node) return NextResponse.json({ error: '账单节点不能为空' }, { status: 400 });
  if (!settlement_node) return NextResponse.json({ error: '结算节点不能为空' }, { status: 400 });
  if (!start_date) return NextResponse.json({ error: '开始时间不能为空' }, { status: 400 });
  if (!end_date) return NextResponse.json({ error: '结束时间不能为空' }, { status: 400 });
  if (new Date(end_date) < new Date(start_date)) {
    return NextResponse.json({ error: '结束时间必须大于等于开始时间' }, { status: 400 });
  }

  try {
    const rows = await sql`
      UPDATE fee_rules
      SET fee_name=${fee_name},
          settlement_subject=${settlement_subject},
          settlement_flow=${settlement_flow},
          income_org=${income_org},
          expense_org=${expense_org},
          bill_node=${bill_node},
          settlement_node=${settlement_node},
          start_date=${start_date},
          end_date=${end_date},
          remark=${remark},
          status=${status},
          updater=${updater},
          update_time=NOW()
      WHERE id=${id}
      RETURNING *
    `;
    if (rows.length === 0) return NextResponse.json({ error: '记录不存在' }, { status: 404 });
    return NextResponse.json({ data: rows[0] });
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// DELETE /api/fee-rules/[id]
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const rows = await sql`DELETE FROM fee_rules WHERE id=${id} RETURNING *`;
    if (rows.length === 0) return NextResponse.json({ error: '记录不存在' }, { status: 404 });
    return NextResponse.json({ message: '删除成功', data: rows[0] });
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
