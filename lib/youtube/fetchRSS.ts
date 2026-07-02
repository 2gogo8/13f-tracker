/**
 * fetchRSS.ts — Fetch and parse YouTube channel RSS feeds.
 *
 * YouTube provides RSS feeds at:
 *   https://www.youtube.com/feeds/videos.xml?channel_id={CHANNEL_ID}
 *
 * Each feed returns the most recent ~15 videos.
 */

export interface RSSEntry {
  videoId: string;
  title: string;
  published: string;    // ISO 8601
  updated: string;
  thumbnail: string;
  description: string;
}

export interface RSSFeed {
  channelTitle: string;
  entries: RSSEntry[];
}

/**
 * Fetch and parse a YouTube RSS feed for a given channel ID.
 * Uses built-in regex parsing to avoid XML library dependencies.
 */
export async function fetchYouTubeRSS(channelId: string): Promise<RSSFeed> {
  const rssUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;

  const res = await fetch(rssUrl, {
    headers: { 'User-Agent': '13f-tracker/1.0' },
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    throw new Error(`RSS fetch failed: ${res.status} ${res.statusText} for channel ${channelId}`);
  }

  const xml = await res.text();

  // Parse channel title
  const channelTitleMatch = xml.match(/<title>([^<]*)<\/title>/);
  const channelTitle = channelTitleMatch?.[1] || '';

  // Parse entries
  const entries: RSSEntry[] = [];
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
  let match;

  while ((match = entryRegex.exec(xml)) !== null) {
    const entry = match[1];

    const videoIdMatch = entry.match(/<yt:videoId>([^<]*)<\/yt:videoId>/);
    const titleMatch = entry.match(/<title>([^<]*)<\/title>/);
    const publishedMatch = entry.match(/<published>([^<]*)<\/published>/);
    const updatedMatch = entry.match(/<updated>([^<]*)<\/updated>/);
    const thumbnailMatch = entry.match(/<media:thumbnail\s+url="([^"]*)"/)
      || entry.match(/<media:content\s+url="([^"]*)"/);
    const descriptionMatch = entry.match(/<media:description>([^<]*)<\/media:description>/);

    if (videoIdMatch) {
      entries.push({
        videoId: videoIdMatch[1],
        title: decodeXMLEntities(titleMatch?.[1] || ''),
        published: publishedMatch?.[1] || '',
        updated: updatedMatch?.[1] || '',
        thumbnail: thumbnailMatch?.[1] || `https://i.ytimg.com/vi/${videoIdMatch[1]}/hqdefault.jpg`,
        description: decodeXMLEntities(descriptionMatch?.[1] || ''),
      });
    }
  }

  return { channelTitle, entries };
}

function decodeXMLEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'");
}
