import React, { useState, KeyboardEvent, useRef, useEffect } from 'react';
import './MessageInput.css';
import { chatService } from '../services/chatService';
import EmojiPicker from './EmojiPicker';
import UserMention, { User } from './UserMention';
import { compressImage, compressImageToDataURL } from '../utils/imageCompression';

interface MessageInputProps {
  onSend: (text: string, imageId?: number | null) => void;
  disabled?: boolean;
  placeholder?: string;
  users?: User[]; // 用户列表，用于 @ 功能
  replyingTo?: { messageId: number; author: string; text: string } | null; // 正在回复的消息
  onCancelReply?: () => void; // 取消回复回调
  textareaRef?: React.RefObject<HTMLTextAreaElement>; // 外部传入的 textarea ref
}

const MessageInput: React.FC<MessageInputProps> = ({
  onSend,
  disabled = false,
  placeholder = '输入消息...',
  users = [],
  replyingTo,
  onCancelReply,
  textareaRef: externalTextareaRef,
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
  const internalTextareaRef = useRef<HTMLTextAreaElement>(null);
  const textareaRef = externalTextareaRef || internalTextareaRef;
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

  const handleImageFile = async (file: File | null) => {
    if (!file) return false;

    if (!file.type.startsWith('image/')) {
      alert('请选择图片文件');
      return false;
    }

    if (file.size > MAX_IMAGE_SIZE) {
      alert(`图片大小不能超过 ${MAX_IMAGE_SIZE / 1024 / 1024}MB`);
      return false;
    }

    try {
      // 如果图片超过2MB，先压缩
      let processedFile = file;
      if (file.size > 2 * 1024 * 1024) {
        console.log('[MessageInput] 图片超过2MB，开始压缩...');
        const compressedBlob = await compressImage(file);
        processedFile = new File([compressedBlob], file.name, { type: file.type });
        console.log(`[MessageInput] 压缩完成，原始: ${(file.size / 1024 / 1024).toFixed(2)}MB -> ${(processedFile.size / 1024 / 1024).toFixed(2)}MB`);
      }

      setSelectedImage(processedFile);
      
      // 生成预览（使用压缩后的图片）
      const previewDataUrl = await compressImageToDataURL(processedFile);
      setImagePreview(previewDataUrl);
      
      return true;
    } catch (error) {
      console.error('[MessageInput] 图片处理失败:', error);
      alert('图片处理失败，请重试');
      return false;
    }
  };

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await handleImageFile(file);
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
          // 如果图片超过2MB，先压缩
          let processedBlob = blob;
          if (blob.size > 2 * 1024 * 1024) {
            console.log('[MessageInput] Base64图片超过2MB，开始压缩...');
            const file = new File([blob], 'image.jpg', { type: blob.type || 'image/jpeg' });
            processedBlob = await compressImage(file);
            console.log(`[MessageInput] 压缩完成，原始: ${(blob.size / 1024 / 1024).toFixed(2)}MB -> ${(processedBlob.size / 1024 / 1024).toFixed(2)}MB`);
          }
          
          const result = await chatService.uploadImage(processedBlob);
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

    // 如果有选中的图片，先上传（已经压缩过了）
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
    // 发送成功后，如果有回复状态，由父组件清除
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


  // 切换表情选择器显示
  const toggleEmojiPicker = () => {
    setShowEmojiPicker((prev) => !prev);
  };

  const handlePaste = async (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
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
        await handleImageFile(file);
        if (textData) {
          setText((prev) => prev + textData);
        }
      }
    }
  };

  const remainingChars = MAX_LENGTH - text.length;
  const isNearLimit = remainingChars < 100;

  return (
    <>
      {/* 回复预览 - 在输入框上方 */}
      {replyingTo && (
        <div className="reply-preview-wrapper">
          <div className="reply-preview">
            <div className="reply-preview-line"></div>
            <div className="reply-preview-content">
              <span className="reply-preview-label">回复</span>
              <span className="reply-preview-author">{replyingTo.author}</span>
              <span className="reply-preview-text">
                {replyingTo.text.length > 30 ? replyingTo.text.substring(0, 30) + '...' : replyingTo.text}
              </span>
            </div>
            <button className="reply-preview-close" onClick={onCancelReply} title="取消回复">
              ×
            </button>
          </div>
        </div>
      )}
      {/* 图片预览 - 在输入框上方 */}
      {imagePreview && (
        <div className="image-preview-wrapper">
          <div className="image-preview">
            <img src={imagePreview} alt="预览" />
            <button className="remove-image-btn" onClick={removeImage} disabled={disabled || uploading}>
              ×
            </button>
          </div>
        </div>
      )}
      {detectedBase64 && !imagePreview && (
        <div className="image-preview-wrapper">
          <div className="image-preview base64-detected">
            <img src={detectedBase64.dataUrl} alt="检测到的图片" />
            <div className="base64-hint">检测到图片，发送时将自动上传</div>
          </div>
        </div>
      )}
      <div className="message-input-container">
        <div className="input-wrapper" ref={mentionRef}>
          {showEmojiPicker && (
            <EmojiPicker
              onSelect={handleEmojiSelect}
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
    </>
  );
};

export default MessageInput;

