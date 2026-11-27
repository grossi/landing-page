// The shape of a projects page entry, shared by data/projects.ts,
// data/demos.ts and every layout that reads them.

export type ProjectKind = 'game' | 'site' | 'app' | 'demo';

export type LinkLabel = 'PLAY' | 'VISIT' | 'GET' | 'SOURCE';

export interface ProjectLink {
  label: LinkLabel;
  /** A public `https://` URL, or an in-site path starting with `/`. */
  href: string;
}

export interface ImageFile {
  /** URL of the file, as Vite serves it. */
  src: string;
  width: number;
  height: number;
}

/** A 16:10 screenshot in two sizes: 1280x800 and 640x400. */
export interface ProjectImage {
  alt: string;
  large: ImageFile;
  small: ImageFile;
}

export interface Project {
  slug: string;
  name: string;
  kind: ProjectKind;
  /** One line, at most 12 words. */
  line: string;
  link: ProjectLink;
  image?: ProjectImage;
}

export interface ProjectGroup {
  /** Also usable as an anchor, e.g. `/projects#arcade`. */
  id: string;
  title: string;
  projects: Project[];
}

/** Builds the two sizes of one screenshot. */
export const screenshot = (alt: string, large: string, small: string): ProjectImage => ({
  alt,
  large: { src: large, width: 1280, height: 800 },
  small: { src: small, width: 640, height: 400 },
});
