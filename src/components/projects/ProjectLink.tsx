import { Link as RouterLink } from 'react-router';
import type { Project } from 'data/projects';

/**
 * An entry's one link. In-app routes use the router; the static arcade pages
 * load as full pages; other sites open in a new tab, without an opener.
 */
const ProjectLink = ({ project, className }: { project: Project; className?: string }) => {
  const { href, label } = project.link;
  const name = `${label}: ${project.name}`;
  if (href.startsWith('/') && !href.startsWith('/arcade/')) {
    return (
      <RouterLink to={href} className={className} aria-label={name}>
        {label}
      </RouterLink>
    );
  }
  return href.startsWith('/') ? (
    <a href={href} className={className} aria-label={name}>
      {label}
    </a>
  ) : (
    <a
      href={href}
      className={className}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${name} (opens in a new tab)`}
    >
      {label} ↗
    </a>
  );
};

export default ProjectLink;
