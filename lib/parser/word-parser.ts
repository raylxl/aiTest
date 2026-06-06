import type { ParseRule, ParsedOrder } from '@/types/rule';

export interface WordParseResult {
  text: string;
  paragraphs: string[];
  tables: {
    headers: string[];
    rows: string[][];
  }[];
  metadata: {
    paragraphCount: number;
    tableCount: number;
  };
}

/**
 * 解析Word文件（.docx）
 * 使用mammoth.js提取文本和表格结构
 */
export async function parseWordFile(buffer: ArrayBuffer): Promise<WordParseResult> {
  const mammoth = await import('mammoth');
  
  // mammoth.js 需要 Node Buffer，不是 ArrayBuffer
  const nodeBuffer = Buffer.from(buffer);
  
  // 同时提取纯文本和HTML（用于表格结构）
  const [textResult, htmlResult] = await Promise.all([
    mammoth.extractRawText({ buffer: nodeBuffer }),
    mammoth.convertToHtml({ buffer: nodeBuffer }),
  ]);
  
  const text = textResult.value;
  const html = htmlResult.value;
  const paragraphs = text.split('\n').filter(p => p.trim());
  
  // 从HTML中提取表格结构
  const tables = extractTablesFromHtml(html);
  
  return {
    text,
    paragraphs,
    tables,
    metadata: {
      paragraphCount: paragraphs.length,
      tableCount: tables.length,
    },
  };
}

/**
 * 从HTML中提取表格结构
 */
function extractTablesFromHtml(html: string): { headers: string[]; rows: string[][] }[] {
  const tables: { headers: string[]; rows: string[][] }[] = [];
  
  // 匹配所有<table>标签
  const tableRegex = /<table[^>]*>([\s\S]*?)<\/table>/gi;
  let tableMatch;
  
  while ((tableMatch = tableRegex.exec(html)) !== null) {
    const tableHtml = tableMatch[1];
    const headers: string[] = [];
    const rows: string[][] = [];
    
    // 提取表头（<th>）
    const headerRegex = /<th[^>]*>([\s\S]*?)<\/th>/gi;
    let headerMatch;
    while ((headerMatch = headerRegex.exec(tableHtml)) !== null) {
      headers.push(cleanHtml(headerMatch[1]));
    }
    
    // 提取数据行（<tr>中的<td>）
    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let rowMatch;
    
    while ((rowMatch = rowRegex.exec(tableHtml)) !== null) {
      const rowHtml = rowMatch[1];
      const cells: string[] = [];
      
      // 跳过表头行（包含<th>的行）
      if (rowHtml.includes('<th')) continue;
      
      const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
      let cellMatch;
      while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
        cells.push(cleanHtml(cellMatch[1]));
      }
      
      if (cells.length > 0) {
        rows.push(cells);
      }
    }
    
    // 只有当表格有内容时才添加
    if (headers.length > 0 || rows.length > 0) {
      tables.push({ headers, rows });
    }
  }
  
  return tables;
}

/**
 * 清理HTML标签，提取纯文本
 */
function cleanHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

/**
 * Word文本模式解析（纯文本段落，无表格）
 * 支持 orderSeparator 拆分多订单
 */
export function parseWordText(
  wordData: WordParseResult,
  config: NonNullable<ParseRule['parser']['text']>
): ParsedOrder[] {
  let text = wordData.text;

  // 支持 orderSeparator 拆分多订单
  if (config.orderSeparator) {
    const sepRegex = new RegExp(config.orderSeparator);
    const sections = text.split(sepRegex).filter(s => s.trim());
    const allOrders: ParsedOrder[] = [];

    for (const section of sections) {
      const sectionData: WordParseResult = {
        ...wordData,
        text: section,
        paragraphs: section.split('\n').filter(p => p.trim()),
      };
      const orders = parseWordTextCore(sectionData, config);
      allOrders.push(...orders);
    }

    return allOrders;
  }

  return parseWordTextCore(wordData, config);
}

/**
 * Word文本解析核心逻辑
 */
function parseWordTextCore(
  wordData: WordParseResult,
  config: NonNullable<ParseRule['parser']['text']>
): ParsedOrder[] {
  const orders: ParsedOrder[] = [];
  const { text, paragraphs } = wordData;

  // 提取全局字段（收货人、地址等）
  const globalFields: Record<string, string> = {};
  for (const pattern of config.patterns || []) {
    const regex = new RegExp(pattern.regex, 'gm');
    const match = regex.exec(text);
    if (match) {
      globalFields[pattern.field] = match[pattern.group || 1]?.trim() || '';
    }
  }

  // 提取物品列表
  if (config.itemPatterns) {
    const items = extractItemsFromParagraphs(paragraphs, config.itemPatterns);
    for (const item of items) {
      orders.push({
        ...globalFields,
        ...item,
        isValid: true,
        validationErrors: [],
      } as ParsedOrder);
    }
  } else {
    // 没有物品列表，只有收货人信息
    orders.push({
      ...globalFields,
      isValid: true,
      validationErrors: [],
    } as ParsedOrder);
  }

  return orders;
}

/**
 * 从段落中提取物品列表
 */
function extractItemsFromParagraphs(paragraphs: string[], patterns: any[]): ParsedOrder[] {
  const items: ParsedOrder[] = [];
  
  for (const paragraph of paragraphs) {
    const item: ParsedOrder = { isValid: true, validationErrors: [] };
    let matched = false;
    
    for (const pattern of patterns) {
      const regex = new RegExp(pattern.regex, 'gm');
      const match = regex.exec(paragraph);
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
