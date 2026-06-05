import type { ParseRule, ParsedOrder } from '@/types/rule';

export interface WordParseResult {
  text: string;
  paragraphs: string[];
  metadata: {
    paragraphCount: number;
  };
}

/**
 * 解析Word文件（.docx）
 * 使用mammoth.js提取文本
 */
export async function parseWordFile(buffer: ArrayBuffer): Promise<WordParseResult> {
  const mammoth = await import('mammoth');
  
  const result = await mammoth.extractRawText({ arrayBuffer: buffer });
  const text = result.value;
  const paragraphs = text.split('\n').filter(p => p.trim());
  
  return {
    text,
    paragraphs,
    metadata: {
      paragraphCount: paragraphs.length,
    },
  };
}

/**
 * Word文本模式解析（纯文本段落，无表格）
 */
export function parseWordText(
  wordData: WordParseResult,
  config: NonNullable<ParseRule['parser']['text']>
): ParsedOrder[] {
  const orders: ParsedOrder[] = [];
  const { text } = wordData;
  
  // 提取全局字段（收货人、地址等）
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
    const items = extractItemsFromParagraphs(wordData.paragraphs, config.itemPatterns);
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
