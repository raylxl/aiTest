import { NextResponse } from 'next/server';
import sql from '@/lib/db';

// Column name mapping: Excel header → DB field
const FIELD_MAP: Record<string, string> = {
  '费用编号': 'fee_code',
  '费用名称': 'fee_name',
  '所属业务域': 'business_domain',
  '所属报价': 'price_types',
  '备注': 'remark',
  '创建人': 'creator',
};

const VALID_DOMAINS = ['运配', '仓储', '干线', '配送'];
const VALID_PRICE_TYPES = ['平台价格', '成本价格', '基础价格', '网点价格', '增值服务价格'];

// POST /api/fees/import
// Body: FormData with field "file" (Excel file)
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

    // Validate required columns
    const colMap: Record<string, number> = {};
    for (const [label, field] of Object.entries(FIELD_MAP)) {
      const idx = headers.findIndex(h => h === label);
      if (idx === -1) {
        return NextResponse.json({ error: `缺少必需列：【${label}】` }, { status: 400 });
      }
      colMap[field] = idx;
    }

    // Parse data rows
    const rows = rawData.slice(1).filter(row => row.some(cell => cell !== '' && cell !== null && cell !== undefined));
    if (rows.length === 0) {
      return NextResponse.json({ error: 'Excel 文件中没有有效数据行' }, { status: 400 });
    }

    if (rows.length > 500) {
      return NextResponse.json({ error: '单次导入最多支持 500 条数据，当前文件有 ' + rows.length + ' 条' }, { status: 400 });
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
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: '解析 Excel 文件失败：' + msg }, { status: 500 });
  }
}

// PUT /api/fees/import
// Body: JSON { rows: [...], action: 'insert'|'skip', creator: string }
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

    for (const row of rows) {
      try {
        // Check duplicate fee_code in DB
        const exist = await sql`SELECT id FROM fee_types WHERE fee_code = ${row.fee_code}`;
        if (exist.length > 0) {
          if (action === 'skip') {
            skipped++;
            continue;
          } else {
            errors.push(`费用编号 ${row.fee_code} 已存在，跳过`);
            continue;
          }
        }

        await sql`
          INSERT INTO fee_types (fee_code, fee_name, business_domain, price_types, remark, creator, updater)
          VALUES (${row.fee_code}, ${row.fee_name}, ${row.business_domain}, ${row.price_types}, ${row.remark}, ${creator}, ${creator})
        `;
        inserted++;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        errors.push(`费用编号 ${row.fee_code} 写入失败：${msg}`);
      }
    }

    return NextResponse.json({
      inserted,
      skipped,
      errors: errors.slice(0, 50), // Return first 50 errors
      total: rows.length,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
