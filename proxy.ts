import { withAuth } from "next-auth/middleware";

const proxy = withAuth({
  callbacks: {
    authorized: ({ token, req }) => {
      if (req.nextUrl.pathname.startsWith("/api/auth")) return true;
      return token != null;
    },
  },
});

export default proxy;

export const config = {
  matcher: ["/dashboard/:path*", "/api/:path*"],
};
