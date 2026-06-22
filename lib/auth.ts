import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

declare module "next-auth" {
  interface Session {
    user: {
      id?: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      ytChannelId?: string | null;
      isMember?: boolean;
    };
    accessToken?: string;
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    accessToken?: string;
    ytChannelId?: string | null;
    isMember?: boolean;
  }
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          scope:
            "openid email profile https://www.googleapis.com/auth/youtube.readonly",
          access_type: "offline",
          prompt: "consent",
        },
      },
    }),
  ],
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async jwt({ token, account }) {
      // On initial sign-in, persist the access token
      if (account?.access_token) {
        token.accessToken = account.access_token;

        // Fetch the user's YouTube channel ID
        try {
          const res = await fetch(
            "https://www.googleapis.com/youtube/v3/channels?part=id&mine=true",
            {
              headers: { Authorization: `Bearer ${account.access_token}` },
            }
          );
          if (res.ok) {
            const data = (await res.json()) as {
              items?: { id: string }[];
            };
            token.ytChannelId = data.items?.[0]?.id ?? null;
          }
        } catch {
          // Non-fatal; will be null
          token.ytChannelId = null;
        }

        // Check membership against cached member list
        if (token.ytChannelId) {
          const { isMember } = await import("@/lib/youtube-members");
          token.isMember = await isMember(token.ytChannelId);
        } else {
          token.isMember = false;
        }
      }
      return token;
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken;
      session.user.ytChannelId = token.ytChannelId;
      session.user.isMember = token.isMember;
      return session;
    },
  },
});
