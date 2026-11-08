'use client';

import React, { useEffect } from 'react';
import type { PlaceSafetyReport } from '@/lib/types';
import { ShieldCheck, Clock, MapPin, CheckCircle2, AlertCircle, X } from 'lucide-react';

interface PlaceSafetyModalProps {
  placeName: string;
  safetyReport: PlaceSafetyReport;
  isOpen: boolean;
  onClose: () => void;
}

export default function PlaceSafetyModal({
  placeName,
  safetyReport,
  isOpen,
  onClose,
}: PlaceSafetyModalProps) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose();
      }
    }
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.body.style.overflow = 'unset';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const score = safetyReport.score;
  let scoreBadgeColor = 'bg-emerald-100 text-emerald-800 border-emerald-300';
  let scoreLabel = 'Zona de Alta Concurrencia y Tranquilidad';
  if (score < 50) {
    scoreBadgeColor = 'bg-amber-100 text-amber-800 border-amber-300';
    scoreLabel = 'Zona de Tránsito Comercial — Precaución Nocturna';
  } else if (score < 75) {
    scoreBadgeColor = 'bg-yellow-100 text-yellow-800 border-yellow-300';
    scoreLabel = 'Zona Turística Activa';
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-xs animate-in fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-xl max-h-[90vh] overflow-y-auto bg-white text-adobe-dark rounded-3xl shadow-2xl border border-adobe-border">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-start justify-between p-5 sm:p-6 bg-white/95 backdrop-blur-md border-b border-adobe-border/70">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 mb-2 rounded-full text-xs font-bold uppercase tracking-wider bg-moche-50 text-moche-700 border border-moche-200">
              <ShieldCheck className="w-3.5 h-3.5 text-moche-600" />
              Guía Preventiva para el Viajero
            </div>
            <h2 className="text-xl sm:text-2xl font-display font-extrabold text-adobe-dark">
              Recomendaciones de Seguridad
            </h2>
            <p className="text-xs text-adobe-muted mt-1 flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5 text-moche-600" />
              <span>Para tu visita a <strong className="text-adobe-dark">{placeName}</strong></span>
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="p-2 text-adobe-muted hover:text-adobe-dark hover:bg-adobe-bg rounded-xl transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 sm:p-6 space-y-5">
          {/* Safety Rating Banner */}
          <div className="p-4 rounded-2xl bg-adobe-bg/60 border border-adobe-border flex items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-white border border-adobe-border flex items-center justify-center text-moche-600 font-extrabold text-lg shadow-2xs font-display">
                {Math.round(score)}
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-adobe-muted block">
                  Índice de Confort y Seguridad
                </span>
                <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold border mt-0.5 ${scoreBadgeColor}`}>
                  {scoreLabel}
                </span>
              </div>
            </div>
            <span className="text-xs font-semibold text-emerald-700 hidden sm:inline">
              Apto para turismo familiar
            </span>
          </div>

          {/* Horarios Recomendados */}
          <div className="p-4 rounded-2xl bg-white border border-adobe-border space-y-2 shadow-2xs">
            <div className="flex items-center gap-2 text-xs font-bold text-adobe-dark">
              <Clock className="w-4 h-4 text-moche-600" />
              <span>Franja Horaria Recomendada para la Visita</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <div className="p-3 rounded-xl bg-emerald-50/70 border border-emerald-200">
                <span className="font-bold text-emerald-950 block text-[11px] uppercase tracking-wide">
                  Horario Óptimo Diurno
                </span>
                <span className="text-emerald-800 text-xs mt-0.5 block">
                  09:00 a 17:30 hrs — Máxima actividad turística, transporte continuo y comercios abiertos.
                </span>
              </div>
              <div className="p-3 rounded-xl bg-amber-50/70 border border-amber-200">
                <span className="font-bold text-amber-950 block text-[11px] uppercase tracking-wide">
                  Horario Vespertino / Nocturno
                </span>
                <span className="text-amber-800 text-xs mt-0.5 block">
                  A partir de las 19:00 hrs se sugiere usar taxis de aplicativo y circular por vías iluminadas.
                </span>
              </div>
            </div>
          </div>

          {/* Recomendaciones Clave */}
          <div className="p-4 rounded-2xl bg-white border border-adobe-border space-y-3 shadow-2xs">
            <span className="text-xs font-bold text-adobe-dark block uppercase tracking-wider text-[11px]">
              Consejos Clave de Desplazamiento y Cuidado
            </span>
            <ul className="space-y-2 text-xs text-adobe-dark">
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>
                  <strong>Transporte Formal:</strong> Priorice el uso de líneas oficiales de transporte o servicios de aplicativo autorizados para traslados entre distritos.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>
                  <strong>Cuidado de Pertenencias:</strong> Mantenga mochilas y bolsos hacia adelante al ingresar a mercados, plazas o zonas comerciales concurridas.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>
                  <strong>Documentación:</strong> Porte copia física o digital de sus documentos personales y conserve los originales a resguardo en su hospedaje.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>
                  <strong>Litoral y Mar:</strong> En balnearios como Huanchaco y Chicama, respete las indicaciones de los pescadores artesanales y los salvavidas locales.
                </span>
              </li>
            </ul>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 sm:p-5 bg-adobe-bg/60 border-t border-adobe-border flex items-center justify-between gap-3 text-xs text-adobe-muted">
          <span>Orientación diseñada para una estadía tranquila en La Libertad</span>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-moche-600 hover:bg-moche-700 text-white font-bold text-xs transition cursor-pointer"
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
}
