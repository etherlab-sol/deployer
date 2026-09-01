const STORAGE_KEY = 'etherlab_logs';

export class Logger {
  constructor(container) {
    this.container = container;
    this.entries = this._load();
    this.render();
  }

  _load() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    } catch {
      return [];
    }
  }

  _save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.entries.slice(-200)));
  }

  _formatTime() {
    return new Date().toLocaleTimeString();
  }

  log(message, type = 'info') {
    this.entries.push({ time: this._formatTime(), message, type });
    this._save();
    this.render();
  }

  clear() {
    this.entries = [];
    this._save();
    this.render();
  }

  render() {
    if (!this.container) return;
    if (this.entries.length === 0) {
      this.container.innerHTML = `
        <div class="log-entry log-info">
          <span class="log-time">--:--:--</span>
          <span class="log-msg">Welcome to EtherLab — create a .sol file or pick a template to begin.</span>
        </div>`;
      return;
    }
    this.container.innerHTML = this.entries
      .map(
        (e) =>
          `<div class="log-entry log-${e.type}"><span class="log-time">${e.time}</span><span class="log-msg">${this._escape(e.message)}</span></div>`
      )
      .join('');
    this.container.scrollTop = this.container.scrollHeight;
  }

  _escape(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
