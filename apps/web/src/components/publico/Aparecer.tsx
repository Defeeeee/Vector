"use client";

import { motion, useReducedMotion } from "framer-motion";

/**
 * Lo que entra con un fundido al llegar a la pantalla. El contenido se dibuja en el
 * server igual —esto sólo lo anima—, así que los buscadores y quien tenga el
 * movimiento reducido lo ven de entrada.
 */
export default function Aparecer({
  children,
  demora = 0,
  className,
}: {
  children: React.ReactNode;
  demora?: number;
  className?: string;
}) {
  const reducido = useReducedMotion();
  if (reducido) return <div className={className}>{children}</div>;
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.6, delay: demora }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
