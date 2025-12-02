import React, { useEffect, useState } from 'react';
import { Principal } from '@dfinity/principal';
import { QRCodeSVG } from 'qrcode.react';
import './Wallet.css';
import {
  getAccountBalance,
  transferICP,
  formatICP,
  icpToE8s,
  getCurrentPrincipal,
  getCurrentAccountIdentifier,
  accountIdentifierToHex,
  formatAccountIdentifier,
} from '../services/walletService';
import { authService } from '../services/authService';

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

    // 验证 Principal 格式
    let toPrincipal: Principal;
    try {
      toPrincipal = Principal.fromText(transferTo.trim());
    } catch (err) {
      setTransferError('无效的 Principal 地址');
      return;
    }

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
      
      const blockHeight = await transferICP(toPrincipal, amountE8s, memo);
      
      setTransferSuccess(`转账成功！区块高度: ${blockHeight.toString()}`);
      
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
      </div>
    </div>
  );
};

export default Wallet;

