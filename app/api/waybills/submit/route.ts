import { NextResponse } from 'next/server';
import sql, { initDB, getNeonClient } from '@/lib/db';
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
    // overwrite 模式下 skipDuplicates=false，改为真正覆盖
    const isOverwrite = !skipDuplicates;

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

    // ========== 批量优化：一次查询所有重复的 external_code ==========
    const extCodes = selectedRows
      .map(r => String(r.external_code || '').trim())
      .filter(Boolean);

    const existCodes = new Set<string>();
    if (extCodes.length > 0) {
      // PostgreSQL: WHERE external_code = ANY($1)
      const existRows = await sql`
        SELECT external_code FROM waybills
        WHERE external_code = ANY(${extCodes})
      `;
      for (const r of existRows) {
        existCodes.add(String(r.external_code));
      }
    }

    // 过滤出需要插入的行
    const toInsert = selectedRows.filter(r => {
      const code = String(r.external_code || '').trim();
      if (!code) return true; // 无外部编码直接插入
      if (existCodes.has(code)) {
        return isOverwrite; // overwrite 模式下也插入（后面用 ON CONFLICT DO UPDATE）
      }
      return true;
    });

    // 记录重复错误（skip 模式下且有重复时记录）
    const submitErrors: ValidationError[] = [];
    if (!isOverwrite) {
      for (let i = 0; i < selectedRows.length; i++) {
        const code = String(selectedRows[i].external_code || '').trim();
        if (code && existCodes.has(code)) {
          submitErrors.push({ row: i + 1, field: '外部编码', value: code, message: '数据库中已存在' });
        }
      }
    }

    let success = 0;
    let failed = toInsert.length === 0 ? (skipDuplicates ? selectedRows.length - toInsert.length : submitErrors.length) : 0;

    // ========== 批量插入：UNNEST 语法，支持 ON CONFLICT DO UPDATE ==========
    if (toInsert.length > 0) {
      try {
        const extArr = toInsert.map(r => String(r.external_code || '').trim());
        const senderNameArr = toInsert.map(r => String(r.sender_name || '').trim());
        const senderPhoneArr = toInsert.map(r => String(r.sender_phone || '').trim());
        const senderAddrArr = toInsert.map(r => String(r.sender_address || '').trim());
        const recvNameArr = toInsert.map(r => String(r.receiver_name || '').trim());
        const recvPhoneArr = toInsert.map(r => String(r.receiver_phone || '').trim());
        const recvAddrArr = toInsert.map(r => String(r.receiver_address || '').trim());
        const weightArr = toInsert.map(r => parseFloat(String(r.weight)) || 0);
        const qtyArr = toInsert.map(r => parseInt(String(r.quantity)) || 0);
        const tempArr = toInsert.map(r => String(r.temp_layer || '').trim());
        const remarkArr = toInsert.map(r => String(r.remark || '').trim());

        // overwrite 模式：ON CONFLICT DO UPDATE；skip 模式：ON CONFLICT DO NOTHING
        const onConflictAction = isOverwrite
          ? `ON CONFLICT (external_code) DO UPDATE SET
               sender_name=EXCLUDED.sender_name, sender_phone=EXCLUDED.sender_phone,
               sender_address=EXCLUDED.sender_address, receiver_name=EXCLUDED.receiver_name,
               receiver_phone=EXCLUDED.receiver_phone, receiver_address=EXCLUDED.receiver_address,
               weight=EXCLUDED.weight, quantity=EXCLUDED.quantity,
               temp_layer=EXCLUDED.temp_layer, remark=EXCLUDED.remark`
          : `ON CONFLICT (external_code) DO NOTHING`;

        // 拼接含 UNNEST + ON CONFLICT 的 INSERT（onConflictAction 是受控字符串，直接内联）
        const insertSQL = `
          INSERT INTO waybills (
            external_code, sender_name, sender_phone, sender_address,
            receiver_name, receiver_phone, receiver_address,
            weight, quantity, temp_layer, remark
          )
          SELECT * FROM UNNEST(
            '${extArr.join("','")}'::text[],
            '${senderNameArr.join("','")}'::text[],
            '${senderPhoneArr.join("','")}'::text[],
            '${senderAddrArr.join("','")}'::text[],
            '${recvNameArr.join("','")}'::text[],
            '${recvPhoneArr.join("','")}'::text[],
            '${recvAddrArr.join("','")}'::text[],
            ARRAY[${weightArr.join(",")}]::numeric[],
            ARRAY[${qtyArr.join(",")}]::int[],
            '${tempArr.join("','")}'::text[],
            '${remarkArr.join("','")}'::text[]
          )
          ${onConflictAction}
        `;
        await getNeonClient().unsafe(insertSQL);
        success = toInsert.length;
        if (!isOverwrite) {
          failed = submitErrors.length;
        }
      } catch (e) {
        // 批量插入失败时，逐条插入兜底
        const msg = e instanceof Error ? e.message : String(e);
        submitErrors.push({ row: 0, field: '数据', value: '', message: `批量插入失败: ${msg}` });
        failed = toInsert.length;
      }
    }

    return NextResponse.json({
      success,
      failed: failed + (isOverwrite ? 0 : submitErrors.length),
      errors: submitErrors.slice(0, 50),
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
