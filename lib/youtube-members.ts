/**
 * YouTube Channel Membership verification via YouTube Data API v3.
 *
 * Uses the channel owner's refresh token to call `members.list`
 * (requires `youtube.channel-memberships.creator` scope on the owner token).
 *
 * Member channel IDs are cached in Upstash Redis with a 1-hour TTL.
 */

import { redisGet, redisSet, redisKeys, redisDel } from "@/lib/redis";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID!;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!;
const YT_OWNER_REFRESH_TOKEN = process.env.YT_OWNER_REFRESH_TOKEN!;
const YT_CHANNEL_ID = process.env.YT_CHANNEL_ID!;

const MEMBERS_SET_KEY = "yt:members";
const MEMBERS_TTL = 3600; // 1 hour
export const SYNC_LOCK_KEY = "yt:members:sync-lock";

// ── Owner access token via refresh token ─────────────────────────────────

async function getOwnerAccessToken(): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: YT_OWNER_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to refresh owner token: ${res.status} ${text}`);
  }

  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

// ── Fetch all members (paginated) ────────────────────────────────────────

interface MemberItem {
  snippet: {
    memberDetails: {
      channelId: string;
    };
  };
}

interface MembersListResponse {
  items?: MemberItem[];
  nextPageToken?: string;
}

async function fetchAllMemberChannelIds(): Promise<string[]> {
  const accessToken = await getOwnerAccessToken();
  const channelIds: string[] = [];
  let pageToken: string | undefined;

  do {
    const url = new URL("https://www.googleapis.com/youtube/v3/members");
    url.searchParams.set("part", "snippet");
    url.searchParams.set("maxResults", "1000");
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`YouTube members.list failed: ${res.status} ${text}`);
    }

    const data = (await res.json()) as MembersListResponse;
    if (data.items) {
      for (const item of data.items) {
        channelIds.push(item.snippet.memberDetails.channelId);
      }
    }
    pageToken = data.nextPageToken;
  } while (pageToken);

  return channelIds;
}

// ── Sync members to Redis ────────────────────────────────────────────────

export async function syncMembers(): Promise<{
  count: number;
  error?: string;
}> {
  try {
    const channelIds = await fetchAllMemberChannelIds();

    // Store as JSON array in Redis
    await redisSet(MEMBERS_SET_KEY, JSON.stringify(channelIds), MEMBERS_TTL);

    // Clear old individual keys, set new ones for fast lookup
    const oldKeys = await redisKeys("yt:member:*");
    for (const key of oldKeys) {
      await redisDel(key);
    }
    for (const id of channelIds) {
      await redisSet(`yt:member:${id}`, "1", MEMBERS_TTL);
    }

    return { count: channelIds.length };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[syncMembers] Error:", message);
    return { count: 0, error: message };
  }
}

// ── Check single membership ──────────────────────────────────────────────

export async function recheckMembership(
  channelId: string | null | undefined
): Promise<boolean> {
  if (!channelId) return false;
  // Force a fresh sync, then check
  await syncMembers();
  return isMember(channelId);
}

export async function isMember(channelId: string): Promise<boolean> {
  if (!channelId) return false;

  // Owner channel is always a member
  if (channelId === YT_CHANNEL_ID) return true;

  // Fast individual key lookup
  const val = await redisGet(`yt:member:${channelId}`);
  if (val === "1") return true;

  // Fallback: check JSON array
  const raw = await redisGet(MEMBERS_SET_KEY);
  if (raw) {
    try {
      const ids = JSON.parse(raw) as string[];
      return ids.includes(channelId);
    } catch {
      return false;
    }
  }

  // No cached data — attempt a sync
  const result = await syncMembers();
  if (result.error) return false;

  const freshVal = await redisGet(`yt:member:${channelId}`);
  return freshVal === "1";
}
