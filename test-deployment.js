#!/usr/bin/env node

/**
 * Test script to verify deployment configuration
 * This simulates the production environment locally
 */

import { spawn } from 'child_process'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

console.log('🧪 Testing deployment configuration...')

// Test 1: Check if all required files exist
console.log('\n📁 Checking required files...')

const requiredFiles = [
  '.do/app.yaml',
  'Dockerfile',
  'src/production-server.js',
  'package.json',
  'src/my-mastra-vite/package.json'
]

let allFilesExist = true
for (const file of requiredFiles) {
  try {
    const fs = await import('fs')
    const exists = fs.existsSync(join(__dirname, file))
    console.log(`${exists ? '✅' : '❌'} ${file}`)
    if (!exists) allFilesExist = false
  } catch (error) {
    console.log(`❌ ${file} - Error checking: ${error.message}`)
    allFilesExist = false
  }
}

if (!allFilesExist) {
  console.log('\n❌ Some required files are missing!')
  process.exit(1)
}

// Test 2: Check package.json scripts
console.log('\n📦 Checking package.json scripts...')

try {
  const packageJson = JSON.parse(await import('fs').then(fs => fs.readFileSync(join(__dirname, 'package.json'), 'utf8')))
  
  const requiredScripts = ['start:fullstack', 'build']
  for (const script of requiredScripts) {
    if (packageJson.scripts[script]) {
      console.log(`✅ ${script}: ${packageJson.scripts[script]}`)
    } else {
      console.log(`❌ Missing script: ${script}`)
      allFilesExist = false
    }
  }
} catch (error) {
  console.log(`❌ Error reading package.json: ${error.message}`)
  allFilesExist = false
}

// Test 3: Check dependencies
console.log('\n🔗 Checking dependencies...')

try {
  const packageJson = JSON.parse(await import('fs').then(fs => fs.readFileSync(join(__dirname, 'package.json'), 'utf8')))
  
  const requiredDeps = ['express', 'cors', 'http-proxy-middleware']
  for (const dep of requiredDeps) {
    if (packageJson.dependencies[dep]) {
      console.log(`✅ ${dep}: ${packageJson.dependencies[dep]}`)
    } else {
      console.log(`❌ Missing dependency: ${dep}`)
      allFilesExist = false
    }
  }
} catch (error) {
  console.log(`❌ Error checking dependencies: ${error.message}`)
  allFilesExist = false
}

// Test 4: Validate App Platform config
console.log('\n⚙️ Validating App Platform configuration...')

try {
  const yaml = await import('yaml')
  const fs = await import('fs')
  const appYaml = fs.readFileSync(join(__dirname, '.do/app.yaml'), 'utf8')
  const config = yaml.parse(appYaml)
  
  if (config.services && config.services[0]) {
    const service = config.services[0]
    console.log(`✅ Service name: ${service.name}`)
    console.log(`✅ Run command: ${service.run_command}`)
    console.log(`✅ HTTP port: ${service.http_port}`)
    
    if (service.envs && service.envs.length > 0) {
      console.log(`✅ Environment variables: ${service.envs.length} configured`)
    } else {
      console.log('⚠️ No environment variables configured')
    }
  } else {
    console.log('❌ Invalid App Platform configuration')
    allFilesExist = false
  }
} catch (error) {
  console.log(`❌ Error validating App Platform config: ${error.message}`)
  allFilesExist = false
}

// Test 5: Check Dockerfile
console.log('\n🐳 Checking Dockerfile...')

try {
  const fs = await import('fs')
  const dockerfile = fs.readFileSync(join(__dirname, 'Dockerfile'), 'utf8')
  
  const requiredCommands = ['FROM node:20-alpine', 'RUN npm run build', 'CMD']
  for (const cmd of requiredCommands) {
    if (dockerfile.includes(cmd)) {
      console.log(`✅ Found: ${cmd}`)
    } else {
      console.log(`❌ Missing: ${cmd}`)
      allFilesExist = false
    }
  }
} catch (error) {
  console.log(`❌ Error reading Dockerfile: ${error.message}`)
  allFilesExist = false
}

// Summary
console.log('\n📊 Test Summary:')
if (allFilesExist) {
  console.log('✅ All deployment configuration tests passed!')
  console.log('\n🚀 Ready for deployment to Digital Ocean App Platform!')
  console.log('\nNext steps:')
  console.log('1. Push your code to GitHub')
  console.log('2. Create a new app in Digital Ocean App Platform')
  console.log('3. Connect your GitHub repository')
  console.log('4. Set the environment variables listed in DEPLOYMENT_GUIDE.md')
  console.log('5. Deploy!')
} else {
  console.log('❌ Some tests failed. Please fix the issues above before deploying.')
  process.exit(1)
}
