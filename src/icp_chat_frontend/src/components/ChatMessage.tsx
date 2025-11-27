import React from 'react';
import './ChatMessage.css';

export interface ChatMessageProps {
  id: number;
  author: string;
  text: string;
  timestamp: bigint;
  isOwn?: boolean;
}

// 根据用户名生成头像颜色
const getAvatarColor = (name: string): string => {
  const colors = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8',
    '#F7DC6F', '#BB8FCE', '#85C1E2', '#F8B739', '#52BE80',
    '#EC7063', '#5DADE2', '#58D68D', '#F4D03F', '#AF7AC5',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
};

// 获取头像文字（首字母或前两个字符）
const getAvatarText = (name: string): string => {
  if (name === '匿名' || !name) {
    return '匿';
  }
  // 如果是中文，取第一个字符；如果是英文，取首字母大写
  const firstChar = name.charAt(0);
  if (/[\u4e00-\u9fa5]/.test(firstChar)) {
    return firstChar;
  }
  return firstChar.toUpperCase();
};

const ChatMessage: React.FC<ChatMessageProps> = ({ author, text, timestamp, isOwn = false }) => {
  const formatTime = (timestamp: bigint): string => {
    const date = new Date(Number(timestamp) / 1_000_000); // 转换为毫秒
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days}天前`;
    } else if (hours > 0) {
      return `${hours}小时前`;
    } else if (minutes > 0) {
      return `${minutes}分钟前`;
    } else {
      return '刚刚';
    }
  };

  const formatFullTime = (timestamp: bigint): string => {
    const date = new Date(Number(timestamp) / 1_000_000);
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const avatarColor = getAvatarColor(author);
  const avatarText = getAvatarText(author);

  return (
    <div className={`chat-message ${isOwn ? 'own' : ''}`}>
      <div className="message-avatar" style={{ backgroundColor: avatarColor }}>
        {avatarText}
      </div>
      <div className="message-body">
        <div className="message-header">
          <span className="message-author">{author === '匿名' ? '匿名用户' : author}</span>
          <span className="message-time" title={formatFullTime(timestamp)}>
            {formatTime(timestamp)}
          </span>
        </div>
        <div className="message-content">{text}</div>
      </div>
    </div>
  );
};

export default ChatMessage;

