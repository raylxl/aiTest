import { NextResponse } from 'next/server';

export async function GET() {
  const XLSX = await import('xlsx');

  const headers = ['费用名称', '结算主体', '结算流向', '收入机构', '支出机构', '账单节点', '结算节点', '生效日期', '失效日期', '备注'];
  const sampleRows = [
    ['派送费', '寄方', '总部收中心', '总部', '寄件财务中心', '开单', '签收', '2026-01-01', '2026-12-31', '示例备注'],
    ['揽收费', '派方', '中心收网点', '派件财务中心', '目的网点', '揽收网点扫描', '签收', '2026-01-01', '2026-12-31', ''],
  ];

  const sheetData = [headers, ...sampleRows];
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(sheetData);

  ws['!cols'] = [
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
  ];

  const commentData = [
    ['字段名', '填写说明', '可选值'],
    ['费用名称', '必填，必须与【费用类型维护】中的费用名称完全一致', '如：派送费'],
    ['结算主体', '必填，只能填以下值之一', '寄方 / 派方 / 中转'],
    ['结算流向', '必填，只能填以下值之一', '总部收中心 / 中心收网点 / 总部收网点 / 一级网点收二级网点 / 总部付中心 / 中心付网点 / 总部付网点 / 一级网点付二级网点 / 寄件中心付派件中心 / 寄件中心付中转中心 / 中转中心付中转中心 / 中心付中心 / 一级网点收一级网点'],
    ['收入机构', '必填，只能填以下值之一', '总部 / 寄件财务中心 / 寄件网点 / 寄件一级网点 / 寄件二级网点 / 中转财务中心 / 派件财务中心 / 目的网点 / 目的一级网点 / 目的二级网点 / 上一站'],
    ['支出机构', '必填，只能填以下值之一（同收入机构）', '同上'],
    ['账单节点', '必填，只能填以下值之一', '开单 / 揽收网点扫描 / 中转中心扫描 / 派件网点扫描 / 到货 / 签收'],
    ['结算节点', '非必填，若填写只能填以下值之一', '开单 / 揽收网点扫描 / 中转中心扫描 / 派件网点扫描 / 到货 / 签收'],
    ['生效日期', '必填，格式：YYYY-MM-DD', '如：2026-01-01'],
    ['失效日期', '必填，格式：YYYY-MM-DD', '如：2026-12-31'],
    ['备注', '选填，最多256个字符', ''],
  ];
  const wsComment = XLSX.utils.aoa_to_sheet(commentData);
  wsComment['!cols'] = [{ wch: 12 }, { wch: 45 }, { wch: 50 }];

  XLSX.utils.book_append_sheet(wb, ws, '费用规则导入');
  XLSX.utils.book_append_sheet(wb, wsComment, '填写说明');

  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const uint8 = new Uint8Array(buf);

  return new NextResponse(uint8, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent('费用规则导入模板')}.xlsx`,
    },
  });
}
