// Inline styles may set CSS variables (style={{ '--delay': '0.2s' }}).
import 'react';

declare module 'react' {
  interface CSSProperties {
    [variable: `--${string}`]: string | number | undefined;
  }
}
