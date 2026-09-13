// Single combined entry point: importing each card module registers its
// custom element (and, on first getConfigElement() call, lazy-loads its
// editor via a dynamic import already inlined by vite's
// inlineDynamicImports build option — see vite.config.ts).
import "./kind-title-card/mos-kind-title-card";
import "./server-summary-card/mos-server-summary-card";
import "./detail-card/mos-detail-card";
