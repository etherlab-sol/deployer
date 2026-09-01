const COMPILER_VERSIONS = [
  '0.8.28', '0.8.27', '0.8.26', '0.8.25', '0.8.24', '0.8.23', '0.8.22',
  '0.8.21', '0.8.20', '0.8.19', '0.8.18', '0.8.17', '0.8.16', '0.8.15',
  '0.8.14', '0.8.13', '0.8.12', '0.8.11', '0.8.10', '0.8.9', '0.8.8',
  '0.8.7', '0.8.6', '0.8.5', '0.8.4', '0.8.3', '0.8.2', '0.8.1', '0.8.0'
];

let solcInstance = null;
let loadedVersion = null;

async function loadSolc(version) {
  if (solcInstance && loadedVersion === version) return solcInstance;

  if (version === '0.8.20' && typeof Module !== 'undefined' && Module.cwrap) {
    solcInstance = Module;
    loadedVersion = version;
    return solcInstance;
  }

  const url = `https://binaries.soliditylang.org/bin/soljson-v${version}+commit.${getCommitHash(version)}.js`;
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = url;
    script.onload = () => {
      if (typeof Module !== 'undefined' && Module.cwrap) {
        solcInstance = Module;
        loadedVersion = version;
        resolve(solcInstance);
      } else {
        reject(new Error('Failed to load solc for ' + version));
      }
    };
    script.onerror = () => reject(new Error('Compiler not found: ' + version + '. Try 0.8.20.'));
    document.head.appendChild(script);
  });
}

function getCommitHash(version) {
  const hashes = {
    '0.8.20': 'a1b79de6',
    '0.8.21': 'd9974bed',
    '0.8.22': 'bf3fa161',
    '0.8.23': 'f704f362',
    '0.8.24': 'e11b9ed9',
    '0.8.25': 'b61f2d78',
    '0.8.26': '8a97fa7a',
    '0.8.27': '40a861a0',
    '0.8.28': '7893614d'
  };
  return hashes[version] || 'a1b79de6';
}

export class Compiler {
  constructor({ versionSelect, fileSelect, optimizeCheck, runsInput, outputEl, logger }) {
    this.versionSelect = versionSelect;
    this.fileSelect = fileSelect;
    this.optimizeCheck = optimizeCheck;
    this.runsInput = runsInput;
    this.outputEl = outputEl;
    this.logger = logger;
    this.artifacts = {};
    this._populateVersions();
  }

  _populateVersions() {
    if (!this.versionSelect) return;
    this.versionSelect.innerHTML = COMPILER_VERSIONS.map(
      (v) => `<option value="${v}"${v === '0.8.20' ? ' selected' : ''}>${v}</option>`
    ).join('');
  }

  updateFileList(files) {
    if (!this.fileSelect) return;
    this.fileSelect.innerHTML = files
      .map((f) => `<option value="${f.id}">${f.path}</option>`)
      .join('');
  }

  async compile(allFiles, mainFileId) {
    const version = this.versionSelect?.value || '0.8.20';
    const optimize = this.optimizeCheck?.checked ?? true;
    const runs = parseInt(this.runsInput?.value || '200', 10);

    if (!mainFileId) {
      this._showOutput('Select a file to compile.', 'error');
      return null;
    }

    const mainFile = allFiles.find((f) => f.id === mainFileId);
    if (!mainFile) {
      this._showOutput('Main file not found.', 'error');
      return null;
    }

    this._showOutput('Loading compiler v' + version + '...', 'info');
    this.logger?.log('Compiling ' + mainFile.path + ' with solc ' + version, 'info');

    try {
      const solc = await loadSolc(version);
      const input = this._buildInput(allFiles, mainFile.name, optimize, runs);
      const compile = solc.cwrap('solidity_compile', 'string', ['string', 'number']);
      const output = JSON.parse(compile(JSON.stringify(input), 0));

      if (output.errors?.some((e) => e.severity === 'error')) {
        const errors = output.errors.map((e) => e.formattedMessage || e.message).join('\n');
        this._showOutput(errors, 'error');
        this.logger?.log('Compilation failed', 'error');
        this.artifacts = {};
        return null;
      }

      this.artifacts = {};
      const contracts = output.contracts?.[mainFile.name] || {};
      for (const [name, data] of Object.entries(contracts)) {
        this.artifacts[name] = {
          name,
          abi: data.abi,
          bytecode: data.evm?.bytecode?.object,
          sourceFile: mainFile.name
        };
      }

      const warnings = (output.errors || [])
        .filter((e) => e.severity === 'warning')
        .map((e) => e.formattedMessage)
        .join('\n');

      const names = Object.keys(this.artifacts).join(', ');
      this._showOutput(
        `Compilation successful!\nContracts: ${names}${warnings ? '\n\nWarnings:\n' + warnings : ''}`,
        'success'
      );
      this.logger?.log('Compiled: ' + names, 'success');
      return this.artifacts;
    } catch (err) {
      this._showOutput('Error: ' + err.message, 'error');
      this.logger?.log('Compiler error: ' + err.message, 'error');
      return null;
    }
  }

  _buildInput(files, mainFile, optimize, runs) {
    const sources = {};
    files.forEach((f) => {
      sources[f.name] = { content: f.content };
    });
    return {
      language: 'Solidity',
      sources,
      settings: {
        optimizer: { enabled: optimize, runs },
        outputSelection: {
          '*': {
            '*': ['abi', 'evm.bytecode.object', 'evm.bytecode.sourceMap']
          }
        }
      }
    };
  }

  _showOutput(text, type) {
    if (this.outputEl) {
      this.outputEl.className = 'compile-output compile-' + type;
      this.outputEl.textContent = text;
    }
  }

  getArtifacts() {
    return this.artifacts;
  }
}
