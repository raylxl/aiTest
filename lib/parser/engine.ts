import type { ParseRule, ParsedOrder, ParseResult, RuleMatchResult, FileType, ColumnMapping, TableParserConfig } from '@/types/rule';
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
      // 如果没有任何配置，尝试用默认table配置解析所有Sheet
      const defaultTableConfig: TableParserConfig = {
        headerRow: 'auto',
        dataStartRow: 'auto',
        columns: []
      };
      const tempRule = { ...rule, parser: { ...rule.parser, table: defaultTableConfig } };
      return this.parseAllSheets(excelData, tempRule);
    }

    // 单Sheet模式
    const sheet = excelData.sheets[0];
    if (!sheet) throw new Error('Excel文件没有Sheet');

    const parserType = rule.parser.type as string;
    switch (parserType) {
      case 'table':
        return parseTable(sheet.data, rule.parser.table!, rule.recipient);
      case 'matrix':
        return parseMatrix(sheet.data, rule.parser.matrix!);
      case 'card':
        return parseCards(sheet.data, rule.parser.card!);
      case 'double-matrix':
        // 双重转置：周配送计划格式
        if (rule.parser.matrix) {
          return parseMatrix(sheet.data, rule.parser.matrix!);
        }
        throw new Error('double-matrix模式需要配置matrix规则');
      case 'multi-sheet':
        // multi-sheet但没有配置，尝试用table模式解析第一个sheet
        if (rule.parser.table) {
          return parseTable(sheet.data, rule.parser.table, rule.recipient);
        }
        throw new Error('multi-sheet模式需要配置multiSource或table规则');
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
        // 如果columns为空，自动检测列
        let config = tableConfig;
        if (!config.columns || config.columns.length === 0) {
          config = this.autoDetectColumns(sheet.data, config);
        }
        
        const sheetOrders = parseTable(sheet.data, config, rule.recipient);
        
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
   * 自动检测列配置
   */
  private autoDetectColumns(data: any[][], baseConfig: TableParserConfig): TableParserConfig {
    if (!data || data.length < 2) return baseConfig;
    
    // 查找表头行（第一行非空行）
    let headerRow = 0;
    for (let i = 0; i < Math.min(data.length, 10); i++) {
      const row = data[i];
      if (row && row.length > 0 && row.some((cell: any) => cell !== null && cell !== undefined && cell !== '')) {
        headerRow = i;
        break;
      }
    }
    
    const headerRowData = data[headerRow];
    if (!headerRowData) return baseConfig;
    
    // 自动检测列映射
    const columns: ColumnMapping[] = [];
    const fieldNameMap: Record<string, string> = {
      '单号': 'orderNo', '运单号': 'orderNo', '配送单号': 'orderNo', '订单号': 'orderNo',
      '外部编码': 'orderNo', '外部订单号': 'orderNo', '客户单号': 'orderNo', '参考编码': 'orderNo',
      '门店': 'storeName', '收货门店': 'storeName', '店铺': 'storeName', '机构': 'storeName',
      '收货人': 'receiverName', '收件人': 'receiverName',
      '电话': 'receiverPhone', '手机': 'receiverPhone', '联系电话': 'receiverPhone',
      '地址': 'receiverAddress', '收货地址': 'receiverAddress', '收件地址': 'receiverAddress',
      '商品': 'itemName', '物品': 'itemName', '品名': 'itemName', '货品': 'itemName', 'SKU': 'itemName',
      '编码': 'itemCode', '条码': 'itemCode', 'SKU码': 'itemCode', '物品编码': 'itemCode',
      '数量': 'quantity', '件数': 'quantity', '发货数量': 'quantity',
      '规格': 'specification', '型号': 'specification', '规格型号': 'specification',
      '单位': 'unit',
    };
    
    for (let i = 0; i < headerRowData.length; i++) {
      const cell = String(headerRowData[i] || '').trim();
      if (!cell) continue;
      
      // 查找匹配的字段名
      let targetField = '';
      for (const [keyword, field] of Object.entries(fieldNameMap)) {
        if (cell.includes(keyword)) {
          targetField = field;
          break;
        }
      }
      
      if (targetField) {
        const dataType = targetField === 'quantity' ? 'number' : 'string';
        columns.push({ sourceIndex: i, targetField, dataType });
      }
    }
    
    return {
      ...baseConfig,
      headerRow,
      dataStartRow: headerRow + 1,
      columns,
    };
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
   * 校验订单数据（A/B 组二选一业务规则）
   *
   * 考试要求：
   * - A组（门店模式）：只需填写"收货门店"(storeName)，不要求收件人姓名/电话/地址
   * - B组（收件人模式）：需填写"收件人姓名 + 收件人电话 + 收件人地址"三个字段
   * - 两组都填也可以，但至少填一组。两组都没填则校验不通过
   * - SKU物品编码、SKU物品名称：必填
   * - SKU发货数量：必填且必须为正数
   */
  private validateOrders(orders: ParsedOrder[]): ParsedOrder[] {
    return orders.map(order => {
      const errors: string[] = [];

      // ========== A/B 组二选一校验 ==========
      // 判断A组（门店模式）是否完整
      const groupAComplete = Boolean(order.storeName?.trim());

      // 判断B组（收件人模式）是否完整（三个字段都需有值）
      const groupBComplete = Boolean(
        order.receiverName?.trim() &&
        order.receiverPhone?.trim() &&
        order.receiverAddress?.trim()
      );

      if (!groupAComplete && !groupBComplete) {
        errors.push(
          '收货信息不完整：请填写「收货门店」（A组门店模式），' +
          '或填写完整的「收件人姓名 + 电话 + 地址」（B组收件人模式）'
        );
      }

      // ========== SKU 必填校验 ==========
      if (!order.itemCode?.trim()) {
        errors.push('SKU物品编码为必填项');
      }
      if (!order.itemName?.trim()) {
        errors.push('SKU物品名称为必填项');
      }

      // ========== 数量校验（必须为正数）==========
      if (order.quantity === undefined || order.quantity === null) {
        errors.push('SKU发货数量为必填项');
      } else if (typeof order.quantity === 'number') {
        if (order.quantity <= 0) {
          errors.push('SKU发货数量必须为正数');
        }
        // 检查是否为整数或合理小数（最多2位小数）
        if (order.quantity !== Math.floor(order.quantity * 100) / 100) {
          errors.push('SKU发货数量最多保留2位小数');
        }
      }

      // ========== 电话格式校验（提示性，非阻塞）==========
      if (order.receiverPhone?.trim() && !/^1\d{10}$/.test(order.receiverPhone.trim())) {
        // 不是标准11位手机号，可能是座机或其他格式
        // 仅记录警告，不作为错误阻止提交
      }

      return {
        ...order,
        isValid: errors.length === 0,
        validationErrors: errors,
      };
    });
  }

  // matchRule 方法已移除 — 考试要求：规则由用户手动选择
}

// 导出单例
export const parseEngine = new ParseEngine();
