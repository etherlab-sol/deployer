const STORAGE_KEY = 'etherlab_files';

function defaultTree() {
  return {
    id: 'root',
    name: 'contracts',
    type: 'folder',
    children: [
      {
        id: 'welcome',
        name: 'Welcome.sol',
        type: 'file',
        content: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title Welcome — your first EtherLab contract
contract Welcome {
    string public message = "Hello from EtherLab!";

    function setMessage(string calldata newMessage) external {
        message = newMessage;
    }
}
`
      }
    ]
  };
}

function uid() {
  return 'f_' + Math.random().toString(36).slice(2, 10);
}

function findNode(tree, id, parent = null) {
  if (tree.id === id) return { node: tree, parent };
  if (tree.type === 'folder' && tree.children) {
    for (const child of tree.children) {
      const found = findNode(child, id, tree);
      if (found) return found;
    }
  }
  return null;
}

export class FileManager {
  constructor({ treeEl, onSelect, onChange, logger }) {
    this.treeEl = treeEl;
    this.onSelect = onSelect;
    this.onChange = onChange;
    this.logger = logger;
    this.tree = this._load();
    this.activeId = this.tree.children?.[0]?.id || null;
    this.render();
    if (this.activeId) this.select(this.activeId);
  }

  _load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : defaultTree();
    } catch {
      return defaultTree();
    }
  }

  _save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.tree));
    this.onChange?.(this.tree);
  }

  getActiveFile() {
    if (!this.activeId) return null;
    const found = findNode(this.tree, this.activeId);
    return found?.node?.type === 'file' ? found.node : null;
  }

  getAllFiles() {
    const files = [];
    const walk = (node, path = '') => {
      if (node.type === 'file') {
        files.push({ id: node.id, name: node.name, path: path + node.name, content: node.content || '' });
      } else if (node.children) {
        const prefix = path + node.name + '/';
        node.children.forEach((c) => walk(c, prefix));
      }
    };
    walk(this.tree);
    return files;
  }

  select(id) {
    const found = findNode(this.tree, id);
    if (!found || found.node.type !== 'file') return;
    this.activeId = id;
    this.render();
    this.onSelect?.(found.node);
  }

  updateContent(id, content) {
    const found = findNode(this.tree, id);
    if (!found || found.node.type !== 'file') return;
    found.node.content = content;
    this._save();
  }

  createFile(name, content = '// SPDX-License-Identifier: MIT\npragma solidity ^0.8.20;\n\n') {
    const folder = this._targetFolder();
    if (!folder.children) folder.children = [];
    const fileName = name.endsWith('.sol') ? name : name + '.sol';
    const node = { id: uid(), name: fileName, type: 'file', content };
    folder.children.push(node);
    this._save();
    this.render();
    this.select(node.id);
    this.logger?.log(`Created file: ${fileName}`, 'success');
    return node;
  }

  createFolder(name) {
    const folder = this._targetFolder();
    if (!folder.children) folder.children = [];
    const node = { id: uid(), name, type: 'folder', children: [] };
    folder.children.push(node);
    this._save();
    this.render();
    this.logger?.log(`Created folder: ${name}`, 'success');
    return node;
  }

  _targetFolder() {
    if (!this.activeId) return this.tree;
    const found = findNode(this.tree, this.activeId);
    if (!found) return this.tree;
    if (found.node.type === 'folder') return found.node;
    return found.parent || this.tree;
  }

  rename(id, newName) {
    const found = findNode(this.tree, id);
    if (!found) return;
    found.node.name = found.node.type === 'file' && !newName.endsWith('.sol') ? newName + '.sol' : newName;
    this._save();
    this.render();
    this.logger?.log(`Renamed to: ${found.node.name}`, 'info');
  }

  delete(id) {
    const found = findNode(this.tree, id);
    if (!found || !found.parent?.children) return;
    found.parent.children = found.parent.children.filter((c) => c.id !== id);
    if (this.activeId === id) {
      const next = this.getAllFiles()[0];
      this.activeId = next?.id || null;
      if (next) this.onSelect?.(next);
    }
    this._save();
    this.render();
    this.logger?.log('File deleted', 'warn');
  }

  importFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
      this.createFile(file.name, reader.result);
    };
    reader.readAsText(file);
  }

  download(id) {
    const found = findNode(this.tree, id);
    if (!found || found.node.type !== 'file') return;
    const blob = new Blob([found.node.content || ''], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = found.node.name;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  render() {
    if (!this.treeEl) return;
    const renderNode = (node, depth = 0) => {
      const pad = depth * 14;
      if (node.type === 'folder') {
        const children = (node.children || [])
          .map((c) => renderNode(c, depth + 1))
          .join('');
        return `<div class="tree-folder" style="padding-left:${pad}px">
          <span class="tree-icon">📁</span><span class="tree-label">${node.name}</span>
          ${children}
        </div>`;
      }
      const active = node.id === this.activeId ? ' active' : '';
      return `<div class="tree-file${active}" style="padding-left:${pad}px" data-id="${node.id}">
        <span class="tree-icon">📄</span><span class="tree-label">${node.name}</span>
      </div>`;
    };

    const html = (this.tree.children || []).map((c) => renderNode(c, 0)).join('');
    this.treeEl.innerHTML = html || '<div class="tree-empty">No files yet.</div>';

    this.treeEl.querySelectorAll('.tree-file').forEach((el) => {
      el.addEventListener('click', () => this.select(el.dataset.id));
    });
  }
}
