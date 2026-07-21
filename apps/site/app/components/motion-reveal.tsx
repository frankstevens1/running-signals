"use client";

import { useEffect, useRef, useState } from "react";

function useRevealOnce<T extends HTMLElement>() {
  const elementRef = useRef<T>(null);
  const [hasEntered, setHasEntered] = useState(false);

  useEffect(() => {
    const element = elementRef.current;

    if (!element || hasEntered) return;

    if (typeof IntersectionObserver === "undefined") {
      const frame = requestAnimationFrame(() => setHasEntered(true));
      return () => cancelAnimationFrame(frame);
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;

        setHasEntered(true);
        observer.disconnect();
      },
      {
        rootMargin: "0px 0px -8%",
        threshold: 0.15,
      },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [hasEntered]);

  return { elementRef, hasEntered };
}

export function RevealText({
  text,
  className = "",
  delayMs = 0,
}: {
  text: string;
  className?: string;
  delayMs?: number;
}) {
  const { elementRef, hasEntered } = useRevealOnce<HTMLSpanElement>();

  return (
    <span
      ref={elementRef}
      className={`block transform-gpu motion-safe:transition motion-safe:duration-500 motion-safe:ease-out motion-reduce:transform-none motion-reduce:opacity-100 ${
        hasEntered ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
      } ${className}`}
      style={{ transitionDelay: `${delayMs}ms` }}
    >
      {text}
    </span>
  );
}

export function TypedRevealText({
  text,
  className = "",
  characterDelayMs = 24,
}: {
  text: string;
  className?: string;
  characterDelayMs?: number;
}) {
  const { elementRef, hasEntered } = useRevealOnce<HTMLSpanElement>();
  let characterIndex = 0;

  return (
    <span ref={elementRef} className={`block ${className}`}>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">
        {text.split(/(\s+)/).map((part, partIndex) => {
          if (/^\s+$/.test(part)) {
            return <span key={`space-${partIndex}`}>{part}</span>;
          }

          return (
            <span key={`${part}-${partIndex}`} className="inline-block whitespace-nowrap">
              {Array.from(part).map((character) => {
                const currentIndex = characterIndex;
                characterIndex += 1;

                return (
                  <span
                    key={`${character}-${currentIndex}`}
                    className={`inline-block transform-gpu motion-safe:transition motion-safe:duration-300 motion-safe:ease-out motion-reduce:transform-none motion-reduce:opacity-100 ${
                      hasEntered ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0"
                    }`}
                    style={{ transitionDelay: `${currentIndex * characterDelayMs}ms` }}
                  >
                    {character}
                  </span>
                );
              })}
            </span>
          );
        })}
      </span>
    </span>
  );
}

export function ScrollReveal({
  children,
  className = "",
  delayMs = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delayMs?: number;
}) {
  const { elementRef, hasEntered } = useRevealOnce<HTMLDivElement>();

  return (
    <div
      ref={elementRef}
      className={`transform-gpu motion-safe:transition motion-safe:duration-500 motion-safe:ease-out motion-reduce:transform-none motion-reduce:opacity-100 ${
        hasEntered ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
      } ${className}`}
      style={{ transitionDelay: `${delayMs}ms` }}
    >
      {children}
    </div>
  );
}
