"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Si se llega a la landing con los tokens de un inicio de sesión (pasa en el teléfono y
 * en algunas redirecciones de OAuth), se pasan al callback. No dibuja nada.
 */
export default function RedirigirAuth() {
  const router = useRouter();
  useEffect(() => {
    const hash = window.location.hash;
    const params = new URLSearchParams(window.location.search);
    if (hash.includes("access_token") || params.has("access_token") || params.has("code")) {
      router.replace(`/auth/callback${window.location.search}${window.location.hash}`);
    }
  }, [router]);
  return null;
}
