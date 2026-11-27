import { useCallback, useEffect, useRef, useState, type FocusEvent, type PointerEvent } from 'react';
import { Link as RouterLink } from 'react-router';
import { monoFont } from 'config/site';
import type { Project, ProjectGroup } from 'data/projects';
import './projectIndex.css';

// Mock A, "Index": the projects as a listing, one row per entry, the whole
// row its link. Text only in the page flow. On a desktop a small screenshot
// appears beside the hovered or keyboard-focused row; it sits above or below
// the row, never on it, and takes no clicks. A phone gets no preview.

const PREVIEW_W = 288;
const PREVIEW_H = 180; // 16:10
const EDGE = 16;
const GAP = 8;
/** Wide enough for a preview to fit beside the rows; matches the CSS. */
const DESKTOP = '(min-width: 768px)';

const isExternal = (project: Project) => !project.link.href.startsWith('/');

const wantsPreview = () => typeof window.matchMedia === 'function' && window.matchMedia(DESKTOP).matches;

/** Above or below the row, so the row being read stays clear; null if neither fits. */
function previewTop(row: DOMRect): number | null {
  const below = row.bottom + GAP;
  if (below + PREVIEW_H <= window.innerHeight - GAP) return below;
  const above = row.top - GAP - PREVIEW_H;
  return above >= GAP ? above : null;
}

const clampLeft = (x: number) => Math.max(EDGE, Math.min(window.innerWidth - PREVIEW_W - EDGE, x));

interface RowProps {
  project: Project;
  onPointer: (project: Project, event: PointerEvent<HTMLAnchorElement>) => void;
  onFocus: (project: Project, event: FocusEvent<HTMLAnchorElement>) => void;
  onLeave: () => void;
}

const Row = ({ project, onPointer, onFocus, onLeave }: RowProps) => {
  const { href, label } = project.link;
  const external = isExternal(project);
  const handlers = {
    className: 'pi-row',
    onPointerEnter: (event: PointerEvent<HTMLAnchorElement>) => onPointer(project, event),
    onPointerMove: (event: PointerEvent<HTMLAnchorElement>) => onPointer(project, event),
    onPointerLeave: onLeave,
    onFocus: (event: FocusEvent<HTMLAnchorElement>) => onFocus(project, event),
    onBlur: onLeave,
  };
  // The spaces between the cells keep the accessible name readable:
  // "MERIDIAN game low-altitude run across a changing world PLAY".
  const cells = (
    <>
      <span className="pi-name" data-name>
        {project.name}
      </span>{' '}
      <span className="pi-kind">{project.kind}</span>{' '}
      <span className="pi-line">{project.line}</span>{' '}
      <span className="pi-label">
        {label}
        <span aria-hidden="true">{external ? ' ↗' : ' →'}</span>
      </span>
      {external && <span className="pi-sr"> (opens in a new tab)</span>}
    </>
  );
  // In-app routes go through the router; the static arcade pages load as full
  // pages; other sites open in a new tab without access to this one.
  if (!external && !href.startsWith('/arcade/')) {
    return (
      <RouterLink to={href} {...handlers}>
        {cells}
      </RouterLink>
    );
  }
  return external ? (
    <a href={href} target="_blank" rel="noopener noreferrer" {...handlers}>
      {cells}
    </a>
  ) : (
    <a href={href} {...handlers}>
      {cells}
    </a>
  );
};

interface Active {
  slug: string;
  /** Pointer previews follow the pointer; focus previews keep to the row. */
  by: 'pointer' | 'focus';
  row: HTMLElement;
}

const ProjectIndex = ({ groups }: { groups: ProjectGroup[] }) => {
  const [active, setActive] = useState<Active | null>(null);
  // Screenshots mount on first use and stay, so a second hover is instant.
  const [mounted, setMounted] = useState<ReadonlySet<string>>(() => new Set());
  const box = useRef<HTMLDivElement>(null);
  const all = groups.flatMap((group) => group.projects);

  const place = useCallback((row: HTMLElement, x: number) => {
    const el = box.current;
    if (!el) return;
    const top = previewTop(row.getBoundingClientRect());
    if (top === null) {
      el.style.visibility = 'hidden';
      return;
    }
    el.style.visibility = '';
    el.style.transform = `translate3d(${Math.round(clampLeft(x))}px, ${Math.round(top)}px, 0)`;
  }, []);

  const show = useCallback((project: Project, by: Active['by'], row: HTMLElement, x: number) => {
    if (!project.image || !wantsPreview()) {
      setActive(null);
      return;
    }
    setMounted((prev) => (prev.has(project.slug) ? prev : new Set(prev).add(project.slug)));
    setActive((prev) =>
      prev && prev.slug === project.slug && prev.by === by && prev.row === row ? prev : { slug: project.slug, by, row },
    );
    place(row, x);
  }, [place]);

  const onPointer = useCallback(
    (project: Project, event: PointerEvent<HTMLAnchorElement>) => {
      if (event.pointerType !== 'mouse') return;
      show(project, 'pointer', event.currentTarget, event.clientX + EDGE);
    },
    [show],
  );

  const onFocus = useCallback(
    (project: Project, event: FocusEvent<HTMLAnchorElement>) => {
      // A click also focuses the row: only keyboard focus places the preview.
      const row = event.currentTarget;
      if (!row.matches(':focus-visible')) return;
      show(project, 'focus', row, row.getBoundingClientRect().right - PREVIEW_W);
    },
    [show],
  );

  const onLeave = useCallback(() => setActive(null), []);

  // Scrolling moves the rows under a still pointer: a pointer preview goes
  // until the pointer moves again; a focus preview follows its row.
  useEffect(() => {
    if (!active) return;
    const onScroll = () => {
      if (active.by === 'pointer') setActive(null);
      else place(active.row, active.row.getBoundingClientRect().right - PREVIEW_W);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setActive(null);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onLeave);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onLeave);
      window.removeEventListener('keydown', onKey);
    };
  }, [active, place, onLeave]);

  return (
    <div className="pi" style={{ fontFamily: monoFont }}>
      {groups.map((group) => (
        <section key={group.id} id={group.id} className="pi-group" aria-labelledby={`pi-${group.id}`}>
          <h2 id={`pi-${group.id}`} className="pi-group-title">
            {group.title}
          </h2>
          <ul className="pi-list">
            {group.projects.map((project) => (
              <li key={project.slug} data-project={project.slug} data-active={active?.slug === project.slug || undefined}>
                <Row project={project} onPointer={onPointer} onFocus={onFocus} onLeave={onLeave} />
              </li>
            ))}
          </ul>
        </section>
      ))}

      {/* A visual extra: the row's link already names the entry. */}
      <div className="pi-preview" ref={box} aria-hidden="true" data-preview={active?.slug} data-shown={!!active || undefined}>
        {all.map((project) =>
          project.image && mounted.has(project.slug) ? (
            <img
              key={project.slug}
              src={project.image.small.src}
              width={project.image.small.width}
              height={project.image.small.height}
              alt=""
              decoding="async"
              data-shown={active?.slug === project.slug || undefined}
            />
          ) : null,
        )}
      </div>
    </div>
  );
};

export default ProjectIndex;
