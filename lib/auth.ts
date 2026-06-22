import NextAuth, { type NextAuthOptions } from "next-auth";
import DiscordProvider from "next-auth/providers/discord";

const DISCORD_GUILD_ID = "1470710752846417990";

export const authOptions: NextAuthOptions = {
  providers: [
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
      if (account?.access_token) {
        token.accessToken = account.access_token;

        // Check if user is in JG's Discord server
        try {
          const res = await fetch(
            `https://discord.com/api/v10/users/@me/guilds`,
            {
              headers: { Authorization: `Bearer ${account.access_token}` },
            }
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
      }
      return token;
    },
    async session({ session, token }) {
      (session as any).accessToken = token.accessToken;
      (session.user as any).isMember = token.isMember;
      return session;
    },
  },
};

export default NextAuth(authOptions);
