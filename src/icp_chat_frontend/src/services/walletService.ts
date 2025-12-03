import { HttpAgent } from '@dfinity/agent';
import { Principal } from '@dfinity/principal';
import { AccountIdentifier, LedgerCanister, SubAccount } from '@dfinity/ledger-icp';

// 类型定义，避免循环引用
import { config } from '../config';
import { authService } from './authService';
import { createActor } from './icpAgent';
import type {
  IcpTxHistoryPage,
  IcpTxRecord,
} from '../declarations/icp_chat_backend/icp_chat_backend.did.d';

// ICP Ledger Canister ID (主网)
const LEDGER_CANISTER_ID_MAINNET = 'ryjl3-tyaaa-aaaaa-aaaba-cai';
// 本地开发时也使用主网 Ledger canister ID（通过本地网络代理访问）
// 注意：本地测试时，即使使用主网 Ledger ID，也会通过 localhost:4943 代理访问
// const LEDGER_CANISTER_ID_LOCAL = 'ryjl3-tyaaa-aaaaa-aaaba-cai';

// Ledger IDL 定义（简化版，只包含我们需要的方法）
// 注意：虽然 Ledger 期望 blob 类型，但在 Candid IDL 中 blob 用 Vec<Nat8> 表示
// 关键是要确保传递 Uint8Array，让 @dfinity/agent 正确处理编码
// eslint-disable-next-line @typescript-eslint/no-explicit-any
// const ledgerIdlFactory = ({ IDL }: { IDL: IDLType }) => {
//   // AccountIdentifier 是 32 字节，在 Candid 中表示为 Vec<Nat8>
//   // 虽然 Ledger 内部期望 blob，但 IDL 定义使用 Vec<Nat8>
//   const AccountIdentifier = IDL.Vec(IDL.Nat8);
//   const SubAccount = IDL.Vec(IDL.Nat8);
//   const BlockHeight = IDL.Nat64;
//   const Memo = IDL.Nat64;
//   const Timestamp = IDL.Nat64;
//   const Tokens = IDL.Record({ e8s: IDL.Nat64 });
//   // 根据错误信息，Ledger 期望 record { account : blob }
//   // 但标准 IDL 使用 account_identifier，尝试两种方式
//   const AccountBalanceArgs = IDL.Record({
//     account: AccountIdentifier,
//   });
//   const TransferArgs = IDL.Record({
//     to: AccountIdentifier,
//     fee: Tokens,
//     memo: Memo,
//     from_subaccount: IDL.Opt(SubAccount),
//     created_at_time: IDL.Opt(IDL.Record({ timestamp_nanos: Timestamp })),
//     amount: Tokens,
//   });
//   const TransferError = IDL.Variant({
//     BadFee: IDL.Record({ expected_fee: Tokens }),
//     InsufficientFunds: IDL.Record({ balance: Tokens }),
//     TxTooOld: IDL.Record({ allowed_window_nanos: IDL.Nat64 }),
//     TxCreatedInFuture: IDL.Null,
//     Duplicate: IDL.Record({ duplicate_of: BlockHeight }),
//     TemporarilyUnavailable: IDL.Null,
//     GenericError: IDL.Record({
//       message: IDL.Text,
//       error_code: IDL.Nat64,
//     }),
//   });
//   const TransferResult = IDL.Variant({
//     Ok: BlockHeight,
//     Err: TransferError,
//   });

//   return IDL.Service({
//     account_balance: IDL.Func([AccountBalanceArgs], [Tokens], ['query']),
//     transfer: IDL.Func([TransferArgs], [TransferResult], []),
//   });
// };

// 创建 Ledger Actor
// async function createLedgerActor(): Promise<LedgerService> {
//   // 检查是否已登录
//   const isAuthenticated = await authService.isAuthenticated();
//   if (!isAuthenticated) {
//     throw new Error('请先登录以使用钱包功能。钱包功能需要 Internet Identity 身份验证。');
//   }

//   let identity;
//   try {
//     identity = await authService.getIdentity();
//   } catch (error) {
//     console.error('[WalletService] 获取身份失败:', error);
//     throw new Error('无法获取用户身份。请确保已登录并刷新页面重试。');
//   }

//   const network = config.network;
//   const ledgerCanisterId = network === 'ic' ? LEDGER_CANISTER_ID_MAINNET : LEDGER_CANISTER_ID_LOCAL;
//   const host = config.host;

//   const agent = new HttpAgent({ 
//     host,
//     identity 
//   });

//   if (network !== 'ic') {
//     try {
//       await agent.fetchRootKey();
//     } catch (error) {
//       console.warn('[WalletService] 获取 root key 失败，继续尝试:', error);
//       // 本地网络可能不需要 root key，继续执行
//     }
//   }

//   // @ts-expect-error - IDL factory type mismatch, but works at runtime
//   return Actor.createActor(ledgerIdlFactory, {
//     agent,
//     canisterId: ledgerCanisterId,
//   }) as unknown as LedgerService;
// }

// CRC32 计算函数
// function crc32(data: Uint8Array): number {
//   let crc = 0xffffffff;
//   for (let i = 0; i < data.length; i++) {
//     crc ^= data[i];
//     for (let j = 0; j < 8; j++) {
//       crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
//     }
//   }
//   return (crc ^ 0xffffffff) >>> 0;
// }

// 将 Principal 转换为账户标识符（AccountIdentifier）
// 使用 @dfinity/ledger-icp 库来确保计算正确
export async function principalToAccountIdentifier(
  principal: Principal,
  subAccount?: Uint8Array
): Promise<Uint8Array> {
  try {
    // 使用 @dfinity/ledger-icp 库的 AccountIdentifier.fromPrincipal 方法
    let subAccountObj: SubAccount | undefined;
    if (subAccount) {
      subAccountObj = SubAccount.fromBytes(subAccount);
    }

    const accountId = AccountIdentifier.fromPrincipal({
      principal,
      subAccount: subAccountObj,
    });
    
    // AccountIdentifier.toUint8Array() 返回 Uint8Array
    return accountId.toUint8Array();
  } catch (error) {
    console.error('[WalletService] AccountIdentifier 计算失败:', error);
    throw new Error('无法计算账户标识符，请重试');
  }
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

// 转账 ICP（使用 @dfinity/ledger-icp 库）
export async function transferICP(
  to: Principal,
  amount: bigint,
  memo?: bigint
): Promise<bigint> {
  try {
    // 检查是否已登录
    const isAuthenticated = await authService.isAuthenticated();
    if (!isAuthenticated) {
      throw new Error('请先登录以进行转账。转账需要 Internet Identity 身份验证。');
    }

    // 获取身份
    const identity = await authService.getIdentity();
    const network = config.network;
    const host = config.host;

    // 创建 Agent
    const agent = new HttpAgent({ 
      host,
      identity 
    });

    // 如果是本地网络，获取 root key
    if (network !== 'ic') {
      try {
        await agent.fetchRootKey();
      } catch (error) {
        console.warn('[WalletService] 获取 root key 失败，继续尝试:', error);
      }
    }

    // 创建 Ledger Canister 实例
    const ledgerCanister = LedgerCanister.create({
      agent,
      canisterId: Principal.fromText(LEDGER_CANISTER_ID_MAINNET),
    });

    // 计算收款方的 AccountIdentifier
    const toAccountIdentifier = AccountIdentifier.fromPrincipal({
      principal: to,
    });

    // 执行转账
    const blockHeight = await ledgerCanister.transfer({
      to: toAccountIdentifier,
      amount: amount, // 直接使用 bigint，单位是 e8s
      fee: BigInt(10000), // 标准转账费用 0.0001 ICP，单位是 e8s
      memo: memo || BigInt(0),
      createdAt: BigInt(Date.now() * 1000000),
    });

    return blockHeight;
  } catch (error) {
    console.error('[WalletService] 转账失败:', error);
    
    // 提供更友好的错误信息
    if (error instanceof Error) {
      const errorMessage = error.message;
      
      // 身份验证相关错误
      if (errorMessage.includes('403') || errorMessage.includes('Forbidden') || 
          errorMessage.includes('authenticate') || errorMessage.includes('certificate') ||
          errorMessage.includes('请先登录')) {
        throw new Error('身份验证失败。请确保已登录，如果问题持续，请尝试退出并重新登录。');
      }
      
      // 余额不足
      if (errorMessage.includes('InsufficientFunds') || errorMessage.includes('余额不足')) {
        throw new Error('余额不足，请检查账户余额');
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
    
    throw new Error('转账失败：未知错误');
  }
}

// 直接向收款地址（AccountIdentifier Hex）转账 ICP
export async function transferICPToAccountId(
  toAccountIdHex: string,
  amount: bigint,
  memo?: bigint
): Promise<bigint> {
  try {
    const isAuthenticated = await authService.isAuthenticated();
    if (!isAuthenticated) {
      throw new Error('请先登录以进行转账。转账需要 Internet Identity 身份验证。');
    }

    const identity = await authService.getIdentity();
    const network = config.network;
    const host = config.host;

    const agent = new HttpAgent({
      host,
      identity,
    });

    if (network !== 'ic') {
      try {
        await agent.fetchRootKey();
      } catch (error) {
        console.warn('[WalletService] 获取 root key 失败，继续尝试:', error);
      }
    }

    const ledgerCanister = LedgerCanister.create({
      agent,
      canisterId: Principal.fromText(LEDGER_CANISTER_ID_MAINNET),
    });

    // 使用收款地址 Hex 构造 AccountIdentifier
    // @ts-ignore - 类型定义可能不包含 fromHex，但运行时是存在的
    const toAccountIdentifier: AccountIdentifier = AccountIdentifier.fromHex(toAccountIdHex);

    const blockHeight = await ledgerCanister.transfer({
      to: toAccountIdentifier,
      amount,
      fee: BigInt(10000),
      memo: memo || BigInt(0),
      createdAt: BigInt(Date.now() * 1000000),
    });

    return blockHeight;
  } catch (error) {
    console.error('[WalletService] 向收款地址转账失败:', error);
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

// ========== ICP 链上交易历史 ==========

export interface ParsedIcpTxRecord {
  index: bigint;
  from: string;
  to: string;
  /**
   * e8s 金额
   */
  amountE8s: bigint;
  /**
   * 转换为 ICP 的浮点值，仅用于展示
   */
  amountIcp: number;
  timestampNs: bigint;
  memo?: string;
  direction: 'send' | 'receive';
}

export interface ParsedIcpTxHistoryPage {
  items: ParsedIcpTxRecord[];
  nextCursor: bigint | null;
}

function parseDirection(direction: IcpTxRecord['direction']): 'send' | 'receive' {
  if ('send' in direction) return 'send';
  return 'receive';
}

function parseHistoryPage(raw: IcpTxHistoryPage): ParsedIcpTxHistoryPage {
  const items: ParsedIcpTxRecord[] = raw.txs.map((tx) => {
    const dir = parseDirection(tx.direction);
    const amountIcp = Number(tx.amount) / 100000000;
    const memo = tx.memo.length > 0 ? tx.memo[0] : undefined;

    return {
      index: tx.index,
      from: tx.from,
      to: tx.to,
      amountE8s: tx.amount,
      amountIcp,
      timestampNs: tx.timestamp,
      memo,
      direction: dir,
    };
  });

  const nextCursor =
    raw.nextCursor.length > 0 ? (raw.nextCursor[0] as bigint) : null;

  return {
    items,
    nextCursor,
  };
}

// 通过后端 canister 获取当前登录用户的 ICP 交易历史（链上）
// 注意：对外语义是 cursor 为 bigint | null，这里用 any 规避 TS 对默认参数的联合类型推断问题
export async function getIcpTxHistory(
  rawCursor: any,
  limit: number = 20,
): Promise<ParsedIcpTxHistoryPage> {
  // 检查是否已登录
  const isAuthenticated = await authService.isAuthenticated();
  if (!isAuthenticated) {
    throw new Error('请先登录以查看交易历史。');
  }

  if (limit <= 0) {
    limit = 20;
  }
  const safeLimit = BigInt(Math.min(limit, 100));

  try {
    const actor = await createActor();

    // 兼容老版本后端：如果还没有部署带 getIcpTxHistory 的 canister，给出友好提示
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anyActor = actor as any;
    if (typeof anyActor.getIcpTxHistory !== 'function') {
      throw new Error('当前后端版本未提供交易历史接口，请先升级/重新部署后端 canister。');
    }
    const cursor: bigint | null = rawCursor ?? null;
    const cursorOpt: [] | [bigint] =
      cursor === null ? [] : [cursor as bigint];

    const page = await anyActor.getIcpTxHistory(cursorOpt, safeLimit);
    return parseHistoryPage(page);
  } catch (error) {
    console.error('[WalletService] 获取交易历史失败:', error);

    if (error instanceof Error) {
      const msg = error.message;
      if (
        msg.includes('403') ||
        msg.includes('Forbidden') ||
        msg.includes('authenticate') ||
        msg.includes('certificate') ||
        msg.includes('请先登录')
      ) {
        throw new Error('身份验证失败。请重新登录后再试。');
      }

      if (
        msg.includes('network') ||
        msg.includes('fetch') ||
        msg.includes('canister_not_found')
      ) {
        const network = config.network;
        if (network === 'local') {
          throw new Error('无法连接到本地 ICP 网络。请确认 dfx 是否已启动。');
        }
        throw new Error('无法连接到 ICP 网络，请检查网络或稍后重试。');
      }

      throw error;
    }

    throw new Error('获取交易历史失败，请稍后重试。');
  }
}
