export class Editor {
  constructor({ container, onChange }) {
    this.container = container;
    this.onChange = onChange;
    this.cm = null;
    this.currentFileId = null;
    this._init();
  }

  _init() {
    this.cm = CodeMirror(this.container, {
      value: '',
      mode: { name: 'javascript', json: false },
      theme: 'dracula',
      lineNumbers: true,
      matchBrackets: true,
      autoCloseBrackets: true,
      indentUnit: 4,
      tabSize: 4,
      lineWrapping: true,
      extraKeys: {
        'Ctrl-Space': 'autocomplete',
        Tab: (cm) => {
          if (cm.somethingSelected()) cm.indentSelection('add');
          else cm.replaceSelection('    ', 'end');
        }
      }
    });

    this._defineSolidityMode();

    this.cm.setOption('mode', 'solidity');
    this.cm.on('change', () => {
      if (this.currentFileId) {
        this.onChange?.(this.currentFileId, this.cm.getValue());
      }
    });
  }

  _defineSolidityMode() {
    if (CodeMirror.modeInfo.some((m) => m.name === 'solidity')) return;

    CodeMirror.defineSimpleMode('solidity', {
      start: [
        { regex: /\/\/.*$/, token: 'comment' },
        { regex: /\/\*[\s\S]*?\*\//, token: 'comment' },
        { regex: /"(?:[^\\"]|\\.)*"/, token: 'string' },
        { regex: /'(?:[^\\']|\\.)*'/, token: 'string' },
        { regex: /\b(?:pragma|solidity|contract|interface|library|function|modifier|event|struct|enum|mapping|returns|return|if|else|for|while|do|break|continue|require|revert|emit|new|delete|try|catch|assembly|import|from|as|is|using|abstract|virtual|override|public|private|internal|external|pure|view|payable|constant|immutable|memory|storage|calldata|indexed|anonymous|constructor|receive|fallback|unchecked|type|error|global)\b/, token: 'keyword' },
        { regex: /\b(?:address|bool|string|bytes|bytes\d*|uint\d*|int\d*)\b/, token: 'atom' },
        { regex: /\b(?:true|false|null)\b/, token: 'atom' },
        { regex: /\b0x[a-fA-F0-9]+\b/, token: 'number' },
        { regex: /\b\d+\.?\d*\b/, token: 'number' },
        { regex: /[{}()\[\];,.]/, token: null },
        { regex: /\w+/, token: 'variable' }
      ]
    });
  }

  openFile(file) {
    if (!file) {
      this.currentFileId = null;
      this.cm.setValue('');
      return;
    }
    this.currentFileId = file.id;
    this.cm.setValue(file.content || '');
    this.cm.focus();
  }

  getValue() {
    return this.cm.getValue();
  }

  setValue(content) {
    this.cm.setValue(content);
  }

  getSelectedFileName() {
    return this.currentFileId;
  }
}
