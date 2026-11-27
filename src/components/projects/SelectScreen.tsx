import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { useLocation } from 'react-router';
import type { ProjectGroup } from 'data/projects';
import ProjectAnchor, { isExternal } from 'components/projects/ProjectAnchor';
import './selectScreen.css';

// Mock C, "Select screen": a game-select screen. Names on one side, one large
// preview of the selected entry on the other. Hover, focus and the arrow keys
// move the selection; Enter follows the focused name's link. On a touch screen
// a tap on a name only selects it, and the preview's button follows the link.

const IMAGE_SIZES = '(min-width: 960px) 880px, 100vw';

/** The selected entry and its neighbours: what the preview may show next. */
const around = (index: number, count: number) =>
  [index - 1, index, index + 1].filter((i) => i >= 0 && i < count);

const hostOf = (href: string) => {
  try {
    const url = new URL(href);
    return `${url.host}${url.pathname.replace(/\/$/, '')}`;
  } catch {
    return href;
  }
};

const SelectScreen = ({ groups }: { groups: ProjectGroup[] }) => {
  const all = useMemo(() => groups.flatMap((group) => group.projects), [groups]);
  const indexOf = useMemo(() => new Map(all.map((project, index) => [project.slug, index])), [all]);
  const [selected, setSelected] = useState(0);
  const links = useRef<(HTMLAnchorElement | null)[]>([]);
  const lastPointer = useRef('');
  const root = useRef<HTMLDivElement>(null);

  // Screenshots stay mounted once wanted, so going back to one is instant.
  const [mounted, setMounted] = useState(() => new Set(around(0, all.length)));
  const [loaded, setLoaded] = useState(() => new Set<string>());
  useEffect(() => {
    setMounted((prev) => {
      const wanted = around(selected, all.length).filter((i) => !prev.has(i));
      return wanted.length ? new Set([...prev, ...wanted]) : prev;
    });
  }, [selected, all.length]);

  const markLoaded = useCallback((slug: string) => {
    setLoaded((prev) => (prev.has(slug) ? prev : new Set(prev).add(slug)));
  }, []);

  // The frame keeps the last ready picture until the new one has loaded, so a
  // jump to an entry far down the list never shows an empty box.
  const current = all[selected];
  const [shown, setShown] = useState(current.slug);
  if ((!current.image || loaded.has(current.slug)) && shown !== current.slug) setShown(current.slug);
  const shownProject = all[indexOf.get(shown) ?? selected];

  // A link to a group (/projects#arcade) selects that group's first entry.
  const { hash } = useLocation();
  useEffect(() => {
    let id = hash.slice(1);
    try {
      id = decodeURIComponent(id);
    } catch {
      return;
    }
    const first = groups.find((group) => group.id === id)?.projects[0];
    if (first) setSelected(indexOf.get(first.slug) ?? 0);
  }, [hash, groups, indexOf]);

  const moveTo = useCallback(
    (index: number) => {
      const next = Math.max(0, Math.min(all.length - 1, index));
      setSelected(next);
      links.current[next]?.focus();
    },
    [all.length],
  );

  // Arrow keys work before anything has focus too, as on a select screen.
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
      const target = event.target as Node | null;
      const onPage = target === document.body || (target && root.current?.contains(target));
      if (!onPage) return;
      event.preventDefault();
      moveTo(selected + (event.key === 'ArrowDown' ? 1 : -1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [moveTo, selected]);

  const onListKey = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      moveTo(event.key === 'Home' ? 0 : all.length - 1);
    }
  };

  const onNameClick = (index: number) => (event: MouseEvent<HTMLAnchorElement>) => {
    // A tap selects; the preview's button is the link on a touch screen.
    if (lastPointer.current === 'touch') {
      event.preventDefault();
      setSelected(index);
    }
  };

  return (
    <div className="ps" ref={root}>
      <nav className="ps-list" aria-label="Projects" onKeyDown={onListKey}>
        {groups.map((group) => (
          <section key={group.id} id={group.id} className="ps-group" aria-labelledby={`${group.id}-title`}>
            <h2 id={`${group.id}-title`} className="ps-group-title">
              {group.title}
            </h2>
            <ul>
              {group.projects.map((project) => {
                const index = indexOf.get(project.slug) ?? 0;
                const isSelected = index === selected;
                return (
                  <li key={project.slug} data-project={project.slug}>
                    <ProjectAnchor
                      project={project}
                      ref={(el) => {
                        links.current[index] = el;
                      }}
                      className="ps-name"
                      data-selected={isSelected || undefined}
                      aria-describedby={`${project.slug}-about`}
                      onFocus={() => setSelected(index)}
                      onPointerEnter={(event) => {
                        if (event.pointerType !== 'mouse') return;
                        setSelected(index);
                        // One cursor: a focus ring already in the list follows the mouse.
                        const focused = document.activeElement;
                        if (focused !== event.currentTarget && links.current.includes(focused as HTMLAnchorElement)) {
                          event.currentTarget.focus({ preventScroll: true });
                        }
                      }}
                      onPointerDown={(event) => {
                        lastPointer.current = event.pointerType;
                      }}
                      onClick={onNameClick(index)}
                    >
                      <span className="ps-caret" aria-hidden="true">
                        ▸
                      </span>
                      {project.name}
                    </ProjectAnchor>
                    <span id={`${project.slug}-about`} hidden>
                      {project.kind}. {project.line}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </nav>

      <aside className="ps-preview" aria-label="Selected project" data-preview={current.slug}>
        <div className="ps-frame">
          {all.map((project, index) => {
            if (!project.image || !mounted.has(index)) return null;
            const visible = project.slug === shownProject.slug && !!current.image;
            return (
              <img
                key={project.slug}
                className="ps-shot"
                data-shown={visible || undefined}
                src={project.image.large.src}
                srcSet={`${project.image.small.src} ${project.image.small.width}w, ${project.image.large.src} ${project.image.large.width}w`}
                sizes={IMAGE_SIZES}
                width={project.image.large.width}
                height={project.image.large.height}
                alt={visible ? project.image.alt : ''}
                aria-hidden={visible ? undefined : true}
                decoding="async"
                fetchPriority={index === 0 ? 'high' : 'low'}
                ref={(img) => {
                  if (img?.complete && img.naturalWidth) markLoaded(project.slug);
                }}
                onLoad={() => markLoaded(project.slug)}
              />
            );
          })}
          {!current.image && (
            <div className="ps-blank" data-blank>
              <span className="ps-blank-name">{current.name}</span>
              <span className="ps-blank-host">{hostOf(current.link.href)}</span>
            </div>
          )}
        </div>
        <div className="ps-meta">
          <div className="ps-text">
            <p className="ps-title">
              {current.name} <span className="ps-kind">[{current.kind}]</span>
            </p>
            <p className="ps-line">{current.line}</p>
          </div>
          <ProjectAnchor project={current} className="ps-go" data-preview-link>
            {current.link.label}
            {isExternal(current) ? ' ↗' : ' →'}
          </ProjectAnchor>
        </div>
      </aside>
    </div>
  );
};

export default SelectScreen;
