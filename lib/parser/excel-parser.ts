import * as XLSX from 'xlsx';
import type { ParseRule, ParsedOrder, MatrixParserConfig } from '@/types/rule';

export interface ExcelSheetData {
  name: string;
  data: any[][];
  rowCount: number;
  colCount: number;
}

export interface ExcelParseResult {
  sheets: ExcelSheetData[];
  metadata: {
    sheetCount: number;
    sheetNames: string[];
  };
}

/**
 * 解析Excel文件，提取所有Sheet的原始数据
 */
export async function parseExcelFile(buffer: ArrayBuffer): Promise<ExcelParseResult> {
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheets: ExcelSheetData[] = [];

  for (const sheetName of workbook.SheetNames) {
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1, defval: '' });
    
    sheets.push({
      name: sheetName,
      data,
      rowCount: data.length,
      colCount: Math.max(...data.map(row => row.length), 0),
    });
  }

  return {
    sheets,
    metadata: {
      sheetCount: workbook.SheetNames.length,
      sheetNames: workbook.SheetNames,
    },
  };
}

/**
 * 标准表格模式解析
 */
export function parseTable(
  sheetData: any[][],
  config: NonNullable<ParseRule['parser']['table']>,
  recipient?: ParseRule['recipient']
): ParsedOrder[] {
  const orders: ParsedOrder[] = [];
  const headerRow = config.headerRow === 'auto' ? findHeaderRow(sheetData, config.columns) : config.headerRow;
  const dataStartRow = config.dataStartRow === 'auto' ? headerRow + 1 : config.dataStartRow;
  const dataEndRow = config.dataEndRow === 'auto' ? sheetData.length : (config.dataEndRow ?? sheetData.length);

  // 提取收货人信息（如果是footer模式）
  let footerRecipient: Record<string, string> = {};
  if (recipient?.source === 'footer') {
    footerRecipient = extractFooterRecipient(sheetData, recipient);
  }

  for (let i = dataStartRow; i < dataEndRow && i < sheetData.length; i++) {
    const row = sheetData[i];
    if (!row || row.length === 0) continue;
    if (config.skipRows?.includes(i)) continue;

    // 检查是否是合计行或空行
    const firstCell = String(row[0] || '').trim();
    if (firstCell === '合计' || firstCell === '总计' || firstCell === '') continue;

    const order: ParsedOrder = {
      sourceRow: i,
      isValid: true,
      validationErrors: [],
    };

    for (const col of config.columns) {
      const value = row[col.sourceIndex];
      const fieldName = col.targetField;
      
      let processedValue = value;
      if (col.dataType === 'number') {
        processedValue = parseNumber(value);
      } else if (col.dataType === 'string') {
        processedValue = String(value || '').trim();
      }

      // 字段映射
      const mappedField = mapFieldName(fieldName);
      if (mappedField) {
        (order as any)[mappedField] = processedValue;
      } else {
        if (!order.extraFields) order.extraFields = {};
        order.extraFields[fieldName] = processedValue;
      }
    }

    // 合并收货人信息
    if (recipient?.source === 'footer' && footerRecipient) {
      if (!order.receiverName && footerRecipient.name) order.receiverName = footerRecipient.name;
      if (!order.receiverPhone && footerRecipient.phone) order.receiverPhone = footerRecipient.phone;
      if (!order.receiverAddress && footerRecipient.address) order.receiverAddress = footerRecipient.address;
    }

    orders.push(order);
  }

  return orders;
}

/**
 * 矩阵模式解析（SKU×门店）
 */
export function parseMatrix(
  sheetData: any[][],
  config: MatrixParserConfig
): ParsedOrder[] {
  const orders: ParsedOrder[] = [];
  const headerRow = config.headerRow;

  for (let i = headerRow + 1; i < sheetData.length; i++) {
    const row = sheetData[i];
    if (!row || row.length === 0) continue;

    const skuName = String(row[config.skuColumn] || '').trim();
    const skuCode = config.skuCodeColumn !== undefined ? String(row[config.skuCodeColumn] || '').trim() : '';
    
    if (!skuName) continue;

    // 遍历每个门店列
    for (const store of config.storeColumns) {
      const quantity = parseNumber(row[store.index]);
      
      if (quantity && quantity > 0) {
        orders.push({
          receiverName: store.storeName,
          itemName: skuName,
          itemCode: skuCode || undefined,
          quantity,
          sourceRow: i,
          isValid: true,
          validationErrors: [],
        });
      }
    }
  }

  return orders;
}

/**
 * 卡片模式解析
 */
export function parseCards(
  sheetData: any[][],
  config: NonNullable<ParseRule['parser']['card']>
): ParsedOrder[] {
  const orders: ParsedOrder[] = [];
  const cardPattern = new RegExp(config.cardStartPattern);
  
  let currentCard: Record<string, string> = {};
  let inCard = false;
  let cardItemStart = -1;

  for (let i = 0; i < sheetData.length; i++) {
    const row = sheetData[i];
    const firstCell = String(row?.[0] || '').trim();

    if (cardPattern.test(firstCell) || cardPattern.test(row?.join(' '))) {
      // 保存上一个卡片的物品
      if (inCard && cardItemStart >= 0) {
        const items = extractCardItems(sheetData, cardItemStart, i, config);
        for (const item of items) {
          orders.push({
            ...currentCard,
            ...item,
            sourceRow: cardItemStart,
            isValid: true,
            validationErrors: [],
          } as ParsedOrder);
        }
      }

      currentCard = {};
      inCard = true;
      cardItemStart = -1;
      continue;
    }

    if (inCard) {
      // 提取卡片字段
      for (const field of config.cardFields) {
        const pattern = new RegExp(field.pattern);
        const rowText = row?.join(' ') || '';
        const match = rowText.match(pattern);
        if (match) {
          currentCard[field.field] = match[field.group || 1]?.trim() || '';
        }
      }

      // 检测物品表头
      if (config.itemTable && hasItemTableHeader(row, config.itemTable.columns)) {
        cardItemStart = i + 1;
      }
    }
  }

  // 处理最后一个卡片
  if (inCard && cardItemStart >= 0) {
    const items = extractCardItems(sheetData, cardItemStart, sheetData.length, config);
    for (const item of items) {
      orders.push({
        ...currentCard,
        ...item,
        sourceRow: cardItemStart,
        isValid: true,
        validationErrors: [],
      } as ParsedOrder);
    }
  }

  return orders;
}

/**
 * 文本模式解析（Word/PDF纯文本）
 */
export function parseTextContent(
  text: string,
  config: NonNullable<ParseRule['parser']['text']>
): ParsedOrder[] {
  const orders: ParsedOrder[] = [];
  
  // 提取收货人等全局字段
  const globalFields: Record<string, string> = {};
  for (const pattern of config.patterns) {
    const regex = new RegExp(pattern.regex, 'gm');
    const match = regex.exec(text);
    if (match) {
      globalFields[pattern.field] = match[pattern.group || 1]?.trim() || '';
    }
  }

  // 提取物品列表
  if (config.itemPatterns) {
    const items = extractTextItems(text, config.itemPatterns);
    for (const item of items) {
      orders.push({
        ...globalFields,
        ...item,
        isValid: true,
        validationErrors: [],
      } as ParsedOrder);
    }
  } else {
    // 没有物品列表，只有一个收货人信息
    orders.push({
      ...globalFields,
      isValid: true,
      validationErrors: [],
    } as ParsedOrder);
  }

  return orders;
}

// 辅助函数
function findHeaderRow(data: any[][], columns: any[]): number {
  for (let i = 0; i < Math.min(data.length, 20); i++) {
    const row = data[i];
    let matchCount = 0;
    for (const col of columns) {
      const cell = String(row?.[col.sourceIndex] || '').trim();
      if (cell && (cell.includes(col.targetField) || col.targetField.includes(cell))) {
        matchCount++;
      }
    }
    if (matchCount >= columns.length * 0.5) return i;
  }
  return 0;
}

function extractFooterRecipient(data: any[][], recipient: any): Record<string, string> {
  const result: Record<string, string> = {};
  // 从最后几行提取收货人信息
  const startRow = Math.max(0, data.length - 10);
  
  for (let i = startRow; i < data.length; i++) {
    const rowText = data[i]?.join(' ') || '';
    
    const nameMatch = rowText.match(/收货人[：:]\s*(.+?)(?:\s|$)/);
    if (nameMatch) result.name = nameMatch[1].trim();
    
    const phoneMatch = rowText.match(/(?:电话|手机|联系电话)[：:]\s*(\d+)/);
    if (phoneMatch) result.phone = phoneMatch[1].trim();
    
    const addrMatch = rowText.match(/(?:地址|收货地址|详细地址)[：:]\s*(.+)/);
    if (addrMatch) result.address = addrMatch[1].trim();
  }
  
  return result;
}

function parseNumber(value: any): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const num = Number(value);
  return isNaN(num) ? undefined : num;
}

function mapFieldName(sourceName: string): string | null {
  const mapping: Record<string, string> = {
    '运单号': 'orderNo',
    '单据号': 'orderNo',
    '配送单号': 'orderNo',
    '发货人': 'senderName',
    '收货人': 'receiverName',
    '收货人姓名': 'receiverName',
    '电话': 'receiverPhone',
    '手机': 'receiverPhone',
    '联系电话': 'receiverPhone',
    '收货人电话': 'receiverPhone',
    '地址': 'receiverAddress',
    '收货地址': 'receiverAddress',
    '详细地址': 'receiverAddress',
    '物品名称': 'itemName',
    '商品名称': 'itemName',
    'SKU名称': 'itemName',
    '货品名称': 'itemName',
    '物品编码': 'itemCode',
    '商品编码': 'itemCode',
    'SKU编码': 'itemCode',
    'SKU条码': 'itemCode',
    '物品分类': 'itemCategory',
    '规格型号': 'specification',
    '规格': 'specification',
    '单位': 'unit',
    '数量': 'quantity',
    '发货数量': 'quantity',
    '出库数量': 'quantity',
    '订货数量': 'quantity',
  };
  return mapping[sourceName] || null;
}

function extractCardItems(data: any[][], start: number, end: number, config: any): ParsedOrder[] {
  const items: ParsedOrder[] = [];
  if (!config.itemTable) return items;

  for (let i = start; i < end && i < data.length; i++) {
    const row = data[i];
    if (!row || row.length === 0) continue;

    const firstCell = String(row[0] || '').trim();
    if (firstCell === '合计' || firstCell === '总计' || firstCell === '') continue;

    const item: ParsedOrder = {
      isValid: true,
      validationErrors: [],
    };

    for (const col of config.itemTable.columns) {
      const value = row[col.sourceIndex];
      const mappedField = mapFieldName(col.targetField);
      if (mappedField) {
        (item as any)[mappedField] = col.dataType === 'number' ? parseNumber(value) : String(value || '').trim();
      }
    }

    items.push(item);
  }

  return items;
}

function hasItemTableHeader(row: any[], columns: any[]): boolean {
  if (!row) return false;
  let matchCount = 0;
  for (const col of columns) {
    const cell = String(row[col.sourceIndex] || '').trim();
    if (cell && (cell.includes('编码') || cell.includes('名称') || cell.includes('数量'))) {
      matchCount++;
    }
  }
  return matchCount >= 2;
}

function extractTextItems(text: string, patterns: any[]): ParsedOrder[] {
  const items: ParsedOrder[] = [];
  
  // 尝试匹配所有物品行
  const lines = text.split('\n');
  for (const line of lines) {
    const item: ParsedOrder = { isValid: true, validationErrors: [] };
    let matched = false;
    
    for (const pattern of patterns) {
      const regex = new RegExp(pattern.regex, 'gm');
      const match = regex.exec(line);
      if (match) {
        (item as any)[pattern.field] = match[pattern.group || 1]?.trim() || '';
        matched = true;
      }
    }
    
    if (matched && item.itemName) {
      items.push(item);
    }
  }
  
  return items;
}
