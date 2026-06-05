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
 */
function extractTablesFromText(text: string): any[][] {
  const lines = text.split('\n').filter(line => line.trim());
  const tables: any[][] = [];
  let currentTable: any[][] = [];
  
  for (const line of lines) {
    // 检测是否是表格行（包含多个空格分隔的数据）
    const cells = line.split(/\s{2,}/).filter(cell => cell.trim());
    
    if (cells.length >= 3) {
      currentTable.push(cells);
    } else {
      if (currentTable.length > 0) {
        tables.push(currentTable);
        currentTable = [];
      }
    }
  }
  
  if (currentTable.length > 0) {
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
  
  for (const page of pages) {
    // 提取全局字段
    const globalFields: Record<string, string> = {};
    for (const pattern of config.patterns) {
      const regex = new RegExp(pattern.regex, 'gm');
      const match = regex.exec(page.text);
      if (match) {
        globalFields[pattern.field] = match[pattern.group || 1]?.trim() || '';
      }
    }
    
    // 提取物品列表
    if (config.itemPatterns) {
      const items = extractItemsFromText(page.text, config.itemPatterns);
      for (const item of items) {
        orders.push({
          ...globalFields,
          ...item,
          sourceSheet: `Page ${page.pageNumber}`,
          isValid: true,
          validationErrors: [],
        } as ParsedOrder);
      }
    } else {
      orders.push({
        ...globalFields,
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

function parseNumber(value: any): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const num = Number(String(value).replace(/[^\d.-]/g, ''));
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
