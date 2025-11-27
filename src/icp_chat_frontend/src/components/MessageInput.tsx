import React, { useState, KeyboardEvent } from 'react';
import './MessageInput.css';

interface MessageInputProps {
  onSend: (text: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

const MessageInput: React.FC<MessageInputProps> = ({
  onSend,
  disabled = false,
  placeholder = '输入消息...',
}) => {
  const [text, setText] = useState('');
  const MAX_LENGTH = 1000;

  const handleSend = () => {
    const trimmedText = text.trim();
    if (trimmedText && !disabled) {
      onSend(trimmedText);
      setText('');
    }
  };

  const handleKeyPress = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const remainingChars = MAX_LENGTH - text.length;
  const isNearLimit = remainingChars < 100;

  return (
    <div className="message-input-container">
      <div className="input-wrapper">
        <textarea
          className="message-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder={placeholder}
          disabled={disabled}
          rows={3}
          maxLength={MAX_LENGTH}
        />
        <div className="input-footer">
          <span className={`char-count ${isNearLimit ? 'warning' : ''}`}>
            {remainingChars} / {MAX_LENGTH}
          </span>
          <button
            className="send-button"
            onClick={handleSend}
            disabled={disabled || !text.trim()}
          >
            发送
          </button>
        </div>
      </div>
    </div>
  );
};

export default MessageInput;

