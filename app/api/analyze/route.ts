import { NextRequest, NextResponse } from 'next/server';
import { parseExcelFile } from '@/lib/parser/excel-parser';
import { parsePDFFile } from '@/lib/parser/pdf-parser';
import { parseWordFile } from '@/lib/parser/word-parser';
import { generateRuleWithAI, extractExcelSample, extractPDFSample, extractWordSample } from '@/lib/ai/deepseek';
import sql, { initDB } from '@/lib/db';
import type { FileType } from '@/types/rule';

/**
 * 计算文件内容的简单哈希（用于规则匹配）
 */
function computeContentHash(content: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
}

/**
 * 提取文件结构签名（列名、字段模式等）
 */
function extractStructureSignature(sample: string, fileType: FileType): string {
  // 提取前几行作为结构特征
  const lines = sample.split('\n').slice(0, 5);
  const signature = lines.join('|').toLowerCase().replace(/\s+/g, '');
  return computeContentHash(signature);
}

/**
 * 尝试从规则库中匹配已有规则
 */
async function findMatchingRule(fileName: string, fileType: FileType, sample: string): Promise<any | null> {
  try {
    await initDB();
    
    // 1. 基于文件名模式匹配
    const fileNamePattern = fileName.replace(/\.[^/.]+$/, '').replace(/[\d_\-]+$/g, '').trim();
    if (fileNamePattern.length > 2) {
      const nameMatches = await sql`
        SELECT id, name, rule_json, usage_count, is_ai_generated
        FROM parse_rules
        WHERE is_active = true
        AND name ILIKE ${'%' + fileNamePattern + '%'}
        ORDER BY usage_count DESC
        LIMIT 3
      `;
      
      if ((nameMatches as any[]).length > 0) {
        // 返回使用次数最多的规则
        return (nameMatches as any[])[0];
      }
    }
    
    // 2. 基于结构签名匹配
    const structureSignature = extractStructureSignature(sample, fileType);
    const signatureMatches = await sql`
      SELECT id, name, rule_json, usage_count, is_ai_generated
      FROM parse_rules
      WHERE is_active = true
      AND rule_json->>'structureSignature' = ${structureSignature}
      ORDER BY usage_count DESC
      LIMIT 1
    `;
    
    if ((signatureMatches as any[]).length > 0) {
      return (signatureMatches as any[])[0];
    }
    
    // 3. 基于文件类型和使用频率推荐
    const fileTypeMatches = await sql`
      SELECT id, name, rule_json, usage_count, is_ai_generated
      FROM parse_rules
      WHERE is_active = true
      AND ${fileType} = ANY(file_types)
      AND usage_count > 0
      ORDER BY usage_count DESC
      LIMIT 1
    `;
    
    if ((fileTypeMatches as any[]).length > 0) {
      return (fileTypeMatches as any[])[0];
    }
    
    return null;
  } catch (error) {
    console.error('规则匹配失败:', error);
    return null;
  }
}

/**
 * 文件分析API - 上传文件后，AI自动分析结构并生成解析规则
 * 这是"万能导入"的核心：不硬编码任何文件格式
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: '请上传文件' }, { status: 400 });
    }

    const fileName = file.name;
    const fileType = detectFileType(fileName);
    const buffer = await file.arrayBuffer();

    // 提取文件内容样本
    let sample = '';
    let sheets: string[] = [];

    switch (fileType) {
      case 'excel': {
        const excelData = await parseExcelFile(buffer);
        sheets = excelData.sheets.map(s => s.name);
        const firstSheet = excelData.sheets[0];
        if (firstSheet) {
          sample = extractExcelSample(firstSheet.data, 25);
        }
        break;
      }
      case 'pdf': {
        const pdfData = await parsePDFFile(buffer);
        sample = extractPDFSample(pdfData.fullText, 3000);
        break;
      }
      case 'word': {
        const wordData = await parseWordFile(buffer);
        sample = extractWordSample(wordData.text, 3000);
        break;
      }
      case 'csv': {
        const text = new TextDecoder().decode(buffer);
        sample = text.substring(0, 3000);
        break;
      }
    }

    if (!sample.trim()) {
      return NextResponse.json({ error: '无法提取文件内容' }, { status: 400 });
    }

    // 1. 先尝试匹配已有规则（规则复用命中机制）
    const matchedRule = await findMatchingRule(fileName, fileType, sample);
    
    if (matchedRule) {
      // 命中已有规则，直接返回
      console.log(`[规则复用] 命中规则: ${matchedRule.name} (ID: ${matchedRule.id}, 使用次数: ${matchedRule.usage_count})`);
      
      // 计算样本hash
      const sampleHash = computeContentHash(sample.substring(0, 500));
      
      // 更新规则使用次数和最后使用时间
      await sql`
        UPDATE parse_rules 
        SET usage_count = usage_count + 1, 
            last_used_at = NOW(),
            source_sample_hash = ${sampleHash},
            updated_at = NOW()
        WHERE id = ${matchedRule.id}
      `;
      
      return NextResponse.json({
        success: true,
        rule: matchedRule.rule_json,
        sample: sample.substring(0, 1000),
        fileInfo: {
          name: fileName,
          type: fileType,
          sheets,
        },
        ruleSource: 'matched', // 标记规则来源
        matchedRuleId: matchedRule.id,
        matchedRuleName: matchedRule.name,
      });
    }

    // 2. 未命中，调用AI生成解析规则
    console.log('[规则复用] 未命中已有规则，调用AI生成');
    const rule = await generateRuleWithAI(sample, fileType, fileName);

    return NextResponse.json({
      success: true,
      rule,
      sample: sample.substring(0, 1000), // 返回部分样本供前端预览
      fileInfo: {
        name: fileName,
        type: fileType,
        sheets,
      },
      ruleSource: 'ai_generated', // 标记规则来源
    });
  } catch (error) {
    console.error('文件分析失败:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '文件分析失败' },
      { status: 500 }
    );
  }
}

function detectFileType(fileName: string): FileType {
  const ext = fileName.toLowerCase().split('.').pop();
  switch (ext) {
    case 'xlsx': case 'xls': case 'xlsm': return 'excel';
    case 'pdf': return 'pdf';
    case 'docx': case 'doc': return 'word';
    case 'csv': return 'csv';
    default: throw new Error(`不支持的文件类型: ${ext}`);
  }
}
