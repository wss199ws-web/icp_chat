import React, { useState, KeyboardEvent, useRef, useEffect } from 'react';
import './MessageInput.css';
import { chatService } from '../services/chatService';
import EmojiPicker from './EmojiPicker';
import UserMention, { User } from './UserMention';

interface MessageInputProps {
  onSend: (text: string, imageId?: number | null) => void;
  disabled?: boolean;
  placeholder?: string;
  users?: User[]; // 用户列表，用于 @ 功能
}

const MessageInput: React.FC<MessageInputProps> = ({
  onSend,
  disabled = false,
  placeholder = '输入消息...',
  users = [],
}) => {
  const [text, setText] = useState('');
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [detectedBase64, setDetectedBase64] = useState<{ dataUrl: string; mimeType: string } | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showUserMention, setShowUserMention] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionPosition, setMentionPosition] = useState<{ start: number; end: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mentionRef = useRef<HTMLDivElement>(null);
  const MAX_LENGTH = 1000;
  const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB

  // 检测文本中是否包含 base64 图片数据
  const detectBase64Image = (text: string): { dataUrl: string; mimeType: string } | null => {
    // 匹配 data:image/xxx;base64,xxxxx 格式
    const base64ImageRegex = /data:image\/([a-zA-Z]*);base64,([^"'\s]+)/;
    const match = text.match(base64ImageRegex);
    
    if (match) {
      return {
        dataUrl: match[0],
        mimeType: match[1] || 'jpeg'
      };
    }
    return null;
  };

  // 检测文本输入中的 base64 图片
  useEffect(() => {
    const base64Image = detectBase64Image(text);
    setDetectedBase64(base64Image);
  }, [text]);

  // 检测 @ 符号并显示用户列表
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const cursorPos = textarea.selectionStart;
    const textBeforeCursor = text.substring(0, cursorPos);
    
    // 查找最后一个 @ 符号
    const lastAtIndex = textBeforeCursor.lastIndexOf('@');
    
    if (lastAtIndex !== -1) {
      // 检查 @ 后面是否有空格或其他分隔符（如果有，说明 @ 已经完成）
      const afterAt = textBeforeCursor.substring(lastAtIndex + 1);
      const hasSpaceOrNewline = /[\s\n]/.test(afterAt);
      
      if (!hasSpaceOrNewline) {
        // 提取 @ 后面的查询文本
        const query = afterAt;
        setMentionQuery(query);
        setMentionPosition({ start: lastAtIndex, end: cursorPos });
        setShowUserMention(true);
        return;
      }
    }
    
    // 如果没有找到有效的 @，隐藏用户列表
    setShowUserMention(false);
    setMentionQuery('');
    setMentionPosition(null);
  }, [text]);

  // 点击外部关闭用户列表
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        mentionRef.current &&
        !mentionRef.current.contains(event.target as Node) &&
        textareaRef.current &&
        !textareaRef.current.contains(event.target as Node)
      ) {
        setShowUserMention(false);
      }
    };

    if (showUserMention) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [showUserMention]);

  // 处理用户选择
  const handleUserSelect = (user: User) => {
    const textarea = textareaRef.current;
    if (!textarea || !mentionPosition) return;

    const beforeMention = text.substring(0, mentionPosition.start);
    const afterMention = text.substring(mentionPosition.end);
    const newText = `${beforeMention}@${user.nickname} ${afterMention}`;
    
    setText(newText);
    setShowUserMention(false);
    setMentionQuery('');
    setMentionPosition(null);

    // 设置光标位置到 @用户名 后面
    setTimeout(() => {
      textarea.focus();
      const newCursorPos = mentionPosition.start + user.nickname.length + 2; // +2 for @ and space
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    }, 0);
  };

  const handleImageFile = (file: File | null) => {
    if (!file) return false;

    if (!file.type.startsWith('image/')) {
      alert('请选择图片文件');
      return false;
    }

    if (file.size > MAX_IMAGE_SIZE) {
      alert(`图片大小不能超过 ${MAX_IMAGE_SIZE / 1024 / 1024}MB`);
      return false;
    }

    setSelectedImage(file);
    const reader = new FileReader();
    reader.onloadend = () => {
      setImagePreview(reader.result as string);
    };
    reader.readAsDataURL(file);
    return true;
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    handleImageFile(file);
  };

  const removeImage = () => {
    setSelectedImage(null);
    setImagePreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // 将 base64 数据 URL 转换为 Blob
  const dataURLtoBlob = (dataURL: string): Blob | null => {
    try {
      const arr = dataURL.split(',');
      const mimeMatch = arr[0].match(/:(.*?);/);
      const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
      const bstr = atob(arr[1]);
      let n = bstr.length;
      const u8arr = new Uint8Array(n);
      while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
      }
      return new Blob([u8arr], { type: mime });
    } catch (error) {
      console.error('转换 base64 失败:', error);
      return null;
    }
  };

  const handleSend = async () => {
    if (disabled) return;

    let trimmedText = text.trim();
    let imageId: number | null = null;

    // 检测文本中是否包含 base64 图片数据
    const base64Image = detectBase64Image(trimmedText);
    if (base64Image) {
      // 将 base64 转换为 Blob 并上传
      const blob = dataURLtoBlob(base64Image.dataUrl);
      if (blob) {
        setUploading(true);
        try {
          const result = await chatService.uploadImage(blob);
          if (result.success && result.imageId !== undefined) {
            imageId = result.imageId;
            // 从文本中移除 base64 数据，只保留其他文本
            trimmedText = trimmedText.replace(/data:image\/[^;]+;base64,[^"'\s]+/g, '').trim();
          } else {
            alert(result.error || '图片上传失败');
            setUploading(false);
            return;
          }
        } catch (error) {
          alert('图片上传失败，请重试');
          setUploading(false);
          return;
        }
        setUploading(false);
      }
    }

    // 如果有选中的图片，先上传
    if (selectedImage) {
      setUploading(true);
      try {
        const result = await chatService.uploadImage(selectedImage);
        if (result.success && result.imageId !== undefined) {
          imageId = result.imageId;
        } else {
          alert(result.error || '图片上传失败');
          setUploading(false);
          return;
        }
      } catch (error) {
        alert('图片上传失败，请重试');
        setUploading(false);
        return;
      }
      setUploading(false);
    }

    // 如果既没有文本也没有图片，不发送
    if (!trimmedText && !imageId) {
      return;
    }

    onSend(trimmedText, imageId);
    setText('');
    setSelectedImage(null);
    setImagePreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleKeyPress = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // 处理表情选择
  const handleEmojiSelect = (emoji: string) => {
    const textarea = textareaRef.current;
    if (!textarea) {
      // 如果没有焦点，直接追加到末尾
      setText((prev) => prev + emoji);
      return;
    }

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const currentText = text;
    const newText = currentText.substring(0, start) + emoji + currentText.substring(end);
    
    setText(newText);
    
    // 设置光标位置到插入表情后
    setTimeout(() => {
      textarea.focus();
      const newCursorPos = start + emoji.length;
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    }, 0);
  };

  // 处理网络表情包选择：将图片 URL 转换为 base64 并插入（已废弃，保留用于兼容）
  const handleStickerSelect = async (imageUrl: string) => {
    try {
      // 如果已经是 base64 格式，直接插入
      if (imageUrl.startsWith('data:image/')) {
        handleEmojiSelect(imageUrl);
        return;
      }

      // 否则，从 URL 加载图片并转换为 base64
      const response = await fetch(imageUrl, { mode: 'cors' });
      if (!response.ok) {
        throw new Error('图片加载失败');
      }
      const blob = await response.blob();
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        handleEmojiSelect(base64); // 将 base64 图片插入到文本中
      };
      reader.onerror = () => {
        console.error('转换图片失败');
        alert('表情包加载失败，请稍后重试');
      };
      reader.readAsDataURL(blob);
    } catch (error) {
      console.error('加载表情包失败:', error);
      alert('表情包加载失败，请检查网络连接');
    }
  };

  // 处理直接发送表情包图片：将 base64 转换为 Blob 并上传发送
  const handleSendSticker = async (imageBase64: string) => {
    if (disabled || uploading) return;

    try {
      setUploading(true);
      
      // 将 base64 转换为 Blob
      const blob = dataURLtoBlob(imageBase64);
      if (!blob) {
        alert('图片格式错误');
        setUploading(false);
        return;
      }

      // 上传图片
      const result = await chatService.uploadImage(blob);
      if (result.success && result.imageId !== undefined) {
        // 直接发送，不填充文本
        onSend('', result.imageId);
      } else {
        alert(result.error || '图片上传失败');
      }
    } catch (error) {
      console.error('发送表情包失败:', error);
      alert('发送表情包失败，请重试');
    } finally {
      setUploading(false);
    }
  };

  // 切换表情选择器显示
  const toggleEmojiPicker = () => {
    setShowEmojiPicker((prev) => !prev);
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    if (disabled || uploading) return;
    const clipboardData = event.clipboardData;
    if (!clipboardData) return;

    const items = Array.from(clipboardData.items || []);
    const imageItem = items.find((item) => item.type.startsWith('image/'));

    if (imageItem) {
      const file = imageItem.getAsFile();
      if (file) {
        event.preventDefault(); // 阻止默认插入行为
        const textData = clipboardData.getData('text');
        handleImageFile(file);
        if (textData) {
          setText((prev) => prev + textData);
        }
      }
    }
  };

  const remainingChars = MAX_LENGTH - text.length;
  const isNearLimit = remainingChars < 100;

  return (
    <div className="message-input-container">
      <div className="input-wrapper" ref={mentionRef}>
        {showEmojiPicker && (
          <EmojiPicker
            onSelect={handleEmojiSelect}
            onSelectImage={handleStickerSelect}
            onSendImage={handleSendSticker}
            onClose={() => setShowEmojiPicker(false)}
          />
        )}
        {showUserMention && users.length > 0 && (
          <UserMention
            users={users}
            onSelect={handleUserSelect}
            onClose={() => setShowUserMention(false)}
            searchQuery={mentionQuery}
          />
        )}
        {imagePreview && (
          <div className="image-preview">
            <img src={imagePreview} alt="预览" />
            <button className="remove-image-btn" onClick={removeImage} disabled={disabled || uploading}>
              ×
            </button>
          </div>
        )}
        {detectedBase64 && !imagePreview && (
          <div className="image-preview base64-detected">
            <img src={detectedBase64.dataUrl} alt="检测到的图片" />
            <div className="base64-hint">检测到图片，发送时将自动上传</div>
          </div>
        )}
        <textarea
          ref={textareaRef}
          className="message-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyPress={handleKeyPress}
          onPaste={handlePaste}
          placeholder={placeholder}
          disabled={disabled || uploading}
          rows={3}
          maxLength={MAX_LENGTH}
        />
        <div className="input-footer">
          <div className="input-actions">
            <button
              className="emoji-btn"
              onClick={toggleEmojiPicker}
              disabled={disabled || uploading}
              title="表情"
              type="button"
            >
              😊
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageSelect}
              disabled={disabled || uploading}
              style={{ display: 'none' }}
              id="image-input"
            />
            <label htmlFor="image-input" className="image-upload-btn" title="上传图片">
              📷
            </label>
            <span className={`char-count ${isNearLimit ? 'warning' : ''}`}>
              {remainingChars} / {MAX_LENGTH}
            </span>
          </div>
          <button
            className="send-button"
            onClick={handleSend}
            disabled={disabled || uploading || (!text.trim() && !selectedImage)}
          >
            {uploading ? '上传中...' : '发送'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default MessageInput;

