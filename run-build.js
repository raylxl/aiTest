// run-build.js - Clears NODE_OPTIONS then runs next build
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Write a temp batch script that clears NODE_OPTIONS and runs the build
const batContent = [
  '@echo off',
  'set NODE_OPTIONS=',
  'cd /d ' + path.join(__dirname).replace(/\//g, '\\'),
  'npm run build'
].join('\n');

const batPath = path.join(__dirname, '_build_temp.bat');
fs.writeFileSync(batPath, batContent, 'utf8');

const proc = spawn('cmd.exe', ['/c', batPath], {
  stdio: 'inherit',
  windowsHide: false
});

proc.on('exit', (code) => {
  fs.unlinkSync(batPath);
  process.exit(code || 0);
});
