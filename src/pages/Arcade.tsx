import { useEffect } from 'react';
import { useLocation } from 'react-router';
import PageLayout from 'components/layout/PageLayout';
import ContactSheet from 'components/projects/ContactSheet';
import { monoFont as mono } from 'config/site';
import { projectGroups } from 'data/projects';

// Mock B, "Contact sheet": the projects as a grid of screenshot tiles.
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
      <h1
        style={{
          fontFamily: mono,
          fontSize: '28px',
          letterSpacing: '0.1em',
          margin: 0,
        }}
      >
        PROJECTS
      </h1>
      <ContactSheet groups={projectGroups} />
    </PageLayout>
  );
};

export default Projects;
