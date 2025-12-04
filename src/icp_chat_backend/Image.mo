import Nat "mo:base/Nat";
import Text "mo:base/Text";
import Blob "mo:base/Blob";
import HashMap "mo:base/HashMap";
import Buffer "mo:base/Buffer";
import Nat8 "mo:base/Nat8";
import Result "mo:base/Result";
import Array "mo:base/Array";

import Types "./Types";

// 图片上传与存储相关逻辑模块
// - 负责图片大小校验、旧图片清理、分片上传等纯业务逻辑
// - 不直接持有 stable 状态，由 main.mo 把 HashMap 和计数器传入

module {

  public type UploadSession = Types.UploadSession;

  // ========== 内部工具函数 ==========

  // 新建上传会话
  public func newUploadSession(totalSize : Nat, mimeType : Text) : UploadSession {
    {
      buffer = Buffer.Buffer<Nat8>(Nat.min(totalSize, 1024));
      var receivedSize = 0;
      totalSize = totalSize;
      mimeType = mimeType;
    };
  };

  // 验证图片大小
  func validateImage(blob : Blob, maxImageSize : Nat) : Result.Result<Blob, Text> {
    let bytes = Blob.toArray(blob);
    let size = bytes.size();
    if (size == 0) {
      return #err("图片不能为空");
    };
    if (size > maxImageSize) {
      return #err("图片大小不能超过 " # Nat.toText(maxImageSize / 1_000_000) # "MB");
    };
    #ok(blob)
  };

  // 清理旧图片（当超过上限时）
  func cleanupOldImages(images : HashMap.HashMap<Nat, Blob>, maxImages : Nat) {
    let count = images.size();
    if (count >= maxImages) {
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

  // 存储已校验的图片，返回图片ID与新的 nextImageId
  func storeValidatedImage(
    images : HashMap.HashMap<Nat, Blob>,
    validBlob : Blob,
    nextImageId : Nat,
    maxImages : Nat,
  ) : (Nat, Nat) {
    cleanupOldImages(images, maxImages);
    let imageId = nextImageId;
    images.put(imageId, validBlob);
    let newNextId = nextImageId + 1;
    (imageId, newNextId)
  };

  // ========== 对外业务函数（返回新的计数器） ==========

  // 简单上传整张图片
  public func uploadImage(
    imageBlob : Blob,
    images : HashMap.HashMap<Nat, Blob>,
    nextImageId : Nat,
    maxImageSize : Nat,
    maxImages : Nat,
  ) : Result.Result<{ imageId : Nat; nextImageId : Nat }, Text> {
    switch (validateImage(imageBlob, maxImageSize)) {
      case (#err(msg)) {
        #err(msg);
      };
      case (#ok(validBlob)) {
        let (imageId, newNextId) = storeValidatedImage(images, validBlob, nextImageId, maxImages);
        #ok({
          imageId = imageId;
          nextImageId = newNextId;
        });
      };
    };
  };

  // 开始分片上传
  public func startImageUpload(
    totalSize : Nat,
    mimeType : Text,
    uploadSessions : HashMap.HashMap<Nat, UploadSession>,
    nextUploadId : Nat,
    maxImageSize : Nat,
  ) : Result.Result<{ uploadId : Nat; nextUploadId : Nat }, Text> {
    if (totalSize == 0) {
      return #err("图片不能为空");
    };
    if (totalSize > maxImageSize) {
      return #err("图片大小不能超过 " # Nat.toText(maxImageSize / 1_000_000) # "MB");
    };

    let uploadId = nextUploadId;
    uploadSessions.put(uploadId, newUploadSession(totalSize, mimeType));
    #ok({
      uploadId = uploadId;
      nextUploadId = nextUploadId + 1;
    });
  };

  // 上传分片
  public func uploadImageChunk(
    uploadId : Nat,
    chunk : [Nat8],
    isFinal : Bool,
    uploadSessions : HashMap.HashMap<Nat, UploadSession>,
    images : HashMap.HashMap<Nat, Blob>,
    nextImageId : Nat,
    maxImageSize : Nat,
    maxImages : Nat,
  ) : Result.Result<{ imageId : ?Nat; nextImageId : Nat }, Text> {
    switch (uploadSessions.get(uploadId)) {
      case null {
        #err("上传会话不存在或已完成");
      };
      case (?session) {
        var currentNextId = nextImageId;

        if (chunk.size() > 0) {
          for (byte in chunk.vals()) {
            session.buffer.add(byte);
          };
          session.receivedSize += chunk.size();
        };

        if (session.receivedSize > maxImageSize) {
          uploadSessions.delete(uploadId);
          return #err("图片大小超过限制");
        };

        if (isFinal) {
          uploadSessions.delete(uploadId);
          if (session.buffer.size() == 0) {
            return #err("图片数据为空");
          };

          let bytesArray = Buffer.toArray(session.buffer);
          let finalBlob = Blob.fromArray(bytesArray);
          switch (validateImage(finalBlob, maxImageSize)) {
            case (#err(msg)) {
              #err(msg);
            };
            case (#ok(validBlob)) {
              let (imageId, newNextId) = storeValidatedImage(images, validBlob, currentNextId, maxImages);
              currentNextId := newNextId;
              #ok({
                imageId = ?imageId;
                nextImageId = currentNextId;
              });
            };
          };
        } else {
          #ok({
            imageId = null;
            nextImageId = currentNextId;
          });
        };
      };
    };
  };
}


