export class BotAutomation {
  constructor({ wallet, deployer, logger }) {
    this.wallet = wallet;
    this.deployer = deployer;
    this.logger = logger;
    
    this.state = {
      running: false,
      timer: null,
      simTimer: null,
      attempts: 0,
      trades: 0,
      cooldownUntil: 0
    };

    this.scannerState = {
      running: false,
      ws: null,
      subId: null,
      count: 0,
      lastSwapAt: 0,
      lastSwapByPool: {}
    };

    this._bindElements();
    this._bindEvents();
  }

  _bindElements() {
    const $ = (sel) => document.querySelector(sel);
    this.els = {
      connectBtn: $('#botConnectWalletBtn'),
      disconnectBtn: $('#botDisconnectWalletBtn'),
      walletStatus: $('#botWalletStatusLabel'),
      accountSelect: $('#botAccountSelect'),
      accountBalance: $('#botAccountBalance'),
      accountBalanceValue: $('#botAccountBalanceValue'),
      contractSelect: $('#botContractSelect'),
      contractBalance: $('#botContractBalance'),
      contractBalanceValue: $('#botContractBalanceValue'),
      functionSelect: $('#botPrimaryFunctionSelect'),
      functionList: $('#botFunctionList'),
      interval: $('#botInterval'),
      maxGasPrice: $('#botMaxGasPrice'),
      cooldown: $('#botCooldown'),
      requireScanGate: $('#botRequireScanGate'),
      scanGateOptions: $('#botScanGateOptions'),
      scanGateWindow: $('#botScanGateWindow'),
      scanGateTargetPool: $('#botScanGateTargetPool'),
      toggleBtn: $('#botToggleBtn'),
      statusLine: $('#botStatusLine'),
      scannerStatusLine: $('#scannerStatusLine')
    };
  }

  _bindEvents() {
    this.els.connectBtn?.addEventListener('click', async () => {
      await this.wallet.connect();
      this.updateWalletUI();
    });
    this.els.disconnectBtn?.addEventListener('click', () => {
      this.wallet.disconnect();
      this.updateWalletUI();
    });

    this.els.accountSelect?.addEventListener('change', () => this.refreshAccountBalance());
    this.els.contractSelect?.addEventListener('change', () => {
      this.populateFunctions();
      this.refreshContractBalance();
    });

    this.els.requireScanGate?.addEventListener('change', (e) => {
      this.els.scanGateOptions.style.display = e.target.checked ? 'block' : 'none';
    });

    this.els.toggleBtn?.addEventListener('click', () => {
      if (this.state.running) this.stopBot();
      else this.startBot();
    });

    // We can hook into the wallet's connect events if wallet exposes them, 
    // or just listen to global tab switches to refresh UI.
    const automationTabBtn = document.querySelector('.activity-btn[data-panel="automation"]');
    automationTabBtn?.addEventListener('click', () => {
      this.updateWalletUI();
      this.populateContracts();
    });

    // Hook into wallet updates
    const origUpdate = this.wallet._updateUI.bind(this.wallet);
    this.wallet._updateUI = () => {
      origUpdate();
      this.updateWalletUI();
    };
  }

  updateWalletUI() {
    if (this.wallet.provider && this.wallet.address) {
      this.els.walletStatus.textContent = 'Connected: ' + this.wallet.address.slice(0, 6) + '...';
      this.els.connectBtn.style.display = 'none';
      this.els.disconnectBtn.style.display = 'inline-block';
      this.els.accountSelect.innerHTML = `<option value="${this.wallet.address}">${this.wallet.address}</option>`;
      this.refreshAccountBalance();
    } else {
      this.els.walletStatus.textContent = 'Not connected';
      this.els.connectBtn.style.display = 'inline-block';
      this.els.disconnectBtn.style.display = 'none';
      this.els.accountSelect.innerHTML = `<option value="">No account connected</option>`;
      this.els.accountBalance.style.display = 'none';
    }
  }

  async refreshAccountBalance() {
    const acc = this.els.accountSelect.value;
    if (!acc || !this.wallet.provider) return;
    this.els.accountBalance.style.display = 'flex';
    this.els.accountBalanceValue.textContent = '...';
    try {
      const bal = await this.wallet.provider.getBalance(acc);
      const formatted = Number(ethers.formatEther(bal)).toFixed(4) + ' ETH';
      this.els.accountBalanceValue.textContent = formatted;
    } catch {
      this.els.accountBalanceValue.textContent = '?';
    }
  }

  populateContracts() {
    const deployed = this.deployer.deployed || [];
    if (!deployed.length) {
      this.els.contractSelect.innerHTML = '<option value="">No deployed contracts</option>';
      this.els.contractBalance.style.display = 'none';
      this.els.functionSelect.innerHTML = '<option value="">—</option>';
      this.els.functionList.innerHTML = '';
      return;
    }
    const currentVal = this.els.contractSelect.value;
    this.els.contractSelect.innerHTML = deployed.map((c, i) => 
      `<option value="${i}">${c.name} (${c.address.slice(0,6)}...)</option>`
    ).join('');
    
    if (currentVal && deployed[currentVal]) {
      this.els.contractSelect.value = currentVal;
    } else {
      this.els.contractSelect.selectedIndex = 0;
    }
    
    this.populateFunctions();
    this.refreshContractBalance();
  }

  async refreshContractBalance() {
    const idx = this.els.contractSelect.value;
    const deployed = this.deployer.deployed || [];
    const entry = deployed[idx];
    if (!entry || !this.wallet.provider) {
      this.els.contractBalance.style.display = 'none';
      return;
    }
    this.els.contractBalance.style.display = 'flex';
    this.els.contractBalanceValue.textContent = '...';
    try {
      const bal = await this.wallet.provider.getBalance(entry.address);
      const formatted = Number(ethers.formatEther(bal)).toFixed(4) + ' ETH';
      this.els.contractBalanceValue.textContent = formatted;
    } catch {
      this.els.contractBalanceValue.textContent = '?';
    }
  }

  populateFunctions() {
    const idx = this.els.contractSelect.value;
    const deployed = this.deployer.deployed || [];
    const entry = deployed[idx];
    if (!entry) {
      this.els.functionSelect.innerHTML = '<option value="">—</option>';
      this.els.functionList.innerHTML = '';
      return;
    }
    
    const writeFns = entry.abi.filter(f => f.type === 'function' && f.stateMutability !== 'view' && f.stateMutability !== 'pure');
    if (!writeFns.length) {
      this.els.functionSelect.innerHTML = '<option value="">No writable functions</option>';
      this.els.functionList.innerHTML = '';
      return;
    }
    
    this.els.functionSelect.innerHTML = writeFns.map(f => 
      `<option value="${f.name}">${f.name}(${f.inputs.map(i => i.type).join(',')})</option>`
    ).join('');

    this.els.functionList.innerHTML = writeFns.map(f => 
      `<label class="checkbox-label" style="display:flex; align-items:center;">
         <input type="checkbox" value="${f.name}" checked>
         <span style="margin-left:8px;">${f.name}</span>
       </label>`
    ).join('');
  }

  setStatus(text) {
    if (this.els.statusLine) this.els.statusLine.textContent = text;
  }

  setScannerStatus(text) {
    if (this.els.scannerStatusLine) {
      this.els.scannerStatusLine.textContent = text || 
        `${this.scannerState.running ? 'Running' : 'Stopped'}. Swaps detected: ${this.scannerState.count}.`;
    }
  }

  startBot() {
    if (this.state.running) return;
    const idx = this.els.contractSelect.value;
    const deployed = this.deployer.deployed || [];
    if (!deployed[idx] || !this.els.functionSelect.value) {
      this.logger.log('[Bot] Select a contract and a function to execute.', 'error');
      return;
    }
    
    this.state.running = true;
    this.state.attempts = 0;
    this.state.trades = 0;
    this.state.cooldownUntil = 0;
    
    this.els.toggleBtn.textContent = 'Stop Bot';
    this.els.toggleBtn.classList.remove('primary');
    this.els.toggleBtn.classList.add('danger');
    
    this.logger.log('[Bot] Automation started.', 'success');
    
    const intervalSec = Math.max(3, parseFloat(this.els.interval.value) || 15);
    this.tick();
    this.state.timer = setInterval(() => this.tick(), intervalSec * 1000);
    
    this.startScanner();
  }

  stopBot() {
    if (!this.state.running) return;
    this.state.running = false;
    clearInterval(this.state.timer);
    
    this.els.toggleBtn.textContent = 'Start Bot';
    this.els.toggleBtn.classList.remove('danger');
    this.els.toggleBtn.classList.add('primary');
    
    this.setStatus(`Stopped. Attempts: ${this.state.attempts}, trades: ${this.state.trades}.`);
    this.logger.log('[Bot] Automation stopped.', 'info');
    
    this.stopScanner();
  }

  async tick() {
    this.state.attempts++;
    
    if (!this.wallet.provider) {
      this.setStatus(`Wallet not connected. Attempts: ${this.state.attempts}, trades: ${this.state.trades}.`);
      return;
    }

    const entry = (this.deployer.deployed || [])[this.els.contractSelect.value];
    const primaryFnName = this.els.functionSelect.value;
    const primaryFn = entry?.abi.find(f => f.name === primaryFnName);
    
    if (!entry || !primaryFn) {
       this.setStatus(`Select a contract and a function. Attempts: ${this.state.attempts}, trades: ${this.state.trades}.`);
       return;
    }

    if (Date.now() < this.state.cooldownUntil) {
       const secLeft = Math.ceil((this.state.cooldownUntil - Date.now()) / 1000);
       this.setStatus(`Cooldown: ${secLeft} sec left. Attempts: ${this.state.attempts}, trades: ${this.state.trades}.`);
       return;
    }

    if (this.els.requireScanGate.checked) {
       if (!this.scannerState.running) {
          this.setStatus(`Scanner gate enabled but scanner not running. Attempts: ${this.state.attempts}, trades: ${this.state.trades}.`);
          return;
       }
       const windowSec = Math.max(1, parseFloat(this.els.scanGateWindow.value) || 30);
       const targetPool = (this.els.scanGateTargetPool.value || '').trim().toLowerCase();
       const lastSwap = targetPool ? (this.scannerState.lastSwapByPool[targetPool] || 0) : this.scannerState.lastSwapAt;
       
       if (Date.now() - lastSwap > windowSec * 1000) {
          this.setStatus(`No recent scanner activity — skipping. Attempts: ${this.state.attempts}, trades: ${this.state.trades}.`);
          return;
       }
    }

    const maxGasGwei = parseFloat(this.els.maxGasPrice.value) || 50;
    const maxGasWei = ethers.parseUnits(String(maxGasGwei), 'gwei');

    try {
      const feeData = await this.wallet.provider.getFeeData();
      if (feeData.gasPrice && feeData.gasPrice > maxGasWei) {
         this.setStatus(`Gas price above limit (${maxGasGwei} Gwei). Attempts: ${this.state.attempts}, trades: ${this.state.trades}.`);
         return;
      }

      // get selected watch functions
      const checkboxes = Array.from(this.els.functionList.querySelectorAll('input:checked'));
      const watchNames = checkboxes.map(cb => cb.value).filter(n => n !== primaryFnName);
      const watchFns = entry.abi.filter(f => watchNames.includes(f.name));

      // dry run watch fns
      for (const fn of watchFns) {
         await this.attemptWatch(entry, fn);
      }
      
      const sent = await this.attemptExecute(entry, primaryFn, maxGasWei);
      if (sent) {
         this.state.trades++;
         const cooldown = parseFloat(this.els.cooldown.value) || 0;
         this.state.cooldownUntil = Date.now() + cooldown * 1000;
         this.refreshAccountBalance();
         this.refreshContractBalance();
      }
    } catch (e) {
      this.logger.log(`[Bot] Check failed: ${e.message}`, 'error');
    }

    this.setStatus(`${this.state.running ? 'Running' : 'Stopped'}. Attempts: ${this.state.attempts}, trades: ${this.state.trades}.`);
  }

  async attemptWatch(entry, fn) {
    try {
      const contract = new ethers.Contract(entry.address, entry.abi, this.wallet.provider);
      // Try to estimate gas
      await contract[fn.name].estimateGas();
      this.logger.log(`[Bot][Watch] "${fn.name}": opportunity detected (dry-run).`, 'info');
      return true;
    } catch (e) {
      // expected to fail if no opportunity
      return false;
    }
  }

  async attemptExecute(entry, fn, maxGasWei) {
    try {
      const signer = await this.wallet.provider.getSigner();
      const contract = new ethers.Contract(entry.address, entry.abi, signer);
      const estimatedGas = await contract[fn.name].estimateGas();
      
      const gasLimit = (estimatedGas * 120n) / 100n; // 20% buffer
      
      this.logger.log(`[Bot] "${fn.name}": opportunity found, sending tx.`, 'info');
      
      const tx = await contract[fn.name]({ gasLimit, maxFeePerGas: maxGasWei });
      this.logger.log(`[Bot] "${fn.name}": tx sent ${tx.hash}`, 'success');
      return true;
    } catch (e) {
      // expected to fail frequently
      return false;
    }
  }

  // --- Scanner ---
  startScanner() {
    if (this.scannerState.running) return;
    this.scannerState.running = true;
    this.scannerState.count = 0;
    this.scannerState.lastSwapAt = 0;
    this.scannerState.lastSwapByPool = {};
    
    this.setScannerStatus('Connecting...');
    
    try {
      this.scannerState.ws = new WebSocket('wss://eth.drpc.org');
      
      this.scannerState.ws.onopen = () => {
         this.logger.log('[Scanner] Connected. Watching for swaps...', 'success');
         const V2_TOPIC = '0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822';
         const V3_TOPIC = '0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67';
         this.scannerState.ws.send(JSON.stringify({
            jsonrpc: '2.0', id: 1, method: 'eth_subscribe',
            params: ['logs', { topics: [[V2_TOPIC, V3_TOPIC]] }]
         }));
      };
      
      this.scannerState.ws.onmessage = (ev) => {
         try {
           const msg = JSON.parse(ev.data);
           if (msg.id === 1) {
             this.scannerState.subId = msg.result;
             this.setScannerStatus();
             return;
           }
           if (msg.method === 'eth_subscription' && msg.params?.result) {
             const log = msg.params.result;
             this.scannerState.count++;
             this.scannerState.lastSwapAt = Date.now();
             if (log.address) this.scannerState.lastSwapByPool[log.address.toLowerCase()] = Date.now();
             
             const isV3 = log.topics[0] === '0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67';
             this.logger.log(`[Scanner] ${isV3 ? 'V3' : 'V2'} swap at pool ${log.address.slice(0,8)}... tx: ${log.transactionHash.slice(0,8)}...`, 'info');
             this.setScannerStatus();
           }
         } catch {}
      };
      
      this.scannerState.ws.onerror = () => {
         this.logger.log('[Scanner] WebSocket error', 'error');
      };
      
      this.scannerState.ws.onclose = () => {
         if (this.scannerState.running) {
            this.logger.log('[Scanner] Reconnecting...', 'info');
            this.scannerState.running = false;
            setTimeout(() => this.startScanner(), 3000);
         }
      }
    } catch (e) {
      this.logger.log(`[Scanner] Error: ${e.message}`, 'error');
    }
  }

  stopScanner() {
    this.scannerState.running = false;
    if (this.scannerState.ws) {
       this.scannerState.ws.close();
       this.scannerState.ws = null;
    }
    this.setScannerStatus();
    this.logger.log('[Scanner] Stopped', 'info');
  }
}
