const fs = require('fs');
const path = require('path');

const CACHE_CONFIG = {
  'app/api/dashboard/route.ts': { seconds: 300, endpoint: '/api/dashboard' },
  'app/api/top-movers/route.ts': { seconds: 600, endpoint: '/api/top-movers' },
  'app/api/rule40/route.ts': { seconds: 7200, endpoint: '/api/rule40' },
  'app/api/top-picks/route.ts': { seconds: 7200, endpoint: '/api/top-picks' },
  'app/api/anti-market-picks/route.ts': { seconds: 7200, endpoint: '/api/anti-market-picks' },
  'app/api/oversold-scanner/route.ts': { seconds: 7200, endpoint: '/api/oversold-scanner' },
  'app/api/industry-summary/route.ts': { seconds: 86400, endpoint: '/api/industry-summary' },
  'app/api/sp500/route.ts': { seconds: 86400, endpoint: '/api/sp500' },
  'app/api/quote/[symbol]/route.ts': { seconds: 300, endpoint: '/api/quote/[symbol]' },
  'app/api/historical/[symbol]/route.ts': { seconds: 7200, endpoint: '/api/historical/[symbol]' },
  'app/api/institutional/[symbol]/route.ts': { seconds: 7200, endpoint: '/api/institutional/[symbol]' },
  'app/api/institutional-trend/[symbol]/route.ts': { seconds: 7200, endpoint: '/api/institutional-trend/[symbol]' },
  'app/api/profile/[symbol]/route.ts': { seconds: 86400, endpoint: '/api/profile/[symbol]' },
  'app/api/stock-news/[symbol]/route.ts': { seconds: 1800, endpoint: '/api/stock-news/[symbol]' },
  'app/api/ai-analysis/[symbol]/route.ts': { seconds: 7200, endpoint: '/api/ai-analysis/[symbol]' },
  'app/api/chart-events/[symbol]/route.ts': { seconds: 7200, endpoint: '/api/chart-events/[symbol]' },
  'app/api/comments/route.ts': { seconds: 60, endpoint: '/api/comments', getOnly: true },
};

function addCacheHeaders(filePath, config) {
  const fullPath = path.join(process.cwd(), filePath);
  let content = fs.readFileSync(fullPath, 'utf8');
  
  // Add import if not present
  if (!content.includes("import { trackApiCall }")) {
    content = content.replace(
      /^(import.*from ['"]next\/server['"];)/m,
      "$1\nimport { trackApiCall } from '@/lib/api-stats';"
    );
  }
  
  // Also track symbol views for symbol-based endpoints
  const needsSymbolTracking = filePath.includes('[symbol]');
  if (needsSymbolTracking && !content.includes("import { trackApiCall, trackSymbolView }")) {
    content = content.replace(
      /import { trackApiCall } from '@\/lib\/api-stats';/,
      "import { trackApiCall, trackSymbolView } from '@/lib/api-stats';"
    );
  }
  
  const cacheHeader = `'public, s-maxage=${config.seconds}, stale-while-revalidate=${config.seconds}'`;
  
  // Find all return NextResponse.json( statements and wrap them
  // This is a simplified approach - we'll manually verify after
  console.log(`Processing ${filePath}...`);
  console.log(`  Cache: ${config.seconds}s, Endpoint: ${config.endpoint}`);
  
  fs.writeFileSync(fullPath, content);
}

// Process all files
Object.entries(CACHE_CONFIG).forEach(([filePath, config]) => {
  try {
    addCacheHeaders(filePath, config);
  } catch (error) {
    console.error(`Error processing ${filePath}:`, error.message);
  }
});

console.log('\nDone! Files updated with cache header imports.');
console.log('Note: You still need to manually wrap return statements with cache headers.');
