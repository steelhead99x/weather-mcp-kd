#!/usr/bin/env tsx

/**
 * System Monitor for Weather Agent
 * 
 * This script monitors the health of the weather agent system and provides
 * real-time status information to help diagnose issues.
 */

import 'dotenv/config';

interface SystemStatus {
  timestamp: string;
  memory: {
    used: number;
    total: number;
    percentage: number;
  };
  uptime: number;
  environment: {
    nodeEnv: string;
    hasAnthropicKey: boolean;
    hasDeepgramKey: boolean;
    hasMuxKeys: boolean;
  };
  warnings: string[];
  errors: string[];
}

function getMemoryUsage() {
  const usage = process.memoryUsage();
  const total = usage.heapTotal;
  const used = usage.heapUsed;
  const percentage = Math.round((used / total) * 100);
  
  return {
    used: Math.round(used / 1024 / 1024), // MB
    total: Math.round(total / 1024 / 1024), // MB
    percentage
  };
}

function checkEnvironment(): { hasAnthropicKey: boolean; hasDeepgramKey: boolean; hasMuxKeys: boolean } {
  return {
    hasAnthropicKey: !!process.env.ANTHROPIC_API_KEY,
    hasDeepgramKey: !!process.env.DEEPGRAM_API_KEY,
    hasMuxKeys: !!(process.env.MUX_TOKEN_ID && process.env.MUX_TOKEN_SECRET)
  };
}

function getSystemStatus(): SystemStatus {
  const memory = getMemoryUsage();
  const environment = checkEnvironment();
  const warnings: string[] = [];
  const errors: string[] = [];

  // Check memory usage
  if (memory.percentage > 80) {
    warnings.push(`High memory usage: ${memory.percentage}%`);
  }
  if (memory.percentage > 95) {
    errors.push(`Critical memory usage: ${memory.percentage}%`);
  }

  // Check environment variables
  if (!environment.hasAnthropicKey) {
    errors.push('ANTHROPIC_API_KEY is missing');
  }
  if (!environment.hasDeepgramKey) {
    warnings.push('DEEPGRAM_API_KEY is missing (TTS features disabled)');
  }
  if (!environment.hasMuxKeys) {
    warnings.push('Mux credentials missing (video upload features disabled)');
  }

  return {
    timestamp: new Date().toISOString(),
    memory,
    uptime: Math.round(process.uptime()),
    environment: {
      nodeEnv: process.env.NODE_ENV || 'development',
      ...environment
    },
    warnings,
    errors
  };
}

function formatStatus(status: SystemStatus): string {
  const lines: string[] = [];
  
  lines.push('🌡️  Weather Agent System Monitor');
  lines.push('=' .repeat(50));
  lines.push(`📅 Time: ${status.timestamp}`);
  lines.push(`⏱️  Uptime: ${status.uptime}s`);
  lines.push(`💾 Memory: ${status.memory.used}MB / ${status.memory.total}MB (${status.memory.percentage}%)`);
  lines.push(`🌍 Environment: ${status.environment.nodeEnv}`);
  lines.push('');
  
  lines.push('🔧 Configuration:');
  lines.push(`  • Anthropic API: ${status.environment.hasAnthropicKey ? '✅' : '❌'}`);
  lines.push(`  • Deepgram API: ${status.environment.hasDeepgramKey ? '✅' : '❌'}`);
  lines.push(`  • Mux API: ${status.environment.hasMuxKeys ? '✅' : '❌'}`);
  lines.push('');
  
  if (status.warnings.length > 0) {
    lines.push('⚠️  Warnings:');
    status.warnings.forEach(warning => lines.push(`  • ${warning}`));
    lines.push('');
  }
  
  if (status.errors.length > 0) {
    lines.push('🚨 Errors:');
    status.errors.forEach(error => lines.push(`  • ${error}`));
    lines.push('');
  }
  
  const overallStatus = status.errors.length > 0 ? '❌ UNHEALTHY' : 
                       status.warnings.length > 0 ? '⚠️  WARNING' : '✅ HEALTHY';
  lines.push(`📊 Overall Status: ${overallStatus}`);
  
  return lines.join('\n');
}

function main() {
  console.log('Starting Weather Agent System Monitor...\n');
  
  // Initial status check
  const status = getSystemStatus();
  console.log(formatStatus(status));
  
  // Set up periodic monitoring
  const interval = setInterval(() => {
    console.clear();
    const currentStatus = getSystemStatus();
    console.log(formatStatus(currentStatus));
    
    // Check for critical errors
    if (currentStatus.errors.length > 0) {
      console.log('\n🚨 CRITICAL ERRORS DETECTED - System may be unstable!');
    }
  }, 5000); // Check every 5 seconds
  
  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n\nShutting down monitor...');
    clearInterval(interval);
    process.exit(0);
  });
  
  process.on('SIGTERM', () => {
    console.log('\n\nShutting down monitor...');
    clearInterval(interval);
    process.exit(0);
  });
}

if (require.main === module) {
  main();
}

export { getSystemStatus, formatStatus };
