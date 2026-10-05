import { useRef } from 'react';
import { useInView } from '../lib/useInView.js';

/**
 * Animates its children in when scrolled into view.
 * variant: 'up' | 'zoom' | 'left' | 'right' | 'pop'
 */
export function Reveal({ as: Tag = 'div', variant = 'up', delay = 0, className = '', style, children, ...rest }) {
  const ref = useRef(null);
  const inView = useInView(ref);

  return (
    <Tag
      ref={ref}
      className={`reveal reveal--${variant} ${inView ? 'is-visible' : ''} ${className}`}
      style={{ '--reveal-delay': `${delay}s`, ...style }}
      {...rest}
    >
      {children}
    </Tag>
  );
}
