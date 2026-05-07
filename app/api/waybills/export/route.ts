import { NextResponse } from 'next/server';
import { getNeonClient, initDB } from '@/lib/db';
import type { Waybill, WaybillRow } from '@/lib/waybill-types';

const FIELD_LABELS: Record<string, string> = {
  external_code: '外部编码',
  sender_name: '发件人姓名',
  sender_phone: '发件人电话',
  sender_address: '发件人地址',
  receiver_name: '收件人姓名',
  receiver_phone: '收件人电话',
  receiver_address: '收件人地址',
  weight: '重量(kg)',
  quantity: '件数',
  temp_layer: '温层',
  remark: '备注',
  status: '状态',
  created_at: '创建时间',
};

const STATUS_MAP: Record<string, string> = {
  submitted: '已提交',
  approved: '已审核',
  rejected: '已驳回',
};

// GET /api/waybills/export - 根据查询条件导出运单数据为Excel
export async function GET(request: Request) {
  try {
    await initDB();
    const { searchParams } = new URL(request.url);
    const neon = getNeonClient();

    const extCode = searchParams.get('external_code') || '';
    const senderName = searchParams.get('sender_name') || '';
    const senderPhone = searchParams.get('sender_phone') || '';
    const recvName = searchParams.get('receiver_name') || '';
    const recvPhone = searchParams.get('receiver_phone') || '';
    const startDate = searchParams.get('start_date') || '';
    const endDate = searchParams.get('end_date') || '';

    // 根据是否有条件选择不同的查询
    let rows: Waybill[] = [];
    if (extCode) {
      rows = await neon`SELECT * FROM waybills WHERE external_code ILIKE ${'%' + extCode + '%'} ORDER BY created_at DESC LIMIT 10000` as unknown as Waybill[];
    } else if (senderName) {
      rows = await neon`SELECT * FROM waybills WHERE sender_name ILIKE ${'%' + senderName + '%'} ORDER BY created_at DESC LIMIT 10000` as unknown as Waybill[];
    } else if (senderPhone) {
      rows = await neon`SELECT * FROM waybills WHERE sender_phone ILIKE ${'%' + senderPhone + '%'} ORDER BY created_at DESC LIMIT 10000` as unknown as Waybill[];
    } else if (recvName) {
      rows = await neon`SELECT * FROM waybills WHERE receiver_name ILIKE ${'%' + recvName + '%'} ORDER BY created_at DESC LIMIT 10000` as unknown as Waybill[];
    } else if (recvPhone) {
      rows = await neon`SELECT * FROM waybills WHERE receiver_phone ILIKE ${'%' + recvPhone + '%'} ORDER BY created_at DESC LIMIT 10000` as unknown as Waybill[];
    } else if (startDate && endDate) {
      rows = await neon`SELECT * FROM waybills WHERE created_at >= ${startDate + ' 00:00:00'} AND created_at <= ${endDate + ' 23:59:59'} ORDER BY created_at DESC LIMIT 10000` as unknown as Waybill[];
    } else if (startDate) {
      rows = await neon`SELECT * FROM waybills WHERE created_at >= ${startDate + ' 00:00:00'} ORDER BY created_at DESC LIMIT 10000` as unknown as Waybill[];
    } else if (endDate) {
      rows = await neon`SELECT * FROM waybills WHERE created_at <= ${endDate + ' 23:59:59'} ORDER BY created_at DESC LIMIT 10000` as unknown as Waybill[];
    } else {
      rows = await neon`SELECT * FROM waybills ORDER BY created_at DESC LIMIT 10000` as unknown as Waybill[];
    }

    if (!rows || rows.length === 0) {
      return NextResponse.json({ error: '没有可导出的数据' }, { status: 400 });
    }

    const XLSX = await import('xlsx');

    const sheetData = rows.map((r: Waybill, idx: number) => {
      const item: Record<string, unknown> = { '序号': idx + 1 };
      for (const [key, label] of Object.entries(FIELD_LABELS)) {
        let val = r[key as keyof Waybill];
        if (key === 'status') val = STATUS_MAP[String(val)] || val;
        if (key === 'created_at') {
          if (val) {
            const d = new Date(String(val));
            const p = (n: number) => String(n).padStart(2, '0');
            val = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
          } else {
            val = '';
          }
        }
        item[label] = val ?? '';
      }
      return item;
    });

    const ws = XLSX.utils.json_to_sheet(sheetData);

    const colWidths = [
      { wch: 6 },   // 序号
      { wch: 18 },  // 外部编码
      { wch: 12 },  // 发件人姓名
      { wch: 15 },  // 发件人电话
      { wch: 35 },  // 发件人地址
      { wch: 12 },  // 收件人姓名
      { wch: 15 },  // 收件人电话
      { wch: 35 },  // 收件人地址
      { wch: 10 },  // 重量
      { wch: 8 },   // 件数
      { wch: 10 },  // 温层
      { wch: 20 },  // 备注
      { wch: 10 },  // 状态
      { wch: 20 },  // 创建时间
    ];
    ws['!cols'] = colWidths;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '运单列表');
    const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const uint8 = new Uint8Array(buf);
    const pad = (n: number) => String(n).padStart(2, '0');
    const now = new Date();
    const ts = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;

    return new NextResponse(uint8, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent('运单列表_' + ts)}.xlsx`,
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST /api/waybills/export - 导出预览数据为Excel
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { rows } = body as { rows: WaybillRow[] };

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: '没有可导出的数据' }, { status: 400 });
    }

    const XLSX = await import('xlsx');

    // 构建导出数据
    const exportData = rows.map(row => {
      const item: Record<string, unknown> = { '行号': row._rowIndex };
      for (const [key, label] of Object.entries(FIELD_LABELS)) {
        const val = row[key as keyof WaybillRow];
        item[label] = val ?? '';
        if (row._errors?.[key]) {
          item[`${label}（错误）`] = row._errors[key];
        }
      }
      return item;
    });

    const ws = XLSX.utils.json_to_sheet(exportData);

    // 设置列宽
    const colWidths = [
      { wch: 6 },   // 行号
      { wch: 18 },  // 外部编码
      { wch: 12 },  // 发件人姓名
      { wch: 15 },  // 发件人电话
      { wch: 35 },  // 发件人地址
      { wch: 12 },  // 收件人姓名
      { wch: 15 },  // 收件人电话
      { wch: 35 },  // 收件人地址
      { wch: 10 },  // 重量
      { wch: 8 },   // 件数
      { wch: 10 },  // 温层
      { wch: 20 },  // 备注
    ];
    ws['!cols'] = colWidths;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '运单导入预览');
    const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });

    return new NextResponse(buf, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename*=UTF-8''waybill_import_${Date.now()}.xlsx`,
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
