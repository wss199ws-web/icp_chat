import Nat "mo:base/Nat";
import Nat64 "mo:base/Nat64";
import Int "mo:base/Int";
import Int64 "mo:base/Int64";
import Principal "mo:base/Principal";
import Blob "mo:base/Blob";
import Text "mo:base/Text";
import Nat8 "mo:base/Nat8";
import Array "mo:base/Array";

import Types "./Types";

// 钱包 & ICP 相关逻辑模块
// 只负责与 Ledger / Ledger Index 交互的纯函数逻辑，
// 由 main.mo 的 actor 对外暴露 shared 接口并转调到这里。

module {

  // 主网 ICP Ledger canister（余额、转账等）
  type LedgerService = actor {
    icrc1_balance_of : shared { owner : Principal; subaccount : ?Blob } -> async Nat;
  };

  // ICP Ledger Index Canister（交易历史查询）
  // 注意：ICP Ledger 可能没有标准的 Index Canister，或者接口定义不同
  // 当前实现尝试使用 Index Canister，如果不可用则返回空结果
  // 主网 Index Canister ID: qhbym-qaaaa-aaaaa-aaafq-cai（可能不正确）
  type LedgerIndexService = actor {
    get_account_transactions : shared query {
      account : { owner : Principal; subaccount : ?Blob };
      start : ?Nat64;
      max_results : Nat64;
    } -> async {
      transactions : [{
        id : Nat64;
        transaction : {
          kind : Text;
          mint : ?{ to : { owner : Principal; subaccount : ?Blob }; amount : Nat64 };
          burn : ?{ from : { owner : Principal; subaccount : ?Blob }; amount : Nat64 };
          transfer : ?{
            from : { owner : Principal; subaccount : ?Blob };
            to : { owner : Principal; subaccount : ?Blob };
            amount : Nat64;
            fee : ?Nat64;
            memo : ?Blob;
          };
          approve : ?{ from : { owner : Principal; subaccount : ?Blob }; spender : { owner : Principal; subaccount : ?Blob }; amount : Nat64 };
        };
        timestamp : Nat64;
      }];
      oldest_tx_id : ?Nat64;
      balance : Nat64;
    };
  };

  // 获取 Ledger canister 的 actor 引用
  func ledger() : LedgerService {
    // 这里直接写主网 Ledger 的 canister id
    actor ("ryjl3-tyaaa-aaaaa-aaaba-cai");
  };

  // 获取 Ledger Index canister 的 actor 引用
  func ledgerIndex() : LedgerIndexService {
    // 主网 ICP Ledger Index Canister ID
    actor ("qhbym-qaaaa-aaaaa-aaafq-cai");
  };

  // ========== 余额查询 ==========

  // 查询某个 Principal 的 ICP 余额（单位：e8s）
  public func getIcpBalance(caller : Principal) : async Nat {
    let account = {
      owner = caller;
      subaccount = null; // 默认子账户 0
    };

    await ledger().icrc1_balance_of(account)
  };

  // ========== ICP 链上交易历史 ==========

  // 获取某个 Principal 的 ICP 交易历史（完整链上记录，分页）
  //
  // 说明：
  // - cursor: 上一页返回的 nextCursor（作为 start 参数），首次调用传 null
  // - limit: 期望返回的最大条数，后端限制最多 100 条
  //
  // 注意：当前使用 ICP Ledger Index Canister 查询，如果 Index Canister 不可用，
  // 将返回空结果。需要确保 Index Canister ID 正确且可用。
  public func getIcpTxHistory(
    caller : Principal,
    cursor : ?Nat,
    limit : Nat,
  ) : async Types.IcpTxHistoryPage {
    let account = {
      owner = caller;
      subaccount = null; // 默认子账户 0
    };

    // 限制每页最多 100 条
    let maxResults = if (limit > 100) { 100 } else { limit };
    let maxResults64 = Nat64.fromNat(maxResults);

    // cursor 转换为 start（Nat64），如果为 null 则从最新开始
    let startOpt : ?Nat64 = switch (cursor) {
      case null { null };
      case (?c) { ?Nat64.fromNat(c) };
    };

    try {
      // 调用 Ledger Index Canister 查询交易历史
      // 注意：如果 Index Canister 不存在或接口不匹配，这里会抛出错误
      let indexResult = await ledgerIndex().get_account_transactions({
        account = account;
        start = startOpt;
        max_results = maxResults64;
      });

      // 转换 Index Canister 返回的交易记录为我们的格式
      var txs : [Types.IcpTxRecord] = [];
      var nextCursorOpt : ?Nat = null;

      for (tx in indexResult.transactions.vals()) {
        switch (tx.transaction) {
          case ({ transfer = ?transferData }) {
            // 转账交易
            let fromPrincipal = Principal.toText(transferData.from.owner);
            let toPrincipal = Principal.toText(transferData.to.owner);
            
            // 判断方向：如果 from 是当前 caller，则是转出；如果 to 是当前 caller，则是转入
            let isFromCaller = Principal.equal(transferData.from.owner, caller);
            let isToCaller = Principal.equal(transferData.to.owner, caller);
            
            // 只显示与当前账户相关的交易
            if (isFromCaller or isToCaller) {
              let direction : Types.IcpTxDirection = if (isFromCaller) { #send } else { #receive };
              let memoOpt : ?Text = switch (transferData.memo) {
                case null { null };
                case (?memoBlob) {
                  // 将 Blob 转换为文本（简化处理：显示为十六进制）
                  let memoBytes = Blob.toArray(memoBlob);
                  if (memoBytes.size() == 0) {
                    null;
                  } else {
                    // 显示为十六进制字符串
                    var hexMemo = "";
                    for (byte in memoBytes.vals()) {
                      let byteVal = Nat8.toNat(byte);
                      let hex = Nat.toText(byteVal);
                      // 确保是两位十六进制
                      if (hex.size() == 1) {
                        hexMemo := hexMemo # "0" # hex;
                      } else {
                        hexMemo := hexMemo # hex;
                      };
                    };
                    ?("0x" # hexMemo);
                  };
                };
              };

              let txRecord : Types.IcpTxRecord = {
                index = Nat64.toNat(tx.id);
                from = fromPrincipal;
                to = toPrincipal;
                amount = Nat64.toNat(transferData.amount);
                timestamp = Int64.toInt(Int64.fromNat64(tx.timestamp));
                memo = memoOpt;
                direction = direction;
              };
              txs := Array.append(txs, [txRecord]);
            };
          };
          case ({ mint = ?mintData }) {
            // Mint 交易（通常是系统操作，可以忽略或特殊处理）
            // 这里暂时跳过
          };
          case ({ burn = ?burnData }) {
            // Burn 交易（销毁代币）
            // 这里暂时跳过
          };
          case ({ approve = ?approveData }) {
            // Approve 交易（授权）
            // 这里暂时跳过
          };
          case (_) {
            // 其他类型交易，跳过
          };
        };
      };

      // 设置下一页游标（使用 oldest_tx_id）
      nextCursorOpt := switch (indexResult.oldest_tx_id) {
        case null { null };
        case (?oldestId) {
          if (txs.size() >= maxResults) {
            ?Nat64.toNat(oldestId);
          } else {
            null; // 如果返回的记录数少于请求数，说明已经到底了
          };
        };
      };

      {
        txs = txs;
        nextCursor = nextCursorOpt;
      };
    } catch (e) {
      // 如果 Index Canister 查询失败，返回空结果
      {
        txs = [];
        nextCursor = null;
      };
    };
  };
}


