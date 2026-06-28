import NextAuth, { type NextAuthOptions } from "next-auth";
import DiscordProvider from "next-auth/providers/discord";
import GoogleProvider from "next-auth/providers/google";

const DISCORD_GUILD_ID = "1470710752846417990";

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    DiscordProvider({
      clientId: process.env.DISCORD_CLIENT_ID!,
      clientSecret: process.env.DISCORD_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: "identify guilds",
        },
      },
    }),
  ],
  secret: process.env.NEXTAUTH_SECRET,
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async jwt({ token, account }) {
      // Only runs on first login (account is present) or token refresh (account is undefined)
      if (account) {
        if (account.provider === "discord" && account.access_token) {
          // Store Discord user ID for ADMIN_DISCORD_IDS check (server-side only)
          token.discordId = account.providerAccountId;

          // Check Discord guild membership — access_token stays in JWT, never sent to client
          try {
            const res = await fetch(
              `https://discord.com/api/v10/users/@me/guilds`,
              { headers: { Authorization: `Bearer ${account.access_token}` } }
            );
            if (res.ok) {
              const guilds: { id: string }[] = await res.json();
              token.isMember = guilds.some((g) => g.id === DISCORD_GUILD_ID);
            } else {
              token.isMember = false;
            }
          } catch {
            token.isMember = false;
          }
        } else if (account.provider === "google") {
          // Google users are not Discord members by default
          token.isMember = false;
        }
      }

      // Admin check on every token evaluation:
      // Option C: support both ADMIN_EMAILS (Google login) and ADMIN_DISCORD_IDS (Discord login)
      const adminEmails =
        process.env.ADMIN_EMAILS?.split(",").map((e) => e.trim()).filter(Boolean) ?? [];
      const adminDiscordIds =
        process.env.ADMIN_DISCORD_IDS?.split(",").map((e) => e.trim()).filter(Boolean) ?? [];

      const isAdminByEmail =
        typeof token.email === "string" && adminEmails.includes(token.email);
      const isAdminByDiscord =
        typeof token.discordId === "string" && adminDiscordIds.includes(token.discordId);

      token.isAdmin = isAdminByEmail || isAdminByDiscord;

      return token;
    },

    async session({ session, token }) {
      // Only expose what the client needs — NO accessToken, NO discordId
      (session.user as any).isMember = token.isMember ?? false;
      (session.user as any).isAdmin = token.isAdmin ?? false;
      return session;
    },
  },
};

export default NextAuth(authOptions);
