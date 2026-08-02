import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Keeps the auth session fresh on every request and guards the app routes.
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const path = request.nextUrl.pathname;
  const isAuthPage = path === "/login" || path === "/setup";
  const isProtected = ["/dashboard", "/verify", "/reports", "/admin"].some((p) => path.startsWith(p));

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return response; // don't crash every request if env vars are missing

  try {
    const supabase = createServerClient(url, anon, {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(list: { name: string; value: string; options?: Record<string, unknown> }[]) {
          list.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    });

    const { data: { user } } = await supabase.auth.getUser();

    if (!user && isProtected) return NextResponse.redirect(new URL("/login", request.url));
    if (user && isAuthPage) return NextResponse.redirect(new URL("/dashboard", request.url));
    return response;
  } catch {
    // Supabase unreachable (paused project, transient network issue, etc).
    // Don't 500 the whole site — send protected routes to login and let the rest through.
    if (isProtected) return NextResponse.redirect(new URL("/login", request.url));
    return response;
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
