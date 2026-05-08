import { neon } from '@neondatabase/serverless';

// 懒加载，运行时才真正初始化连接
let _sql: ReturnType<typeof neon> | null = null;

function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('环境变量 DATABASE_URL 未配置，请检查 Vercel 环境变量设置');
  }
  return url;
}

export function getNeonClient() {
  if (!_sql) {
    _sql = neon(getDatabaseUrl());
  }
  return _sql;
}

export default function sql<T extends Record<string, unknown> = Record<string, unknown>>(strings: TemplateStringsArray, ...values: unknown[]) {
  const sqlFn = getNeonClient();
  // @ts-ignore
  return sqlFn(strings, ...values) as Promise<T[]>;
}

// 初始化表结构
export async function initDB() {
  // 费用类型表
  await sql`
    CREATE TABLE IF NOT EXISTS fee_types (
      id         SERIAL PRIMARY KEY,
      fee_code   VARCHAR(20)  NOT NULL UNIQUE,
      fee_name   VARCHAR(100) NOT NULL,
      business_domain VARCHAR(50) NOT NULL,
      price_types  TEXT[]       DEFAULT '{}',
      remark      TEXT         DEFAULT '',
      creator     VARCHAR(50)  NOT NULL,
      create_time TIMESTAMPTZ  DEFAULT NOW(),
      updater     VARCHAR(50)  NOT NULL,
      update_time TIMESTAMPTZ  DEFAULT NOW()
    )
  `;

  // 费用规则表
  await sql`
    CREATE TABLE IF NOT EXISTS fee_rules (
      id              SERIAL PRIMARY KEY,
      fee_name        VARCHAR(100) NOT NULL,           -- 费用名称（关联费用类型）
      settlement_subject VARCHAR(50) NOT NULL,         -- 结算主体：寄方/派方/中转
      settlement_flow VARCHAR(100) NOT NULL,           -- 结算流向
      income_org      VARCHAR(100) NOT NULL,           -- 收入机构
      expense_org     VARCHAR(100) NOT NULL,           -- 支出机构
      bill_node       VARCHAR(50) NOT NULL,            -- 账单节点
      settlement_node VARCHAR(50) NOT NULL,           -- 结算节点
      start_date      DATE NOT NULL,                  -- 生效日期
      end_date        DATE NOT NULL,                  -- 失效日期
      remark          TEXT DEFAULT '',                 -- 备注
      status          VARCHAR(20) DEFAULT 'pending',  -- 审核状态：pending-未审核，approved-已审核
      creator         VARCHAR(50) NOT NULL,
      create_time     TIMESTAMPTZ DEFAULT NOW(),
      updater         VARCHAR(50) NOT NULL,
      update_time     TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  // 运单表
  await sql`
    CREATE TABLE IF NOT EXISTS waybills (
      id              SERIAL PRIMARY KEY,
      external_code   VARCHAR(100) UNIQUE,
      sender_name     VARCHAR(100) NOT NULL,
      sender_phone    VARCHAR(20) NOT NULL,
      sender_address  TEXT NOT NULL,
      receiver_name   VARCHAR(100) NOT NULL,
      receiver_phone  VARCHAR(20) NOT NULL,
      receiver_address TEXT NOT NULL,
      weight          DECIMAL(10,2) NOT NULL,
      quantity        INTEGER NOT NULL,
      temp_layer      VARCHAR(20) NOT NULL,
      remark          TEXT DEFAULT '',
      status          VARCHAR(20) DEFAULT 'submitted',
      created_at      TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  // 模板映射表
  await sql`
    CREATE TABLE IF NOT EXISTS template_mappings (
      id             SERIAL PRIMARY KEY,
      header_hash    VARCHAR(64) NOT NULL UNIQUE,
      header_columns JSONB NOT NULL,
      created_at    TIMESTAMPTZ DEFAULT NOW(),
      updated_at     TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  // ========== 数据库迁移（冷启动自动执行，PostgreSQL ALTER IF NOT EXISTS 等效）==========
  // 迁移记录表
  await sql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id         SERIAL PRIMARY KEY,
      version    VARCHAR(20) NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  // Migration 001: waybills 字段扩展为 TEXT（已有 CREATE TABLE 时字段已是 TEXT，但存量数据表可能仍为 VARCHAR）
  const [m001] = await sql`SELECT id FROM schema_migrations WHERE version = '001' LIMIT 1`;
  if (!m001) {
    try {
      await sql`ALTER TABLE waybills ALTER COLUMN sender_address TYPE TEXT`;
      await sql`ALTER TABLE waybills ALTER COLUMN receiver_address TYPE TEXT`;
      await sql`ALTER TABLE waybills ALTER COLUMN remark TYPE TEXT`;
      await sql`INSERT INTO schema_migrations (version) VALUES ('001')`;
    } catch {
      // 字段可能已是 TEXT 或表结构差异，忽略错误
    }
  }

  // Migration 002: template_mappings 表扩展（支持多表 + 模板名称）
  const [m002] = await sql`SELECT id FROM schema_migrations WHERE version = '002' LIMIT 1`;
  if (!m002) {
    try {
      // 1. 新增 table_name 列（默认 'waybills'，现有数据兼容）
      await sql`ALTER TABLE template_mappings ADD COLUMN IF NOT EXISTS table_name VARCHAR(50) NOT NULL DEFAULT 'waybills'`;
      // 2. 新增 name 列（模板名称，方便识别）
      await sql`ALTER TABLE template_mappings ADD COLUMN IF NOT EXISTS name VARCHAR(200)`;
      // 3. 新增 column_hash 列（列名字符串 hash，费用类型用）
      await sql`ALTER TABLE template_mappings ADD COLUMN IF NOT EXISTS column_hash VARCHAR(100)`;
      // 4. 移除原 header_hash 的唯一约束（改为复合唯一）
      await sql`ALTER TABLE template_mappings DROP CONSTRAINT IF EXISTS template_mappings_header_hash_key`;
      // 5. 重建唯一约束 (table_name, column_hash) — 费用类型用
      await sql`ALTER TABLE template_mappings ADD CONSTRAINT template_mappings_table_col_hash_key UNIQUE (table_name, column_hash)`;
      // 6. 旧数据迁移：waybills 的 header_columns 中提取 column_hash
      await sql`
        UPDATE template_mappings
        SET column_hash = header_hash, table_name = 'waybills'
        WHERE table_name = 'waybills' AND column_hash IS NULL
      `;
      await sql`INSERT INTO schema_migrations (version) VALUES ('002')`;
    } catch {
      // 迁移可能部分成功，忽略错误
    }
  }
}

