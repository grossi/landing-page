import * as React from 'react';
import BlogPost from 'component.md';
import Post from 'templates/Post';

const sideBarInfo = {
  socialInfo: {
    links: {
      linkedin: 'https://www.linkedin.com/in/gabriel-r-rossi/',
      github: 'https://github.com/grossi',
      twitter: 'https://twitter.com/RossisFox',
      email: 'mailto:rossi@grossi.tech',
    },
  },
};

const Blog = () => {
  const [page, setPage] = React.useState('');
  React.useEffect(() => {
    fetch(BlogPost)
      .then((data) => data.text())
      .then((text) => {
        setPage(text);
      });
  }, []);

  return <Post text={page} sidebarInfo={sideBarInfo} />;
};

export default Blog;
