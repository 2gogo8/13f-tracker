#!/usr/bin/env python3
import re
import os

# Define cache configs
CACHE_CONFIG = {
    'app/api/top-picks/route.ts': {'seconds': 7200, 'endpoint': '/api/top-picks'},
    'app/api/anti-market-picks/route.ts': {'seconds': 7200, 'endpoint': '/api/anti-market-picks'},
    'app/api/oversold-scanner/route.ts': {'seconds': 7200, 'endpoint': '/api/oversold-scanner'},
    'app/api/industry-summary/route.ts': {'seconds': 86400, 'endpoint': '/api/industry-summary'},
    'app/api/quote/[symbol]/route.ts': {'seconds': 300, 'endpoint': '/api/quote/[symbol]', 'symbol': True},
    'app/api/historical/[symbol]/route.ts': {'seconds': 7200, 'endpoint': '/api/historical/[symbol]', 'symbol': True},
    'app/api/institutional/[symbol]/route.ts': {'seconds': 7200, 'endpoint': '/api/institutional/[symbol]', 'symbol': True},
    'app/api/institutional-trend/[symbol]/route.ts': {'seconds': 7200, 'endpoint': '/api/institutional-trend/[symbol]', 'symbol': True},
    'app/api/profile/[symbol]/route.ts': {'seconds': 86400, 'endpoint': '/api/profile/[symbol]', 'symbol': True},
    'app/api/stock-news/[symbol]/route.ts': {'seconds': 1800, 'endpoint': '/api/stock-news/[symbol]', 'symbol': True},
    'app/api/ai-analysis/[symbol]/route.ts': {'seconds': 7200, 'endpoint': '/api/ai-analysis/[symbol]', 'symbol': True},
    'app/api/chart-events/[symbol]/route.ts': {'seconds': 7200, 'endpoint': '/api/chart-events/[symbol]', 'symbol': True},
    'app/api/comments/route.ts': {'seconds': 60, 'endpoint': '/api/comments', 'get_only': True},
}

def wrap_response(content, cache_seconds, endpoint, is_symbol_route=False):
    """Add timing and cache headers to GET function"""
    
    # Add startTime at beginning of GET function
    content = re.sub(
        r'(export async function GET\([^)]*\)\s*{)',
        r'\1\n  const startTime = Date.now();\n  \n  try {',
        content,
        count=1
    )
    
    # If we added try{, we need to wrap the rest and add catch
    if 'const startTime = Date.now();' in content:
        # Find all return NextResponse.json statements and wrap them
        cache_header = f'public, s-maxage={cache_seconds}, stale-while-revalidate={cache_seconds}'
        
        # Replace return NextResponse.json(...) with wrapped version
        def replace_return(match):
            indent = match.group(1)
            json_content = match.group(2)
            return f'''{indent}const response = NextResponse.json({json_content});
{indent}response.headers.set('Cache-Control', '{cache_header}');
{indent}response.headers.set('CDN-Cache-Control', '{cache_header}');
{indent}trackApiCall('{endpoint}', Date.now() - startTime, false);
{indent}return response;'''
        
        content = re.sub(
            r'(\s+)return NextResponse\.json\(([^;]+)\);',
            replace_return,
            content
        )
    
    return content

for file_path, config in CACHE_CONFIG.items():
    full_path = os.path.join('/Users/jgtruestock/.openclaw/workspace/projects/13f-tracker', file_path)
    
    if not os.path.exists(full_path):
        print(f"Skipping {file_path} (not found)")
        continue
    
    with open(full_path, 'r') as f:
        content = f.read()
    
    # Skip if already has startTime
    if 'const startTime = Date.now();' in content:
        print(f"Skipping {file_path} (already updated)")
        continue
    
    # Update content
    updated = wrap_response(
        content,
        config['seconds'],
        config['endpoint'],
        config.get('symbol', False)
    )
    
    with open(full_path, 'w') as f:
        f.write(updated)
    
    print(f"Updated {file_path} (cache: {config['seconds']}s)")

print("\nDone!")
