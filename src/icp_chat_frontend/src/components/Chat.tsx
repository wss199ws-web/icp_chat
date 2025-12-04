import React, { useState, useEffect, useCallback, useRef } from 'react';
import { chatService, Message } from '../services/chatService';
import MessageList from './MessageList';
import MessageInput from './MessageInput';
import KeyManagement from './KeyManagement';
import MentionNotification from './MentionNotification';
import ReplyNotification from './ReplyNotification';
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

// 优化：使用性能更好的缓存读取方式
const loadCachedState = (): CachedChatState | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const cached = window.localStorage.getItem(LOCAL_STORAGE_KEY);
    
    if (!cached) {
      return null;
    }
    
    // 快速解析 JSON（如果数据量大，可以考虑使用更快的解析方式）
    const parsed = JSON.parse(cached) as CachedChatState;
    
    if (!Array.isArray(parsed.messages)) {
      return null;
    }
    
    // 限制缓存消息数量，避免数据过大影响性能
    // 但保留更多消息以支持历史消息加载（增加到500条）
    const MAX_CACHED_MESSAGES = 500;
    if (parsed.messages.length > MAX_CACHED_MESSAGES) {
      // 只保留最新的消息（保留最新的，因为用户更可能查看最新消息）
      parsed.messages = parsed.messages.slice(-MAX_CACHED_MESSAGES);
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
  // 使用立即执行的函数确保缓存读取是同步的、立即的
  const initialCachedState: CachedChatState | null = (() => {
    if (typeof window === 'undefined') {
      return null;
    }
    
    const startTime = performance.now();
    const cached = loadCachedState();
    const endTime = performance.now();
    void startTime;
    void endTime;
    
    return cached;
  })();

  // 立即初始化消息状态，确保缓存消息立即显示
  const [messages, setMessages] = useState<Message[]>(() => {
    const cachedMessages = initialCachedState?.messages ?? [];
    return cachedMessages;
  });
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
  const [replyNotifications, setReplyNotifications] = useState<Array<{ messageId: number; author: string; text: string; replyToId: number }>>([]);
  const [scrollToMessageId, setScrollToMessageId] = useState<number | null>(null);
  const [replyingTo, setReplyingTo] = useState<{ messageId: number; author: string; text: string } | null>(null);
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const broadcastChannelRef = useRef<BroadcastChannel | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 验证消息是否正确加载（用于调试）
  useEffect(() => {
    if (messages.length === 0 && typeof window !== 'undefined') {
      // 如果消息为空，尝试重新读取缓存
      const cached = loadCachedState();
      if (cached && cached.messages && cached.messages.length > 0) {
        setMessages(cached.messages);
      }
    }
  }, []); // 只在组件挂载时执行一次

  // 将当前聊天状态保存到本地缓存（使用防抖，避免频繁写入）
  useEffect(() => {
    if (!messages.length) {
      return;
    }
    
    // 使用防抖，避免频繁写入 localStorage（影响性能）
    const timeoutId = setTimeout(() => {
      saveCachedState({
        messages,
        messageCount,
        currentPage,
        hasMoreMessages,
        timestamp: Date.now(),
      });
    }, 500); // 500ms 防抖
    
    return () => clearTimeout(timeoutId);
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

  // 检测回复通知
  const checkReplies = useCallback((newMessages: Message[], prevMessages: Message[]) => {
    if (!currentUser) return;

    newMessages.forEach((newMsg) => {
      // 如果新消息有回复，且回复的是当前用户的消息
      if (newMsg.replyTo) {
        const repliedMessage = prevMessages.find((msg) => msg.id === newMsg.replyTo);
        // 如果被回复的消息是当前用户发送的，且回复者不是当前用户
        if (repliedMessage && repliedMessage.senderId === clientIdRef.current && newMsg.senderId !== clientIdRef.current) {
          setReplyNotifications((prev) => {
            // 避免重复通知
            if (prev.some((n) => n.messageId === newMsg.id)) {
              return prev;
            }
            return [
              ...prev,
              {
                messageId: newMsg.id,
                author: newMsg.author,
                text: newMsg.text,
                replyToId: newMsg.replyTo!,
              },
            ];
          });
        }
      }
    });
  }, [currentUser]);

  // 合并消息：按时间戳和消息ID去重，保持时间顺序
  const mergeMessages = useCallback((existingMessages: Message[], newMessages: Message[]): Message[] => {
    // 创建现有消息的ID集合，用于快速查找
    const existingIds = new Set(existingMessages.map(msg => msg.id));
    
    // 过滤出真正的新消息（ID不存在于现有消息中）
    const trulyNewMessages = newMessages.filter(msg => !existingIds.has(msg.id));
    
    if (trulyNewMessages.length === 0) {
      return existingMessages; // 没有新消息，直接返回现有消息
    }
    
    // 合并消息并按时间戳排序
    const merged = [...existingMessages, ...trulyNewMessages];
    
    // 按时间戳排序（从小到大，即从旧到新）
    merged.sort((a, b) => {
      const timeA = Number(a.timestamp);
      const timeB = Number(b.timestamp);
      if (timeA !== timeB) {
        return timeA - timeB;
      }
      // 如果时间戳相同，按ID排序（确保顺序稳定）
      return a.id - b.id;
    });
    
    return merged;
  }, []);

  // 加载最新一页消息（静默同步，无感知）
  const loadLatestMessages = useCallback(async (silent: boolean = false) => {
    try {
      const pageData = await chatService.getMessagesPage(1, PAGE_SIZE);
      
      setMessages((prevMessages) => {
        // 使用合并逻辑，只添加新消息
        const mergedMessages = mergeMessages(prevMessages, pageData.messages);
        
        // 检测新消息中的@和回复
        const newMessages = pageData.messages.filter(
          (newMsg) => !prevMessages.some((oldMsg) => oldMsg.id === newMsg.id)
        );
        
        if (newMessages.length > 0 && currentUser) {
          // 使用 setTimeout 确保状态更新后再检测
          setTimeout(() => {
            checkMentions(newMessages);
            // 检测回复通知
            checkReplies(newMessages, prevMessages);
          }, 100);
        }
        
        return mergedMessages;
      });
      
      setMessageCount(pageData.total);
      setCurrentPage(1);
      setHasMoreMessages(pageData.totalPages > 1);
    } catch (err) {
      console.error('加载消息失败:', err);
      // 静默失败，不显示错误给用户
      if (!silent) {
        setError('同步消息失败，请稍后重试');
      }
    } finally {
      // no-op
    }
  }, [currentUser, checkMentions, checkReplies, mergeMessages]);

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

  // 从缓存中加载更早的历史消息
  const loadOlderMessagesFromCache = useCallback((currentMessages: Message[]): Message[] | null => {
    if (currentMessages.length === 0) {
      return null;
    }
    
    // 获取当前最早的消息时间戳和ID
    const earliestMessage = currentMessages[0];
    const earliestTimestamp = Number(earliestMessage.timestamp);
    const earliestId = earliestMessage.id;
    
    // 从缓存中读取所有消息
    const cached = loadCachedState();
    if (!cached || !cached.messages || cached.messages.length === 0) {
      return null;
    }
    
    // 查找比当前最早消息更早的消息（使用时间戳和ID双重判断）
    const olderMessages = cached.messages.filter(msg => {
      const msgTimestamp = Number(msg.timestamp);
      const msgId = msg.id;
      
      // 如果时间戳更早，或者时间戳相同但ID更小（更早的消息）
      if (msgTimestamp < earliestTimestamp) {
        return true;
      }
      if (msgTimestamp === earliestTimestamp && msgId < earliestId) {
        return true;
      }
      return false;
    });
    
    if (olderMessages.length === 0) {
      return null;
    }
    
    // 按时间戳和ID排序（从旧到新）
    olderMessages.sort((a, b) => {
      const timeA = Number(a.timestamp);
      const timeB = Number(b.timestamp);
      if (timeA !== timeB) {
        return timeA - timeB;
      }
      return a.id - b.id;
    });
    
    // 只返回最近的一页（PAGE_SIZE 条）
    const pageMessages = olderMessages.slice(-PAGE_SIZE);
    
    return pageMessages;
  }, []);

  // 加载更多历史消息（优先从缓存加载）
  const loadOlderMessages = useCallback(async () => {
    if (isLoadingMore || !hasMoreMessages) {
      return;
    }
    
    try {
      setIsLoadingMore(true);
      
      // 先尝试从缓存加载
      const cachedMessages = loadOlderMessagesFromCache(messages);
      
      if (cachedMessages && cachedMessages.length > 0) {
        // 从缓存加载成功
        setMessages((prev) => {
          const updated = [...cachedMessages, ...prev];
          
          // 立即保存到缓存（确保状态同步）
          saveCachedState({
            messages: updated,
            messageCount,
            currentPage,
            hasMoreMessages: true, // 暂时设为true，下面会检查
            timestamp: Date.now(),
          });
          
          // 检查缓存中是否还有更早的消息（基于更新后的消息列表）
          const earliestInUpdated = updated[0];
          const cached = loadCachedState();
          if (cached && cached.messages) {
            const hasMore = cached.messages.some(msg => {
              const msgTimestamp = Number(msg.timestamp);
              const msgId = msg.id;
              const earliestTimestamp = Number(earliestInUpdated.timestamp);
              const earliestId = earliestInUpdated.id;
              
              // 如果时间戳更早，或者时间戳相同但ID更小
              if (msgTimestamp < earliestTimestamp) {
                return true;
              }
              if (msgTimestamp === earliestTimestamp && msgId < earliestId) {
                return true;
              }
              return false;
            });
            setHasMoreMessages(hasMore);
          } else {
            setHasMoreMessages(false);
          }
          
          return updated;
        });
        
        setIsLoadingMore(false);
        return;
      }
      
      // 缓存中没有更多消息，从后端加载
      const nextPage = currentPage + 1;
      const pageData = await chatService.getMessagesPage(nextPage, PAGE_SIZE);
      
      if (pageData.messages.length > 0) {
        // 将从后端加载的消息添加到缓存
        setMessages((prev) => {
          const updated = [...pageData.messages, ...prev];
          
          // 立即保存到缓存（不等待防抖），确保历史消息被缓存
          // 使用最新的 messageCount（从 pageData 获取）
          saveCachedState({
            messages: updated,
            messageCount: pageData.total, // 使用后端返回的总数
            currentPage: nextPage,
            hasMoreMessages: nextPage < pageData.totalPages,
            timestamp: Date.now(),
          });
          const endTime = performance.now();
          void endTime;
          
          return updated;
        });
        
        setMessageCount(pageData.total); // 更新总消息数
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
  }, [currentPage, hasMoreMessages, isLoadingMore, messages, loadOlderMessagesFromCache]);

  // 初始化服务（延迟执行，不阻塞消息显示）
  useEffect(() => {
    // 使用 requestIdleCallback 或 setTimeout 延迟初始化，确保消息先显示
    const init = async () => {
      try {
        // 延迟初始化，让消息先渲染
        await new Promise(resolve => {
          if ('requestIdleCallback' in window) {
            (window as any).requestIdleCallback(resolve, { timeout: 100 });
          } else {
            setTimeout(resolve, 0);
          }
        });
        
        // 根据 II 登录状态决定是否使用带身份的 actor
        const authed = await authService.isAuthenticated();
        await chatService.initialize(authed);
        
        // 如果有缓存数据，先显示缓存，然后静默同步后端数据
        // 如果没有缓存，则从后端加载（但也不显示loading）
        const hasCache = initialCachedState && initialCachedState.messages.length > 0;
        
        if (hasCache) {
          // 有缓存：后台静默同步，用户无感知
          // 进一步延迟同步，确保UI先渲染完成
          setTimeout(() => {
            loadLatestMessages(true); // silent = true，不显示同步状态
          }, 100);
        } else {
          // 无缓存：从后端加载（但不显示loading）
          await loadLatestMessages(false);
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : '未知错误';
        let userMessage = '初始化失败，请检查网络连接';
        
        if (errorMessage.includes('Canister ID')) {
          userMessage = 'Canister ID 未配置。请先运行: dfx deploy';
        } else if (errorMessage.includes('canister_not_found') || errorMessage.includes('does not exist')) {
          // Canister 不存在错误
          userMessage = 'Canister 不存在。可能的原因：\n' +
            '1. Canister 未部署或已被删除\n' +
            '2. 使用了错误的 canister ID\n' +
            '3. 网络配置不匹配（本地/主网）\n\n' +
            '解决方案：\n' +
            '- 运行修复脚本: ./fix-canister-id.sh\n' +
            '- 或重新部署: dfx deploy --upgrade-unchanged icp_chat_backend\n' +
            '- 重新构建前端: cd src/icp_chat_frontend && npm run build';
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
        
        // 只有在没有缓存数据时才显示错误
        const hasCache = initialCachedState && initialCachedState.messages.length > 0;
        if (!hasCache) {
          setError(userMessage);
        } else {
          // 有缓存时，静默失败，不打扰用户
          console.error('[Chat] 后台同步失败（不影响已缓存的消息）:', err);
        }
      }
    };

    // 立即启动初始化（但内部会延迟执行）
    init();

    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
        refreshIntervalRef.current = null;
      }
    };
  }, [loadLatestMessages, initialCachedState]);

  // 检查加密功能可用性
  useEffect(() => {
    const cryptoAvailable = encryptionService.canUseCrypto?.() || false;
    const encryptionEnabled = encryptionService.isEncryptionEnabled();
    setEncryptionAvailable(cryptoAvailable && encryptionEnabled);
    
    const reason = encryptionService.getUnavailableReason();
    if (!cryptoAvailable && reason) {
      console.warn('[App] Web Crypto API 不可用:', reason);
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
        // 收到其他窗口的新消息通知时，静默刷新最新一页消息
        loadLatestMessages(true); // 静默同步
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

    if (autoRefresh && currentPage === 1) {
      // 为了多设备之间尽量"准实时"同步，这里使用较短的轮询间隔
      // 使用静默模式，用户无感知
      refreshIntervalRef.current = setInterval(() => {
        loadLatestMessages(true); // silent = true，后台静默同步
      }, 3000);
    }

    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
        refreshIntervalRef.current = null;
      }
    };
  }, [autoRefresh, currentPage, loadLatestMessages]);

  // 窗口获得焦点 / 页面从后台切回前台时，主动拉一次最新消息（兼容不同设备之间的同步）
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        loadLatestMessages(true); // 静默同步
      }
    };

    const handleFocus = () => {
      loadLatestMessages(true); // 静默同步
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [loadLatestMessages]);

  // 处理回复
  const handleReply = (messageId: number, author: string, text: string) => {
    setReplyingTo({ messageId, author, text });
    // 滚动到输入框并聚焦
    setTimeout(() => {
      textareaRef.current?.focus();
      textareaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 100);
  };

  // 处理表情快速回复
  const handleEmojiClick = (messageId: number, author: string, text: string, emoji: string) => {
    // 设置回复状态
    setReplyingTo({ messageId, author, text });
    // 插入表情到输入框
    if (textareaRef.current) {
      const textarea = textareaRef.current;
      // 设置值并触发 React 的 onChange 事件
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        'value'
      )?.set;
      if (nativeInputValueSetter) {
        nativeInputValueSetter.call(textarea, emoji);
      } else {
        textarea.value = emoji;
      }
      // 触发 input 事件，让 React 检测到变化
      const event = new Event('input', { bubbles: true });
      textarea.dispatchEvent(event);
      // 聚焦并滚动到输入框
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(emoji.length, emoji.length);
        textarea.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 50);
    }
  };

  // 取消回复
  const handleCancelReply = () => {
    setReplyingTo(null);
  };

  // 发送消息
  const handleSendMessage = async (text: string, imageId?: number | null) => {
    setSending(true);
    setError(null);

    try {
      const replyToId = replyingTo?.messageId || null;
      const result = await chatService.sendMessage(text, imageId, replyToId);
      if (result.success && result.message) {
        setMessages((prev) => [...prev, result.message!]);
        setMessageCount((prev) => prev + 1);
        const author = result.message.author;
        // 如果当前用户还没有设置，且返回的作者不是"游客"或"匿名"，则设置当前用户
        // 但如果是已登录用户发送的消息，即使后端返回"游客"（因为没设置 Profile），
        // 也应该尝试从用户资料服务获取最新的昵称
        if (!currentUser) {
          if (author && author !== '游客' && author !== '匿名') {
            setCurrentUser(author);
          } else {
            // 如果返回的是"游客"或"匿名"，但可能是已登录用户，尝试从用户资料服务获取
            // 这个逻辑在 useEffect 中已经处理了，这里不需要重复
          }
        }

        // 如果回复了别人的消息，添加回复通知
        if (replyingTo && replyingTo.author !== author) {
          setReplyNotifications((prev) => [
            ...prev,
            {
              messageId: result.message!.id,
              author: result.message!.author,
              text: result.message!.text,
              replyToId: replyingTo.messageId,
            },
          ]);
        }

        // 清除回复状态
        setReplyingTo(null);

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

  // 取消loading提示，始终直接显示聊天界面
  // 如果有缓存，立即显示；如果没有缓存，显示空状态（后台会静默加载）

  return (
    <div className="app">
      <div className="chat-container">
        <div className="chat-header">
          <div className="header-left">
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
            <button className="refresh-button" onClick={() => loadLatestMessages(true)} title="手动刷新消息（回到最新）">
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
          onReply={handleReply}
          onEmojiClick={handleEmojiClick}
        />

        <MessageInput 
          onSend={handleSendMessage} 
          disabled={sending}
          replyingTo={replyingTo}
          onCancelReply={handleCancelReply}
          textareaRef={textareaRef}
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
          key={`mention-${notification.messageId}-${index}`}
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
      
      {/* 回复通知 */}
      {replyNotifications.map((notification, index) => (
        <ReplyNotification
          key={`reply-${notification.messageId}-${index}`}
          messageId={notification.messageId}
          author={notification.author}
          text={notification.text}
          replyToId={notification.replyToId}
          onJumpToMessage={(messageId) => {
            setScrollToMessageId(messageId);
            // 清除该通知
            setReplyNotifications((prev) =>
              prev.filter((n) => n.messageId !== messageId)
            );
          }}
          onDismiss={() => {
            setReplyNotifications((prev) =>
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

