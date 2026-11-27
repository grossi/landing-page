import { useEffect } from 'react';
import { useLocation } from 'react-router';
import PageLayout from 'components/layout/PageLayout';
import SelectScreen from 'components/projects/SelectScreen';
import { monoFont as mono } from 'config/site';
import { projectGroups } from 'data/projects';

// The projects page, as layout mock C ("Select screen"). Served at /projects
// and at /arcade, its old address.

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
    <PageLayout py={{ base: 6, md: 10 }}>
      <link rel="canonical" href="https://grossi.tech/projects" />
      <div style={{ fontFamily: mono }}>
        <h1 style={{ margin: 0, fontSize: '24px', letterSpacing: '0.12em' }}>PROJECTS</h1>
        <SelectScreen groups={projectGroups} />
      </div>
    </PageLayout>
  );
};

export default Projects;
