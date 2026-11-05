"use client";

import { useEffect, useRef } from "react";

/**
 * El video del hero de la landing (3.10.0): el piloto poniéndose los auriculares y el despegue
 * desde una pista de pasto, en un loop de 17 s sin sonido (Pexels 6739601 de Joshua Malic y
 * 17118515 de Casey Whalen; licencia de Pexels, sin atribución obligatoria). Lo arma
 * `marketing/landing/` con ffmpeg: el horizontal a 1280 px y el vertical a 540 para el teléfono.
 *
 * Con "reducir movimiento" no arranca: queda el cuadro del poster.
 */
export default function VideoHero({ className }: { className?: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const quieto = window.matchMedia("(prefers-reduced-motion: reduce)");
    const aplicar = () => {
      if (quieto.matches) v.pause();
      else v.play().catch(() => {});
    };
    aplicar();
    quieto.addEventListener("change", aplicar);
    return () => quieto.removeEventListener("change", aplicar);
  }, []);
  return (
    <video ref={ref} className={className} autoPlay muted loop playsInline preload="auto" poster="/landing/hero-poster.webp" aria-hidden="true">
      <source media="(max-width: 767px)" src="/landing/hero-movil.mp4" type="video/mp4" />
      <source src="/landing/hero.mp4" type="video/mp4" />
    </video>
  );
}
