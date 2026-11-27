import { useEffect } from 'react';
import { useLocation } from 'react-router';
import PageLayout from 'components/layout/PageLayout';
import Reel from 'components/projects/Reel';

// The projects page, as layout mock D ("Reel"): one project per screen.
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
    <PageLayout maxW="100%" px={0} py={0}>
      <link rel="canonical" href="https://grossi.tech/projects" />
      <Reel />
    </PageLayout>
  );
};

export default Projects;
