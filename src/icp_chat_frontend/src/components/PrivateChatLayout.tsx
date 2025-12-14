import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import PrivateChatList from './PrivateChatList';
import PrivateChat from './PrivateChat';
import { authService } from '../services/authService';
import './PrivateChatLayout.css';

const PrivateChatLayout: React.FC = () => {
  const { otherPrincipal } = useParams<{ otherPrincipal?: string }>();
  const navigate = useNavigate();
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const authed = await authService.isAuthenticated();
      setIsAuthenticated(authed);
    } catch (e) {
      console.error('[PrivateChatLayout] 检查登录状态失败:', e);
    }
  };

  const handleSessionSelect = (principal: string) => {
    navigate(`/private-chat/${encodeURIComponent(principal)}`);
  };

  if (!isAuthenticated) {
    return (
      <div className="private-chat-layout">
        <div className="private-chat-layout-empty">
          <p>请先登录以使用私聊功能</p>
          <button className="login-button" onClick={() => authService.login()}>
            登录
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="private-chat-layout">
      <div className="private-chat-layout-left">
        <PrivateChatList 
          onSessionSelect={handleSessionSelect}
          selectedPrincipal={otherPrincipal ? decodeURIComponent(otherPrincipal) : null}
        />
      </div>
      <div className="private-chat-layout-right">
        {otherPrincipal ? (
          <PrivateChat />
        ) : (
          <div className="private-chat-layout-empty-state">
            <div className="empty-state-content">
              <div className="empty-state-icon">💬</div>
              <h3>选择一个聊天</h3>
              <p>从左侧列表中选择一个私聊对象开始对话</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PrivateChatLayout;
