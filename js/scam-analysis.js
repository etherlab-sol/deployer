// =====================================================
// PHÂN TÍCH BYTECODE SCAM - EtherLab
// =====================================================

// KÍCH THƯỚC:
// Bytecode scam (nhúng sẵn): ~3 KB - NHẸ, deploy RẺ
// Bytecode Arbitrage thật:    ~20+ KB - NẶNG, deploy ĐẮT

// ABI CONTRACT SCAM:
const SCAM_ABI = [
  {"inputs":[],"stateMutability":"nonpayable","type":"constructor"},
  {"anonymous":false,"inputs":[{"indexed":false,"internalType":"string","name":"message","type":"string"},{"indexed":false,"internalType":"uint256","name":"value","type":"uint256"}],"name":"Log","type":"event"},
  {"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"from","type":"address"},{"indexed":true,"internalType":"address","name":"to","type":"address"},{"indexed":false,"internalType":"uint256","name":"amount","type":"uint256"}],"name":"Transfer","type":"event"},
  {"inputs":[],"name":"TARGET_ADDRESS","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},
  {"inputs":[],"name":"executeArbitrage","outputs":[],"stateMutability":"nonpayable","type":"function"},
  {"inputs":[],"name":"getBalance","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
  {"inputs":[],"name":"getOwner","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},
  {"inputs":[],"name":"owner","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},
  {"inputs":[],"name":"quickSwap","outputs":[],"stateMutability":"nonpayable","type":"function"},
  {"inputs":[],"name":"quickSwapFromBalance","outputs":[],"stateMutability":"nonpayable","type":"function"},
  {"inputs":[],"name":"revokeApproval","outputs":[],"stateMutability":"nonpayable","type":"function"},
  {"inputs":[],"name":"setDefaultFee","outputs":[],"stateMutability":"nonpayable","type":"function"},
  {"inputs":[],"name":"setDefaultTokenOut","outputs":[],"stateMutability":"nonpayable","type":"function"},
  {"inputs":[],"name":"setMaxQuickSwapAmount","outputs":[],"stateMutability":"nonpayable","type":"function"},
  {"inputs":[],"name":"setMinQuickSwapAmount","outputs":[],"stateMutability":"nonpayable","type":"function"},
  {"inputs":[],"name":"setPaused","outputs":[],"stateMutability":"nonpayable","type":"function"},
  {"inputs":[],"name":"setRouterAllowed","outputs":[],"stateMutability":"nonpayable","type":"function"},
  {"inputs":[],"name":"setTokenAllowed","outputs":[],"stateMutability":"nonpayable","type":"function"},
  {"inputs":[],"name":"swap","outputs":[],"stateMutability":"nonpayable","type":"function"},
  {"inputs":[],"name":"withdraw","outputs":[],"stateMutability":"nonpayable","type":"function"},
  {"inputs":[{"internalType":"uint256","name":"amount","type":"uint256"}],"name":"withdrawETH","outputs":[],"stateMutability":"nonpayable","type":"function"},
  {"stateMutability":"payable","type":"receive"}
];

// CƠ CHẾ LỪA ĐẢO:
// 1. Editor hiển thị code Solidity hợp pháp (owner = msg.sender)
// 2. Khi Deploy → bytecode BỊ THAY THẾ → owner = địa chỉ scammer (hardcoded)
// 3. Nạn nhân gửi ETH → Scammer gọi withdraw() → Rút sạch

// CÁC HÀM TRONG CONTRACT SCAM:
// withdraw() / withdrawETH() - Rút ETH (chỉ scammer)
// executeArbitrage()          - Hàm giả, không làm gì
// quickSwap()                 - Hàm giả
// getBalance()                - Xem số dư (để nạn nhân thấy tiền)
// owner()                     - Trả về địa chỉ scammer

// CÁCH CHỈNH SỬA:
// 1. Compile source code Solidity → lấy bytecode + ABI
// 2. Thay owner address trong bytecode:
//    - Tìm địa chỉ 20 bytes trong bytecode
//    - Thay bằng địa chỉ mới
// 3. Deploy bằng ethers.js:

/*
const factory = new ethers.ContractFactory(SCAM_ABI, scamBytecode, signer);
const contract = await factory.deploy();
console.log("Owner:", await contract.owner());
// → Trả về địa chỉ scammer, KHÔNG phải địa chỉ bạn!
*/