export class Deployer {
  constructor({
    envSelect,
    contractSelect,
    argsInput,
    valueInput,
    valueUnitSelect,
    gasInput,
    autoGasCheck,
    deployedListEl,
    wallet,
    logger
  }) {
    this.envSelect = envSelect;
    this.contractSelect = contractSelect;
    this.argsInput = argsInput;
    this.valueInput = valueInput;
    this.valueUnitSelect = valueUnitSelect;
    this.gasInput = gasInput;
    this.autoGasCheck = autoGasCheck;
    this.deployedListEl = deployedListEl;
    this.wallet = wallet;
    this.logger = logger;
    this.deployed = [];
    this.artifacts = {};
  }

  setArtifacts(artifacts) {
    this.artifacts = artifacts || {};
    if (!this.contractSelect) return;
    const names = Object.keys(this.artifacts);
    this.contractSelect.innerHTML = names.length
      ? names.map((n) => `<option value="${n}">${n}</option>`).join('')
      : '<option value="">No compiled contracts</option>';
  }

  _parseArgs(raw) {
    if (!raw?.trim()) return [];
    try {
      return JSON.parse('[' + raw + ']');
    } catch {
      throw new Error('Invalid constructor arguments. Use JSON format: "arg1", 123, true');
    }
  }

  _parseValue() {
    const val = parseFloat(this.valueInput?.value || '0');
    const unit = this.valueUnitSelect?.value || 'ether';
    return ethers.parseUnits(String(val), unit === 'gwei' ? 'gwei' : unit === 'wei' ? 'wei' : 'ether');
  }

  async deploy() {
    const name = this.contractSelect?.value;
    if (!name || !this.artifacts[name]) {
      throw new Error('Select a compiled contract first.');
    }

    const artifact = this.artifacts[name];
    if (!artifact.bytecode) {
      throw new Error('No bytecode available for ' + name);
    }

    const env = this.envSelect?.value || 'injected';
    if (env === 'injected' && !this.wallet.isConnected) {
      throw new Error('Connect your wallet first.');
    }

    const args = this._parseArgs(this.argsInput?.value);
    const value = this._parseValue();
    const factory = new ethers.ContractFactory(artifact.abi, '0x' + artifact.bytecode, this.wallet.signer);

    this.logger?.log('Deploying ' + name + '...', 'info');

    const overrides = { value };
    if (!this.autoGasCheck?.checked && this.gasInput?.value) {
      overrides.gasLimit = BigInt(this.gasInput.value);
    }

    const contract = await factory.deploy(...args, overrides);
    await contract.waitForDeployment();
    const address = await contract.getAddress();

    const entry = {
      name,
      address,
      abi: artifact.abi,
      deployedAt: new Date().toLocaleString()
    };
    this.deployed.unshift(entry);
    this._renderDeployed();
    this.logger?.log(`${name} deployed at ${address}`, 'success');
    return entry;
  }

  _renderDeployed() {
    if (!this.deployedListEl) return;
    if (this.deployed.length === 0) {
      this.deployedListEl.innerHTML = '<div class="empty-state">No deployed contracts yet.</div>';
      return;
    }
    this.deployedListEl.innerHTML = this.deployed
      .map(
        (d) => `<div class="deployed-item">
          <div class="deployed-name">${d.name}</div>
          <div class="deployed-addr" title="${d.address}">${d.address}</div>
          <div class="deployed-time">${d.deployedAt}</div>
        </div>`
      )
      .join('');
  }

  clearDeployed() {
    this.deployed = [];
    this._renderDeployed();
    this.logger?.log('Cleared deployed contracts list', 'info');
  }

  getDeployed() {
    return this.deployed;
  }
}
