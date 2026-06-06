import type { ParseRule } from '@/types/rule';
import { validateParseRule, formatValidationErrors } from '@/lib/parser/validator';
import { AI_RULE_SYSTEM_PROMPT } from '@/lib/ai/prompts';
import https from 'https';

const DEEPSEEK_API_URL = 'https://api.siliconflow.cn/v1/chat/completions';

const SYSTEM_PROMPT = AI_RULE_SYSTEM_PROMPT;

/**
 * 使用Node.js https模块调用API（绕过Cloudflare检测）
 */
function callAPIWithHttps(apiKey: string, body: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const url = new URL(DEEPSEEK_API_URL);
    const postData = JSON.stringify(body);
    
    const options = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
        'Content-Length': Buffer.byteLength(postData),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error(`解析响应失败: ${data.substring(0, 200)}`));
          }
        } else {
          reject(new Error(`API调用失败 (${res.statusCode}): ${data.substring(0, 500)}`));
        }
      });
    });

    req.on('error', (e) => {
      reject(new Error(`请求错误: ${e.message}`));
    });

    req.write(postData);
    req.end();
  });
}

/**
 * 调用AI API生成解析规则
 */
export async function generateRuleWithAI(
  fileSample: string,
  fileType: string,
  fileName: string
): Promise<ParseRule> {
  const apiKey = process.env.AI_API_KEY;
  
  if (!apiKey) {
    throw new Error('未配置AI_API_KEY');
  }

  const userMessage = `请根据以下文件样本生成解析规则。

## 文件信息
- 文件名：${fileName}
- 文件类型：${fileType}

## 文件内容样本（前20行）
\`\`\`
${fileSample}
\`\`\`

请分析文件结构，生成对应的解析规则JSON。`;

  const body = {
    model: 'deepseek-ai/DeepSeek-V4-Pro',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userMessage }
    ],
    temperature: 0.1,
    max_tokens: 4000,
  };

  // 使用Node.js https模块调用（绕过Cloudflare检测）
  const data = await callAPIWithHttps(apiKey, body);
  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error('AI API返回空内容');
  }

  // 提取JSON内容
  const jsonMatch = extractJSON(content);
  if (!jsonMatch) {
    throw new Error('无法从AI响应中提取JSON');
  }

  try {
    const rule = JSON.parse(jsonMatch) as ParseRule;
    
    // 验证规则格式
    validateRule(rule);
    
    return {
      ...rule,
      id: undefined, // 新规则没有ID
    };
  } catch (error) {
    throw new Error(`解析AI生成的规则失败: ${error}`);
  }
}

/**
 * 从AI响应中提取JSON内容
 * 处理嵌套JSON、多个JSON块、Markdown代码块等情况
 */
function extractJSON(content: string): string | null {
  // 1. 尝试从Markdown代码块中提取
  const codeBlockMatch = content.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (codeBlockMatch) {
    const jsonStr = codeBlockMatch[1].trim();
    if (jsonStr.startsWith('{')) {
      return jsonStr;
    }
  }

  // 2. 尝试匹配完整的JSON对象（考虑嵌套）
  let braceCount = 0;
  let startIndex = -1;
  let inString = false;
  let escapeNext = false;

  for (let i = 0; i < content.length; i++) {
    const char = content[i];

    if (escapeNext) {
      escapeNext = false;
      continue;
    }

    if (char === '\\' && inString) {
      escapeNext = true;
      continue;
    }

    if (char === '"' && !escapeNext) {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === '{') {
      if (braceCount === 0) {
        startIndex = i;
      }
      braceCount++;
    } else if (char === '}') {
      braceCount--;
      if (braceCount === 0 && startIndex !== -1) {
        const jsonStr = content.substring(startIndex, i + 1);
        try {
          // 验证是否为有效JSON
          JSON.parse(jsonStr);
          return jsonStr;
        } catch (e) {
          // 继续寻找下一个JSON对象
          startIndex = -1;
        }
      }
    }
  }

  // 3. 如果上述方法都失败，尝试简单的正则匹配（作为后备）
  const simpleMatch = content.match(/\{[\s\S]*\}/);
  if (simpleMatch) {
    try {
      JSON.parse(simpleMatch[0]);
      return simpleMatch[0];
    } catch (e) {
      // 忽略无效的JSON
    }
  }

  return null;
}

/**
 * 验证规则格式（使用统一校验器）
 * 如果校验失败，尝试自动修复常见问题
 */
function validateRule(rule: any): void {
  const result = validateParseRule(rule);
  if (!result.valid) {
    // 尝试修复常见问题
    const repairedRule = tryRepairRule(rule, result.errors);
    if (repairedRule) {
      // 修复后重新校验
      const repairedResult = validateParseRule(repairedRule);
      if (repairedResult.valid) {
        // 修复成功，将修复后的规则复制回原对象
        Object.assign(rule, repairedRule);
        return;
      }
    }
    throw new Error(formatValidationErrors(result));
  }
}

/**
 * 尝试修复规则中的常见问题
 */
function tryRepairRule(rule: any, errors: any[]): any {
  if (!rule || typeof rule !== 'object') {
    return null;
  }

  // 深拷贝规则以避免修改原始对象
  const repairedRule = JSON.parse(JSON.stringify(rule));
  let repaired = false;

  // 修复 matrix 类型缺少 storeColumns 的问题
  if (repairedRule.parser?.type === 'matrix') {
    if (!repairedRule.parser.matrix) {
      repairedRule.parser.matrix = {
        headerRow: 0,
        skuColumn: 0,
        storeColumns: []
      };
      repaired = true;
    } else if (!repairedRule.parser.matrix.storeColumns || !Array.isArray(repairedRule.parser.matrix.storeColumns)) {
      repairedRule.parser.matrix.storeColumns = [];
      repaired = true;
    }
  }

  // 修复 double-matrix 类型缺少必要字段的问题
  if (repairedRule.parser?.type === 'double-matrix') {
    if (!repairedRule.parser.matrix) {
      repairedRule.parser.matrix = {
        headerRow: 0,
        firstColumnIsStore: true,
        storeColumnIndex: 0,
        dataStartColumn: 1,
        itemPattern: '(.+?)\\s*[xX×]\\s*(\\d+)'
      };
      repaired = true;
    }
  }

  // 修复 card 类型缺少必要字段的问题
  if (repairedRule.parser?.type === 'card') {
    if (!repairedRule.parser.card) {
      repairedRule.parser.card = {
        cardStartPattern: '',
        cardFields: []
      };
      repaired = true;
    }
  }

  // 修复 text 类型缺少必要字段的问题
  if (repairedRule.parser?.type === 'text') {
    if (!repairedRule.parser.text) {
      repairedRule.parser.text = {
        patterns: []
      };
      repaired = true;
    }
  }

  // 修复 multi-sheet 类型缺少必要字段的问题
  if (repairedRule.parser?.type === 'multi-sheet' || repairedRule.parser?.type === 'multi-page') {
    if (!repairedRule.parser.multiSource) {
      repairedRule.parser.multiSource = {
        sourceType: repairedRule.parser.type === 'multi-sheet' ? 'sheet' : 'page',
        mergeStrategy: 'append',
        subRule: {
          parser: {
            type: 'table',
            table: { headerRow: 0, dataStartRow: 1, columns: [] }
          }
        }
      };
      repaired = true;
    }
  }

  // 修复 identifier 缺失的问题
  if (!repairedRule.identifier) {
    repairedRule.identifier = {};
    repaired = true;
  }

  // 修复 fileTypes 缺失的问题
  if (!repairedRule.fileTypes || !Array.isArray(repairedRule.fileTypes) || repairedRule.fileTypes.length === 0) {
    repairedRule.fileTypes = ['excel'];
    repaired = true;
  }

  return repaired ? repairedRule : null;
}

/**
 * 从Excel文件提取样本数据
 */
export function extractExcelSample(data: any[][], maxRows: number = 20): string {
  const sampleRows = data.slice(0, maxRows);
  return sampleRows.map((row, i) => {
    const cells = row.map((cell: any) => String(cell ?? '')).join(' | ');
    return `[${i}] ${cells}`;
  }).join('\n');
}

/**
 * 从PDF文本提取样本数据
 */
export function extractPDFSample(text: string, maxChars: number = 3000): string {
  return text.substring(0, maxChars);
}

/**
 * 从Word文本提取样本数据
 */
export function extractWordSample(text: string, maxChars: number = 3000): string {
  return text.substring(0, maxChars);
}
