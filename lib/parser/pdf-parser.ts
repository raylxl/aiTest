import type { ParseRule, ParsedOrder } from '@/types/rule';

export interface PDFParseResult {
  pages: {
    pageNumber: number;
    text: string;
    tables: any[][];
  }[];
  fullText: string;
  metadata: {
    pageCount: number;
  };
}

/**
 * 解析PDF文件（服务端版本，使用pdf2json）
 */
export async function parsePDFFile(buffer: ArrayBuffer): Promise<PDFParseResult> {
  // 动态导入pdf2json
  const pdf2jsonModule = await import('pdf2json');
  const PDFParser = pdf2jsonModule.default || pdf2jsonModule;
  
  console.log('PDFParser type:', typeof PDFParser);
  console.log('buffer length:', buffer.byteLength);
  
  // 确保buffer是正确的Buffer类型
  const pdfBuffer = Buffer.from(buffer);
  console.log('pdfBuffer length:', pdfBuffer.length);
  
  return new Promise((resolve, reject) => {
    const pdfParser = new PDFParser();
    
    pdfParser.on('pdfParser_dataError', (errData: any) => {
      reject(new Error(errData.parserError));
    });
    
    pdfParser.on('pdfParser_dataReady', (data: any) => {
      try {
        const pages: PDFParseResult['pages'] = [];
        let fullText = '';
        
        if (data.Pages) {
          for (let i = 0; i < data.Pages.length; i++) {
            const page = data.Pages[i];
            let pageText = '';
            
            // 提取文本
            if (page.Texts) {
              for (const text of page.Texts) {
                if (text.R) {
                  for (const r of text.R) {
                    if (r.T) {
                      pageText += decodeURIComponent(r.T) + ' ';
                    }
                  }
                }
                pageText += '\n';
              }
            }
            
            fullText += pageText + '\n\n';
            
            pages.push({
              pageNumber: i + 1,
              text: pageText.trim(),
              tables: extractTablesFromText(pageText),
            });
          }
        }
        
        resolve({
          pages,
          fullText,
          metadata: {
            pageCount: pages.length,
          },
        });
      } catch (error) {
        reject(error);
      }
    });
    
    // 解析buffer
    pdfParser.parseBuffer(pdfBuffer);
  });
}

/**
 * 从文本中提取表格结构
 * 支持多种表格格式：多空格分隔、Tab分隔、固定宽度字符分隔
 */
function extractTablesFromText(text: string): any[][] {
  const lines = text.split('\n').filter(line => line.trim());
  const tables: any[][] = [];
  let currentTable: any[][] = [];
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    // 尝试多种分割策略
    let cells: string[] = [];
    
    // 策略1: Tab分隔
    if (trimmed.includes('\t')) {
      cells = trimmed.split('\t').filter(cell => cell.trim());
    }
    // 策略2: 多空格分隔（至少2个空格）
    else {
      const spaceSplit = trimmed.split(/\s{2,}/).filter(cell => cell.trim());
      if (spaceSplit.length >= 3) {
        cells = spaceSplit;
      } else {
        // 策略3: 尝试检测固定列宽模式（如果行开头有常见的列结构特征）
        // 检查是否是物品行（如 "ZBWP0001 茶语柠听紫苏风味糖浆 750ml*6瓶/件 件 3"）
        const singleSpaceSplit = trimmed.split(/\s+/);
        if (singleSpaceSplit.length >= 4) {
          // 检查第一个元素是否像编码
          const first = singleSpaceSplit[0];
          if (/^[A-Z0-9]+$/i.test(first) || /^\d+$/.test(first)) {
            cells = singleSpaceSplit;
          }
        }
      }
    }
    
    if (cells.length >= 2) {
      currentTable.push(cells);
    } else if (currentTable.length > 0) {
      // 遇到非表格行，结束当前表格
      if (currentTable.length >= 2) {
        tables.push(currentTable);
      }
      currentTable = [];
    }
  }
  
  // 处理最后一个表格
  if (currentTable.length >= 2) {
    tables.push(currentTable);
  }
  
  return tables;
}

/**
 * PDF表格模式解析
 */
export function parsePDFTable(
  pages: PDFParseResult['pages'],
  config: NonNullable<ParseRule['parser']['table']>,
  recipient?: ParseRule['recipient']
): ParsedOrder[] {
  const orders: ParsedOrder[] = [];
  
  for (const page of pages) {
    // 合并所有表格
    const allRows: any[][] = [];
    for (const table of page.tables) {
      allRows.push(...table);
    }
    
    if (allRows.length === 0) continue;
    
    // 找到表头行
    const headerRow = config.headerRow === 'auto' 
      ? findHeaderRow(allRows, config.columns) 
      : config.headerRow;
    
    const dataStartRow = config.dataStartRow === 'auto' ? headerRow + 1 : config.dataStartRow;
    
    // 提取收货人信息
    let footerRecipient: Record<string, string> = {};
    if (recipient?.source === 'footer') {
      footerRecipient = extractRecipientFromText(page.text);
    }
    
    // 解析数据行
    for (let i = dataStartRow; i < allRows.length; i++) {
      const row = allRows[i];
      if (!row || row.length === 0) continue;
      
      const firstCell = String(row[0] || '').trim();
      if (firstCell === '合计' || firstCell === '总计' || firstCell === '') continue;
      
      const order: ParsedOrder = {
        sourceRow: i,
        sourceSheet: `Page ${page.pageNumber}`,
        isValid: true,
        validationErrors: [],
      };
      
      for (const col of config.columns) {
        const value = row[col.sourceIndex];
        const fieldName = mapFieldName(col.targetField);
        
        if (fieldName) {
          (order as any)[fieldName] = col.dataType === 'number' ? parseNumber(value) : String(value || '').trim();
        } else {
          if (!order.extraFields) order.extraFields = {};
          order.extraFields[col.targetField] = value;
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
  }
  
  return orders;
}

/**
 * PDF文本模式解析（用于签收单等纯文本格式）
 */
export function parsePDFText(
  pages: PDFParseResult['pages'],
  config: NonNullable<ParseRule['parser']['text']>
): ParsedOrder[] {
  const orders: ParsedOrder[] = [];
  
  // 跨页累积全局字段（适用于多页单订单场景）
  const accumulatedFields: Record<string, string> = {};
  
  for (const page of pages) {
    // 提取当前页的全局字段，并累积到跨页字段中
    for (const pattern of config.patterns) {
      const regex = new RegExp(pattern.regex, 'gm');
      const match = regex.exec(page.text);
      if (match) {
        const val = (match[pattern.group || 1] || '').trim();
        if (val) accumulatedFields[pattern.field] = val;
      }
    }
    
    // 提取物品列表，合并跨页字段
    if (config.itemPatterns) {
      const items = extractItemsFromText(page.text, config.itemPatterns);
      for (const item of items) {
        orders.push({
          ...accumulatedFields,
          ...item,
          sourceSheet: `Page ${page.pageNumber}`,
          isValid: true,
          validationErrors: [],
        } as ParsedOrder);
      }
    } else {
      orders.push({
        ...accumulatedFields,
        sourceSheet: `Page ${page.pageNumber}`,
        isValid: true,
        validationErrors: [],
      } as ParsedOrder);
    }
  }
  
  return orders;
}

/**
 * 多页PDF拆分解析（一个PDF含多个独立签收单）
 * 增强版：支持订单分隔符进行更细粒度的拆分
 */
export function parsePDFMultiPage(
  pages: PDFParseResult['pages'],
  config: NonNullable<ParseRule['parser']['multiSource']>
): ParsedOrder[] {
  const orders: ParsedOrder[] = [];
  
  for (const page of pages) {
    // 如果配置了订单分隔符，按分隔符拆分
    if (config.orderSeparator) {
      try {
        const separator = new RegExp(config.orderSeparator);
        const segments = page.text.split(separator);
        
        for (let segIdx = 0; segIdx < segments.length; segIdx++) {
          const segment = segments[segIdx].trim();
          if (!segment) continue;
          
          const segmentOrders = parsePDFText([{...page, text: segment, pageNumber: page.pageNumber }], {
            patterns: config.subRule.parser.text?.patterns || [],
            itemPatterns: config.subRule.parser.text?.itemPatterns,
          });
          
          // 为同一页的不同订单添加分段标识
          for (const order of segmentOrders) {
            order.orderNo = `${order.orderNo || ''}-P${page.pageNumber}-S${segIdx}`;
            orders.push(order);
          }
        }
      } catch {
        // 正则无效，回退到整页解析
        const pageOrders = parsePDFText([page], {
          patterns: config.subRule.parser.text?.patterns || [],
          itemPatterns: config.subRule.parser.text?.itemPatterns,
        });
        orders.push(...pageOrders);
      }
    } else {
      // 无分隔符，整页作为独立单元解析
      const pageOrders = parsePDFText([page], {
        patterns: config.subRule.parser.text?.patterns || [],
        itemPatterns: config.subRule.parser.text?.itemPatterns,
      });
      orders.push(...pageOrders);
    }
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

function extractRecipientFromText(text: string): Record<string, string> {
  const result: Record<string, string> = {};
  
  const nameMatch = text.match(/收货人[：:]\s*(.+?)(?:\s|$)/);
  if (nameMatch) result.name = nameMatch[1].trim();
  
  const phoneMatch = text.match(/(?:电话|手机|联系电话)[：:]\s*(\d+)/);
  if (phoneMatch) result.phone = phoneMatch[1].trim();
  
  const addrMatch = text.match(/(?:地址|收货地址|详细地址)[：:]\s*(.+)/);
  if (addrMatch) result.address = addrMatch[1].trim();
  
  return result;
}

function extractItemsFromText(text: string, patterns: any[]): ParsedOrder[] {
  const items: ParsedOrder[] = [];
  const lines = text.split('\n');
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    
    // 预过滤：跳过明显不是物品行的内容
    if (/^\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}/.test(trimmed)) continue;
    if (/^\d{1,2}:\d{2}/.test(trimmed)) continue;
    if (/^(第\d+页|共\d+页|页码|page)/i.test(trimmed)) continue;
    if (/^(单据状态|复审状态|分拣状态|是否需要推送)/.test(trimmed)) continue;
    if (/^(预计|期望|发货日期|订单日期|发货操作时间)/.test(trimmed)) continue;
    if (/^配送重量/.test(trimmed)) continue;
    if (/^(收货机构|订货机构|供货机构|送货机构|业务模式)/.test(trimmed)) continue;
    
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
    
    // 至少需要itemCode匹配到类似SKU编码的值才认为是有效物品行
    if (matched && item.itemCode && /^[A-Z0-9]{4,}$/i.test(item.itemCode)) {
      items.push(item);
    }
  }
  
  // 如果行内匹配失败（pdf2json经常把编码和名称拆到不同行），
  // 尝试跨行合并策略：编码行 → 名称行 → 数量行
  // 即使行内匹配找到了条目，如果大部分缺少名称或数量，也回退到跨行合并
  const incompleteCount = items.filter(it => !it.itemName || it.quantity === undefined).length;
  if (items.length === 0 || (items.length > 0 && incompleteCount > items.length * 0.5)) {
    const crossItems = extractItemsCrossLine(text);
    if (crossItems.length > 0) return crossItems;
  }
  
  return items;
}

/**
 * 跨行合并提取物品数据（PDF专用）
 * pdf2json会将同一逻辑行拆成多行：
 *   ZBWP0001
 *   茶语柠听紫苏风味糖浆
 *   750ml*6瓶/件 件 3
 * 需要识别编码行，然后合并后续行
 */
function extractItemsCrossLine(text: string): ParsedOrder[] {
  const items: ParsedOrder[] = [];
  const lines = text.split('\n').map(l => l.trim()).filter(l => l);
  
  // 跳过的行模式
  const skipPatterns = [
    /^\d{4}[\/\-]\d{1,2}/,  // 日期
    /^\d{1,2}:\d{2}/,       // 时间
    /^(第\d+页|共\d+页|page)/i,
    /^(单据状态|复审状态|分拣状态|是否需要推送|预计|期望|发货日期|订单日期|发货操作时间)/,
    /^配送重量/,
    /^(收货机构|订货机构|供货机构|送货机构|业务模式|配送方式)/,
    /^(单据编号|配送单号|运单号|调拨单号)[：:]/,
    /^k\s*g$/i,  // "k g" (配送重量的单位被拆行)
    /^(制单日期|创建人|发货人|收货人[：:]|收货电话|收货地址|打印次数|备注[：:]?$)/,
    /^\d+$/,  // 纯数字行（可能是页码或序号）
  ];
  
  // SKU编码模式：2-4个大写字母+3位以上数字
  const skuCodePattern = /^[A-Z]{2,4}\d{3,}$/;
  
  // 分类名模式（如"饮品类"、"原切类"等）
  const categoryPattern = /^[\u4e00-\u9fa5]{2,5}类$/;
  
  // 单位词模式
  const unitPattern = /^(件|包|桶|瓶|箱|个|袋|盒|条|套|双|只|把|台|张|根|本|支|块|片|卷|组)$/;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // 跳过不相关行
    if (skipPatterns.some(p => p.test(line))) continue;
    if (categoryPattern.test(line)) continue;
    
    // 检测SKU编码行
    if (skuCodePattern.test(line)) {
      const itemCode = line;
      let itemName = '';
      let specification = '';
      let quantity: number | undefined;
      let unit = '';
      
      // 收集阶段的跳过模式（不含纯数字，因为纯数字可能是数量值）
      const collectSkipPatterns = [
        /^\d{4}[\/\-]\d{1,2}/,
        /^\d{1,2}:\d{2}/,
        /^(第\d+页|共\d+页|page)/i,
        /^(单据状态|复审状态|分拣状态|是否需要推送|预计|期望|发货日期|订单日期|发货操作时间)/,
        /^配送重量/,
        /^(收货机构|订货机构|供货机构|送货机构|业务模式|配送方式)/,
        /^(单据编号|配送单号|运单号|调拨单号)[：:]/,
        /^k\s*g$/i,
        /^(制单日期|创建人|发货人|收货人[：:]|收货电话|收货地址|打印次数|备注[：:]?$)/,
        // 表格列头 + 合计（不在收集阶段跳过纯数字）
        /^(物品类别|物品编码|物品名称|规格型号|订货单位|发货数量|备注|合[ 　]*计)$/,
      ];
      
      // 第一步：收集编码行之后所有有效行（直到下一个编码或末尾）
      let lookAhead = 1;
      const collectedLines: string[] = [];
      while (i + lookAhead < lines.length && lookAhead <= 10) {
        const nextLine = lines[i + lookAhead];
        if (collectSkipPatterns.some(p => p.test(nextLine))) { lookAhead++; continue; }
        if (categoryPattern.test(nextLine)) { lookAhead++; continue; }
        if (skuCodePattern.test(nextLine)) break; // 遇到下一个物品编码，停止收集
        collectedLines.push(nextLine);
        lookAhead++;
      }
      
      // 第二步：分类收集到的行
      if (collectedLines.length > 0) {
        // 第一行始终是物品名称
        itemName = collectedLines[0];
        
        for (let j = 1; j < collectedLines.length; j++) {
          const l = collectedLines[j];
          
          // 模式1: 规格+单位+数量在同一行 如 "750ml*6瓶/件 件 3"
          const fullMatch = l.match(/^(.+?)\s+(\S+?)\s+(\d+(?:\.\d+)?)$/);
          if (fullMatch) {
            if (!specification) specification = fullMatch[1].trim();
            if (!unit) unit = fullMatch[2].trim();
            if (quantity === undefined) quantity = parseFloat(fullMatch[3]);
            continue;
          }
          
          // 模式2: 单位+数量 如 "件 3"
          const unitQtyMatch = l.match(/^(\S+)\s+(\d+(?:\.\d+)?)$/);
          if (unitQtyMatch && unitPattern.test(unitQtyMatch[1])) {
            if (!unit) unit = unitQtyMatch[1];
            if (quantity === undefined) quantity = parseFloat(unitQtyMatch[2]);
            continue;
          }
          
          // 模式3: 纯数字 = 数量
          const qtyMatch = l.match(/^(\d+(?:\.\d+)?)$/);
          if (qtyMatch) {
            if (quantity === undefined) quantity = parseFloat(qtyMatch[1]);
            continue;
          }
          
          // 模式4: 单独的单位词
          if (unitPattern.test(l)) {
            if (!unit) unit = l;
            continue;
          }
          
          // 模式5: 默认当作规格
          if (!specification) specification = l;
        }
      }
      
      if (itemName) {
        items.push({
          itemCode,
          itemName,
          specification: specification || undefined,
          quantity,
          unit: unit || undefined,
          isValid: true,
          validationErrors: [],
        });
      }
    }
  }
  
  return items;
}

function parseNumber(value: any): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const num = Number(String(value).replace(/[^\d.-]/g, ''));
  return isNaN(num) ? undefined : num;
}

function mapFieldName(sourceName: string): string | null {
  // 已知的英文目标字段直接透传
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
