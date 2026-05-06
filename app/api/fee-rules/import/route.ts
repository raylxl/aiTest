import { NextResponse } from 'next/server';
import sql from '@/lib/db';

const SETTLEMENT_SUBJECTS = ['寄方', '派方', '中转'];
const SETTLEMENT_FLOWS = [
  '总部收中心', '中心收网点', '总部收网点', '一级网点收二级网点',
  '总部付中心', '中心付网点', '总部付网点', '一级网点付二级网点',
  '寄件中心付派件中心', '寄件中心付中转中心', '中转中心付中转中心',
  '中心付中心', '一级网点收一级网点'
];
const ORG_OPTIONS = [
  '总部', '寄件财务中心', '寄件网点', '寄件一级网点', '寄件二级网点',
  '中转财务中心', '派件财务中心', '目的网点', '目的一级网点', '目的二级网点', '上一站'
];
const BILL_NODES = ['开单', '揽收网点扫描', '中转中心扫描', '派件网点扫描', '到货', '签收'];

const FIELD_MAP: Record<string, string> = {
  '费用名称': 'feeName',
  '结算主体': 'settlementSubject',
  '结算流向': 'settlementFlow',
  '收入机构': 'incomeOrg',
  '支出机构': 'expenseOrg',
  '账单节点': 'billNode',
  '结算节点': 'settlementNode',
  '生效日期': 'startDate',
  '失效日期': 'endDate',
  '备注': 'remark',
};

// POST /api/fee-rules/import → 解析校验
export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: '请上传 Excel 文件' }, { status: 400 });
    }

    const buffer = await file.arrayBuffer();
    const XLSX = await import('xlsx');
    const wb = XLSX.read(new Uint8Array(buffer), { type: 'array' });

    if (!wb.SheetNames || wb.SheetNames.length === 0) {
      return NextResponse.json({ error: 'Excel 文件中没有工作表' }, { status: 400 });
    }

    const ws = wb.Sheets[wb.SheetNames[0]];
    const rawData = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as unknown[][];

    if (rawData.length < 2) {
      return NextResponse.json({ error: 'Excel 文件数据为空或格式不正确' }, { status: 400 });
    }

    // 确保 end_date 列允许 NULL（业务上可选，不填表示永久有效）
    try { await sql`ALTER TABLE fee_rules ALTER COLUMN end_date DROP NOT NULL`; } catch { /* 忽略 */ }

    const headers = (rawData[0] as string[]).map(h => String(h).trim());
    const colMap: Record<string, number> = {};
    for (const [label] of Object.entries(FIELD_MAP)) {
      const idx = headers.findIndex(h => h === label);
      if (idx === -1) {
        return NextResponse.json({ error: `缺少必需列：【${label}】` }, { status: 400 });
      }
      colMap[FIELD_MAP[label]] = idx;
    }

    const rows = rawData.slice(1).filter(row => row.some(cell => cell !== '' && cell !== null && cell !== undefined));
    if (rows.length === 0) {
      return NextResponse.json({ error: 'Excel 文件中没有有效数据行' }, { status: 400 });
    }
    if (rows.length > 500) {
      return NextResponse.json({ error: '单次导入最多支持 500 条数据' }, { status: 400 });
    }

    // Load fee types for lookup
    const feeTypes = await sql`SELECT id, fee_code, fee_name FROM fee_types`;
    const feeTypeMap = new Map<string, string>(feeTypes.map(ft => [String(ft.fee_name), String(ft.fee_code)]));

    const parsed: Array<{
      row: number;
      fee_name: string;
      fee_code: string;
      settlement_subject: string;
      settlement_flow: string;
      income_org: string;
      expense_org: string;
      bill_node: string;
      settlement_node: string;
      start_date: string;
      end_date: string;
      remark: string;
      errors: string[];
    }> = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] as string[];
      const rowNum = i + 2;
      const errs: string[] = [];

      // feeName → fee_code lookup
      const feeNameRaw = String(row[colMap.feeName] || '').trim();
      let fee_name = '';
      let fee_code = '';
      if (!feeNameRaw) {
        errs.push('费用名称不能为空');
      } else {
        const code = feeTypeMap.get(feeNameRaw);
        if (!code) {
          errs.push(`费用名称"${feeNameRaw}"不存在于【费用类型维护】中`);
        } else {
          fee_name = feeNameRaw;
          fee_code = code;
        }
      }

      const settlement_subject = String(row[colMap.settlementSubject] || '').trim();
      if (!settlement_subject) errs.push('结算主体不能为空');
      else if (!SETTLEMENT_SUBJECTS.includes(settlement_subject)) errs.push(`结算主体无效，有效值：${SETTLEMENT_SUBJECTS.join('、')}`);

      const settlement_flow = String(row[colMap.settlementFlow] || '').trim();
      if (!settlement_flow) errs.push('结算流向不能为空');
      else if (!SETTLEMENT_FLOWS.includes(settlement_flow)) errs.push(`结算流向无效，可选值较多，请参考模板【填写说明】工作表`);

      const income_org = String(row[colMap.incomeOrg] || '').trim();
      if (!income_org) errs.push('收入机构不能为空');
      else if (!ORG_OPTIONS.includes(income_org)) errs.push(`收入机构无效，请参考模板【填写说明】工作表`);

      const expense_org = String(row[colMap.expenseOrg] || '').trim();
      if (!expense_org) errs.push('支出机构不能为空');
      else if (!ORG_OPTIONS.includes(expense_org)) errs.push(`支出机构无效，请参考模板【填写说明】工作表`);

      const bill_node = String(row[colMap.billNode] || '').trim();
      if (!bill_node) errs.push('账单节点不能为空');
      else if (!BILL_NODES.includes(bill_node)) errs.push(`账单节点无效，有效值：${BILL_NODES.join('、')}`);

      // 结算节点：非必填，若填写则校验值有效性
      const settlement_node = String(row[colMap.settlementNode] || '').trim();
      if (settlement_node && !BILL_NODES.includes(settlement_node)) errs.push(`结算节点无效，有效值：${BILL_NODES.join('、')}`);

      const start_date = String(row[colMap.startDate] || '').trim();
      if (!start_date) errs.push('生效日期不能为空');
      else if (!/^\d{4}-\d{2}-\d{2}$/.test(start_date)) errs.push('生效日期格式错误，应为 YYYY-MM-DD');

      const end_date = String(row[colMap.endDate] || '').trim();
      if (!end_date) errs.push('失效日期不能为空');
      else if (!/^\d{4}-\d{2}-\d{2}$/.test(end_date)) errs.push('失效日期格式错误，应为 YYYY-MM-DD');
      if (start_date && end_date && start_date > end_date) errs.push('失效日期必须大于等于生效日期');

      const remark = String(row[colMap.remark] || '').trim();
      if (remark.length > 256) errs.push('备注最多256个字符');

      parsed.push({
        row: rowNum, fee_name, fee_code, settlement_subject, settlement_flow,
        income_org, expense_org, bill_node, settlement_node,
        start_date, end_date, remark, errors: errs,
      });
    }

    return NextResponse.json({
      total: parsed.length,
      validCount: parsed.filter(r => r.errors.length === 0).length,
      errorCount: parsed.filter(r => r.errors.length > 0).length,
      preview: parsed.slice(0, 20),
      allRows: parsed,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: '解析 Excel 文件失败：' + msg }, { status: 500 });
  }
}

// PUT /api/fee-rules/import → 确认写入
export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { rows, creator = '导入' } = body as {
      rows: Array<{
        fee_name: string;
        fee_code: string;
        settlement_subject: string;
        settlement_flow: string;
        income_org: string;
        expense_org: string;
        bill_node: string;
        settlement_node: string;
        start_date: string;
        end_date: string;
        remark: string;
      }>;
      creator?: string;
    };

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: '没有可导入的数据' }, { status: 400 });
    }

    // 确保 end_date 列允许 NULL（业务上可选，不填表示永久有效）
    try {
      await sql`ALTER TABLE fee_rules ALTER COLUMN end_date DROP NOT NULL`;
    } catch { /* 列可能已允许NULL，忽略 */ }

    let inserted = 0;
    const errors: string[] = [];

    for (const row of rows) {
      try {
        const endDateVal = row.end_date || null;
        await sql`
          INSERT INTO fee_rules (
            fee_name, fee_code, settlement_subject, settlement_flow,
            income_org, expense_org, bill_node, settlement_node,
            start_date, end_date, remark, status, creator, updater
          ) VALUES (
            ${row.fee_name}, ${row.fee_code}, ${row.settlement_subject}, ${row.settlement_flow},
            ${row.income_org}, ${row.expense_org}, ${row.bill_node}, ${row.settlement_node},
            ${row.start_date}, ${endDateVal}, ${row.remark}, 'pending', ${creator}, ${creator}
          )
        `;
        inserted++;
      } catch (e) {
        errors.push(`${row.fee_name} 写入失败`);
      }
    }

    return NextResponse.json({ inserted, errors: errors.slice(0, 50), total: rows.length });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
