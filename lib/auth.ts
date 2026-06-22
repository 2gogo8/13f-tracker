import NextAuth from "next-auth";
import Discord from "next-auth/providers/discord";

const DISCORD_GUILD_ID = "1470710752846417990";

declare module "next-auth" {
  interface Session {
    user: {
      id?: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      discordId?: string | null;
      isMember?: boolean;
    };
    accessToken?: string;
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    accessToken?: string;
    discordId?: string | null;
    isMember?: boolean;
  }
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Discord({
      clientId: process.env.DISCORD_CLIENT_ID!,
      clientSecret: process.env.DISCORD_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: "identify guilds guilds.members.read",
        },
      },
    }),
  ],
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async jwt({ token, account, profile }) {
      // On initial sign-in, persist the access token and check guild membership
      if (account?.access_token) {
        token.accessToken = account.access_token;
        token.discordId = (profile as { id?: string })?.id ?? null;

        // Check if user is in JG's Discord server
        try {
          const res = await fetch(
            `https://discord.com/api/v10/users/@me/guilds/${DISCORD_GUILD_ID}/member`,
            {
              headers: { Authorization: `Bearer ${account.access_token}` },
            }
          );
          if (res.ok) {
            token.isMember = true;
          } else {
            // 404 = not in server, any other error = deny
            token.isMember = false;
          }
        } catch {
          token.isMember = false;
        }
      }
      return token;
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken;
      session.user.discordId = token.discordId;
      session.user.isMember = token.isMember;
      return session;
    },
  },
});
