import React, { useState, useEffect, useCallback, useRef } from 'react';
import { chatService, Message } from '../services/chatService';
import MessageList from './MessageList';
import MessageInput from './MessageInput';
import KeyManagement from './KeyManagement';
import { encryptionService } from '../services/encryptionService';
import '../App.css';

const Chat: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messageCount, setMessageCount] = useState(0);
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [encryptionAvailable, setEncryptionAvailable] = useState<boolean>(false);
  const [showKeyManagement, setShowKeyManagement] = useState<boolean>(false);
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // 加载消息
  const loadMessages = useCallback(async (forceRefresh: boolean = false) => {
    try {
      const newMessages = await chatService.getLastMessages(50, forceRefresh);
      setMessages(newMessages);
      const count = await chatService.getMessageCount(forceRefresh);
      setMessageCount(count);
    } catch (err) {
      console.error('加载消息失败:', err);
    }
  }, []);

  // 初始化服务（只在组件首次挂载时执行）
  useEffect(() => {
    const init = async () => {
      try {
        await chatService.initialize();
        // 首次加载时强制刷新，后续使用缓存
        await loadMessages(true);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : '未知错误';
        let userMessage = '初始化失败，请检查网络连接';
        
        if (errorMessage.includes('Canister ID')) {
          userMessage = 'Canister ID 未配置。请先运行: dfx deploy';
        } else if (errorMessage.includes('fetchRootKey') || errorMessage.includes('network')) {
          userMessage = '无法连接到 ICP 网络。请确保已启动本地网络: dfx start --background';
        }
        
        setError(userMessage);
        console.error('初始化失败:', err);
      } finally {
        setLoading(false);
      }
    };

    init();

    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
        refreshIntervalRef.current = null;
      }
    };
  }, []); // 移除loadMessages依赖，只在组件挂载时执行一次

  // 检查加密功能可用性
  useEffect(() => {
    const cryptoAvailable = encryptionService.canUseCrypto?.() || false;
    const encryptionEnabled = encryptionService.isEncryptionEnabled();
    setEncryptionAvailable(cryptoAvailable && encryptionEnabled);
    
    const reason = encryptionService.getUnavailableReason();
    if (!cryptoAvailable && reason) {
      console.warn('[App] Web Crypto API 不可用:', reason);
    } else if (!encryptionEnabled) {
      console.log('[App] 端到端加密未开启（默认关闭）');
    } else {
      console.log('[App] 端到端加密已开启');
    }
  }, []);

  // 自动刷新逻辑
  useEffect(() => {
    if (refreshIntervalRef.current) {
      clearInterval(refreshIntervalRef.current);
      refreshIntervalRef.current = null;
    }

    if (autoRefresh && !loading) {
      refreshIntervalRef.current = setInterval(() => {
        // 自动刷新时使用缓存（10秒内的请求使用缓存）
        loadMessages(false);
      }, 10000);
    }

    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
        refreshIntervalRef.current = null;
      }
    };
  }, [autoRefresh, loadMessages, loading]);

  // 发送消息
  const handleSendMessage = async (text: string, imageId?: number | null) => {
    setSending(true);
    setError(null);

    try {
      const result = await chatService.sendMessage(text, imageId);
      if (result.success && result.message) {
        setMessages((prev) => [...prev, result.message!]);
        setMessageCount((prev) => prev + 1);
        if (!currentUser && result.message.author !== '匿名') {
          setCurrentUser(result.message.author);
        }
      } else {
        setError(result.error || '发送失败');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '发送消息时发生错误');
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="app-loading">
        <div className="loading-spinner"></div>
        <p>正在连接 ICP 网络...</p>
      </div>
    );
  }

  return (
    <div className="app">
      <div className="chat-container">
        <div className="chat-header">
          <div className="header-left">
            <h1>💬 美国要完蛋了-web3新时代</h1>
            <span className="message-count">共 {messageCount} 条消息</span>
            <div className="encryption-controls">
              <label className="encryption-toggle" title="开启/关闭端到端加密">
                <input
                  type="checkbox"
                  checked={encryptionAvailable && encryptionService.isEncryptionEnabled()}
                  onChange={(e) => {
                    if (e.target.checked) {
                      encryptionService.enableEncryption();
                      setEncryptionAvailable(encryptionService.isAvailable());
                    } else {
                      encryptionService.disableEncryption();
                      setEncryptionAvailable(false);
                    }
                  }}
                  disabled={!encryptionService.canUseCrypto?.()}
                />
                <span className="encryption-label">
                  {encryptionAvailable && encryptionService.isEncryptionEnabled() ? '🔒 端到端加密' : '🔓 未加密'}
                </span>
              </label>
              {encryptionAvailable && encryptionService.isEncryptionEnabled() && (
                <button
                  className="key-management-btn"
                  onClick={() => setShowKeyManagement(true)}
                  title="密钥管理"
                >
                  🔑 密钥管理
                </button>
              )}
            </div>
          </div>
          <div className="header-right">
            <label className="auto-refresh-toggle" title="自动刷新">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
              />
              <span>自动刷新</span>
            </label>
            <button className="refresh-button" onClick={() => loadMessages(true)} title="手动刷新消息（强制刷新）">
              🔄
            </button>
          </div>
        </div>

        {!encryptionAvailable && encryptionService.getUnavailableReason() && (
          <div className="warning-message">
            <span>⚠️ {encryptionService.getUnavailableReason()}</span>
          </div>
        )}

        {error && (
          <div className="error-message">
            <span>⚠️ {error}</span>
            <button onClick={() => setError(null)}>×</button>
          </div>
        )}

        <MessageList messages={messages} currentUser={currentUser || undefined} />

        <MessageInput onSend={handleSendMessage} disabled={sending} />
      </div>
      {showKeyManagement && (
        <KeyManagement onClose={() => setShowKeyManagement(false)} />
      )}
    </div>
  );
};

export default Chat;

