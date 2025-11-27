import Nat "mo:base/Nat";
import Int "mo:base/Int";
import Text "mo:base/Text";
import Time "mo:base/Time";
import Array "mo:base/Array";
import Principal "mo:base/Principal";
import Result "mo:base/Result";

// 去掉 persistent / transient，用普通 actor 即可
actor ICPChat {

  // 配置常量（顶层 let 本来就是只读的，不需要 transient）
  let MAX_MESSAGE_LENGTH : Nat = 1000; // 单条消息最大长度
  let MAX_MESSAGES : Nat = 10000;      // 最大消息数量
  let DEFAULT_PAGE_SIZE : Nat = 50;    // 默认分页大小

  public type Message = {
    id : Nat;
    author : Text;
    text : Text;
    timestamp : Int;
  };

  public type SendMessageResult = Result.Result<Message, Text>;

  public type MessagePage = {
    messages : [Message];
    total : Nat;
    page : Nat;
    pageSize : Nat;
    totalPages : Nat;
  };

  // 持久化状态用 stable 即可
  stable var messages : [Message] = [];
  stable var nextId : Nat = 0;

  // 验证消息文本（这里简单用非空 + 长度限制，避免 trim 的版本差异问题）
  private func validateMessage(text : Text) : Result.Result<Text, Text> {
    if (Text.size(text) == 0) {
      return #err("消息内容不能为空");
    };
    if (Text.size(text) > MAX_MESSAGE_LENGTH) {
      return #err("消息长度不能超过 " # Nat.toText(MAX_MESSAGE_LENGTH) # " 个字符");
    };
    #ok(text)
  };

  // 清理旧消息（当超过上限时）
  private func cleanupOldMessages() {
    let len = messages.size();
    if (len >= MAX_MESSAGES) {
      // 保留最新的 MAX_MESSAGES - 1000 条消息，删除最旧的 1000 条
      let deleteCount : Nat = 1000;
      if (MAX_MESSAGES >= deleteCount and len >= deleteCount) {
        let keepCount = MAX_MESSAGES - deleteCount;
        if (len > keepCount) {
          let startIdx = len - keepCount;
          messages := Array.subArray<Message>(messages, startIdx, keepCount);
        };
      };
    };
  };

  // 发送消息（带验证）
  public shared ({ caller }) func sendMessage(text : Text) : async SendMessageResult {
    switch (validateMessage(text)) {
      case (#err(msg)) {
        return #err(msg);
      };
      case (#ok(validText)) {
        let author =
          if (Principal.isAnonymous(caller)) {
            "匿名"
          } else {
            Principal.toText(caller);
          };

        let msg : Message = {
          id = nextId;
          author = author;
          text = validText;
          timestamp = Time.now();
        };

        // 清理旧消息（如果需要）
        cleanupOldMessages();

        messages := Array.append(messages, [msg]);
        nextId += 1;

        #ok(msg)
      };
    };
  };

  // 获取最近 n 条消息
  public query func getLastMessages(n : Nat) : async [Message] {
    let len = messages.size();
    let count = if (n == 0) { DEFAULT_PAGE_SIZE } else { Nat.min(n, len) };
    if (count >= len) {
      messages
    } else {
      Array.subArray<Message>(messages, len - count, count)
    }
  };

  // 获取所有消息
  public query func getAllMessages() : async [Message] {
    messages
  };

  // 获取消息总数
  public query func getMessageCount() : async Nat {
    messages.size()
  };

  // 分页获取消息（从最新到最旧）
  public query func getMessagesPage(page : Nat, pageSize : Nat) : async MessagePage {
    let total = messages.size();
    let size = if (pageSize == 0) { DEFAULT_PAGE_SIZE } else { Nat.min(pageSize, 100) }; // 限制每页最多100条
    
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
  public query func getMessageById(id : Nat) : async ?Message {
    Array.find<Message>(messages, func(msg : Message) : Bool { msg.id == id })
  };

  // 清空所有消息（管理员功能，可根据需要添加权限检查）
  public shared ({ caller }) func clearAllMessages() : async Bool {
    // 这里暂时没有做权限控制
    ignore caller;
    messages := [];
    nextId := 0;
    true
  };

}
