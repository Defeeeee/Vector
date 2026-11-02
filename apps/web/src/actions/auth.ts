"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const AUTH_URL = process.env.NEXT_PUBLIC_AUTH_URL || "https://auth.flightlog.fdiaznem.com.ar";

export async function login(formData: FormData) {
  const email = formData.get("email");
  const password = formData.get("password");

  if (!email || !password) {
    return { error: "Email and password are required" };
  }

  try {
    const response = await fetch(`${AUTH_URL}/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.log("login: Response not OK", data);
      return { error: data.detail || "Invalid credentials" };
    }

    const token = data.access_token;
    console.log(`login: Token received, length=${token?.length}`);

    if (!token) {
      return { error: "Authentication failed: No token received" };
    }

    await setSession(token, data.refresh_token, 60 * 60 * 24);
    console.log("login: session set, redirecting...");


  } catch (error) {
    console.error("Login error:", error);
    return { error: "An unexpected error occurred" };
  }

  redirect("/dashboard");
}

export async function register(formData: FormData) {
  const email = formData.get("email");
  const password = formData.get("password");
  const first_name = formData.get("first_name");
  const last_name = formData.get("last_name");

  if (!email || !password || !first_name || !last_name) {
    return { error: "Todos los campos son obligatorios" };
  }

  try {
    const response = await fetch(`${AUTH_URL}/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password, first_name, last_name }),
    });

    const data = await response.json();

    if (!response.ok) {
      return { error: data.detail || "Error en la registración" };
    }

    const token = data.access_token;

    if (token) {
      (await cookies()).set("session_token", token, {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        maxAge: 60 * 60 * 24,
        path: "/",
      });
    }

    if (data.refresh_token) {
      (await cookies()).set("refresh_token", data.refresh_token, {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 30,
        path: "/",
      });
    }

    // If we have a token, we could redirect, but let's return success 
    // to show the "Verify Email" message as requested.
    return { success: true };

  } catch (error) {
    console.error("Registration error:", error);
    return { error: "Ocurrió un error inesperado" };
  }
}

export async function recoverPassword(formData: FormData) {
  const email = formData.get("email");

  if (!email) {
    return { error: "Email es requerido" };
  }

  try {
    const response = await fetch(`${AUTH_URL}/recover`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email }),
    });

    if (!response.ok) {
      const data = await response.json();
      return { error: data.detail || "Error enviando correo de recuperación" };
    }

    return { success: true };
  } catch (error) {
    console.error("Recovery error:", error);
    return { error: "Ocurrió un error inesperado" };
  }
}

export async function updatePassword(formData: FormData) {
  const password = formData.get("password");
  const token = await getSessionToken();

  if (!password) {
    return { error: "La contraseña es requerida" };
  }

  if (!token) {
    return { error: "No hay una sesión activa para actualizar la contraseña" };
  }

  try {
    const response = await fetch(`${AUTH_URL}/update-password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({ password }),
    });

    if (!response.ok) {
      const data = await response.json();
      return { error: data.detail || "Error actualizando la contraseña" };
    }

    return { success: true };
  } catch (error) {
    console.error("Update password error:", error);
    return { error: "Ocurrió un error inesperado" };
  }
}

export async function logout(arg?: string | FormData) {
  const redirectTo = typeof arg === "string" ? arg : "/";
  const cookieStore = await cookies();
  const domain = process.env.NODE_ENV === "production" ? ".fdiaznem.com.ar" : undefined;
  
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

  redirect(redirectTo);
}

export async function getGoogleLoginUrl() {
  try {
    const response = await fetch(`${AUTH_URL}/login/google`);
    const data = await response.json();
    
    if (!response.ok) {
      return { error: data.detail || "Error getting Google login URL" };
    }
    
    return { url: data.url };
  } catch (error) {
    console.error("Google login error:", error);
    return { error: "An unexpected error occurred" };
  }
}

export async function getSessionToken() {
  return (await cookies()).get("session_token")?.value;
}

export async function setSession(token: string, refresh_token?: string, maxAge: number = 60 * 60 * 24) {
  const cookieStore = await cookies();
  
  // In production, we use the root domain to ensure availability across subdomains
  const domain = process.env.NODE_ENV === "production" ? ".fdiaznem.com.ar" : undefined;
  const isSecure = process.env.NODE_ENV === "production";
  
  console.log(`setSession: Domain=${domain} maxAge=${maxAge} tokenLength=${token?.length} secure=${isSecure}`);

  try {
    cookieStore.set("session_token", token, {
      httpOnly: true,
      secure: isSecure,
      sameSite: "lax",
      maxAge: maxAge,
      path: "/",
      domain: domain,
    });

    if (refresh_token) {
      cookieStore.set("refresh_token", refresh_token, {
        httpOnly: true,
        secure: isSecure,
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 30, // 30 days
        path: "/",
        domain: domain,
      });
    }
    console.log("setSession: SUCCESS - Cookies set");
  } catch (error) {
    console.error("setSession: ERROR setting cookies:", error);
  }
}
