const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const distDir = 'dist';
const outputFile = 'smart-reimbursement-extension.zip';

try {
  console.log('Building extension...');
  execSync('npm run build', { stdio: 'inherit' });
  
  console.log('Zipping dist folder...');
  if (fs.existsSync(outputFile)) {
    fs.unlinkSync(outputFile);
    console.log(`Removed existing ${outputFile}`);
  }
  
  // 兼容不同操作系统
  if (process.platform === 'darwin' || process.platform === 'linux') {
    // macOS 或 Linux
    execSync(`zip -r ${outputFile} ${distDir}`, { stdio: 'inherit' });
  } else {
    // Windows
    execSync(`powershell Compress-Archive -Path ${distDir}/* -DestinationPath ${outputFile}`, { stdio: 'inherit' });
  }
  
  console.log(`Successfully created ${outputFile}`);
} catch (error) {
  console.error('Error:', error.message);
  process.exit(1);
}
