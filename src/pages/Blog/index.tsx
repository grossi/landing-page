import * as React from 'react';
import BlogPost from 'assets/npm-library.md';
import Main from 'pages/Main';

const Blog = () => {
  const [page, setPage] = React.useState('');
  React.useEffect(() => {
    fetch(BlogPost)
      .then((data) => data.text())
      .then((text) => {
        setPage(text);
      });
  }, []);

  return <Main post={page} />;
};

export default Blog;
