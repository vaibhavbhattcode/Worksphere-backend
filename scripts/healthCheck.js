// scripts/healthCheck.js - Health check and verification script
import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
};

const log = {
  success: (msg) => console.log(`${colors.green}✓${colors.reset} ${msg}`),
  error: (msg) => console.log(`${colors.red}✗${colors.reset} ${msg}`),
  warning: (msg) => console.log(`${colors.yellow}⚠${colors.reset} ${msg}`),
  info: (msg) => console.log(`${colors.blue}ℹ${colors.reset} ${msg}`),
};

async function checkEnvironment() {
  log.info('Checking environment variables...');
  
  const required = [
    'MONGO_URI',
    'JWT_SECRET',
    'FRONTEND_URL',
    'BACKEND_URL',
    'EMAIL_HOST',
    'EMAIL_USER',
    'EMAIL_PASS',
  ];
  
  const missing = [];
  const warnings = [];
  
  for (const key of required) {
    if (!process.env[key]) {
      missing.push(key);
    }
  }
  
  if (missing.length > 0) {
    log.error(`Missing required environment variables: ${missing.join(', ')}`);
    return false;
  }
  
  log.success('All required environment variables are set');
  
  // Check optional variables
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    warnings.push('Google OAuth not configured');
  }
  
  if (!process.env.RAPIDAPI_KEY) {
    warnings.push('RapidAPI key not configured');
  }
  
  if (!process.env.GEMINI_API_KEY) {
    warnings.push('Gemini API key not configured');
  }
  
  if (warnings.length > 0) {
    warnings.forEach(w => log.warning(w));
  }
  
  return true;
}

async function checkDatabase() {
  log.info('Checking database connection...');
  
  try {
    await mongoose.connect(process.env.MONGO_URI);
    log.success('Database connection successful');
    
    // Check database collections
    const collections = await mongoose.connection.db.listCollections().toArray();
    log.success(`Found ${collections.length} collections in database`);
    
    await mongoose.connection.close();
    return true;
  } catch (error) {
    log.error(`Database connection failed: ${error.message}`);
    return false;
  }
}

async function checkEmailService() {
  log.info('Checking email service configuration...');
  
  const nodemailer = await import('nodemailer');
  
  try {
    const transporter = nodemailer.default.createTransport({
      host: process.env.EMAIL_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.EMAIL_PORT) || 587,
      secure: false,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });
    
    await transporter.verify();
    log.success('Email service configuration is valid');
    return true;
  } catch (error) {
    log.error(`Email service check failed: ${error.message}`);
    return false;
  }
}

async function checkFileSystem() {
  log.info('Checking file system permissions...');
  
  const fs = await import('fs-extra');
  const path = await import('path');
  
  const directories = [
    'uploads',
    'uploads/resumes',
    'uploads/photos',
    'uploads/logos',
    'uploads/certificates',
    'uploads/chat',
    'uploads/video',
  ];
  
  try {
    for (const dir of directories) {
      const fullPath = path.default.resolve(dir);
      await fs.default.ensureDir(fullPath);
    }
    log.success('All required directories are accessible');
    return true;
  } catch (error) {
    log.error(`File system check failed: ${error.message}`);
    return false;
  }
}

function checkNodeVersion() {
  log.info('Checking Node.js version...');
  
  const version = process.version;
  const major = parseInt(version.slice(1).split('.')[0]);
  
  if (major >= 18) {
    log.success(`Node.js version ${version} is compatible`);
    return true;
  } else {
    log.error(`Node.js version ${version} is not supported. Please upgrade to v18 or higher.`);
    return false;
  }
}

async function checkDependencies() {
  log.info('Checking dependencies...');
  
  try {
    const fs = await import('fs');
    const path = await import('path');
    const { fileURLToPath } = await import('url');
    
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.default.dirname(__filename);
    const packageJsonPath = path.default.join(__dirname, '..', 'package.json');
    
    const packageJsonContent = fs.default.readFileSync(packageJsonPath, 'utf-8');
    const packageJson = JSON.parse(packageJsonContent);
    const dependencies = packageJson.dependencies;
    
    log.success(`${Object.keys(dependencies).length} dependencies listed in package.json`);
    
    // Try importing key dependencies
    await import('express');
    await import('mongoose');
    await import('jsonwebtoken');
    await import('bcryptjs');
    
    log.success('Key dependencies are installed and importable');
    return true;
  } catch (error) {
    log.error(`Dependency check failed: ${error.message}`);
    log.warning('Try running: npm install');
    return false;
  }
}

async function runHealthCheck() {
  console.log('\n' + '='.repeat(60));
  console.log('Work Sphere Backend - Health Check');
  console.log('='.repeat(60) + '\n');
  
  const checks = [
    { name: 'Node.js Version', fn: checkNodeVersion },
    { name: 'Environment Variables', fn: checkEnvironment },
    { name: 'Dependencies', fn: checkDependencies },
    { name: 'Database Connection', fn: checkDatabase },
    { name: 'Email Service', fn: checkEmailService },
    { name: 'File System', fn: checkFileSystem },
  ];
  
  const results = [];
  
  for (const check of checks) {
    try {
      const result = await check.fn();
      results.push({ name: check.name, passed: result });
    } catch (error) {
      log.error(`${check.name} check threw an error: ${error.message}`);
      results.push({ name: check.name, passed: false });
    }
    console.log(''); // Empty line between checks
  }
  
  // Summary
  console.log('='.repeat(60));
  console.log('Health Check Summary');
  console.log('='.repeat(60));
  
  const passed = results.filter(r => r.passed).length;
  const total = results.length;
  
  console.log(`\n${passed}/${total} checks passed\n`);
  
  results.forEach(result => {
    if (result.passed) {
      log.success(result.name);
    } else {
      log.error(result.name);
    }
  });
  
  console.log('\n' + '='.repeat(60) + '\n');
  
  if (passed === total) {
    log.success('All checks passed! Your backend is ready to run.');
    process.exit(0);
  } else {
    log.error('Some checks failed. Please fix the issues above before starting the server.');
    process.exit(1);
  }
}

// Run the health check
runHealthCheck().catch(error => {
  log.error(`Health check failed with error: ${error.message}`);
  process.exit(1);
});
