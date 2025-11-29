import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import './Navigation.css';

const Navigation: React.FC = () => {
  const location = useLocation();

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
        </div>
      </div>
    </nav>
  );
};

export default Navigation;

