import { neon } from '@neondatabase/serverless';

// 懒加载，运行时才真正初始化连接
let _sql: ReturnType<typeof neon> | null = null;

export default function sql<T extends Record<string, unknown> = Record<string, unknown>>(strings: TemplateStringsArray, ...values: unknown[]) {
  if (!_sql) {
    _sql = neon(process.env.DATABASE_URL!);
  }
  // @ts-ignore
  return _sql(strings, ...values) as Promise<T[]>;
}

// 初始化表结构
export async function initDB() {
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
}

