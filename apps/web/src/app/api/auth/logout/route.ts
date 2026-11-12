import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { dominioDeCookie, hostDelPedido } from "@/lib/sesion";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const redirectTo = searchParams.get("redirect") || "/";
  
  const cookieStore = await cookies();
  const domain = dominioDeCookie(hostDelPedido(request.headers));

  cookieStore.set("session_token", "", {
    path: "/",
    domain: domain,
    maxAge: 0,
    expires: new Date(0),
  });
  
  cookieStore.set("refresh_token", "", {
    path: "/",
    domain: domain,
    maxAge: 0,
    expires: new Date(0),
  });
  
  const host = hostDelPedido(request.headers) || "vectoraero.ar";
  const proto = request.headers.get("x-forwarded-proto") || "https";
  const redirectUrl = new URL(redirectTo, `${proto}://${host}`);
  
  return NextResponse.redirect(redirectUrl);
}
