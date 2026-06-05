import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import type { ParsedOrder } from '@/types/rule';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { orders } = body as { orders: ParsedOrder[] };

    if (!orders || !Array.isArray(orders) || orders.length === 0) {
      return NextResponse.json(
        { error: '没有可导出的数据' },
        { status: 400 }
      );
    }

    const wb = XLSX.utils.book_new();

    const headers = [
      '序号',
      '外部编码',
      '收货门店',
      '收件人姓名',
      '收件人电话',
      '收件人地址',
      'SKU物品编码',
      'SKU物品名称',
      'SKU发货数量',
      'SKU规格型号',
      '备注',
    ];

    const data = orders.map((order: ParsedOrder, index: number) => [
      index + 1,
      order.orderNo || '',
      order.storeName || '',
      order.receiverName || '',
      order.receiverPhone || '',
      order.receiverAddress || '',
      order.itemCode || '',
      order.itemName || '',
      order.quantity ?? '',
      order.specification || '',
      order.remark || '',
    ]);

    const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);

    ws['!cols'] = [
      { wch: 6 },
      { wch: 18 },
      { wch: 20 },
      { wch: 14 },
      { wch: 16 },
      { wch: 32 },
      { wch: 18 },
      { wch: 24 },
      { wch: 12 },
      { wch: 18 },
      { wch: 24 },
    ];

    XLSX.utils.book_append_sheet(wb, ws, '导入结果');

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename=import_result_${Date.now()}.xlsx`,
      },
    });
  } catch (error) {
    console.error('导出失败:', error);
    return NextResponse.json(
      { error: '导出失败' },
      { status: 500 }
    );
  }
}
