import type { ParseRule, ParsedOrder, ParseResult, FileType, ColumnMapping, TableParserConfig } from '@/types/rule';
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
      case 'table': {
        // 如果columns为空，自动检测列配置
        let tableConfig = rule.parser.table!;
        if (!tableConfig.columns || tableConfig.columns.length === 0) {
          tableConfig = this.autoDetectColumns(sheet.data, tableConfig);
        } else {
          // 检查是否缺少关键必填字段，自动补充
          tableConfig = this.mergeMissingColumns(sheet.data, tableConfig);
        }
        return parseTable(sheet.data, tableConfig, rule.recipient);
      }
      case 'matrix':
        return parseMatrix(sheet.data, rule.parser.matrix!);
      case 'card':
        return parseCards(sheet.data, rule.parser.card!);
      case 'double-matrix':
        // 双重转置：周配送计划格式 (门店x日期矩阵 + 复合单元格拆分)
        if (rule.parser.matrix) {
          return parseDoubleMatrix(sheet.data, rule.parser.matrix as any);
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
        
        // 添加Sheet来源信息 + 补全storeName
        const sheetStoreName = sheetOrders[0]?.storeName || 
                              (rule.recipient?.source === 'header' ? undefined : sheet.name);
        for (const order of sheetOrders) {
          order.sourceSheet = sheet.name;
          if (!order.storeName && sheetStoreName) {
            order.storeName = sheetStoreName;
          }
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
    
    // 智能查找表头行：跳过标题行（单元格内容很长、通常是文档标题），找到真正的列标题行
    const fieldNameKeywords = ['单号', '编码', '名称', '数量', '门店', '收货', '电话', '地址', '规格', '单位', '日期', '序号', '分类', '备注', '仓库', '品牌'];
    let headerRow = 0;
    let bestScore = 0;
    
    for (let i = 0; i < Math.min(data.length, 15); i++) {
      const row = data[i];
      if (!row || row.length === 0) continue;
      
      // 检查是否有非空单元格
      const nonEmptyCells = row.filter((cell: any) => cell !== null && cell !== undefined && String(cell).trim() !== '');
      if (nonEmptyCells.length === 0) continue;
      
      // 评分：匹配到的关键词越多，列数越多（至少3列），越可能是表头
      let score = 0;
      let longCellCount = 0;
      let shortCellCount = 0;
      for (const cell of nonEmptyCells) {
        const cellStr = String(cell).trim();
        const len = cellStr.length;
        // 极长文本（>30字符）很可能是标题或说明，大幅扣分
        if (len > 30) { longCellCount++; continue; }
        // 中等文本（15-30字符）可能是值字段内容，轻微扣分
        if (len > 15) { score -= 1; continue; }
        // 短文本（≤15字符）是表头关键词的典型长度
        shortCellCount++;
        for (const kw of fieldNameKeywords) {
          if (cellStr.includes(kw)) score += 3;
        }
      }
      
      // 加分：列数多（表格特征）
      if (nonEmptyCells.length >= 3) score += 5;
      if (nonEmptyCells.length >= 5) score += 5;
      
      // 扣分：有长文本单元格（标题/说明行）
      score -= longCellCount * 5;
      
      // 扣分：如果长单元格占比过高，这是header info区域而非列标题
      if (longCellCount > shortCellCount) score -= 10;
      
      if (score > bestScore) {
        bestScore = score;
        headerRow = i;
      }
    }
    
    const headerRowData = data[headerRow];
    if (!headerRowData) return baseConfig;
    
    // 自动检测列映射 — 使用最长关键词优先匹配，避免「SKU条码」被误匹配为itemName
    const columns: ColumnMapping[] = [];
    const fieldNameMapEntries: [string, string][] = [
      ['配送单号', 'orderNo'], ['运单号', 'orderNo'], ['订单号', 'orderNo'],
      ['外部订单号', 'orderNo'], ['客户单号', 'orderNo'], ['参考编码', 'orderNo'],
      ['单据号', 'orderNo'], ['单号', 'orderNo'], ['外部编码', 'orderNo'],
      ['收货门店', 'storeName'], ['收货机构', 'storeName'],
      ['门店', 'storeName'], ['店铺', 'storeName'], ['机构', 'storeName'],
      ['收货人', 'receiverName'], ['收件人', 'receiverName'],
      ['联系电话', 'receiverPhone'], ['收货人电话', 'receiverPhone'],
      ['电话', 'receiverPhone'], ['手机', 'receiverPhone'],
      ['收货地址', 'receiverAddress'], ['收件地址', 'receiverAddress'],
      ['详细地址', 'receiverAddress'], ['地址', 'receiverAddress'],
      ['物品编码', 'itemCode'], ['商品编码', 'itemCode'],
      ['SKU编码', 'itemCode'], ['SKU条码', 'itemCode'], ['SKU码', 'itemCode'],
      ['条码', 'itemCode'], ['编码', 'itemCode'],
      ['物品名称', 'itemName'], ['商品名称', 'itemName'],
      ['货品名称', 'itemName'], ['SKU名称', 'itemName'],
      ['名称', 'itemName'], ['品名', 'itemName'],
      ['物品', 'itemName'], ['商品', 'itemName'], ['货品', 'itemName'],
      ['SKU', 'itemName'],
      ['规格型号', 'specification'],
      ['规格', 'specification'], ['型号', 'specification'],
      ['发货数量', 'quantity'], ['出库数量', 'quantity'],
      ['订货数量', 'quantity'], ['数量', 'quantity'],
      ['单位', 'unit'],
      ['物品分类', 'itemCategory'], ['分类', 'itemCategory'],
      ['物品品牌', 'itemCategory'], ['品牌', 'itemCategory'],
    ];
    
    for (let i = 0; i < headerRowData.length; i++) {
      const cell = String(headerRowData[i] || '').trim();
      if (!cell) continue;
      
      // 查找匹配的字段名（最长匹配优先）
      let bestMatch = '';
      let bestField = '';
      for (const [keyword, field] of fieldNameMapEntries) {
        if (cell.includes(keyword) && keyword.length > bestMatch.length) {
          bestMatch = keyword;
          bestField = field;
        }
      }
      
      if (bestField) {
        const dataType = bestField === 'quantity' ? 'number' : 'string';
        columns.push({ sourceIndex: i, targetField: bestField, dataType });
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
   * 合并缺失的关键字段：如果AI规则缺少必填字段，自动从表头补充
   * 解决AI提示词缺少storeName等问题时的兜底
   */
  private mergeMissingColumns(data: any[][], tableConfig: TableParserConfig): TableParserConfig {
    if (!tableConfig.columns || tableConfig.columns.length === 0) return tableConfig;
    
    const headerRow = typeof tableConfig.headerRow === 'number' ? tableConfig.headerRow : 0;
    const headerRowData = data[headerRow];
    if (!headerRowData) return tableConfig;

    const existingFields = new Set(tableConfig.columns.map((c: any) => c.targetField));
    const newColumns = [...tableConfig.columns];
    let hasNew = false;

    // 检查A/B组必填字段
    const hasGroupA = existingFields.has('storeName');
    const hasGroupB = existingFields.has('receiverName') && existingFields.has('receiverPhone') && existingFields.has('receiverAddress');

    // 如果两组都缺失，且表头中有未映射的列，尝试匹配
    if (!hasGroupA && !hasGroupB) {
      for (let i = 0; i < headerRowData.length; i++) {
        const cell = String(headerRowData[i] || '').trim();
        if (!cell) continue;
        // 检查这个列是否已经被映射
        if (tableConfig.columns.some((c: any) => c.sourceIndex === i)) continue;

        if (/门店|机构|店铺|收货门店|配送门店/.test(cell)) {
          newColumns.push({ sourceIndex: i, targetField: 'storeName', dataType: 'string' });
          existingFields.add('storeName');
          hasNew = true;
          console.log(`[mergeMissingColumns] 自动补充 storeName ← 列${i} "表头:${cell}"`);
        } else if (/收货人|收件人|联系人/.test(cell) && !existingFields.has('receiverName')) {
          newColumns.push({ sourceIndex: i, targetField: 'receiverName', dataType: 'string' });
          existingFields.add('receiverName');
          hasNew = true;
        } else if (/电话|手机|联系方式/.test(cell) && !existingFields.has('receiverPhone')) {
          newColumns.push({ sourceIndex: i, targetField: 'receiverPhone', dataType: 'string' });
          existingFields.add('receiverPhone');
          hasNew = true;
        } else if (/地址/.test(cell) && !existingFields.has('receiverAddress')) {
          newColumns.push({ sourceIndex: i, targetField: 'receiverAddress', dataType: 'string' });
          existingFields.add('receiverAddress');
          hasNew = true;
        }
      }
    }

    // 补充其他必填字段
    const requiredFields = [
      { field: 'itemCode', patterns: [/编码|条码|SKU码|item.?code/i] },
      { field: 'itemName', patterns: [/名称|品名|货品|商品|item.?name/i] },
      { field: 'quantity', patterns: [/数量|件数|发货|qty|count/i] },
    ];

    for (const required of requiredFields) {
      if (existingFields.has(required.field)) continue;
      for (let i = 0; i < headerRowData.length; i++) {
        const cell = String(headerRowData[i] || '').trim();
        if (!cell) continue;
        if (tableConfig.columns.some((c: any) => c.sourceIndex === i)) continue;
        if (required.patterns.some(p => p.test(cell))) {
          const dataType = required.field === 'quantity' ? 'number' : 'string';
          newColumns.push({ sourceIndex: i, targetField: required.field, dataType });
          existingFields.add(required.field);
          hasNew = true;
          console.log(`[mergeMissingColumns] 自动补充 ${required.field} ← 列${i} "表头:${cell}"`);
          break;
        }
      }
    }

    if (!hasNew) return tableConfig;
    return { ...tableConfig, columns: newColumns };
  }

  /**
   * 解析PDF文件
   */
  private async parsePDF(buffer: ArrayBuffer, rule: ParseRule): Promise<ParsedOrder[]> {
    const pdfData = await parsePDFFile(buffer);

    switch (rule.parser.type) {
      case 'table': {
        const tableOrders = parsePDFTable(pdfData.pages, rule.parser.table!, rule.recipient);
        // 如果table模式提取不到数据，尝试text模式作为fallback
        if (tableOrders.length === 0 && rule.recipient) {
          // 从recipient配置生成text规则
          const textConfig = this.generateTextConfigFromRecipient(rule.recipient);
          const textOrders = parsePDFText(pdfData.pages, textConfig);
          if (textOrders.length > 0) return textOrders;
        }
        return tableOrders;
      }
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
   * 从 recipient 配置生成 text 模式规则（PDF fallback）
   */
  private generateTextConfigFromRecipient(recipient: NonNullable<ParseRule['recipient']>): NonNullable<ParseRule['parser']['text']> {
    const fields = recipient.fields;
    const patterns: any[] = [];
    const itemPatterns: any[] = [];
    
    // 生成收货人/门店字段的正则
    if (fields.storeName) {
      if (typeof fields.storeName === 'string') {
        patterns.push({ field: 'storeName', regex: `${fields.storeName}[：:]\\s*(.+)`, group: 1 });
      } else if (fields.storeName && 'pattern' in fields.storeName) {
        patterns.push({ field: 'storeName', regex: fields.storeName.pattern, group: 1 });
      }
    }
    // 添加常见的配送单字段匹配
    patterns.push(
      { field: 'storeName', regex: '收货机构[：:]\\s*(.+)', group: 1 },
      { field: 'storeName', regex: '收货门店[：:]\\s*(.+)', group: 1 },
      { field: 'storeName', regex: '门店[：:]\\s*(.+)', group: 1 },
      { field: 'orderNo', regex: '(?:单据编号|配送单号|运单号|订单号)[：:]\\s*(\\S+)', group: 1 },
      { field: 'receiverName', regex: '收货人[：:]\\s*(.+)', group: 1 },
      { field: 'receiverPhone', regex: '(?:电话|手机|联系电话)[：:]\\s*(\\d+)', group: 1 },
      { field: 'receiverAddress', regex: '(?:地址|收货地址|详细地址)[：:]\\s*(.+)', group: 1 },
      { field: 'itemCode', regex: '(?:物品编码|商品编码|SKU编码|SKU条码|编码)[：:]\\s*(\\S+)', group: 1 },
      { field: 'itemName', regex: '(?:物品名称|商品名称|货品名称|品名)[：:]\\s*(.+)', group: 1 },
      { field: 'quantity', regex: '(?:数量|发货数量|出库数量)[：:]\\s*(\\d+(?:\\.\\d+)?)', group: 1 },
      { field: 'specification', regex: '(?:规格型号|规格)[：:]\\s*(.+)', group: 1 },
      { field: 'unit', regex: '单位[：:]\\s*(.+)', group: 1 },
    );
    
    // 检测文本中是否有表格行样式的物品数据
    itemPatterns.push(
      { field: 'itemCode', regex: '^\\s*(\\S+)\\s+', group: 1 },
      { field: 'itemName', regex: '^\\s*\\S+\\s+(\\S+)', group: 1 },
      { field: 'quantity', regex: '^\\s*\\S+\\s+\\S+\\s+(\\d+(?:\\.\\d+)?)', group: 1 },
    );

    return { patterns, itemPatterns };
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
