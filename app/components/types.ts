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
