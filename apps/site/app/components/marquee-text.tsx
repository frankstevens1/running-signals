"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export function MarqueeText({ text }: { text: string }) {
  const innerRef = useRef<HTMLParagraphElement>(null);
  const [overflows, setOverflows] = useState(false);

  const checkOverflow = useCallback(() => {
    const el = innerRef.current;
    if (el) {
      setOverflows(el.scrollWidth > el.offsetWidth);
    }
  }, []);

  useEffect(() => {
    const el = innerRef.current;
    if (!el) return;

    const raf = requestAnimationFrame(checkOverflow);
    const observer = new ResizeObserver(() => checkOverflow());
    observer.observe(el);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, [text, checkOverflow]);

  return (
    <div className="overflow-hidden group/marquee">
      <p
        ref={innerRef}
        data-text={overflows ? text : undefined}
        className={overflows ? "truncate marquee-scroll" : "truncate"}
      >
        {text}
      </p>
    </div>
  );
}
