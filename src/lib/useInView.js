import { useEffect, useState } from 'react';

/** True once the element has scrolled into view (stays true). */
export function useInView(ref, { threshold = 0.15, rootMargin = '0px 0px -8% 0px' } = {}) {
  const [inView, setInView] = useState(() => typeof IntersectionObserver === 'undefined');

  useEffect(() => {
    const node = ref.current;
    if (!node || inView) return undefined;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { threshold, rootMargin },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref, inView, threshold, rootMargin]);

  return inView;
}
