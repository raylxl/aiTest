export interface FeeItem {
  id: number;
  feeCode: string;
  feeName: string;
  businessDomain: string;
  priceTypes: string[];
  remark: string;
  creator: string;
  createTime: string;
  updater: string;
  updateTime: string;
}

export interface FeeRuleItem {
  id: number;
  fee_name: string;
  fee_code?: string;
  settlement_subject: string;
  settlement_flow: string;
  income_org: string;
  expense_org: string;
  bill_node: string;
  settlement_node: string;
  start_date: string;
  end_date: string;
  remark: string;
  status: string;
  creator: string;
  create_time: string;
  updater: string;
  update_time: string;
  audit_person: string;
  audit_time: string;
}

export interface FormData {
  feeCode: string;
  feeName: string;
  businessDomain: string;
  priceTypes: string[];
  remark: string;
}

export interface QueryForm {
  feeCode: string;
  feeName: string;
  businessDomain: string;
  priceType: string;
}

export interface FeeRuleFormData {
  feeName: string;
  settlementSubject: string;
  settlementFlow: string;
  incomeOrg: string;
  expenseOrg: string;
  billNode: string;
  settlementNode: string;
  startDate: string;
  endDate: string;
  remark: string;
}

export interface FeeRuleQueryForm {
  feeName: string;
  settlementSubject: string;
  settlementFlow: string;
  incomeOrg: string;
  expenseOrg: string;
  billNode: string;
  settlementNode: string;
  startDate: string;
  status: string;
}

export interface Session {
  userId: string;
  username: string;
  nickname: string;
  role: 'admin' | 'user';
  loginTime: string;
}

export interface MenuItem {
  key: string;
  label: string;
  icon?: string;
  children?: MenuItem[];
}
