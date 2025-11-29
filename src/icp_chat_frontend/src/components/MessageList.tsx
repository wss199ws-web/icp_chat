import React, { useEffect, useRef } from 'react';
import ChatMessage, { ChatMessageProps } from './ChatMessage';
import './MessageList.css';

interface MessageListProps {
  messages: ChatMessageProps[];
  currentUser?: string | null;
  onLoadMore?: () => void;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  ownAvatar?: string | null;
  ownColor?: string | null;
  clientId?: string;
  scrollToMessageId?: number | null; // 要滚动到的消息 ID
}

const TOP_THRESHOLD = 60;

const MessageList: React.FC<MessageListProps> = ({
  messages,
  currentUser,
  onLoadMore,
  hasMore = false,
  isLoadingMore = false,
  ownAvatar,
  ownColor,
  clientId,
  scrollToMessageId,
}) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const messageRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const isAtBottomRef = useRef(true);
  const prevScrollHeightRef = useRef<number | null>(null);
  const prevScrollTopRef = useRef<number | null>(null);
  const loadMoreTriggeredRef = useRef(false);

  const scrollToBottom = (behavior: ScrollBehavior = 'auto') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  const handleScroll = () => {
    const listEl = listRef.current;
    if (!listEl) {
      return;
    }
    const { scrollTop, clientHeight, scrollHeight } = listEl;
    const distanceFromBottom = scrollHeight - (scrollTop + clientHeight);
    isAtBottomRef.current = distanceFromBottom < 80;

    if (
      onLoadMore &&
      hasMore &&
      !isLoadingMore &&
      !loadMoreTriggeredRef.current &&
      scrollTop <= TOP_THRESHOLD
    ) {
      loadMoreTriggeredRef.current = true;
      onLoadMore();
    }
  };

  useEffect(() => {
    // 当开始加载历史消息时，记录当前滚动位置
    if (isLoadingMore && listRef.current) {
      prevScrollHeightRef.current = listRef.current.scrollHeight;
      prevScrollTopRef.current = listRef.current.scrollTop;
      loadMoreTriggeredRef.current = true;
    }
    if (!isLoadingMore) {
      loadMoreTriggeredRef.current = false;
    }
  }, [isLoadingMore]);

  useEffect(() => {
    const listEl = listRef.current;
    if (!listEl) {
      return;
    }

    // 加载历史消息完成后，保持之前的滚动位置
    if (
      !isLoadingMore &&
      prevScrollHeightRef.current !== null &&
      prevScrollTopRef.current !== null
    ) {
      const diff = listEl.scrollHeight - prevScrollHeightRef.current;
      listEl.scrollTop = (prevScrollTopRef.current || 0) + diff;
      prevScrollHeightRef.current = null;
      prevScrollTopRef.current = null;
    } else if (!isLoadingMore && isAtBottomRef.current) {
      scrollToBottom();
    }
  }, [messages, isLoadingMore]);

  // 滚动到指定消息
  useEffect(() => {
    if (scrollToMessageId !== undefined && scrollToMessageId !== null) {
      const messageEl = messageRefs.current.get(scrollToMessageId);
      if (messageEl && listRef.current) {
        // 高亮消息
        messageEl.classList.add('message-highlighted');
        setTimeout(() => {
          messageEl.classList.remove('message-highlighted');
        }, 2000);

        // 滚动到消息位置
        messageEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [scrollToMessageId]);

  if (messages.length === 0) {
    return (
      <div className="message-list empty">
        <div className="empty-state">
          <div className="empty-icon">💬</div>
          <p>还没有消息，快来发送第一条消息吧！</p>
        </div>
      </div>
    );
  }

  return (
    <div className="message-list" ref={listRef} onScroll={handleScroll}>
      {hasMore && (
        <div className="load-more-indicator">
          {isLoadingMore ? (
            <div className="load-more-spinner" aria-label="加载历史消息中" />
          ) : (
            '上滑加载更多消息'
          )}
        </div>
      )}
      {messages.map((message) => {
        // 判断是否是当前用户发送的消息
        const isOwnMessage = clientId ? message.senderId === clientId : false;
        
        // 对于当前用户的消息：使用最新的 Profile 信息覆盖消息中的快照
        // 这样修改个人信息后，历史消息也会显示更新后的信息
        // 对于其他用户的消息：使用消息中的快照，保证所有浏览器看到一致的效果
        const displayAvatar = isOwnMessage 
          ? (ownAvatar ?? message.authorAvatar ?? undefined)
          : (message.authorAvatar ?? undefined);
        const displayColor = isOwnMessage
          ? (ownColor ?? message.authorColor ?? undefined)
          : (message.authorColor ?? undefined);
        // 昵称也使用最新信息（如果是当前用户的消息）
        const displayAuthor = isOwnMessage && currentUser
          ? currentUser
          : message.author;
        
        return (
        <ChatMessage
          key={message.id}
          ref={(el) => {
            if (el) {
              messageRefs.current.set(message.id, el);
            } else {
              messageRefs.current.delete(message.id);
            }
          }}
          {...message}
            author={displayAuthor}
            isOwn={isOwnMessage}
            avatarUrl={displayAvatar}
            nicknameColor={displayColor}
        />
        );
      })}
      <div ref={messagesEndRef} />
    </div>
  );
};

export default MessageList;

