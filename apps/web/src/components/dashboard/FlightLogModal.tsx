"use client";

import { Aircraft } from "@/types";
import FlightLogForm from "./FlightLogForm";
import { X, Plane } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface FlightLogModalProps {
  isOpen: boolean;
  onClose: () => void;
  aircraft: Aircraft[];
  initialData?: any;
}

export default function FlightLogModal({ isOpen, onClose, aircraft, initialData }: FlightLogModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-6 overflow-y-auto">
          {/* Backdrop */}
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-zinc-900/60 dark:bg-black/80 backdrop-blur-sm cursor-pointer" 
          />

          {/* Content */}
          <motion.div 
            initial={{ scale: 0.9, y: 20, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.9, y: 20, opacity: 0 }}
            className="relative w-full max-w-4xl bg-white dark:bg-[#0a0a0a] border border-zinc-200 dark:border-white/10 rounded-[2.5rem] p-6 md:p-12 shadow-2xl space-y-8 md:space-y-10 my-auto z-10 transition-colors duration-300"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="w-10 h-10 md:w-12 md:h-12 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-xl flex items-center justify-center shadow-lg transition-colors">
                  <Plane className="w-5 h-5 md:w-6 md:h-6" strokeWidth={1.5} />
                </div>
                <div className="space-y-1">
                  <h2 className="text-2xl md:text-3xl font-display font-bold tracking-tight text-zinc-900 dark:text-white">Finalizar vuelo</h2>
                  <p className="text-zinc-500 dark:text-zinc-400 font-medium text-sm">Completá el registro de tu sesión</p>
                </div>
              </div>
              <button 
                onClick={onClose}
                className="p-2 md:p-3 hover:bg-zinc-100 dark:hover:bg-white/5 border border-transparent hover:border-zinc-200 dark:hover:border-white/10 rounded-full transition-all group"
              >
                <X className="w-5 h-5 md:w-6 md:h-6 text-zinc-500 dark:text-zinc-400 group-hover:text-zinc-900 dark:group-hover:text-white" />
              </button>
            </div>

            <div className="max-h-[70vh] overflow-y-auto pr-2 -mr-2 custom-scrollbar">
              <FlightLogForm 
                aircraft={aircraft} 
                initialData={initialData} 
                onSuccess={onClose} 
                inModal={true}
              />
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
