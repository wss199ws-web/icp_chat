import React, { useState, useEffect, useCallback, useRef } from 'react';
import { chatService, Message } from '../services/chatService';
import MessageList from './MessageList';
import MessageInput from './MessageInput';
import KeyManagement from './KeyManagement';
import MentionNotification from './MentionNotification';
import { encryptionService } from '../services/encryptionService';
import { userProfileService } from '../services/userProfileService';
import { getClientId } from '../services/clientIdentity';
import { authService } from '../services/authService';
import '../App.css';

const PAGE_SIZE = 10;
const LOCAL_STORAGE_KEY = 'icp-chat-cache-v1';

interface CachedChatState {
  messages: Message[];
  messageCount: number;
  currentPage: number;
  hasMoreMessages: boolean;
  timestamp: number;
}

const loadCachedState = (): CachedChatState | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const cached = window.localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!cached) {
      return null;
    }
    const parsed = JSON.parse(cached) as CachedChatState;
    if (!Array.isArray(parsed.messages)) {
      return null;
    }
    return parsed;
  } catch (e) {
    console.warn('读取本地聊天缓存失败:', e);
    return null;
  }
};

const saveCachedState = (state: CachedChatState) => {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('写入本地聊天缓存失败:', e);
  }
};

const Chat: React.FC = () => {
  // 首次渲染时同步读取一次本地缓存，用于初始化各个 state，保证页面一进来就有数据
  const initialCachedState: CachedChatState | null =
    typeof window !== 'undefined' ? loadCachedState() : null;

  const [messages, setMessages] = useState<Message[]>(() => initialCachedState?.messages ?? []);
  const [loading, setLoading] = useState<boolean>(() => !initialCachedState);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messageCount, setMessageCount] = useState(
    () => initialCachedState?.messageCount ?? 0,
  );
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [currentUserAvatar, setCurrentUserAvatar] = useState<string | null>(null);
  const [currentUserColor, setCurrentUserColor] = useState<string | null>(null);
  const clientIdRef = useRef<string>(getClientId());
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [encryptionAvailable, setEncryptionAvailable] = useState<boolean>(false);
  const [showKeyManagement, setShowKeyManagement] = useState<boolean>(false);
  const [currentPage, setCurrentPage] = useState(
    () => initialCachedState?.currentPage ?? 1,
  );
  const [hasMoreMessages, setHasMoreMessages] = useState(
    () => initialCachedState?.hasMoreMessages ?? false,
  );
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [mentionNotifications, setMentionNotifications] = useState<Array<{ messageId: number; author: string; text: string }>>([]);
  const [scrollToMessageId, setScrollToMessageId] = useState<number | null>(null);
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const broadcastChannelRef = useRef<BroadcastChannel | null>(null);

  // 将当前聊天状态保存到本地缓存
  useEffect(() => {
    if (!messages.length) {
      return;
    }
    saveCachedState({
      messages,
      messageCount,
      currentPage,
      hasMoreMessages,
      timestamp: Date.now(),
    });
  }, [messages, messageCount, currentPage, hasMoreMessages]);

  // 检测消息中是否@了当前用户
  const checkMentions = useCallback((newMessages: Message[]) => {
    if (!currentUser) return;

    newMessages.forEach((msg) => {
      // 检查消息文本中是否包含 @当前用户昵称
      if (msg.text && msg.text.includes(`@${currentUser}`)) {
        // 检查是否已经显示过这个通知
        setMentionNotifications((prev) => {
          const alreadyNotified = prev.some((n) => n.messageId === msg.id);
          if (!alreadyNotified && msg.author !== currentUser) {
            return [
              ...prev,
              {
                messageId: msg.id,
                author: msg.author,
                text: msg.text,
              },
            ];
          }
          return prev;
        });
      }
    });
  }, [currentUser]);

  // 加载最新一页消息
  const loadLatestMessages = useCallback(async () => {
    try {
      const pageData = await chatService.getMessagesPage(1, PAGE_SIZE);
      setMessages((prevMessages) => {
        // 检测新消息中的@
        const newMessages = pageData.messages.filter(
          (newMsg) => !prevMessages.some((oldMsg) => oldMsg.id === newMsg.id)
        );
        if (newMessages.length > 0 && currentUser) {
          // 使用 setTimeout 确保状态更新后再检测
          setTimeout(() => {
            checkMentions(newMessages);
          }, 100);
        }
        return pageData.messages;
      });
      setMessageCount(pageData.total);
      setCurrentPage(1);
      setHasMoreMessages(pageData.totalPages > 1);
    } catch (err) {
      console.error('加载消息失败:', err);
    }
  }, [currentUser, checkMentions]);

  // 加载当前用户的个人资料（用于头像等）
  useEffect(() => {
    (async () => {
      try {
        const profile = await userProfileService.getProfile();
        if (profile) {
          setCurrentUserAvatar(profile.avatar ?? null);
          setCurrentUserColor(profile.color ?? null);
          if (profile.nickname) {
            setCurrentUser(profile.nickname);
          }
        }
      } catch (err) {
        console.warn('[Chat] 加载用户资料失败（不影响聊天功能）:', err);
      }
    })();
    // 仅在首次挂载时尝试加载一次资料
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 加载更多历史消息
  const loadOlderMessages = useCallback(async () => {
    if (isLoadingMore || !hasMoreMessages) {
      return;
    }
    try {
      setIsLoadingMore(true);
      const nextPage = currentPage + 1;
      const pageData = await chatService.getMessagesPage(nextPage, PAGE_SIZE);
      if (pageData.messages.length > 0) {
        setMessages((prev) => [...pageData.messages, ...prev]);
        setCurrentPage(nextPage);
        setHasMoreMessages(nextPage < pageData.totalPages);
      } else {
        setHasMoreMessages(false);
      }
    } catch (err) {
      console.error('加载历史消息失败:', err);
    } finally {
      setIsLoadingMore(false);
    }
  }, [currentPage, hasMoreMessages, isLoadingMore]);

  // 初始化服务（只在组件首次挂载时执行）
  useEffect(() => {
    const init = async () => {
      try {
        // 根据 II 登录状态决定是否使用带身份的 actor
        const authed = await authService.isAuthenticated();
        await chatService.initialize(authed);
        // 如果已经从缓存渲染过一版，这里作为一次静默同步；否则仍然是首屏加载
        await loadLatestMessages();
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : '未知错误';
        let userMessage = '初始化失败，请检查网络连接';
        
        if (errorMessage.includes('Canister ID')) {
          userMessage = 'Canister ID 未配置。请先运行: dfx deploy';
        } else if (errorMessage.includes('fetchRootKey') || errorMessage.includes('network')) {
          const network = (window as any).__ICP_ENV__?.DFX_NETWORK || 'local';
          if (network === 'ic') {
            userMessage = '无法连接到 ICP 主网。如果在中国大陆，可能需要使用 VPN 或切换 API 端点。请点击导航栏的 🌐 图标配置网络。';
          } else {
            userMessage = '无法连接到 ICP 网络。请确保已启动本地网络: dfx start --background';
          }
        } else if (errorMessage.includes('无法连接到 ICP 网络')) {
          // 这是从 icpAgent 抛出的错误，已经包含了详细提示
          userMessage = errorMessage;
        }
        
        setError(userMessage);
        console.error('初始化失败:', err);
      } finally {
        // 仅当仍处于加载状态时才更新 loading，避免覆盖缓存恢复时的状态
        setLoading((prev) => (prev ? false : prev));
      }
    };

    init();

    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
        refreshIntervalRef.current = null;
      }
    };
  }, [loadLatestMessages]);

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

  // 多窗口/多标签页之间的消息同步（使用 BroadcastChannel）
  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    // 有些环境（老浏览器）不支持 BroadcastChannel
    const BC: typeof BroadcastChannel | undefined = (window as any).BroadcastChannel;
    if (!BC) {
      return;
    }

    const channel = new BC('icp-chat-message-sync');
    broadcastChannelRef.current = channel;

    channel.onmessage = async (event: MessageEvent) => {
      const data = event.data;
      if (data && data.type === 'NEW_MESSAGE') {
        // 收到其他窗口的新消息通知时，强制刷新最新一页消息
        loadLatestMessages();
      } else if (data && data.type === 'PROFILE_UPDATED') {
        // 收到 Profile 更新通知时，重新加载当前用户的 Profile
        try {
          const profile = await userProfileService.getProfile();
          if (profile) {
            setCurrentUserAvatar(profile.avatar ?? null);
            setCurrentUserColor(profile.color ?? null);
            if (profile.nickname) {
              setCurrentUser(profile.nickname);
            }
          }
        } catch (err) {
          console.warn('[Chat] 刷新用户资料失败:', err);
        }
      }
    };

    return () => {
      channel.close();
      broadcastChannelRef.current = null;
    };
  }, [loadLatestMessages]);

  // 自动刷新逻辑（仅在查看最新消息时触发）
  useEffect(() => {
    if (refreshIntervalRef.current) {
      clearInterval(refreshIntervalRef.current);
      refreshIntervalRef.current = null;
    }

    if (autoRefresh && !loading && currentPage === 1) {
      // 为了多设备之间尽量“准实时”同步，这里使用较短的轮询间隔
      refreshIntervalRef.current = setInterval(() => {
        loadLatestMessages();
      }, 3000);
    }

    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
        refreshIntervalRef.current = null;
      }
    };
  }, [autoRefresh, currentPage, loadLatestMessages, loading]);

  // 窗口获得焦点 / 页面从后台切回前台时，主动拉一次最新消息（兼容不同设备之间的同步）
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        loadLatestMessages();
      }
    };

    const handleFocus = () => {
      loadLatestMessages();
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [loadLatestMessages]);

  // 发送消息
  const handleSendMessage = async (text: string, imageId?: number | null) => {
    setSending(true);
    setError(null);

    try {
      const result = await chatService.sendMessage(text, imageId);
      if (result.success && result.message) {
        setMessages((prev) => [...prev, result.message!]);
        setMessageCount((prev) => prev + 1);
        const author = result.message.author;
        if (!currentUser && author && author !== '游客' && author !== '匿名') {
          setCurrentUser(author);
        }

        // 检测新发送的消息是否@了其他用户（虽然是自己发的，但可以用于测试）
        // 注意：自己@自己不会显示通知

        // 当前窗口发送成功后，通知其他窗口刷新
        if (broadcastChannelRef.current) {
          broadcastChannelRef.current.postMessage({ type: 'NEW_MESSAGE' });
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

  // 如果没有缓存且正在首屏加载数据，用 loading 覆盖主界面，避免看到空白/空状态闪烁
  if (loading && messages.length === 0) {
    return (
      <div className="app-loading">
        <div className="loading-spinner"></div>
        <p>正在加载历史消息...</p>
      </div>
    );
  }

  return (
    <div className="app">
      <div className="chat-container">
        <div className="chat-header">
          <div className="header-left">
            <h3>💬 美国要完蛋了-web3新时代</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
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
              <span className="message-count">共 {messageCount} 条消息</span>
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
            <button className="refresh-button" onClick={() => loadLatestMessages()} title="手动刷新消息（回到最新）">
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

        <MessageList
          messages={messages}
          currentUser={currentUser}
          onLoadMore={loadOlderMessages}
          hasMore={hasMoreMessages}
          isLoadingMore={isLoadingMore}
          ownAvatar={currentUserAvatar}
          ownColor={currentUserColor}
          clientId={clientIdRef.current}
          scrollToMessageId={scrollToMessageId}
        />

        <MessageInput 
          onSend={handleSendMessage} 
          disabled={sending}
          users={(() => {
            // 从消息中提取用户列表（去重）
            const userMap = new Map<string, { nickname: string; senderId: string; avatar?: string | null; color?: string | null }>();
            messages.forEach((msg) => {
              if (msg.author && msg.author !== '游客' && msg.author !== '匿名' && msg.senderId) {
                if (!userMap.has(msg.senderId)) {
                  userMap.set(msg.senderId, {
                    nickname: msg.author,
                    senderId: msg.senderId,
                    avatar: msg.authorAvatar || null,
                    color: msg.authorColor || null,
                  });
                }
              }
            });
            return Array.from(userMap.values());
          })()}
        />
      </div>
      
      {/* @ 通知 */}
      {mentionNotifications.map((notification, index) => (
        <MentionNotification
          key={`${notification.messageId}-${index}`}
          messageId={notification.messageId}
          author={notification.author}
          text={notification.text}
          onJumpToMessage={(messageId) => {
            setScrollToMessageId(messageId);
            // 清除该通知
            setMentionNotifications((prev) =>
              prev.filter((n) => n.messageId !== messageId)
            );
          }}
          onDismiss={() => {
            setMentionNotifications((prev) =>
              prev.filter((n) => n.messageId !== notification.messageId)
            );
          }}
        />
      ))}
      
      {showKeyManagement && (
        <KeyManagement onClose={() => setShowKeyManagement(false)} />
      )}
    </div>
  );
};

export default Chat;

