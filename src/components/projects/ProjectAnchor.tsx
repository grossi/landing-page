import type { AnchorHTMLAttributes, ReactNode, Ref } from 'react';
import { Link as RouterLink } from 'react-router';
import type { Project } from 'data/projects';

type AnchorProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href' | 'target' | 'rel' | 'aria-label'>;

interface ProjectAnchorProps extends AnchorProps {
  project: Project;
  children: ReactNode;
  ref?: Ref<HTMLAnchorElement>;
}

/** True when the link leaves the site, and so opens in a new tab. */
export const isExternal = (project: Project) => !project.link.href.startsWith('/');

/** "PLAY: MERIDIAN", plus a note when the link opens in a new tab. */
export const linkName = (project: Project) =>
  `${project.link.label}: ${project.name}${isExternal(project) ? ' (opens in a new tab)' : ''}`;

/**
 * An entry's one link. In-app routes go through the router; the static arcade
 * pages under /arcade/ load as full pages; other sites open in a new tab
 * without access to this one.
 */
const ProjectAnchor = ({ project, children, ref, ...rest }: ProjectAnchorProps) => {
  const { href } = project.link;
  const label = linkName(project);
  if (href.startsWith('/') && !href.startsWith('/arcade/')) {
    return (
      <RouterLink ref={ref} to={href} aria-label={label} {...rest}>
        {children}
      </RouterLink>
    );
  }
  return isExternal(project) ? (
    <a ref={ref} href={href} target="_blank" rel="noopener noreferrer" aria-label={label} {...rest}>
      {children}
    </a>
  ) : (
    <a ref={ref} href={href} aria-label={label} {...rest}>
      {children}
    </a>
  );
};

export default ProjectAnchor;
