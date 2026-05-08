import { NextResponse } from 'next/server';
import sql from '@/lib/db';

// ============ 多模板字段映射配置 ============
// key: 数据库字段名, value: 可能的 Excel 列名数组（按优先级排列，中文优先）
const FIELD_MAPS: Array<Record<string, string[]>> = [
  // 标准模板（鲸天系统）
  {
    fee_code: ['费用编号', '费用编码', '编号', '编码', 'fee_code', 'feeCode', 'Fee Code', 'Fee Code', 'code', 'Code', 'fee_id', 'feeId'],
    fee_name: ['费用名称', '名称', '费用名', 'fee_name', 'feeName', 'Fee Name', 'name', 'Name'],
    business_domain: ['所属业务域', '业务域', '业务类型', '业务线', 'business_domain', 'businessDomain', 'Business Domain', 'domain', 'Domain'],
    price_types: ['所属报价', '报价类型', '价格类型', '报价', 'price_types', 'priceTypes', 'Price Types', 'price', 'Price'],
    remark: ['备注', '说明', '描述', 'remark', 'Remark', 'note', 'Note', 'description', 'Description'],
    creator: ['创建人', '操作人', '录入人', 'creator', 'Creator', 'created_by', 'Created By'],
  },
  // 简写模板
  {
    fee_code: ['费用编号', '费用编码', '编号', '编码', 'fee_code', 'feeCode', 'Fee Code', 'code', 'Code', 'fee_id', 'feeId'],
    fee_name: ['费用名称', '名称', 'fee_name', 'feeName', 'Fee Name', 'name', 'Name'],
    business_domain: ['所属业务域', '业务域', '业务线', 'business_domain', 'businessDomain', 'Business Domain', 'domain', 'Domain'],
    price_types: ['所属报价', '报价', 'price_types', 'priceTypes', 'Price Types', 'price', 'Price'],
    remark: ['备注', 'remark', 'Remark', 'note', 'Note'],
    creator: ['创建人', '操作人', 'creator', 'Creator', 'created_by'],
  },
];

// 必需字段（必须匹配）
const REQUIRED_FIELDS = ['fee_code', 'fee_name', 'business_domain'];

const VALID_DOMAINS = ['运配', '仓储', '干线', '配送'];
const VALID_PRICE_TYPES = ['平台价格', '成本价格', '基础价格', '网点价格', '增值服务价格'];

// 根据表头自动选择映射方案
function autoDetectFieldMap(headers: string[]): { colMap: Record<string, number>; variant: number } | null {
  for (let v = 0; v < FIELD_MAPS.length; v++) {
    const fieldMap = FIELD_MAPS[v];
    const colMap: Record<string, number> = {};
    let matched = 0;
    const missingRequired: string[] = [];

    for (const field of REQUIRED_FIELDS) {
      const aliases = fieldMap[field] || [];
      const idx = headers.findIndex(h => aliases.includes(h));
      if (idx !== -1) {
        colMap[field] = idx;
        matched++;
      } else {
        missingRequired.push(field);
      }
    }

    // 尝试匹配可选字段
    for (const [field, aliases] of Object.entries(fieldMap)) {
      if (!REQUIRED_FIELDS.includes(field)) {
        const idx = headers.findIndex(h => aliases.includes(h));
        if (idx !== -1) colMap[field] = idx;
      }
    }

    // 必需字段全部匹配成功
    if (missingRequired.length === 0) {
      return { colMap, variant: v };
    }
  }
  return null;
}

// 生成表头 hash（用于模板记忆）
function hashHeaders(headers: string[]): string {
  const str = headers.join('|');
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

// POST /api/fees/import
// Body: FormData with field "file" (Excel file)
// 支持多模板自动识别 + 表头哈希（用于模板记忆）
export async function POST(request: Request) {
  try {
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
      return NextResponse.json({ error: '仅支持 .xlsx 或 .xls 格式的 Excel 文件' }, { status: 400 });
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

    // Parse header row
    const headers = (rawData[0] as string[]).map(h => String(h).trim());
    const headerHash = hashHeaders(headers);

    // 自动选择映射方案
    const detected = autoDetectFieldMap(headers);
    if (!detected) {
      return NextResponse.json({ error: '无法识别表头格式，请检查 Excel 列名是否包含：费用编号、费用名称、所属业务域' }, { status: 400 });
    }
    const { colMap, variant } = detected;

    // Parse data rows
    const rows = rawData.slice(1).filter(row => row.some(cell => cell !== '' && cell !== null && cell !== undefined));
    if (rows.length === 0) {
      return NextResponse.json({ error: 'Excel 文件中没有有效数据行' }, { status: 400 });
    }

    const MAX_ROWS = 5000;
    if (rows.length > MAX_ROWS) {
      return NextResponse.json({ error: `单次导入最多支持 ${MAX_ROWS} 条数据，当前文件有 ${rows.length} 条` }, { status: 400 });
    }

    // Field alias → DB field reverse map（用于前端显示原始列名）
    const fieldLabelMap: Record<string, string> = {};
    const usedFieldMap = FIELD_MAPS[variant];
    for (const [field, aliases] of Object.entries(usedFieldMap)) {
      for (const alias of aliases) {
        const colIdx = headers.indexOf(alias);
        if (colIdx !== -1 && colMap[field] === colIdx) {
          fieldLabelMap[field] = alias;
          break;
        }
      }
    }

    const parsed: Array<{
      row: number;
      fee_code: string;
      fee_name: string;
      business_domain: string;
      price_types: string[];
      remark: string;
      creator: string;
      errors: string[];
    }> = [];

    const feeCodeSet = new Set<string>();

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] as string[];
      const rowNum = i + 2; // Excel row number (1-indexed, header is row 1)
      const errs: string[] = [];

      // fee_code
      const fee_code = String(row[colMap.fee_code] || '').trim();
      if (!fee_code) {
        errs.push('费用编号不能为空');
      } else if (!/^\d+$/.test(fee_code)) {
        errs.push('费用编号只能输入数字');
      } else if (fee_code.length > 8) {
        errs.push('费用编号最多8位数字');
      } else if (feeCodeSet.has(fee_code)) {
        errs.push('费用编号在文件内重复');
      } else {
        feeCodeSet.add(fee_code);
      }

      // fee_name
      const fee_name = String(row[colMap.fee_name] || '').trim();
      if (!fee_name) {
        errs.push('费用名称不能为空');
      } else if (fee_name.length > 32) {
        errs.push('费用名称最多32个字符');
      }

      // business_domain
      const business_domain = String(row[colMap.business_domain] || '').trim();
      if (!business_domain) {
        errs.push('所属业务域不能为空');
      } else if (!VALID_DOMAINS.includes(business_domain)) {
        errs.push(`所属业务域无效，有效值：${VALID_DOMAINS.join('、')}`);
      }

      // price_types
      const priceRaw = String(row[colMap.price_types] || '').trim();
      const price_types: string[] = [];
      if (priceRaw) {
        const parts = priceRaw.split(/[,，、;；]/).map(s => s.trim()).filter(Boolean);
        for (const p of parts) {
          if (!VALID_PRICE_TYPES.includes(p)) {
            errs.push(`所属报价"${p}"无效，有效值：${VALID_PRICE_TYPES.join('、')}`);
          } else if (!price_types.includes(p)) {
            price_types.push(p);
          }
        }
      }

      // remark
      const remark = String(row[colMap.remark] || '').trim();
      if (remark.length > 256) {
        errs.push('备注最多256个字符');
      }

      // creator
      const creator = String(row[colMap.creator] || '').trim() || '导入';

      parsed.push({ row: rowNum, fee_code, fee_name, business_domain, price_types, remark, creator, errors: errs });
    }

    return NextResponse.json({
      total: parsed.length,
      validCount: parsed.filter(r => r.errors.length === 0).length,
      errorCount: parsed.filter(r => r.errors.length > 0).length,
      preview: parsed.slice(0, 20), // Return first 20 rows for preview
      allRows: parsed,
      headerHash,         // 用于模板记忆
      fieldLabelMap,      // 列名→字段映射（前端显示用）
      variant,            // 映射方案编号
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: '解析 Excel 文件失败：' + msg }, { status: 500 });
  }
}

// PUT /api/fees/import
// Body: JSON { rows: [...], action: 'insert'|'skip', creator: string }
// 支持大批量分批处理（每100条为一批），先去重再写入，避免 N+1
export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { rows, action = 'insert', creator = '导入' } = body as {
      rows: Array<{
        fee_code: string;
        fee_name: string;
        business_domain: string;
        price_types: string[];
        remark: string;
        creator: string;
        _submitIdx?: number; // 原始 Excel 行号（用于错误提示）
      }>;
      action?: 'insert' | 'skip';
      creator?: string;
    };

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: '没有可导入的数据' }, { status: 400 });
    }

    let inserted = 0;
    let skipped = 0;
    const errors: string[] = [];
    const BATCH_SIZE = 100;

    // Step 1: 批量查询所有待导入 fee_code 中已存在于 DB 的
    const feeCodes = rows.map(r => r.fee_code);
    const existingRows = await sql`SELECT fee_code FROM fee_types WHERE fee_code = ANY(${feeCodes})` as Array<{ fee_code: string }>;
    const existingSet = new Set(existingRows.map(r => r.fee_code));

    // Step 2: 分批写入
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);

      for (const row of batch) {
        // 已在 DB 中
        if (existingSet.has(row.fee_code)) {
          if (action === 'skip') {
            skipped++;
            continue;
          } else {
            errors.push(`费用编号 ${row.fee_code} 已存在，跳过`);
            continue;
          }
        }

        try {
          await sql`
            INSERT INTO fee_types (fee_code, fee_name, business_domain, price_types, remark, creator, updater)
            VALUES (${row.fee_code}, ${row.fee_name}, ${row.business_domain}, ${row.price_types}, ${row.remark}, ${creator}, ${creator})
          `;
          inserted++;
          // 标记为已存在，避免同批次重复
          existingSet.add(row.fee_code);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          errors.push(`费用编号 ${row.fee_code} 写入失败：${msg}`);
        }
      }
    }

    return NextResponse.json({
      inserted,
      skipped,
      errors: errors.slice(0, 50),
      total: rows.length,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
