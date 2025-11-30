import React, { useState, useEffect, useCallback, useRef } from 'react';
import './ChatMessage.css';
import { chatService } from '../services/chatService';
import { encryptionService } from '../services/encryptionService';
import MessageTooltip from './MessageTooltip';
import MessageActionMenu from './MessageActionMenu';
import ImagePreview from './ImagePreview';

export interface ChatMessageProps {
  id: number;
  author: string;
  senderId: string;
  authorAvatar?: string | null;
  authorColor?: string | null;
  text: string;
  timestamp: bigint;
  imageId?: number | null;
  isOwn?: boolean;
  avatarUrl?: string | null;
  nicknameColor?: string | null;
  replyTo?: number | null; // 回复的消息ID
  replyToAuthor?: string | null; // 回复的消息作者
  replyToText?: string | null; // 回复的消息内容
  onReply?: (messageId: number, author: string, text: string) => void; // 回复回调
  onEmojiClick?: (messageId: number, author: string, text: string, emoji: string) => void; // 表情快速回复回调
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
  if (name === '游客' || name === '匿名' || !name) {
    return '游';
  }
  // 如果是中文，取第一个字符；如果是英文，取首字母大写
  const firstChar = name.charAt(0);
  if (/[\u4e00-\u9fa5]/.test(firstChar)) {
    return firstChar;
  }
  return firstChar.toUpperCase();
};

const ChatMessage = React.forwardRef<HTMLDivElement, ChatMessageProps>(({
  id,
  author,
  authorAvatar,
  authorColor,
  text,
  timestamp,
  imageId,
  isOwn = false,
  avatarUrl,
  nicknameColor,
  replyTo,
  replyToAuthor,
  replyToText,
  onReply,
  onEmojiClick,
}, ref) => {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageLoading, setImageLoading] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [base64Images, setBase64Images] = useState<string[]>([]);
  const [displayText, setDisplayText] = useState<string>('');
  const [decryptError, setDecryptError] = useState<boolean>(false);
  const [avatarError, setAvatarError] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState<{ x: number; y: number; messageRect?: DOMRect }>({ x: 0, y: 0 });
  const [showMoreButton, setShowMoreButton] = useState(false);
  const [showActionMenu, setShowActionMenu] = useState(false);
  const [actionMenuPosition, setActionMenuPosition] = useState({ x: 0, y: 0 });
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const hideMenuTimerRef = useRef<NodeJS.Timeout | null>(null);
  const messageRef = useRef<HTMLDivElement | null>(null);
  const touchStartPosRef = useRef<{ x: number; y: number } | null>(null);
  const SCROLL_THRESHOLD = 10; // 移动超过10px认为是滚动
  
  // 合并 refs
  const setRefs = useCallback((node: HTMLDivElement | null) => {
    // 设置外部 ref
    if (typeof ref === 'function') {
      ref(node);
    } else if (ref) {
      // 使用类型断言处理 ref
      const mutableRef = ref as React.MutableRefObject<HTMLDivElement | null>;
      if (mutableRef) {
        mutableRef.current = node;
      }
    }
    // 设置内部 ref
    messageRef.current = node;
  }, [ref]);

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

  // 检测文本中的 base64 图片数据和加密状态
  useEffect(() => {
    if (!text) {
      setDisplayText('');
      setBase64Images([]);
      setDecryptError(false);
      return;
    }

    // 检查是否是加密消息但解密失败（仍保留 encrypted: 前缀）
    const isEncryptedButFailed = encryptionService.isEncrypted(text);
    setDecryptError(isEncryptedButFailed);

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

  // 优先使用消息里带的头像和颜色（发送时的快照），如果没有则用本地传入的
  // 确保只有当头像是一个有效的非空字符串时才使用，否则显示文字头像
  const displayAvatar = (authorAvatar && authorAvatar.trim()) || (avatarUrl && avatarUrl.trim()) || null;
  const displayColor = authorColor || nicknameColor;

  // 当头像URL变化时，重置错误状态
  useEffect(() => {
    setAvatarError(false);
  }, [displayAvatar]);

  // 处理鼠标悬停显示操作菜单（在 message-body 上）
  const handleMouseEnter = () => {
    // 清除可能存在的隐藏定时器
    if (hideMenuTimerRef.current) {
      clearTimeout(hideMenuTimerRef.current);
      hideMenuTimerRef.current = null;
    }
    if (messageRef.current) {
      const rect = messageRef.current.getBoundingClientRect();
      // 菜单显示在消息上方，居中对齐，更靠近消息框
      setActionMenuPosition({
        x: rect.left + rect.width / 2, // 消息中心
        y: rect.top - 35, // 消息上方，更近（留出一点空间让鼠标移入）
      });
      setShowActionMenu(true);
    }
  };

  const handleMouseLeave = (e: React.MouseEvent<HTMLDivElement>) => {
    // 检查鼠标是否移到了操作菜单上
    const relatedTarget = e.relatedTarget as HTMLElement;
    if (relatedTarget) {
      if (relatedTarget.closest('.message-action-menu') || 
          relatedTarget.closest('.message-tooltip') || 
          relatedTarget.closest('.message-more-button')) {
        // 清除可能存在的隐藏定时器
        if (hideMenuTimerRef.current) {
          clearTimeout(hideMenuTimerRef.current);
          hideMenuTimerRef.current = null;
        }
        return; // 如果移到了菜单、tooltip 或按钮上，不隐藏
      }
    }
    // 延迟隐藏，给鼠标时间移入菜单
    hideMenuTimerRef.current = setTimeout(() => {
      // 再次检查鼠标是否在菜单上
      const menuElement = document.querySelector('.message-action-menu');
      if (menuElement && menuElement.matches(':hover')) {
        return; // 鼠标在菜单上，不隐藏
      }
      // 如果 tooltip 没有显示，则隐藏操作菜单
      if (!showTooltip) {
        setShowActionMenu(false);
      }
      hideMenuTimerRef.current = null;
    }, 150);
  };

  // 处理操作菜单中的回复按钮 - 直接显示回复框，不显示面板
  const handleActionMenuReply = () => {
    if (onReply) {
      // 直接调用回复回调，不显示 tooltip
      onReply(id, author, text);
      setShowActionMenu(false);
    }
  };

  // 处理表情按钮点击
  const handleEmojiClick = (emoji: string) => {
    if (onEmojiClick) {
      onEmojiClick(id, author, text, emoji);
      setShowActionMenu(false);
    }
  };

  // 处理点击三个点按钮
  const handleMoreButtonClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (onReply && messageRef.current) {
      const rect = messageRef.current.getBoundingClientRect();
      const buttonRect = e.currentTarget.getBoundingClientRect();
      // 将 tooltip 显示在按钮左边
      setTooltipPosition({
        x: buttonRect.left - 220, // 按钮左侧 - tooltip 宽度（约 220px）
        y: buttonRect.top, // 与按钮顶部对齐
        messageRect: rect,
      });
      setShowTooltip(true);
    }
  };

  // 处理长按（移动端）
  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!onReply) return;
    
    const touch = e.touches[0];
    const touchX = touch.clientX;
    const touchY = touch.clientY;
    
    // 记录初始触摸位置
    touchStartPosRef.current = { x: touchX, y: touchY };
    
    longPressTimerRef.current = setTimeout(() => {
      // 长按触发，显示工具提示
      // 但只有在没有移动的情况下才触发
      if (messageRef.current && touchStartPosRef.current) {
        const rect = messageRef.current.getBoundingClientRect();
        // 将 tooltip 显示在触摸位置
        setTooltipPosition({
          x: touchX, // 触摸的 X 坐标
          y: touchY, // 触摸的 Y 坐标
          messageRect: rect, // 传递消息的位置信息
        });
        setShowTooltip(true);
      }
    }, 500); // 500ms 长按
  };

  const handleTouchEnd = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    // 清除触摸位置记录
    touchStartPosRef.current = null;
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    // 如果触摸位置已记录，检查移动距离
    if (touchStartPosRef.current) {
      const touch = e.touches[0];
      const deltaX = Math.abs(touch.clientX - touchStartPosRef.current.x);
      const deltaY = Math.abs(touch.clientY - touchStartPosRef.current.y);
      const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
      
      // 如果移动距离超过阈值，认为是滚动操作，取消长按
      if (distance > SCROLL_THRESHOLD) {
        if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = null;
        }
        // 清除触摸位置，允许滚动继续
        touchStartPosRef.current = null;
      }
    } else {
      // 如果没有初始位置记录，直接取消长按（可能是滚动中）
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
    }
  };

  const handleReply = (messageId: number, replyAuthor: string, replyText: string) => {
    if (onReply) {
      onReply(messageId, replyAuthor, replyText);
    }
    setShowTooltip(false);
    setShowMoreButton(false);
  };

  // 关闭 tooltip 时也隐藏三个点按钮
  const handleCloseTooltip = () => {
    setShowTooltip(false);
    setShowMoreButton(false);
  };

  // 清理定时器
  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
      }
    };
  }, []);

  return (
    <>
      <div 
        ref={setRefs}
        className={`chat-message ${isOwn ? 'own' : ''}`} 
        data-message-id={id}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchMove={handleTouchMove}
      >
      <div className="message-avatar" style={{ backgroundColor: avatarColor }}>
        {displayAvatar && !avatarError ? (
          <img 
            src={displayAvatar} 
            alt="头像" 
            onError={() => {
              // 图片加载失败时，回退到文字头像
              setAvatarError(true);
            }}
          />
        ) : (
          avatarText
        )}
      </div>
      <div 
        className="message-body"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {onReply && (
          <button
            className={`message-more-button ${showMoreButton ? 'visible' : ''}`}
            onClick={handleMoreButtonClick}
            onMouseEnter={(e) => {
              e.stopPropagation();
              setShowMoreButton(true);
            }}
            title="回复"
            aria-label="回复"
          />
        )}
        <div className="message-header">
          <span
            className="message-author"
            style={displayColor ? { color: displayColor } : undefined}
          >
            {author === '游客' || author === '匿名' ? '游客' : author}
          </span>
          <span className="message-time" title={formatFullTime(timestamp)}>
            {formatTime(timestamp)}
          </span>
        </div>
        {/* 显示回复的内容 */}
        {replyTo && replyToAuthor && replyToText && (
          <div className="message-reply">
            <div className="message-reply-line"></div>
            <div className="message-reply-content">
              <span className="message-reply-author">{replyToAuthor}</span>
              <span className="message-reply-text">
                {replyToText.length > 50 ? replyToText.substring(0, 50) + '...' : replyToText}
              </span>
            </div>
          </div>
        )}
        <div className="message-content">
          {displayText && (
            <div className="message-text">
              {decryptError ? (
                <span className="decrypt-error" title="无法解密此消息，可能是密钥不匹配或旧消息">
                  🔒 无法解密此消息
                </span>
              ) : (
                // 高亮显示 @ 的用户名
                (() => {
                  // 匹配 @用户名 格式
                  const mentionRegex = /@([^\s@]+)/g;
                  const parts: (string | JSX.Element)[] = [];
                  let lastIndex = 0;
                  let match;
                  
                  while ((match = mentionRegex.exec(displayText)) !== null) {
                    // 添加 @ 之前的文本
                    if (match.index > lastIndex) {
                      parts.push(displayText.substring(lastIndex, match.index));
                    }
                    
                    // 添加高亮的 @用户名
                    parts.push(
                      <span key={match.index} className="message-mention">
                        @{match[1]}
                      </span>
                    );
                    
                    lastIndex = mentionRegex.lastIndex;
                  }
                  
                  // 添加剩余的文本
                  if (lastIndex < displayText.length) {
                    parts.push(displayText.substring(lastIndex));
                  }
                  
                  return parts.length > 0 ? parts : displayText;
                })()
              )}
            </div>
          )}
          
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
                  className="message-image-clickable"
                  onClick={() => setPreviewImageUrl(imageUrl)}
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
                className="message-image-clickable"
                onClick={() => setPreviewImageUrl(base64Data)}
                onError={(e) => {
                  console.error('Base64 图片渲染失败:', index);
                  e.currentTarget.style.display = 'none';
                }}
              />
            </div>
          ))}
        </div>
      </div>
      {showActionMenu && (
        <MessageActionMenu
          position={actionMenuPosition}
          onReply={handleActionMenuReply}
          onEmojiClick={handleEmojiClick}
          onClose={() => setShowActionMenu(false)}
        />
      )}
      {showTooltip && onReply && (
        <MessageTooltip
          messageId={id}
          messageAuthor={author}
          messageText={text}
          position={{ x: tooltipPosition.x, y: tooltipPosition.y }}
          onReply={handleReply}
          onClose={handleCloseTooltip}
        />
      )}
      {previewImageUrl && (
        <ImagePreview
          imageUrl={previewImageUrl}
          onClose={() => setPreviewImageUrl(null)}
        />
      )}
    </div>
    </>
  );
});

ChatMessage.displayName = 'ChatMessage';

export default ChatMessage;

