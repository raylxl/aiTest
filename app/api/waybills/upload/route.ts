import { NextResponse } from 'next/server';
import sql, { initDB } from '@/lib/db';
import { COLUMN_ALIAS_MAP, type WaybillRow } from '@/lib/waybill-types';
import crypto from 'crypto';

const TEMP_LAYER_OPTIONS = ['常温', '冷藏', '冷冻'];
const MAX_IMPORT = 2000;

// 标准化列名（trim+小写）
function normalizeKey(s: string): string {
  return String(s || '').trim();
}

// 查找列名对应的字段key
function findFieldKey(colName: string): string | null {
  const key = normalizeKey(colName);
  return COLUMN_ALIAS_MAP[key] || COLUMN_ALIAS_MAP[key.toLowerCase()] || null;
}

// 为一行数据生成映射
function buildMapping(headers: string[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  for (const h of headers) {
    const fk = findFieldKey(h);
    if (fk) mapping[h] = fk;
  }
  return mapping;
}

// 生成列名指纹（用于模板记忆）
function generateHeaderHash(headers: string[], mapping: Record<string, string>): string {
  // 按列顺序取映射后的字段名，生成指纹
  const fields = headers.map(h => mapping[h] || '').filter(Boolean);
  return crypto.createHash('md5').update(fields.join(',')).digest('hex');
}

// 检测哪一行是表头（跳过头部的说明行）
function findHeaderRow(rawData: unknown[][], maxSkip = 5): { headerRow: number; headers: string[]; isGrouped: boolean } {
  // 先检查是否有分组标题行（第0行是分组标题，第1行是字段名）
  if (rawData.length >= 2) {
    const row0 = rawData[0] as unknown[];
    const row1 = rawData[1] as unknown[];
    const cells0 = row0.map(c => normalizeKey(c as string));
    const cells1 = row1.map(c => normalizeKey(c as string));

    // 检查第0行是否包含分组关键词
    const groupKeywords = ['发件方', '收件方', '货物信息', '发件人信息', '收件人信息'];
    const hasGroupKeyword = cells0.some(c => groupKeywords.some(kw => c.includes(kw)));

    if (hasGroupKeyword) {
      // 检查第1行是否是字段名行
      let matched1 = 0;
      for (const cell of cells1) {
        if (findFieldKey(cell)) matched1++;
      }
      if (matched1 >= 4) {
        return { headerRow: 1, headers: cells1, isGrouped: true };
      }
    }
  }

  // 普通模板检测逻辑
  for (let i = 0; i < Math.min(maxSkip, rawData.length); i++) {
    const row = rawData[i] as unknown[];
    const cells = row.map(c => normalizeKey(c as string));

    // 检查有多少个可识别的字段
    let matched = 0;
    for (const cell of cells) {
      if (findFieldKey(cell)) matched++;
    }

    // 如果匹配字段 >= 4，认为是表头行
    if (matched >= 4) {
      return { headerRow: i, headers: cells, isGrouped: false };
    }
  }
  // 默认第0行
  const row0 = (rawData[0] as unknown[] || []).map(c => normalizeKey(c as string));
  return { headerRow: 0, headers: row0, isGrouped: false };
}

// 处理分组表头（template4）
function parseGroupedHeaders(rawData: unknown[][], headerRow: number): Record<string, string> {
  // template4: row0=分组标题行, row1=实际字段名
  // 分组: 发件方信息(3列), 收件方信息(3列), 货物信息(3列+备注列)
  const groupRow = rawData[0] as unknown[] || [];
  const fieldRow = rawData[1] as unknown[] || [];

  const mapping: Record<string, string> = {};
  let groupStart = 0;

  for (let i = 0; i < fieldRow.length; i++) {
    const fieldName = normalizeKey(fieldRow[i] as string);
    const fk = findFieldKey(fieldName);
    if (fk) {
      mapping[(rawData[headerRow] as unknown[])[i] as string] = fk;
    }
  }

  // 也从fieldRow直接映射
  for (let i = 0; i < fieldRow.length; i++) {
    const fieldName = normalizeKey(fieldRow[i] as string);
    const fk = findFieldKey(fieldName);
    if (fk) {
      // 用列索引作为key
      mapping[`col_${i}`] = fk;
    }
  }

  return mapping;
}

// 校验单行数据
function validateRow(
  row: Record<string, string>,
  rowIndex: number,
  existingCodes: Set<string>,
  currentBatchCodes: Map<string, number>
): { errors: Record<string, string>; isValid: boolean } {
  const errors: Record<string, string> = {};

  // 必填校验
  const requiredFields: Array<{ key: string; label: string }> = [
    { key: 'sender_name', label: '发件人姓名' },
    { key: 'sender_phone', label: '发件人电话' },
    { key: 'sender_address', label: '发件人地址' },
    { key: 'receiver_name', label: '收件人姓名' },
    { key: 'receiver_phone', label: '收件人电话' },
    { key: 'receiver_address', label: '收件人地址' },
    { key: 'weight', label: '重量(kg)' },
    { key: 'quantity', label: '件数' },
    { key: 'temp_layer', label: '温层' },
  ];

  for (const f of requiredFields) {
    const val = String(row[f.key] || '').trim();
    if (!val) errors[f.key] = '不能为空';
  }

  // 电话格式（手机号 11位 或固话）
  const phoneFields = [
    { key: 'sender_phone', label: '发件人电话' },
    { key: 'receiver_phone', label: '收件人电话' },
  ];
  for (const f of phoneFields) {
    const val = String(row[f.key] || '').trim();
    if (val && !/^1[3-9]\d{9}$/.test(val) && !/^0\d{2,3}-?\d{7,8}$/.test(val)) {
      if (!errors[f.key]) errors[f.key] = '格式错误（手机号11位或固话格式）';
    }
  }

  // 重量正数
  const weight = parseFloat(row.weight);
  if (row.weight && (isNaN(weight) || weight <= 0)) {
    errors['weight'] = '必须为正数';
  }

  // 件数正整数
  const qty = parseInt(row.quantity);
  if (row.quantity && (isNaN(qty) || qty <= 0 || !Number.isInteger(qty))) {
    errors['quantity'] = '必须为正整数';
  }

  // 温层枚举值
  const temp = String(row.temp_layer || '').trim();
  if (temp && !TEMP_LAYER_OPTIONS.includes(temp)) {
    errors['temp_layer'] = `可选值：${TEMP_LAYER_OPTIONS.join('、')}`;
  }

  // 外部编码重复检测（批次内）
  const extCode = String(row.external_code || '').trim();
  if (extCode) {
    if (currentBatchCodes.has(extCode)) {
      const firstRow = currentBatchCodes.get(extCode)!;
      errors['external_code'] = `与第${firstRow}行重复`;
    } else {
      currentBatchCodes.set(extCode, rowIndex);
    }
  }

  return { errors, isValid: Object.keys(errors).length === 0 };
}

// POST /api/waybills/upload
export async function POST(request: Request) {
  try {
    await initDB();

    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: '请上传 Excel 文件' }, { status: 400 });
    }

    const allowedTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
    ];
    if (!allowedTypes.includes(file.type) && !file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      return NextResponse.json({ error: '仅支持 .xlsx 或 .xls 格式' }, { status: 400 });
    }

    const buffer = await file.arrayBuffer();
    const XLSX = await import('xlsx');
    const wb = XLSX.read(new Uint8Array(buffer), { type: 'array' });

    if (!wb.SheetNames || wb.SheetNames.length === 0) {
      return NextResponse.json({ error: 'Excel 文件中没有工作表' }, { status: 400 });
    }

    // 选择数据sheet（跳过"填写说明"类sheet）
    let sheetName = wb.SheetNames[0];
    for (const sn of wb.SheetNames) {
      if (sn.includes('说明') || sn.includes('readme') || sn.includes('guide')) continue;
      sheetName = sn;
      break;
    }

    const ws = wb.Sheets[sheetName];
    const rawData = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as unknown[][];

    if (rawData.length < 2) {
      return NextResponse.json({ error: 'Excel 文件数据为空或格式不正确' }, { status: 400 });
    }

    // 找到表头行
    const { headerRow, headers, isGrouped } = findHeaderRow(rawData);

    // 建立列名映射
    let mapping: Record<string, string> = buildMapping(headers);

    // 分组布局特殊处理（template4）
    // 分组模板：第0行是分组标题（如"发件方信息"），第1行是字段名（如"发件人"）
    // 数据从第2行开始
    if (isGrouped && rawData.length > headerRow + 1) {
      // 重新生成 headers 为字段名行（用于显示）
      // 映射使用列索引作为 key：group_col_0, group_col_1, ...
      const fieldRow = headers; // headers 已经是字段名行（第1行）
      const newMapping: Record<string, string> = {};
      for (let i = 0; i < fieldRow.length; i++) {
        const fn = normalizeKey(fieldRow[i]);
        const fk = findFieldKey(fn);
        if (fk) newMapping[`group_col_${i}`] = fk;
      }
      // 合并映射
      mapping = { ...mapping, ...newMapping };
    }

    if (Object.keys(mapping).length === 0) {
      return NextResponse.json({ error: '无法识别 Excel 表头，请手动选择列映射' }, { status: 400 });
    }

    // 生成模板指纹并查询是否已保存
    const headerHash = generateHeaderHash(headers, mapping);

    let savedMapping = null;
    try {
      const rows = await sql`SELECT header_columns FROM template_mappings WHERE header_hash = ${headerHash} LIMIT 1`;
      if (rows.length > 0) {
        savedMapping = rows[0].header_columns;
        // 如果已有保存的映射，覆盖
        if (savedMapping) mapping = savedMapping as Record<string, string>;
      }
    } catch {
      // 表可能不存在，忽略
    }

    // 解析数据行
    const dataRows = rawData.slice(headerRow + 1);
    if (dataRows.length === 0) {
      return NextResponse.json({ error: 'Excel 文件中没有有效数据行' }, { status: 400 });
    }

    if (dataRows.length > MAX_IMPORT) {
      return NextResponse.json({ error: `单次导入最多支持 ${MAX_IMPORT} 条，当前文件有 ${dataRows.length} 条` }, { status: 400 });
    }

    // 检查外部编码是否已存在于数据库
    const externalCodes: string[] = [];
    const currentBatchCodes = new Map<string, number>(); // code → 首次出现的Excel行号

    const parsedRows: WaybillRow[] = [];

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i] as unknown[];
      const rowIndex = i + headerRow + 2; // 1-based Excel行号

      // 跳过全空行
      if (!row.some(c => c !== '' && c !== null && c !== undefined)) continue;

      // 将行数据映射到字段
      const mapped: Record<string, string> = {};

      // 处理分组布局（template4）
      if (isGrouped) {
        for (let colIdx = 0; colIdx < row.length; colIdx++) {
          const fk = mapping[`group_col_${colIdx}`];
          if (fk) mapped[fk] = String(row[colIdx] ?? '').trim();
        }
      } else {
        // 普通布局：按列名匹配
        for (let colIdx = 0; colIdx < row.length; colIdx++) {
          const headerName = headers[colIdx];
          const fk = mapping[headerName];
          if (fk) mapped[fk] = String(row[colIdx] ?? '').trim();
        }
      }

      const extCode = mapped.external_code || '';
      if (extCode) {
        if (!externalCodes.includes(extCode)) externalCodes.push(extCode);
      }

      const { errors, isValid } = validateRow(mapped, rowIndex, new Set(), currentBatchCodes);

      parsedRows.push({
        _rowIndex: rowIndex,
        _selected: true,
        external_code: mapped.external_code || '',
        sender_name: mapped.sender_name || '',
        sender_phone: mapped.sender_phone || '',
        sender_address: mapped.sender_address || '',
        receiver_name: mapped.receiver_name || '',
        receiver_phone: mapped.receiver_phone || '',
        receiver_address: mapped.receiver_address || '',
        weight: mapped.weight || '',
        quantity: mapped.quantity || '',
        temp_layer: mapped.temp_layer || '',
        remark: mapped.remark || '',
        _errors: errors,
        _isValid: isValid,
      });
    }

    // 批量查询已存在的外部编码（逐个查询）
    const existingCodeSet = new Set<string>();
    if (externalCodes.length > 0) {
      try {
        for (const code of externalCodes) {
          const exist = await sql`SELECT id FROM waybills WHERE external_code = ${code} LIMIT 1`;
          if (exist.length > 0) existingCodeSet.add(code);
        }
      } catch {
        // 查询失败，忽略
      }
    }

    // 标记数据库中已存在的外部编码
    const finalRows = parsedRows.map(row => {
      if (row.external_code && existingCodeSet.has(row.external_code)) {
        return {
          ...row,
          _errors: { ...row._errors, external_code: '已存在（数据库已有此编码）' },
          _isValid: false,
        };
      }
      return row;
    });

    const totalErrors = finalRows.filter(r => !r._isValid).length;

    return NextResponse.json({
      headers,
      rows: finalRows,
      totalCount: finalRows.length,
      totalErrors,
      mapping,
      headerHash,
      isGrouped,
      templateName: sheetName,
      hasSavedMapping: !!savedMapping,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: '解析 Excel 文件失败：' + msg }, { status: 500 });
  }
}
