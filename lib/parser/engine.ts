import type { ParseRule, ParsedOrder, ParseResult, FileType } from '@/types/rule';
import { parseExcelFile, parseTable, parseMatrix, parseCards, parseDoubleMatrix } from './excel-parser';
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

      // 为每条记录添加来源文件名
      orders = orders.map(order => ({
        ...order,
        sourceFile: order.sourceFile || fileName,
      }));

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
      if (!rule.parser.multiSource) {
        throw new Error('multi-sheet 模式必须显式配置 multiSource 规则');
      }
      return this.parseMultiSheet(excelData, rule);
    }

    // 单Sheet模式
    const sheet = excelData.sheets[0];
    if (!sheet) throw new Error('Excel文件没有Sheet');

    const parserType = rule.parser.type as string;
    switch (parserType) {
      case 'table': {
        const tableConfig = rule.parser.table;
        if (!tableConfig) {
          throw new Error('table 模式缺少 table 配置');
        }
        if (!tableConfig.columns || tableConfig.columns.length === 0) {
          throw new Error('table 模式需要显式 columns 配置，请先通过 AI 生成规则或在规则编辑器中补全列映射');
        }

        // 自动检测dataEndRow：在"合计"行后停止（避免footer元数据行被当数据行）
        let effectiveTableConfig = tableConfig;
        if (effectiveTableConfig.dataEndRow === undefined || effectiveTableConfig.dataEndRow === 'auto') {
          const headerRow = typeof effectiveTableConfig.headerRow === 'number' ? effectiveTableConfig.headerRow : 0;
          const dataStartRow = typeof effectiveTableConfig.dataStartRow === 'number' ? effectiveTableConfig.dataStartRow : headerRow + 1;
          for (let i = dataStartRow; i < sheet.data.length; i++) {
            const row = sheet.data[i];
            if (!row) continue;
            const firstCell = String(row[0] || '').trim();
            if (firstCell === '合计' || firstCell === '总计') {
              effectiveTableConfig = { ...effectiveTableConfig, dataEndRow: i };
              break;
            }
          }
        }

        return parseTable(sheet.data, effectiveTableConfig, rule.recipient);
      }
      case 'matrix':
        return parseMatrix(sheet.data, rule.parser.matrix as any);
      case 'card': {
        if (rule.parser.card) {
          return parseCards(sheet.data, rule.parser.card);
        }
        throw new Error('card 模式需要显式配置 card 规则');
      }
      case 'double-matrix':
        if (rule.parser.matrix) {
          return parseDoubleMatrix(sheet.data, rule.parser.matrix as any);
        }
        throw new Error('double-matrix 模式需要显式配置 matrix 规则');
      default:
        throw new Error(`Excel不支持的解析模式: ${parserType}`);
    }
  }

  /**
   * 解析多Sheet Excel（使用multiSource配置）
   */
  private parseMultiSheet(excelData: any, rule: ParseRule): ParsedOrder[] {
    const orders: ParsedOrder[] = [];
    const config = rule.parser.multiSource!;

    for (const sheet of excelData.sheets) {
      if (config.filterSources && !config.filterSources.includes(sheet.name)) {
        continue;
      }

      const subRule = config.subRule;
      let sheetOrders: ParsedOrder[] = [];

      switch (subRule.parser.type) {
        case 'table':
          if (!subRule.parser.table) {
            throw new Error(`Sheet ${sheet.name} 的子规则缺少 table 配置`);
          }
          sheetOrders = parseTable(sheet.data, subRule.parser.table, subRule.recipient || rule.recipient);
          break;
        case 'matrix':
          if (!subRule.parser.matrix) {
            throw new Error(`Sheet ${sheet.name} 的子规则缺少 matrix 配置`);
          }
          sheetOrders = parseMatrix(sheet.data, subRule.parser.matrix as any);
          break;
        case 'card':
          if (!subRule.parser.card) {
            throw new Error(`Sheet ${sheet.name} 的子规则缺少 card 配置`);
          }
          sheetOrders = parseCards(sheet.data, subRule.parser.card);
          break;
        case 'double-matrix':
          if (!subRule.parser.matrix) {
            throw new Error(`Sheet ${sheet.name} 的子规则缺少 double-matrix 所需 matrix 配置`);
          }
          sheetOrders = parseDoubleMatrix(sheet.data, subRule.parser.matrix as any);
          break;
        default:
          throw new Error(`multi-sheet 子规则暂不支持 ${subRule.parser.type} 模式`);
      }

      for (const order of sheetOrders) {
        order.sourceSheet = sheet.name;
      }

      orders.push(...sheetOrders);
    }

    return orders;
  }

  /**
   * 解析PDF文件
   */
  private async parsePDF(buffer: ArrayBuffer, rule: ParseRule): Promise<ParsedOrder[]> {
    const pdfData = await parsePDFFile(buffer);
    const parserType = rule.parser.type as string;

    switch (parserType) {
      case 'table':
        if (!rule.parser.table) {
          throw new Error('PDF table 模式缺少 table 配置');
        }
        if (!rule.parser.table.columns || rule.parser.table.columns.length === 0) {
          throw new Error('PDF table 模式需要显式 columns 配置');
        }
        return parsePDFTable(pdfData.pages, rule.parser.table, rule.recipient);
      case 'text':
        if (!rule.parser.text) {
          throw new Error('PDF text 模式缺少 text 配置');
        }
        return parsePDFText(pdfData.pages, rule.parser.text);
      case 'multi-page':
        if (!rule.parser.multiSource) {
          throw new Error('multi-page 模式必须显式配置 multiSource 规则');
        }
        if (rule.parser.multiSource.sourceType !== 'page') {
          throw new Error('PDF multi-page 模式的 multiSource.sourceType 必须为 page');
        }
        if (rule.parser.multiSource.subRule.parser.type !== 'text' || !rule.parser.multiSource.subRule.parser.text) {
          throw new Error('当前 PDF multi-page 模式仅支持显式 text 子规则');
        }
        return parsePDFMultiPage(pdfData.pages, rule.parser.multiSource);
      default:
        throw new Error(`PDF不支持的解析模式: ${parserType}`);
    }
  }

  /**
   * 解析Word文件
   */
  private async parseWord(buffer: ArrayBuffer, rule: ParseRule): Promise<ParsedOrder[]> {
    const wordData = await parseWordFile(buffer);
    const parserType = rule.parser.type as string;

    switch (parserType) {
      case 'text':
        if (!rule.parser.text) {
          throw new Error('Word text 模式缺少 text 配置');
        }
        return parseWordText(wordData, rule.parser.text);
      default:
        throw new Error(`Word当前仅支持 text 模式，收到: ${parserType}`);
    }
  }

  /**
   * 解析CSV文件
   */
  private async parseCSV(buffer: ArrayBuffer, rule: ParseRule): Promise<ParsedOrder[]> {
    return this.parseExcel(buffer, rule);
  }

  /**
   * 统一业务校验
   */
  private validateOrders(orders: ParsedOrder[]): ParsedOrder[] {
    return orders.map((order) => {
      const validationErrors: string[] = [];
      const normalizedOrder: ParsedOrder = {
        ...order,
        storeName: typeof order.storeName === 'string' ? order.storeName.trim() : order.storeName,
        receiverName: typeof order.receiverName === 'string' ? order.receiverName.trim() : order.receiverName,
        receiverPhone: typeof order.receiverPhone === 'string' ? order.receiverPhone.trim() : order.receiverPhone,
        receiverAddress: typeof order.receiverAddress === 'string' ? order.receiverAddress.trim() : order.receiverAddress,
        itemCode: typeof order.itemCode === 'string' ? order.itemCode.trim() : order.itemCode,
        itemName: typeof order.itemName === 'string' ? order.itemName.trim() : order.itemName,
        validationErrors: [],
      };

      const hasGroupA = !!normalizedOrder.storeName;
      const hasReceiverName = !!normalizedOrder.receiverName;
      const hasReceiverPhone = !!normalizedOrder.receiverPhone;
      const hasReceiverAddress = !!normalizedOrder.receiverAddress;
      const hasAnyGroupBField = hasReceiverName || hasReceiverPhone || hasReceiverAddress;
      const hasGroupB = hasReceiverName && hasReceiverPhone && hasReceiverAddress;

      if (!hasGroupA && !hasGroupB) {
        if (hasAnyGroupBField) {
          if (!hasReceiverName) validationErrors.push('receiverName: 收件人姓名不能为空');
          if (!hasReceiverPhone) validationErrors.push('receiverPhone: 收件人电话不能为空');
          if (!hasReceiverAddress) validationErrors.push('receiverAddress: 收件人地址不能为空');
        } else {
          validationErrors.push('storeName: 收货门店不能为空，或完整提供 receiverName / receiverPhone / receiverAddress');
        }
      }

      if (!normalizedOrder.itemCode) {
        validationErrors.push('itemCode: 物品编码不能为空');
      }
      if (!normalizedOrder.itemName) {
        validationErrors.push('itemName: 物品名称不能为空');
      }
      if (normalizedOrder.quantity === undefined || normalizedOrder.quantity === null || Number(normalizedOrder.quantity) <= 0) {
        validationErrors.push('quantity: 数量必须大于 0');
      }
      if (normalizedOrder.receiverPhone && !/^1\d{10}$/.test(normalizedOrder.receiverPhone)) {
        validationErrors.push('receiverPhone: 电话格式不正确，应为 11 位手机号');
      }

      return {
        ...normalizedOrder,
        isValid: validationErrors.length === 0,
        validationErrors,
      };
    });
  }

}

// 导出单例
export const parseEngine = new ParseEngine();
