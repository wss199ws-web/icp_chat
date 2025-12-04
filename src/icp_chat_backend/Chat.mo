import Nat "mo:base/Nat";
import Int "mo:base/Int";
import Text "mo:base/Text";
import Time "mo:base/Time";
import Array "mo:base/Array";
import Principal "mo:base/Principal";
import Result "mo:base/Result";
import HashMap "mo:base/HashMap";
import Blob "mo:base/Blob";

import Types "./Types";

// 聊天业务逻辑模块：
// - 负责消息校验、发送、分页等纯业务逻辑
// - 不直接持有 stable 状态，由 main.mo 把所需状态作为参数传入

module {

  public type Message = Types.Message;
  public type UserProfile = Types.UserProfile;
  public type MessagePage = Types.MessagePage;

  // 仅在 actor 内部使用的返回类型：带状态更新
  public type SendMessageWithState = Result.Result<{
    msg : Message;
    messages : [Message];
    nextId : Nat;
  }, Text>;

  // ========== 内部工具函数 ==========

  // 验证消息文本（这里简单用非空 + 长度限制）
  func validateMessage(text : Text, imageId : ?Nat, maxMessageLength : Nat) : Result.Result<Text, Text> {
    // 如果既没有文本也没有图片，则返回错误
    if (Text.size(text) == 0 and imageId == null) {
      return #err("消息内容不能为空");
    };
    if (Text.size(text) > maxMessageLength) {
      return #err("消息长度不能超过 " # Nat.toText(maxMessageLength) # " 个字符");
    };
    #ok(text)
  };

  // 清理旧消息（当超过上限时）
  public func cleanupOldMessages(messages : [Message], maxMessages : Nat) : [Message] {
    let len = messages.size();
    if (len >= maxMessages) {
      // 保留最新的 maxMessages - 1000 条消息，删除最旧的 1000 条
      let deleteCount : Nat = 1000;
      if (maxMessages >= deleteCount and len >= deleteCount) {
        let keepCount = maxMessages - deleteCount;
        if (len > keepCount) {
          let startIdx = len - keepCount;
          return Array.subArray<Message>(messages, startIdx, keepCount);
        };
      };
    };
    messages
  };

  // ========== 消息发送 ==========

  public func sendMessage(
    caller : Principal,
    text : Text,
    imageId : ?Nat,
    senderId : Text,
    replyTo : ?Nat,
    messages : [Message],
    images : HashMap.HashMap<Nat, Blob>,
    userProfiles : HashMap.HashMap<Principal, UserProfile>,
    nextId : Nat,
    maxMessageLength : Nat,
    maxMessages : Nat,
  ) : SendMessageWithState {
    // 如果指定了图片ID，验证图片是否存在
    switch (imageId) {
      case (?id) {
        switch (images.get(id)) {
          case null {
            return #err("图片不存在");
          };
          case (_) {};
        };
      };
      case null {};
    };

    // 如果指定了回复的消息ID，验证消息是否存在
    switch (replyTo) {
      case (?replyId) {
        var found : Bool = false;
        label search for (msg in messages.vals()) {
          if (msg.id == replyId) {
            found := true;
            break search;
          };
        };
        if (not found) {
          return #err("回复的消息不存在");
        };
      };
      case null {};
    };

    // 文本校验
    switch (validateMessage(text, imageId, maxMessageLength)) {
      case (#err(msg)) {
        #err(msg);
      };
      case (#ok(validText)) {
        // 从 UserProfile 获取昵称、头像、颜色（发送时的快照）
        let (author, authorAvatar, authorColor) =
          switch (userProfiles.get(caller)) {
            case (?profile) {
              // 使用用户配置的昵称、头像、颜色
              (profile.nickname, profile.avatar, profile.color);
            };
            case (null) {
              // 没有配置 Profile，昵称回退到默认规则，头像和颜色为 null
              let defaultAuthor =
                if (Principal.isAnonymous(caller)) {
                  "游客";
                } else {
                  Principal.toText(caller);
                };
              (defaultAuthor, null, null);
            };
          };

        // 如果不是匿名用户，存储 Principal，用于后续更新历史消息
        let senderPrincipalOpt : ?Principal =
          if (Principal.isAnonymous(caller)) {
            null;
          } else {
            ?caller;
          };

        let msg : Message = {
          id = nextId;
          author = author;
          senderId = senderId;
          senderPrincipal = senderPrincipalOpt;
          authorAvatar = authorAvatar;
          authorColor = authorColor;
          text = validText;
          timestamp = Time.now();
          imageId = imageId;
          replyTo = replyTo;
        };

        // 清理旧消息（如果需要），然后追加新消息
        let cleaned = cleanupOldMessages(messages, maxMessages);
        let updatedMessages = Array.append<Message>(cleaned, [msg]);

        #ok({
          msg = msg;
          messages = updatedMessages;
          nextId = nextId + 1;
        });
      };
    };
  };

  // ========== 消息读取相关 ==========

  // 获取最近 n 条消息
  public func getLastMessages(messages : [Message], n : Nat, defaultPageSize : Nat) : [Message] {
    let len = messages.size();
    let count = if (n == 0) { defaultPageSize } else { Nat.min(n, len) };
    if (count >= len) {
      messages
    } else {
      Array.subArray<Message>(messages, len - count, count)
    }
  };

  // 获取所有消息
  public func getAllMessages(messages : [Message]) : [Message] {
    messages
  };

  // 获取消息总数
  public func getMessageCount(messages : [Message]) : Nat {
    messages.size()
  };

  // 分页获取消息（从最新到最旧）
  public func getMessagesPage(
    messages : [Message],
    page : Nat,
    pageSize : Nat,
    defaultPageSize : Nat,
  ) : MessagePage {
    let total = messages.size();
    let size = if (pageSize == 0) { defaultPageSize } else { Nat.min(pageSize, 100) }; // 限制每页最多100条
    
    let totalPages =
      if (total == 0 or size == 0) {
        0
      } else {
        let pages = total / size;
        if (total % size == 0) { pages } else { pages + 1 };
      };

    let currentPage = if (page == 0) { 1 } else { page };
    
    if (total == 0) {
      return {
        messages = [];
        total = 0;
        page = currentPage;
        pageSize = size;
        totalPages = 0;
      };
    };

    // 页码超出范围
    if (currentPage > totalPages or currentPage == 0) {
      return {
        messages = [];
        total = total;
        page = currentPage;
        pageSize = size;
        totalPages = totalPages;
      };
    };

    let fromEnd =
      if (currentPage <= 1) {
        0
      } else {
        (currentPage - 1) * size;
      };
    
    let startIdx =
      if (fromEnd >= total) {
        0
      } else {
        let endPos = fromEnd + size;
        if (total >= endPos) {
          total - endPos
        } else {
          0
        };
      };

    let actualStart = startIdx;
    let remaining =
      if (total > actualStart) {
        total - actualStart
      } else {
        0
      };
    let actualCount = Nat.min(size, remaining);
    
    let pageMessages =
      if (actualCount == 0) {
        []
      } else {
        Array.subArray<Message>(messages, actualStart, actualCount)
      };

    {
      messages = pageMessages;
      total = total;
      page = currentPage;
      pageSize = size;
      totalPages = totalPages;
    }
  };

  // 根据 ID 获取消息
  public func getMessageById(messages : [Message], id : Nat) : ?Message {
    Array.find<Message>(messages, func(msg : Message) : Bool { msg.id == id })
  };
}


