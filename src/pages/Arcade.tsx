import { useEffect } from 'react';
import { useLocation } from 'react-router';
import PageLayout from 'components/layout/PageLayout';
import { monoFont as mono } from 'config/site';
import ProjectIndex from 'components/projects/ProjectIndex';
import { projectGroups } from 'data/projects';

// The projects page, mock A ("Index"): one row per project, text only.
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
      <h1 style={{ fontFamily: mono, fontSize: '28px', letterSpacing: '0.1em', margin: 0 }}>PROJECTS</h1>
      <ProjectIndex groups={projectGroups} />
    </PageLayout>
  );
};

export default Projects;
