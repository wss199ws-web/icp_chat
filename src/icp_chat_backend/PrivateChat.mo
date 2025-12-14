import Nat "mo:base/Nat";
import Int "mo:base/Int";
import Text "mo:base/Text";
import Time "mo:base/Time";
import Array "mo:base/Array";
import Principal "mo:base/Principal";
import Result "mo:base/Result";
import HashMap "mo:base/HashMap";
import Blob "mo:base/Blob";
import Hash "mo:base/Hash";

import Types "./Types";

// 私聊业务逻辑模块
module {

  public type PrivateMessage = Types.PrivateMessage;
  public type UserProfile = Types.UserProfile;
  public type PrivateMessagePage = Types.PrivateMessagePage;
  public type PrivateChatSession = Types.PrivateChatSession;

  // 仅在 actor 内部使用的返回类型：带状态更新
  public type SendPrivateMessageWithState = Result.Result<{
    msg : PrivateMessage;
    messages : [PrivateMessage];
    nextId : Nat;
  }, Text>;

  // ========== 工具函数 ==========

  // 生成会话ID（两个Principal的排序组合，确保唯一性）
  public func generateSessionId(p1 : Principal, p2 : Principal) : Text {
    let p1Text = Principal.toText(p1);
    let p2Text = Principal.toText(p2);
    // 按字典序排序，确保同一对用户总是生成相同的会话ID
    if (p1Text < p2Text) {
      p1Text # "_" # p2Text
    } else {
      p2Text # "_" # p1Text
    }
  };

  // 验证私聊消息文本
  func validatePrivateMessage(text : Text, imageId : ?Nat, maxMessageLength : Nat) : Result.Result<Text, Text> {
    if (Text.size(text) == 0 and imageId == null) {
      return #err("消息内容不能为空");
    };
    if (Text.size(text) > maxMessageLength) {
      return #err("消息长度不能超过 " # Nat.toText(maxMessageLength) # " 个字符");
    };
    #ok(text)
  };

  // 清理旧消息（当超过上限时）
  public func cleanupOldPrivateMessages(messages : [PrivateMessage], maxMessages : Nat) : [PrivateMessage] {
    let len = messages.size();
    if (len >= maxMessages) {
      let deleteCount : Nat = 1000;
      if (maxMessages >= deleteCount and len >= deleteCount) {
        let keepCount = maxMessages - deleteCount;
        if (len > keepCount) {
          let startIdx = len - keepCount;
          return Array.subArray<PrivateMessage>(messages, startIdx, keepCount);
        };
      };
    };
    messages
  };

  // ========== 私聊消息发送 ==========

  public func sendPrivateMessage(
    caller : Principal,
    receiverPrincipal : Principal,
    text : Text,
    imageId : ?Nat,
    senderId : Text,
    replyTo : ?Nat,
    messages : [PrivateMessage],
    images : HashMap.HashMap<Nat, Blob>,
    userProfiles : HashMap.HashMap<Principal, UserProfile>,
    nextId : Nat,
    maxMessageLength : Nat,
    maxMessages : Nat,
  ) : SendPrivateMessageWithState {
    // 验证接收者不能是匿名用户
    if (Principal.isAnonymous(receiverPrincipal)) {
      return #err("不能向匿名用户发送私聊消息");
    };

    // 验证不能给自己发消息
    if (Principal.equal(caller, receiverPrincipal)) {
      return #err("不能给自己发送私聊消息");
    };

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
    switch (validatePrivateMessage(text, imageId, maxMessageLength)) {
      case (#err(msg)) {
        #err(msg);
      };
      case (#ok(validText)) {
        // 从 UserProfile 获取昵称、头像、颜色
        let (author, authorAvatar, authorColor) =
          switch (userProfiles.get(caller)) {
            case (?profile) {
              (profile.nickname, profile.avatar, profile.color);
            };
            case (null) {
              let defaultAuthor =
                if (Principal.isAnonymous(caller)) {
                  "游客";
                } else {
                  Principal.toText(caller);
                };
              (defaultAuthor, null, null);
            };
          };

        // 如果不是匿名用户，存储 Principal
        let senderPrincipalOpt : ?Principal =
          if (Principal.isAnonymous(caller)) {
            null;
          } else {
            ?caller;
          };

        let msg : PrivateMessage = {
          id = nextId;
          author = author;
          senderId = senderId;
          senderPrincipal = senderPrincipalOpt;
          receiverPrincipal = ?receiverPrincipal;
          authorAvatar = authorAvatar;
          authorColor = authorColor;
          text = validText;
          timestamp = Time.now();
          imageId = imageId;
          replyTo = replyTo;
        };

        // 清理旧消息（如果需要），然后追加新消息
        let cleaned = cleanupOldPrivateMessages(messages, maxMessages);
        let updatedMessages = Array.append<PrivateMessage>(cleaned, [msg]);

        #ok({
          msg = msg;
          messages = updatedMessages;
          nextId = nextId + 1;
        });
      };
    };
  };

  // ========== 私聊消息读取相关 ==========

  // 获取会话的所有消息
  public func getSessionMessages(
    messages : [PrivateMessage],
    sessionId : Text,
    caller : Principal,
    otherPrincipal : Principal,
  ) : [PrivateMessage] {
    let expectedSessionId = generateSessionId(caller, otherPrincipal);
    if (expectedSessionId != sessionId) {
      return [];
    };
    
    // 过滤出属于该会话的消息（发送者或接收者是caller，且对方是otherPrincipal）
    Array.filter<PrivateMessage>(messages, func(msg : PrivateMessage) : Bool {
      switch (msg.senderPrincipal, msg.receiverPrincipal) {
        case (?sender, ?receiver) {
          // 消息的发送者和接收者必须匹配caller和otherPrincipal（顺序可能不同）
          (Principal.equal(sender, caller) and Principal.equal(receiver, otherPrincipal)) or
          (Principal.equal(sender, otherPrincipal) and Principal.equal(receiver, caller))
        };
        case (_, _) { false };
      };
    });
  };

  // 获取最近 n 条私聊消息
  public func getLastPrivateMessages(
    messages : [PrivateMessage],
    sessionId : Text,
    caller : Principal,
    otherPrincipal : Principal,
    n : Nat,
    defaultPageSize : Nat,
  ) : [PrivateMessage] {
    let sessionMessages = getSessionMessages(messages, sessionId, caller, otherPrincipal);
    let len = sessionMessages.size();
    let count = if (n == 0) { defaultPageSize } else { Nat.min(n, len) };
    if (count >= len) {
      sessionMessages
    } else {
      Array.subArray<PrivateMessage>(sessionMessages, len - count, count)
    }
  };

  // 分页获取私聊消息（从最新到最旧）
  public func getPrivateMessagesPage(
    messages : [PrivateMessage],
    sessionId : Text,
    caller : Principal,
    otherPrincipal : Principal,
    page : Nat,
    pageSize : Nat,
    defaultPageSize : Nat,
  ) : PrivateMessagePage {
    let sessionMessages = getSessionMessages(messages, sessionId, caller, otherPrincipal);
    let total = sessionMessages.size();
    let size = if (pageSize == 0) { defaultPageSize } else { Nat.min(pageSize, 100) };
    
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
        Array.subArray<PrivateMessage>(sessionMessages, actualStart, actualCount)
      };

    {
      messages = pageMessages;
      total = total;
      page = currentPage;
      pageSize = size;
      totalPages = totalPages;
    }
  };

  // 根据 ID 获取私聊消息
  public func getPrivateMessageById(
    messages : [PrivateMessage],
    id : Nat,
    caller : Principal,
  ) : ?PrivateMessage {
    switch (Array.find<PrivateMessage>(messages, func(msg : PrivateMessage) : Bool { msg.id == id })) {
      case (?msg) {
        // 验证消息是否属于当前用户（发送者或接收者是caller）
        switch (msg.senderPrincipal, msg.receiverPrincipal) {
          case (?sender, ?receiver) {
            if (Principal.equal(sender, caller) or Principal.equal(receiver, caller)) {
              ?msg
            } else {
              null
            };
          };
          case (_, _) { null };
        };
      };
      case (null) { null };
    };
  };

  // 获取用户的私聊会话列表
  public func getUserSessions(
    messages : [PrivateMessage],
    caller : Principal,
    userProfiles : HashMap.HashMap<Principal, UserProfile>,
  ) : [PrivateChatSession] {
    // 收集所有与caller相关的会话
    var sessionMap : HashMap.HashMap<Text, {
      otherPrincipal : Principal;
      messages : [PrivateMessage];
    }> = HashMap.HashMap<Text, {
      otherPrincipal : Principal;
      messages : [PrivateMessage];
    }>(0, Text.equal, Text.hash);

    // 遍历所有消息，找出与caller相关的会话
    for (msg in messages.vals()) {
      switch (msg.senderPrincipal, msg.receiverPrincipal) {
        case (?sender, ?receiver) {
          if (Principal.equal(sender, caller)) {
            // caller是发送者，对方是receiver
            let sessionId = generateSessionId(caller, receiver);
            switch (sessionMap.get(sessionId)) {
              case (?session) {
                let updatedMessages = Array.append(session.messages, [msg]);
                sessionMap.put(sessionId, {
                  otherPrincipal = receiver;
                  messages = updatedMessages;
                });
              };
              case (null) {
                sessionMap.put(sessionId, {
                  otherPrincipal = receiver;
                  messages = [msg];
                });
              };
            };
          } else if (Principal.equal(receiver, caller)) {
            // caller是接收者，对方是sender
            let sessionId = generateSessionId(caller, sender);
            switch (sessionMap.get(sessionId)) {
              case (?session) {
                let updatedMessages = Array.append(session.messages, [msg]);
                sessionMap.put(sessionId, {
                  otherPrincipal = sender;
                  messages = updatedMessages;
                });
              };
              case (null) {
                sessionMap.put(sessionId, {
                  otherPrincipal = sender;
                  messages = [msg];
                });
              };
            };
          };
        };
        case (_, _) {};
      };
    };

    // 转换为会话列表
    var sessions : [PrivateChatSession] = [];
    for ((sessionId, session) in sessionMap.entries()) {
      let otherProfile = userProfiles.get(session.otherPrincipal);
      let otherNickname = switch (otherProfile) {
        case (?profile) { ?profile.nickname };
        case (null) { null };
      };
      let otherAvatar = switch (otherProfile) {
        case (?profile) { profile.avatar };
        case (null) { null };
      };

      // 获取最后一条消息
      let sortedMessages = Array.sort<PrivateMessage>(session.messages, func(a : PrivateMessage, b : PrivateMessage) : { #less; #equal; #greater } {
        if (a.timestamp < b.timestamp) { #less }
        else if (a.timestamp > b.timestamp) { #greater }
        else { #equal }
      });
      let lastMessage = if (sortedMessages.size() > 0) {
        ?sortedMessages[sortedMessages.size() - 1]
      } else {
        null
      };
      let lastMessageTime = switch (lastMessage) {
        case (?msg) { msg.timestamp };
        case (null) { 0 };
      };

      // 计算未读消息数（接收者是caller且未读的消息）
      var unreadCount : Nat = 0;
      for (msg in session.messages.vals()) {
        switch (msg.receiverPrincipal) {
          case (?receiver) {
            if (Principal.equal(receiver, caller)) {
              // 这里简化处理，实际应该维护一个已读状态
              // 暂时不实现未读计数，返回0
              unreadCount := 0;
            };
          };
          case (null) {};
        };
      };

      sessions := Array.append(sessions, [{
        sessionId = sessionId;
        otherPrincipal = session.otherPrincipal;
        otherNickname = otherNickname;
        otherAvatar = otherAvatar;
        lastMessage = lastMessage;
        lastMessageTime = lastMessageTime;
        unreadCount = unreadCount;
      }]);
    };

    // 按最后消息时间排序（最新的在前）
    Array.sort<PrivateChatSession>(sessions, func(a : PrivateChatSession, b : PrivateChatSession) : { #less; #equal; #greater } {
      if (a.lastMessageTime > b.lastMessageTime) { #less }
      else if (a.lastMessageTime < b.lastMessageTime) { #greater }
      else { #equal }
    });
  };
}



