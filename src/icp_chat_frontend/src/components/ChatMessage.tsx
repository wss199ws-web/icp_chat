import React, { useState, useEffect, useCallback } from 'react';
import './ChatMessage.css';
import { chatService } from '../services/chatService';

export interface ChatMessageProps {
  id: number;
  author: string;
  text: string;
  timestamp: bigint;
  imageId?: number | null;
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

const ChatMessage: React.FC<ChatMessageProps> = ({ author, text, timestamp, imageId, isOwn = false }) => {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageLoading, setImageLoading] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [base64Images, setBase64Images] = useState<string[]>([]);
  const [displayText, setDisplayText] = useState<string>('');

  const loadImage = useCallback(async () => {
    if (imageId === undefined || imageId === null) {
      console.log('ChatMessage: imageId 为空，跳过加载');
      return;
    }
    
    console.log(`ChatMessage: 开始加载图片 ID ${imageId}`);
    setImageLoading(true);
    setImageError(null);
    try {
      const blob = await chatService.getImage(imageId);
      console.log(`ChatMessage: 获取到图片 blob, 大小: ${blob?.size || 0} bytes`);
      if (blob && blob.size > 0) {
        const url = URL.createObjectURL(blob);
        console.log(`ChatMessage: 创建对象 URL 成功: ${url.substring(0, 50)}...`);
        setImageUrl(url);
      } else {
        setImageError('图片数据为空');
        console.warn(`图片 ID ${imageId} 的数据为空`);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : '未知错误';
      setImageError(`加载失败: ${errorMsg}`);
      console.error(`加载图片 ID ${imageId} 失败:`, error);
    } finally {
      setImageLoading(false);
    }
  }, [imageId]);

  // 检测文本中的 base64 图片数据
  useEffect(() => {
    if (!text) {
      setDisplayText('');
      setBase64Images([]);
      return;
    }

    // 匹配 data:image/xxx;base64,xxxxx 格式
    const base64ImageRegex = /data:image\/[^;]+;base64,[^"'\s]+/g;
    const matches = text.match(base64ImageRegex);
    
    if (matches && matches.length > 0) {
      // 提取 base64 图片
      setBase64Images(matches);
      // 从文本中移除 base64 数据，只保留其他文本
      const cleanedText = text.replace(base64ImageRegex, '').trim();
      setDisplayText(cleanedText);
    } else {
      setDisplayText(text);
      setBase64Images([]);
    }
  }, [text]);

  useEffect(() => {
    console.log(`ChatMessage: imageId 变化, 当前值: ${imageId}`);
    if (imageId !== undefined && imageId !== null) {
      loadImage();
    } else {
      // 重置状态
      setImageUrl(null);
      setImageError(null);
      setImageLoading(false);
    }
  }, [imageId, loadImage]);

  // 清理对象 URL
  useEffect(() => {
    return () => {
      if (imageUrl) {
        URL.revokeObjectURL(imageUrl);
      }
    };
  }, [imageUrl]);
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
        <div className="message-content">
          {displayText && <div className="message-text">{displayText}</div>}
          
          {/* 显示通过 imageId 上传的图片 */}
          {imageId !== undefined && imageId !== null && (
            <div className="message-image">
              {imageLoading ? (
                <div className="image-loading">加载中...</div>
              ) : imageError ? (
                <div className="image-error" title={imageError}>
                  ⚠️ 图片加载失败 (ID: {imageId})
                </div>
              ) : imageUrl ? (
                <img 
                  src={imageUrl} 
                  alt="消息图片" 
                  onError={() => {
                    console.error('图片渲染失败:', imageUrl);
                    setImageError('图片渲染失败');
                    setImageUrl(null);
                  }}
                  onLoad={() => {
                    console.log(`ChatMessage: 图片 ID ${imageId} 渲染成功`);
                  }}
                />
              ) : (
                <div className="image-error">图片不可用 (ID: {imageId})</div>
              )}
            </div>
          )}
          
          {/* 显示文本中的 base64 图片 */}
          {base64Images.length > 0 && base64Images.map((base64Data, index) => (
            <div key={index} className="message-image">
              <img 
                src={base64Data} 
                alt={`消息图片 ${index + 1}`}
                onError={(e) => {
                  console.error('Base64 图片渲染失败:', index);
                  e.currentTarget.style.display = 'none';
                }}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ChatMessage;

