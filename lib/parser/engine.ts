import type { ParseRule, ParsedOrder, ParseResult, RuleMatchResult, FileType } from '@/types/rule';
import { parseExcelFile, parseTable, parseMatrix, parseCards } from './excel-parser';
import { parsePDFFile, parsePDFTable, parsePDFText, parsePDFMultiPage } from './pdf-parser';
import { parseWordFile, parseWordText } from './word-parser';

/**
 * 规则引擎核心
 * 根据规则解析各种格式的文件
 */
export class ParseEngine {
  /**
   * 解析文件
   */
  async parseFile(
    file: File | ArrayBuffer,
    fileName: string,
    rule: ParseRule
  ): Promise<ParseResult> {
    const startTime = Date.now();
    const fileType = this.detectFileType(fileName);
    
    try {
      let buffer: ArrayBuffer;
      if (file instanceof File) {
        buffer = await file.arrayBuffer();
      } else {
        buffer = file;
      }

      let orders: ParsedOrder[] = [];

      switch (fileType) {
        case 'excel':
          orders = await this.parseExcel(buffer, rule);
          break;
        case 'pdf':
          orders = await this.parsePDF(buffer, rule);
          break;
        case 'word':
          orders = await this.parseWord(buffer, rule);
          break;
        case 'csv':
          orders = await this.parseCSV(buffer, rule);
          break;
        default:
          throw new Error(`不支持的文件类型: ${fileType}`);
      }

      // 数据校验
      const validatedOrders = this.validateOrders(orders);
      const errorRows = validatedOrders.filter(o => !o.isValid).length;

      return {
        success: true,
        orders: validatedOrders,
        totalRows: validatedOrders.length,
        errorRows,
        metadata: {
          fileName,
          fileType,
          parseTime: Date.now() - startTime,
        },
      };
    } catch (error) {
      return {
        success: false,
        orders: [],
        totalRows: 0,
        errorRows: 0,
        errors: [error instanceof Error ? error.message : '解析失败'],
        metadata: {
          fileName,
          fileType,
          parseTime: Date.now() - startTime,
        },
      };
    }
  }

  /**
   * 检测文件类型
   */
  detectFileType(fileName: string): FileType {
    const ext = fileName.toLowerCase().split('.').pop();
    switch (ext) {
      case 'xlsx':
      case 'xls':
      case 'xlsm':
        return 'excel';
      case 'pdf':
        return 'pdf';
      case 'docx':
      case 'doc':
        return 'word';
      case 'csv':
        return 'csv';
      default:
        throw new Error(`未知文件类型: ${ext}`);
    }
  }

  /**
   * 解析Excel文件
   */
  private async parseExcel(buffer: ArrayBuffer, rule: ParseRule): Promise<ParsedOrder[]> {
    const excelData = await parseExcelFile(buffer);
    
    // 多Sheet模式
    if (rule.parser.type === 'multi-sheet') {
      if (rule.parser.multiSource) {
        return this.parseMultiSheet(excelData, rule);
      }
      // 如果没有multiSource配置，但有table配置，对所有Sheet应用table规则
      if (rule.parser.table) {
        return this.parseAllSheets(excelData, rule);
      }
    }

    // 单Sheet模式
    const sheet = excelData.sheets[0];
    if (!sheet) throw new Error('Excel文件没有Sheet');

    switch (rule.parser.type) {
      case 'table':
        return parseTable(sheet.data, rule.parser.table!, rule.recipient);
      case 'matrix':
        return parseMatrix(sheet.data, rule.parser.matrix!);
      case 'card':
        return parseCards(sheet.data, rule.parser.card!);
      case 'multi-sheet':
        // multi-sheet但没有配置，尝试用table模式解析第一个sheet
        if (rule.parser.table) {
          return parseTable(sheet.data, rule.parser.table, rule.recipient);
        }
        throw new Error('multi-sheet模式需要配置multiSource或table规则');
      default:
        throw new Error(`Excel不支持的解析模式: ${rule.parser.type}`);
    }
  }

  /**
   * 解析多Sheet Excel（使用multiSource配置）
   */
  private parseMultiSheet(excelData: any, rule: ParseRule): ParsedOrder[] {
    const orders: ParsedOrder[] = [];
    const config = rule.parser.multiSource!;
    
    for (const sheet of excelData.sheets) {
      // 过滤指定Sheet
      if (config.filterSources && !config.filterSources.includes(sheet.name)) {
        continue;
      }

      const subRule = config.subRule;
      let sheetOrders: ParsedOrder[] = [];

      if (subRule.parser.type === 'table' && subRule.parser.table) {
        sheetOrders = parseTable(sheet.data, subRule.parser.table, rule.recipient);
      } else if (subRule.parser.type === 'matrix' && subRule.parser.matrix) {
        sheetOrders = parseMatrix(sheet.data, subRule.parser.matrix);
      } else if (subRule.parser.type === 'card' && subRule.parser.card) {
        sheetOrders = parseCards(sheet.data, subRule.parser.card);
      }

      // 添加Sheet来源信息
      for (const order of sheetOrders) {
        order.sourceSheet = sheet.name;
      }

      orders.push(...sheetOrders);
    }

    return orders;
  }

  /**
   * 解析所有Sheet（使用同一个table规则）
   */
  private parseAllSheets(excelData: any, rule: ParseRule): ParsedOrder[] {
    const orders: ParsedOrder[] = [];
    const tableConfig = rule.parser.table!;
    
    for (const sheet of excelData.sheets) {
      // 跳过空Sheet
      if (!sheet.data || sheet.data.length === 0) continue;

      try {
        const sheetOrders = parseTable(sheet.data, tableConfig, rule.recipient);
        
        // 添加Sheet来源信息
        for (const order of sheetOrders) {
          order.sourceSheet = sheet.name;
        }

        orders.push(...sheetOrders);
      } catch (e) {
        // 单个Sheet解析失败不影响其他Sheet
        console.warn(`Sheet "${sheet.name}" 解析失败:`, e);
      }
    }

    return orders;
  }

  /**
   * 解析PDF文件
   */
  private async parsePDF(buffer: ArrayBuffer, rule: ParseRule): Promise<ParsedOrder[]> {
    const pdfData = await parsePDFFile(buffer);

    switch (rule.parser.type) {
      case 'table':
        return parsePDFTable(pdfData.pages, rule.parser.table!, rule.recipient);
      case 'text':
        return parsePDFText(pdfData.pages, rule.parser.text!);
      case 'multi-page':
        return parsePDFMultiPage(pdfData.pages, rule.parser.multiSource!);
      default:
        throw new Error(`PDF不支持的解析模式: ${rule.parser.type}`);
    }
  }

  /**
   * 解析Word文件
   */
  private async parseWord(buffer: ArrayBuffer, rule: ParseRule): Promise<ParsedOrder[]> {
    const wordData = await parseWordFile(buffer);

    if (rule.parser.type === 'text' && rule.parser.text) {
      return parseWordText(wordData, rule.parser.text);
    }

    throw new Error(`Word不支持的解析模式: ${rule.parser.type}`);
  }

  /**
   * 解析CSV文件
   */
  private async parseCSV(buffer: ArrayBuffer, rule: ParseRule): Promise<ParsedOrder[]> {
    const text = new TextDecoder().decode(buffer);
    const lines = text.split('\n').filter(line => line.trim());
    const data = lines.map(line => line.split(',').map(cell => cell.trim().replace(/^"|"$/g, '')));

    if (rule.parser.type === 'table' && rule.parser.table) {
      return parseTable(data, rule.parser.table, rule.recipient);
    }

    throw new Error(`CSV不支持的解析模式: ${rule.parser.type}`);
  }

  /**
   * 校验订单数据
   */
  private validateOrders(orders: ParsedOrder[]): ParsedOrder[] {
    return orders.map(order => {
      const errors: string[] = [];

      // 必填字段校验
      if (!order.itemName && !order.receiverName) {
        errors.push('缺少物品名称或收货人信息');
      }

      // 电话格式校验
      if (order.receiverPhone && !/^1\d{10}$/.test(order.receiverPhone)) {
        // 不是标准手机号，但可能是座机，不报错
      }

      // 数量校验
      if (order.quantity !== undefined && order.quantity < 0) {
        errors.push('数量不能为负数');
      }

      return {
        ...order,
        isValid: errors.length === 0,
        validationErrors: errors,
      };
    });
  }

  /**
   * 自动匹配规则
   * 根据文件特征自动选择最合适的规则
   */
  async matchRule(
    file: File | ArrayBuffer,
    fileName: string,
    rules: ParseRule[]
  ): Promise<RuleMatchResult | null> {
    const fileType = this.detectFileType(fileName);
    const matchingRules = rules.filter(r => r.fileTypes.includes(fileType));

    if (matchingRules.length === 0) return null;

    // 简单匹配：根据文件名和文件类型
    for (const rule of matchingRules) {
      if (rule.identifier.fileNamePattern) {
        const pattern = new RegExp(rule.identifier.fileNamePattern, 'i');
        if (pattern.test(fileName)) {
          return {
            rule,
            confidence: 0.9,
            matchReasons: [`文件名匹配: ${rule.identifier.fileNamePattern}`],
          };
        }
      }
    }

    // 如果没有精确匹配，返回第一个匹配的规则
    return {
      rule: matchingRules[0],
      confidence: 0.5,
      matchReasons: ['文件类型匹配'],
    };
  }
}

// 导出单例
export const parseEngine = new ParseEngine();
