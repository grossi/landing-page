import * as React from 'react';
import npmLibraryPost from 'assets/npm-library.md';
import { useMarkdownAsset } from 'hooks/useMarkdownAsset';
import Post from 'templates/Post';

const Blog = () => {
  const post = useMarkdownAsset(npmLibraryPost);
  return <Post text={post} />;
};

export default Blog;
