export class Wallet {
  constructor({ accountEl, logger }) {
    this.accountEl = accountEl;
    this.logger = logger;
    this.provider = null;
    this.signer = null;
    this.address = null;
    this.chainId = null;
  }

  get isConnected() {
    return !!this.address;
  }

  async connect() {
    if (!window.ethereum) {
      throw new Error('No Web3 wallet found. Install MetaMask or another browser wallet.');
    }

    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
    this.provider = new ethers.BrowserProvider(window.ethereum);
    this.signer = await this.provider.getSigner();
    this.address = accounts[0];
    const network = await this.provider.getNetwork();
    this.chainId = Number(network.chainId);

    window.ethereum.on('accountsChanged', (accs) => {
      this.address = accs[0] || null;
      if (!this.address) this.disconnect();
      this._updateUI();
    });

    window.ethereum.on('chainChanged', () => window.location.reload());

    this._updateUI();
    this.logger?.log('Wallet connected: ' + this._short(this.address), 'success');
    return this.address;
  }

  disconnect() {
    this.provider = null;
    this.signer = null;
    this.address = null;
    this.chainId = null;
    this._updateUI();
    this.logger?.log('Wallet disconnected', 'info');
  }

  _short(addr) {
    return addr ? addr.slice(0, 6) + '...' + addr.slice(-4) : '—';
  }

  _updateUI() {
    if (this.accountEl) {
      this.accountEl.textContent = this.address ? this._short(this.address) : 'Not connected';
      this.accountEl.title = this.address || '';
    }
  }

  async getBalance() {
    if (!this.provider || !this.address) return '0';
    const bal = await this.provider.getBalance(this.address);
    return ethers.formatEther(bal);
  }
}
