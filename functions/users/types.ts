export enum FieldName {
  users = 'users',
}

export interface FunctionEvent {
  arguments: {
    filter?: any;
    limit?: number;
    from?: number;
  };
  identity: { sub: string; claims: CognitoClaims };
  info: { fieldName: FieldName };
}

export interface UserFilterInput {
  search?: string;
}

export interface CognitoClaims {
  sub: string;
  aud: string;
  token_use: string;
  email: string;
  'cognito:groups': string[];
  'cognito:username': string;
  'custom:trzUserId': string;
  'custom:clubs': string;
  'custom:federations': string;
  'custom:trzWalletsId': string;
  'custom:trzScopes': string;
  'custom:trzCardsId': string;
  'custom:trzChildren': string;
}

export interface TreezorUser {
  userId: number | null;
  walletId: number | null;
  kycReview: string | null;
}

export interface LoginActivity {
  ip: String;
  country: String;
  city: string;
  device: string;
  loginDate: string;
}

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  parentUserId: string | null;
  country: string;
  city: string;
  phone: string;
  phoneCountry: string;
  birthDate: string;
  createDate: string;
  treezor: TreezorUser;
  recentActivity: LoginActivity[];
}

export interface UsersConnection {
  items: User[];
  totalCount: number;
}
