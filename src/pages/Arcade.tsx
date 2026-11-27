import { useEffect } from 'react';
import { Link as RouterLink, useLocation } from 'react-router';
import PageLayout from 'components/layout/PageLayout';
import { monoFont as mono } from 'config/site';
import { projectGroups, type Project } from 'data/projects';

// A placeholder: the projects page's data in its plainest form, while five
// layout mocks are compared. The chosen layout replaces this file's body.
// Served at /projects and at /arcade, its old address.

/** The element a URL fragment names, as written or percent-decoded. */
function fragmentTarget(hash: string): HTMLElement | null {
  const fragment = hash.slice(1);
  if (!fragment) return null;
  const exact = document.getElementById(fragment);
  if (exact) return exact;
  try {
    return document.getElementById(decodeURIComponent(fragment));
  } catch {
    return null;
  }
}

const ProjectLink = ({ project }: { project: Project }) => {
  const { href, label } = project.link;
  const name = `${label}: ${project.name}`;
  if (href.startsWith('/') && !href.startsWith('/arcade/')) {
    return (
      <RouterLink to={href} aria-label={name}>
        {label}
      </RouterLink>
    );
  }
  // Static arcade pages load as full pages; other sites open in a new tab.
  return href.startsWith('/') ? (
    <a href={href} aria-label={name}>
      {label}
    </a>
  ) : (
    <a href={href} target="_blank" rel="noopener noreferrer" aria-label={`${name} (opens in a new tab)`}>
      {label} ↗
    </a>
  );
};

const Projects = () => {
  const { hash } = useLocation();

  // The page is a lazy chunk, so the browser's own jump to /projects#arcade
  // happens before the section exists: do it once the page has rendered.
  useEffect(() => {
    fragmentTarget(hash)?.scrollIntoView();
  }, [hash]);

  return (
    <PageLayout>
      <link rel="canonical" href="https://grossi.tech/projects" />
      <h1 style={{ fontFamily: mono, fontSize: '28px', letterSpacing: '0.1em' }}>PROJECTS</h1>
      {projectGroups.map((group) => (
        <section key={group.id} id={group.id} style={{ marginTop: '40px', scrollMarginTop: '88px' }}>
          <h2 style={{ fontFamily: mono, fontSize: '16px', letterSpacing: '0.12em' }}>{group.title}</h2>
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {group.projects.map((project) => (
              <li
                key={project.slug}
                data-project={project.slug}
                style={{ display: 'flex', gap: '16px', alignItems: 'center', marginTop: '16px' }}
              >
                {project.image && (
                  <img
                    src={project.image.small.src}
                    width={project.image.small.width / 4}
                    height={project.image.small.height / 4}
                    alt={project.image.alt}
                    loading="lazy"
                  />
                )}
                <div style={{ fontFamily: mono, fontSize: '14px' }}>
                  <h3 style={{ display: 'inline', fontSize: '14px' }}>{project.name}</h3>{' '}
                  <span style={{ color: '#a1a1aa' }}>[{project.kind}]</span>
                  <p style={{ margin: 0, color: '#a1a1aa' }}>{project.line}</p>
                  <ProjectLink project={project} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </PageLayout>
  );
};

export default Projects;
