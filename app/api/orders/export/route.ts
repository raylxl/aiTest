import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import type { ParsedOrder } from '@/types/rule';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { orders, format = 'xlsx' } = body;

    if (!orders || !Array.isArray(orders) || orders.length === 0) {
      return NextResponse.json(
        { error: '没有可导出的数据' },
        { status: 400 }
      );
    }

    // 创建工作簿
    const wb = XLSX.utils.book_new();
    
    // 准备表头
    const headers = [
      '序号', '运单号', '发货人', '发货人电话', '发货地址',
      '收货人', '收货人电话', '收货地址',
      '物品名称', '物品编码', '物品分类', '规格型号', '数量', '单位'
    ];

    // 准备数据
    const data = orders.map((order: ParsedOrder, index: number) => [
      index + 1,
      order.orderNo || '',
      order.senderName || '',
      order.senderPhone || '',
      order.senderAddress || '',
      order.receiverName || '',
      order.receiverPhone || '',
      order.receiverAddress || '',
      order.itemName || '',
      order.itemCode || '',
      order.itemCategory || '',
      order.specification || '',
      order.quantity || '',
      order.unit || '',
    ]);

    // 创建工作表
    const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);

    // 设置列宽
    ws['!cols'] = [
      { wch: 6 },   // 序号
      { wch: 20 },  // 运单号
      { wch: 10 },  // 发货人
      { wch: 15 },  // 发货人电话
      { wch: 30 },  // 发货地址
      { wch: 10 },  // 收货人
      { wch: 15 },  // 收货人电话
      { wch: 30 },  // 收货地址
      { wch: 20 },  // 物品名称
      { wch: 15 },  // 物品编码
      { wch: 10 },  // 物品分类
      { wch: 15 },  // 规格型号
      { wch: 8 },   // 数量
      { wch: 6 },   // 单位
    ];

    // 添加工作表到工作簿
    XLSX.utils.book_append_sheet(wb, ws, '运单数据');

    // 生成文件
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    // 返回文件
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename=orders_${Date.now()}.xlsx`,
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
