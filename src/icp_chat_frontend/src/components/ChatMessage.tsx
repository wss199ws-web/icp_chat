import React from 'react';
import './ChatMessage.css';

export interface ChatMessageProps {
  id: number;
  author: string;
  text: string;
  timestamp: bigint;
  isOwn?: boolean;
}

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

  return (
    <div className={`chat-message ${isOwn ? 'own' : ''}`}>
      <div className="message-header">
        <span className="message-author">{author === '匿名' ? '匿名用户' : author}</span>
        <span className="message-time" title={formatFullTime(timestamp)}>
          {formatTime(timestamp)}
        </span>
      </div>
      <div className="message-content">{text}</div>
    </div>
  );
};

export default ChatMessage;

