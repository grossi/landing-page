import * as React from 'react';
import AboutPost from 'page.md';
import Main from 'pages/Main';

const AboutPage = () => {
  const [page, setPage] = React.useState('');
  React.useEffect(() => {
    fetch(AboutPost)
      .then((data) => data.text())
      .then((text) => {
        setPage(text);
      });
  }, []);

  return <Main post={page} />;
};

export default AboutPage;
