import { NextResponse } from 'next/server';

export async function GET() {
  const XLSX = await import('xlsx');

  const headers = ['费用编号', '费用名称', '所属业务域', '所属报价', '备注', '创建人'];
  const sampleRows = [
    ['1001', '派送费', '运配', '平台价格、成本价格', '示例备注', '管理员'],
    ['1002', '揽收费', '运配', '平台价格', '', ''],
    ['1003', '仓储费', '仓储', '成本价格、网点价格', '', ''],
  ];

  const sheetData = [headers, ...sampleRows];
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(sheetData);

  ws['!cols'] = [
    { wch: 12 },  // 费用编号
    { wch: 20 },  // 费用名称
    { wch: 10 },  // 所属业务域
    { wch: 28 },  // 所属报价
    { wch: 30 },  // 备注
    { wch: 12 },  // 创建人
  ];

  // Add validation dropdown hint in a comment sheet
  const commentSheetData = [
    ['字段名', '填写说明', '可选值'],
    ['费用编号', '必填，纯数字，最多8位，不可重复', '如：1001'],
    ['费用名称', '必填，最多32个字符', '如：派送费'],
    ['所属业务域', '必填，只能填以下四个值之一', '运配 / 仓储 / 干线 / 配送'],
    ['所属报价', '选填，多个用中文顿号分隔', '平台价格、成本价格、基础价格、网点价格、增值服务价格'],
    ['备注', '选填，最多256个字符', ''],
    ['创建人', '选填，不填则默认"导入"', ''],
  ];
  const wsComment = XLSX.utils.aoa_to_sheet(commentSheetData);
  wsComment['!cols'] = [{ wch: 12 }, { wch: 30 }, { wch: 35 }];

  XLSX.utils.book_append_sheet(wb, ws, '费用类型导入');
  XLSX.utils.book_append_sheet(wb, wsComment, '填写说明');

  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const uint8 = new Uint8Array(buf);

  return new NextResponse(uint8, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent('费用类型导入模板')}.xlsx`,
    },
  });
}
