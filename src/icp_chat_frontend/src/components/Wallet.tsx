import React, { useEffect, useState } from 'react';
import { Principal } from '@dfinity/principal';
import { QRCodeSVG } from 'qrcode.react';
import './Wallet.css';
import {
  getAccountBalance,
  transferICP,
  transferICPToAccountId,
  formatICP,
  icpToE8s,
  getCurrentPrincipal,
  getCurrentAccountIdentifier,
  accountIdentifierToHex,
  formatAccountIdentifier,
  getIcpTxHistory,
  ParsedIcpTxRecord,
} from '../services/walletService';
import { authService } from '../services/authService';

type WalletRecordType = 'send' | 'receive';

interface WalletRecord {
  id: string;
  type: WalletRecordType;
  /**
   * 对方地址（转账时是收款方，收款时是付款方）
   */
  address: string;
  /**
   * 以 ICP 为单位的金额，正数
   */
  amount: number;
  /**
   * ISO 字符串时间
   */
  time: string;
}

const WALLET_RECORDS_STORAGE_KEY = 'icp_wallet_records';

const Wallet: React.FC = () => {
  const [balance, setBalance] = useState<bigint | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [principal, setPrincipal] = useState<string | null>(null);
  const [accountIdentifier, setAccountIdentifier] = useState<Uint8Array | null>(null);
  const [accountIdentifierHex, setAccountIdentifierHex] = useState<string | null>(null);

  // 转账相关状态
  const [showTransfer, setShowTransfer] = useState<boolean>(false);
  const [transferTo, setTransferTo] = useState<string>('');
  const [transferAmount, setTransferAmount] = useState<string>('');
  const [transferMemo, setTransferMemo] = useState<string>('');
  const [transferring, setTransferring] = useState<boolean>(false);
  const [transferError, setTransferError] = useState<string | null>(null);
  const [transferSuccess, setTransferSuccess] = useState<string | null>(null);

  // 收款相关状态
  const [showReceive, setShowReceive] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);

  // 本地账单 / 收款记录
  const [records, setRecords] = useState<WalletRecord[]>([]);
  const [recordFilter, setRecordFilter] = useState<'all' | WalletRecordType>('all');
  // 链上历史记录
  const [onchainRecords, setOnchainRecords] = useState<ParsedIcpTxRecord[]>([]);
  const [onchainCursor, setOnchainCursor] = useState<bigint | null>(null);
  const [onchainHasMore, setOnchainHasMore] = useState<boolean>(true);
  const [onchainLoading, setOnchainLoading] = useState<boolean>(false);
  const [onchainError, setOnchainError] = useState<string | null>(null);

  // 从 localStorage 恢复记录
  useEffect(() => {
    try {
      if (typeof window === 'undefined') return;
      const raw = window.localStorage.getItem(WALLET_RECORDS_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as WalletRecord[];
      if (Array.isArray(parsed)) {
        setRecords(
          parsed
            .filter(
              (r) =>
                r &&
                (r.type === 'send' || r.type === 'receive') &&
                typeof r.address === 'string' &&
                typeof r.amount === 'number' &&
                typeof r.time === 'string'
            )
            // 按时间倒序
            .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
            .slice(0, 100)
        );
      }
    } catch (err) {
      console.warn('[Wallet] 恢复本地账单记录失败:', err);
    }
  }, []);

  const persistRecords = (next: WalletRecord[]) => {
    try {
      if (typeof window === 'undefined') return;
      window.localStorage.setItem(WALLET_RECORDS_STORAGE_KEY, JSON.stringify(next));
    } catch (err) {
      console.warn('[Wallet] 保存本地账单记录失败:', err);
    }
  };

  const addLocalRecord = (record: WalletRecord) => {
    setRecords((prev) => {
      const next = [record, ...prev].slice(0, 100);
      persistRecords(next);
      return next;
    });
  };

  const formatRecordTime = (isoTime: string) => {
    const d = new Date(isoTime);
    if (Number.isNaN(d.getTime())) return isoTime;
    return d.toLocaleString();
  };

  const mergeLocalAndOnchain = (
    filter: 'all' | WalletRecordType,
  ): WalletRecord[] => {
    const onchainMapped: WalletRecord[] = onchainRecords.map((tx) => ({
      id: `onchain-${tx.index.toString()}`,
      type: tx.direction,
      address: tx.direction === 'send' ? tx.to : tx.from,
      amount: tx.amountIcp,
      time: new Date(Number(tx.timestampNs / BigInt(1_000_000))).toISOString(),
    }));

    const merged = [...onchainMapped, ...records];

    if (filter === 'all') return merged;
    return merged.filter((r) => r.type === filter);
  };

  const loadOnchainHistory = async (reset = false) => {
    if (onchainLoading) return;
    try {
      setOnchainLoading(true);
      setOnchainError(null);

      const cursor = reset ? null : onchainCursor;
      const page = await getIcpTxHistory(cursor ?? null, 20);

      setOnchainRecords((prev) =>
        reset ? page.items : [...prev, ...page.items],
      );
      setOnchainCursor(page.nextCursor);
      setOnchainHasMore(page.nextCursor !== null);
    } catch (err) {
      console.error('[Wallet] 获取链上交易历史失败:', err);
      setOnchainError(
        err instanceof Error ? err.message : '获取链上交易历史失败',
      );
      setOnchainHasMore(false);
    } finally {
      setOnchainLoading(false);
    }
  };

  // 检查登录状态并加载余额
  useEffect(() => {
    const checkAuthAndLoadBalance = async () => {
      try {
        const authed = await authService.isAuthenticated();
        setIsAuthenticated(authed);
        
        if (authed) {
          const p = await getCurrentPrincipal();
          if (p) {
            setPrincipal(p.toText());
            
            // 获取账户标识符（用于收款）
            const accountId = await getCurrentAccountIdentifier();
            if (accountId) {
              setAccountIdentifier(accountId);
              setAccountIdentifierHex(accountIdentifierToHex(accountId));
            }
            
            // 延迟一下再加载余额，确保身份已完全初始化
            setTimeout(() => {
              loadBalance();
            }, 500);
          } else {
            setError('无法获取用户身份。请尝试退出并重新登录。');
            setLoading(false);
          }
        } else {
          setLoading(false);
        }
      } catch (err) {
        console.error('[Wallet] 初始化失败:', err);
        const errorMessage = err instanceof Error ? err.message : '初始化失败';
        
        // 提供更友好的错误提示
        if (errorMessage.includes('身份验证') || errorMessage.includes('登录')) {
          setError('请先登录以使用钱包功能。点击"登录"按钮使用 Internet Identity 登录。');
        } else if (errorMessage.includes('网络') || errorMessage.includes('连接')) {
          setError('无法连接到 ICP 网络。请确保已运行: dfx start --background');
        } else {
          setError(errorMessage);
        }
        setLoading(false);
      }
    };

    checkAuthAndLoadBalance();
  }, []);

  // 加载余额（通过后端 canister，自动使用当前登录用户）
  const loadBalance = async () => {
    try {
      setLoading(true);
      setError(null);
      const bal = await getAccountBalance();
      setBalance(bal);
    } catch (err) {
      console.error('[Wallet] 加载余额失败:', err);
      setError(err instanceof Error ? err.message : '加载余额失败');
    } finally {
      setLoading(false);
    }
  };

  // 刷新余额
  const refreshBalance = async () => {
    try {
      await loadBalance();
    } catch (err) {
      console.error('[Wallet] 刷新余额失败:', err);
    }
  };

  // 处理转账
  const handleTransfer = async () => {
    if (!principal || !transferTo || !transferAmount) {
      setTransferError('请填写完整的转账信息');
      return;
    }
    
    const toInput = transferTo.trim();

    // 验证金额
    const amount = parseFloat(transferAmount);
    if (isNaN(amount) || amount <= 0) {
      setTransferError('请输入有效的金额（大于 0）');
      return;
    }

    // 验证余额
    if (balance !== null && icpToE8s(amount) + BigInt(10000) > balance) {
      setTransferError('余额不足（需要包含手续费 0.0001 ICP）');
      return;
    }

    try {
      setTransferring(true);
      setTransferError(null);
      setTransferSuccess(null);

      const amountE8s = icpToE8s(amount);
      const memo = transferMemo ? BigInt(transferMemo) : BigInt(0);
      let blockHeight: bigint;

      // 1. 如果包含 '-'，优先按 Principal 解析
      if (toInput.includes('-')) {
        try {
          const toPrincipal = Principal.fromText(toInput);
          blockHeight = await transferICP(toPrincipal, amountE8s, memo);
        } catch {
          setTransferError('无效的 Principal 地址');
          return;
        }
      } else {
        // 2. 尝试按收款地址（AccountIdentifier Hex，64位十六进制）解析
        const hex = toInput.toLowerCase();
        const hexRegex = /^[0-9a-f]+$/;
        if (hex.length === 64 && hexRegex.test(hex)) {
          blockHeight = await transferICPToAccountId(hex, amountE8s, memo);
        } else {
          setTransferError('无效的地址，请输入 Principal 或 64 位十六进制收款地址');
          return;
        }
      }
      
      setTransferSuccess(`转账成功！区块高度: ${blockHeight.toString()}`);

      // 记录本地账单（转账记录）
      addLocalRecord({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        type: 'send',
        address: toInput,
        amount,
        time: new Date().toISOString(),
      });
      
      // 清空表单
      setTransferTo('');
      setTransferAmount('');
      setTransferMemo('');
      
      // 刷新余额
      setTimeout(() => {
        refreshBalance();
      }, 2000);
    } catch (err) {
      console.error('[Wallet] 转账失败:', err);
      setTransferError(err instanceof Error ? err.message : '转账失败');
    } finally {
      setTransferring(false);
    }
  };

  // 复制收款地址
  const copyAccountIdentifier = async () => {
    if (!accountIdentifierHex) return;
    
    try {
      await navigator.clipboard.writeText(accountIdentifierHex);
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
      }, 2000);
    } catch (err) {
      console.error('[Wallet] 复制失败:', err);
      // 降级方案：使用文本选择
      const textArea = document.createElement('textarea');
      textArea.value = accountIdentifierHex;
      textArea.style.position = 'fixed';
      textArea.style.opacity = '0';
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
        setCopied(true);
        setTimeout(() => {
          setCopied(false);
        }, 2000);
      } catch (e) {
        console.error('[Wallet] 复制失败:', e);
      }
      document.body.removeChild(textArea);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      // 首次加载时尝试拉取一页链上历史
      loadOnchainHistory(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  if (!isAuthenticated) {
    return (
      <div className="wallet-container">
        <div className="wallet-header">
          <h1>💰 钱包</h1>
        </div>
        <div className="wallet-content">
          <div className="wallet-empty">
            <p>请先登录以使用钱包功能</p>
            <button
              className="wallet-login-button"
              onClick={() => authService.login()}
            >
              登录
            </button>
          </div>
        </div>
      </div>
    );
  }

  const filteredRecords = mergeLocalAndOnchain(recordFilter);

  return (
    <div className="wallet-container">
      <div className="wallet-header">
        <h1>💰 钱包</h1>
        <button
          className="wallet-refresh-button"
          onClick={refreshBalance}
          disabled={loading}
          title="刷新余额"
        >
          🔄
        </button>
      </div>

      <div className="wallet-content">
        {/* 账户信息 */}
        <div className="wallet-account-section">
          <div className="wallet-account-info">
            <div className="wallet-label">账户地址</div>
            <div className="wallet-principal">{principal}</div>
          </div>

          <div className="wallet-balance-section">
            <div className="wallet-label">余额</div>
            {loading ? (
              <div className="wallet-balance-loading">加载中...</div>
            ) : error ? (
              <div className="wallet-balance-error">{error}</div>
            ) : balance !== null ? (
              <div className="wallet-balance">
                <span className="wallet-balance-amount">{formatICP(balance)}</span>
                <span className="wallet-balance-unit">ICP</span>
              </div>
            ) : (
              <div className="wallet-balance-error">无法获取余额</div>
            )}
          </div>
        </div>

        {/* 收款功能 */}
        <div className="wallet-receive-section">
          <div className="wallet-section-header">
            <h2>收款</h2>
            <button
              className="wallet-toggle-button"
              onClick={() => {
                setShowReceive(!showReceive);
              }}
            >
              {showReceive ? '收起' : '展开'}
            </button>
          </div>

          {showReceive && accountIdentifier && (
            <div className="wallet-receive-content">
              <div className="wallet-qr-container">
                <QRCodeSVG
                  value={accountIdentifierHex || ''}
                  size={200}
                  level="M"
                  includeMargin={true}
                />
              </div>
              <div className="wallet-address-label">您的 ICP 收款地址</div>
              <div className="wallet-address-container">
                <div className="wallet-address-text">
                  {formatAccountIdentifier(accountIdentifier)}
                </div>
                <button
                  className="wallet-copy-button"
                  onClick={copyAccountIdentifier}
                  title="复制地址"
                >
                  {copied ? '✓ 已复制' : '📋 复制'}
                </button>
              </div>
              <div className="wallet-address-hint">
                使用此地址接收 ICP。您也可以使用 Principal 地址：{principal}
              </div>
            </div>
          )}
        </div>

        {/* 转账功能 */}
        <div className="wallet-transfer-section">
          <div className="wallet-section-header">
            <h2>转账</h2>
            <button
              className="wallet-toggle-button"
              onClick={() => {
                setShowTransfer(!showTransfer);
                setTransferError(null);
                setTransferSuccess(null);
              }}
            >
              {showTransfer ? '收起' : '展开'}
            </button>
          </div>

          {showTransfer && (
            <div className="wallet-transfer-form">
              <div className="wallet-form-group">
                <label htmlFor="transfer-to">收款地址 (Principal)</label>
                <input
                  id="transfer-to"
                  type="text"
                  value={transferTo}
                  onChange={(e) => setTransferTo(e.target.value)}
                  placeholder="例如: abcde-abcde-abcde-abcde-abcde-abcde-abcde-abcde-abcde-abcde-abc"
                  disabled={transferring}
                />
              </div>

              <div className="wallet-form-group">
                <label htmlFor="transfer-amount">转账金额 (ICP)</label>
                <input
                  id="transfer-amount"
                  type="number"
                  step="0.00000001"
                  min="0"
                  value={transferAmount}
                  onChange={(e) => setTransferAmount(e.target.value)}
                  placeholder="0.00000000"
                  disabled={transferring}
                />
                {balance !== null && (
                  <div className="wallet-form-hint">
                    可用余额: {formatICP(balance)} ICP（手续费: 0.0001 ICP）
                  </div>
                )}
              </div>

              <div className="wallet-form-group">
                <label htmlFor="transfer-memo">备注 (可选)</label>
                <input
                  id="transfer-memo"
                  type="text"
                  value={transferMemo}
                  onChange={(e) => setTransferMemo(e.target.value)}
                  placeholder="转账备注"
                  disabled={transferring}
                />
              </div>

              {transferError && (
                <div className="wallet-error-message">{transferError}</div>
              )}

              {transferSuccess && (
                <div className="wallet-success-message">{transferSuccess}</div>
              )}

              <button
                className="wallet-transfer-button"
                onClick={handleTransfer}
                disabled={transferring || !transferTo || !transferAmount}
              >
                {transferring ? '转账中...' : '确认转账'}
              </button>
            </div>
          )}
        </div>

        {/* 账单 / 收款记录（本地） */}
        <div className="wallet-records-section">
          <div className="wallet-section-header">
            <h2>账单与收款记录</h2>
            <div className="wallet-records-filters">
              <button
                type="button"
                className={`wallet-records-filter-button ${
                  recordFilter === 'all' ? 'wallet-records-filter-button-active' : ''
                }`}
                onClick={() => setRecordFilter('all')}
              >
                全部
              </button>
              <button
                type="button"
                className={`wallet-records-filter-button ${
                  recordFilter === 'receive' ? 'wallet-records-filter-button-active' : ''
                }`}
                onClick={() => setRecordFilter('receive')}
                disabled
                title="当前版本暂不支持自动识别链上收款记录"
              >
                收款
              </button>
              <button
                type="button"
                className={`wallet-records-filter-button ${
                  recordFilter === 'send' ? 'wallet-records-filter-button-active' : ''
                }`}
                onClick={() => setRecordFilter('send')}
              >
                转账
              </button>
            </div>
          </div>

          {onchainError && (
            <div className="wallet-error-message wallet-records-error">
              {onchainError}
            </div>
          )}

          <div className="wallet-records-hint">
            优先展示链上真实交易历史，并补充你在本浏览器中通过该钱包发起的本地记录，方便查看<strong>对方地址、时间和金额</strong>。
          </div>

          {filteredRecords.length === 0 ? (
            <div className="wallet-records-empty">
              暂无交易记录。完成一次转账或稍后重试加载链上记录。
            </div>
          ) : (
            <div className="wallet-records-table-wrapper">
              <table className="wallet-records-table">
                <thead>
                  <tr>
                    <th>类型</th>
                    <th>对方地址</th>
                    <th>金额 (ICP)</th>
                    <th>时间</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRecords.map((record) => (
                    <tr key={record.id}>
                      <td>
                        <span
                          className={`wallet-records-type wallet-records-type-${
                            record.type === 'send' ? 'send' : 'receive'
                          }`}
                        >
                          {record.type === 'send' ? '转账' : '收款'}
                        </span>
                      </td>
                      <td className="wallet-records-address-cell">
                        <span className="wallet-records-address-text">{record.address}</span>
                      </td>
                      <td className="wallet-records-amount-cell">
                        <span
                          className={`wallet-records-amount ${
                            record.type === 'send'
                              ? 'wallet-records-amount-send'
                              : 'wallet-records-amount-receive'
                          }`}
                        >
                          {record.type === 'send' ? '-' : '+'}
                          {record.amount.toFixed(8).replace(/\.?0+$/, '')}
                        </span>
                      </td>
                      <td className="wallet-records-time-cell">
                        {formatRecordTime(record.time)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="wallet-records-footer">
            <button
              type="button"
              className="wallet-records-load-more"
              onClick={() => loadOnchainHistory(false)}
              disabled={onchainLoading || !onchainHasMore}
            >
              {onchainLoading
                ? '加载中...'
                : onchainHasMore
                ? '加载更多链上记录'
                : '没有更多链上记录了'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Wallet;

