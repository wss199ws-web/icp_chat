import React, { useEffect, useRef } from 'react';
import ChatMessage, { ChatMessageProps } from './ChatMessage';
import './MessageList.css';

interface MessageListProps {
  messages: ChatMessageProps[];
  currentUser?: string;
}

const MessageList: React.FC<MessageListProps> = ({ messages, currentUser }) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

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
    <div className="message-list" ref={listRef}>
      {messages.map((message) => (
        <ChatMessage
          key={message.id}
          {...message}
          isOwn={currentUser ? message.author === currentUser : false}
        />
      ))}
      <div ref={messagesEndRef} />
    </div>
  );
};

export default MessageList;

