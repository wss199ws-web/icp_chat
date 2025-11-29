import React, { useEffect, useRef } from 'react';
import ChatMessage, { ChatMessageProps } from './ChatMessage';
import './MessageList.css';

interface MessageListProps {
  messages: ChatMessageProps[];
  currentUser?: string;
  onLoadMore?: () => void;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  ownAvatar?: string | null;
  ownColor?: string | null;
  ownAuthors?: string[];
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
  ownAuthors,
}) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
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
      {messages.map((message) => (
        <ChatMessage
          key={message.id}
          {...message}
          isOwn={ownAuthors ? ownAuthors.includes(message.author) : currentUser ? message.author === currentUser : false}
          avatarUrl={
            ownAuthors && ownAuthors.includes(message.author)
              ? ownAvatar
              : currentUser && message.author === currentUser
              ? ownAvatar
              : undefined
          }
          nicknameColor={
            ownAuthors && ownAuthors.includes(message.author)
              ? ownColor
              : currentUser && message.author === currentUser
              ? ownColor
              : undefined
          }
        />
      ))}
      <div ref={messagesEndRef} />
    </div>
  );
};

export default MessageList;

