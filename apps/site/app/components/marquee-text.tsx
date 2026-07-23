"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export function MarqueeText({ text }: { text: string }) {
  const previewRef = useRef<HTMLParagraphElement>(null);
  const [overflows, setOverflows] = useState(false);

  const checkOverflow = useCallback(() => {
    const preview = previewRef.current;
    if (!preview) return;

    const nextOverflows = preview.scrollWidth > preview.clientWidth;
    setOverflows((current) => (current === nextOverflows ? current : nextOverflows));
  }, []);

  useEffect(() => {
    const preview = previewRef.current;
    if (!preview) return;

    const raf = requestAnimationFrame(checkOverflow);
    const observer = new ResizeObserver(checkOverflow);
    observer.observe(preview);

    let cancelled = false;
    void document.fonts.ready.then(() => {
      if (!cancelled) checkOverflow();
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, [text, checkOverflow]);

  return (
    <div
      className="marquee-text relative w-full min-w-0 max-w-full"
      data-overflow={overflows ? "true" : "false"}
      tabIndex={overflows ? 0 : undefined}
    >
      <div className="relative min-w-0 max-w-full overflow-hidden">
        <p ref={previewRef} className="marquee-preview block w-full truncate px-2">
          {text}
        </p>
        {overflows && (
          <div className="marquee-motion pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
            <div className="marquee-track flex h-full w-max items-center whitespace-nowrap">
              <span className="shrink-0 px-2">{text}</span>
              <span className="shrink-0 px-2">{text}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
