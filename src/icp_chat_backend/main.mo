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

// 去掉 persistent / transient，用普通 actor 即可
actor ICPChat {

  // 配置常量
  private let MAX_MESSAGE_LENGTH : Nat = 1000; // 单条消息最大长度
  private let MAX_MESSAGES : Nat = 10000;      // 最大消息数量
  private let DEFAULT_PAGE_SIZE : Nat = 50;    // 默认分页大小
  private let MAX_IMAGE_SIZE : Nat = 2_000_000; // 单张图片最大大小（2MB）
  private let MAX_IMAGES : Nat = 1000;         // 最大图片数量

  public type Message = {
    id : Nat;
    author : Text;
    text : Text;
    timestamp : Int;
    imageId : ?Nat; // 图片ID，如果有图片则不为null
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
  stable var nextImageId : Nat = 0;
  
  // 图片存储：使用 HashMap 存储图片数据
  // 注意：HashMap 不能直接 stable，需要序列化/反序列化
  var images : HashMap.HashMap<Nat, Blob> = HashMap.HashMap<Nat, Blob>(0, Nat.equal, Hash.hash);
  
  // 将 HashMap 转换为数组用于序列化
  private func imagesToArray() : [(Nat, Blob)] {
    var arr : [(Nat, Blob)] = [];
    for ((id, blob) in images.entries()) {
      arr := Array.append(arr, [(id, blob)]);
    };
    arr
  };
  
  // 从数组恢复 HashMap
  private func imagesFromArray(arr : [(Nat, Blob)]) {
    images := HashMap.HashMap<Nat, Blob>(0, Nat.equal, Hash.hash);
    for ((id, blob) in arr.vals()) {
      images.put(id, blob);
    };
  };
  
  // Stable 存储图片数组
  stable var imagesStable : [(Nat, Blob)] = [];
  
  // 系统升级时恢复图片数据
  system func preupgrade() {
    imagesStable := imagesToArray();
  };
  
  system func postupgrade() {
    imagesFromArray(imagesStable);
    imagesStable := []; // 清理临时存储
  };

  // 验证消息文本（这里简单用非空 + 长度限制，避免 trim 的版本差异问题）
  private func validateMessage(text : Text, imageId : ?Nat) : Result.Result<Text, Text> {
    // 如果既没有文本也没有图片，则返回错误
    if (Text.size(text) == 0 and imageId == null) {
      return #err("消息内容不能为空");
    };
    if (Text.size(text) > MAX_MESSAGE_LENGTH) {
      return #err("消息长度不能超过 " # Nat.toText(MAX_MESSAGE_LENGTH) # " 个字符");
    };
    #ok(text)
  };
  
  // 验证图片大小
  private func validateImage(blob : Blob) : Result.Result<Blob, Text> {
    let bytes = Blob.toArray(blob);
    let size = bytes.size();
    if (size == 0) {
      return #err("图片不能为空");
    };
    if (size > MAX_IMAGE_SIZE) {
      return #err("图片大小不能超过 " # Nat.toText(MAX_IMAGE_SIZE / 1_000_000) # "MB");
    };
    #ok(blob)
  };
  
  // 清理旧图片（当超过上限时）
  private func cleanupOldImages() {
    let count = images.size();
    if (count >= MAX_IMAGES) {
      // 删除最旧的图片（这里简化处理，删除前100张）
      let deleteCount : Nat = 100;
      var deleted : Nat = 0;
      var keysToDelete : [Nat] = [];
      for ((id, _) in images.entries()) {
        if (deleted < deleteCount) {
          keysToDelete := Array.append(keysToDelete, [id]);
          deleted += 1;
        };
      };
      for (id in keysToDelete.vals()) {
        images.delete(id);
      };
    };
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

  // 上传图片
  public shared ({ caller }) func uploadImage(imageBlob : Blob) : async Result.Result<Nat, Text> {
    switch (validateImage(imageBlob)) {
      case (#err(msg)) {
        return #err(msg);
      };
      case (#ok(validBlob)) {
        // 清理旧图片（如果需要）
        cleanupOldImages();
        
        let imageId = nextImageId;
        images.put(imageId, validBlob);
        nextImageId += 1;
        
        #ok(imageId)
      };
    };
  };
  
  // 获取图片
  public query func getImage(imageId : Nat) : async ?Blob {
    images.get(imageId)
  };
  
  // 发送消息（带验证）
  public shared ({ caller }) func sendMessage(text : Text, imageId : ?Nat) : async SendMessageResult {
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
    
    switch (validateMessage(text, imageId)) {
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
          imageId = imageId;
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
