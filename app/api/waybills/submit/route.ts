import { NextResponse } from 'next/server';
import sql, { initDB } from '@/lib/db';
import type { WaybillRow, ValidationError } from '@/lib/waybill-types';

const TEMP_LAYER_OPTIONS = ['常温', '冷藏', '冷冻'];

// 校验单行
function validateRow(row: WaybillRow, rowIndex: number): ValidationError[] {
  const errors: ValidationError[] = [];
  const reqFields = [
    { k: 'sender_name', l: '发件人姓名' },
    { k: 'sender_phone', l: '发件人电话' },
    { k: 'sender_address', l: '发件人地址' },
    { k: 'receiver_name', l: '收件人姓名' },
    { k: 'receiver_phone', l: '收件人电话' },
    { k: 'receiver_address', l: '收件人地址' },
    { k: 'weight', l: '重量(kg)' },
    { k: 'quantity', l: '件数' },
    { k: 'temp_layer', l: '温层' },
  ];

  for (const f of reqFields) {
    const val = String(row[f.k as keyof WaybillRow] || '').trim();
    if (!val) {
      errors.push({ row: rowIndex, field: f.l, value: val, message: '不能为空' });
    }
  }

  const phoneFields = [
    { k: 'sender_phone', l: '发件人电话' },
    { k: 'receiver_phone', l: '收件人电话' },
  ];
  for (const f of phoneFields) {
    const val = String(row[f.k as keyof WaybillRow] || '').trim();
    if (val && !/^1[3-9]\d{9}$/.test(val) && !/^0\d{2,3}-?\d{7,8}$/.test(val)) {
      errors.push({ row: rowIndex, field: f.l, value: val, message: '格式错误（手机号11位或固话）' });
    }
  }

  const weight = parseFloat(String(row.weight));
  if (row.weight !== '' && (isNaN(weight) || weight <= 0)) {
    errors.push({ row: rowIndex, field: '重量(kg)', value: String(row.weight), message: '必须为正数' });
  }

  const qty = parseInt(String(row.quantity));
  if (row.quantity !== '' && (isNaN(qty) || qty <= 0 || !Number.isInteger(qty))) {
    errors.push({ row: rowIndex, field: '件数', value: String(row.quantity), message: '必须为正整数' });
  }

  const temp = String(row.temp_layer || '').trim();
  if (temp && !TEMP_LAYER_OPTIONS.includes(temp)) {
    errors.push({ row: rowIndex, field: '温层', value: temp, message: `可选值：${TEMP_LAYER_OPTIONS.join('、')}` });
  }

  return errors;
}

// POST /api/waybills/submit
export async function POST(request: Request) {
  try {
    await initDB();

    const body = await request.json();
    const { rows, skipDuplicates = false } = body as {
      rows: WaybillRow[];
      skipDuplicates?: boolean;
    };

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: '没有可提交的数据' }, { status: 400 });
    }

    // 过滤掉未选中的行
    const selectedRows = rows.filter(r => r._selected !== false);

    // 全部重新校验
    const allErrors: ValidationError[] = [];
    for (let i = 0; i < selectedRows.length; i++) {
      const errs = validateRow(selectedRows[i], i + 1);
      allErrors.push(...errs);
    }

    if (allErrors.length > 0) {
      return NextResponse.json({
        error: '存在校验错误，请修正后再提交',
        errors: allErrors.slice(0, 100),
      }, { status: 400 });
    }

    let success = 0;
    let failed = 0;
    const submitErrors: ValidationError[] = [];

    for (let i = 0; i < selectedRows.length; i++) {
      const row = selectedRows[i];
      try {
        // 检查数据库重复
        const extCode = String(row.external_code || '').trim();
        if (extCode) {
          const exist = await sql`SELECT id FROM waybills WHERE external_code = ${extCode}`;
          if (exist.length > 0) {
            if (skipDuplicates) {
              failed++;
              continue;
            } else {
              submitErrors.push({ row: i + 1, field: '外部编码', value: extCode, message: '数据库中已存在' });
              failed++;
              continue;
            }
          }
        }

        await sql`
          INSERT INTO waybills (
            external_code, sender_name, sender_phone, sender_address,
            receiver_name, receiver_phone, receiver_address,
            weight, quantity, temp_layer, remark
          ) VALUES (
            ${extCode}, ${String(row.sender_name).trim()},
            ${String(row.sender_phone).trim()},
            ${String(row.sender_address).trim()},
            ${String(row.receiver_name).trim()},
            ${String(row.receiver_phone).trim()},
            ${String(row.receiver_address).trim()},
            ${parseFloat(String(row.weight)) || 0},
            ${parseInt(String(row.quantity)) || 0},
            ${String(row.temp_layer).trim()},
            ${String(row.remark).trim()}
          )
        `;
        success++;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        submitErrors.push({ row: i + 1, field: '数据', value: '', message: msg });
        failed++;
      }
    }

    return NextResponse.json({ success, failed, errors: submitErrors.slice(0, 50) });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
