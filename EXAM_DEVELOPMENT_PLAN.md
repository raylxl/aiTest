# 万能导入 V2 考试开发计划

## 一、现状分析

### 已满足的考点（约 75%）

| 考点 | 状态 | 说明 |
|------|------|------|
| Next.js App Router + TypeScript | ✅ | Next 16.2.4 + TS |
| Vercel 部署 | ✅ | 已有 Vercel 配置 |
| Neon 数据库 | ✅ | 已集成 @neondatabase/serverless |
| 规则引擎（7种 parser） | ✅ | table/matrix/double-matrix/card/text/multi-sheet/multi-page |
| AI 生成规则（DeepSeek） | ✅ | SiliconFlow API，完整 DSL Prompt |
| 规则持久化 | ✅ | parse_rules 表 + CRUD API |
| 虚拟列表 | ✅ | react-window |
| Web Worker 解析 | ✅ | useParseWorker hook |
| 分片上传 | ✅ | upload_sessions/upload_chunks |
| 重复检测 | ✅ | check-duplicates API |
| 导出 Excel | ✅ | xlsx 库 |
| 进度条 | ✅ | ProgressBar 组件 |
| Toast 提示 | ✅ | Toast 组件 |
| 数据校验（A/B组） | ✅ | engine.ts validateOrders() |

### 需要修改的部分（约 25%）

#### 1. UI 配色统一（考点2: 30分中的关键项）
- `app/page.tsx` 中大量使用 `#00BEBE`，考试要求主色 `#0fc6c2`
  - `#00BEBE` = rgb(0,190,190)
  - `#0fc6c2` = rgb(15,198,194)
  - **差异很小但需统一**，全部替换为 `#0fc6c2`
- 首页 AI 考试占位图使用了 `#1677ff`，需改为 `#0fc6c2` 或移除

#### 2. 字段显示名称对齐考试术语
- 考试要求的字段名（面向用户的展示名）:
  - 外部编码（非"运单号"）
  - 收货门店（非"门店名称"）
  - 收件人姓名 / 收件人电话 / 收件人地址
  - SKU物品编码 / SKU物品名称 / SKU发货数量 / SKU规格型号
- 现有 `ParsedOrder` 接口字段名可以保持（内部用英文），但 **UI 表头和校验提示** 需要对齐考试术语

#### 3. 缺少 2 份考试测试文件
现有 7 份文件：
| # | 文件 | 格式 | parser 类型 |
|---|------|------|-------------|
| 1 | 12.25海口龙湖天街-配送发货单 | Excel | table + 尾部信息 |
| 2 | 湖南仓.xlsx | Excel | table + 跨行聚合 |
| 3 | 欢乐牧场模板0430.xlsx | Excel | matrix |
| 4 | 黔寨寨贵州烙锅（鞍山店）常温.pdf | PDF | table |
| 5 | 多门店分Sheet出库单.xlsx | Excel | multi-sheet |
| 6 | 门店调拨单-卡片式.xlsx | Excel | card |
| 7 | test.pdf | PDF | multi-page? |

**缺失的 2 份**：
- **门店配送确认单** (Word) → 需要 text parser 支持
- **周配送计划** (Excel) → 需要 double-matrix parser 支持
- **配送签收单(多单PDF)** → 需要 multi-page PDF parser 支持

注意：考题说"9份出库单"但只列了9种差异描述，实际随题发放的可能只有上述文件。需确认钉钉群里的完整文件。

#### 4. 规则选择流程
- 考试要求：**手动选择规则**，不做自动匹配
- 现有 `/api/analyze` 有规则复用命中机制（文件名模式/结构签名匹配）
- **需确认**：analyze 接口的"推荐"不等于"自动使用"，用户仍需确认

#### 5. 首页清理
- 现有首页是鲸天系统风格的完整管理系统布局
- 需要将"万能导入 V2"作为主功能入口，其他菜单保留但不需要深度实现

---

## 二、开发任务清单

### 阶段 1：UI 配色统一（预计 30 分钟）

**目标**：全站主色统一为 `#0fc6c2`

1. `app/page.tsx`：将所有 `#00BEBE` 替换为 `#0fc6c2`
2. `app/page.tsx`：首页 AI 考试区域的 `#1677ff` 引用改为 `#0fc6c2`
3. 确认 `globals.css` 中的 `--el-color-primary: #0fc6c2` 已正确（✅ 已有）
4. 检查所有组件的 inline style 和 Tailwind class 中的颜色引用

### 阶段 2：字段术语对齐（预计 20 分钟）

**目标**：UI 表头和校验提示使用考试要求的字段名

1. `app/components/Orders/OrderTable.tsx`：表头列名对齐
   - "运单号" → "外部编码"
   - "门店" → "收货门店"
   - "物品编码" → "SKU物品编码"
   - "物品名称" → "SKU物品名称"
   - "数量" → "SKU发货数量"
   - "规格" → "SKU规格型号"
2. `lib/parser/engine.ts`：校验错误提示对齐
3. `app/import/page.tsx`：预览和校验界面的字段名

### 阶段 3：补充缺失测试文件（预计 30 分钟）

**目标**：创建/补充缺失的 demo 文件，确保 9 种格式全部可测试

1. 创建 **门店配送确认单.docx** — 纯文本段落格式，用分隔线划分记录
2. 创建 **周配送计划.xlsx** — 日期×门店矩阵，单元格内含复合值
3. 创建 **配送签收单(多单).pdf** — 多页多单 PDF（或用现有 test.pdf 验证）

### 阶段 4：规则引擎验证与修复（预计 60 分钟）

**目标**：确保 9 份 demo 文件全部可正确解析

逐一测试每份 demo 文件：
1. 海口龙湖天街 → table parser + 尾部信息提取
2. 湖南仓 → table parser + rowAggregate 跨行聚合
3. 欢乐牧场 → matrix parser
4. 黔寨寨 PDF → PDF table parser + 底部收货人
5. 多门店分Sheet → multi-sheet parser
6. 门店调拨单 → card parser
7. Word 门店配送确认单 → text parser
8. 周配送计划 → double-matrix parser + compositeCellSplit
9. 配送签收单(多单PDF) → multi-page PDF parser

### 阶段 5：交互体验完善（预计 30 分钟）

**目标**：考点2交互反馈完善

1. 确认 Loading 状态覆盖所有异步操作
2. 确认按钮防重复点击
3. 空状态占位图
4. 过渡动画（已有部分 CSS 动画）
5. 响应式适配检查

### 阶段 6：性能验证（预计 20 分钟）

**目标**：考点4 硬性指标

1. 生成 1000 条测试数据的 Excel
2. 测试上传→解析→预览 全链路耗时
3. 确认虚拟列表在 1000+ 条数据下表现
4. 内存占用检查

### 阶段 7：Vercel 部署与验证（预计 20 分钟）

**目标**：部署到 Vercel 并提供 URL

1. git push 到 GitHub
2. Vercel 自动部署
3. 验证线上环境所有功能

---

## 三、关键技术决策

### 3.1 规则引擎设计（已实现，50分核心）
- ✅ 通用规则 DSL（不硬编码）
- ✅ 7 种 parser 类型覆盖所有复杂格式
- ✅ AI 自动生成规则（DeepSeek）
- ✅ 规则可编辑、可预览、可保存
- ✅ 用户手动选择规则（不做自动匹配）

### 3.2 AI 集成方案（已实现）
- 模型：DeepSeek-V4-Pro via SiliconFlow
- Prompt：完整规则 DSL 定义 + 标准字段列表
- 安全：API Key 在服务端（.env.local），前端通过 /api/analyze 调用

### 3.3 数据库设计（已实现）
- parse_rules 表：规则持久化
- import_batches + import_orders 表：批次和运单数据
- schema_migrations 表：版本管理

---

## 四、评分对标

| 考点 | 分值 | 当前预估 | 行动项 |
|------|------|---------|--------|
| 项目搭建与Vercel部署 | 10 | 10 | 部署验证 |
| UI风格与交互体验 | 30 | 25 | 配色统一 + 交互完善 |
| 规则引擎+AI生成 | 50 | 45 | 补全测试文件 + 逐个验证 |
| 性能要求 | 20 | 18 | 基准测试验证 |
| **合计** | **110** | **98** | - |

---

## 五、执行顺序建议

1. **先做阶段 1-2**（配色 + 字段名）：改动小，见效快，直接加分
2. **再做阶段 3-4**（测试文件 + 引擎验证）：核心考点，必须全通过
3. **最后做阶段 5-7**（交互 + 性能 + 部署）：收尾打磨
