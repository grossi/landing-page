import { useEffect } from 'react';
import { useLocation } from 'react-router';
import PageLayout from 'components/layout/PageLayout';
import Shelves from 'components/projects/Shelves';
import { monoFont as mono } from 'config/site';
import { projectGroups } from 'data/projects';

// Projects page, mock E ("Shelves"): every group a row of small image cards,
// the whole body of work on one desktop screen. Served at /projects and at
// /arcade, its old address.

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
    <PageLayout py={{ base: 8, md: 4 }}>
      <link rel="canonical" href="https://grossi.tech/projects" />
      <h1
        style={{
          fontFamily: mono,
          fontSize: '13px',
          lineHeight: '18px',
          letterSpacing: '0.3em',
          fontWeight: 'bold',
          margin: '0 0 12px',
        }}
      >
        PROJECTS
      </h1>
      <Shelves groups={projectGroups} />
    </PageLayout>
  );
};

export default Projects;
