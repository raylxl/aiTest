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
      sender_address  VARCHAR(500) NOT NULL,
      receiver_name   VARCHAR(100) NOT NULL,
      receiver_phone  VARCHAR(20) NOT NULL,
      receiver_address VARCHAR(500) NOT NULL,
      weight          DECIMAL(10,2) NOT NULL,
      quantity        INTEGER NOT NULL,
      temp_layer      VARCHAR(20) NOT NULL,
      remark          VARCHAR(500) DEFAULT '',
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
}

