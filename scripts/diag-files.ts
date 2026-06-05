/**
 * 诊断脚本：打印每个demo文件的原始读取内容
 * 运行: npx tsx scripts/diag-files.ts
 */
import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';

const DEMOS_DIR = path.resolve(__dirname, '../../exam-demos/demos');

const files = fs.readdirSync(DEMOS_DIR).filter(f => !f.startsWith('.') && !f.endsWith('.json'));

for (const fname of files) {
  const fpath = path.join(DEMOS_DIR, fname);
  const ext = path.extname(fname).toLowerCase();
  
  console.log(`\n${'='.repeat(70)}`);
  console.log(`文件: ${fname} (${(fs.statSync(fpath).size / 1024).toFixed(1)}KB, ${ext})`);
  
  if (ext === '.xlsx' || ext === '.xls') {
    const buf = fs.readFileSync(fpath);
    const wb = XLSX.read(buf, { type: 'buffer' });
    console.log(`Sheets: ${wb.SheetNames.join(', ')}`);
    
    for (const sn of wb.SheetNames) {
      const ws = wb.Sheets[sn];
      const data = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: '' });
      console.log(`\n  Sheet "${sn}": ${data.length} rows`);
      
      // 打印前15行，标注非空列数
      for (let i = 0; i < Math.min(data.length, 15); i++) {
        const row = data[i];
        const nonEmpty = row.filter((c: any) => c !== '' && c !== null && c !== undefined);
        const values = nonEmpty.map((c: any) => {
          const s = String(c).trim();
          return s.length > 30 ? s.substring(0, 30) + '...' : s;
        });
        console.log(`  [${i}] (${nonEmpty.length} cols) ${values.join(' | ')}`);
      }
    }
  } else if (ext === '.pdf') {
    // 对PDF，通过API获取样本
    console.log(`  (PDF文件，通过API分析)`);
  }
}

console.log(`\n${'='.repeat(70)}`);