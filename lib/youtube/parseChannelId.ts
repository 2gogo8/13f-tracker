/**
 * parseChannelId.ts — Extract YouTube channel ID from various URL formats.
 *
 * Supported formats:
 *   https://www.youtube.com/channel/UCxxxx    → direct
 *   https://www.youtube.com/@handle           → fetch page HTML
 *   https://www.youtube.com/c/ChannelName     → fetch page HTML
 */

/**
 * Parse a YouTube channel ID from a URL or handle string.
 * For @handle and /c/ formats, fetches the YouTube page to extract channelId.
 */
export async function parseChannelId(input: string): Promise<string | null> {
  if (!input) return null;

  const trimmed = input.trim();

  // Direct channel ID (starts with UC)
  if (/^UC[\w-]{22}$/.test(trimmed)) {
    return trimmed;
  }

  // /channel/UCxxxx URL
  const channelMatch = trimmed.match(/youtube\.com\/channel\/(UC[\w-]{22})/);
  if (channelMatch) return channelMatch[1];

  // @handle URL or bare @handle
  const handleMatch = trimmed.match(/youtube\.com\/@([\w.-]+)/) || trimmed.match(/^@([\w.-]+)$/);
  if (handleMatch) {
    return fetchChannelIdFromPage(`https://www.youtube.com/@${handleMatch[1]}`);
  }

  // /c/ChannelName URL
  const customMatch = trimmed.match(/youtube\.com\/c\/([\w.-]+)/);
  if (customMatch) {
    return fetchChannelIdFromPage(`https://www.youtube.com/c/${customMatch[1]}`);
  }

  // Try as a full URL
  if (trimmed.startsWith('http')) {
    return fetchChannelIdFromPage(trimmed);
  }

  return null;
}

async function fetchChannelIdFromPage(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) return null;

    const html = await res.text();

    // Try multiple patterns
    const patterns = [
      /\"channelId\":\"(UC[\w-]{22})\"/,
      /channel_id=(UC[\w-]{22})/,
      /data-channel-external-id=\"(UC[\w-]{22})\"/,
      /\"externalId\":\"(UC[\w-]{22})\"/,
      /<meta\s+itemprop="channelId"\s+content="(UC[\w-]{22})">/,
    ];

    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match) return match[1];
    }

    return null;
  } catch {
    return null;
  }
}
