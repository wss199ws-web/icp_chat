import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { privateChatService, PrivateMessage } from '../services/privateChatService';
import MessageList from './MessageList';
import MessageInput from './MessageInput';
import { authService } from '../services/authService';
import './PrivateChat.css';

const PAGE_SIZE = 20;
const REFRESH_INTERVAL = 5000; // 5秒刷新一次

const PrivateChat: React.FC = () => {
  const { otherPrincipal } = useParams<{ otherPrincipal: string }>();
  const decodedOtherPrincipal = otherPrincipal ? decodeURIComponent(otherPrincipal) : null;

  const [messages, setMessages] = useState<PrivateMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [otherUserInfo, setOtherUserInfo] = useState<{
    nickname: string | null;
    avatar: string | null;
    principal: string;
  } | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [replyingTo, setReplyingTo] = useState<{ messageId: number; author: string; text: string } | null>(null);
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 检查登录状态
  useEffect(() => {
    checkAuth();
  }, []);

  // 加载对方用户信息
  useEffect(() => {
    if (decodedOtherPrincipal && isAuthenticated) {
      loadOtherUserInfo();
    }
  }, [decodedOtherPrincipal, isAuthenticated]);

  // 加载消息
  useEffect(() => {
    if (decodedOtherPrincipal && isAuthenticated) {
      loadMessages();
      // 设置自动刷新
      refreshIntervalRef.current = setInterval(() => {
        loadNewMessages();
      }, REFRESH_INTERVAL);
      return () => {
        if (refreshIntervalRef.current) {
          clearInterval(refreshIntervalRef.current);
        }
      };
    }
  }, [decodedOtherPrincipal, isAuthenticated]);

  const checkAuth = async () => {
    try {
      const authed = await authService.isAuthenticated();
      setIsAuthenticated(authed);
      if (!authed) {
        setError('请先登录以使用私聊功能');
        // 可以在这里跳转到登录页或显示登录按钮
      }
    } catch (e) {
      console.error('[PrivateChat] 检查登录状态失败:', e);
      setError('检查登录状态失败');
    }
  };

  const loadOtherUserInfo = async () => {
    if (!decodedOtherPrincipal) return;
    try {
      // 尝试从用户资料服务获取对方信息
      // 注意：这里需要后端支持根据Principal获取用户资料
      // 暂时使用Principal作为显示名称
      setOtherUserInfo({
        nickname: null,
        avatar: null,
        principal: decodedOtherPrincipal,
      });
    } catch (e) {
      console.error('[PrivateChat] 加载对方信息失败:', e);
    }
  };

  const loadMessages = async () => {
    if (!decodedOtherPrincipal) return;
    try {
      setLoading(true);
      setError(null);
      const messageList = await privateChatService.getLastPrivateMessages(
        decodedOtherPrincipal,
        PAGE_SIZE
      );
      setMessages(messageList);
      setCurrentPage(1);
      setHasMoreMessages(messageList.length >= PAGE_SIZE);
    } catch (e) {
      console.error('[PrivateChat] 加载消息失败:', e);
      setError('加载消息失败');
    } finally {
      setLoading(false);
    }
  };

  const loadNewMessages = async () => {
    if (!decodedOtherPrincipal || sending) return;
    try {
      const messageList = await privateChatService.getLastPrivateMessages(
        decodedOtherPrincipal,
        PAGE_SIZE
      );
      // 只更新新消息，避免重复
      if (messageList.length > 0) {
        const lastMessageId = messages.length > 0 ? messages[messages.length - 1].id : 0;
        const newMessages = messageList.filter(msg => msg.id > lastMessageId);
        if (newMessages.length > 0) {
          setMessages(prev => [...prev, ...newMessages]);
        }
      }
    } catch (e) {
      console.error('[PrivateChat] 刷新消息失败:', e);
    }
  };

  const loadMoreMessages = async () => {
    if (!decodedOtherPrincipal || isLoadingMore || !hasMoreMessages) return;
    try {
      setIsLoadingMore(true);
      const result = await privateChatService.getPrivateMessagesPage(
        decodedOtherPrincipal,
        currentPage + 1,
        PAGE_SIZE
      );
      if (result.messages.length > 0) {
        setMessages(prev => [...result.messages, ...prev]);
        setCurrentPage(result.page);
        setHasMoreMessages(result.page < result.totalPages);
      } else {
        setHasMoreMessages(false);
      }
    } catch (e) {
      console.error('[PrivateChat] 加载更多消息失败:', e);
    } finally {
      setIsLoadingMore(false);
    }
  };

  const handleSendMessage = async (text: string, imageId?: number | null) => {
    if (!decodedOtherPrincipal || sending) return;
    setSending(true);
    setError(null);

    try {
      const replyToId = replyingTo?.messageId || null;
      const result = await privateChatService.sendPrivateMessage(
        decodedOtherPrincipal,
        text,
        imageId,
        replyToId
      );
      if (result.success && result.message) {
        setMessages(prev => [...prev, result.message!]);
        setReplyingTo(null);
        // 滚动到底部
        setTimeout(() => {
          const messageList = document.querySelector('.message-list');
          if (messageList) {
            messageList.scrollTop = messageList.scrollHeight;
          }
        }, 100);
      } else {
        setError(result.error || '发送失败');
      }
    } catch (e) {
      console.error('[PrivateChat] 发送消息失败:', e);
      setError('发送消息失败');
    } finally {
      setSending(false);
    }
  };

  const handleReply = (messageId: number, author: string, text: string) => {
    setReplyingTo({ messageId, author, text });
    // 聚焦输入框
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  };

  const handleCancelReply = () => {
    setReplyingTo(null);
  };

  // 转换PrivateMessage为Message格式（用于MessageList组件）
  const convertToMessage = (msg: PrivateMessage) => {
    return {
      id: msg.id,
      author: msg.author,
      senderId: msg.senderId,
      senderPrincipal: msg.senderPrincipal,
      authorAvatar: msg.authorAvatar,
      authorColor: msg.authorColor,
      text: msg.text,
      timestamp: msg.timestamp,
      imageId: msg.imageId,
      replyTo: msg.replyTo,
    };
  };

  if (!isAuthenticated) {
    return (
      <div className="private-chat-container">
        <div className="private-chat-empty">
          <p>请先登录以使用私聊功能</p>
          <button className="login-button" onClick={() => authService.login()}>
            登录
          </button>
        </div>
      </div>
    );
  }

  if (!decodedOtherPrincipal) {
    return (
      <div className="private-chat-container">
        <div className="private-chat-empty">
          <p>无效的会话</p>
        </div>
      </div>
    );
  }

  return (
    <div className="private-chat-container">
      <div className="private-chat-header">
        <div className="header-user-info">
          {otherUserInfo?.avatar ? (
            <img src={otherUserInfo.avatar} alt={otherUserInfo.nickname || '用户'} className="header-avatar" />
          ) : (
            <div className="header-avatar-placeholder">
              {otherUserInfo?.nickname
                ? otherUserInfo.nickname.charAt(0).toUpperCase()
                : decodedOtherPrincipal.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div className="header-user-details">
            <div className="header-name-row">
              <span className="header-name">
                {otherUserInfo?.nickname || decodedOtherPrincipal.slice(0, 10) + '...'}
              </span>
              <span className="header-username">
                @{decodedOtherPrincipal.length > 10 
                  ? decodedOtherPrincipal.slice(0, 8) + '...' 
                  : decodedOtherPrincipal}
              </span>
            </div>
            <div className="header-status">
              {otherUserInfo?.nickname ? `Last online 17 mins ago` : ''}
            </div>
          </div>
        </div>
        <div className="header-actions">
          <button className="header-action-button" title="搜索聊天记录">
            🔍
          </button>
          <button className="header-action-button" title="文件">
            📄
          </button>
          <button className="header-action-button" title="更多选项">
            ⋮
          </button>
        </div>
      </div>

      {error && (
        <div className="error-message">
          {error}
        </div>
      )}

      {loading ? (
        <div className="loading">加载中...</div>
      ) : (
        <>
          <MessageList
            messages={messages.map(convertToMessage)}
            onLoadMore={hasMoreMessages ? loadMoreMessages : undefined}
            isLoadingMore={isLoadingMore}
            onReply={handleReply}
            currentUser={null}
          />
          <MessageInput
            onSend={handleSendMessage}
            disabled={sending}
            placeholder="Enter a message..."
            replyingTo={replyingTo}
            onCancelReply={handleCancelReply}
            textareaRef={textareaRef}
          />
        </>
      )}
    </div>
  );
};

export default PrivateChat;

