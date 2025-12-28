import "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      orgId: string | null;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId?: string;
    orgId?: string | null;
  }
}
