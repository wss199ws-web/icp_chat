import React, { useState, useEffect, useCallback, useRef } from 'react';
import { chatService, Message } from './services/chatService';
import MessageList from './components/MessageList';
import MessageInput from './components/MessageInput';
import { encryptionService } from './services/encryptionService';
import './App.css';

const App: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messageCount, setMessageCount] = useState(0);
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true); // 自动刷新开关
  const [encryptionAvailable, setEncryptionAvailable] = useState<boolean>(true);
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // 加载消息
  const loadMessages = useCallback(async () => {
    try {
      const newMessages = await chatService.getLastMessages(50);
      setMessages(newMessages);
      const count = await chatService.getMessageCount();
      setMessageCount(count);
    } catch (err) {
      console.error('加载消息失败:', err);
    }
  }, []);

  // 检查加密功能可用性（仅在非本地环境显示警告）
  useEffect(() => {
    const available = encryptionService.isAvailable();
    setEncryptionAvailable(available);
    const reason = encryptionService.getUnavailableReason();
    // 只在非本地环境且不可用时显示警告
    if (!available && reason) {
      console.warn('[App] 加密功能不可用:', reason);
    } else if (!available) {
      console.log('[App] 本地开发环境，端到端加密已禁用');
    }
  }, []);

  // 初始化服务
  useEffect(() => {
    const init = async () => {
      try {
        await chatService.initialize();
        await loadMessages();
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
      // 清理定时器
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
        refreshIntervalRef.current = null;
      }
    };
  }, [loadMessages]);

  // 自动刷新逻辑
  useEffect(() => {
    // 先清理旧的定时器
    if (refreshIntervalRef.current) {
      clearInterval(refreshIntervalRef.current);
      refreshIntervalRef.current = null;
    }

    // 如果开启自动刷新，设置定时器（每10秒刷新一次，降低频率）
    if (autoRefresh && !loading) {
      refreshIntervalRef.current = setInterval(() => {
        loadMessages();
      }, 10000); // 改为每10秒刷新一次
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
        // 添加新消息到列表
        setMessages((prev) => [...prev, result.message!]);
        setMessageCount((prev) => prev + 1);
        // 如果设置了当前用户，更新它
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

  // 清空消息（已隐藏删除按钮，此函数暂时保留以备后用）
  // const handleClearMessages = async () => {
  //   if (!confirm('确定要清空所有消息吗？此操作不可恢复。')) {
  //     return;
  //   }

  //   try {
  //     const success = await chatService.clearAllMessages();
  //     if (success) {
  //       setMessages([]);
  //       setMessageCount(0);
  //       setError(null);
  //     } else {
  //       setError('清空消息失败');
  //     }
  //   } catch (err) {
  //     setError('清空消息时发生错误');
  //   }
  // };

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
            <h1>💬 ICP Chat</h1>
            <span className="message-count">共 {messageCount} 条消息</span>
            <span className="encryption-badge" title="消息采用端到端加密，只有您能解密">
              🔒 端到端加密
            </span>
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
            <button className="refresh-button" onClick={loadMessages} title="手动刷新消息">
              🔄
            </button>
            {/* 删除按钮已隐藏 */}
            {/* <button className="clear-button" onClick={handleClearMessages} title="清空消息">
              🗑️
            </button> */}
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
    </div>
  );
};

export default App;

