import { NextResponse } from 'next/server';
import sql from '@/lib/db';

// 自动建表
async function ensureTable() {
  // 创建表
  await sql`
    CREATE TABLE IF NOT EXISTS fee_rules (
      id                  SERIAL PRIMARY KEY,
      fee_code            VARCHAR(20),
      fee_name            VARCHAR(100) NOT NULL,
      settlement_subject   VARCHAR(50) NOT NULL,
      settlement_flow      VARCHAR(100) NOT NULL,
      income_org          VARCHAR(100) NOT NULL,
      expense_org         VARCHAR(100) NOT NULL,
      bill_node           VARCHAR(50) NOT NULL,
      settlement_node     VARCHAR(50) NOT NULL,
      start_date          DATE NOT NULL,
      end_date            DATE NOT NULL,
      remark              TEXT DEFAULT '',
      status              VARCHAR(20) DEFAULT 'pending',
      creator             VARCHAR(50) NOT NULL DEFAULT '系统',
      create_time         TIMESTAMPTZ DEFAULT NOW(),
      updater             VARCHAR(50) NOT NULL DEFAULT '系统',
      update_time         TIMESTAMPTZ DEFAULT NOW(),
      audit_person        VARCHAR(50) DEFAULT '',     -- 审核人
      audit_time          TIMESTAMPTZ NULL                      -- 审核时间
    )
  `;

  // 如果列不存在，添加它们
  try {
    await sql`ALTER TABLE fee_rules ADD COLUMN IF NOT EXISTS fee_code VARCHAR(20)`;
  } catch { /* 忽略 */ }
  try {
    await sql`ALTER TABLE fee_rules ADD COLUMN IF NOT EXISTS audit_person VARCHAR(50) DEFAULT ''`;
  } catch { /* 忽略 */ }
  try {
    await sql`ALTER TABLE fee_rules ADD COLUMN IF NOT EXISTS audit_time TIMESTAMPTZ NULL`;
  } catch { /* 忽略 */ }
}

// GET /api/fee-rules - 获取列表
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  // 初始化表
  if (searchParams.get('action') === 'init') {
    await ensureTable();
    return NextResponse.json({ message: '数据表初始化成功' });
  }

  try {
    await ensureTable();

    // 构建查询条件
    const feeName = searchParams.get('feeName') || '';
    const settlementSubject = searchParams.get('settlementSubject') || '';
    const settlementFlow = searchParams.get('settlementFlow') || '';
    const incomeOrg = searchParams.get('incomeOrg') || '';
    const expenseOrg = searchParams.get('expenseOrg') || '';
    const billNode = searchParams.get('billNode') || '';
    const settlementNode = searchParams.get('settlementNode') || '';
    const startDate = searchParams.get('startDate') || '';
    const status = searchParams.get('status') || '';
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = parseInt(searchParams.get('pageSize') || '10');
    const offset = (page - 1) * pageSize;

    // 先获取所有数据，然后在前端过滤（简化实现）
    const allRows = await sql<Record<string, unknown>>`
      SELECT id, fee_code, fee_name, settlement_subject, settlement_flow, income_org, expense_org, bill_node, settlement_node, start_date, end_date, remark, status, creator, create_time, updater, update_time, audit_person, audit_time
      FROM fee_rules
      ORDER BY id DESC
    `;

    // 应用过滤条件
    let filtered = allRows;
    if (feeName) {
      filtered = filtered.filter(r => (r.fee_name as string).includes(feeName));
    }
    if (settlementSubject) {
      filtered = filtered.filter(r => r.settlement_subject === settlementSubject);
    }
    if (settlementFlow) {
      filtered = filtered.filter(r => r.settlement_flow === settlementFlow);
    }
    if (incomeOrg) {
      filtered = filtered.filter(r => r.income_org === incomeOrg);
    }
    if (expenseOrg) {
      filtered = filtered.filter(r => r.expense_org === expenseOrg);
    }
    if (billNode) {
      filtered = filtered.filter(r => r.bill_node === billNode);
    }
    if (settlementNode) {
      filtered = filtered.filter(r => r.settlement_node === settlementNode);
    }
    if (startDate) {
      filtered = filtered.filter(r => (r.start_date as string) <= startDate);
    }
    if (status) {
      filtered = filtered.filter(r => r.status === status);
    }

    // 分页
    const total = filtered.length;
    const paginatedRows = filtered.slice(offset, offset + pageSize);

    return NextResponse.json({
      data: paginatedRows,
      total,
      page,
      pageSize
    });
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// POST /api/fee-rules - 新增
export async function POST(request: Request) {
  const body = await request.json();

  const fee_name_input = body.feeName || body.fee_name || '';
  // 解析 "001 - 费用名称" 格式，提取费用编号和费用名称
  const feeCodeMatch = fee_name_input.match(/^(\d+)\s*-\s*(.+)$/);
  const fee_code = feeCodeMatch ? feeCodeMatch[1] : null;
  const fee_name = feeCodeMatch ? feeCodeMatch[2] : fee_name_input;

  const settlement_subject = body.settlementSubject || body.settlement_subject || '';
  const settlement_flow = body.settlementFlow || body.settlement_flow || '';
  const income_org = body.incomeOrg || body.income_org || '';
  const expense_org = body.expenseOrg || body.expense_org || '';
  const bill_node = body.billNode || body.bill_node || '';
  const settlement_node = body.settlementNode || body.settlement_node || '';
  const start_date = body.startDate || body.start_date || '';
  const end_date = body.endDate || body.end_date || '';
  const remark = body.remark || '';
  const creator = body.creator || '系统';

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
    await ensureTable();
    const rows = await sql`
      INSERT INTO fee_rules (fee_code, fee_name, settlement_subject, settlement_flow, income_org, expense_org, bill_node, settlement_node, start_date, end_date, remark, creator, updater)
      VALUES (${fee_code}, ${fee_name}, ${settlement_subject}, ${settlement_flow}, ${income_org}, ${expense_org}, ${bill_node}, ${settlement_node}, ${start_date}, ${end_date}, ${remark}, ${creator}, ${creator})
      RETURNING *
    `;
    return NextResponse.json({ data: rows[0] }, { status: 201 });
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
