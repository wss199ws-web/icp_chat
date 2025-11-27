import React, { useState } from 'react';
import './ChatMessage.css';

export interface ChatMessageProps {
  id: number;
  author: string;
  text: string;
  timestamp: bigint;
  isOwn?: boolean;
}

// 解析消息内容，提取文本和图片
interface ParsedContent {
  parts: Array<{ type: 'text' | 'image'; content: string }>;
}

const parseMessage = (text: string): ParsedContent => {
  const parts: Array<{ type: 'text' | 'image'; content: string }> = [];
  const imagePattern = /\[图片\](data:image\/[^;]+;base64,[^\s]+)/g;
  let lastIndex = 0;
  let match;

  while ((match = imagePattern.exec(text)) !== null) {
    // 添加图片前的文本
    if (match.index > lastIndex) {
      const textPart = text.substring(lastIndex, match.index);
      if (textPart.trim()) {
        parts.push({ type: 'text', content: textPart });
      }
    }
    // 添加图片
    parts.push({ type: 'image', content: match[1] });
    lastIndex = imagePattern.lastIndex;
  }

  // 添加剩余的文本
  if (lastIndex < text.length) {
    const remainingText = text.substring(lastIndex);
    if (remainingText.trim()) {
      parts.push({ type: 'text', content: remainingText });
    }
  }

  // 如果没有匹配到图片，整个消息都是文本
  if (parts.length === 0) {
    parts.push({ type: 'text', content: text });
  }

  return { parts };
};

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
  const [expandedImage, setExpandedImage] = useState<string | null>(null);

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
  const parsedContent = parseMessage(text);

  return (
    <>
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
          <div className="message-content">
            {parsedContent.parts.map((part, index) => {
              if (part.type === 'image') {
                return (
                  <div key={index} className="message-image-container">
                    <img
                      src={part.content}
                      alt="消息图片"
                      className="message-image"
                      onClick={() => setExpandedImage(part.content)}
                      loading="lazy"
                    />
                    <div className="image-hint">点击查看大图</div>
                  </div>
                );
              } else {
                return (
                  <span key={index} className="message-text">
                    {part.content}
                  </span>
                );
              }
            })}
          </div>
        </div>
      </div>
      {expandedImage && (
        <div className="image-modal" onClick={() => setExpandedImage(null)}>
          <div className="image-modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="image-modal-close" onClick={() => setExpandedImage(null)}>
              ×
            </button>
            <img src={expandedImage} alt="大图预览" className="image-modal-image" />
          </div>
        </div>
      )}
    </>
  );
};

export default ChatMessage;

