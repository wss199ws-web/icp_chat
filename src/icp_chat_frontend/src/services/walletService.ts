import { Actor, HttpAgent } from '@dfinity/agent';
import { Principal } from '@dfinity/principal';
import { IDL } from '@dfinity/candid';

// 类型定义，避免循环引用
type IDLType = typeof IDL;
import { config } from '../config';
import { authService } from './authService';
import { createActor } from './icpAgent';

// ICP Ledger Canister ID (主网)
const LEDGER_CANISTER_ID_MAINNET = 'ryjl3-tyaaa-aaaaa-aaaba-cai';
// 本地开发时也使用主网 Ledger canister ID（通过本地网络代理访问）
// 注意：本地测试时，即使使用主网 Ledger ID，也会通过 localhost:4943 代理访问
const LEDGER_CANISTER_ID_LOCAL = 'ryjl3-tyaaa-aaaaa-aaaba-cai';

// Ledger IDL 定义（简化版，只包含我们需要的方法）
// 注意：虽然 Ledger 期望 blob 类型，但在 Candid IDL 中 blob 用 Vec<Nat8> 表示
// 关键是要确保传递 Uint8Array，让 @dfinity/agent 正确处理编码
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ledgerIdlFactory = ({ IDL }: { IDL: IDLType }) => {
  // AccountIdentifier 是 32 字节，在 Candid 中表示为 Vec<Nat8>
  // 虽然 Ledger 内部期望 blob，但 IDL 定义使用 Vec<Nat8>
  const AccountIdentifier = IDL.Vec(IDL.Nat8);
  const SubAccount = IDL.Vec(IDL.Nat8);
  const BlockHeight = IDL.Nat64;
  const Memo = IDL.Nat64;
  const Timestamp = IDL.Nat64;
  const Tokens = IDL.Record({ e8s: IDL.Nat64 });
  // 根据错误信息，Ledger 期望 record { account : blob }
  // 但标准 IDL 使用 account_identifier，尝试两种方式
  const AccountBalanceArgs = IDL.Record({
    account: AccountIdentifier,
  });
  const TransferArgs = IDL.Record({
    to: AccountIdentifier,
    fee: Tokens,
    memo: Memo,
    from_subaccount: IDL.Opt(SubAccount),
    created_at_time: IDL.Opt(IDL.Record({ timestamp_nanos: Timestamp })),
    amount: Tokens,
  });
  const TransferError = IDL.Variant({
    BadFee: IDL.Record({ expected_fee: Tokens }),
    InsufficientFunds: IDL.Record({ balance: Tokens }),
    TxTooOld: IDL.Record({ allowed_window_nanos: IDL.Nat64 }),
    TxCreatedInFuture: IDL.Null,
    Duplicate: IDL.Record({ duplicate_of: BlockHeight }),
    TemporarilyUnavailable: IDL.Null,
    GenericError: IDL.Record({
      message: IDL.Text,
      error_code: IDL.Nat64,
    }),
  });
  const TransferResult = IDL.Variant({
    Ok: BlockHeight,
    Err: TransferError,
  });

  return IDL.Service({
    account_balance: IDL.Func([AccountBalanceArgs], [Tokens], ['query']),
    transfer: IDL.Func([TransferArgs], [TransferResult], []),
  });
};

// Ledger Actor 接口类型
// 注意：虽然 IDL 定义为 Vec<Nat8>，但我们需要传递 number[]
// 根据错误信息，Ledger 期望参数名为 account 而不是 account_identifier
interface LedgerService {
  account_balance: (args: { account: number[] }) => Promise<{ e8s: bigint }>;
  transfer: (args: {
    to: Uint8Array | number[];
    fee: { e8s: bigint };
    memo: bigint;
    from_subaccount?: [] | [Uint8Array | number[]];
    created_at_time?: [] | [{ timestamp_nanos: bigint }];
    amount: { e8s: bigint };
  }) => Promise<{ Ok?: bigint; Err?: any }>;
}

// 创建 Ledger Actor
async function createLedgerActor(): Promise<LedgerService> {
  // 检查是否已登录
  const isAuthenticated = await authService.isAuthenticated();
  if (!isAuthenticated) {
    throw new Error('请先登录以使用钱包功能。钱包功能需要 Internet Identity 身份验证。');
  }

  let identity;
  try {
    identity = await authService.getIdentity();
  } catch (error) {
    console.error('[WalletService] 获取身份失败:', error);
    throw new Error('无法获取用户身份。请确保已登录并刷新页面重试。');
  }

  const network = config.network;
  const ledgerCanisterId = network === 'ic' ? LEDGER_CANISTER_ID_MAINNET : LEDGER_CANISTER_ID_LOCAL;
  const host = config.host;

  const agent = new HttpAgent({ 
    host,
    identity 
  });

  if (network !== 'ic') {
    try {
      await agent.fetchRootKey();
    } catch (error) {
      console.warn('[WalletService] 获取 root key 失败，继续尝试:', error);
      // 本地网络可能不需要 root key，继续执行
    }
  }

  // @ts-expect-error - IDL factory type mismatch, but works at runtime
  return Actor.createActor(ledgerIdlFactory, {
    agent,
    canisterId: ledgerCanisterId,
  }) as unknown as LedgerService;
}

// CRC32 计算函数
function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// 将 Principal 转换为账户标识符（AccountIdentifier）
// AccountIdentifier 是 32 字节：28 字节 SHA-224 哈希 + 4 字节 CRC32 校验和
export async function principalToAccountIdentifier(
  principal: Principal,
  subAccount?: Uint8Array
): Promise<Uint8Array> {
  const principalBytes = principal.toUint8Array();
  
  // 准备数据：Principal + SubAccount（如果有）
  // SubAccount 默认是 32 字节的零数组
  const defaultSubAccount = new Uint8Array(32).fill(0);
  const subAccountBytes = subAccount || defaultSubAccount;
  
  // 组合 Principal 和 SubAccount
  const data = new Uint8Array(principalBytes.length + subAccountBytes.length);
  data.set(principalBytes, 0);
  data.set(subAccountBytes, principalBytes.length);
  
  // 计算 SHA-256 哈希（SHA-224 是 SHA-256 的前 28 字节）
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = new Uint8Array(hashBuffer);
  const sha224 = hashArray.slice(0, 28); // SHA-224 是 SHA-256 的前 28 字节
  
  // 计算 CRC32 校验和
  const crc = crc32(sha224);
  
  // 组合：28 字节哈希 + 4 字节 CRC32
  const accountIdentifier = new Uint8Array(32);
  accountIdentifier.set(sha224, 0);
  accountIdentifier.set([
    (crc >>> 24) & 0xff,
    (crc >>> 16) & 0xff,
    (crc >>> 8) & 0xff,
    crc & 0xff,
  ], 28);
  
  return accountIdentifier;
}

// 获取账户余额（通过后端 canister）
// 注意：不再需要 principal 参数，后端会自动使用 caller（当前登录用户）
export async function getAccountBalance(): Promise<bigint> {
  try {
    // 检查是否已登录
    const isAuthenticated = await authService.isAuthenticated();
    if (!isAuthenticated) {
      throw new Error('请先登录以查询余额。余额查询需要 Internet Identity 身份验证。');
    }

    // 通过后端 canister 获取余额
    const actor = await createActor();
    const balance = await actor.getIcpBalance();
    
    // 后端返回的是 Nat（bigint），单位是 e8s
    return balance || BigInt(0);
  } catch (error) {
    console.error('[WalletService] 获取余额失败:', error);
    
    // 提供更友好的错误信息
    if (error instanceof Error) {
      const errorMessage = error.message;
      
      // 身份验证相关错误
      if (errorMessage.includes('403') || errorMessage.includes('Forbidden') || 
          errorMessage.includes('authenticate') || errorMessage.includes('certificate') ||
          errorMessage.includes('请先登录')) {
        throw new Error('身份验证失败。请确保已登录，如果问题持续，请尝试退出并重新登录。');
      }
      
      // 网络相关错误
      if (errorMessage.includes('network') || errorMessage.includes('fetch') ||
          errorMessage.includes('canister_not_found')) {
        const network = config.network;
        if (network === 'local') {
          throw new Error('无法连接到本地 ICP 网络。请确保已运行: dfx start --background');
        } else {
          throw new Error('无法连接到 ICP 网络。请检查网络连接或尝试切换 API 端点。');
        }
      }
      
      // 直接抛出原始错误信息（如果已经是我们自定义的错误）
      throw error;
    }
    
    throw new Error('获取余额失败，请稍后重试。');
  }
}

// 转账 ICP
export async function transferICP(
  to: Principal,
  amount: bigint,
  memo?: bigint
): Promise<bigint> {
  try {
    const ledger = await createLedgerActor();
    const toAccountIdentifier = await principalToAccountIdentifier(to);
    
    // 将 Uint8Array 转换为 number[] 数组格式（Vec<Nat8>）
    const toAccountIdentifierArray: number[] = Array.from(toAccountIdentifier);
    
    const transferArgs = {
      to: toAccountIdentifierArray,
      fee: { e8s: BigInt(10000) }, // 标准转账费用 0.0001 ICP
      memo: memo || BigInt(0),
      amount: { e8s: amount },
      created_at_time: [{ timestamp_nanos: BigInt(Date.now() * 1000000) }] as [{ timestamp_nanos: bigint }],
    };

    const result = await ledger.transfer(transferArgs);

    if (result.Err) {
      const error = result.Err;
      let errorMessage = '转账失败';
      
      if (error.InsufficientFunds) {
        errorMessage = `余额不足。当前余额: ${formatICP(error.InsufficientFunds.balance.e8s)} ICP`;
      } else if (error.BadFee) {
        errorMessage = `手续费错误。期望手续费: ${formatICP(error.BadFee.expected_fee.e8s)} ICP`;
      } else if (error.GenericError) {
        errorMessage = error.GenericError.message || '转账失败';
      } else if (error.TemporarilyUnavailable) {
        errorMessage = '服务暂时不可用，请稍后重试';
      } else if (error.TxTooOld) {
        errorMessage = '交易已过期，请重试';
      } else if (error.TxCreatedInFuture) {
        errorMessage = '交易时间在未来，请检查系统时间';
      } else if (error.Duplicate) {
        errorMessage = `交易重复，已在区块 ${error.Duplicate.duplicate_of} 确认`;
      } else {
        errorMessage = '转账失败，请检查参数';
      }
      
      throw new Error(errorMessage);
    }

    if (result.Ok !== undefined) {
      return result.Ok;
    }

    throw new Error('转账失败：未知错误');
  } catch (error) {
    console.error('[WalletService] 转账失败:', error);
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('转账失败：未知错误');
  }
}

// 格式化 ICP 数量（从 e8s 转换为 ICP）
export function formatICP(e8s: bigint): string {
  const icp = Number(e8s) / 100000000;
  return icp.toFixed(8).replace(/\.?0+$/, '');
}

// 将 ICP 转换为 e8s
export function icpToE8s(icp: number): bigint {
  return BigInt(Math.floor(icp * 100000000));
}

// 获取当前用户的 Principal
export async function getCurrentPrincipal(): Promise<Principal | null> {
  try {
    const identity = await authService.getIdentity();
    return identity.getPrincipal();
  } catch (error) {
    console.warn('[WalletService] 获取 Principal 失败:', error);
    return null;
  }
}

// 将 AccountIdentifier 转换为十六进制字符串
export function accountIdentifierToHex(accountIdentifier: Uint8Array): string {
  return Array.from(accountIdentifier)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// 将 AccountIdentifier 转换为可显示的格式（带省略号）
export function formatAccountIdentifier(accountIdentifier: Uint8Array, startLength: number = 6, endLength: number = 4): string {
  const hex = accountIdentifierToHex(accountIdentifier);
  if (hex.length <= startLength + endLength) {
    return hex;
  }
  return `${hex.slice(0, startLength)}...${hex.slice(-endLength)}`;
}

// 获取当前用户的账户标识符（用于收款）
export async function getCurrentAccountIdentifier(): Promise<Uint8Array | null> {
  try {
    const principal = await getCurrentPrincipal();
    if (!principal) {
      return null;
    }
    return await principalToAccountIdentifier(principal);
  } catch (error) {
    console.warn('[WalletService] 获取账户标识符失败:', error);
    return null;
  }
}

