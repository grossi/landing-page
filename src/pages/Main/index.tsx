import * as React from 'react';
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

interface MainPageProps {
  post: string;
}

const MainPage = ({ post }: MainPageProps) => {
  return <Post text={post} sidebarInfo={sideBarInfo} />;
};

export default MainPage;
