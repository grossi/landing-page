import { useEffect, useRef, useState } from 'react';
import { monoFont } from 'config/site';
import { projectGroups, projects, type Project } from 'data/projects';
import ProjectLink from 'components/projects/ProjectLink';

// Mock D, "Reel": one project per screen. The window scrolls (as on the home
// page, under the same sticky top bar) and snaps from one frame to the next;
// with prefers-reduced-motion it scrolls normally. A thin bar under the top
// bar holds the title, the group jumps and the counter.
//
// Desktop: the 16:10 screenshot fills the frame's height, never wider than
// its 1280 px file, so it is never scaled up and soft; the name, line and
// link sit on a solid band over its lower edge.
// Phone: a 16:10 image cannot fill a tall screen, so the frame stacks the
// image edge to edge right under the bar, the text under it and the spare
// height below.

const total = projects.length;
const pad = (n: number) => String(n).padStart(2, '0');

// The sticky top bar (Header.tsx) is 62 px tall from 768 px up and 81 px under
// it; the reel's own bar adds 41 px. Frames fill what is left of the screen.
const css = `
.reel {
  --reel-top: 81px;
  --reel-bar: 41px;
  --reel-h: calc(100svh - var(--reel-top) - var(--reel-bar));
  font-family: ${monoFont};
  color: #fff;
}
@media (min-width: 48em) {
  .reel { --reel-top: 62px; }
}
html:has(.reel) { scroll-padding-top: 122px; }
@media (min-width: 48em) {
  html:has(.reel) { scroll-padding-top: 103px; }
}
@media (prefers-reduced-motion: no-preference) {
  html:has(.reel) { scroll-snap-type: y mandatory; }
}

.reel-bar {
  position: sticky;
  top: var(--reel-top);
  z-index: 1050;
  height: var(--reel-bar);
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 24px;
  padding: 0 34px;
  background: #000;
  border-bottom: 1px solid rgba(255,255,255,.15);
  font-size: 11px;
  letter-spacing: .22em;
}
.reel-bar h1 {
  margin: 0;
  font-size: 11px;
  font-weight: bold;
  letter-spacing: .3em;
  flex: none;
}
.reel-jumps {
  display: flex;
  gap: 20px;
  flex: 1;
  min-width: 0;
  overflow-x: auto;
  scrollbar-width: none;
  margin: 0;
  padding: 0;
  list-style: none;
}
.reel-jumps::-webkit-scrollbar { display: none; }
@media (max-width: 47.99em) {
  .reel-jumps {
    gap: 16px;
    padding: 0 24px 0 14px;
    mask-image: linear-gradient(to right, transparent, #000 14px, #000 calc(100% - 28px), transparent);
  }
}
.reel-jumps a {
  color: #fff;
  text-transform: uppercase;
  opacity: .5;
  text-decoration: none;
  white-space: nowrap;
  border-bottom: 1px solid transparent;
}
.reel-jumps a:hover, .reel-jumps a:focus-visible { opacity: 1; }
.reel-jumps a[aria-current='true'] { opacity: 1; border-bottom-color: rgba(255,255,255,.7); }
.reel-count { flex: none; color: #a1a1aa; font-variant-numeric: tabular-nums; }
.reel-count b { color: #fff; font-weight: normal; }

.reel-group { scroll-margin-top: calc(var(--reel-top) + var(--reel-bar)); }

.reel-frame {
  height: var(--reel-h);
  min-height: 320px;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px 16px;
  scroll-snap-align: start;
  scroll-snap-stop: always;
}
.reel-card {
  position: relative;
  width: min(1280px, 100%, calc((var(--reel-h) - 24px) * 1.6));
}
.reel-shot {
  position: relative;
  aspect-ratio: 16 / 10;
  border: 1px solid rgba(255,255,255,.15);
  background: #0d0d0f;
  overflow: hidden;
}
.reel-shot img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.reel-blank {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding-bottom: 12%;
  background-image:
    linear-gradient(rgba(255,255,255,.045) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255,255,255,.045) 1px, transparent 1px);
  background-size: 40px 40px;
  font-size: clamp(40px, 7vw, 104px);
  font-weight: bold;
  letter-spacing: .12em;
  color: #27272a;
  user-select: none;
}
.reel-band {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: flex-end;
  gap: 32px;
  padding: 56px 32px 24px;
  background: linear-gradient(to bottom, rgba(0,0,0,0), #000 44px);
}
.reel-text { flex: 1; min-width: 0; }
.reel-meta {
  margin: 0 0 10px;
  font-size: 11px;
  letter-spacing: .22em;
  text-transform: uppercase;
  color: #71717a;
}
.reel-text h3 {
  margin: 0;
  font-size: 30px;
  letter-spacing: .14em;
  line-height: 1.15;
}
.reel-line { margin: 8px 0 0; font-size: 14px; color: #a1a1aa; }
.reel-go {
  flex: none;
  display: inline-block;
  padding: 12px 26px;
  border: 1px solid #3f3f46;
  background: rgba(0,0,0,.55);
  color: #fff;
  text-decoration: none;
  font-size: 13px;
  font-weight: bold;
  letter-spacing: .3em;
  transition: border-color .15s ease;
}
.reel-go:hover, .reel-go:focus-visible { border-color: #fff; }
.reel-go:focus-visible { outline: 1px solid #fff; outline-offset: 3px; }

.reel-end {
  height: 160px;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 0 34px;
  border-top: 1px solid rgba(255,255,255,.15);
  font-size: 11px;
  letter-spacing: .22em;
  color: #71717a;
  scroll-snap-align: end;
}
.reel-end button {
  font: inherit;
  letter-spacing: inherit;
  color: #fff;
  background: none;
  border: 1px solid #3f3f46;
  padding: 10px 16px;
  cursor: pointer;
}
.reel-end button:hover, .reel-end button:focus-visible { border-color: #fff; }

@media (max-width: 47.99em) {
  .reel-bar { padding: 0 16px; gap: 2px; }
  .reel-bar h1 { margin-right: 0; }
  .reel-frame { padding: 0; align-items: flex-start; }
  /* The last frame leaves room for the end strip, so the end screen shows
     the whole last project above it. */
  section.reel-group:last-of-type .reel-frame:last-child { height: calc(var(--reel-h) - 160px); }
  .reel-card { width: 100%; }
  .reel-shot {
    border-top: 0;
    border-left: 0;
    border-right: 0;
  }
  .reel-band {
    position: static;
    display: block;
    padding: 20px 16px 0;
    background: none;
  }
  .reel-text h3 { font-size: 24px; }
  .reel-go { margin-top: 20px; }
  .reel-blank { padding-bottom: 0; font-size: 44px; }
  .reel-end { padding: 0 16px; }
}
`;

/** Index (from 0) of the frame most in view, kept up to date while scrolling. */
function useCurrentFrame(root: React.RefObject<HTMLElement | null>): number {
  const [current, setCurrent] = useState(0);
  useEffect(() => {
    const el = root.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const frames = [...el.querySelectorAll<HTMLElement>('[data-frame]')];
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setCurrent(Number((entry.target as HTMLElement).dataset.frame));
        }
      },
      { threshold: 0.55 },
    );
    frames.forEach((frame) => observer.observe(frame));
    return () => observer.disconnect();
  }, [root]);
  return current;
}

const Reel = () => {
  const root = useRef<HTMLDivElement>(null);
  const current = useCurrentFrame(root);
  const currentGroup = projectGroups.find((group) => group.projects.includes(projects[current]))?.id;
  const jumps = useRef<HTMLUListElement>(null);
  let index = 0;

  // On a phone the group strip overflows: keep the current group in sight.
  // (Only the strip scrolls; the window is left alone.)
  useEffect(() => {
    const strip = jumps.current;
    const link = strip?.querySelector<HTMLElement>('[aria-current="true"]');
    if (!strip || !link || strip.scrollWidth <= strip.clientWidth) return;
    strip.scrollTo({ left: link.offsetLeft - strip.offsetLeft - 14 });
  }, [currentGroup]);

  return (
    <div className="reel" ref={root}>
      <style>{css}</style>
      <div className="reel-bar">
        <h1>PROJECTS</h1>
        <nav aria-label="Project groups" style={{ flex: 1, minWidth: 0, display: 'flex' }}>
          <ul className="reel-jumps" ref={jumps}>
            {projectGroups.map((group) => (
              <li key={group.id}>
                <a href={`#${group.id}`} aria-current={group.id === currentGroup ? 'true' : undefined}>
                  {group.title}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <span className="reel-count" aria-hidden="true">
          <b>{pad(current + 1)}</b> / {pad(total)}
        </span>
      </div>

      {projectGroups.map((group) => (
        <section key={group.id} id={group.id} className="reel-group" aria-labelledby={`${group.id}-title`}>
          <h2 id={`${group.id}-title`} style={visuallyHidden}>
            {group.title}
          </h2>
          {group.projects.map((project) => {
            const i = index++;
            return (
              <article
                key={project.slug}
                className="reel-frame"
                data-project={project.slug}
                data-frame={i}
                aria-label={`${pad(i + 1)} of ${pad(total)}: ${project.name}`}
              >
                <div className="reel-card">
                  <div className="reel-shot">
                    {project.image ? (
                      <img
                        src={project.image.small.src}
                        srcSet={`${project.image.small.src} ${project.image.small.width}w, ${project.image.large.src} ${project.image.large.width}w`}
                        sizes="(min-width: 48em) min(1280px, 100vw), 100vw"
                        width={project.image.large.width}
                        height={project.image.large.height}
                        alt={project.image.alt}
                        loading="lazy"
                        decoding="async"
                      />
                    ) : (
                      <div className="reel-blank" aria-hidden="true">
                        {project.name.toUpperCase()}
                      </div>
                    )}
                  </div>
                  <Band project={project} group={group.title} />
                </div>
              </article>
            );
          })}
        </section>
      ))}

      <footer className="reel-end">
        <span>
          {pad(total)} / {pad(total)} · END
        </span>
        <button type="button" onClick={() => window.scrollTo({ top: 0 })}>
          ↑ BACK TO TOP
        </button>
      </footer>
    </div>
  );
};

const visuallyHidden: React.CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
};

const Band = ({ project, group }: { project: Project; group: string }) => (
  <div className="reel-band">
    <div className="reel-text">
      <p className="reel-meta">
        {group} · {project.kind}
      </p>
      <h3>{project.name}</h3>
      <p className="reel-line">{project.line}</p>
    </div>
    <ProjectLink project={project} className="reel-go" />
  </div>
);

export default Reel;
