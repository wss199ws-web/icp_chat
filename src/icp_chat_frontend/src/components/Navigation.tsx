import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import './Navigation.css';
import { authService } from '../services/authService';
import NetworkConfig from './NetworkConfig';
import { config } from '../config';

const Navigation: React.FC = () => {
  const location = useLocation();
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [principal, setPrincipal] = useState<string | null>(null);
  const [showNetworkConfig, setShowNetworkConfig] = useState<boolean>(false);

  useEffect(() => {
    (async () => {
      try {
        const authed = await authService.isAuthenticated();
        setIsAuthenticated(authed);
        if (authed) {
          const p = await authService.getPrincipalText();
          setPrincipal(p);
        }
      } catch (e) {
        console.warn('[Navigation] 检查登录状态失败:', e);
      }
    })();
  }, []);

  const isActive = (path: string) => {
    return location.pathname === path || location.pathname.startsWith(path + '/');
  };

  return (
    <nav className="main-navigation">
      <div className="nav-container">
        <Link to="/" className="nav-logo">
          💬 ICP Chat
        </Link>
        <div className="nav-links">
          <Link
            to="/"
            className={`nav-link ${isActive('/') && location.pathname === '/' ? 'active' : ''}`}
          >
            💬 聊天
          </Link>
          <Link
            to="/news"
            className={`nav-link ${isActive('/news') ? 'active' : ''}`}
          >
            📰 新闻
          </Link>
          <Link
            to="/profile"
            className={`nav-link ${isActive('/profile') ? 'active' : ''}`}
          >
            👤 个人信息
          </Link>
          <div className="nav-auth">
            {config.network === 'ic' && (
              <button
                className="nav-network-button"
                type="button"
                onClick={() => setShowNetworkConfig(true)}
                title="网络配置"
              >
                🌐
              </button>
            )}
            {isAuthenticated ? (
              <>
                <span className="nav-principal" title={principal || undefined}>
                  {principal ? `${principal.slice(0, 5)}...${principal.slice(-3)}` : '已登录'}
                </span>
                <button
                  className="nav-auth-button"
                  type="button"
                  onClick={() => authService.logout()}
                >
                  退出
                </button>
              </>
            ) : (
              <button
                className="nav-auth-button"
                type="button"
                onClick={() => authService.login()}
              >
                登录
              </button>
            )}
          </div>
        </div>
      </div>
      {showNetworkConfig && (
        <NetworkConfig onClose={() => setShowNetworkConfig(false)} />
      )}
    </nav>
  );
};

export default Navigation;

