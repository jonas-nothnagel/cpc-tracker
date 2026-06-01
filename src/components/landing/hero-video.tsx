"use client";

/**
 * Full-bleed cinematic hero. A slow, looping nature/climate clip plays behind a
 * dark legibility scrim with the headline + CTAs on top.
 *
 * Performance + accessibility contract:
 *   - The poster still is what paints first (it is the LCP element); the video
 *     only mounts after the client decides it should play.
 *   - Under prefers-reduced-motion, on small screens, or when the OS reports
 *     save-data, the video never mounts and the poster stands in.
 *   - A pause/play control is provided for the looping video (WCAG 2.2.2).
 * The video is decorative (aria-hidden); the headline carries the meaning.
 */

import { useEffect, useRef, useState } from "react";

interface HeroVideoProps {
  poster: string;
  mp4: string;
  webm?: string;
  children: React.ReactNode;
}

export function HeroVideo({ poster, mp4, webm, children }: HeroVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [showVideo, setShowVideo] = useState(false);
  const [isPlaying, setIsPlaying] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const small = window.matchMedia("(max-width: 767px)").matches;
    const conn = (
      navigator as Navigator & { connection?: { saveData?: boolean } }
    ).connection;
    const saveData = conn?.saveData === true;
    // Intentional client-only upgrade: SSR renders the poster (showVideo=false)
    // and we only opt into the video once we can read the user's environment.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShowVideo(!reduce && !small && !saveData);
  }, []);

  const toggle = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      void v.play();
      setIsPlaying(true);
    } else {
      v.pause();
      setIsPlaying(false);
    }
  };

  return (
    <section className="relative isolate flex items-center overflow-hidden min-h-[620px] md:min-h-[min(90svh,840px)]">
      {/* Media layer */}
      <div className="absolute inset-0 -z-10">
        {showVideo ? (
          <video
            ref={videoRef}
            className="h-full w-full object-cover"
            poster={poster}
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            aria-hidden="true"
          >
            {webm ? <source src={webm} type="video/webm" /> : null}
            <source src={mp4} type="video/mp4" />
          </video>
        ) : (
          // Poster-only fallback (reduced-motion / mobile / save-data).
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={poster}
            alt=""
            aria-hidden="true"
            className="h-full w-full object-cover"
            fetchPriority="high"
          />
        )}
        {/* Legibility scrim. Kept light so the footage stays clearly visible:
            a left-weighted wash carries the headline, the right side is nearly
            clear, and a thin top gradient keeps the header readable. */}
        <div className="absolute inset-0 bg-gradient-to-r from-[#0a1a2e]/75 via-[#0a1a2e]/35 to-transparent" />
        <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black/30 to-transparent" />
      </div>

      {/* Content */}
      <div className="relative z-10 w-full max-w-6xl mx-auto px-6 pt-28 pb-20 md:pt-32 md:pb-28">
        {children}
      </div>

      {/* Pause / play control for the looping video (WCAG 2.2.2). */}
      {showVideo ? (
        <button
          type="button"
          onClick={toggle}
          aria-label={isPlaying ? "Pause background video" : "Play background video"}
          className="absolute bottom-5 right-5 z-20 rounded-full border border-white/40 bg-black/25 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-sm transition-colors hover:bg-black/45 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          {isPlaying ? "Pause" : "Play"}
        </button>
      ) : null}
    </section>
  );
}
