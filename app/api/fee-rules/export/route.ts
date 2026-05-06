import { NextResponse } from 'next/server';
import sql from '@/lib/db';

export async function GET() {
  try {
    const rows = await sql`SELECT * FROM fee_rules ORDER BY id DESC`;

    const XLSX = await import('xlsx');

    const sheetData = rows.map((r: Record<string, unknown>, idx: number) => ({
      '序号': idx + 1,
      '费用名称': String(r.fee_name),
      '结算主体': r.settlement_subject,
      '结算流向': r.settlement_flow,
      '收入机构': r.income_org,
      '支出机构': r.expense_org,
      '账单节点': r.bill_node,
      '结算节点': r.settlement_node,
      '生效日期': r.start_date ? String(r.start_date).split('T')[0] : '',
      '失效日期': r.end_date ? String(r.end_date).split('T')[0] : '',
      '备注': r.remark || '',
      '审核状态': r.status === 'approved' ? '已审核' : '未审核',
      '创建人': r.creator,
      '创建时间': r.create_time ? String(r.create_time).replace('T', ' ').slice(0, 19) : '',
      '修改人': r.updater || '',
      '修改时间': r.update_time ? String(r.update_time).replace('T', ' ').slice(0, 19) : '',
      '审核人': r.audit_person || '',
      '审核时间': r.audit_time ? String(r.audit_time).replace('T', ' ').slice(0, 19) : '',
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(sheetData);

    ws['!cols'] = [
      { wch: 6 },   // 序号
      { wch: 22 },  // 费用名称
      { wch: 10 },  // 结算主体
      { wch: 18 },  // 结算流向
      { wch: 16 },  // 收入机构
      { wch: 16 },  // 支出机构
      { wch: 14 },  // 账单节点
      { wch: 14 },  // 结算节点
      { wch: 12 },  // 生效日期
      { wch: 12 },  // 失效日期
      { wch: 30 },  // 备注
      { wch: 10 },  // 审核状态
      { wch: 12 },  // 创建人
      { wch: 20 },  // 创建时间
      { wch: 12 },  // 修改人
      { wch: 20 },  // 修改时间
      { wch: 12 },  // 审核人
      { wch: 20 },  // 审核时间
    ];

    XLSX.utils.book_append_sheet(wb, ws, '费用规则');

    const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const uint8 = new Uint8Array(buf);
    const pad = (n: number) => String(n).padStart(2, '0');
    const now = new Date();
    const ts = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;

    return new NextResponse(uint8, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent('费用规则维护_' + ts)}.xlsx`,
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
