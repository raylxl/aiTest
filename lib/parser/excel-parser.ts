import * as XLSX from 'xlsx';
import type { ParseRule, ParsedOrder, MatrixParserConfig, DoubleMatrixParserConfig } from '@/types/rule';

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

  // 提取收货人信息（footer模式 / header模式）
  let footerRecipient: Record<string, string> = {};
  let headerRecipient: Record<string, string> = {};
  if (recipient?.source === 'footer') {
    footerRecipient = extractFooterRecipient(sheetData, recipient);
  }
  if (recipient?.source === 'header') {
    headerRecipient = extractHeaderRecipient(sheetData, recipient);
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
    
    // 跳过全空行
    const hasData = config.columns.some(
      (col: any) => row[col.sourceIndex] !== undefined && String(row[col.sourceIndex] || '').trim() !== ''
    );
    if (!hasData) continue;

    for (const col of config.columns) {
      const value = row[col.sourceIndex];
      const fieldName = col.targetField;
      
      let processedValue = value;
      if (col.dataType === 'number') {
        processedValue = parseNumber(value);
      } else if (col.dataType === 'string') {
        processedValue = String(value || '').trim();
      }

      // 跳过空值——不要用空值覆盖已有值（避免"物品备注"空值覆盖"物品名称"）
      if (processedValue === '' || processedValue === undefined || processedValue === null) continue;

      // 字段映射
      const mappedField = mapFieldName(fieldName);
      if (mappedField) {
        (order as any)[mappedField] = processedValue;
      } else {
        if (!order.extraFields) order.extraFields = {};
        order.extraFields[fieldName] = processedValue;
      }
    }

    // 合并收货人信息（支持两种key格式：name/phone/address 和 receiverName/receiverPhone/receiverAddress/storeName/orderNo）
    const mergeRecipient = (rec: Record<string, string>) => {
      if (!rec) return;
      // 统一字段名：name→receiverName, phone→receiverPhone, address→receiverAddress
      const name = rec.receiverName || rec.name;
      const phone = rec.receiverPhone || rec.phone;
      const address = rec.receiverAddress || rec.address;
      if (!order.receiverName && name) order.receiverName = name;
      if (!order.receiverPhone && phone) order.receiverPhone = phone;
      if (!order.receiverAddress && address) order.receiverAddress = address;
      if (!order.storeName && rec.storeName) order.storeName = rec.storeName;
      if (!order.orderNo && rec.orderNo) order.orderNo = rec.orderNo;
    };
    
    if (recipient?.source === 'footer') mergeRecipient(footerRecipient);
    if (recipient?.source === 'header') mergeRecipient(headerRecipient);

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
          storeName: store.storeName,  // ← 修复：写入storeName（A组），非receiverName
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
 * 双重转置解析（周配送计划）
 * 结构：行=门店，列=日期，单元格="物品名x数量\n物品名x数量"
 */
export function parseDoubleMatrix(
  sheetData: any[][],
  config: DoubleMatrixParserConfig
): ParsedOrder[] {
  const orders: ParsedOrder[] = [];
  const headerRow = config.headerRow;

  // 提取日期列头
  const dateHeaders: string[] = [];
  const headerRowData = sheetData[headerRow] || [];
  for (let col = config.dataStartColumn; col < headerRowData.length; col++) {
    dateHeaders.push(String(headerRowData[col]) || ("日期" + col));
  }

  // 遍历每个门店行
  for (let rowIdx = headerRow + 1; rowIdx < sheetData.length; rowIdx++) {
    const row = sheetData[rowIdx];
    if (!row || row.length === 0) continue;

    // 提取门店名称
    const storeName = String(row[config.storeColumnIndex] || '').trim();
    if (!storeName) continue;

    // 遍历每个日期列
    for (let colIdx = 0; colIdx < dateHeaders.length; colIdx++) {
      const cellValue = String(row[config.dataStartColumn + colIdx] || '').trim();
      if (!cellValue || cellValue === '0' || cellValue === '-') continue;

      // 按换行符拆分复合单元格
      const lines = cellValue.split(/\r?\n/).filter(line => line.trim());
      const dateHeader = dateHeaders[colIdx];

      for (const line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine) continue;

        // 使用配置的正则提取物品名和数量
        let itemName = '';
        let qty: number = 0;
        
        try {
          const itemPattern = new RegExp(config.itemPattern, 'i');
          const m = trimmedLine.match(itemPattern);
          if (m) {
            itemName = m[1]?.trim() || trimmedLine;
            qty = parseInt(m[2] || '0', 10);
          }
        } catch {
          // 正则无效时使用简单拆分
          const parts = trimmedLine.split(/[xX×]/);
          if (parts.length >= 2) {
            itemName = parts[0].trim();
            qty = parseInt(parts[parts.length - 1].trim(), 10);
          }
        }

        // try-catch 之后：如果提取成功，则推入订单
        if (itemName && qty > 0) {
          orders.push({
            storeName,
            receiverName: storeName, // 门店作为收货人
            itemName,
            quantity: qty,
            orderNo: `${storeName}-${dateHeader}`, // 外部编码 = 门店+日期
            sourceRow: rowIdx,
            isValid: true,
            validationErrors: [],
          });
        }
      }
    }
  }

  return orders;
}
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
      const rowText = row?.join(' ') || '';
      
      // 检测卡片结束标志
      if (config.cardEndPattern) {
        const endPattern = new RegExp(config.cardEndPattern);
        if (endPattern.test(firstCell) || endPattern.test(rowText)) {
          // 保存当前卡片的物品
          if (cardItemStart >= 0) {
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
          inCard = false;
          cardItemStart = -1;
          continue;
        }
      }
      
      // 提取卡片字段
      for (const field of config.cardFields) {
        const pattern = new RegExp(field.pattern);
        const match = rowText.match(pattern);
        if (match) {
          currentCard[field.field] = match[field.group || 1]?.trim() || '';
        }
      }
      
      // 也尝试从整行提取
      extractCardFields(rowText, config.cardFields, currentCard);
      
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
 * 从文本中提取卡片字段（不重复提取）
 */
function extractCardFields(text: string, fields: any[], card: Record<string, string>): void {
  for (const field of fields) {
    if ((card as any)[field.field]) continue; // 已经提取过的字段不再覆盖
    const pattern = new RegExp(field.pattern, 'i');
    const match = text.match(pattern);
    if (match) {
      (card as any)[field.field] = match[field.group || 1]?.trim() || '';
    }
  }
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

function extractHeaderRecipient(data: any[][], recipient: any): Record<string, string> {
  const result: Record<string, string> = {};
  const fields = recipient.fields || {};

  // 处理显式坐标 { row, col }
  for (const [key, val] of Object.entries(fields)) {
    const fieldKey = key === 'name' ? 'receiverName' :
                     key === 'phone' ? 'receiverPhone' :
                     key === 'address' ? 'receiverAddress' :
                     key === 'storeName' ? 'storeName' : key;

    if (val && typeof val === 'object' && 'row' in val && 'col' in val) {
      const row = (val as any).row;
      const col = (val as any).col;
      if (data[row] && data[row][col] !== undefined) {
        result[fieldKey] = String(data[row][col] || '').trim();
      }
    } else if (val && typeof val === 'object' && 'pattern' in val) {
      // 正则模式：在前10行搜索
      const regex = new RegExp((val as any).pattern, 'i');
      for (let i = 0; i < Math.min(data.length, 10); i++) {
        const rowText = (data[i] || []).join(' ');
        const m = rowText.match(regex);
        if (m) {
          result[fieldKey] = (m[1] || m[0] || '').trim();
          break;
        }
      }
    } else if (typeof val === 'string') {
      // 如果值看起来已经是数据值（非label），直接使用
      // 判断依据：值长度>2且不含"匹配"/"正则"等关键词，直接作为字段值
      if (val.length > 2 && !/^(?:匹配|正则|搜索|查找)/.test(val)) {
        result[fieldKey] = val;
      } else {
        // 字符串：当作 label 在前10行搜索
        const label = val as string;
        for (let i = 0; i < Math.min(data.length, 10); i++) {
          const row = data[i] || [];
          for (let c = 0; c < row.length; c++) {
            if (String(row[c] || '').includes(label)) {
              // 取同行右侧单元格
              const valCell = row[c + 1] || row[c + 2] || '';
              if (valCell) {
                result[fieldKey] = String(valCell).trim();
                break;
              }
            }
          }
          if (result[fieldKey]) break;
        }
      }
    }
  }
  return result;
}

function extractFooterRecipient(data: any[][], recipient: any): Record<string, string> {
  const result: Record<string, string> = {};
  // 从最后几行 + 前几行提取收货人/门店信息
  const footerStart = Math.max(0, data.length - 10);
  const allAreas = [
    { start: 0, end: Math.min(5, data.length) },     // 前5行（header区域）
    { start: footerStart, end: data.length },          // 后10行（footer区域）
  ];
  
  const fieldPatterns: [string, string, RegExp][] = [
    ['storeName', '收货机构', /收货机构[：:]\s*(.+)/],
    ['storeName', '收货门店', /收货门店[：:]\s*(.+)/],
    ['storeName', '门店', /(?:调入门店|收货门店|门店)[：:]\s*(.+)/],
    ['name', '收货人', /收货人[：:]\s*(.+?)(?:\s|$)/],
    ['phone', '电话', /(?:电话|手机|联系电话)[：:]\s*(\d+)/],
    ['address', '地址', /(?:地址|收货地址|详细地址)[：:]\s*(.+)/],
  ];
  
  for (const area of allAreas) {
    for (let i = area.start; i < area.end && i < data.length; i++) {
      const rowText = data[i]?.join(' ') || '';
      for (const [key, _label, regex] of fieldPatterns) {
        if (result[key]) continue; // 已提取到的不覆盖
        const match = rowText.match(regex);
        if (match) result[key] = match[1].trim();
      }
    }
  }
  
  return result;
}

function parseNumber(value: any): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const num = Number(value);
  return isNaN(num) ? undefined : num;
}

function mapFieldName(sourceName: string): string | null {
  // 先检查是否是已知的目标字段名（英文），直接透传
  const knownTargetFields = new Set([
    'orderNo', 'storeName', 'receiverName', 'receiverPhone', 'receiverAddress',
    'senderName', 'senderPhone', 'senderAddress',
    'itemCode', 'itemName', 'itemCategory', 'specification', 'quantity', 'unit',
    'remark', 'extraFields',
  ]);
  if (knownTargetFields.has(sourceName)) return sourceName;
  
  const mapping: Record<string, string> = {
    '运单号': 'orderNo',
    '单据号': 'orderNo',
    '配送单号': 'orderNo',
    '发货人': 'senderName',
    '收货门店': 'storeName',
    '收货机构': 'storeName',
    '门店名称': 'storeName',
    '门店': 'storeName',
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
    
    // 跳过全空行：所有item列都为空
    const hasData = config.itemTable.columns.some(
      (col: any) => row[col.sourceIndex] !== undefined && String(row[col.sourceIndex]).trim() !== ''
    );
    if (!hasData) continue;
    
    const firstCell = String(row[0] || '').trim();
    if (firstCell === '合计' || firstCell === '总计') continue;

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
