const fs = require('fs');
const path = require('path');

const publicConfig = {
  socketUrl: process.env.TYPERACE_SOCKET_URL || ''
};

const targetPath = path.join(__dirname, '..', 'public', 'js', 'runtime-config.js');
const contents = `window.TypeRaceConfig = Object.freeze(${JSON.stringify(publicConfig, null, 2)});\n`;

fs.writeFileSync(targetPath, contents);
console.log(`Frontend runtime config written to ${path.relative(process.cwd(), targetPath)}`);
