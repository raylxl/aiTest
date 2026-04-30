import { neon } from '@neondatabase/serverless';

// 懒加载，运行时才真正初始化连接
let _sql: ReturnType<typeof neon> | null = null;

function getSql() {
  if (!_sql) {
    _sql = neon(process.env.DATABASE_URL!);
  }
  return _sql;
}

export default function sql<T extends Record<string, unknown> = Record<string, unknown>>(strings: TemplateStringsArray, ...values: unknown[]) {
  const sqlFn = getSql();
  // @ts-ignore
  return sqlFn(strings, ...values) as Promise<T[]>;
}

// 支持原生 SQL 查询（用于复杂查询和批量操作）
// 注意：neon 需要使用模板字符串标签语法
export async function sqlQuery<T = Record<string, unknown>>(query: string, params?: unknown[]): Promise<T[]> {
  const sqlFn = getSql();
  // 使用 Function 构造器来执行动态 SQL（不推荐但这里必须使用）
  // @ts-ignore
  const result = await sqlFn.raw(query, params || []);
  return result as T[];
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
}

