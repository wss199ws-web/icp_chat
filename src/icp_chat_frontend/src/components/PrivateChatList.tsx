import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { privateChatService, PrivateChatSession } from '../services/privateChatService';
import { authService } from '../services/authService';
import UserSearchDialog from './UserSearchDialog';
import './PrivateChatList.css';

interface PrivateChatListProps {
  onSessionSelect?: (principal: string) => void;
  selectedPrincipal?: string | null;
  searchQuery?: string;
}

const PrivateChatList: React.FC<PrivateChatListProps> = ({ 
  onSessionSelect,
  selectedPrincipal,
  searchQuery = ''
}) => {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<PrivateChatSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [localSearchQuery, setLocalSearchQuery] = useState('');
  const [showUserSearchDialog, setShowUserSearchDialog] = useState(false);

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      loadSessions();
      // 每30秒刷新一次会话列表
      const interval = setInterval(loadSessions, 30000);
      return () => clearInterval(interval);
    }
  }, [isAuthenticated]);

  const checkAuth = async () => {
    try {
      const authed = await authService.isAuthenticated();
      setIsAuthenticated(authed);
      if (!authed) {
        setError('请先登录以使用私聊功能');
      }
    } catch (e) {
      console.error('[PrivateChatList] 检查登录状态失败:', e);
      setError('检查登录状态失败');
    }
  };

  const loadSessions = async () => {
    try {
      setLoading(true);
      setError(null);
      const sessionList = await privateChatService.getPrivateChatSessions();
      setSessions(sessionList);
    } catch (e) {
      console.error('[PrivateChatList] 加载会话列表失败:', e);
      setError('加载会话列表失败');
    } finally {
      setLoading(false);
    }
  };

  // 使用传入的 searchQuery 或本地搜索
  const activeSearchQuery = searchQuery || localSearchQuery;

  // 过滤会话列表
  const filteredSessions = useMemo(() => {
    if (!activeSearchQuery.trim()) {
      return sessions;
    }
    const query = activeSearchQuery.toLowerCase();
    return sessions.filter(session => {
      const nickname = (session.otherNickname || '').toLowerCase();
      const principal = session.otherPrincipal.toLowerCase();
      const lastMessage = session.lastMessage?.text?.toLowerCase() || '';
      return nickname.includes(query) || principal.includes(query) || lastMessage.includes(query);
    });
  }, [sessions, activeSearchQuery]);

  const handleSessionClick = (otherPrincipal: string) => {
    if (onSessionSelect) {
      onSessionSelect(otherPrincipal);
    } else {
      navigate(`/private-chat/${encodeURIComponent(otherPrincipal)}`);
    }
  };

  const handleUserSearch = (principal: string) => {
    // 关闭对话框
    setShowUserSearchDialog(false);
    // 导航到该用户的私聊页面
    if (onSessionSelect) {
      onSessionSelect(principal);
    } else {
      navigate(`/private-chat/${encodeURIComponent(principal)}`);
    }
  };

  const formatTime = (timestamp: bigint): string => {
    const date = new Date(Number(timestamp) / 1_000_000); // 纳秒转毫秒
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    // 如果是今天，显示时间
    if (days === 0) {
      const hours = date.getHours();
      const minutes = date.getMinutes();
      return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    }
    
    // 如果是昨天
    if (days === 1) {
      return '昨天';
    }

    // 其他情况显示完整日期，格式：2025/12/5
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}/${month}/${day}`;
  };

  const getLastMessagePreview = (session: PrivateChatSession): string => {
    if (!session.lastMessage) {
      return '暂无消息';
    }
    const text = session.lastMessage.text;
    // 根据设计图，消息预览应该更长一些
    if (text.length > 40) {
      return text.substring(0, 40) + '...';
    }
    return text;
  };

  if (!isAuthenticated) {
    return (
      <div className="private-chat-list-container">
        <div className="private-chat-list-header">
          <h2>💬 私聊</h2>
        </div>
        <div className="private-chat-list-empty">
          <p>{error || '请先登录以使用私聊功能'}</p>
          <button
            className="login-button"
            onClick={() => authService.login()}
          >
            登录
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="private-chat-list-container">
      <div className="private-chat-list-header">
        <div className="header-title">
          <span className="header-icon">💬</span>
          <h2>Chats</h2>
        </div>
        <button
          className="header-menu-button"
          title="更多选项"
          onClick={(e) => {
            e.stopPropagation();
            setShowUserSearchDialog(true);
          }}
        >
          ⋮
        </button>
      </div>

      <div className="private-chat-list-search">
        <input
          type="text"
          placeholder="Search..."
          value={localSearchQuery}
          onChange={(e) => setLocalSearchQuery(e.target.value)}
          className="search-input"
        />
        <span className="search-icon">🔍</span>
      </div>

      {error && (
        <div className="error-message">
          {error}
        </div>
      )}

      {loading ? (
        <div className="loading">加载中...</div>
      ) : filteredSessions.length === 0 ? (
        <div className="private-chat-list-empty">
          <p>{activeSearchQuery ? '未找到匹配的会话' : '暂无私聊会话'}</p>
          {!activeSearchQuery && <p className="hint">开始与好友私聊吧！</p>}
        </div>
      ) : (
        <div className="private-chat-list">
          {filteredSessions.map((session) => {
            const isSelected = selectedPrincipal === session.otherPrincipal;
            return (
              <div
                key={session.sessionId}
                className={`private-chat-session-item ${isSelected ? 'selected' : ''}`}
                onClick={() => handleSessionClick(session.otherPrincipal)}
              >
                <div className="session-avatar">
                  {session.otherAvatar ? (
                    <img src={session.otherAvatar} alt={session.otherNickname || '用户'} />
                  ) : (
                    <div className="avatar-placeholder">
                      {session.otherNickname
                        ? session.otherNickname.charAt(0).toUpperCase()
                        : session.otherPrincipal.slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  {session.unreadCount > 0 && (
                    <span className="unread-badge">{session.unreadCount}</span>
                  )}
                </div>
                <div className="session-info">
                  <div className="session-header">
                    <span className="session-name">
                      {session.otherNickname || session.otherPrincipal.slice(0, 10) + '...'}
                    </span>
                    <span className="session-time">
                      {session.lastMessage ? formatTime(session.lastMessageTime) : ''}
                    </span>
                  </div>
                  <div className="session-preview">
                    {getLastMessagePreview(session)}
                  </div>
                </div>
                {isSelected && (
                  <button
                    className="session-menu-button"
                    onClick={(e) => {
                      e.stopPropagation();
                      // TODO: 显示会话菜单
                    }}
                    title="更多选项"
                  >
                    ⋮
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      <UserSearchDialog
        isOpen={showUserSearchDialog}
        onClose={() => setShowUserSearchDialog(false)}
        onSearch={handleUserSearch}
      />
    </div>
  );
};

export default PrivateChatList;


